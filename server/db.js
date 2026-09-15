import Database from 'better-sqlite3'
import { resolve } from 'path'
import 'dotenv/config'

const dbPath = resolve(process.env.DB_PATH || './rie.db')
export const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
