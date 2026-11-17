#!/usr/bin/env node
// Auditoría de dependencias para el CI: falla con cualquier alerta alta o crítica,
// salvo las de ALLOWED, y solo hasta su fecha de vencimiento.
//
// Uso: node scripts/audit-gate.mjs [carpeta]   (por defecto, la raíz del repo)
import { execFileSync } from "node:child_process";

/** Alertas sin versión corregida publicada. Cada una vence: pasada la fecha, el CI
 * vuelve a fallar y obliga a revisarla de nuevo. */
const ALLOWED = {
  // picomatch <= 4.0.7: ReDoS con patrones extglob escritos por un atacante. No hay
  // versión corregida (arreglo propuesto en micromatch/picomatch#194). Llega solo por
  // astro, vite, micromatch, anymatch y purgecss, y los patrones los escribe el sitio,
  // no los visitantes.
  "GHSA-fc5q-39xc-vjpf": { until: "2026-12-15", package: "picomatch" },
};

const dir = process.argv[2] ?? ".";
let report;
try {
  report = execFileSync("npm", ["audit", "--json", "--package-lock-only"], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  // npm audit sale con código 1 cuando encuentra alertas: el JSON viene igual.
  report = error.stdout;
  if (!report) throw error;
}
const parsed = JSON.parse(report);
// Si npm no pudo consultar el registro, también responde JSON, pero con un error y sin
// informe. Eso no es "sin alertas": se falla cerrado.
if (parsed.error || typeof parsed.vulnerabilities !== "object" || parsed.vulnerabilities === null) {
  console.error(`No se pudo completar la auditoría en ${dir}: ${parsed.error?.summary || parsed.error?.code || "el registro no devolvió un informe de vulnerabilidades"}`);
  process.exit(1);
}
const { vulnerabilities } = parsed;

const today = new Date().toISOString().slice(0, 10);
const seen = new Map();
for (const [name, entry] of Object.entries(vulnerabilities))
  for (const via of entry.via)
    if (typeof via === "object" && ["high", "critical"].includes(via.severity))
      seen.set(via.url, { name, ...via });

const blocking = [];
for (const advisory of seen.values()) {
  const id = advisory.url.split("/").pop();
  const allowed = ALLOWED[id];
  if (allowed && allowed.package === advisory.name && today <= allowed.until) {
    console.log(`Permitida hasta ${allowed.until}: ${id} (${advisory.name} ${advisory.range}) ${advisory.title}`);
    continue;
  }
  blocking.push(`${advisory.severity} ${id} (${advisory.name} ${advisory.range}) ${advisory.title}${allowed ? ` (la excepción venció el ${allowed.until})` : ""}`);
}

if (blocking.length) {
  console.error(`Alertas altas o críticas en ${dir}:\n${blocking.map((b) => "  " + b).join("\n")}`);
  process.exit(1);
}
console.log(`Sin alertas altas o críticas pendientes en ${dir}.`);
