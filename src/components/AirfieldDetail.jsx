import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { acquireLock, releaseLock, subscribeLocks } from '../lib/locks.js'
import { insertRunwaysBatch, signAssessment } from '../lib/api.js'
import ApprovalWorkflow from './ApprovalWorkflow.jsx'
import GenTab from './tabs/GenTab.jsx'
import FopRunwayTab from './tabs/FopRunwayTab.jsx'
import FopRestrictionsTab from './tabs/FopRestrictionsTab.jsx'
import GopTab from './tabs/GopTab.jsx'
import SafeTab from './tabs/SafeTab.jsx'
import EngTab from './tabs/EngTab.jsx'
import MgtTab from './tabs/MgtTab.jsx'

const DEPT_TABS = [
  { key: 'gen',      label: 'GEN',          dept: null },
  { key: 'fopRwy',   label: 'FOP Runway',   dept: 'FSS' },
  { key: 'fopRestr', label: 'FOP Restrict', dept: 'FSS' },
  { key: 'gop',      label: 'GOP',          dept: 'GOP' },
  { key: 'safe',     label: 'SAFE',         dept: 'SAFE' },
  { key: 'eng',      label: 'ENG',          dept: 'ENG' },
  { key: 'mgt',      label: 'MGT',          dept: 'MGT' },
]

