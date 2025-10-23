#!/usr/bin/env node
/**
 * Database Migration Runner
 *
 * Usage: npm run db:migrate
 * Or: POSTGRES_URL=xxx npm run db:migrate
 */

import { config } from 'dotenv';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

// Load environment variables from .env.local
config({ path: join(__dirname, '../.env.local') });

const MIGRATIONS_DIR = join(__dirname, '../migrations');

interface Migration {
  id: number;
  filename: string;
  sql: string;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client: Client): Promise<Set<number>> {
  const result = await client.query<{ id: number }>('SELECT id FROM migrations ORDER BY id');
  return new Set(result.rows.map(row => row.id));
}

function loadMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(filename => {
    const match = filename.match(/^(\d+)_/);
    if (!match) {
      throw new Error(`Invalid migration filename: ${filename}. Must start with number (e.g., 001_name.sql)`);
    }

    const id = parseInt(match[1], 10);
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');

    return { id, filename, sql };
  });
}

async function runMigration(client: Client, migration: Migration): Promise<void> {
  console.log(`Running migration ${migration.filename}...`);

  await client.query('BEGIN');

  try {
    // Run the migration SQL
    await client.query(migration.sql);

    // Record that it was applied
    await client.query(
      'INSERT INTO migrations (id, filename) VALUES ($1, $2)',
      [migration.id, migration.filename]
    );

    await client.query('COMMIT');
    console.log(`✓ Migration ${migration.filename} completed`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    console.error('Error: POSTGRES_URL environment variable is required');
    console.error('Make sure it is set in .env.local or pass it directly:');
    console.error('Usage: POSTGRES_URL=xxx npm run db:migrate');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✓ Connected\n');

    // Ensure migrations tracking table exists
    await ensureMigrationsTable(client);

    // Get list of applied migrations
    const appliedMigrations = await getAppliedMigrations(client);
    console.log(`Applied migrations: ${appliedMigrations.size}\n`);

    // Load all migration files
    const migrations = loadMigrations();
    console.log(`Found ${migrations.length} migration file(s)\n`);

    // Run pending migrations
    let ranCount = 0;
    for (const migration of migrations) {
      if (!appliedMigrations.has(migration.id)) {
        await runMigration(client, migration);
        ranCount++;
      } else {
        console.log(`⊙ Migration ${migration.filename} already applied`);
      }
    }

    console.log(`\n✓ Done! Ran ${ranCount} migration(s)`);

  } catch (error) {
    console.error('\n✗ Migration failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
