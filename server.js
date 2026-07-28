import express from 'express';
import fileUpload from 'express-fileupload';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(__dirname));

// Function to process Excel file 'سفارش 1405.xlsx' automatically on save/change
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

function parseExcelAndBuildProducts() {
  try {
    const excelPath = path.join(__dirname, 'سفارش 1405.xlsx');
    if (!fs.existsSync(excelPath)) {
      console.log('[Excel Watcher] File سفارش 1405.xlsx does not exist.');
      return null;
    }

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0] || 'سفارش 1';
    const sheet = workbook.Sheets[sheetName];
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

    let scraped = [];
    const scrapedPath = path.join(__dirname, 'scraped_rafooneh.json');
    if (fs.existsSync(scrapedPath)) {
      scraped = JSON.parse(fs.readFileSync(scrapedPath, 'utf8'));
    }

    const result = excelProducts.map(p => {
      const cat = categorize(p.name);
      const cleanName = p.name.replace(/[0-9]/g, '');
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
          if (p.name.includes(c) && s.title.includes(c)) score += 3;
        }

        if (score > maxScore) {
          maxScore = score;
          bestImg = s.src;
        }
      }

      if (!bestImg || maxScore < 2) {
        bestImg = categoryDefaultImages[cat.id] || categoryDefaultImages.other;
      }

      return {
        id: p.code,
        name: p.name,
        category: cat.id,
        categoryName: cat.name,
        price: p.deliveryPrice,
        consumerPrice: p.consumerPrice,
        packing: p.packing,
        image: bestImg,
        badge: p.packing > 1 ? `کارتن ${p.packing} تایی` : 'تحویل مستقیم',
        description: `محصول اصلی رافونه با کیفیت عالی - ${p.name}. تحویل درب منزل با قیمت اختصاصی تحویل.`
      };
    });

    fs.writeFileSync(path.join(__dirname, 'products_data.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(__dirname, 'products_data.js'), `const productsData = ${JSON.stringify(result, null, 2)};\n`);
    console.log(`[Excel Watcher] Automatically processed ${result.length} products from Excel.`);
    return result;
  } catch (err) {
    console.error('[Excel Watcher] Error processing Excel file:', err);
    return null;
  }
}

// Initial parse on server start
parseExcelAndBuildProducts();

// Setup file watcher on 'سفارش 1405.xlsx'
const excelFilePath = path.join(__dirname, 'سفارش 1405.xlsx');
let watchDebounce = null;
if (fs.existsSync(excelFilePath)) {
  fs.watch(excelFilePath, (eventType) => {
    if (eventType === 'change' || eventType === 'rename') {
      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        console.log('[Excel Watcher] Detected Excel file modification. Auto-updating products...');
        parseExcelAndBuildProducts();
      }, 500);
    }
  });
}

// API: Get live products dataset
app.get('/api/products', (req, res) => {
  try {
    const jsonPath = path.join(__dirname, 'products_data.json');
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return res.json({ success: true, count: data.length, products: data });
    }
    res.json({ success: true, count: 0, products: [] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست محصولات' });
  }
});

// API: Google Sheets Sync - Parse spreadsheet data and update products catalog
app.post('/api/gsheets/sync', async (req, res) => {
  try {
    const { spreadsheetId, accessToken, range = 'Sheet1!A1:Z100' } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ success: false, message: 'آیدی گوگل شیت (Spreadsheet ID) ارسال نشده است.' });
    }

    // Call Google Sheets API v4
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        message: 'خطا در دریافت اطلاعات از گوگل شیت. لطفا دسترسی و آیدی شیت را بررسی کنید.',
        details: errText
      });
    }

    const data = await response.json();
    const rows = data.values || [];
    if (rows.length < 2) {
      return res.status(400).json({ success: false, message: 'گوگل شیت موردنظر اطلاعات کافی یا ردیف محصول ندارد.' });
    }

    // Process rows into products format
    let scraped = [];
    const scrapedPath = path.join(__dirname, 'scraped_rafooneh.json');
    if (fs.existsSync(scrapedPath)) {
      scraped = JSON.parse(fs.readFileSync(scrapedPath, 'utf8'));
    }

    const sheetProducts = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0] || !r[1]) continue;

      const code = String(r[0]).trim();
      const name = String(r[1]).trim();
      const deliveryPrice = Number(r[10] || r[8] || r[9] || r[2] || 0);
      const consumerPrice = Number(r[9] || r[3] || 0);
      const packing = Number(r[5] || r[4] || 1);

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

      sheetProducts.push({
        id: code,
        name: name,
        category: cat.id,
        categoryName: cat.name,
        price: deliveryPrice,
        consumerPrice: consumerPrice,
        packing: packing,
        image: bestImg,
        badge: packing > 1 ? `کارتن ${packing} تایی` : 'تحویل مستقیم',
        description: `محصول اصلی رافونه - ${name}. دریافت مستقیم از گوگل شیت.`
      });
    }

    if (sheetProducts.length > 0) {
      fs.writeFileSync(path.join(__dirname, 'products_data.json'), JSON.stringify(sheetProducts, null, 2));
      fs.writeFileSync(path.join(__dirname, 'products_data.js'), `const productsData = ${JSON.stringify(sheetProducts, null, 2)};\n`);
      return res.json({
        success: true,
        message: `موفقیت‌آمیز! ${sheetProducts.length} محصول با موفقیت از گوگل شیت همگام‌سازی شد.`,
        count: sheetProducts.length,
        products: sheetProducts
      });
    }

    res.status(400).json({ success: false, message: 'هیچ ردیف معتبری در فایل گوگل شیت یافت نشد.' });
  } catch (err) {
    console.error('Google Sheets sync error:', err);
    res.status(500).json({ success: false, message: 'خطای داخلی در همگام‌سازی گوگل شیت' });
  }
});

