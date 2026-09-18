// Grant or revoke rights from the server shell — needed once, to create the first admin.
// Usage: node grant.js <email> [admin] [applicant] [manager] [--revoke]
import { db } from './db.js'
import './migrate.js'

const [email, ...args] = process.argv.slice(2)
const revoke = args.includes('--revoke')
const map = { admin: 'is_admin', applicant: 'can_sign_applicant', manager: 'can_sign_manager' }
const flags = args.filter(a => a in map).map(a => map[a])

if (!email || !flags.length) {
  console.log('Usage: node grant.js <email> [admin] [applicant] [manager] [--revoke]')
  process.exit(1)
}

const user = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email)
if (!user) {
  console.error(`No account for ${email} — register in the app first.`)
  process.exit(1)
}

db.prepare(`UPDATE profiles SET ${flags.map(f => `${f} = ?`).join(', ')} WHERE id = ?`)
  .run(...flags.map(() => (revoke ? 0 : 1)), user.id)

const row = db.prepare('SELECT email, is_admin, can_sign_applicant, can_sign_manager FROM profiles WHERE id = ?').get(user.id)
console.log(row)
