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
import { createRequire } from 'module';

let db = null;

export function getFirestoreDb() {
  if (db) return db;
  try {
    let config = null;

    try {
      const req = createRequire(import.meta.url);
      config = req('../firebase-applet-config.json');
    } catch (e) {
      // Ignore if require fails
    }

    if (!config) {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    }

    if (!config) {
      console.warn('[Firestore] firebase-applet-config.json not found');
      return null;
    }

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

function handleFirestoreError(action, err) {
  const msg = err && err.message ? err.message : String(err);
  if (msg.includes('Quota limit exceeded') || msg.includes('Quota exceeded')) {
    console.warn(`[Firestore] Quota limit exceeded on ${action}. Gracefully falling back.`);
  } else {
    console.error(`[Firestore] Error ${action}:`, msg);
  }
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
    handleFirestoreError('getting products', err);
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
    handleFirestoreError('saving product', err);
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
    handleFirestoreError('saving all products', err);
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
    handleFirestoreError('deleting product', err);
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
    handleFirestoreError('getting orders', err);
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
    handleFirestoreError('saving order', err);
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
    handleFirestoreError('deleting order', err);
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
    handleFirestoreError('getting customers', err);
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
    handleFirestoreError('saving customer', err);
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
    handleFirestoreError('deleting customer', err);
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
    handleFirestoreError('getting company payments', err);
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
    handleFirestoreError('saving company payment', err);
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
    handleFirestoreError('deleting company payment', err);
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
    handleFirestoreError('getting purchases', err);
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
    handleFirestoreError('saving purchase', err);
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
    handleFirestoreError('deleting purchase', err);
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
    handleFirestoreError('getting admin auth config', err);
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
    handleFirestoreError('saving admin auth config', err);
    return false;
  }
}

// --- DELIVERY SETTINGS ---
export async function getDeliverySettingsFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const docRef = doc(database, 'config', 'delivery');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (err) {
    handleFirestoreError('getting delivery settings', err);
    return null;
  }
}

export async function saveDeliverySettingsToFirestore(settingObj) {
  const database = getFirestoreDb();
  if (!database || !settingObj) return false;
  try {
    const docRef = doc(database, 'config', 'delivery');
    await setDoc(docRef, settingObj, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError('saving delivery settings', err);
    return false;
  }
}

// --- GIFT SETTINGS ---
export async function getGiftSettingsFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const docRef = doc(database, 'config', 'gifts');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (err) {
    handleFirestoreError('getting gift settings', err);
    return null;
  }
}

export async function saveGiftSettingsToFirestore(settingObj) {
  const database = getFirestoreDb();
  if (!database || !settingObj) return false;
  try {
    const docRef = doc(database, 'config', 'gifts');
    await setDoc(docRef, settingObj, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError('saving gift settings', err);
    return false;
  }
}

// --- PACKAGES ---
export async function getPackagesFromFirestore() {
  const database = getFirestoreDb();
  if (!database) return null;
  try {
    const snap = await getDocs(collection(database, 'packages'));
    if (snap.empty) return null;
    const packages = [];
    snap.forEach(d => packages.push(docToData(d)));
    return packages;
  } catch (err) {
    handleFirestoreError('getting packages', err);
    return null;
  }
}

export async function savePackageToFirestore(pkgObj) {
  const database = getFirestoreDb();
  if (!database || !pkgObj || !pkgObj.id) return false;
  try {
    const docRef = doc(database, 'packages', String(pkgObj.id));
    await setDoc(docRef, pkgObj, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError('saving package', err);
    return false;
  }
}

export async function deletePackageFromFirestore(id) {
  const database = getFirestoreDb();
  if (!database || !id) return false;
  try {
    await deleteDoc(doc(database, 'packages', String(id)));
    return true;
  } catch (err) {
    handleFirestoreError('deleting package', err);
    return false;
  }
}

