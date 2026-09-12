import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { pool } from './db.js'

const migrationPath = fileURLToPath(new URL('../sql/001_initial.sql', import.meta.url))

try {
  const migration = await readFile(path.resolve(migrationPath), 'utf8')
  await pool.query(migration)
  console.log('Database migration completed.')
} finally {
  await pool.end()
}
