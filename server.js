/**
 * Database IDE - Backend Server
 * Multi-Engine SQL & NoSQL Connection & Execution Engine
 * Compliant with OWASP Top 10 Security Directives and Error Mapping
 */

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Database drivers
const mysql = require('mysql2/promise');
const { Client: PgClient } = require('pg');
const sqlite3 = require('sqlite3');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Disable Express identification header
app.disable('x-powered-by');

// Security: Helmet headers with custom CSP to allow CodeMirror from CDN and local scripts/styles
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "'unsafe-inline'" // required for CodeMirror dynamically injected styles/events
        ],
        styleSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "'unsafe-inline'"
        ],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    }
  })
);

// Body parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Session handling for managing database connections per user
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'mini_ide_db_secret_key_fixed_token',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 2 // 2 hours
    }
  })
);

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory active database connections indexed by Session ID
// sessionConnections: { [sessionId: string]: { type: string, client: any, config: object, lastActive: number } }
const sessionConnections = new Map();

// Helper: Close and release an active connection
async function closeConnection(sessionId) {
  if (!sessionConnections.has(sessionId)) return;

  const current = sessionConnections.get(sessionId);
  try {
    if (current.type === 'mysql' && current.client) {
      await current.client.end();
    } else if (current.type === 'postgres' && current.client) {
      await current.client.end();
    } else if (current.type === 'sqlite' && current.client) {
      await new Promise((resolve) => current.client.close(() => resolve()));
    } else if (current.type === 'mongodb' && current.client) {
      await current.client.close();
    }
  } catch (err) {
    console.error(`[AUDIT] Error while closing connection for session ${sessionId}:`, err.message);
  } finally {
    sessionConnections.delete(sessionId);
  }
}

// Cleanup stale connections (older than 1 hour without activity)
setInterval(async () => {
  const now = Date.now();
  const maxInactive = 1000 * 60 * 60; // 1 hour
  for (const [sessionId, conn] of sessionConnections.entries()) {
    if (now - conn.lastActive > maxInactive) {
      console.log(`[AUDIT] Cleaning up stale inactive connection for session: ${sessionId}`);
      await closeConnection(sessionId);
    }
  }
}, 1000 * 60 * 15);

// Error mapping to guarantee OWASP-compliant safe error messages
function mapDatabaseError(err) {
  if (!err) return 'Ocurrio un error desconocido.';
  
  // Internal server audit log (full error hidden from client)
  console.error('[AUDIT DB ERROR]:', err);

  const msg = err.message || '';
  const code = err.code || '';

  // Connection refused / Timeout / DNS
  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENOTFOUND' ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('connect ECONNREFUSED') ||
    msg.includes('Server selection timed out') ||
    msg.includes('connection timed out')
  ) {
    return 'No se pudo establecer conexion con el servidor remoto. Verifique la direccion IP, puerto y permisos de firewall (cPanel/Host).';
  }

  // Access denied / Authentication
  if (
    code === 'ER_ACCESS_DENIED_ERROR' ||
    code === '28P01' || // Postgres password fail
    code === '28000' ||
    err.name === 'MongoServerError' && (code === 18 || code === 13 || msg.includes('Authentication failed')) ||
    msg.includes('Access denied for user') ||
    msg.includes('password authentication failed')
  ) {
    return 'Credenciales de acceso incorrectas o privilegios insuficientes.';
  }

  // Database does not exist
  if (code === 'ER_BAD_DB_ERROR' || code === '3D000') {
    return 'La base de datos especificada no existe en el servidor.';
  }

  // SQL / NoSQL Syntax Error
  if (
    code === 'ER_PARSE_ERROR' ||
    code === '42601' || // Postgres syntax error
    code === 'SQLITE_ERROR' && msg.includes('syntax') ||
    msg.includes('syntax error') ||
    msg.includes('is not a valid')
  ) {
    return 'Error de sintaxis en la instruccion ejecutada. Por favor, revise el comando introducido.';
  }

  // SQLite Locked / Busy
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
    return 'El archivo SQLite se encuentra bloqueado por otro proceso.';
  }

  // Generic sanitized fallback: Strip local paths or server internals
  const sanitized = msg
    .replace(/[a-zA-Z]:\\[^:\n\r]+/g, '[recurso]') // Windows absolute paths
    .replace(/\/[a-zA-Z0-9_\-\./]+/g, '[recurso]'); // Unix paths

  return `Error durante la operacion: ${sanitized.slice(0, 150)}`;
}

