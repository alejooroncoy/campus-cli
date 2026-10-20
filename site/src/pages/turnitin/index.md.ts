import type { APIRoute } from 'astro';
import body from '../../html/turnitin/index.html?raw';
import { htmlToMarkdown } from '../../lib/html-to-markdown';
import { turnitinServiceEnabled } from '../../../feature-flags.mjs';
export const GET: APIRoute = () => !turnitinServiceEnabled
  ? new Response('Servicio no disponible.\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  : new Response(
  `Fuente: https://campuscli.com/turnitin/\n\n${htmlToMarkdown(body)}\n`,
  { headers: { 'content-type': 'text/markdown; charset=utf-8' } },
);
