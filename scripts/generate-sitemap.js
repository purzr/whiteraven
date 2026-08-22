// این اسکریپت sitemap.xml را از روی صفحات ثابت سایت + همه‌ی محصولات موجود
// در Supabase می‌سازد. با همان GitHub Action ای که صفحات OG محصولات را
// می‌سازد (scripts/generate-product-pages.js) اجرا می‌شود تا هر بار که
// محصولی اضافه/حذف می‌شود، sitemap هم خودکار به‌روز بماند.

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://zcnfhjjzhfqvhbmkiqnh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjbmZoamp6aGZxdmhibWtpcW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDY0MjMsImV4cCI6MjEwMTY4MjQyM30.jHwlq7o5kM0thdhLgdXQW3YJ6jAnq2qOrPvPyHhq2lQ';
const SITE_URL = 'https://whiteraven.ir';
const OUTPUT_ROOT = path.join(__dirname, '..');

// صفحات ثابت سایت که همیشه در sitemap باید باشند. اگر مسیر صفحه‌ای در
// سایتت با این‌ها فرق دارد یا صفحه‌ی جدیدی اضافه شده، همین‌جا اصلاحش کن.
const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/shop/all', changefreq: 'daily', priority: '0.9' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
];

async function fetchProducts(){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,created_at`, {
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

function formatDate(d){
  const date = d ? new Date(d) : new Date();
  if(isNaN(date.getTime())) return new Date().toISOString().slice(0,10);
  return date.toISOString().slice(0,10);
}

function buildSitemap(products){
  const urls = [];

  for(const p of STATIC_PAGES){
    urls.push(
      `  <url>\n` +
      `    <loc>${SITE_URL}${p.path}</loc>\n` +
      `    <changefreq>${p.changefreq}</changefreq>\n` +
      `    <priority>${p.priority}</priority>\n` +
      `  </url>`
    );
  }

  for(const row of products){
    urls.push(
      `  <url>\n` +
      `    <loc>${SITE_URL}/product/${row.id}</loc>\n` +
      `    <lastmod>${formatDate(row.created_at)}</lastmod>\n` +
      `    <changefreq>weekly</changefreq>\n` +
      `    <priority>0.8</priority>\n` +
      `  </url>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') + `\n` +
    `</urlset>\n`;
}

async function main(){
  const products = await fetchProducts();
  console.log(`Fetched ${products.length} products for sitemap`);

  const xml = buildSitemap(products);
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'sitemap.xml'), xml, 'utf8');

  console.log(`Generated sitemap.xml with ${STATIC_PAGES.length + products.length} URLs`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
