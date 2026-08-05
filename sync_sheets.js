import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPREADSHEET_ID = '1t2sL76hWvxMusDMDu-rgYI4QiGpvGGbDfB2wIDdrgG8';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;

function categorize(name) {
  if (name.includes('دست') || name.includes('پومپ') || name.includes('پستلی') || name.includes('پاستیلی')) return { id: 'handwash', name: 'مایع دستشویی' };
  if (name.includes('ظرف') || name.includes('گلیسیرین')) return { id: 'dishwash', name: 'مایع ظرفشویی' };
  if (name.includes('لباس') || name.includes('مشکین') || name.includes('رنگین') || name.includes('پودر') || name.includes('نرم کننده')) return { id: 'laundry', name: 'شوینده لباس' };
  if (name.includes('شیشه') || name.includes('پاک کننده') || name.includes('چربی') || name.includes('همه کاره') || name.includes('سطوح') || name.includes('چوب') || name.includes('چرم') || name.includes('شیرآلات') || name.includes('گاز') || name.includes('چند منظوره') || name.includes('اسپری')) return { id: 'cleaners', name: 'پاک‌کننده و اسپری' };
  if (name.includes('جرم') || name.includes('سفید') || name.includes('وایتکس') || name.includes('من') || name.includes('اسیدی') || name.includes('سرویس')) return { id: 'sanitary', name: 'جرم‌گیر و ضدعفونی‌کننده' };
  if (name.includes('فرش') || name.includes('موکت') || name.includes('پرده')) return { id: 'home', name: 'شستشوی خانه و فرش' };
  if (name.includes('کیسه') || name.includes('فریزر') || name.includes('زباله') || name.includes('دستکش') || name.includes('اسکاج') || name.includes('سفره') || name.includes('پد') || name.includes('فویل') || name.includes('محافظ')) return { id: 'cellulosic', name: 'لوازم مصرفی و سلولزی' };
  if (name.includes('خودرو') || name.includes('شامپو ماشین') || name.includes('واکس')) return { id: 'car', name: 'شوینده خودرو و ویژه' };
  return { id: 'other', name: 'سایر شوینده‌ها' };
}

function determineBrand(name, rawBrand = '') {
  if (rawBrand && String(rawBrand).trim()) {
    const b = String(rawBrand).trim();
    const bLower = b.toLowerCase();
    if (b.includes('خارج') || b.includes('وارد') || bLower.includes('foreign') || bLower.includes('import')) {
      return { id: 'foreign', name: 'محصولات خارجی' };
    }
    if (b.includes('رافونه') || bLower.includes('rafooneh')) {
      return { id: 'rafooneh', name: 'برند رافونه' };
    }
    return { id: 'foreign', name: 'محصولات خارجی' };
  }

  const n = String(name || '').toLowerCase();
  if (n.includes('خارجی') || n.includes('وارداتی') || n.includes('فینیش') || n.includes('پریمیوم') || n.includes('آلمانی') || n.includes('ترک') || n.includes('امپریال') || n.includes('فرانسوی') || n.includes('ایتالیایی')) {
    return { id: 'foreign', name: 'محصولات خارجی' };
  }
  return { id: 'rafooneh', name: 'برند رافونه' };
}

