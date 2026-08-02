import fs from 'fs';
import XLSX from 'xlsx';
import https from 'https';

function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

const workbook = XLSX.readFile('./سفارش 1405.xlsx');
const sheet = workbook.Sheets['سفارش 1'];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const excelProducts = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[0] || !r[1]) continue;
  excelProducts.push({
    code: r[0],
    name: String(r[1]).trim(),
    deliveryPrice: Number(r[10] || r[8] || r[9] || 0),
    consumerPrice: Number(r[9] || 0),
    packing: Number(r[5] || 1)
  });
}

async function run() {
  const rafoonehProducts = [];
  const baseUrls = [
    'https://rafooneh.com/homecare/detergent/hand-wash',
    'https://rafooneh.com/homecare/detergent/laundry-detergent',
    'https://rafooneh.com/homecare/detergent/dish-washer',
    'https://rafooneh.com/homecare/detergent/carpet',
    'https://rafooneh.com/homecare/detergent/curtain',
    'https://rafooneh.com/homecare/detergent/glass-cleaner',
    'https://rafooneh.com/homecare/detergent/cleaners',
    'https://rafooneh.com/homecare/detergent/bleach',
    'https://rafooneh.com/homecare/detergent/softener',
    'https://rafooneh.com/homecare',
    'https://rafooneh.com/cellulosic'
  ];

  for (const catUrl of baseUrls) {
    for (let page = 1; page <= 5; page++) {
      const pageUrl = page === 1 ? catUrl : `${catUrl}?p=${page}`;
      const html = await fetchUrl(pageUrl);
      if (!html || html.length < 500) break;

      const itemRegex = /<img[^>]+class=["'][^"']*product-image-photo[^"']*["'][^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']+)["']/gi;
      let match;
      let found = 0;
      while ((match = itemRegex.exec(html)) !== null) {
        found++;
        rafoonehProducts.push({ src: match[1], title: match[2] });
      }
      if (found === 0) break;
    }
  }

  const uniqueRafooneh = [];
  const seen = new Set();
  for (const p of rafoonehProducts) {
    if (!seen.has(p.title)) {
      seen.add(p.title);
      uniqueRafooneh.push(p);
    }
  }

  console.log('Unique scraped Rafooneh products:', uniqueRafooneh.length);
  fs.writeFileSync('scraped_rafooneh.json', JSON.stringify(uniqueRafooneh, null, 2));

  fs.writeFileSync('excel_products.json', JSON.stringify(excelProducts, null, 2));
}

run();
