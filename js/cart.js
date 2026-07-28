// js/cart.js
let cart = [];

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    
    updateCartUI();
    alert(`${product.name} به سبد خرید اضافه شد.`);
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartUI();
}

function getTotalPrice() {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

function sendToWhatsApp() {
    if (cart.length === 0) {
        alert("سبد خرید خالی است!");
        return;
    }

    let message = "سلام، سفارش جدید:\n\n";
    cart.forEach((item, index) => {
        message += `${index + 1}. ${item.name} - تعداد: ${item.quantity} - قیمت واحد: ${formatPrice(item.price)}\n`;
    });
    
    const total = getTotalPrice();
    message += `\nمجموع کل: ${formatPrice(total)} ریال\n`;
    message += "\nلطفاً فاکتور نهایی و شماره کارت را ارسال کنید.";

    const phoneNumber = "9027959555";
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    // باز کردن واتساپ
    window.open(url, '_blank');
    
    // خالی کردن سبد بعد از ارسال (اختیاری)
    // cart = [];
    // updateCartUI();
    // closeModal();
}

function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');

    // آپدیت آیکون سبد
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.innerText = totalCount;

    // آپدیت لیست داخل مودال
    cartItemsContainer.innerHTML = '';
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p>سبد خرید خالی است.</p>';
        cartTotal.innerText = '0';
        return;
    }

    cart.forEach(item => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div>
                <strong>${item.name}</strong><br>
                <small>${item.quantity} x ${formatPrice(item.price)}</small>
            </div>
            <button onclick="removeFromCart(${item.id})" style="background:red; color:white; border:none; padding:5px; border-radius:3px; cursor:pointer;">حذف</button>
        `;
        cartItemsContainer.appendChild(div);
    });

    cartTotal.innerText = formatPrice(getTotalPrice());
}

function openModal() {
    document.getElementById('cartModal').style.display = 'flex';
    updateCartUI();
}

function closeModal() {
    document.getElementById('cartModal').style.display = 'none';
}