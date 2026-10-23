import {mkdir,rename} from 'node:fs/promises';
await mkdir(new URL('../.generated/',import.meta.url),{recursive:true});
await rename(new URL('../dist/profes/plantilla/index.html',import.meta.url),new URL('../.generated/professors.html',import.meta.url));

await rename(new URL('../dist/profes/resenas/index.html',import.meta.url),new URL('../.generated/community.html',import.meta.url));
