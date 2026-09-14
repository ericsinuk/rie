import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { authMiddleware, findUserByEmail, findUserById, hashPassword, verifyPassword, toSession, verifyTokenForSocket } from './auth.js'
import { q, pool } from './db.js'

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
  const { email, password, full_name: directName, department: directDept, options } = req.body
  const full_name = directName || options?.data?.full_name
  const department = directDept || options?.data?.department
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  const existing = await findUserByEmail(email)
  if (existing) return res.status(409).json({ error: 'Email already registered' })
  const hash = await hashPassword(password)
  const { rows } = await q(
    'insert into profiles (email, password_hash, full_name, department) values ($1,$2,$3,$4) returning *',
    [email, hash, full_name || null, department || null]
  )
  res.json({ session: toSession(rows[0]) })
})

app.post('/auth/signin', async (req, res) => {
  const { email, password } = req.body
  const user = await findUserByEmail(email)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  if (!(await verifyPassword(password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials' })
  res.json({ session: toSession(user) })
})

app.post('/auth/signout', (_req, res) => {
  // stateless JWT — client drops the token; nothing to do server-side
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
app.get('/profiles/:id', mustAuth, async (req, res) => {
  const { rows } = await q('select id, email, full_name, department, created_at from profiles where id = $1', [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  res.json(rows[0])
})

app.patch('/profiles/:id', mustAuth, async (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' })
  const { full_name, department } = req.body
  const { rows } = await q(
    'update profiles set full_name = coalesce($1, full_name), department = coalesce($2, department) where id = $3 returning id, email, full_name, department',
    [full_name, department, req.params.id]
  )
  res.json(rows[0])
})

// ---------------------------------------------------------------------------
// Airfields
// ---------------------------------------------------------------------------
app.get('/airfields', mustAuth, async (_req, res) => {
  const { rows } = await q(`
    select a.*,
      fss.dfs_status as fss_dfs, gop.dfs_status as gop_dfs,
      saf.dfs_status as safe_dfs, eng.dfs_status as eng_dfs, mgt.dfs_status as mgt_dfs
    from airfields a
    left join fss_assessments fss on fss.airfield_id = a.id
    left join gop_assessments gop on gop.airfield_id = a.id
    left join safety_assessments saf on saf.airfield_id = a.id
    left join eng_assessments eng on eng.airfield_id = a.id
    left join mgt_assessments mgt on mgt.airfield_id = a.id
    order by a.created_at
  `)
  // reshape to match existing client shape
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

app.post('/airfields', mustAuth, async (req, res) => {
  const { icao, iata, name, country, operations_type } = req.body
  if (!icao || !name) return res.status(400).json({ error: 'icao and name required' })
  const { rows } = await q(
    'insert into airfields (icao, iata, name, country, operations_type) values ($1,$2,$3,$4,$5) returning *',
    [icao, iata || null, name, country || null, operations_type || 'Destination Airfield']
  )
  broadcast({ event: 'INSERT', table: 'airfields', new: rows[0] })
  res.json(rows[0])
})

app.patch('/airfields/:id', mustAuth, async (req, res) => {
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
  const sets = updates.map((c, i) => `${c} = $${i + 2}`).join(', ')
  const vals = updates.map(c => req.body[c])
  const { rows } = await q(`update airfields set ${sets} where id = $1 returning *`, [req.params.id, ...vals])
  res.json(rows[0])
})

// ---------------------------------------------------------------------------
// Runways
// ---------------------------------------------------------------------------
app.get('/runways', mustAuth, async (req, res) => {
  const { rows } = await q('select * from runways where airfield_id = $1 order by sort_order', [req.query.airfield_id])
  res.json(rows)
})

app.delete('/runways', mustAuth, async (req, res) => {
  await q('delete from runways where airfield_id = $1', [req.query.airfield_id])
  res.json({ ok: true })
})

app.post('/runways/batch', mustAuth, async (req, res) => {
  const rows = req.body // array
  if (!rows.length) return res.json([])
  const vals = rows.flatMap((r, i) => [
    r.airfield_id, r.designator, r.length, r.width, r.pcn,
    r.approach_lighting || 'None', !!r.ils_cat1, !!r.ils_cat2, !!r.ils_cat3,
    !!r.nav_vor, !!r.nav_rnav, !!r.nav_rnp, !!r.nav_circling, !!r.nav_gnss, !!r.nav_loc, !!r.nav_ndb,
    r.weight_b757_mtow, r.weight_b757_mlw, r.weight_b757_mtw, r.weight_b757_max_twy,
    r.weight_b767_mtow, r.weight_b767_mlw, r.weight_b767_mtw, r.weight_b767_max_twy,
    r.weight_b777_mtow, r.weight_b777_mlw, r.weight_b777_mtw, r.weight_b777_max_twy,
    i
  ])
  const placeholders = rows.map((_, i) => {
    const b = i * 29
    return `(${Array.from({ length: 29 }, (_, j) => `$${b + j + 1}`).join(',')})`
  }).join(',')
  const { rows: inserted } = await q(`
    insert into runways (airfield_id, designator, length, width, pcn, approach_lighting,
      ils_cat1, ils_cat2, ils_cat3, nav_vor, nav_rnav, nav_rnp, nav_circling, nav_gnss, nav_loc, nav_ndb,
      weight_b757_mtow, weight_b757_mlw, weight_b757_mtw, weight_b757_max_twy,
      weight_b767_mtow, weight_b767_mlw, weight_b767_mtw, weight_b767_max_twy,
      weight_b777_mtow, weight_b777_mlw, weight_b777_mtw, weight_b777_max_twy, sort_order)
    values ${placeholders} returning *
  `, vals)
  res.json(inserted)
})

// ---------------------------------------------------------------------------
// Department assessments (generic handler)
// ---------------------------------------------------------------------------
const ASSESSMENT_TABLES = {
  fss_assessments: true,
  gop_assessments: true,
  safety_assessments: true,
  eng_assessments: true,
  mgt_assessments: true,
}

app.get('/assessments/:table', mustAuth, async (req, res) => {
  const { table } = req.params
  if (!ASSESSMENT_TABLES[table]) return res.status(400).json({ error: 'Unknown table' })
  const { rows } = await q(`select * from ${table} where airfield_id = $1`, [req.query.airfield_id])
  res.json(rows[0] || null)
})

app.put('/assessments/:table', mustAuth, async (req, res) => {
  const { table } = req.params
  if (!ASSESSMENT_TABLES[table]) return res.status(400).json({ error: 'Unknown table' })
  const { airfield_id, id, updated_by: _ub, ...rest } = req.body
  const existing = await q(`select id from ${table} where airfield_id = $1`, [airfield_id])
  const existingId = existing.rows[0]?.id

  if (existingId) {
    const cols = Object.keys(rest)
    if (!cols.length) return res.json(existing.rows[0])
    const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')
    const { rows } = await q(
      `update ${table} set ${sets}, updated_by = $${cols.length + 2} where id = $1 returning *`,
      [existingId, ...cols.map(c => rest[c]), req.user.id]
    )
    return res.json(rows[0])
  }

  const cols = Object.keys(rest)
  const params = [airfield_id, req.user.id, ...cols.map(c => rest[c])]
  const colList = ['airfield_id', 'updated_by', ...cols].join(',')
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await q(
    `insert into ${table} (${colList}) values (${placeholders}) returning *`, params
  )
  res.json(rows[0])
})

app.post('/assessments/:table/sign', mustAuth, async (req, res) => {
  const { table } = req.params
  if (!ASSESSMENT_TABLES[table]) return res.status(400).json({ error: 'Unknown table' })
  const { airfield_id } = req.body
  const { rows } = await q(
    `update ${table} set dfs_status = 4, signed_by = $1, signed_at = now() where airfield_id = $2 returning *`,
    [req.user.id, airfield_id]
  )
  res.json(rows[0])
})

// ---------------------------------------------------------------------------
// Record locks
// ---------------------------------------------------------------------------
app.post('/locks/acquire', mustAuth, async (req, res) => {
  const { airfield_id, department } = req.body
  await q('select clean_expired_locks()')
  const { rows: existing } = await q(
    `select l.*, p.full_name, p.department as dept
     from record_locks l join profiles p on p.id = l.locked_by
     where l.airfield_id = $1 and l.department = $2 and l.expires_at > now()`,
    [airfield_id, department]
  )
  const lock = existing[0]
  if (lock) {
    if (lock.locked_by === req.user.id) {
      await q(`update record_locks set expires_at = now() + interval '5 minutes' where id = $1`, [lock.id])
      return res.json({ acquired: true, lock })
    }
    return res.json({ acquired: false, lock })
  }
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const { rows } = await q(
    `insert into record_locks (airfield_id, department, locked_by, expires_at) values ($1,$2,$3,$4) returning *`,
    [airfield_id, department, req.user.id, expires]
  )
  broadcast({ event: 'INSERT', table: 'record_locks', new: rows[0] })
  res.json({ acquired: true, lock: rows[0] })
})

app.post('/locks/release', mustAuth, async (req, res) => {
  const { airfield_id, department } = req.body
  await q('delete from record_locks where airfield_id=$1 and department=$2 and locked_by=$3', [airfield_id, department, req.user.id])
  broadcast({ event: 'DELETE', table: 'record_locks', airfield_id })
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
app.get('/chat', mustAuth, async (req, res) => {
  const { airfield_id } = req.query
  const { rows } = airfield_id
    ? await q('select * from chat_messages where airfield_id=$1 order by created_at', [airfield_id])
    : await q('select * from chat_messages where airfield_id is null order by created_at')
  res.json(rows)
})

app.post('/chat', mustAuth, async (req, res) => {
  const { message, airfield_id } = req.body
  const { rows } = await q(
    'insert into chat_messages (sender_id, message, airfield_id) values ($1,$2,$3) returning *',
    [req.user.id, message, airfield_id || null]
  )
  broadcast({ event: 'INSERT', table: 'chat_messages', new: rows[0] })
  res.json(rows[0])
})

// ---------------------------------------------------------------------------
// WebRTC signals
// ---------------------------------------------------------------------------
app.post('/signals', mustAuth, async (req, res) => {
  const { to_user, signal_type, payload } = req.body
  const { rows } = await q(
    'insert into webrtc_signals (from_user, to_user, signal_type, payload) values ($1,$2,$3,$4) returning *',
    [req.user.id, to_user, signal_type, JSON.stringify(payload)]
  )
  broadcast({ event: 'INSERT', table: 'webrtc_signals', new: rows[0] })
  res.json(rows[0])
})

// ---------------------------------------------------------------------------
// WebSocket realtime (replaces Supabase channels + presence)
// ---------------------------------------------------------------------------
const clients = new Map() // socket → { user, channels: Set<string>, presenceKey }

function broadcast(msg) {
  const data = JSON.stringify(msg)
  clients.forEach((meta, ws) => {
    if (ws.readyState === 1) ws.send(data)
  })
}

function broadcastToChannel(channel, msg) {
  const data = JSON.stringify({ channel, ...msg })
  clients.forEach((meta, ws) => {
    if (meta.channels.has(channel) && ws.readyState === 1) ws.send(data)
  })
}

function presenceState() {
  const state = {}
  clients.forEach((meta) => {
    if (meta.presence) {
      const key = meta.presence.user_id
      state[key] = [meta.presence]
    }
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
    let msg
    try { msg = JSON.parse(raw) } catch { return }
    const meta = clients.get(ws)

    if (msg.type === 'subscribe') {
      meta.channels.add(msg.channel)
    }
    if (msg.type === 'unsubscribe') {
      meta.channels.delete(msg.channel)
    }
    if (msg.type === 'presence_track') {
      meta.presence = msg.payload
      // send current presence state to all in the presence channel
      const state = presenceState()
      clients.forEach((m, s) => {
        if (m.channels.has('presence') && s.readyState === 1) {
          s.send(JSON.stringify({ type: 'presence_sync', state }))
        }
      })
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    // broadcast updated presence
    const state = presenceState()
    clients.forEach((m, s) => {
      if (m.channels.has('presence') && s.readyState === 1) {
        s.send(JSON.stringify({ type: 'presence_sync', state }))
      }
    })
  })
})

const PORT = process.env.PORT || 8787
httpServer.listen(PORT, () => {
  console.log(`RisksAssessments server running on :${PORT}`)
})
