self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.map((key)=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(new Request(event.request,{cache:'no-store'})));
});
