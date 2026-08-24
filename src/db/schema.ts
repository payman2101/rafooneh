import { pgTable, text, integer, doublePrecision, boolean } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  code: text('code'),
  name: text('name').notNull(),
  brand: text('brand'),
  brandName: text('brand_name'),
  category: text('category'),
  categoryName: text('category_name'),
  price: doublePrecision('price').default(0),
  consumerPrice: doublePrecision('consumer_price').default(0),
  newPrice: doublePrecision('new_price').default(0),
  buyPrice: doublePrecision('buy_price').default(0),
  packing: integer('packing').default(1),
  stock: integer('stock').default(0),
  image: text('image'),
  badge: text('badge'),
  description: text('description'),
  isCustomized: boolean('is_customized').default(false),
  updatedAt: text('updated_at'),
});

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  address: text('address'),
  walletBalance: doublePrecision('wallet_balance').default(0),
  giftCredit: doublePrecision('gift_credit').default(0),
  passwordHash: text('password_hash'),
  walletHistory: text('wallet_history'),
  totalOrders: integer('total_orders').default(0),
  totalSpent: doublePrecision('total_spent').default(0),
  notes: text('notes'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  lastOrderAt: text('last_order_at'),
});

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  phone: text('phone'),
  address: text('address'),
  note: text('note'),
  items: text('items'),
  totalAmount: doublePrecision('total_amount').default(0),
  paymentMethod: text('payment_method'),
  status: text('status').default('new'),
  adminNotes: text('admin_notes'),
  source: text('source').default('website'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const companyPayments = pgTable('company_payments', {
  id: text('id').primaryKey(),
  paymentDate: text('payment_date'),
  fromDate: text('from_date'),
  toDate: text('to_date'),
  totalBuyCost: doublePrecision('total_buy_cost').default(0),
  totalItemsCount: integer('total_items_count').default(0),
  ordersCount: integer('orders_count').default(0),
  refNumber: text('ref_number'),
  notes: text('notes'),
  status: text('status'),
  items: text('items'),
  createdAt: text('created_at'),
});

export const purchases = pgTable('purchases', {
  id: text('id').primaryKey(),
  refNumber: text('ref_number'),
  supplierName: text('supplier_name'),
  purchaseDate: text('purchase_date'),
  totalAmount: doublePrecision('total_amount').default(0),
  totalItemsCount: integer('total_items_count').default(0),
  notes: text('notes'),
  items: text('items'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at'),
});

export const bankSettings = pgTable('bank_settings', {
  id: text('id').primaryKey(),
  bankName: text('bank_name'),
  cardHolder: text('card_holder'),
  cardNumber: text('card_number'),
  shabaNumber: text('shaba_number'),
  accountNumber: text('account_number'),
  description: text('description'),
  updatedAt: text('updated_at'),
});

