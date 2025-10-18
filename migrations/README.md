# Database Migrations

This directory contains SQL migrations for the 2009 game database.

## Running Migrations

To run migrations against your database:

```bash
POSTGRES_URL=postgresql://user:pass@host:5432/dbname npm run db:migrate
```

## How It Works

1. The migration runner creates a `migrations` table to track which migrations have been applied
2. It reads all `.sql` files from this directory in alphabetical order
3. Each migration file must start with a number (e.g., `001_name.sql`, `002_name.sql`)
4. Only unapplied migrations are executed
5. Each migration runs in a transaction (automatic rollback on error)

## Creating New Migrations

1. Create a new file with the next sequential number: `00X_description.sql`
2. Write your SQL in the file
3. Run `npm run db:migrate` to apply it

Example:
```sql
-- Migration: 002_add_user_settings
-- Description: Add user settings table

CREATE TABLE user_settings (
  id SERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  settings JSONB DEFAULT '{}'
);
```

## Migration Files

- `001_initial_schema.sql` - Creates scenes and prompts tables, indexes, and genesis scene

## Safety

- Migrations run in transactions (automatically rolled back on error)
- Applied migrations are tracked and won't be re-run
- Use `IF NOT EXISTS` clauses when possible for idempotency
