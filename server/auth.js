import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { q } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET
const TOKEN_TTL = '7d'

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function toSession(user) {
  const access_token = signToken(user)
  return {
    access_token,
    user: { id: user.id, email: user.email }
  }
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 10)
}

export async function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash)
}

// Express middleware: verifies bearer token if present, attaches req.user. Does not reject
// unauthenticated requests here — individual routes decide what needs a user.
export function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      req.user = { id: payload.sub, email: payload.email }
    } catch {
      req.user = null
    }
  } else {
    req.user = null
  }
  next()
}

export function verifyTokenForSocket(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return { id: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export async function findUserByEmail(email) {
  const { rows } = await q('select * from profiles where email = $1', [email])
  return rows[0] || null
}

export async function findUserById(id) {
  const { rows } = await q('select * from profiles where id = $1', [id])
  return rows[0] || null
}
