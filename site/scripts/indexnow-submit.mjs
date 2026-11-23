// Aviso a IndexNow. Lo corre cada mañana el workflow indexnow.yml de GitHub
// Actions; también sirve a mano.
//   node scripts/indexnow-submit.mjs           URLs con fecha en los últimos días
//   node scripts/indexnow-submit.mjs --all     todas las URLs del sitemap
//   node scripts/indexnow-submit.mjs --dry-run solo lista, no envía
import { notifyChanged } from '../src/lib/indexnow.mjs';

const all = process.argv.includes('--all');
const dryRun = process.argv.includes('--dry-run');
let report;
try {
  report = await notifyChanged({ all, dryRun });
} catch (error) {
  for (const sitemapError of error.sitemapErrors ?? []) console.error(`No se pudo leer: ${sitemapError}`);
  console.error(`No se pudo avisar a IndexNow: ${error?.message ?? error}`);
  process.exit(1);
}
const { since, urls, errors, submitted, status } = report;
console.log(`${urls.length} URL${urls.length === 1 ? '' : 's'} ${all ? 'en el sitemap' : 'con fecha desde ' + since}`);
for (const url of urls) console.log(`  ${url}`);
if (!dryRun) console.log(`Enviadas: ${submitted}${status ? ` (IndexNow respondió ${status})` : ''}`);
// Un sitemap sin leer no detiene el aviso de los demás, pero el workflow queda
// en rojo para que se note.
for (const error of errors) console.error(`No se pudo leer: ${error}`);
if (errors.length) process.exitCode = 1;
