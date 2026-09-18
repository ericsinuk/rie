// Thin API client that wraps the self-hosted Express backend.
// Matches the call patterns the existing components use (auth, from/select, from/update, channels, presence).

const BASE = import.meta.env.VITE_API_URL || '/rie/api'

function getToken() {
  return localStorage.getItem('ra_token')
}

function setToken(t) {
  if (t) localStorage.setItem('ra_token', t)
  else localStorage.removeItem('ra_token')
}

async function apiFetch(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  // A token whose signature no longer verifies still parses and looks unexpired
  // client-side, so without this the app renders a signed-in shell over empty data.
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    setToken(null)
    notifyAuthChange('SIGNED_OUT', null)
  }
  if (!res.ok) return { data: null, error: data }
  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Auth shim
// ---------------------------------------------------------------------------
let _authListeners = []
let _currentSession = null

function notifyAuthChange(event, session) {
  _currentSession = session
  _authListeners.forEach(cb => cb(event, session))
}

export const auth = {
  getSession() {
    const token = getToken()
    if (!token) return Promise.resolve({ data: { session: _currentSession } })
    // parse payload without verifying (server already did that)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp * 1000 < Date.now()) { setToken(null); return Promise.resolve({ data: { session: null } }) }
      const session = { access_token: token, user: { id: payload.sub, email: payload.email } }
      _currentSession = session
      return Promise.resolve({ data: { session } })
    } catch {
      setToken(null)
      return Promise.resolve({ data: { session: null } })
    }
  },

  onAuthStateChange(cb) {
    _authListeners.push(cb)
    return { data: { subscription: { unsubscribe: () => { _authListeners = _authListeners.filter(l => l !== cb) } } } }
  },

  async signInWithPassword({ email, password }) {
    const { data, error } = await apiFetch('/auth/signin', { method: 'POST', body: { email, password } })
    if (error) return { error }
    setToken(data.session.access_token)
    notifyAuthChange('SIGNED_IN', data.session)
    return { data: { session: data.session }, error: null }
  },

  async signUp({ email, password, options }) {
    const { full_name } = options?.data || {}
    const { data, error } = await apiFetch('/auth/signup', { method: 'POST', body: { email, password, full_name } })
    if (error) return { error }
    setToken(data.session.access_token)
    notifyAuthChange('SIGNED_IN', data.session)
    return { data: { session: data.session }, error: null }
  },

  async signOut() {
    await apiFetch('/auth/signout', { method: 'POST' })
    setToken(null)
    notifyAuthChange('SIGNED_OUT', null)
    return { error: null }
  }
}

// ---------------------------------------------------------------------------
// Table query builder shim
// Supports: select, eq, is, gt, order, maybeSingle, single, insert, update, delete
// ---------------------------------------------------------------------------
class QueryBuilder {
  constructor(table, op, payload) {
    this.table = table
    this.op = op       // 'select' | 'insert' | 'update' | 'delete' | 'upsert'
    this.payload = payload
    this._filters = []
    this._order = null
    this._single = false
    this._maybeSingle = false
  }

  eq(col, val) { this._filters.push({ col, op: 'eq', val }); return this }
  is(col, val) { this._filters.push({ col, op: 'eq', val }); return this }
  gt(col, val) { this._filters.push({ col, op: 'gt', val }); return this }
  order(col, opts) { this._order = { col, ...opts }; return this }
  select(cols) { this._selectCols = cols; return this }
  single() { this._single = true; return this }
  maybeSingle() { this._maybeSingle = true; return this }

  _buildQuery() {
    const params = new URLSearchParams()
    this._filters.forEach(f => params.set(f.col, f.val === null ? 'null' : f.val))
    if (this._order) params.set('_order', this._order.col)
    return params.toString()
  }

  async then(resolve, reject) {
    try {
      const result = await this._execute()
      resolve(result)
    } catch (e) {
      reject(e)
    }
  }

