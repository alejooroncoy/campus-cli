// npm audit --audit-level=high con excepciones temporales y explícitas.
// Uso: node scripts/audit-high.mjs <carpeta>. Falla si queda una advertencia alta o crítica fuera de la lista.
import { execFileSync } from 'node:child_process';

// Cada excepción lleva el motivo y se quita cuando el paquete publique la versión corregida.
const IGNORED = {
  // picomatch: ReDoS con extglobs repetidos. Afecta a todas las versiones (sin arreglo publicado al 2026-11-17).
  // Aquí solo lo usan astro, vite y fast-glob al compilar, con patrones del propio código, nunca texto de usuarios.
  'GHSA-fc5q-39xc-vjpf': 'picomatch sin versión corregida',
};

const dir = process.argv[2] ?? '.';
let raw;
try { raw = execFileSync('npm', ['--prefix', dir, 'audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
catch (error) { raw = error.stdout; } // npm audit sale con 1 cuando hay advertencias: el JSON viene igual.
let report;
try { report = JSON.parse(raw); } catch { report = null; }
// Si npm no pudo consultar el registro devuelve un JSON de error: eso no es un audit aprobado.
if (!report || report.error || typeof report.vulnerabilities !== 'object' || typeof report.metadata?.vulnerabilities !== 'object') {
  console.error(`npm audit no devolvió un informe válido para ${dir}${report?.error ? `: ${report.error.summary ?? report.error.code ?? 'error'}` : ''}.`);
  process.exit(1);
}
const blocking = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via !== 'object' || !['high', 'critical'].includes(via.severity)) continue;
    const id = String(via.url ?? '').split('/').pop();
    if (IGNORED[id]) continue;
    blocking.set(id || via.title, `${via.severity}: ${via.name} — ${via.title} (${via.url})`);
  }
}
for (const [id, reason] of Object.entries(IGNORED)) console.log(`Excepción temporal: ${id} (${reason})`);
if (blocking.size) {
  console.error(`Advertencias altas o críticas en ${dir}:\n${[...blocking.values()].join('\n')}`);
  process.exit(1);
}
console.log(`Sin advertencias altas o críticas en ${dir} (fuera de las excepciones).`);
