import 'dotenv/config'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the API.')
}

export const pool = new Pool({
  connectionString,
  max: 10,
  ssl: { rejectUnauthorized: false },
})
