import serverless from 'serverless-http';
// توجه: چون فایل در netlify/functions/api.js است، برای رسیدن به ریشه باید دو مرحله بالا برویم
import app from '../../server.js'; 

// تبدیل برنامه اکسپرس به هندلر سرورلس
const serverlessHandler = serverless(app);

// نتلیفای فقط و فقط export با نام handler را میشناسد
export const handler = async (event, context) => {
  return await serverlessHandler(event, context);
};