  async _execute() {
    const t = this.table

    if (this.op === 'select') {
      // Route specific tables through semantic endpoints
      if (t === 'profiles') {
        const id = this._filters.find(f => f.col === 'id')?.val
        const { data, error } = await apiFetch(`/profiles/${id}`)
        return { data, error }
      }
      if (t === 'airfields') {
        const { data, error } = await apiFetch('/airfields')
        return { data, error }
      }
      if (t === 'runways') {
        const af = this._filters.find(f => f.col === 'airfield_id')?.val
        const { data, error } = await apiFetch(`/runways?airfield_id=${af}`)
        return { data, error }
      }
      if (ASSESSMENT_TABLES.includes(t)) {
        const af = this._filters.find(f => f.col === 'airfield_id')?.val
        const { data, error } = await apiFetch(`/assessments/${t}?airfield_id=${af}`)
        const row = data || null
        return { data: this._maybeSingle || this._single ? row : (row ? [row] : []), error }
      }
      if (t === 'chat_messages') {
        const af = this._filters.find(f => f.col === 'airfield_id')?.val
        const url = af ? `/chat?airfield_id=${af}` : '/chat'
        const { data, error } = await apiFetch(url)
        return { data, error }
      }
    }

    if (this.op === 'insert') {
      if (t === 'airfields') {
        const { data, error } = await apiFetch('/airfields', { method: 'POST', body: this.payload })
        return { data, error }
      }
      if (t === 'chat_messages') {
        const { data, error } = await apiFetch('/chat', { method: 'POST', body: this.payload })
        return { data, error }
      }
      if (t === 'record_locks') {
        const { data, error } = await apiFetch('/locks/acquire', { method: 'POST', body: this.payload })
        return { data, error }
      }
      if (t === 'webrtc_signals') {
        const { data, error } = await apiFetch('/signals', { method: 'POST', body: this.payload })
        return { data, error }
      }
      if (ASSESSMENT_TABLES.includes(t)) {
        const { data, error } = await apiFetch(`/assessments/${t}`, { method: 'PUT', body: this.payload })
        return { data, error }
      }
    }

    if (this.op === 'update') {
      if (t === 'profiles') {
        const id = this._filters.find(f => f.col === 'id')?.val
        const { data, error } = await apiFetch(`/profiles/${id}`, { method: 'PATCH', body: this.payload })
        return { data, error }
      }
      if (t === 'airfields') {
        const id = this._filters.find(f => f.col === 'id')?.val
        const { data, error } = await apiFetch(`/airfields/${id}`, { method: 'PATCH', body: this.payload })
        return { data, error }
      }
      if (ASSESSMENT_TABLES.includes(t)) {
        const { data, error } = await apiFetch(`/assessments/${t}`, { method: 'PUT', body: this.payload })
        return { data, error }
      }
      if (t === 'record_locks') {
        const id = this._filters.find(f => f.col === 'id')?.val
        const { data, error } = await apiFetch(`/locks/${id}`, { method: 'PATCH', body: this.payload })
        return { data, error }
      }
    }

    if (this.op === 'delete') {
      if (t === 'runways') {
        const af = this._filters.find(f => f.col === 'airfield_id')?.val
        const { data, error } = await apiFetch(`/runways?airfield_id=${af}`, { method: 'DELETE' })
        return { data, error }
      }
      if (t === 'record_locks') {
        const af = this._filters.find(f => f.col === 'airfield_id')?.val
        const dept = this._filters.find(f => f.col === 'department')?.val
        const { data, error } = await apiFetch(`/locks/release`, { method: 'POST', body: { airfield_id: af, department: dept } })
        return { data, error }
      }
    }

    console.warn('api.js: unhandled', this.op, t)
    return { data: null, error: null }
  }
}

const ASSESSMENT_TABLES = ['fss_assessments', 'gop_assessments', 'safety_assessments', 'eng_assessments', 'mgt_assessments']

// ---------------------------------------------------------------------------
// WebSocket channels shim
// ---------------------------------------------------------------------------
let _ws = null
let _wsReady = false
let _wsQueue = []
const _channelHandlers = new Map() // channelKey → [{ event, filter, cb }]
let _presenceHandlers = []

