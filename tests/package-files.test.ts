import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

/** Archivos locales que se cargan en tiempo de ejecución desde un módulo (los `import type` desaparecen al compilar). */
function runtimeImports(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)\.js['"]/g)) {
    const statement = source.slice(source.lastIndexOf('\n', source.lastIndexOf('import', match.index)) + 1, match.index);
    if (/^\s*(import|export)\s+type\b/.test(statement)) continue;
    found.push(path.resolve(path.dirname(file), `${match[1]}.ts`));
  }
  return found;
}

function reachable(entries: string[]): string[] {
  const seen = new Set<string>();
  const pending = [...entries];
  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    pending.push(...runtimeImports(file));
  }
  return [...seen];
}

test('el paquete npm incluye todos los módulos que el CLI carga al arrancar', () => {
  const files: string[] = pkg.files;
  const shipped = (dist: string) => files.some(entry => dist === entry || dist.startsWith(`${entry}/`));
  const modules = reachable([path.join(root, 'src/index.ts'), path.join(root, 'src/mcp/server.ts')]);
  assert.ok(modules.length > 5, 'el recorrido de imports debe encontrar módulos');
  const missing = modules.map(file => `dist/${path.relative(path.join(root, 'src'), file).replace(/\.ts$/, '.js')}`).filter(dist => !shipped(dist));
  assert.deepEqual(missing, [], 'estos archivos se importan pero no están en "files" de package.json');
});

test('los módulos que carga `campus mcp` nunca escriben en stdout, que es el canal JSON-RPC', () => {
  const offenders = reachable([path.join(root, 'src/mcp/server.ts')]).flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    return [/console\.log\(/.test(source) && 'console.log', /stdio:\s*'inherit'/.test(source) && "stdio: 'inherit'", /process\.stdout\.write/.test(source) && 'process.stdout.write']
      .filter(Boolean).map(kind => `${path.relative(root, file)}: ${kind}`);
  });
  assert.deepEqual(offenders, []);
});

test('el instalador de Chromium usa el Playwright de este paquete y no el del proyecto en curso', () => {
  const source = fs.readFileSync(path.join(root, 'src/browser-install.ts'), 'utf8');
  assert.doesNotMatch(source, /execFileSync\(\s*'npx'/, 'npx resolvería la versión de Playwright del directorio actual');
  assert.match(source, /process\.execPath/);
  const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
  assert.ok(fs.existsSync(cli), 'playwright/cli.js debe existir para poder instalar el navegador');
});
