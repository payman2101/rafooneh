import serverless from 'serverless-http';
import app from '../../server.js';

export const handler = serverless(app, {
  request: (request, event, context) => {
    if (request.url && request.url.startsWith('/.netlify/functions/api')) {
      request.url = request.url.replace(/^\/\.netlify\/functions\/api/, '');
      if (!request.url.startsWith('/api')) {
        request.url = '/api' + request.url;
      }
    }
  }
});
