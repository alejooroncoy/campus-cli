import type { APIRoute } from 'astro';
import { ucalMarkdown } from '../../data/ucal';

export const GET: APIRoute = () => new Response(`${ucalMarkdown}\n`, {
  headers: { 'content-type': 'text/markdown; charset=utf-8' },
});
