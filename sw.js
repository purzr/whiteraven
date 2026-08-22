// Service Worker ساده برای وایت راون. هدف: بازدید دوم به بعد سریع‌تر لود شود.
//
// استراتژی‌ها (عمداً محافظه‌کارانه، چون این یک فروشگاهه و قیمت/موجودی نباید
// کهنه/کش‌شده به مشتری نشان داده شود):
//  - صفحه‌ی اصلی (خود index.html / ناوبری‌ها): network-first — همیشه تلاش
//    می‌شود نسخه‌ی تازه از اینترنت گرفته شود؛ فقط اگر کاربر آفلاین بود از
//    کش قبلی نشان داده می‌شود.
//  - عکس‌ها (محصولات از Supabase Storage + فونت‌های گوگل): cache-first —
//    این‌ها سنگین‌ترین و کم‌تغییرترین بخش سایت هستند، پس کش‌شدنشان بی‌خطر و
//    خیلی مفید است.
//  - هر درخواستی به Supabase REST/RPC API (قیمت، موجودی، سفارش، حساب
//    کاربری و...): اصلاً کش نمی‌شود — همیشه مستقیم به شبکه می‌رود.

const CACHE_VERSION = 'wr-cache-v1';
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('wr-cache-') && k !== IMAGE_CACHE && k !== PAGE_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isSupabaseApi(url){
  // درخواست‌های داده‌ای (REST/RPC/auth) به Supabase — هیچ‌وقت کش نمی‌شوند
  return url.hostname.endsWith('.supabase.co') &&
    (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/rpc/'));
}

function isSupabaseImage(url){
  // فایل‌های عکس داخل باکت Storage
  return url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/');
}

function isGoogleFont(url){
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

function isImageRequest(request, url){
  return request.destination === 'image' || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if(request.method !== 'GET') return; // فقط درخواست‌های خواندنی کش می‌شوند

  const url = new URL(request.url);

  // ۱) API دیتابیس: همیشه مستقیم شبکه، بدون کش
  if(isSupabaseApi(url)) return;

  // ۲) عکس‌ها و فونت‌ها: cache-first
  if(isSupabaseImage(url) || isGoogleFont(url) || isImageRequest(request, url)){
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if(cached) return cached;
        try{
          const res = await fetch(request);
          if(res && res.ok) cache.put(request, res.clone());
          return res;
        }catch(err){
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // ۳) ناوبری/صفحه‌ی اصلی (خود index.html): network-first با fallback به کش.
  // توجه: فقط پاسخ خودِ مسیر ریشه («/») به‌عنوان «پوسته‌ی اصلی اپ» کش می‌شود —
  // نه هر صفحه‌ای که کاربر مستقیم بازش کرده. چون بعضی مسیرها (مثل
  // /product/{id}/) فایل HTML کاملاً متفاوتی دارند (صفحات مخصوص سئو که به
  // اپ اصلی ریدایرکت می‌کنند)، کش‌کردنشان زیر کلید «/» باعث می‌شد در حالت
  // آفلاین به‌جای خود سایت، آن صفحه‌ی ریدایرکت خالی نشان داده شود.
  if(request.mode === 'navigate' || request.destination === 'document'){
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        try{
          const res = await fetch(request);
          if(res && res.ok && url.pathname === '/'){
            cache.put('/', res.clone());
          }
          return res;
        }catch(err){
          // آفلاین یا خطای شبکه: به‌جای هر صفحه، همیشه پوسته‌ی اصلی اپ را
          // نشان می‌دهیم (که خودش می‌تواند بعداً با اتصال دوباره، مسیر
          // درست را از نو بارگذاری کند)
          const cached = await cache.match('/');
          return cached || Response.error();
        }
      })()
    );
  }
});
