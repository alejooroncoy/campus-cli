#!/usr/bin/env node
// Run TypeScript directly without build step
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const nodeDir = path.dirname(process.execPath);
const env = { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH}` };
const compiled = path.join(__dirname, 'dist', 'index.js');
let result;
if (fs.existsSync(compiled)) {
  result = spawnSync(process.execPath, [compiled, ...process.argv.slice(2)], { stdio: 'inherit', env });
} else {
  const tsx = path.join(__dirname, 'node_modules', '.bin', 'tsx');
  const entry = path.join(__dirname, 'src', 'index.ts');
  result = spawnSync(tsx, [entry, ...process.argv.slice(2)], { stdio: 'inherit', env });
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