const categoryDefaultImages = {
  handwash: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/h/a/hand-washing-green_2.jpg',
  dishwash: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/l/i/liquid-dishwashing-glycerin-green-2700-gr_1.png',
  laundry: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/3/_/3_1_1_1.jpg',
  cleaners: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/6/2/6261460205754_2.jpg',
  sanitary: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/1/1/11_1_.jpg',
  home: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/2/1/21_1.jpg',
  cellulosic: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/d/o/double-lock-bag-25_2_1.jpg',
  car: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/6/2/6261460205754_2.jpg',
  other: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/s/a/sanitary-protective-coating-large.jpg'
};

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val)
    .replace(/,/g, '')
    .replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 0x0030))
    .replace(/[\u06f0-\u06f9]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x06f0 + 0x0030))
    .trim();
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function findColumnIndices(headerRow) {
  const headers = (headerRow || []).map(h => String(h || '').trim());

  let codeIdx = headers.findIndex(h => h === 'کد کالا' || h === 'کد');
  if (codeIdx === -1) codeIdx = headers.findIndex(h => h.includes('کد'));

  let nameIdx = headers.findIndex(h => h === 'شرح کالا' || h === 'نام کالا' || h === 'نام');
  if (nameIdx === -1) nameIdx = headers.findIndex(h => h.includes('شرح') || h.includes('نام') || h.includes('عنوان'));

  let brandIdx = headers.findIndex(h => h === 'برند' || h === 'سازنده' || h === 'مارک' || h === 'برند کالا' || h.toLowerCase() === 'brand');

  let stockIdx = headers.findIndex(h => h === 'موجودی' || h === 'موجودی انبار' || h === 'موجودی فعلی');
  if (stockIdx === -1) stockIdx = headers.findIndex(h => h.includes('موجودی') && !h.includes('قبلی'));

  let deliveryPriceIdx = headers.findIndex(h => h === 'قیمت تحویل' || h === 'قیمت تحویل (ریال)' || h === 'قیمت تحویل(ریال)' || h === 'نرخ تحویل');
  if (deliveryPriceIdx === -1) deliveryPriceIdx = headers.findIndex(h => h.includes('قیمت تحویل') || h.includes('نرخ تحویل'));

  let buyPriceIdx = headers.findIndex(h => h === 'قیمت خرید' || h === 'قیمت خرید (ریال)' || h === 'قیمت خرید(ریال)' || h === 'نرخ خرید');
  if (buyPriceIdx === -1) buyPriceIdx = headers.findIndex(h => h.includes('خرید'));

  let consumerPriceIdx = headers.findIndex(h => h === 'قیمت مصرف' || h === 'قیمت مصرف کننده');
  if (consumerPriceIdx === -1) consumerPriceIdx = headers.findIndex(h => h.includes('مصرف'));

  let packingIdx = headers.findIndex(h => h.includes('کارتن') || h.includes('بسته') || h.includes('تعداد در'));

  if (codeIdx === -1) codeIdx = 0;
  if (nameIdx === -1) nameIdx = 1;
  if (stockIdx === -1) stockIdx = 4; // Column E (index 4)
  if (deliveryPriceIdx === -1) deliveryPriceIdx = 7;
  if (buyPriceIdx === -1) buyPriceIdx = 6;
  if (consumerPriceIdx === -1) consumerPriceIdx = 9;
  if (packingIdx === -1) packingIdx = 5;

  return { codeIdx, nameIdx, brandIdx, stockIdx, deliveryPriceIdx, buyPriceIdx, consumerPriceIdx, packingIdx };
}