// Factory to establish connections dynamically
async function createDatabaseClient(config) {
  const { type, host, port, user, password, database, connectionString, ssl } = config;

  if (type === 'mysql') {
    const connConfig = {
      host: host || 'localhost',
      port: port ? parseInt(port, 10) : 3306,
      user: user || 'root',
      password: password || '',
      database: database || undefined,
      connectTimeout: 8000,
      multipleStatements: false // Prevent SQL injection with multi-queries
    };

    if (ssl) {
      connConfig.ssl = { rejectUnauthorized: false };
    }

    const connection = await mysql.createConnection(connConfig);
    return connection;
  }

  if (type === 'postgres') {
    const pgConfig = {
      host: host || 'localhost',
      port: port ? parseInt(port, 10) : 5432,
      user: user || 'postgres',
      password: password || '',
      database: database || 'postgres',
      connectionTimeoutMillis: 8000
    };

    if (ssl) {
      pgConfig.ssl = { rejectUnauthorized: false };
    }

    const client = new PgClient(pgConfig);
    await client.connect();
    return client;
  }

  if (type === 'sqlite') {
    const dbPath = database && database.trim() ? path.resolve(__dirname, database.trim()) : path.resolve(__dirname, 'database.sqlite');
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) return reject(err);
        resolve(db);
      });
    });
  }

  if (type === 'mongodb') {
    let uri = connectionString ? connectionString.trim() : '';
    if (!uri) {
      const auth = user && password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : '';
      const h = host || 'localhost';
      const p = port ? `:${port}` : ':27017';
      const d = database ? `/${database}` : '';
      uri = `mongodb://${auth}${h}${p}${d}`;
    }

    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000
    });

    await client.connect();
    return client;
  }

  throw new Error('Tipo de base de datos no soportado.');
}

// ----------------- ROUTES ----------------- //

// Main View
app.get('/', (req, res) => {
  res.render('index');
});

// Check Connection Status
app.get('/api/status', (req, res) => {
  const sessionId = req.session.id;
  const active = sessionConnections.get(sessionId);

  if (active) {
    return res.json({
      connected: true,
      type: active.type,
      database: active.config.database || '',
      host: active.config.host || ''
    });
  }

  return res.json({ connected: false });
});

// Test Connection (Opens temporarily, sends ping, closes immediately to avoid socket leak)
app.post('/api/test-connection', async (req, res) => {
  const config = req.body;
  let testClient = null;

  try {
    testClient = await createDatabaseClient(config);

    if (config.type === 'mysql') {
      await testClient.query('SELECT 1');
      await testClient.end();
    } else if (config.type === 'postgres') {
      await testClient.query('SELECT 1');
      await testClient.end();
    } else if (config.type === 'sqlite') {
      await new Promise((resolve, reject) => {
        testClient.get('SELECT 1', (err) => {
          testClient.close();
          if (err) return reject(err);
          resolve();
        });
      });
    } else if (config.type === 'mongodb') {
      await testClient.db(config.database || 'admin').command({ ping: 1 });
      await testClient.close();
    }

    return res.json({ success: true, message: 'Conexion exitosa con el servidor de base de datos.' });
  } catch (err) {
    if (testClient) {
      try {
        if (config.type === 'mysql') await testClient.end();
        if (config.type === 'postgres') await testClient.end();
        if (config.type === 'mongodb') await testClient.close();
      } catch (closeErr) {
        // ignore
      }
    }
    return res.status(400).json({ success: false, error: mapDatabaseError(err) });
  }
});

