import { createRequire } from 'node:module';
import { readFile, cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const packageFile = require.resolve('pdfjs-dist/package.json');
const { version } = JSON.parse(await readFile(packageFile, 'utf8'));
const destination = new URL(`../public/assets/pdfjs-${version}/`, import.meta.url);
await mkdir(destination, { recursive: true });
for (const folder of ['standard_fonts', 'cmaps'])
  await cp(join(dirname(packageFile), folder), new URL(folder, destination), { recursive: true });
