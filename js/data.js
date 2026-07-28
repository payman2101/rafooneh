// data.js
const products = [
    // نمونه‌ای از داده‌ها - در صورت نیاز لیست کامل را جایگزین کنید
    { id: 1, name: "مایع دست کرمی ۱ لیتری", price: 45000, stock: 0, category: "شوینده" },
    { id: 2, name: "اسپری شیرآلات و سینک ۵۰۰", price: 38000, stock: 2, category: "شوینده" },
    { id: 3, name: "چندمنظوره آنتی باکتریال", price: 42000, stock: 0, category: "شوینده" },
    { id: 4, name: "سفیدکننده ۲ لیتری", price: 25000, stock: 12, category: "شوینده" },
    { id: 5, name: "شامپو Head & Shoulders", price: 180000, stock: 1, category: "بهداشت فردی" },
    { id: 6, name: "قرص ماشین ظرفشویی Fairy", price: 350000, stock: 0, category: "شوینده" },
    { id: 7, name: "صابون لوکس گل رز", price: 15000, stock: 4, category: "بهداشت فردی" },
    { id: 8, name: "دستمال آشپزخانه", price: 22000, stock: 50, category: "آشپزخانه" },
    { id: 9, name: "پودر لباسشویی ۳ کیلویی", price: 120000, stock: 8, category: "لباسشویی" },
    { id: 10, name: "نرم کننده لباس ۱ لیتری", price: 45000, stock: 3, category: "لباسشویی" }
    // ... سایر اقلام از اکسل را می‌توان اینجا اضافه کرد
];

// فرمت کردن قیمت به تومان/ریال
function formatPrice(price) {
    return new Intl.NumberFormat('fa-IR').format(price) + ' ریال';
}