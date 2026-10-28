#!/usr/bin/env node
// Compatibility alias: Mendeley credentials and OAuth stay in the hosted relay.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
if (process.argv.length > 2) {
  console.error('La conexión Mendeley se gestiona en el relay. Ejecuta campus login y campus-mendeley-connect sin credenciales locales.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'run.js'), 'tools', 'call', 'campus_mendeley_connect'], { stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