export default function AirfieldDetail({ airfield, profile, currentUser, onBack, onSignOut, chatOpen, onChatToggle }) {
  const [activeTab, setActiveTab] = useState('gen')
  const [genData, setGenData] = useState(null)
  const [runways, setRunways] = useState([])
  const [fssData, setFssData] = useState(null)
  const [gopData, setGopData] = useState(null)
  const [safeData, setSafeData] = useState(null)
  const [engData, setEngData] = useState(null)
  const [mgtData, setMgtData] = useState(null)
  const [lock, setLock] = useState(null)
  const [hasLock, setHasLock] = useState(false)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const lockInterval = useRef(null)

  const dept = profile?.department
  const isAdmin = dept === 'ADMIN'
  const canEditCurrentTab = isAdmin || !DEPT_TABS.find(t => t.key === activeTab)?.dept || DEPT_TABS.find(t => t.key === activeTab)?.dept === dept
  const canWrite = hasLock && canEditCurrentTab
  const lockHolder = lock?.profiles?.full_name
  const deptData = { FSS: fssData, GOP: gopData, SAFE: safeData, ENG: engData, MGT: mgtData }[dept]

  useEffect(() => {
    loadAll()
    tryAcquireLock()
    const lockSub = subscribeLocks(airfield.id, () => checkLock())
    return () => {
      supabase.removeChannel(lockSub)
      if (lockInterval.current) clearInterval(lockInterval.current)
      releaseLock(airfield.id, dept, currentUser.id)
    }
  }, [airfield.id])

  useEffect(() => {
    lockInterval.current = setInterval(() => {
      if (hasLock) acquireLock(airfield.id, dept, currentUser.id)
    }, 4 * 60 * 1000)
    return () => clearInterval(lockInterval.current)
  }, [hasLock])

  async function tryAcquireLock() {
    if (!dept || isAdmin) { setHasLock(true); return }
    const { acquired, lock: l } = await acquireLock(airfield.id, dept, currentUser.id)
    setHasLock(acquired)
    setLock(l)
  }

  async function checkLock() {
    if (!dept || isAdmin) return
    const { acquired, lock: l } = await acquireLock(airfield.id, dept, currentUser.id)
    setHasLock(acquired)
    setLock(l)
  }

  async function loadAll() {
    setGenData({ ...airfield })
    const [rwRes, fssRes, gopRes, safeRes, engRes, mgtRes] = await Promise.all([
      supabase.from('runways').select('*').eq('airfield_id', airfield.id).order('sort_order'),
      supabase.from('fss_assessments').select('*').eq('airfield_id', airfield.id).maybeSingle(),
      supabase.from('gop_assessments').select('*').eq('airfield_id', airfield.id).maybeSingle(),
      supabase.from('safety_assessments').select('*').eq('airfield_id', airfield.id).maybeSingle(),
      supabase.from('eng_assessments').select('*').eq('airfield_id', airfield.id).maybeSingle(),
      supabase.from('mgt_assessments').select('*').eq('airfield_id', airfield.id).maybeSingle(),
    ])
    setRunways(rwRes.data || [])
    setFssData(fssRes.data || {})
    setGopData(gopRes.data || {})
    setSafeData(safeRes.data || {})
    setEngData(engRes.data || {})
    setMgtData(mgtRes.data || {})
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function handleSave() {
    if (!canWrite) return
    setSaving(true)
    await supabase.from('airfields').update({
      icao: genData.icao, iata: genData.iata, name: genData.name,
      country: genData.country, operations_type: genData.operations_type,
      status: genData.status, slot_requirements: genData.slot_requirements,
      operating_hours: genData.operating_hours,
      elevation_ft: genData.elevation_ft, msa_25nm_ft: genData.msa_25nm_ft,
      max_obstacle_ft: genData.max_obstacle_ft,
      max_runway_designation: genData.max_runway_designation, pcn: genData.pcn,
      ils_approaches: genData.ils_approaches,
      nav_vor: genData.nav_vor, nav_rnav: genData.nav_rnav, nav_rnp: genData.nav_rnp,
      nav_gnss: genData.nav_gnss, nav_loc: genData.nav_loc, nav_ndb: genData.nav_ndb,
      date_request: genData.date_request, date_flight_support: genData.date_flight_support,
      date_preparation: genData.date_preparation, date_eng_safety: genData.date_eng_safety,
      date_final_approval: genData.date_final_approval, date_fop_complete: genData.date_fop_complete,
      lvops_available: genData.lvops_available, lvops_details: genData.lvops_details,
      airport_of_entry: genData.airport_of_entry, aip_available: genData.aip_available,
      gigsky_coverage: genData.gigsky_coverage, ops_data_readiness: genData.ops_data_readiness,
      catb_b757: genData.catb_b757, catb_b767: genData.catb_b767, catb_b777: genData.catb_b777,
    }).eq('id', airfield.id)

    await supabase.from('runways').delete().eq('airfield_id', airfield.id)
    if (runways.length > 0) {
      await insertRunwaysBatch(
        runways.map((r, i) => ({ ...r, airfield_id: airfield.id, sort_order: i, id: undefined }))
      )
    }

    const base = { airfield_id: airfield.id, updated_by: currentUser.id }
    if (dept === 'FSS' || isAdmin) {
      fssData?.id
        ? await supabase.from('fss_assessments').update({ ...base, ...fssData }).eq('id', fssData.id)
        : await supabase.from('fss_assessments').insert({ ...base, ...fssData })
    }
    if (dept === 'GOP' || isAdmin) {
      gopData?.id
        ? await supabase.from('gop_assessments').update({ ...base, ...gopData }).eq('id', gopData.id)
        : await supabase.from('gop_assessments').insert({ ...base, ...gopData })
    }
    if (dept === 'SAFE' || isAdmin) {
      safeData?.id
        ? await supabase.from('safety_assessments').update({ ...base, ...safeData }).eq('id', safeData.id)
        : await supabase.from('safety_assessments').insert({ ...base, ...safeData })
    }
    if (dept === 'ENG' || isAdmin) {
      engData?.id
        ? await supabase.from('eng_assessments').update({ ...base, ...engData }).eq('id', engData.id)
        : await supabase.from('eng_assessments').insert({ ...base, ...engData })
    }
    if (dept === 'MGT' || isAdmin) {
      mgtData?.id
        ? await supabase.from('mgt_assessments').update({ ...base, ...mgtData }).eq('id', mgtData.id)
        : await supabase.from('mgt_assessments').insert({ ...base, ...mgtData })
    }

    setSaving(false)
    showToast('Saved ✓')
  }

  async function handleSign() {
    if (!hasLock) return
    const table = { FSS: 'fss_assessments', GOP: 'gop_assessments', SAFE: 'safety_assessments', ENG: 'eng_assessments', MGT: 'mgt_assessments' }[dept]
    if (!table) return
    await signAssessment(table, airfield.id)
    showToast('Signed ✓')
    loadAll()
  }

  return (
    <>
      <header className="app-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 style={{ fontSize: 15 }}>{airfield.icao} — {airfield.name}</h1>
        <div className="header-right">
          <span className="dept-badge">{dept}</span>

          {/* Sign Off — only for dept users with write access on their tab */}
          {deptData && canWrite && !isAdmin && (
            <button className="header-btn" onClick={handleSign} disabled={saving}
              style={{ background: '#166534', color: '#86efac' }}>
              Sign Off
            </button>
          )}

          {/* Save — in-header, no fixed bar */}
          <button
            className="header-btn"
            onClick={handleSave}
            disabled={saving || !canWrite}
            style={{ background: canWrite ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.08)', fontWeight: 700 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>

          {/* Chat toggle */}
          <button className="header-btn" onClick={onChatToggle} title="Toggle chat">💬</button>

          {/* Sign Out */}
          <button className="header-btn" onClick={onSignOut}>Sign Out</button>
        </div>
      </header>

      <nav className="tab-nav">
        {DEPT_TABS.map(t => {
          const isMyDept = !t.dept || t.dept === dept || isAdmin
          return (
            <button
              key={t.key}
              className={`tab-btn ${activeTab === t.key ? 'active' : ''} ${!isMyDept ? 'locked-tab' : ''}`}
              onClick={() => isMyDept && setActiveTab(t.key)}
            >
              {t.label}
              {!isMyDept && <span className="tab-lock-icon">🔒</span>}
            </button>
          )
        })}
      </nav>

      <div className="detail-container">
        {!hasLock && !isAdmin && (
          <div className="lock-banner">
            🔒 <span><strong>{lockHolder || 'Another user'}</strong> from {dept} is editing this. You have read-only access until they finish.</span>
          </div>
        )}

        {activeTab === 'gen'      && genData  && <><ApprovalWorkflow gen={genData} /><GenTab gen={genData} onChange={setGenData} disabled={!canWrite} /></>}
        {activeTab === 'fopRwy'               && <FopRunwayTab runways={runways} onChange={setRunways} disabled={!canWrite} />}
        {activeTab === 'fopRestr' && fssData  && <FopRestrictionsTab restrictions={fssData} onChange={setFssData} disabled={!canWrite} />}
        {activeTab === 'gop'      && gopData  && <GopTab gop={gopData} onChange={setGopData} disabled={!canWrite} />}
        {activeTab === 'safe'     && safeData && <SafeTab safe={safeData} onChange={setSafeData} disabled={!canWrite} />}
        {activeTab === 'eng'      && engData  && <EngTab eng={engData} onChange={setEngData} disabled={!canWrite} />}
        {activeTab === 'mgt'      && mgtData  && <MgtTab mgt={mgtData} onChange={setMgtData} disabled={!canWrite} />}
      </div>

      {toast && <div className="save-toast">{toast}</div>}
    </>
  )
}