async function syncGoogleSheets() {
  console.log('Fetching Google Sheet data from:', CSV_URL);
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();

    if (csvText.includes('<!DOCTYPE html>') || csvText.includes('show-login-page')) {
      throw new Error('Google Sheet is not public. Please set access to "Anyone with the link can view".');
    }

    const wb = XLSX.read(csvText, { type: 'string' });
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

    if (rows.length < 2) {
      throw new Error('No product data rows found in Google Sheet.');
    }

    let scraped = [];
    const scrapedPath = path.join(__dirname, 'scraped_rafooneh.json');
    if (fs.existsSync(scrapedPath)) {
      scraped = JSON.parse(fs.readFileSync(scrapedPath, 'utf8'));
    }

    const { codeIdx, nameIdx, brandIdx, stockIdx, deliveryPriceIdx, buyPriceIdx, consumerPriceIdx, packingIdx } = findColumnIndices(rows[0]);

    const products = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r[codeIdx] === undefined || !r[nameIdx]) continue;

      const code = String(r[codeIdx]).trim();
      const name = String(r[nameIdx]).trim();
      const rawBrand = brandIdx !== -1 && r[brandIdx] ? String(r[brandIdx]).trim() : '';
      const brandObj = determineBrand(name, rawBrand);
      const stock = parseNum(r[stockIdx]) || parseNum(r[4]) || 0;
      const deliveryPrice = Math.round(parseNum(r[deliveryPriceIdx]) || parseNum(r[7]) || parseNum(r[10]) || parseNum(r[8]) || parseNum(r[2]) || 0);
      const buyPrice = Math.round(parseNum(r[buyPriceIdx]) || parseNum(r[6]) || 0);
      const consumerPrice = Math.round(parseNum(r[consumerPriceIdx]) || parseNum(r[9]) || parseNum(r[3]) || 0);
      const packing = parseNum(r[packingIdx]) || parseNum(r[5]) || 1;

      const cat = categorize(name);
      const cleanName = name.replace(/[0-9]/g, '');
      const words = cleanName.split(' ').filter(w => w.length >= 3 && !['مایع', 'کیلویی', 'گرمی', 'لیتری', 'عدد', 'برند'].includes(w));

      let bestImg = null;
      let maxScore = 0;
      for (const s of scraped) {
        let score = 0;
        for (const w of words) {
          if (s.title.includes(w)) score += 2;
        }
        const colors = ['سبز', 'نارنجی', 'صورتی', 'بنفش', 'آبی', 'زرد', 'کرمی', 'قرمز', 'سفید'];
        for (const c of colors) {
          if (name.includes(c) && s.title.includes(c)) score += 3;
        }
        if (score > maxScore) {
          maxScore = score;
          bestImg = s.src;
        }
      }

      if (!bestImg || maxScore < 2) {
        bestImg = categoryDefaultImages[cat.id] || categoryDefaultImages.other;
      }

      const badge = stock <= 0 ? 'ناموجود' : (stock <= 5 ? `تعداد محدود (${stock} عدد)` : null);

      const categoryDescriptions = {
        handwash: 'مایع دستشویی رافونه با فرمولاسیون نرم‌کننده و مرطوب‌کننده پوست دست، دارای رایحه مطبوع و سازگار با انواع پوست بدون ایجاد خشکی و حساسیت.',
        dishwash: 'مایع ظرفشویی رافونه غلیظ و با قدرت چربی‌زدایی فوق‌العاده بالا، درخشان‌کننده ظروف، دارای گلیسیرین جهت محافظت از پوست دست.',
        laundry: 'شوینده لباس رافونه محافظ بافت و رنگ پارچه، مانع از بور شدن و کدری لباس‌ها با رایحه ماندگار و قدرت لکه‌بری عالی.',
        cleaners: 'پاک‌کننده و اسپری چندمنظوره رافونه تمیزکننده سریع و آسان سطوح، چربی‌زدای قوی بدون برجا گذاشتن لکه و رد آب.',
        sanitary: 'جرم‌گیر و ضدعفونی‌کننده رافونه از بین برنده ۹۹.۹٪ باکتری‌ها و جرم‌های سرسخت، درخشان‌کننده سرویس بهداشتی و کاشی.',
        home: 'شامپو فرش و موکت رافونه تمیزکننده عمقی الیاف فرش و مبلمان، احیاکننده رنگ و بدون آسیب به بافت فرش.',
        cellulosic: 'محصولات مصرفی و سلولزی رافونه تهیه شده از مواد اولیه مرغوب و بهداشتی، مقاوم و با دوام بالا برای مصارف روزمره خانه.',
        car: 'شوینده خودرو رافونه ایجادکننده لایه محافظ و براق‌کننده بدنه خودرو، چربی‌زدای قوی بدون آسیب به رنگ بدنه.',
        other: 'محصول باکیفیت و استاندارد رافونه تولید شده با بهترین مواد اولیه و فرمولاسیون تخصصی.'
      };

      const desc = categoryDescriptions[cat.id] || categoryDescriptions.other;

      products.push({
        id: code,
        name: name,
        brand: brandObj.id,
        brandName: brandObj.name,
        category: cat.id,
        categoryName: cat.name,
        price: deliveryPrice,
        consumerPrice: consumerPrice,
        buyPrice: buyPrice,
        packing: packing,
        stock: stock,
        image: bestImg,
        badge: badge,
        description: desc
      });
    }

    fs.writeFileSync(path.join(__dirname, 'products_data.json'), JSON.stringify(products, null, 2));
    fs.writeFileSync(path.join(__dirname, 'products_data.js'), `const productsData = ${JSON.stringify(products, null, 2)};\n`);

    console.log(`✅ Google Sheet successfully synced! ${products.length} products written to products_data.json and products_data.js.`);
  } catch (err) {
    console.error('❌ Error syncing Google Sheet:', err.message);
  }
}

syncGoogleSheets();
