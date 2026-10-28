import { mkdir, rename } from "node:fs/promises";

// Vercel checks static files before applying fallback rewrites. Keep the
// rendered Astro template outside dist so /blackboard-chatgpt/ reaches the
// function instead of silently serving a page without its reviews.
await mkdir(new URL("../.generated/", import.meta.url), { recursive: true });
await rename(
  new URL("../dist/blackboard-chatgpt/index.html", import.meta.url),
  new URL("../.generated/blackboard-chatgpt.html", import.meta.url),
);

await rename(new URL("../dist/opiniones-campus/index.html", import.meta.url), new URL("../.generated/opiniones-campus.html", import.meta.url));
