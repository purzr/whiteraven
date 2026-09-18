/* ============================================================
   White Raven — Service Worker
   ------------------------------------------------------------
   هدف: بارگذاری سریع‌تر در بازدید دوم + یک صفحه‌ی جایگزین قابل‌استفاده
   وقتی اینترنت قطع است. هیچ داده‌ی زنده‌ای (محصولات، قیمت، موجودی،
   سفارش‌ها، حساب کاربری) این‌جا کش نمی‌شود — همه‌ی این‌ها همیشه مستقیم
   از سوپابیس خوانده می‌شوند و از این فایل رد نمی‌شوند.

   نکته‌ی مهم برای به‌روزرسانی سایت:
   هر بار که تغییری در سایت اعمال می‌کنید که می‌خواهید کاربرهایی که
   قبلاً سایت را باز کرده‌اند هم فوراً ببینند، کافی است عدد زیر
   (CACHE_VERSION) را یک واحد بالا ببرید. با تغییر این عدد، مرورگر
   خودش کش قدیمی را دور می‌ریزد و نسخه‌ی تازه را می‌گیرد — کار دیگری
   لازم نیست.
   ============================================================ */
const CACHE_VERSION = 'wr-cache-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';

// فقط فایل‌های ثابت و کم‌تغیر خارجی (فونت‌ها و کتابخانه‌های CDN) از قبل
// کش می‌شوند تا لود اول هم سریع‌تر شود. اگر هرکدام در دسترس نبود، مشکلی
// پیش نمی‌آید — نصب Service Worker با خطا متوقف نمی‌شود.
const PRECACHE_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null))
      ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('wr-cache-') && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ۱) درخواست‌های سوپابیس (داده‌ی زنده): این‌ها اصلاً دست‌کاری نمی‌شوند و
  // مستقیم مثل حالت عادی به شبکه می‌روند — نه کش می‌شوند، نه از کش پاسخ
  // می‌گیرند. این خط دقیقاً همان چیزی است که تضمین می‌کند قیمت/موجودی/
  // سفارش‌ها همیشه لحظه‌ای و درست باشند.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) {
    return;
  }

  // ۲) خودِ صفحه (index.html / همه‌ی مسیرهای اپ روی همین دامنه):
  // «اول شبکه، بعد کش». یعنی همیشه اول تلاش می‌کند نسخه‌ی تازه را از
  // اینترنت بگیرد — پس هر تغییری که در سایت می‌دهید فوراً دیده می‌شود.
  // فقط وقتی اینترنت واقعاً در دسترس نباشد، آخرین نسخه‌ی ذخیره‌شده نشان
  // داده می‌شود تا کاربر به‌جای صفحه‌ی خطا، سایت را (با کمی تأخیر در
  // به‌روز بودن) ببیند.
  if (req.mode === 'navigate' || url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // ۳) فایل‌های ثابت خارجی (فونت‌ها، کتابخانه‌های CDN): چون این‌ها عملاً
  // تغییر نمی‌کنند، برای سرعت اول از کش نشان داده می‌شوند (اگر موجود
  // باشند) و هم‌زمان در پس‌زمینه نسخه‌ی تازه هم گرفته و برای دفعه‌ی بعد
  // ذخیره می‌شود (stale-while-revalidate).
  const isStaticAsset =
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn.jsdelivr.net';

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, res.clone())).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // بقیه‌ی درخواست‌ها (هر چیز دیگری) دست‌کاری نمی‌شوند.
});
