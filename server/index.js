import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { authMiddleware, findUserByEmail, findUserById, hashPassword, verifyPassword, toSession, verifyTokenForSocket } from './auth.js'
import { db } from './db.js'

// Run migrations on startup
import('./migrate.js').catch(e => { console.error('Migration failed', e); process.exit(1) })

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN }))
app.use(express.json())
app.use(authMiddleware)

function mustAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, full_name: directName, department: directDept, options } = req.body
    const full_name = directName || options?.data?.full_name
    const department = directDept || options?.data?.department
    if (!email || !password) return res.status(400).json({ error: 'email and password required' })
    const existing = await findUserByEmail(email)
    if (existing) return res.status(409).json({ error: 'Email already registered' })
    const hash = await hashPassword(password)
    const row = db.prepare(
      'INSERT INTO profiles (email, password_hash, full_name, department) VALUES (?,?,?,?) RETURNING *'
    ).get(email, hash, full_name || null, department || null)
    res.json({ session: toSession(row) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await findUserByEmail(email)
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    if (!(await verifyPassword(password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials' })
    res.json({ session: toSession(user) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/auth/signout', (_req, res) => res.json({ ok: true }))

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
function getProfile(id) {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(id)
}

// Never expose the password hash; the enrolled signature image only to its owner
function publicProfile(row, viewerId) {
  if (!row) return null
  return {
    id: row.id, email: row.email, full_name: row.full_name, department: row.department,
    created_at: row.created_at,
    is_admin: !!row.is_admin,
    can_sign_applicant: !!row.can_sign_applicant,
    can_sign_manager: !!row.can_sign_manager,
    has_signature: !!row.signature_image,
    signature_updated_at: row.signature_updated_at,
    ...(row.id === viewerId ? { signature_image: row.signature_image } : {}),
  }
}

app.get('/profiles/:id', mustAuth, (req, res) => {
  const row = getProfile(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(publicProfile(row, req.user.id))
})

app.put('/profiles/me/signature', mustAuth, async (req, res) => {
  const { signature, password } = req.body
  if (!signature || !signature.startsWith('data:image/png;base64,')) return res.status(400).json({ error: 'A drawn signature is required' })
  const me = getProfile(req.user.id)
  if (!me) return res.status(401).json({ error: 'Unauthorized' })
  if (!password || !(await verifyPassword(password, me.password_hash))) return res.status(403).json({ error: 'Password incorrect' })
  const row = db.prepare(`
    UPDATE profiles SET signature_image = ?, signature_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? RETURNING *
  `).get(signature, me.id)
  res.json(publicProfile(row, me.id))
})

// ---------------------------------------------------------------------------
// Admin — signatory rights are granted here, never self-selected
// ---------------------------------------------------------------------------
function mustAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const me = getProfile(req.user.id)
  if (!me?.is_admin) return res.status(403).json({ error: 'Admin only' })
  next()
}

app.get('/admin/users', mustAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM profiles WHERE email != 'import@dhl.com' ORDER BY full_name COLLATE NOCASE").all()
  res.json(rows.map(r => publicProfile(r, req.user.id)))
})

app.patch('/admin/users/:id', mustAdmin, (req, res) => {
  const target = getProfile(req.params.id)
  if (!target || target.email === 'import@dhl.com') return res.status(404).json({ error: 'Not found' })
  const flags = ['is_admin', 'can_sign_applicant', 'can_sign_manager'].filter(f => f in req.body)
  if (!flags.length) return res.status(400).json({ error: 'Nothing to update' })
  if (req.body.is_admin === false && target.is_admin) {
    const admins = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE is_admin = 1').get().n
    if (admins <= 1) return res.status(400).json({ error: 'Cannot remove the last admin' })
  }
  const sets = flags.map(f => `${f} = ?`).join(', ')
  const row = db.prepare(`UPDATE profiles SET ${sets} WHERE id = ? RETURNING *`)
    .get(...flags.map(f => (req.body[f] ? 1 : 0)), target.id)
  res.json(publicProfile(row, req.user.id))
})

app.patch('/profiles/:id', mustAuth, (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' })
  const { full_name, department } = req.body
  const row = db.prepare(
    'UPDATE profiles SET full_name = COALESCE(?,full_name), department = COALESCE(?,department) WHERE id = ? RETURNING id, email, full_name, department'
  ).get(full_name ?? null, department ?? null, req.params.id)
  res.json(row)
})

// ---------------------------------------------------------------------------
// Airfields
// ---------------------------------------------------------------------------
app.get('/airfields', mustAuth, (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*,
      fss.dfs_status AS fss_dfs, gop.dfs_status AS gop_dfs,
      saf.dfs_status AS safe_dfs, eng.dfs_status AS eng_dfs, mgt.dfs_status AS mgt_dfs
    FROM airfields a
    LEFT JOIN fss_assessments fss ON fss.airfield_id = a.id
    LEFT JOIN gop_assessments gop ON gop.airfield_id = a.id
    LEFT JOIN safety_assessments saf ON saf.airfield_id = a.id
    LEFT JOIN eng_assessments eng ON eng.airfield_id = a.id
    LEFT JOIN mgt_assessments mgt ON mgt.airfield_id = a.id
    ORDER BY a.created_at
  `).all()
  const out = rows.map(r => ({
    ...r,
    fss_assessments: r.fss_dfs != null ? [{ dfs_status: r.fss_dfs }] : [],
    gop_assessments: r.gop_dfs != null ? [{ dfs_status: r.gop_dfs }] : [],
    safety_assessments: r.safe_dfs != null ? [{ dfs_status: r.safe_dfs }] : [],
    eng_assessments: r.eng_dfs != null ? [{ dfs_status: r.eng_dfs }] : [],
    mgt_assessments: r.mgt_dfs != null ? [{ dfs_status: r.mgt_dfs }] : [],
  }))
  res.json(out)
})

app.post('/airfields', mustAuth, (req, res) => {
  const { icao, iata, name, country, operations_type } = req.body
  if (!icao || !name) return res.status(400).json({ error: 'icao and name required' })
  const row = db.prepare(
    'INSERT INTO airfields (icao, iata, name, country, operations_type) VALUES (?,?,?,?,?) RETURNING *'
  ).get(icao, iata || null, name, country || null, operations_type || 'Destination Airfield')
  broadcast({ event: 'INSERT', table: 'airfields', new: row })
  res.json(row)
})

app.patch('/airfields/:id', mustAuth, (req, res) => {
  const cols = [
    'icao','iata','name','country','operations_type','status','slot_requirements','operating_hours',
    'elevation_ft','msa_25nm_ft','max_obstacle_ft','max_runway_designation','pcn','ils_approaches',
    'nav_vor','nav_rnav','nav_rnp','nav_gnss','nav_loc','nav_ndb',
    'date_request','date_flight_support','date_preparation','date_eng_safety','date_final_approval','date_fop_complete',
    'lvops_available','lvops_details','airport_of_entry','aip_available','gigsky_coverage','ops_data_readiness',
    'catb_b757','catb_b767','catb_b777'
  ]
  const updates = cols.filter(c => c in req.body)
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })
  const sets = updates.map(c => `${c} = ?`).join(', ')
  const vals = [...updates.map(c => req.body[c]), req.params.id]
  const row = db.prepare(`UPDATE airfields SET ${sets} WHERE id = ? RETURNING *`).get(...vals)
  res.json(row)
})

// ---------------------------------------------------------------------------
// Runways
// ---------------------------------------------------------------------------
app.get('/runways', mustAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM runways WHERE airfield_id = ? ORDER BY sort_order').all(req.query.airfield_id)
  res.json(rows)
})

app.delete('/runways', mustAuth, (req, res) => {
  db.prepare('DELETE FROM runways WHERE airfield_id = ?').run(req.query.airfield_id)
  res.json({ ok: true })
})

app.post('/runways/batch', mustAuth, (req, res) => {
  const rows = req.body
  if (!rows.length) return res.json([])
  const insert = db.prepare(`
    INSERT INTO runways (airfield_id, designator, length, width, pcn, approach_lighting,
      ils_cat1, ils_cat2, ils_cat3, nav_vor, nav_rnav, nav_rnp, nav_circling, nav_gnss, nav_loc, nav_ndb,
      weight_b757_mtow, weight_b757_mlw, weight_b757_mtw, weight_b757_max_twy,
      weight_b767_mtow, weight_b767_mlw, weight_b767_mtw, weight_b767_max_twy,
      weight_b777_mtow, weight_b777_mlw, weight_b777_mtw, weight_b777_max_twy, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *
  `)
  const inserted = db.transaction((rows) => rows.map((r, i) => insert.get(
    r.airfield_id, r.designator, r.length, r.width, r.pcn,
    r.approach_lighting || 'None', r.ils_cat1 ? 1 : 0, r.ils_cat2 ? 1 : 0, r.ils_cat3 ? 1 : 0,
    r.nav_vor ? 1 : 0, r.nav_rnav ? 1 : 0, r.nav_rnp ? 1 : 0, r.nav_circling ? 1 : 0,
    r.nav_gnss ? 1 : 0, r.nav_loc ? 1 : 0, r.nav_ndb ? 1 : 0,
    r.weight_b757_mtow, r.weight_b757_mlw, r.weight_b757_mtw, r.weight_b757_max_twy,
    r.weight_b767_mtow, r.weight_b767_mlw, r.weight_b767_mtw, r.weight_b767_max_twy,
    r.weight_b777_mtow, r.weight_b777_mlw, r.weight_b777_mtw, r.weight_b777_max_twy,
    i
  )))(rows)
  res.json(inserted)
})

// ---------------------------------------------------------------------------
// Department assessments (generic handler)
// ---------------------------------------------------------------------------
const ASSESSMENT_TABLES = new Set(['fss_assessments','gop_assessments','safety_assessments','eng_assessments','mgt_assessments'])

app.get('/assessments/:table', mustAuth, (req, res) => {
  const { table } = req.params
  if (!ASSESSMENT_TABLES.has(table)) return res.status(400).json({ error: 'Unknown table' })
  const row = db.prepare(`SELECT * FROM ${table} WHERE airfield_id = ?`).get(req.query.airfield_id)
  res.json(row || null)
})

app.put('/assessments/:table', mustAuth, (req, res) => {
  const { table } = req.params
  if (!ASSESSMENT_TABLES.has(table)) return res.status(400).json({ error: 'Unknown table' })
  const { airfield_id, id: _id, updated_by: _ub, ...rest } = req.body
  const existing = db.prepare(`SELECT id FROM ${table} WHERE airfield_id = ?`).get(airfield_id)

  if (existing) {
    const cols = Object.keys(rest)
    if (!cols.length) return res.json(existing)
    const sets = [...cols.map(c => `${c} = ?`), 'updated_by = ?'].join(', ')
    const row = db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ? RETURNING *`)
      .get(...cols.map(c => rest[c]), req.user.id, existing.id)
    return res.json(row)
  }

  const cols = Object.keys(rest)
  const colList = ['airfield_id', 'updated_by', ...cols].join(',')
  const placeholders = Array(cols.length + 2).fill('?').join(',')
  const row = db.prepare(`INSERT INTO ${table} (${colList}) VALUES (${placeholders}) RETURNING *`)
    .get(airfield_id, req.user.id, ...cols.map(c => rest[c]))
  res.json(row)
})

app.post('/assessments/:table/sign', mustAuth, (req, res) => {
  const { table } = req.params
  if (!ASSESSMENT_TABLES.has(table)) return res.status(400).json({ error: 'Unknown table' })
  const { airfield_id } = req.body
  const now = new Date().toISOString()
  const row = db.prepare(
    `UPDATE ${table} SET dfs_status = 4, signed_by = ?, signed_at = ? WHERE airfield_id = ? RETURNING *`
  ).get(req.user.id, now, airfield_id)
  res.json(row)
})

// ---------------------------------------------------------------------------
// Record locks
// ---------------------------------------------------------------------------
function cleanExpiredLocks() {
  db.prepare("DELETE FROM record_locks WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')").run()
}

app.post('/locks/acquire', mustAuth, (req, res) => {
  const { airfield_id, department } = req.body
  cleanExpiredLocks()
  const lock = db.prepare(`
    SELECT l.*, p.full_name, p.department AS dept
    FROM record_locks l JOIN profiles p ON p.id = l.locked_by
    WHERE l.airfield_id = ? AND l.department = ? AND l.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).get(airfield_id, department)

  if (lock) {
    if (lock.locked_by === req.user.id) {
      const newExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      db.prepare("UPDATE record_locks SET expires_at = ? WHERE id = ?").run(newExpiry, lock.id)
      return res.json({ acquired: true, lock })
    }
    return res.json({ acquired: false, lock })
  }
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const row = db.prepare(
    'INSERT INTO record_locks (airfield_id, department, locked_by, expires_at) VALUES (?,?,?,?) RETURNING *'
  ).get(airfield_id, department, req.user.id, expires)
  broadcast({ event: 'INSERT', table: 'record_locks', new: row })
  res.json({ acquired: true, lock: row })
})

app.post('/locks/release', mustAuth, (req, res) => {
  const { airfield_id, department } = req.body
  db.prepare('DELETE FROM record_locks WHERE airfield_id=? AND department=? AND locked_by=?').run(airfield_id, department, req.user.id)
  broadcast({ event: 'DELETE', table: 'record_locks', airfield_id })
  res.json({ ok: true })
})

app.post('/locks/cleanup', mustAuth, (_req, res) => {
  cleanExpiredLocks()
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
app.get('/chat', mustAuth, (req, res) => {
  const { airfield_id } = req.query
  const rows = airfield_id
    ? db.prepare('SELECT * FROM chat_messages WHERE airfield_id=? ORDER BY created_at').all(airfield_id)
    : db.prepare('SELECT * FROM chat_messages WHERE airfield_id IS NULL ORDER BY created_at').all()
  res.json(rows)
})

app.post('/chat', mustAuth, (req, res) => {
  const { message, airfield_id } = req.body
  const row = db.prepare(
    'INSERT INTO chat_messages (sender_id, message, airfield_id) VALUES (?,?,?) RETURNING *'
  ).get(req.user.id, message, airfield_id || null)
  broadcast({ event: 'INSERT', table: 'chat_messages', new: row })
  res.json(row)
})

// ---------------------------------------------------------------------------
// RIE records
// ---------------------------------------------------------------------------
const MEL_INTERVALS = { B: 3, C: 10, D: 120 }

function addDays(isoDate, days) {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Continues the legacy Access DB sequence (…/116, …/166) with no gaps.
// Only called at manager authorisation, so cancelled drafts never consume a number.
const REF_PREFIX = 'DHL/AIR/RIE/'
function nextRefNumber() {
  const row = db.prepare(`
    SELECT COALESCE(MAX(CAST(SUBSTR(ref_number, ?) AS INTEGER)), 0) + 1 AS next
    FROM rie_records
    WHERE ref_number GLOB ?
  `).get(REF_PREFIX.length + 1, REF_PREFIX + '[0-9]*')
  return `${REF_PREFIX}${row.next}`
}

app.get('/rie', mustAuth, (_req, res) => {
  const rows = db.prepare(`
    SELECT r.*, p.full_name AS created_by_name
    FROM rie_records r
    LEFT JOIN profiles p ON p.id = r.created_by
    ORDER BY r.created_at DESC
  `).all()
  res.json(rows)
})

app.post('/rie', mustAuth, (req, res) => {
  const {
    aircraft_registration, aircraft_type, mel_item_ref, mel_chapter_title,
    defect_description, mel_category, date_defect_found, date_mel_start,
    extension_days, extension_reason, additional_limitations, mcc_reference,
    ref_addp, applicant_position
  } = req.body
  if (!aircraft_registration || !aircraft_type || !mel_item_ref || !defect_description ||
      !mel_category || !date_defect_found || !date_mel_start || !extension_days || !extension_reason)
    return res.status(400).json({ error: 'Missing required fields' })
  const mel_interval_expiry = addDays(date_mel_start, MEL_INTERVALS[mel_category])
  const extension_expiry = addDays(mel_interval_expiry, Number(extension_days))
  const row = db.prepare(`
    INSERT INTO rie_records
      (aircraft_registration, aircraft_type, mel_item_ref, mel_chapter_title,
       defect_description, mel_category, date_defect_found, date_mel_start,
       mel_interval_expiry, extension_days, extension_expiry,
       extension_reason, additional_limitations, mcc_reference,
       ref_addp, applicant_position, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *
  `).get(aircraft_registration, aircraft_type, mel_item_ref, mel_chapter_title || null,
         defect_description, mel_category, date_defect_found, date_mel_start,
         mel_interval_expiry, Number(extension_days), extension_expiry,
         extension_reason, additional_limitations || null, mcc_reference || null,
         ref_addp || null, applicant_position || null, req.user.id)
  broadcast({ event: 'INSERT', table: 'rie_records', new: row })
  res.json(row)
})

app.get('/rie/:id', mustAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM rie_records WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(row)
})

app.patch('/rie/:id', mustAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM rie_records WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (existing.status !== 'Draft') return res.status(403).json({ error: 'Can only edit Draft records' })

  const {
    aircraft_registration, aircraft_type, mel_item_ref, mel_chapter_title,
    defect_description, mel_category, date_defect_found, date_mel_start,
    extension_days, extension_reason, additional_limitations, mcc_reference,
    ref_addp, applicant_position
  } = req.body

  const cat = mel_category || existing.mel_category
  const start = date_mel_start || existing.date_mel_start
  const extDays = extension_days != null ? Number(extension_days) : existing.extension_days
  const mel_interval_expiry = addDays(start, MEL_INTERVALS[cat])
  const extension_expiry = addDays(mel_interval_expiry, extDays)

  const row = db.prepare(`
    UPDATE rie_records SET
      aircraft_registration = COALESCE(?, aircraft_registration),
      aircraft_type = COALESCE(?, aircraft_type),
      mel_item_ref = COALESCE(?, mel_item_ref),
      mel_chapter_title = COALESCE(?, mel_chapter_title),
      defect_description = COALESCE(?, defect_description),
      mel_category = ?, date_defect_found = COALESCE(?, date_defect_found),
      date_mel_start = ?, mel_interval_expiry = ?, extension_days = ?, extension_expiry = ?,
      extension_reason = COALESCE(?, extension_reason),
      additional_limitations = COALESCE(?, additional_limitations),
      mcc_reference = COALESCE(?, mcc_reference),
      ref_addp = COALESCE(?, ref_addp),
      applicant_position = COALESCE(?, applicant_position),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? RETURNING *
  `).get(
    aircraft_registration || null, aircraft_type || null, mel_item_ref || null,
    mel_chapter_title || null, defect_description || null,
    cat, date_defect_found || null,
    start, mel_interval_expiry, extDays, extension_expiry,
    extension_reason || null, additional_limitations || null, mcc_reference || null,
    ref_addp || null, applicant_position || null,
    req.params.id
  )
  broadcast({ event: 'UPDATE', table: 'rie_records', new: row })
  res.json(row)
})

app.post('/rie/:id/sign', mustAuth, async (req, res) => {
  const { role, signature, use_enrolled, password, name, position, manager_comments } = req.body
  if (!['applicant', 'manager'].includes(role)) return res.status(400).json({ error: 'role must be applicant or manager' })

  // Permissions come from the database, not the token, so a revoked right takes effect immediately
  const me = getProfile(req.user.id)
  if (!me) return res.status(401).json({ error: 'Unauthorized' })
  if (role === 'applicant' && !me.can_sign_applicant) return res.status(403).json({ error: 'You are not authorised to sign as applicant' })
  if (role === 'manager' && !me.can_sign_manager) return res.status(403).json({ error: 'You are not authorised to sign as authorising manager' })

  // Re-entering the password ties the act of signing to something only the signatory knows
  if (!password || !(await verifyPassword(password, me.password_hash))) return res.status(403).json({ error: 'Password incorrect' })

  let sigImage, sigSource
  if (use_enrolled) {
    if (!me.signature_image) return res.status(400).json({ error: 'You have no saved signature — draw one instead' })
    sigImage = me.signature_image; sigSource = 'enrolled'
  } else {
    if (!signature || !signature.startsWith('data:image/png;base64,')) return res.status(400).json({ error: 'signature required' })
    sigImage = signature; sigSource = 'drawn'
  }

  const existing = db.prepare('SELECT * FROM rie_records WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const now = new Date().toISOString()

  if (role === 'applicant') {
    if (existing.status !== 'Draft') return res.status(403).json({ error: 'Already signed by applicant' })
    const row = db.prepare(`
      UPDATE rie_records SET
        applicant_id = ?, applicant_name = ?, applicant_position = ?,
        applicant_signed_at = ?, applicant_signature = ?, applicant_sig_source = ?,
        status = 'Pending Manager',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND status = 'Draft' RETURNING *
    `).get(me.id, name || me.full_name || me.email, position || null, now, sigImage, sigSource, req.params.id)
    if (!row) return res.status(409).json({ error: 'Record changed while signing — reload and try again' })
    broadcast({ event: 'UPDATE', table: 'rie_records', new: row })
    return res.json(row)
  }

  if (existing.status !== 'Pending Manager') return res.status(403).json({ error: 'Applicant must sign first' })
  if (existing.applicant_id === me.id) return res.status(403).json({ error: 'You signed this RIE as applicant — a different person must authorise it' })
  const foi_due_at = addDays(now.split('T')[0], 10)

  // Transaction so two managers authorising at once can't mint the same reference number
  const authorise = db.transaction(() => {
    const ref_number = existing.ref_number || nextRefNumber()
    return db.prepare(`
      UPDATE rie_records SET
        ref_number = ?,
        manager_id = ?, manager_name = ?, manager_position = ?,
        manager_signed_at = ?, manager_signature = ?, manager_sig_source = ?,
        manager_comments = ?,
        status = 'Authorised', foi_due_at = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND status = 'Pending Manager' RETURNING *
    `).get(ref_number, me.id, name || me.full_name || me.email, position || null,
           now, sigImage, sigSource, manager_comments || null, foi_due_at, req.params.id)
  })
  const row = authorise()
  if (!row) return res.status(409).json({ error: 'Record changed while signing — reload and try again' })
  broadcast({ event: 'UPDATE', table: 'rie_records', new: row })
  res.json(row)
})

app.post('/rie/:id/foi', mustAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM rie_records WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (existing.status !== 'Authorised') return res.status(403).json({ error: 'Must be Authorised first' })
  const row = db.prepare(`
    UPDATE rie_records SET
      foi_submitted_at = ?, status = 'Submitted to FOI',
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? RETURNING *
  `).get(new Date().toISOString(), req.params.id)
  broadcast({ event: 'UPDATE', table: 'rie_records', new: row })
  res.json(row)
})

app.post('/rie/:id/close', mustAuth, (req, res) => {
  const row = db.prepare(`
    UPDATE rie_records SET status = 'Closed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? RETURNING *
  `).get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  broadcast({ event: 'UPDATE', table: 'rie_records', new: row })
  res.json(row)
})

// ---------------------------------------------------------------------------
// WebRTC signals
// ---------------------------------------------------------------------------
app.post('/signals', mustAuth, (req, res) => {
  const { to_user, signal_type, payload } = req.body
  const row = db.prepare(
    'INSERT INTO webrtc_signals (from_user, to_user, signal_type, payload) VALUES (?,?,?,?) RETURNING *'
  ).get(req.user.id, to_user, signal_type, JSON.stringify(payload))
  broadcast({ event: 'INSERT', table: 'webrtc_signals', new: row })
  res.json(row)
})

// ---------------------------------------------------------------------------
// WebSocket realtime
// ---------------------------------------------------------------------------
const clients = new Map()

function broadcast(msg) {
  const data = JSON.stringify(msg)
  clients.forEach((meta, ws) => {
    if (ws.readyState === 1) ws.send(data)
  })
}

function presenceState() {
  const state = {}
  clients.forEach((meta) => {
    if (meta.presence) state[meta.presence.user_id] = [meta.presence]
  })
  return state
}

const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token')
  const user = verifyTokenForSocket(token)
  if (!user) { ws.close(4001, 'Unauthorized'); return }

  clients.set(ws, { user, channels: new Set(), presence: null })

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw) } catch { return }
    const meta = clients.get(ws)
    if (msg.type === 'subscribe') meta.channels.add(msg.channel)
    if (msg.type === 'unsubscribe') meta.channels.delete(msg.channel)
    if (msg.type === 'presence_track') {
      meta.presence = msg.payload
      const state = presenceState()
      clients.forEach((m, s) => {
        if (m.channels.has('presence') && s.readyState === 1)
          s.send(JSON.stringify({ type: 'presence_sync', state }))
      })
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    const state = presenceState()
    clients.forEach((m, s) => {
      if (m.channels.has('presence') && s.readyState === 1)
        s.send(JSON.stringify({ type: 'presence_sync', state }))
    })
  })
})

const PORT = process.env.PORT || 5555
httpServer.listen(PORT, () => console.log(`RIE server on :${PORT}`))
