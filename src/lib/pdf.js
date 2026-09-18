import jsPDF from 'jspdf'
import dhlLogo from '../assets/dhl-logo-pdf.png'

// The build inlines the logo as a base64 data URL, but the dev server serves it as a
// plain URL — and jsPDF needs image data, not a URL. Normalise so both behave alike.
let _logoData = null
async function logoDataUrl() {
  if (_logoData) return _logoData
  if (dhlLogo.startsWith('data:')) return (_logoData = dhlLogo)
  const blob = await fetch(dhlLogo).then(r => r.blob())
  _logoData = await new Promise(resolve => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.readAsDataURL(blob)
  })
  return _logoData
}

const MEL_DAYS = { B: 3, C: 10, D: 120 }

function fmt(iso) {
  if (!iso) return 'N/A'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDt(iso) {
  if (!iso) return 'N/A'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export async function generateRIEPdf(rec) {
  const logo = await logoDataUrl()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const PW = 210; const LM = 15; const RM = 15; const CW = PW - LM - RM
  let y = 18

  function line(extra = 0) { return 5 + extra }
  function rule(thick = false) {
    doc.setLineWidth(thick ? 0.5 : 0.2)
    doc.setDrawColor(thick ? 40 : 180)
    doc.line(LM, y, PW - RM, y)
    y += 2
  }
  function heading(txt, size = 9) {
    doc.setFontSize(size)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(txt, LM, y)
    y += line(1)
  }
  function field(lbl, val, x = LM, w = CW) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100)
    doc.text(lbl.toUpperCase(), x, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20)
    doc.text(String(val || '—'), x, y + 3.5)
    return 8
  }
  function row2(lbl1, val1, lbl2, val2) {
    field(lbl1, val1, LM, CW / 2 - 4)
    field(lbl2, val2, LM + CW / 2 + 4, CW / 2 - 4)
    y += 9
  }
  function row3(l1, v1, l2, v2, l3, v3) {
    const w = CW / 3 - 3
    field(l1, v1, LM, w)
    field(l2, v2, LM + CW / 3 + 1, w)
    field(l3, v3, LM + 2 * CW / 3 + 2, w)
    y += 9
  }
  function textBlock(lbl, val) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100)
    doc.text(lbl.toUpperCase(), LM, y)
    y += 3.5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20)
    const lines = doc.splitTextToSize(val || '—', CW)
    doc.text(lines, LM, y)
    y += lines.length * 4 + 3
  }

  // ── Header ──────────────────────────────────────────────────────────────
  doc.addImage(logo, 'PNG', LM, y - 6, 28, 6.17)

  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.setTextColor(40)
  doc.text('CARGO AIR OPERATIONS', LM + 33, y)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text('MEL RECTIFICATION INTERVAL EXTENSION REQUEST', LM + 33, y + 5)
  y += 8

  // Ref number top-right
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text(rec.ref_number, PW - RM, y - 10, { align: 'right' })
  doc.setFontSize(7); doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  doc.text('Reference', PW - RM, y - 5, { align: 'right' })

  rule(true); y += 2

  // ── Section 1: Aircraft ──────────────────────────────────────────────────
  heading('1. AIRCRAFT & DEFECT DETAILS', 8)
  row2('Aircraft Registration', rec.aircraft_registration, 'Aircraft Type', rec.aircraft_type)
  row2('MEL Item Reference', rec.mel_item_ref, 'MEL Chapter / Title', rec.mel_chapter_title || '—')
  textBlock('Defect Description', rec.defect_description)

  rule(); y += 1

  // ── Section 2: MEL Timing ────────────────────────────────────────────────
  heading('2. MEL INTERVAL & EXTENSION', 8)
  row3(
    'MEL Category', `${rec.mel_category}  (${MEL_DAYS[rec.mel_category]} calendar days)`,
    'Date Defect Found', fmt(rec.date_defect_found),
    'MEL Interval Start', fmt(rec.date_mel_start)
  )
  row3(
    'MEL Interval Expiry', fmt(rec.mel_interval_expiry),
    'Extension Requested', `${rec.extension_days} day${rec.extension_days === 1 ? '' : 's'}`,
    'Extension Expiry', fmt(rec.extension_expiry)
  )
  row2('MCC / Technical Reference', rec.mcc_reference || '—', 'ADD "P" No', rec.ref_addp || '—')
  y -= 0

  rule(); y += 1

  // ── Section 3: Justification ─────────────────────────────────────────────
  heading('3. JUSTIFICATION', 8)
  textBlock('Reason for Extension', rec.extension_reason)
  if (rec.additional_limitations) {
    textBlock('Additional Operational Limitations / Conditions', rec.additional_limitations)
  }

  rule(); y += 1

  // ── Section 4: Signatures ────────────────────────────────────────────────
  heading('4. SIGNATURES', 8)

  const sigBoxY = y
  const sigBoxH = 38
  const sigW = CW / 2 - 4

  // Left box (Applicant)
  doc.setDrawColor(180); doc.setLineWidth(0.2)
  doc.rect(LM, sigBoxY, sigW, sigBoxH)
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(80)
  doc.text('APPLICANT SIGNATURE', LM + 2, sigBoxY + 4)

  if (rec.applicant_signature) {
    try {
      doc.addImage(rec.applicant_signature, 'PNG', LM + 2, sigBoxY + 6, sigW - 4, 16)
    } catch {}
  }
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
  doc.text(`Name: ${rec.applicant_name || '—'}`, LM + 2, sigBoxY + 26)
  if (rec.applicant_position) doc.text(`Position: ${rec.applicant_position}`, LM + 2, sigBoxY + 30)
  doc.text(`Date: ${fmtDt(rec.applicant_signed_at)}`, LM + 2, sigBoxY + (rec.applicant_position ? 34 : 30))

  // Right box (Manager)
  const rX = LM + sigW + 8
  doc.rect(rX, sigBoxY, sigW, sigBoxH)
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(80)
  doc.text('AUTHORISING MANAGER SIGNATURE', rX + 2, sigBoxY + 4)

  if (rec.manager_signature) {
    try {
      doc.addImage(rec.manager_signature, 'PNG', rX + 2, sigBoxY + 6, sigW - 4, 16)
    } catch {}
  }
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
  doc.text(`Name: ${rec.manager_name || '—'}`, rX + 2, sigBoxY + 26)
  if (rec.manager_position) doc.text(`Position: ${rec.manager_position}`, rX + 2, sigBoxY + 30)
  doc.text(`Date: ${fmtDt(rec.manager_signed_at)}`, rX + 2, sigBoxY + (rec.manager_position ? 34 : 30))

  y = sigBoxY + sigBoxH + 4

  if (rec.manager_comments) {
    heading('MANAGER COMMENTS', 8)
    textBlock('', rec.manager_comments)
  }

  rule(); y += 1

  // ── Section 5: FOI ───────────────────────────────────────────────────────
  heading('5. FOI SUBMISSION TRACKING', 8)
  row3(
    'Date Authorised', fmt(rec.manager_signed_at),
    'FOI Submission Due', fmt(rec.foi_due_at),
    'Date Submitted to FOI', fmt(rec.foi_submitted_at)
  )

  // ── Footer ───────────────────────────────────────────────────────────────
  const pageH = 297
  doc.setFontSize(6.5); doc.setTextColor(160)
  doc.text('DHL Cargo Air Operations — Proprietary and Confidential', LM, pageH - 8)
  doc.text(`Generated: ${fmtDt(new Date().toISOString())}`, PW - RM, pageH - 8, { align: 'right' })
  doc.line(LM, pageH - 10, PW - RM, pageH - 10)

  // Slashes are legal in the CAA reference but not in a filename
  doc.save(`${(rec.ref_number || 'RIE-draft').replace(/\//g, '-')}.pdf`)
}