// API: Upload Excel and refresh product database
app.post('/api/upload-excel', (req, res) => {
  try {
    if (!req.files || !req.files.excelFile) {
      return res.status(400).json({ success: false, message: 'لطفاً فایل اکسل را انتخاب کنید' });
    }

    const excelFile = req.files.excelFile;
    const savePath = path.join(__dirname, 'سفارش 1405.xlsx');

    excelFile.mv(savePath, (err) => {
      if (err) {
        console.error('File save error:', err);
        return res.status(500).json({ success: false, message: 'خطا در ذخیره فایل اکسل' });
      }

      const products = parseExcelAndBuildProducts();
      if (products) {
        res.json({ success: true, message: 'فایل اکسل به‌روزرسانی شد و محصولات و قیمت‌ها به‌صورت خودکار اعمال گردیدند.' });
      } else {
        res.status(500).json({ success: false, message: 'فایل آپلود شد اما در پردازش داده‌ها خطایی رخ داد.' });
      }
    });
  } catch (err) {
    console.error('Upload endpoint error:', err);
    res.status(500).json({ success: false, message: 'خطای سرور در آپلود فایل' });
  }
});

// Store active transactions in memory
const transactions = new Map();

// API: Initiate Payment Request
app.post('/api/payment/request', (e, res) => {
  const { amount, customerName, phone, address, note, items } = e.body || {};

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'مبلغ سفارش معتبر نیست' });
  }

  const trackingId = 'REF-' + Math.floor(100000000000 + Math.random() * 900000000000);
  const authority = 'A000000000000000000000000000' + Math.floor(1000 + Math.random() * 9000);

  const paymentData = {
    trackingId,
    authority,
    amount: Number(amount),
    customerName,
    phone,
    address,
    note,
    items,
    createdAt: new Date().toISOString(),
    status: 'PENDING'
  };

  transactions.set(authority, paymentData);

  res.json({
    success: true,
    authority,
    trackingId,
    amount: Number(amount),
    paymentUrl: `/#/payment-gateway?authority=${authority}`
  });
});

// API: Verify Payment
app.post('/api/payment/verify', (req, res) => {
  const { authority, cardNumber } = req.body || {};

  if (!authority || !transactions.has(authority)) {
    return res.status(400).json({ success: false, message: 'تراکنش یافت نشد یا منقضی شده است' });
  }

  const tx = transactions.get(authority);
  tx.status = 'SUCCESS';
  tx.paidAt = new Date().toISOString();
  tx.maskedCard = cardNumber ? cardNumber.replace(/(\d{4})\d{8}(\d{4})/, '$1-****-****-$2') : '6037-****-****-1405';
  tx.refNum = Math.floor(100000000000 + Math.random() * 900000000000).toString();

  transactions.set(authority, tx);

  res.json({
    success: true,
    message: 'پرداخت با موفقیت انجام شد',
    transaction: tx
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

