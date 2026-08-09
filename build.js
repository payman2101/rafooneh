import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const filesToCopy = [
  'index.html',
  'admin.html',
  '_redirects',
  'products_data.js',
  'products_data.json',
  'company_payments.json',
  'customers.json',
  'orders.json',
  'excel_products.json'
];

filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to public/`);
  }
});

const dirsToCopy = ['data', 'css', 'js', 'crm'];
dirsToCopy.forEach(dir => {
  const src = path.join(rootDir, dir);
  const dest = path.join(publicDir, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`Copied directory ${dir} to public/`);
  }
});

console.log('✅ Build completed successfully for Cloudflare Pages!');
