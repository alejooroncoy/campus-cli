// Service Worker de Campus PWA
// Regla fundamental de seguridad académica:
// NO almacenar en caché datos privados de consultas, notas, profesores ni respuestas de la API.
// Solo cachea recursos estáticos del shell y el formulario vacío de Biblioteca.

const CACHE_NAME = "campus-shell-v16";
const STATIC_ASSETS = [
  "/app-dashboard.css?v=24",
  "/profes-chat.css?v=24",
  "/assets/fonts/GoogleSansFlex-Regular.woff2",
  "/assets/fonts/GoogleSansFlex-SemiBold.woff2",
  "/assets/campus-logo.webp",
  "/assets/lucide.svg",
  "/assets/lucide.svg?v=3",
  "/favicon.svg",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/site.webmanifest"
];

// The fallback must remain readable even with an empty asset cache.
// Only the font is optional; the layout and Campus mark are embedded.
const OFFLINE_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f4f8f8">
  <title>Campus · Sin conexión</title>
  <style>
    @font-face{font-family:Campus;src:url('/assets/fonts/GoogleSansFlex-Regular.woff2') format('woff2');font-weight:400;font-display:swap}
    @font-face{font-family:Campus;src:url('/assets/fonts/GoogleSansFlex-SemiBold.woff2') format('woff2');font-weight:600 700;font-display:swap}
    *{box-sizing:border-box}
    html{color-scheme:light;background:#f4f8f8}
    body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:32px 24px;font:16px/1.6 Campus,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a3a}
    main{width:100%;max-width:400px;text-align:center}
    .brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:48px;font-size:22px;font-weight:700;letter-spacing:-.6px}
    .brand svg{width:32px;height:32px;flex:none}
    .connection{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 24px;border-radius:20px;background:#e2f6fb;color:#087fa4}
    .connection svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    h1{margin:0;font-size:clamp(28px,5vw,34px);line-height:1.2;letter-spacing:-1px;font-weight:700;text-wrap:balance}
    p{margin:16px auto 0;max-width:340px;color:#506d7f;text-wrap:pretty}
    button{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;margin-top:28px;padding:12px 24px;border:0;border-radius:14px;background:#102a3a;color:#fff;font:600 16px/1.5 Campus,system-ui,sans-serif;cursor:pointer;touch-action:manipulation}
    button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    button:hover{background:#1c4255}
    button:active{background:#087fa4}
    button:focus-visible{outline:3px solid #17b6e7;outline-offset:4px}
    .hint{margin-top:20px;font-size:13px;line-height:1.5}
    @media(max-height:480px){.brand{margin-bottom:24px}.connection{margin-bottom:16px}}
  </style>
</head>
<body class="campus-app-body">
  <main aria-labelledby="offline-title">
    <div class="brand"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<g transform="translate(0.000000,1024.000000) scale(0.100000,-0.100000)" fill="#0a293d"><path d="M5180 9303 c-356 -36 -664 -103 -965 -211 -1463 -523 -2518 -1965
-2631 -3594 l-7 -98 119 0 119 0 29 55 c15 30 54 85 85 122 337 401 929 359
1221 -86 l16 -23 28 53 c173 322 502 627 881 816 176 88 462 187 655 227 l115
23 1 629 c1 706 -1 689 75 835 241 464 916 458 1147 -11 73 -149 72 -138 72
-843 0 -493 3 -628 13 -631 6 -2 57 -16 112 -30 115 -31 344 -120 456 -178
l77 -39 603 432 c636 456 876 627 1101 787 76 53 138 102 138 109 0 7 -40 65
-89 130 -659 875 -1645 1429 -2711 1523 -106 9 -578 12 -660 3z M1693 4783 c9
-2 25 -2 35 0 9 3 1 5 -18 5 -19 0 -27 -2 -17 -5z M2835 1960 c10 -11 20 -20
23 -20 3 0 -3 9 -13 20 -10 11 -20 20 -23 20 -3 0 3 -9 13 -20z M4842 1695 c0
-16 2 -22 5 -12 2 9 2 23 0 30 -3 6 -5 -1 -5 -18z M4841 1254 c0 -11 3 -14 6
-6 3 7 2 16 -1 19 -3 4 -6 -2 -5 -13z M4842 1205 c0 -16 2 -22 5 -12 2 9 2 23
0 30 -3 6 -5 -1 -5 -18z M4843 1020 c0 -30 2 -43 4 -27 2 15 2 39 0 55 -2 15
-4 2 -4 -28z"/></g>
<g transform="translate(0.000000,1024.000000) scale(0.100000,-0.100000)" fill="#0ab6eb"><path d="M2322 5830 c-224 -59 -466 -269 -503 -438 -5 -20 -18 -71 -29 -112
-31 -111 -30 -265 3 -390 14 -52 24 -97 21 -99 -2 -3 -54 -4 -115 -4 -79 1
-112 -3 -115 -12 -14 -37 54 -533 101 -732 65 -274 203 -674 305 -883 184
-376 352 -640 571 -900 526 -621 1168 -1038 1941 -1260 114 -32 286 -70 322
-70 l22 0 2 775 c4 867 2 846 75 978 284 507 1006 435 1189 -118 l23 -70 5
-785 5 -785 30 3 c92 9 450 100 502 128 16 7 33 14 39 14 6 0 80 27 164 60
489 193 927 480 1302 852 189 188 469 524 468 562 -1 11 -171 136 -184 136 -4
0 -12 5 -19 10 -13 12 -173 127 -362 261 -66 47 -197 142 -291 210 -202 147
-278 200 -470 334 -79 55 -226 160 -328 233 -102 72 -193 132 -204 132 -10 0
-47 -14 -81 -30 -257 -125 -556 -213 -871 -256 -279 -39 -728 -25 -1013 32
-42 8 -90 18 -105 20 -74 13 -396 120 -517 171 -410 175 -776 476 -970 798
-74 123 -77 132 -52 180 12 22 22 43 23 48 1 4 3 9 4 12 1 3 3 8 5 13 1 4 7
19 13 33 41 100 41 328 0 428 -6 14 -12 29 -13 34 -2 4 -4 9 -5 12 -1 3 -3 8
-4 13 -1 4 -12 26 -24 50 -12 23 -20 42 -17 42 8 0 -44 75 -88 127 -180 216
-485 314 -755 243z"/></g>
</svg><span>Campus</span></div>
    <div class="connection" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M12 20h.01M5 12a10 10 0 0 1 2.5-1.8M17 10.3a10 10 0 0 1 2 1.7M2 8.5a16 16 0 0 1 2.3-1.4M9 5a16 16 0 0 1 13 3.5"/></svg></div>
    <h1 id="offline-title">No podemos conectar</h1>
    <p>Revisa tu conexión a internet y vuelve a intentarlo para continuar en Campus.</p>
    <button type="button" onclick="window.location.reload()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg>Reintentar</button>
    <p class="hint">Volverás a esta misma página.</p>
  </main>
</body>
</html>`;

// Instalación: precachea únicamente el shell estático
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(async () => {
      const manifest = await fetch('/library-offline-assets.json', { credentials: 'omit', cache: 'reload' });
      if (!manifest.ok) throw new Error('Library offline manifest unavailable');
      const assets = await manifest.json();
      if (!Array.isArray(assets) || assets.some(path => typeof path !== 'string' || !/^\/(?!\/)/.test(path) || !(path === '/library-offline.html' || /\.(?:js|css|woff2|svg|webp|ico|png)(?:\?[^#]*)?$/.test(path)) || path.startsWith('/api/'))) throw new Error('Invalid static manifest');
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(assets.map(path => new Request(path, { credentials: 'omit', cache: 'reload' })));
      return self.skipWaiting();
    })
  );
});

// Activación: limpia versiones viejas del caché
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key.startsWith("campus-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. REGLA DE SEGURIDAD ESTRICTA:
  // Cualquier ruta de API (/api/*) es NETWORK-ONLY.
  // Jamás se guarda en caché respuestas académicas, perfiles, historial ni IA.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: "Sin conexión a internet. Conéctate para consultar a Campus." }),
          {
            status: 503,
            headers: { "content-type": "application/json; charset=utf-8" },
          }
        );
      })
    );
    return;
  }

  // CSS changes between releases: refresh it online and keep an offline fallback.
  if (url.pathname.endsWith(".css")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      }).catch(async () => (await caches.match(request)) || Response.error())
    );
    return;
  }

  // 2. Archivos estáticos inmutables (fuentes e imágenes de assets)
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. Navegación HTML (/app/, /app/asistente/, etc.): Network-First con fallback seguro
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        if (url.pathname === '/app/biblioteca/' || url.pathname === '/app/biblioteca') {
          const editor = await caches.match('/library-offline.html');
          if (editor) return editor;
        }
        return new Response(
          OFFLINE_HTML,
          {
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
            status: 503,
          }
        );
      })
    );
    return;
  }

  // Por defecto, fetch normal
  if ((url.pathname.startsWith('/_astro/') && url.pathname.endsWith('.js')) || url.pathname === '/app.js') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || Response.error()));
    return;
  }
  event.respondWith(fetch(request));
});
