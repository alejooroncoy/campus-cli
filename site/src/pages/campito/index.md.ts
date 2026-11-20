import type { APIRoute } from 'astro';
import rawBody from '../../html/campito/index.html?raw';
import { htmlToMarkdown } from '../../lib/html-to-markdown';
import { campitoPageHtml } from '../../../feature-flags.mjs';

// La versión en Markdown de la página de Campito, con el mismo texto que la HTML
// (sin la escena animada de la portada, que solo tiene sentido vista).
export const GET: APIRoute = () => new Response(
  `Fuente: https://campuscli.com/campito/\n\n${htmlToMarkdown(campitoPageHtml(rawBody).replace(/<figure class="cf-stage"[\s\S]*?<\/figure>/, ''))}\n`,
  { headers: { 'content-type': 'text/markdown; charset=utf-8' } },
);
