import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SQL_HOST) {
    const user = encodeURIComponent(process.env.SQL_ADMIN_USER || process.env.SQL_USER || 'ai_studio_admin');
    const pass = encodeURIComponent(process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || '');
    const db = process.env.SQL_DB_NAME || 'cloud_sql_development_database';
    const host = process.env.SQL_HOST;
    return `postgresql://${user}:${pass}@/${db}?host=${host}`;
  }
  return 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
}


export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});



