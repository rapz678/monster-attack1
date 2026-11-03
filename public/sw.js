const C = 'ma-v3', FILES = ['./', 'index.html', 'bg.jpg', 'music.mp3'];
self.addEventListener('install', e => e.waitUntil(
  caches.open(C).then(c => Promise.all(FILES.map(f => c.add(new Request(f, { cache: 'reload' }))))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k !== 'skins').map(k => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || /^\/(api|skins|admin)/.test(u.pathname)) return;
  e.respondWith(caches.open(C).then(async c => {
    const rg = /bytes=(\d+)-(\d*)/.exec(e.request.headers.get('range') || '');
    if (rg) { // musik: layani dari salinan agar jalan di semua browser
      const r = await c.match(e.request, { ignoreSearch: true });
      if (r) { const b = await r.blob(), s = +rg[1], en = rg[2] ? +rg[2] : b.size - 1;
        return new Response(b.slice(s, en + 1), { status: 206, headers: { 'Content-Type': r.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${s}-${en}/${b.size}` } }); }
      return fetch(e.request);
    }
    // utamakan versi terbaru dari internet, salinan hanya cadangan saat offline
    try { const n = await fetch(e.request); if (n.status === 200) c.put(e.request, n.clone()); return n; }
    catch (err) { const r = await c.match(e.request, { ignoreSearch: true }); return r || Response.error(); }
  }));
});
