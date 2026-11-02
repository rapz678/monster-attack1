const C='ma-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','bg.jpg','music.mp3'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
 if(e.request.method!='GET'||u.origin!=location.origin||/^\/(api|skins|admin)/.test(u.pathname))return;
 e.respondWith(caches.open(C).then(async c=>{const r=await c.match(e.request,{ignoreSearch:true});
  const up=()=>fetch(e.request).then(n=>{if(n.status==200)c.put(e.request,n.clone());return n});
  if(!r)return up();
  const rg=/bytes=(\d+)-(\d*)/.exec(e.request.headers.get('range')||'');
  if(rg){const b=await r.blob(),s=+rg[1],en=rg[2]?+rg[2]:b.size-1;return new Response(b.slice(s,en+1),{status:206,headers:{'Content-Type':r.headers.get('Content-Type')||'audio/mpeg','Content-Range':`bytes ${s}-${en}/${b.size}`}})}
  up().catch(()=>0);return r}))});
