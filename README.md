# Mini IDE de Bases de Datos (SQL & NoSQL)

---

## 1. Descripción del Proyecto

El **Mini IDE de Bases de Datos** es un entorno de desarrollo web profesional, ligero y altamente seguro, diseñado para ingenieros de software, administradores de bases de datos y desarrolladores. Permite centralizar la conexión, inspección, manipulación y ejecución de comandos tanto **DDL** (*Data Definition Language*: `CREATE`, `ALTER`, `DROP`) como **DML** (*Data Manipulation Language*: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `db.collection.find()`) en múltiples motores de bases de datos relacionales y NoSQL.

### Características Principales:
- **Interfaz Sobria y Profesional (Engineering Look):** Inspirada en herramientas como VS Code y DataGrip, diseñada bajo una paleta monocromática oscura (`#1e1e1e`, `#252526` con acentos en `#007acc`), evitando elementos distractores, degradados llamativos o emojis.
- **Editor de Código Avanzado:** Integración completa de CodeMirror con numeración de líneas, soporte multilínea, atajos de teclado (`Ctrl + Enter` / `Cmd + Enter` para ejecutar consultas de inmediato) y cambio automático de modo de sintaxis (SQL y JavaScript).
- **Consola de Resultados y Diagnóstico:** Visualización de resultados tabulares dinámicos para operaciones de lectura, y consola de auditoría/mensajes con marcas de tiempo (`timestamps`) y conteo de filas o documentos afectados.
- **Historial Persistente:** Almacenamiento local mediante `localStorage` de las últimas sentencias ejecutadas, permitiendo recuperarlas con un solo clic.
- **Arquitectura de Seguridad (OWASP Top 10):**
  - Encabezados HTTP reforzados con `helmet` y cabecera `x-powered-by` deshabilitada.
  - Aislamiento de conexiones por sesión (`express-session`), previniendo colisiones de credenciales y fuga de sockets/memoria mediante desconexión automática y recolección de conexiones inactivas.
  - Mitigación contra inyecciones SQL y ataques DoS limitando el tiempo de respuesta (*query timeout*) y bloqueando la ejecución accidental de consultas compuestas destructivas (*multipleStatements* deshabilitado en MySQL).
  - Sanitización estricta de mensajes de error: nunca se exponen al cliente contraseñas, rutas de archivos del servidor ni *stack traces*.

---

## 2. Instrucciones de Instalación y Ejecución

### Requisitos Previos
- **Node.js**: Versión 18.x o superior (Probado en Node.js v24 LTS).
- **npm**: Versión 9.x o superior.
- Navegador web moderno (Google Chrome, Firefox, Microsoft Edge, Safari).

### Pasos de Instalación

1. **Clonar o descargar el proyecto:**
   Asegúrese de ubicarse en la carpeta raíz del proyecto:
   ```bash
   cd "mini IDE DB"
   ```

2. **Instalar dependencias del sistema:**
   Descargue e instale todos los módulos de Node.js necesarios:
   ```bash
   npm install
   ```

3. **Configuración de Variables de Entorno (Opcional):**
   El sistema funciona con valores por defecto seguros, pero puede personalizar el puerto y la clave de sesión creando un archivo `.env`:
   ```bash
   cp .env.example .env
   ```
   *Contenido sugerido de `.env`:*
   ```env
   PORT=3000
   SESSION_SECRET=clave_secreta_para_firmar_sesiones_seguras
   NODE_ENV=development
   ```

4. **Iniciar el Servidor:**
   - Modo Producción:
     ```bash
     npm start
     ```
   - Modo Desarrollo (con reinicio automático al guardar cambios):
     ```bash
     npm run dev
     ```

5. **Acceder a la Aplicación:**
   Abra su navegador web y visite:
   ```text
   http://localhost:3000
   ```

---

## 3. Explicación de las Bases de Datos Utilizadas

El sistema cuenta con controladores nativos para interactuar con los cuatro motores de bases de datos más extendidos en la industria:

### 1. SQLite3
- **Tipo:** Relacional / Embebida basada en archivo local.
- **Versión compatible:** SQLite 3.x (Driver `sqlite3` v5.1+).
- **Cómo conectarse:**
  1. En el panel lateral izquierdo, seleccione **SQLite3** en el menú desplegable.
  2. Ingrese la ruta relativa o absoluta del archivo de base de datos (por ejemplo, `./database.sqlite`). Si el archivo no existe, el servidor lo creará automáticamente.
  3. Haga clic en **Conectar**.
