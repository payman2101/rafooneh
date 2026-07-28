import fs from 'fs';

const scraped = JSON.parse(fs.readFileSync('scraped_rafooneh.json'));
const excel = JSON.parse(fs.readFileSync('excel_products.json'));

console.log('Scraped total:', scraped.length);
console.log('Excel total:', excel.length);

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

// Category fallback default images from rafooneh catalog
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

const result = excel.map(p => {
  const cat = categorize(p.name);
  
  // Clean product name for matching
  const cleanName = p.name.replace(/[0-9]/g, '');
  const words = cleanName.split(' ').filter(w => w.length >= 3 && !['مایع', 'کیلویی', 'گرمی', 'لیتری', 'عدد', 'برند'].includes(w));
  
  let bestImg = null;
  let maxScore = 0;

  for (const s of scraped) {
    let score = 0;
    for (const w of words) {
      if (s.title.includes(w)) score += 2;
    }
    // Color match bonus
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

  return {
    id: p.code,
    name: p.name,
    category: cat.id,
    categoryName: cat.name,
    price: p.deliveryPrice, // قیمت تحویل
    consumerPrice: p.consumerPrice, // قیمت مصرف
    packing: p.packing,
    stock: p.stock || 0,
    image: bestImg,
    badge: (p.stock || 0) <= 0 ? 'ناموجود' : ((p.stock || 0) <= 5 ? `تعداد محدود (${p.stock} عدد)` : (p.packing > 1 ? `کارتن ${p.packing} تایی` : null)),
    description: desc
  };
});

console.log('Processed total products:', result.length);
console.log('Sample item:', result[0]);

fs.writeFileSync('products_data.json', JSON.stringify(result, null, 2));

// Generate products.js JS file for easy inclusion in index.html
const jsContent = `const productsData = ${JSON.stringify(result, null, 2)};\n`;
fs.writeFileSync('products_data.js', jsContent);
