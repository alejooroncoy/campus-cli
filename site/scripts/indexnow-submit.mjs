// Aviso manual a IndexNow, para la primera vez (todas las URLs) o para repetir
// un aviso a mano. El cron diario (api/indexnow.js) cubre el día a día.
//   node scripts/indexnow-submit.mjs           URLs con lastmod de ayer u hoy
//   node scripts/indexnow-submit.mjs --all     todas las URLs del sitemap
//   node scripts/indexnow-submit.mjs --dry-run solo lista, no envía
import { changedSince, collectEntries, limaDate, submit } from '../src/lib/indexnow.mjs';

const all = process.argv.includes('--all');
const dryRun = process.argv.includes('--dry-run');
const entries = await collectEntries();
const urls = all ? [...new Set(entries.map(e => e.loc))] : changedSince(entries, limaDate(1));
console.log(`${urls.length} URL${urls.length === 1 ? '' : 's'} ${all ? 'en el sitemap' : 'cambiadas desde ' + limaDate(1)}`);
for (const url of urls) console.log(`  ${url}`);
if (!dryRun) console.log(await submit(urls));
