import { useRef, useEffect, useState } from 'react'

export default function SignaturePad({ role, signerName, signerPosition, onSign, onCancel }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [name, setName] = useState(signerName || '')
  const [position, setPosition] = useState(signerPosition || '')
  const [comments, setComments] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  function onDown(e) {
    e.preventDefault()
    drawing.current = true
    const { x, y } = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsEmpty(false)
  }

  function onMove(e) {
    e.preventDefault()
    if (!drawing.current) return
    const { x, y } = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function onUp(e) { e.preventDefault(); drawing.current = false }

  function clear() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }

  function sign() {
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onSign(dataUrl, name, position, role === 'manager' ? comments : undefined)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>{role === 'applicant' ? 'Sign as Applicant' : 'Authorise as Manager'}</h2>
        <p className="subtitle">Draw your signature in the box below</p>

        <div className="field-row">
          <div className="field">
            <label>Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
          </div>
          <div className="field">
            <label>Position / Role</label>
            <input type="text" value={position} onChange={e => setPosition(e.target.value)}
              placeholder={role === 'applicant' ? 'e.g. Line Maintenance Manager' : 'e.g. Director Flight Operations'} />
          </div>
        </div>

        {role === 'manager' && (
          <div className="field">
            <label>Manager Comments <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional — include previous RIE history for this item)</span></label>
            <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3}
              placeholder="Any comments, previous RIE history for this defect item…" />
          </div>
        )}

        <div className="sig-canvas-wrap">
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 130, display: 'block' }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          />
        </div>
        <p className="modal-hint">By signing, I confirm the information in this RIE is accurate and I authorise this request in accordance with DHL Cargo procedures.</p>

        <div className="modal-actions">
          <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={sign} disabled={isEmpty || !name.trim()}>
            {role === 'applicant' ? 'Sign as Applicant' : 'Authorise'}
          </button>
        </div>
      </div>
    </div>
  )
}
