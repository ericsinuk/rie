import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET
const TOKEN_TTL = '7d'

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function toSession(user) {
  const access_token = signToken(user)
  return { access_token, user: { id: user.id, email: user.email } }
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 10)
}

export async function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash)
}

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

export function findUserByEmail(email) {
  return Promise.resolve(db.prepare('SELECT * FROM profiles WHERE email = ?').get(email) || null)
}

export function findUserById(id) {
  return Promise.resolve(db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) || null)
}