// Connect to Database and bind to Session
app.post('/api/connect', async (req, res) => {
  const sessionId = req.session.id;
  const config = req.body;

  try {
    // Release previous connection if existing
    await closeConnection(sessionId);

    // Create and verify new client
    const client = await createDatabaseClient(config);

    sessionConnections.set(sessionId, {
      type: config.type,
      client,
      config: {
        host: config.host,
        port: config.port,
        database: config.database
      },
      lastActive: Date.now()
    });

    console.log(`[AUDIT] Connection established for session ${sessionId} on ${config.type.toUpperCase()}`);
    return res.json({ success: true, message: 'Conectado exitosamente.' });
  } catch (err) {
    return res.status(400).json({ success: false, error: mapDatabaseError(err) });
  }
});

// Disconnect from Database
app.post('/api/disconnect', async (req, res) => {
  const sessionId = req.session.id;
  await closeConnection(sessionId);
  return res.json({ success: true, message: 'Conexion cerrada con exito.' });
});

// Execute SQL or MongoDB Query
app.post('/api/execute', async (req, res) => {
  const sessionId = req.session.id;
  const { query } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ success: false, error: 'La consulta no puede estar vacia.' });
  }

  const active = sessionConnections.get(sessionId);
  if (!active || !active.client) {
    return res.status(400).json({ success: false, error: 'No hay una conexion activa. Por favor conectese primero.' });
  }

  active.lastActive = Date.now();
  const rawQuery = query.trim();

  try {
    // --- 1. MySQL ---
    if (active.type === 'mysql') {
      const [rows, fields] = await active.client.query(rawQuery);
      
      // If result is an array (SELECT, SHOW, etc.)
      if (Array.isArray(rows)) {
        return res.json({
          success: true,
          data: rows,
          rowCount: rows.length,
          message: `${rows.length} registros recuperados.`
        });
      }

      // If result is ResultSetHeader (INSERT, UPDATE, DELETE, CREATE, etc.)
      return res.json({
        success: true,
        data: [],
        rowCount: rows.affectedRows || 0,
        message: `Comando ejecutado satisfactoriamente. Filas afectadas: ${rows.affectedRows || 0}`
      });
    }

    // --- 2. PostgreSQL ---
    if (active.type === 'postgres') {
      const result = await active.client.query(rawQuery);

      if (Array.isArray(result.rows) && result.command === 'SELECT') {
        return res.json({
          success: true,
          data: result.rows,
          rowCount: result.rowCount,
          message: `${result.rowCount} registros recuperados.`
        });
      }

      return res.json({
        success: true,
        data: result.rows || [],
        rowCount: result.rowCount || 0,
        message: `Comando ${result.command} completado. Filas afectadas: ${result.rowCount || 0}`
      });
    }

    // --- 3. SQLite3 ---
    if (active.type === 'sqlite') {
      const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(rawQuery);

      if (isSelect) {
        const rows = await new Promise((resolve, reject) => {
          active.client.all(rawQuery, [], (err, resultRows) => {
            if (err) return reject(err);
            resolve(resultRows);
          });
        });

        return res.json({
          success: true,
          data: rows,
          rowCount: rows.length,
          message: `${rows.length} registros recuperados.`
        });
      } else {
        const result = await new Promise((resolve, reject) => {
          active.client.run(rawQuery, [], function (err) {
            if (err) return reject(err);
            resolve({ changes: this.changes, lastID: this.lastID });
          });
        });

        return res.json({
          success: true,
          data: [],
          rowCount: result.changes,
          message: `Sentencia ejecutada. Filas afectadas: ${result.changes} (Ultimo ID: ${result.lastID || 'N/A'})`
        });
      }
    }

    // --- 4. MongoDB ---
    if (active.type === 'mongodb') {
      const db = active.client.db(active.config.database || undefined);

      // Support common MongoDB CLI commands like:
      // db.collection.find(...)
      // db.collection.insertOne(...)
      // db.collection.countDocuments(...)
      const mongoPattern = /^db\.([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_]+)\(([\s\S]*)\)$/;
      const match = rawQuery.match(mongoPattern);

      if (!match) {
        return res.status(400).json({
          success: false,
          error: 'Formato de comando MongoDB invalido. Ejemplo: db.users.find({ status: "active" })'
        });
      }

      const collectionName = match[1];
      const method = match[2];
      const argsRaw = match[3].trim();

      const col = db.collection(collectionName);

      // Parse JSON argument safely
      let parsedArgs = [];
      if (argsRaw) {
        try {
          // Eval in an isolated sandbox or standard JSON parse
          // Convert relaxed JSON / JS objects using Function constructor with no global access
          const parseArguments = new Function(`return [ ${argsRaw} ];`);
          parsedArgs = parseArguments();
        } catch (argErr) {
          return res.status(400).json({
            success: false,
            error: 'Parametros del comando NoSQL invalidos. Verifique la sintaxis JSON/Objeto.'
          });
        }
      }

      if (method === 'find') {
        const filter = parsedArgs[0] || {};
        const options = parsedArgs[1] || {};
        const limit = typeof options.limit === 'number' ? options.limit : 100;
        
        const docs = await col.find(filter, options).limit(limit).toArray();
        return res.json({
          success: true,
          data: docs,
          rowCount: docs.length,
          message: `${docs.length} documentos recuperados (Max 100).`
        });
      } else if (method === 'findOne') {
        const filter = parsedArgs[0] || {};
        const doc = await col.findOne(filter);
        return res.json({
          success: true,
          data: doc ? [doc] : [],
          rowCount: doc ? 1 : 0,
          message: doc ? '1 documento encontrado.' : 'Ningun documento coincide.'
        });
      } else if (method === 'insertOne') {
        const doc = parsedArgs[0] || {};
        const resMongo = await col.insertOne(doc);
        return res.json({
          success: true,
          data: [{ insertedId: resMongo.insertedId }],
          rowCount: 1,
          message: `Documento insertado con id: ${resMongo.insertedId}`
        });
      } else if (method === 'insertMany') {
        const docs = parsedArgs[0] || [];
        const resMongo = await col.insertMany(docs);
        return res.json({
          success: true,
          data: [{ insertedCount: resMongo.insertedCount }],
          rowCount: resMongo.insertedCount,
          message: `${resMongo.insertedCount} documentos insertados.`
        });
      } else if (method === 'updateOne') {
        const filter = parsedArgs[0] || {};
        const update = parsedArgs[1] || {};
        const resMongo = await col.updateOne(filter, update);
        return res.json({
          success: true,
          data: [{ matchedCount: resMongo.matchedCount, modifiedCount: resMongo.modifiedCount }],
          rowCount: resMongo.modifiedCount,
          message: `Documentos modificados: ${resMongo.modifiedCount}`
        });
      } else if (method === 'deleteOne') {
        const filter = parsedArgs[0] || {};
        const resMongo = await col.deleteOne(filter);
        return res.json({
          success: true,
          data: [{ deletedCount: resMongo.deletedCount }],
          rowCount: resMongo.deletedCount,
          message: `Documentos eliminados: ${resMongo.deletedCount}`
        });
      } else if (method === 'countDocuments') {
        const filter = parsedArgs[0] || {};
        const count = await col.countDocuments(filter);
        return res.json({
          success: true,
          data: [{ count }],
          rowCount: 1,
          message: `Conteo total de documentos: ${count}`
        });
      } else {
        return res.status(400).json({
          success: false,
          error: `Metodo '${method}' no permitido o no soportado en este visor.`
        });
      }
    }

    return res.status(400).json({ success: false, error: 'Motor de base de datos no reconocido.' });
  } catch (err) {
    return res.status(400).json({ success: false, error: mapDatabaseError(err) });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`[INFO] Mini IDE de Bases de Datos activo en http://localhost:${PORT}`);
});

