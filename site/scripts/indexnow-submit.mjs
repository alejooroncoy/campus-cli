// Aviso manual a IndexNow, para la primera vez (todas las URLs) o para repetir
// un aviso a mano. El cron diario (api/indexnow.js) cubre el día a día.
//   node scripts/indexnow-submit.mjs           URLs dentro de la ventana del cron
//   node scripts/indexnow-submit.mjs --all     todas las URLs del sitemap
//   node scripts/indexnow-submit.mjs --dry-run solo lista, no envía
import { changedSince, collectEntries, limaDate, submit } from '../src/lib/indexnow.mjs';
import { WINDOW_DAYS } from '../api/indexnow.js';

const all = process.argv.includes('--all');
const dryRun = process.argv.includes('--dry-run');
const since = limaDate(WINDOW_DAYS - 1);
const { entries, errors } = await collectEntries();
for (const error of errors) console.error(`No se pudo leer: ${error}`);
const urls = all ? [...new Set(entries.map(e => e.loc))] : changedSince(entries, since, limaDate(-1));
console.log(`${urls.length} URL${urls.length === 1 ? '' : 's'} ${all ? 'en el sitemap' : 'con fecha desde ' + since}`);
for (const url of urls) console.log(`  ${url}`);
if (!dryRun) console.log(await submit(urls));
