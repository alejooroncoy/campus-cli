import { mkdir, rename } from 'node:fs/promises';

// Reuse the public Campus website's header/footer and navigation, while
// rendering library content and SEO metadata in the first HTTP response.
await mkdir(new URL('../.generated/', import.meta.url), { recursive: true });
await rename(new URL('../dist/biblioteca/plantilla/index.html', import.meta.url), new URL('../.generated/library.html', import.meta.url));
