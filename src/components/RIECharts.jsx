import { useState, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const FLEET_FILTERS = ['All', 'B777', 'B767', 'B757']

function fleetOf(type) {
  if (!type) return null
  const t = type.toUpperCase()
  if (t.startsWith('B777')) return 'B777'
  if (t.startsWith('B767')) return 'B767'
  if (t.startsWith('B757')) return 'B757'
  return null
}

function quarterOf(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Math.floor(d.getMonth() / 3) + 1
}

function currentQuarter() {
  const n = new Date()
  return { year: n.getFullYear(), q: Math.floor(n.getMonth() / 3) + 1 }
}

export default function RIECharts({ records }) {
  const [fleetFilter, setFleetFilter] = useState('All')

  const now = new Date()
  const { year: cYear, q: cQ } = currentQuarter()
  const lYear = cQ === 1 ? cYear - 1 : cYear
  const lQ = cQ === 1 ? 4 : cQ - 1

  // ── KPI values ────────────────────────────────────────────────────────────
  const open = records.filter(r => r.status !== 'Closed').length

  const thisQ = records.filter(r => {
    if (!r.date_defect_found) return false
    const d = new Date(r.date_defect_found)
    return d.getFullYear() === cYear && quarterOf(r.date_defect_found) === cQ
  }).length

  const lastQ = records.filter(r => {
    if (!r.date_defect_found) return false
    const d = new Date(r.date_defect_found)
    return d.getFullYear() === lYear && quarterOf(r.date_defect_found) === lQ
  }).length

  const overdue = records.filter(r =>
    r.extension_expiry && new Date(r.extension_expiry) < now && r.status !== 'Closed'
  ).length

  const authorisedWithDays = records.filter(r => r.status !== 'Draft' && r.extension_days > 0)
  const avgDays = authorisedWithDays.length
    ? Math.round(authorisedWithDays.reduce((s, r) => s + r.extension_days, 0) / authorisedWithDays.length)
    : 0

  // ── Filter records by fleet for charts ───────────────────────────────────
  const chartRecords = useMemo(() => {
    if (fleetFilter === 'All') return records
    return records.filter(r => fleetOf(r.aircraft_type) === fleetFilter)
  }, [records, fleetFilter])

  // ── 5-year line chart: total per year ─────────────────────────────────────
  const yearData = useMemo(() => {
    const base = cYear - 4
    const map = {}
    for (let y = base; y <= cYear; y++) map[y] = 0
    for (const r of chartRecords) {
      if (!r.date_defect_found) continue
      const y = new Date(r.date_defect_found).getFullYear()
      if (map[y] !== undefined) map[y]++
    }
    return Object.entries(map).map(([year, count]) => ({ year: String(year), count }))
  }, [chartRecords, cYear])

  // ── 12-month rolling bar chart ─────────────────────────────────────────────
  const monthData = useMemo(() => {
    const result = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleDateString('en-GB', { month: 'short' })
      const count = chartRecords.filter(r => {
        if (!r.date_defect_found) return false
        const rd = new Date(r.date_defect_found)
        return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth()
      }).length
      result.push({ month: label, count })
    }
    return result
  }, [chartRecords])

  const tooltipStyle = {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    fontSize: 12,
  }

  return (
    <div className="rie-kpi-section">

      {/* KPI Cards */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Open RIEs</div>
          <div className="kpi-value">{open}</div>
          <div className="kpi-sub">Draft + in progress</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">This Quarter (Q{cQ} {cYear})</div>
          <div className="kpi-value">{thisQ}</div>
          <div className="kpi-sub">by date of defect</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Last Quarter (Q{lQ} {lYear})</div>
          <div className="kpi-value">{lastQ}</div>
          <div className="kpi-sub">by date of defect</div>
        </div>
        <div className={`kpi-card ${overdue > 0 ? 'kpi-danger' : ''}`}>
          <div className="kpi-label">Overdue</div>
          <div className="kpi-value">{overdue}</div>
          <div className="kpi-sub">Ext. expiry passed</div>
        </div>
      </div>

      {/* Chart header + fleet filter */}
      <div className="kpi-chart-header">
        <span className="kpi-chart-title">RIE Trend</span>
        <div className="kpi-fleet-filter">
          {FLEET_FILTERS.map(f => (
            <button
              key={f}
              className={`filter-btn ${fleetFilter === f ? 'active' : ''}`}
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => setFleetFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="kpi-charts-row">
        {/* 5-year line */}
        <div className="kpi-chart-card">
          <div className="kpi-chart-label">5-Year Total</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={yearData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="year" tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)' }} />
              <Line
                type="monotone" dataKey="count" name="RIEs"
                stroke="var(--primary)" strokeWidth={2}
                dot={{ fill: 'var(--primary)', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 12-month rolling bar */}
        <div className="kpi-chart-card">
          <div className="kpi-chart-label">Last 12 Months</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-3)', fontSize: 10 }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" name="RIEs" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}
