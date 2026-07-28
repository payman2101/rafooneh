// app.js
let cart = [];

document.addEventListener('DOMContentLoaded', () => {
    renderProducts();
    updateCartIcon();
    
    document.getElementById('cartModalClose').addEventListener('click', () => {
        document.getElementById('cartModal').style.display = 'none';
    });
    
    document.getElementById('paymentModalClose').addEventListener('click', () => {
        document.getElementById('paymentModal').style.display = 'none';
    });

    document.getElementById('checkoutBtn').addEventListener('click', showPayment);
    document.getElementById('confirmPaymentBtn').addEventListener('click', processPayment);
});

function renderProducts() {
    const container = document.getElementById('products-container');
    container.innerHTML = '';

    products.forEach(product => {
        const isLowStock = product.stock < 5;
        const stockText = isLowStock ? `<span class="low-stock">موجودی کم (${product.stock})</span>` : `موجودی: ${product.stock}`;
        const disabledAttr = product.stock === 0 ? 'disabled' : '';
        const btnText = product.stock === 0 ? 'ناموجود' : 'افزودن به سبد';

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div>
                <div class="product-name">${product.name}</div>
                <div class="product-price">${formatPrice(product.price)}</div>
                <div class="stock-status">${stockText}</div>
            </div>
            <button class="add-btn" onclick="addToCart(${product.id})" ${disabledAttr}>${btnText}</button>
        `;
        container.appendChild(card);
    });
}

function addToCart(id) {
    const product = products.find(p => p.id === id);
    const existingItem = cart.find(item => item.id === id);

    if (existingItem) {
        if (existingItem.quantity < product.stock) {
            existingItem.quantity++;
        } else {
            alert('موجودی کافی نیست');
            return;
        }
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    
    updateCartIcon();
    alert('به سبد خرید اضافه شد');
}

function updateCartIcon() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').innerText = count;
}

function openCart() {
    const modal = document.getElementById('cartModal');
    const list = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    
    list.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        list.innerHTML = '<p>سبد خرید خالی است</p>';
    } else {
        cart.forEach((item, index) => {
            total += item.price * item.quantity;
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <span>${item.name} (${item.quantity})</span>
                <span>${formatPrice(item.price * item.quantity)} 
                <button onclick="removeFromCart(${index})" style="color:red;border:none;background:none;cursor:pointer;margin-right:5px;">×</button></span>
            `;
            list.appendChild(div);
        });
    }

    totalEl.innerText = `جمع کل: ${formatPrice(total)}`;
    modal.style.display = 'flex';
}

function removeFromCart(index) {
    cart.splice(index, 1);
    openCart(); // Re-render
    updateCartIcon();
}

function showPayment() {
    if (cart.length === 0) return alert('سبد خرید خالی است');
    document.getElementById('cartModal').style.display = 'none';
    document.getElementById('paymentModal').style.display = 'flex';
}

function processPayment() {
    const name = document.getElementById('customerName').value;
    const address = document.getElementById('customerAddress').value;
    
    if (!name || !address) {
        alert('لطفاً نام و آدرس را وارد کنید');
        return;
    }

    // شبیه‌سازی پردازش پرداخت
    const btn = document.getElementById('confirmPaymentBtn');
    btn.innerText = 'در حال پردازش...';
    btn.disabled = true;

    setTimeout(() => {
        sendToWhatsApp(name, address);
        btn.innerText = 'پرداخت موفق';
        setTimeout(() => {
            cart = [];
            updateCartIcon();
            document.getElementById('paymentModal').style.display = 'none';
            btn.innerText = 'تأیید و پرداخت';
            btn.disabled = false;
            document.getElementById('customerName').value = '';
            document.getElementById('customerAddress').value = '';
            alert('سفارش شما با موفقیت ثبت و به واتساپ ارسال شد.');
        }, 1000);
    }, 1500);
}

function sendToWhatsApp(name, address) {
    let message = `*سفارش جدید*\n`;
    message += `نام مشتری: ${name}\n`;
    message += `آدرس: ${address}\n\n`;
    message += `*اقلام:*\n`;
    
    let total = 0;
    cart.forEach(item => {
        message += `- ${item.name} (${item.quantity}) - ${formatPrice(item.price * item.quantity)}\n`;
        total += item.price * item.quantity;
    });
    
    message += `\n*جمع کل: ${formatPrice(total)}*`;

    const phone = '9027959555';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    
    window.open(url, '_blank');
}