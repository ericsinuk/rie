import jsPDF from 'jspdf'
import dhlLogo from '../assets/dhl-logo-pdf.png'

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

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtLong(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtDt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// Bordered cell: draws rect, small label at top-left, value below
function cell(doc, x, y, w, h, label, value, opts = {}) {
  doc.setDrawColor(0); doc.setLineWidth(0.25)
  doc.rect(x, y, w, h)
  if (label) {
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(60)
    doc.text(label, x + 1.5, y + 3.5)
  }
  if (value != null && value !== '') {
    doc.setFontSize(opts.valueFontSize || 8.5)
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setTextColor(0)
    const startY = label ? y + 8 : y + 5.5
    const avail = h - (label ? 9 : 6)
    const lineH = opts.lineH || 4.5
    const maxLines = Math.max(1, Math.floor(avail / lineH))
    const lines = doc.splitTextToSize(String(value), w - 3)
    doc.text(lines.slice(0, maxLines), x + 1.5, startY)
  }
}

// Shaded part-header row; returns height consumed
function partHeader(doc, x, y, w, text) {
  const h = 6.5
  doc.setFillColor(220, 220, 220); doc.setDrawColor(0); doc.setLineWidth(0.25)
  doc.rect(x, y, w, h, 'FD')
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text(text, x + 2, y + 4.5)
  return h
}

// ── Page 1: Cover Letter ──────────────────────────────────────────────────────
function drawCoverPage(doc, rec, logo) {
  const PW = 210, PH = 297, LM = 15, RM = 15
  let y = 15

  // Company name
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text('DHL AIR LIMITED', LM, y)
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
  doc.text('(REGISTERED NUMBER 01671114)', LM, y + 4.5)

  // Logo top-right
  doc.addImage(logo, 'PNG', PW - RM - 36, y - 3, 36, 8)

  y += 13

  // Address block (two columns)
  const addrL = ['EMA CARGO WEST', 'EAST MIDLANDS AIRPORT ORBITAL PARK', 'CASTLE DONINGTON', 'DERBY DE74 2TR']
  const addrR = ['REGISTERED OFFICE', '178-188 GREAT SOUTH WEST', 'ROAD', 'HOUNSLOW', 'MIDDLESEX TW4 6JS']
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
  addrL.forEach((l, i) => doc.text(l, LM, y + i * 4))
  addrR.forEach((l, i) => doc.text(l, 105, y + i * 4))
  y += 22

  doc.text('Maintenance Operations Control', LM, y); y += 4.5
  doc.text('TEL: +441332857444', LM, y); y += 4.5
  doc.text('EMAIL: emahubmocdep@dhl.com', LM, y); y += 14

  // Dashed memo box
  doc.setDrawColor(140); doc.setLineWidth(0.3)
  doc.setLineDashPattern([2, 1.5], 0)
  doc.rect(LM, y, PW - LM - RM, 43)
  doc.setLineDashPattern([], 0)

  const bx = LM + 5
  y += 7
  const dateStr = rec.manager_signed_at ? fmt(rec.manager_signed_at) : fmt(new Date().toISOString())
  doc.setFontSize(8); doc.setTextColor(0)
  doc.text('Date:', bx, y); doc.text(dateStr, bx + 22, y); y += 6
  doc.text('To:', bx, y); doc.text('Engineer', bx + 22, y); doc.text('Email: Office', bx + 85, y); y += 6
  doc.text('Attn:', bx, y); doc.text('Supervisor', bx + 22, y); y += 6
  doc.text('From:', bx, y); doc.text('MOC', bx + 22, y)
  doc.text('Email: emahubmocdep@dhl.com', bx + 85, y); y += 5
  doc.text('Page 1 of 2', bx + 85, y)
  y += 13

  // Body
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
  doc.text('This document contains details of a Repair Interval Extension for', LM, y); y += 8

  doc.setFont('helvetica', 'bold')
  doc.text('Aircraft Registration', LM, y)
  doc.setFont('helvetica', 'normal')
  doc.text(rec.aircraft_registration || '', LM + 48, y); y += 7

  doc.setFont('helvetica', 'bold')
  doc.text('Acceptable Deferred Defect:', LM, y)
  doc.setFont('helvetica', 'normal'); y += 5
  const defLines = doc.splitTextToSize(rec.defect_description || '', PW - LM - RM)
  doc.text(defLines.slice(0, 3), LM, y); y += Math.min(defLines.length, 3) * 4.5 + 5

  doc.text('Full details are to be found on Page 2 of this document including the revised expiry date at:', LM, y); y += 7
  doc.setFont('helvetica', 'bold')
  doc.text('PART 3 – Authorisation, block 16, latest date defect is due for rectification.', LM, y); y += 7
  doc.setFont('helvetica', 'normal')
  doc.text('This is the date to be used in the aircraft Technical Log, Sector Record Page and the PADD (Pink) sheet.', LM, y); y += 7

  const srpRef = rec.ref_addp || '____'
  const rieRef = rec.ref_number || 'DHL/AIR/RIE/____'
  doc.text(`The certifying engineer should raise an entry on the latest open SRP page, defect column, stating,`, LM, y); y += 4.5
  doc.text(`Engineering Entry. Reference PADD ${srpRef}. In the corresponding Action column should be written`, LM, y); y += 4.5
  doc.text(`${rieRef} granted PADD ${srpRef} cleared.`, LM, y); y += 7

  doc.text('In the next available defect column the original defect should be written and raised as the next available', LM, y); y += 4.5
  doc.text('PADD number, using the original MEL reference but using the date limitation as shown in PART 3. These', LM, y); y += 4.5
  doc.text('details shall also be recorded on the PADD (Pink) sheet.', LM, y); y += 7
  doc.text('A copy of the SRP is to be emailed to MOC.', LM, y); y += 10

  doc.setFont('helvetica', 'bold')
  doc.text('IMPORTANT', LM, y); y += 1
  doc.setLineWidth(0.3); doc.setDrawColor(0)
  doc.line(LM, y + 2, LM + 24, y + 2); y += 6

  const impText = 'Engineering staff should NOT confuse this with the Repair Interval EVALUATION system used for planning purposes and certified in conjunction with WADD. If in any doubt call the MOC at the above telephone number for clarification and assistance before making any entries.'
  doc.setFont('helvetica', 'bold')
  const impLines = doc.splitTextToSize(impText, PW - LM - RM)
  doc.text(impLines, LM, y)

  // Footer
  doc.setLineWidth(0.2); doc.setDrawColor(160)
  doc.setLineDashPattern([1, 1], 0)
  doc.line(LM, PH - 42, PW - RM, PH - 42)
  doc.setLineDashPattern([], 0)

  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
  doc.text('Important  This document is intended for the above named only. It may contain private and confidential', LM, PH - 36)
  doc.text('information. If this has come to you in error you must take no action based on it, nor must you', LM + 18, PH - 32)
  doc.text('copy or show it to anyone; please telephone us immediately and return the original to us. The', LM + 18, PH - 28)
  doc.text('cost will be reimbursed to you.', LM + 18, PH - 24)
  doc.text('If the contents of this document', PW - RM, PH - 18, { align: 'right' })
  doc.text('are incomplete or illegible', PW - RM, PH - 14, { align: 'right' })
  doc.text('please call: +441332857444', PW - RM, PH - 10, { align: 'right' })
}

// ── Page 2: Form DHL/AIR/A/ENG/041 ───────────────────────────────────────────
function drawFormPage(doc, rec, logo) {
  const PW = 210, LM = 12, RM = 12
  const CW = PW - LM - RM // 186mm
  let y = 12

  // Logo top-left
  doc.addImage(logo, 'PNG', LM, y - 2, 32, 7)

  // Form reference box top-right
  const fbX = PW - RM - 82, fbY = y - 4, fbW = 82, fbH = 18
  doc.setDrawColor(0); doc.setLineWidth(0.25)
  doc.rect(fbX, fbY, fbW, fbH)
  doc.line(fbX + 22, fbY, fbX + 22, fbY + fbH)
  doc.line(fbX, fbY + 6, fbX + fbW, fbY + 6)
  doc.line(fbX, fbY + 12, fbX + fbW, fbY + 12)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
  doc.text('FORM',     fbX + 1.5, fbY + 4.5)
  doc.text('REVISION', fbX + 1.5, fbY + 10.5)
  doc.text('DATE',     fbX + 1.5, fbY + 16.5)
  doc.setFont('helvetica', 'bold')
  doc.text('DHL/AIR/A/ENG/041', fbX + 24, fbY + 4.5)
  doc.text('1',                  fbX + 24, fbY + 10.5)
  doc.text('01/08/2004',         fbX + 24, fbY + 16.5)

  y += 18

  // Form title
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text(
    'Appendix A to Attachment 1 – Form RIE 1 – Rectification Interval Extension Report Form',
    PW / 2, y, { align: 'center' }
  )
  y += 9

  // ── PART 1 ────────────────────────────────────────────────────────────────
  y += partHeader(doc, LM, y, CW, 'PART 1 – MEL DEFECT')

  // Row 1: Operator | Date of Defect | Aircraft Reg | Aircraft Type | ADD P No | RIE Number
  const r1h = 14
  const r1w = [27, 27, 33, 30, 22, 47] // total 186
  let x = LM
  const r1 = [
    ['1. Operator', 'DHL Air Ltd'],
    ['2. Date of Defect', fmt(rec.date_defect_found)],
    ['3. Aircraft Registration', rec.aircraft_registration || ''],
    ['4. Aircraft Type', rec.aircraft_type || ''],
    ['5. ADD “P” No', rec.ref_addp || ''],
    ['5. RIE Number', rec.ref_number || ''],
  ]
  r1.forEach(([lbl, val], i) => { cell(doc, x, y, r1w[i], r1h, lbl, val); x += r1w[i] })
  y += r1h

  // Row 2: Detail of Defect | Reason for not Rectifying
  const r2h = 32
  cell(doc, LM,       y, 76,        r2h, '6. Detail of Defect',           rec.defect_description || '',    { lineH: 4 })
  cell(doc, LM + 76,  y, CW - 76,   r2h, '7. Reason for not Rectifying',  rec.reason_not_rectifying || '', { lineH: 4 })
  y += r2h

  // Row 3: Operational Restriction
  const opVal = rec.operational_restriction
    ? (rec.additional_limitations || 'Yes — see associated limitations')
    : 'Nil'
  cell(doc, LM, y, CW, 13, '8. Operational Restriction or Limitation?', opVal)
  y += 13

  // Row 4: Cat | MEL Expiry | MEL Ref + System Title
  const r4h = 14
  const melLabel = [rec.mel_item_ref, rec.mel_chapter_title].filter(Boolean).join('  ·  ')
  cell(doc, LM,        y, 40,        r4h, '9. Rectification Interval Category',        rec.mel_category || '')
  cell(doc, LM + 40,   y, 68,        r4h, '10. Expiry Date of Rectification Interval', fmt(rec.mel_interval_expiry))
  cell(doc, LM + 108,  y, CW - 108,  r4h, '11. MEL Reference Number',                 melLabel)
  y += r4h + 2

  // ── PART 2 ────────────────────────────────────────────────────────────────
  y += partHeader(doc, LM, y, CW, 'PART 2 – RIE APPLICATION')

  // Row: Name of Applicant | Position
  const r5h = 12
  cell(doc, LM,        y, 100,       r5h, '12. Name of Applicant', rec.applicant_name || '')
  cell(doc, LM + 100,  y, CW - 100,  r5h, '13. Position',          rec.applicant_position || '')
  y += r5h

  // Row: Why RIE Required
  const r6h = 24
  cell(doc, LM, y, CW, r6h, '14. Why a Rectification Interval Extension is Required', rec.extension_reason || '', { lineH: 4 })
  y += r6h

  // Applicant signature row
  const aSigH = 26
  doc.setDrawColor(0); doc.setLineWidth(0.25)
  doc.rect(LM, y, CW, aSigH)
  doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(60)
  doc.text('Applicant Signature', LM + 1.5, y + 3.5)
  if (rec.applicant_signature) {
    try { doc.addImage(rec.applicant_signature, 'PNG', LM + 2, y + 5, 40, 16) } catch (_) {}
  }
  const aInfoX = rec.applicant_signature ? LM + 46 : LM + 2
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
  doc.text(`Name: ${rec.applicant_name || ''}`,         aInfoX, y + 9)
  doc.text(`Position: ${rec.applicant_position || ''}`, aInfoX, y + 14)
  doc.text(`Date: ${fmtDt(rec.applicant_signed_at)}`,   aInfoX, y + 19)
  y += aSigH + 2

  // ── PART 3 ────────────────────────────────────────────────────────────────
  y += partHeader(doc, LM, y, CW, 'PART 3 – AUTHORISATION')

  // Row: Duration | Latest Rect Date (bold)
  const r7h = 14
  cell(doc, LM,       y, 93,       r7h, '15. Duration of RIE Authorised',                    rec.extension_days ? `${rec.extension_days} days` : '')
  cell(doc, LM + 93,  y, CW - 93,  r7h, '16. Latest date that Defect is due for Rectification', fmt(rec.extension_expiry), { bold: true, valueFontSize: 9 })
  y += r7h

  // Row: Manager Comments
  const r8h = 20
  cell(doc, LM, y, CW, r8h,
    '17. Comments of Authorising Manager (To include history of previous RIE use for this item where appropriate)',
    rec.manager_comments || '', { lineH: 4 })
  y += r8h

  // Row: Manager signature + 18/19/20
  const mSigH = 34
  const mSigW = 58
  doc.setDrawColor(0); doc.setLineWidth(0.25)
  doc.rect(LM, y, CW, mSigH)
  doc.line(LM + mSigW, y, LM + mSigW, y + mSigH)

  // Signature image
  doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(60)
  doc.text('Manager Signature', LM + 1.5, y + 3.5)
  if (rec.manager_signature) {
    try { doc.addImage(rec.manager_signature, 'PNG', LM + 2, y + 5, mSigW - 4, 20) } catch (_) {}
  }

  // 18/19/20 cells divided on right
  const infoX = LM + mSigW
  const infoW = CW - mSigW
  const rowH3 = mSigH / 3
  doc.line(infoX, y + rowH3,     infoX + infoW, y + rowH3)
  doc.line(infoX, y + rowH3 * 2, infoX + infoW, y + rowH3 * 2)

  doc.setFontSize(6); doc.setTextColor(60)
  doc.text('18. Name of Authorising Manager', infoX + 1.5, y + 3.5)
  doc.text('19. Position',                    infoX + 1.5, y + rowH3 + 3.5)
  doc.text('20. Date',                        infoX + 1.5, y + rowH3 * 2 + 3.5)

  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
  doc.text(rec.manager_name     || '', infoX + 1.5, y + 9)
  doc.text(rec.manager_position || '', infoX + 1.5, y + rowH3 + 9)
  doc.text(fmtDt(rec.manager_signed_at), infoX + 1.5, y + rowH3 * 2 + 9)

  // Page footer
  const PH = 297
  doc.setFontSize(6.5); doc.setTextColor(120)
  doc.text('Form DHL/AIR/A/ENG/041  Rev.1  01/08/2004', LM, PH - 8)
  doc.text(`Generated: ${fmtDt(new Date().toISOString())}  · ${rec.ref_number || 'Draft'}`, PW - RM, PH - 8, { align: 'right' })
  doc.setLineWidth(0.15); doc.setDrawColor(180)
  doc.line(LM, PH - 10, PW - RM, PH - 10)
}

// ── Public export ─────────────────────────────────────────────────────────────
export async function generateRIEPdf(rec) {
  const logo = await logoDataUrl()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  drawCoverPage(doc, rec, logo)
  doc.addPage()
  drawFormPage(doc, rec, logo)

  doc.save(`${(rec.ref_number || 'RIE-draft').replace(/\//g, '-')}.pdf`)
}
