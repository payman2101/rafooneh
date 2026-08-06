import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

function fixPgUrl(urlStr) {
  if (!urlStr) return urlStr;
  const match = urlStr.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^/@]+(?::\d+)?\/.*)$/);
  if (match) {
    const [, proto, user, pass, rest] = match;
    const encodedPass = encodeURIComponent(decodeURIComponent(pass));
    return proto + user + ":" + encodedPass + "@" + rest;
  }
  return urlStr;
}

function getPoolConfig() {
  if (process.env.DATABASE_URL) {
    const connStr = fixPgUrl(process.env.DATABASE_URL);
    const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
    return {
      connectionString: connStr,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    };
  }

  if (process.env.SQL_HOST) {
    return {
      user: process.env.SQL_ADMIN_USER || process.env.SQL_USER || 'ai_studio_app_user',
      password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || '',
      database: process.env.SQL_DB_NAME || 'cloud_sql_development_database',
      host: process.env.SQL_HOST,
    };
  }

  return {
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  };
}

export const pool = new pg.Pool(getPoolConfig());

export const db = drizzle(pool, { schema });
