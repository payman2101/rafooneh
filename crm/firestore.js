import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let db = null;

export function getFirestoreDb() {
  if (db) return db;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.warn('[Firestore] firebase-applet-config.json not found');
      return null;
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    const databaseId = config.firestoreDatabaseId || '(default)';
    db = getFirestore(app, databaseId);
    return db;
  } catch (err) {
    console.error('[Firestore] Initialization error:', err.message);
    return null;
  }
}

// Helper: Convert document to JS object
function docToData(d) {
  return { id: d.id, ...d.data() };
}

// --- PRODUCTS ---
export async function getProductsFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const snap = await getDocs(collection(database, 'products'));
    if (snap.empty) return null;
    const products = [];
    snap.forEach(d => products.push(docToData(d)));
    return products;
  } catch (err) {
    console.error('[Firestore] Error getting products:', err.message);
    return null;
  }
}

export async function saveProductToFirestore(product) {
  const database = getFirestoreDb();
  if (!database || !product || !product.id) return false;
  try {
    const docRef = doc(database, 'products', String(product.id));
    await setDoc(docRef, product, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firestore] Error saving product:', err.message);
    return false;
  }
}

export async function saveAllProductsToFirestore(productsList) {
  const database = getFirestoreDb();
  if (!database || !Array.isArray(productsList)) return false;
  try {
    // Firestore batch limit is 500 writes
    const chunkSize = 400;
    for (let i = 0; i < productsList.length; i += chunkSize) {
      const chunk = productsList.slice(i, i + chunkSize);
      const batch = writeBatch(database);
      chunk.forEach(prod => {
        if (prod && prod.id) {
          const docRef = doc(database, 'products', String(prod.id));
          batch.set(docRef, prod, { merge: true });
        }
      });
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.error('[Firestore] Error saving all products:', err.message);
    return false;
  }
}

export async function deleteProductFromFirestore(id) {
  const database = getFirestoreDb();
  if (!database || !id) return false;
  try {
    await deleteDoc(doc(database, 'products', String(id)));
    return true;
  } catch (err) {
    console.error('[Firestore] Error deleting product:', err.message);
    return false;
  }
}

// --- ORDERS ---
export async function getOrdersFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const snap = await getDocs(collection(database, 'orders'));
    const orders = [];
    snap.forEach(d => orders.push(docToData(d)));
    return orders;
  } catch (err) {
    console.error('[Firestore] Error getting orders:', err.message);
    return null;
  }
}

export async function saveOrderToFirestore(order) {
  const database = getFirestoreDb();
  if (!database || !order || !order.id) return false;
  try {
    await setDoc(doc(database, 'orders', String(order.id)), order, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firestore] Error saving order:', err.message);
    return false;
  }
}

export async function deleteOrderFromFirestore(id) {
  const database = getFirestoreDb();
  if (!database || !id) return false;
  try {
    await deleteDoc(doc(database, 'orders', String(id)));
    return true;
  } catch (err) {
    console.error('[Firestore] Error deleting order:', err.message);
    return false;
  }
}

// --- CUSTOMERS ---
export async function getCustomersFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const snap = await getDocs(collection(database, 'customers'));
    const customers = [];
    snap.forEach(d => customers.push(docToData(d)));
    return customers;
  } catch (err) {
    console.error('[Firestore] Error getting customers:', err.message);
    return null;
  }
}

export async function saveCustomerToFirestore(customer) {
  const database = getFirestoreDb();
  if (!database || !customer || !customer.id) return false;
  try {
    await setDoc(doc(database, 'customers', String(customer.id)), customer, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firestore] Error saving customer:', err.message);
    return false;
  }
}

export async function deleteCustomerFromFirestore(id) {
  const database = getFirestoreDb();
  if (!database || !id) return false;
  try {
    await deleteDoc(doc(database, 'customers', String(id)));
    return true;
  } catch (err) {
    console.error('[Firestore] Error deleting customer:', err.message);
    return false;
  }
}

// --- COMPANY PAYMENTS ---
export async function getCompanyPaymentsFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const snap = await getDocs(collection(database, 'company_payments'));
    const payments = [];
    snap.forEach(d => payments.push(docToData(d)));
    return payments;
  } catch (err) {
    console.error('[Firestore] Error getting company payments:', err.message);
    return null;
  }
}

export async function saveCompanyPaymentToFirestore(payment) {
  const database = getFirestoreDb();
  if (!database || !payment || !payment.id) return false;
  try {
    await setDoc(doc(database, 'company_payments', String(payment.id)), payment, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firestore] Error saving company payment:', err.message);
    return false;
  }
}

export async function deleteCompanyPaymentFromFirestore(id) {
  const database = getFirestoreDb();
  if (!database || !id) return false;
  try {
    await deleteDoc(doc(database, 'company_payments', String(id)));
    return true;
  } catch (err) {
    console.error('[Firestore] Error deleting company payment:', err.message);
    return false;
  }
}

// --- PURCHASES ---
export async function getPurchasesFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const snap = await getDocs(collection(database, 'purchases'));
    const purchases = [];
    snap.forEach(d => purchases.push(docToData(d)));
    return purchases;
  } catch (err) {
    console.error('[Firestore] Error getting purchases:', err.message);
    return null;
  }
}

export async function savePurchaseToFirestore(purchase) {
  const database = getFirestoreDb();
  if (!database || !purchase || !purchase.id) return false;
  try {
    await setDoc(doc(database, 'purchases', String(purchase.id)), purchase, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firestore] Error saving purchase:', err.message);
    return false;
  }
}

export async function deletePurchaseFromFirestore(id) {
  const database = getFirestoreDb();
  if (!database || !id) return false;
  try {
    await deleteDoc(doc(database, 'purchases', String(id)));
    return true;
  } catch (err) {
    console.error('[Firestore] Error deleting purchase:', err.message);
    return false;
  }
}

// --- ADMIN AUTH CONFIG ---
export async function getAdminAuthConfigFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const docRef = doc(database, 'config', 'auth');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (err) {
    console.error('[Firestore] Error getting admin auth config:', err.message);
    return null;
  }
}

export async function saveAdminAuthConfigToFirestore(configData) {
  const database = getFirestoreDb();
  if (!database) return false;
  try {
    const docRef = doc(database, 'config', 'auth');
    await setDoc(docRef, configData, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firestore] Error saving admin auth config:', err.message);
    return false;
  }
}
