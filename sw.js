/* ============================================================
   Aqua Premium - Trabajador de servicio (modo sin conexión)
   Debe estar en la MISMA carpeta que el archivo de la app.
   Solo funciona con la app publicada en un sitio (https) o en
   localhost. Si abres el archivo con doble clic (file://), el
   navegador lo ignora y la app igual funciona, pero sin modo
   sin conexión real.
   ============================================================ */

const VERSION = 'aquamoon-v41';
const CACHE_NAME = 'aquamoon-cache-' + VERSION;

/* Archivos que se guardan para abrir la app sin internet */
const SHELL = [
  './',
  './index.html',
  './AquaMoon_v41.html'
];

/* ---------- Instalación: guarda la app ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        /* Si un archivo no existe en el servidor, se ignora sin romper nada */
      }
    }));
    await self.skipWaiting();
  })());
});

/* ---------- Activación: borra versiones viejas ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

/* ---------- Respuesta auxiliar sin conexión ---------- */
async function respuestaSinConexion() {
  const cache = await caches.open(CACHE_NAME);
  const guardado =
    (await cache.match('./')) ||
    (await cache.match('./index.html')) ||
    (await cache.match('./AquaMoon_v41.html'));
  if (guardado) return guardado;
  return new Response(
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Aqua Premium - Sin conexión</title></head>' +
    '<body style="font-family:system-ui,Arial,sans-serif;padding:28px;text-align:center;color:#1a2333">' +
    '<h2>Sin conexión</h2>' +
    '<p>No se pudo cargar Aqua Premium porque aún no se guardó la app en este dispositivo.</p>' +
    '<p>Abre la app una vez con internet y vuelve a intentarlo.</p>' +
    '</body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/* ---------- Intercepción de peticiones ---------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  /* Solo se manejan lecturas. Login, ventas y sincronización van siempre a la red. */
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* Navegación (abrir la app): red primero, y si no hay internet, copia guardada */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const red = await fetch(request);
        if (red && red.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, red.clone()).catch(() => {});
        }
        return red;
      } catch (e) {
        return respuestaSinConexion();
      }
    })());
    return;
  }

  /* Mismo servidor: responde rápido con la copia y actualiza por detrás */
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const guardado = await cache.match(request);
      const red = fetch(request)
        .then((res) => {
          if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);
      return guardado || (await red) || respuestaSinConexion();
    })());
    return;
  }

  /* Librerías externas (Firebase, mapas): red primero; si falla, copia guardada */
  event.respondWith((async () => {
    try {
      const red = await fetch(request);
      if (red && (red.ok || red.type === 'opaque')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, red.clone()).catch(() => {});
      }
      return red;
    } catch (e) {
      const cache = await caches.open(CACHE_NAME);
      const guardado = await cache.match(request);
      if (guardado) return guardado;
      return new Response('', { status: 504, statusText: 'Sin conexión' });
    }
  })());
});

/* ---------- Mensajes desde la app ---------- */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data === 'SKIP_WAITING' || data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data === 'LIMPIAR_CACHE' || data.type === 'LIMPIAR_CACHE') {
    event.waitUntil(caches.delete(CACHE_NAME));
  }
});
