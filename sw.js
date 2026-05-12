const CACHE = 'mathquest-v7';

// Assets pré-cacheados na instalação.  Caminhos network-first (HTML, script.js,
// teacher.html) buscam versão fresca a cada visita mas usam estes como
// fallback offline.
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icon.svg',
    './manifest.json',
    './teacher.html',
    './game-extras2.js',
    './privacy.html',
    './404.html',
    'https://unpkg.com/@supabase/supabase-js@2',
    'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Fira+Code:wght@500;700&display=swap',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

// Network-first: entry points que mudam a cada deploy (HTML + game engine).
// Aluno sempre pega versão nova quando online; cai pro cache só se offline.
const networkFirst = req => fetch(req)
    .then(res => {
        if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
    })
    .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')));

// Cache-first: assets estáveis (CSS, fontes, ícones, SDK de CDN).
const cacheFirst = req => caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
}).catch(() => caches.match('./index.html')));

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Supabase: sempre fresco; fallback JSON vazio quando offline.
    if (url.hostname.includes('supabase.co')) {
        e.respondWith(fetch(req).catch(() =>
            new Response('{}', { headers: { 'Content-Type': 'application/json' } })
        ));
        return;
    }

    // Network-first: páginas e o script que muda a cada deploy.
    const path = url.pathname;
    if (path.endsWith('/') || path.endsWith('.html') || path.endsWith('/script.js') || path.endsWith('/style.css')) {
        e.respondWith(networkFirst(req));
        return;
    }

    // Cache-first: tudo o mais.
    e.respondWith(cacheFirst(req));
});
