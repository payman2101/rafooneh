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

const DEFAULT_SUPABASE_URL = 'postgres://postgres.agyerjkhtsqmdtcgamgq:M0habb%40t2026%2F8%2F1@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

function getPoolConfig() {
  const rawUrl = process.env.DATABASE_URL || DEFAULT_SUPABASE_URL;
  const connStr = fixPgUrl(rawUrl);
  const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
  return {
    connectionString: connStr,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  };
}

export const pool = new pg.Pool(getPoolConfig());

export const db = drizzle(pool, { schema });
