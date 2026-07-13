import axios, { AxiosInstance, AxiosError } from 'axios';
import type { Session } from '../types.js';

const BASE_URL = 'https://aulavirtual.upc.edu.pe';

export function createClient(session: Session): AxiosInstance {
  // Build cookie header string
  const cookieStr = session.cookies
    .filter((c) => {
      const domain = c.domain.replace(/^\./, '');
      return 'aulavirtual.upc.edu.pe'.endsWith(domain) || domain === 'aulavirtual.upc.edu.pe';
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      Cookie: cookieStr,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(session.xsrfToken ? { 'X-Blackboard-XSRF': session.xsrfToken } : {}),
    },
    withCredentials: true,
  });

  // Intercept 401 to give a helpful message
  client.interceptors.response.use(
    (r) => r,
    (err: AxiosError) => {
      if (err.response?.status === 401) {
        const e = new Error('Session expired. Run: campus login');
        (e as any).code = 'SESSION_EXPIRED';
        throw e;
      }
      throw err;
    }
  );

  return client;
}
