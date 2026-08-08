import serverless from 'serverless-http';
import app from '../../server.js';
const serverlessHandler = serverless(app);
export const handler = async (event, context) => {
return await serverlessHandler(event, context);
};
