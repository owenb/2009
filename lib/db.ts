/**
 * Database connection utility
 */

import { Pool } from 'pg';

// Create a connection pool (reused across requests)
// In production, this pool is cached by the Next.js module system
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL;

    if (!connectionString) {
      throw new Error('POSTGRES_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      max: 20, // Maximum number of connections in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return error after 10 seconds if unable to connect
      statement_timeout: 30000, // Cancel queries that take longer than 30 seconds
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
      // Reset pool on error to allow reconnection
      pool = null;
    });

    // In development, clean up pool on hot reload
    if (process.env.NODE_ENV === 'development') {
      const cleanup = async () => {
        if (pool) {
          await pool.end();
          pool = null;
        }
      };

      // Handle process termination
      process.once('SIGTERM', cleanup);
      process.once('SIGINT', cleanup);
    }
  }

  return pool;
}

/**
 * Execute a query with the connection pool
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return {
    rows: result.rows as T[],
    rowCount: result.rowCount || 0,
  };
}
