import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';

export class ResearchHttpError extends Error {
  constructor(public readonly status: number) {
    super(status === 429 ? 'El proveedor alcanzó su límite de consultas; intenta más tarde.'
      : status === 401 ? 'El proveedor rechazó la clave: verifica que copiaste la API key correcta y completa.'
      : status === 403 ? 'La cuenta asociada a la clave no tiene permisos para esta consulta.'
      : `El proveedor respondió HTTP ${status}.`);
  }
}

export function assertPublicAddress(address: string): void {
  if (!ipaddr.isValid(address) || ipaddr.process(address).range() !== 'unicast') {
    throw new Error('No se permiten direcciones de red privadas, locales o reservadas.');
  }
}

export function publicHttpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Usa una URL HTTPS pública, sin credenciales ni puertos personalizados.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(hostname)) assertPublicAddress(hostname);
  return url;
}

let active = 0;
const queue: Array<() => void> = [];

/** Bound concurrent external requests across all research tools. */
async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= 5) await new Promise<void>(resolve => queue.push(resolve));
  else active++;
  try { return await run(); }
  finally {
    const next = queue.shift();
    if (next) next();
    else active--;
  }
}

export type ResearchDownload = { bytes: Buffer; url: string; contentType: string };

/** No campus cookies, proxies, automatic redirects, or unbounded response bodies. */
export async function researchDownload(value: string, options: {
  headers?: Record<string, string>; maxBytes?: number; redirects?: number;
} = {}): Promise<ResearchDownload> {
  return withSlot(async () => {
    const deadline = AbortSignal.timeout(25_000);
    let url = publicHttpsUrl(value);
    for (let hop = 0; ; hop++) {
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = await Promise.race([
        lookup(hostname, { all: true }),
        new Promise<never>((_, reject) => {
          if (deadline.aborted) reject(new Error('Tiempo de consulta agotado.'));
          else deadline.addEventListener('abort', () => reject(new Error('Tiempo de consulta agotado.')), { once: true });
        }),
      ]);
      if (!addresses.length) throw new Error('No se pudo resolver el proveedor.');
      addresses.forEach(item => assertPublicAddress(item.address));
      const pinned = addresses[0];
      const response = await new Promise<{ bytes: Buffer; status: number; location?: string; contentType: string }>((resolve, reject) => {
        const req = request(url, {
          method: 'GET', signal: deadline, agent: false,
          // Pin the validated address to prevent DNS rebinding between check and connect.
          lookup: (_host, options, callback) => options.all
            ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
          headers: { 'User-Agent': 'campus-cli-academic-research/1.0 (+https://campuscli.com)',
            Accept: 'application/json, application/pdf;q=0.9', 'Accept-Encoding': 'identity', ...options.headers },
        }, res => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            res.destroy();
            resolve({ bytes: Buffer.alloc(0), status, location: res.headers.location, contentType: '' });
            return;
          }
          if (status < 200 || status >= 300) { res.destroy(); reject(new ResearchHttpError(status)); return; }
          const max = options.maxBytes ?? 4 * 1024 * 1024;
          if (Number(res.headers['content-length']) > max) {
            res.destroy(); reject(new Error('El documento supera el tamaño permitido.')); return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > max) { res.destroy(new Error('El documento supera el tamaño permitido.')); return; }
            chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => resolve({ bytes: Buffer.concat(chunks), status,
            contentType: res.headers['content-type'] ?? '' }));
        });
        req.on('error', error => reject(error instanceof ResearchHttpError ? error : new Error('No se pudo completar la conexión segura con el proveedor.')));
        req.end();
      });
      if (response.status < 300) return { bytes: response.bytes, url: url.toString(), contentType: response.contentType };
      // Authenticated API requests never follow redirects or forward API keys.
      if (options.headers || hop >= (options.redirects ?? 0) || !response.location) {
        throw new Error('Redirección del proveedor no permitida.');
      }
      url = publicHttpsUrl(new URL(response.location, url).toString());
    }
  });
}

export type ResearchJson = (url: string, headers?: Record<string, string>) => Promise<unknown>;
export const researchJson: ResearchJson = async (url, headers) => {
  const result = await researchDownload(url, { headers });
  try { return JSON.parse(result.bytes.toString('utf8')); }
  catch { throw new Error('El proveedor no devolvió metadatos JSON válidos.'); }
};
