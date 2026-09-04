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

const DEFAULT_SUPABASE_URL = process.env.DATABASE_URL || '';

function getPoolConfig() {
  const rawUrl = process.env.DATABASE_URL || DEFAULT_SUPABASE_URL;
  if (!rawUrl) {
    return {
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
      ssl: false,
    };
  }
  const connStr = fixPgUrl(rawUrl);
  const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
  return {
    connectionString: connStr,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  };
}

export const pool = new pg.Pool(getPoolConfig());

export const db = drizzle(pool, { schema });
