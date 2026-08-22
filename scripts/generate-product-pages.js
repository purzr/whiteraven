// این اسکریپت با GitHub Actions اجرا می‌شه، همه‌ی محصولات رو از Supabase می‌گیره
// و برای هر کدوم یه فایل استاتیک تو مسیر /product/{id}/index.html می‌سازه که
// og:tags درست خودش (عکس، عنوان، قیمت) رو داره. کاربرِ واقعی که این صفحه رو
// باز کنه، فوراً (با meta refresh + جاوااسکریپت) به همون آدرس تو سایت اصلی
// (SPA) ریدایرکت می‌شه — یعنی چیزی برای کاربر عوض نمی‌شه، فقط بات‌های
// تلگرام/واتساپ/اینستاگرام (که جاوااسکریپت اجرا نمی‌کنن) og:tags درست رو می‌بینن.
//
// این نسخه علاوه بر ساخت/به‌روزرسانی صفحات، صفحات محصولاتی که دیگه توی
// دیتابیس نیستن (یتیم شدن) رو هم از پوشه product/ حذف می‌کنه (sync کامل).

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://zcnfhjjzhfqvhbmkiqnh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjbmZoamp6aGZxdmhibWtpcW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDY0MjMsImV4cCI6MjEwMTY4MjQyM30.jHwlq7o5kM0thdhLgdXQW3YJ6jAnq2qOrPvPyHhq2lQ';
const SITE_URL = 'https://whiteraven.ir';
// مسیر ریشه‌ی سایت که فایل‌های خروجی توش ساخته می‌شن. چون GitHub Pages این
// ریپو از "/ (root)" پابلیش می‌شه (نه از پوشه‌ی docs)، خروجی مستقیم توی
// ریشه‌ی ریپو (کنار index.html) ساخته می‌شه.
const OUTPUT_ROOT = path.join(__dirname, '..');
const PRODUCT_DIR = path.join(OUTPUT_ROOT, 'product');

function escapeHtml(str){
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchProducts(){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if(!res.ok){
    throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function productImage(row){
  if(Array.isArray(row.images) && row.images.length) return row.images[0];
  if(row.image) return row.image;
  return `${SITE_URL}/og-image.jpg`;
}

function buildHtml(row){
  const productUrl = `${SITE_URL}/product/${row.id}`;
  const title = `${row.name || 'محصول'} | White Raven`;
  const priceText = row.price ? ` — ${Number(row.price).toLocaleString('fa-IR')} تومان` : '';
  const description = (row.desc && String(row.desc).slice(0, 200)) ||
    `خرید ${row.name || 'این محصول'} از فروشگاه آنلاین White Raven${priceText}`;
  const image = productImage(row);

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(productUrl)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="White Raven">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(productUrl)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<!-- کاربر واقعی (که جاوااسکریپت اجرا می‌کنه) فوراً به صفحه‌ی محصول تو
     سایت اصلی (SPA) هدایت می‌شه. بات‌ها این خط رو اجرا نمی‌کنن و همینجا
     می‌مونن، پس og:tags بالا رو می‌بینن. -->
<meta http-equiv="refresh" content="0; url=${escapeHtml(productUrl)}">
<script>location.replace(${JSON.stringify(productUrl)});</script>
</head>
<body>
<p>در حال انتقال به <a href="${escapeHtml(productUrl)}">${escapeHtml(row.name || 'صفحه محصول')}</a>...</p>
</body>
</html>`;
}

// پاک‌سازی پوشه‌های محصولاتی که دیگه توی دیتابیس نیستن.
// ساختار فعلی product/{id}/index.html هست، پس هر زیرپوشه‌ی مستقیم product/
// که اسمش (id) توی مجموعه‌ی idهای فعلی نباشه، یتیمه و حذف می‌شه.
function removeOrphanPages(validIds){
  if(!fs.existsSync(PRODUCT_DIR)) return [];

  const entries = fs.readdirSync(PRODUCT_DIR, { withFileTypes: true });
  const removed = [];

  for(const entry of entries){
    if(!entry.isDirectory()) continue; // فایل‌های دیگه (مثلاً README) رو دست نمی‌زنیم
    const id = entry.name;
    if(validIds.has(id)) continue;

    const dirToRemove = path.join(PRODUCT_DIR, id);
    fs.rmSync(dirToRemove, { recursive: true, force: true });
    removed.push(id);
  }

  return removed;
}

async function main(){
  const products = await fetchProducts();
  console.log(`Fetched ${products.length} products`);

  fs.mkdirSync(PRODUCT_DIR, { recursive: true });

  const validIds = new Set(products.map(row => String(row.id)));

  for(const row of products){
    const dir = path.join(PRODUCT_DIR, String(row.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildHtml(row), 'utf8');
  }

  console.log(`Generated ${products.length} product pages in ${PRODUCT_DIR}/*/index.html`);

  const removed = removeOrphanPages(validIds);
  if(removed.length){
    console.log(`Removed ${removed.length} orphan product page(s): ${removed.join(', ')}`);
  } else {
    console.log('No orphan product pages found.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
