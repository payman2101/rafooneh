import serverless from 'serverless-http';
// اگر فایل شما netlify/functions/api/index.js است، مسیر باید ../../server.js باشد
// اگر فایل شما netlify/functions/api.js است، مسیر باید ../server.js باشد
import app from '../../server.js'; 

const serverlessHandler = serverless(app);

// Netlify فقط export با نام handler را میشناسد
export const handler = async (event, context) => {
  return await serverlessHandler(event, context);
};