function getWs() {
  if (_ws && _ws.readyState < 2) return _ws
  const token = getToken()
  if (!token) return null
  const wsBase = BASE.startsWith('/')
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${BASE}`
    : BASE.replace(/^http/, 'ws')
  _ws = new WebSocket(`${wsBase}?token=${token}`)
  _wsReady = false
  _ws.onopen = () => {
    _wsReady = true
    _wsQueue.forEach(m => _ws.send(m))
    _wsQueue = []
  }
  _ws.onmessage = e => {
    let msg; try { msg = JSON.parse(e.data) } catch { return }

    if (msg.type === 'presence_sync') {
      _presenceHandlers.forEach(h => h(msg.state))
      return
    }

    _channelHandlers.forEach((handlers) => {
      handlers.forEach(({ event, filter, cb }) => {
        const matchEvent = !event || event === '*' || event === msg.event
        const matchTable = !filter?.table || filter.table === msg.table
        if (matchEvent && matchTable) cb({ new: msg.new, old: msg.old })
      })
    })
  }
  _ws.onclose = () => { _wsReady = false; _ws = null }
  return _ws
}

function wsSend(data) {
  const s = JSON.stringify(data)
  if (_wsReady && _ws) _ws.send(s)
  else _wsQueue.push(s)
  getWs()
}

class Channel {
  constructor(name) {
    this.name = name
    this._handlers = []
    this._presenceCb = null
    this._presenceKey = null
    _channelHandlers.set(name, this._handlers)
  }

  on(event, filterOrHandler, cb) {
    if (event === 'postgres_changes') {
      this._handlers.push({ event: filterOrHandler.event, filter: filterOrHandler, cb })
    }
    if (event === 'presence') {
      this._presenceCb = cb
      _presenceHandlers.push(state => {
        const users = Object.values(state).flat()
        cb(users)
      })
    }
    return this
  }

  subscribe(cb) {
    wsSend({ type: 'subscribe', channel: this.name })
    if (this._presenceKey) wsSend({ type: 'subscribe', channel: 'presence' })
    cb?.('SUBSCRIBED')
    return this
  }

  async track(payload) {
    wsSend({ type: 'presence_track', payload })
  }

  presenceState() {
    return {}
  }
}

// ---------------------------------------------------------------------------
// RPC shim
// ---------------------------------------------------------------------------
const rpc = {
  clean_expired_locks: () => apiFetch('/locks/cleanup', { method: 'POST' })
}

// ---------------------------------------------------------------------------
// Public api object — matches the `supabase` shape used in components
// ---------------------------------------------------------------------------
export const api = {
  auth,
  from(table) {
    return {
      select: (cols) => new QueryBuilder(table, 'select', null).select(cols),
      insert: (payload) => new QueryBuilder(table, 'insert', payload),
      update: (payload) => new QueryBuilder(table, 'update', payload),
      delete: () => new QueryBuilder(table, 'delete', null),
    }
  },
  channel(name, opts) {
    return new Channel(name, opts)
  },
  removeChannel(ch) {
    if (ch?.name) {
      _channelHandlers.delete(ch.name)
    }
  },
  rpc(fn) {
    return rpc[fn]?.() || Promise.resolve({ data: null, error: null })
  }
}

// ---------------------------------------------------------------------------
// RIE records
// ---------------------------------------------------------------------------
export const rie = {
  list: () => apiFetch('/rie'),
  get: (id) => apiFetch(`/rie/${id}`),
  create: (body) => apiFetch('/rie', { method: 'POST', body }),
  update: (id, body) => apiFetch(`/rie/${id}`, { method: 'PATCH', body }),
  // body: { role, signature | use_enrolled, password, name, position, manager_comments }
  sign: (id, body) => apiFetch(`/rie/${id}/sign`, { method: 'POST', body }),
  markFoi: (id) => apiFetch(`/rie/${id}/foi`, { method: 'POST' }),
  close: (id) => apiFetch(`/rie/${id}/close`, { method: 'POST' }),
}

export const profiles = {
  get: (id) => apiFetch(`/profiles/${id}`),
  saveSignature: (signature, password) =>
    apiFetch('/profiles/me/signature', { method: 'PUT', body: { signature, password } }),
}

export const admin = {
  users: () => apiFetch('/admin/users'),
  setRights: (id, rights) => apiFetch(`/admin/users/${id}`, { method: 'PATCH', body: rights }),
}
