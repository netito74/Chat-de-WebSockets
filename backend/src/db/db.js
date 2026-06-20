'use strict';
/**
 * Capa de acceso a datos. Usa el modulo nativo `node:sqlite` (incluido en
 * Node >= 22.5) para no depender de compilacion nativa (better-sqlite3,
 * etc.), lo que simplifica el despliegue en entornos restringidos/containers
 * minimalistas. La API expuesta (`prepare().run/get/all`) es intencionalmente
 * compatible con better-sqlite3 para poder migrar sin reescribir los
 * repositorios si en produccion se prefiere Postgres + un ORM (ver
 * docs/database.md, seccion "Migracion a Postgres").
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

const dataDir = path.dirname(config.db.file);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(config.db.file);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
// Con varios procesos Node escribiendo en el mismo archivo SQLite (el caso
// de 2+ instancias detras del balanceador, ver docs/architecture.md
// "Cuellos de botella"), una escritura concurrente puede encontrar el
// archivo bloqueado por una fraccion de segundo. Sin busy_timeout, SQLite
// lanza SQLITE_BUSY inmediatamente (excepcion no controlada, tumba el
// proceso); con busy_timeout, reintenta internamente hasta 5s antes de
// fallar. Esto es una mitigacion, no una solucion: SQLite usa un modelo de
// un solo escritor, por lo que para una concurrencia de escritura alta en
// produccion se recomienda migrar a Postgres (ver docs/database.md).
db.exec('PRAGMA busy_timeout = 5000;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