- **Ejemplo DDL & DML:**
  ```sql
  -- DDL: Crear tabla
  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    correo TEXT UNIQUE,
    saldo REAL DEFAULT 0.0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- DML: Insertar datos
  INSERT INTO clientes (nombre, correo, saldo) VALUES ('Carlos Mendoza', 'carlos@empresa.com', 1500.50);

  -- DML: Consultar
  SELECT * FROM clientes;
  ```

---

### 2. MySQL / MariaDB (Incluyendo cPanel Remoto)
- **Tipo:** Relacional / Cliente-Servidor (SQL).
- **Versión compatible:** MySQL 5.7+, MySQL 8.x, MariaDB 10.x+ (Driver `mysql2/promise`).
- **Cómo conectarse:**
  1. Seleccione **MySQL / MariaDB / cPanel**.
  2. Indique los parámetros de red:
     - **Host / IP:** Dirección IP pública o nombre de dominio del servidor (ej. `127.0.0.1` o `midominio.com`).
     - **Puerto:** `3306` (puerto por defecto).
     - **Usuario:** Usuario con permisos sobre la base de datos (ej. `usuario_cpanel`).
     - **Contraseña:** Clave de acceso asignada.
     - **Base de Datos:** Nombre exacto de la base de datos.
     - **Requerir SSL / TLS:** Marque esta casilla si su proveedor remoto (cPanel, AWS RDS, DigitalOcean) requiere transporte cifrado.
  3. Puede pulsar **Probar** para verificar la conectividad antes de establecer la sesión con **Conectar**.
- **Ejemplo DDL & DML:**
  ```sql
  -- DDL
  CREATE TABLE inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_sku VARCHAR(50) NOT NULL UNIQUE,
    producto VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0
  );

  -- DML
  INSERT INTO inventario (codigo_sku, producto, precio, stock)
  VALUES ('LAP-001', 'Portatil Profesional 16GB', 899.99, 15);

  -- DML
  SELECT * FROM inventario WHERE stock > 0 ORDER BY precio DESC;
  ```

---

### 3. PostgreSQL
- **Tipo:** Relacional / Objeto-Relacional Avanzado (SQL).
- **Versión compatible:** PostgreSQL 12.x, 13.x, 14.x, 15.x, 16.x (Driver `pg` v8.13+).
- **Cómo conectarse:**
  1. Seleccione **PostgreSQL**.
  2. Parámetros requeridos:
     - **Host / IP:** `localhost` o IP del servidor.
     - **Puerto:** `5432`.
     - **Usuario:** Generalmente `postgres` o el usuario asignado.
     - **Contraseña:** Contraseña del usuario PostgreSQL.
     - **Base de Datos:** Nombre de la base de datos (por ejemplo, `postgres` o su base personalizada).
     - **Requerir SSL / TLS:** Opcional/Recomendado para servidores cloud como Supabase, AWS RDS o Render.
  3. Haga clic en **Conectar**.
- **Ejemplo DDL & DML:**
  ```sql
  -- DDL
  CREATE TABLE registro_accesos (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL,
    ip_origen VARCHAR(45) NOT NULL,
    fecha_acceso TIMESTAMPTZ DEFAULT NOW()
  );

  -- DML
  INSERT INTO registro_accesos (usuario, ip_origen) VALUES ('admin_sec', '192.168.1.105');

  -- DML
  SELECT * FROM registro_accesos ORDER BY fecha_acceso DESC;
  ```

---

### 4. MongoDB
- **Tipo:** NoSQL orientado a Documentos (BSON / JSON).
- **Versión compatible:** MongoDB 4.x, 5.x, 6.x, 7.x y MongoDB Atlas (Driver oficial `mongodb` v6.13+).
- **Cómo conectarse:**
  - **Opción A (Parámetros estándar):**
    - **Host / IP:** `localhost` o IP del clúster.
    - **Puerto:** `27017`.
    - **Usuario / Contraseña:** Credenciales de autenticación (si están habilitadas).
    - **Base de Datos:** Nombre de la base de datos a gestionar.
  - **Opción B (Cadena URI / MongoDB Atlas):**
    - Puede ingresar directamente la URI completa en el campo *URI de Conexión*, por ejemplo:  
      `mongodb+srv://usuario:password@cluster0.mongodb.net/nombre_db?retryWrites=true&w=majority`
