import { useRef, useEffect, useState, useCallback } from 'react'

export default function SignaturePad({ role, signerName, onSign, onCancel }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [name, setName] = useState(signerName || '')

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    // High-DPI
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

  function onUp(e) {
    e.preventDefault()
    drawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }

  function sign() {
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onSign(dataUrl, name)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>
          {role === 'applicant' ? 'Sign as Applicant' : 'Sign as Authorising Manager'}
        </h2>
        <p className="subtitle">Draw your signature in the box below</p>

        <div className="field">
          <label>Full Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <div className="sig-canvas-wrap">
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 140, display: 'block' }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          />
        </div>
        <p className="modal-hint">By signing, I confirm the information in this RIE is accurate and I authorise this request in accordance with DHL Cargo procedures.</p>

        <div className="modal-actions">
          <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={sign}
            disabled={isEmpty || !name.trim()}
          >
            {role === 'applicant' ? 'Sign as Applicant' : 'Authorise'}
          </button>
        </div>
      </div>
    </div>
  )
}
