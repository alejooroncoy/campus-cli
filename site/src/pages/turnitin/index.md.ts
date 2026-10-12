import type { APIRoute } from 'astro';
import body from '../../html/turnitin/index.html?raw';
import { htmlToMarkdown } from '../../lib/html-to-markdown';
export const GET: APIRoute = () => new Response(
  `Fuente: https://campuscli.com/turnitin/\n\n${htmlToMarkdown(body)}\n`,
  { headers: { 'content-type': 'text/markdown; charset=utf-8' } },
);