- **Sintaxis soportada en la consola:**
  ```javascript
  // Insertar un documento
  db.usuarios.insertOne({ nombre: "Andrea Castro", rol: "Desarrolladora", activo: true, stack: ["Node.js", "PostgreSQL"] })

  // Insertar múltiples documentos
  db.usuarios.insertMany([
    { nombre: "Mateo Silva", rol: "DevOps", activo: true },
    { nombre: "Valeria Ortiz", rol: "QA Engineer", activo: false }
  ])

  // Consultar con filtro y límite
  db.usuarios.find({ activo: true })

  // Conteo de documentos
  db.usuarios.countDocuments({})

  // Actualizar documento
  db.usuarios.updateOne({ nombre: "Andrea Castro" }, { $set: { rol: "Lead Architect" } })

  // Eliminar documento
  db.usuarios.deleteOne({ nombre: "Valeria Ortiz" })
  ```

---

## 4. Capturas de Pantalla del Sistema Funcionando

> Para visualizar sus propias capturas de pantalla en este archivo, almacene las imágenes en la carpeta `public/images/` y confirme que los nombres coincidan con las rutas siguientes:

### 1. Interfaz Principal del IDE
Vista general de la herramienta: formulario de conexión lateral, editor de código con numeración de líneas y barra de estado inferior.

![Interfaz Principal](public/images/01_interfaz_principal.png)

---

### 2. Conexión Establecida y Ejecución de Consultas DDL/DML (SQL)
Ejecución de sentencias en el motor relacional con visualización de registros devueltos en la tabla dinámica.

![Ejecución de Consulta SQL](public/images/02_consulta_sql_resultados.png)

---

### 3. Ejecución de Comandos NoSQL (MongoDB)
Gestión de documentos BSON/JSON, inserción y recuperación en formato tabular ordenado.

![Comandos MongoDB](public/images/03_consulta_mongodb.png)

---

### 4. Pestaña de Mensajes y Diagnóstico Seguro del Sistema
Registro de operaciones con tiempos de ejecución en milisegundos (`ms`), filas afectadas y mapeo seguro de errores técnicos.

![Consola de Mensajes y Auditoría](public/images/04_consola_mensajes.png)

---

## 5. Reflexión Personal sobre los Retos Técnicos y lo Aprendido

### 1. Desafío de Unificar Motores Heterogéneos (SQL vs. NoSQL)
Uno de los mayores retos técnicos en este proyecto consistió en diseñar una arquitectura de backend capaz de abstraer las diferencias conceptuales radicales entre motores relacionales (tablas, filas fijas, esquemas rígidos y lenguaje SQL estructurado) y motores NoSQL como MongoDB (colecciones no estructuradas, documentos anidados y sintaxis basada en funciones de objetos JavaScript).  
Se diseñó un despachador unificado en `server.js` que detecta la naturaleza del comando, ejecuta la operación con el driver correspondiente y estandariza la respuesta para que la interfaz web pueda representar tanto filas tabulares como documentos dinámicos con diferentes llaves sin romperse.

### 2. Gestión Eficiente del Ciclo de Vida de las Conexiones y Sockets
En herramientas web que interactúan con bases de datos remotas, mantener conexiones abiertas de forma descontrolada conduce rápidamente a fugas de memoria (`memory leaks`) y al agotamiento del pool de sockets del sistema operativo.  
Para resolver esto:
- Se implementó un almacenamiento de conexiones vinculado a la sesión del usuario (`express-session`), garantizando que las credenciales no persistan en variables globales ni sean accesibles por otros usuarios concurrentes.
- Se introdujo un mecanismo de desconexión explícita al cambiar de conexión y un proceso de limpieza periódica (*garbage collector*) que cierra automáticamente conexiones inactivas tras un tiempo prudencial.

### 3. Seguridad Defensiva y Mapeo Seguro de Errores (OWASP Top 10)
Otro aprendizaje crucial fue la implementación rigurosa de las directivas de seguridad web. Los drivers de bases de datos suelen emitir errores con excesivo detalle en caso de fallos de red o credenciales inválidas (incluyendo rutas de discos locales, puertos internos y trazas de la pila).  
Se implementó una capa de traducción de errores (*Error Mapping Function*) que clasifica los incidentes (tales como `ECONNREFUSED`, `ER_ACCESS_DENIED_ERROR`, o errores de sintaxis) y devuelve al usuario mensajes comprensibles y constructivos, mientras que los detalles técnicos quedan confinados en logs internos de auditoría del servidor.

### 4. Experiencia de Usuario Orientada a la Ingeniería (UX/UI Sobria)
Diseñar una interfaz bajo los lineamientos de no utilizar degradados llamativos, emojis ni animaciones innecesarias reforzó la importancia del minimalismo utilitario. La integración de atajos de teclado (`Ctrl + Enter`), la sincronización en tiempo real del cursor en la barra de estado y el historial de consultas en `localStorage` demuestran que una herramienta técnica puede ser estéticamente limpia, funcional y centrada en la productividad del desarrollador.
