import { useRef, useEffect, useState } from 'react'

// mode: 'applicant' | 'manager' sign an RIE; 'enrol' saves the user's reusable signature.
// onSign resolves to an error message (modal stays open) or null (caller closes it).
export default function SignaturePad({ mode, profile, onSign, onCancel }) {
  const enrol = mode === 'enrol'
  const hasSaved = !enrol && !!profile?.signature_image
  const [useSaved, setUseSaved] = useState(hasSaved)
  const [isEmpty, setIsEmpty] = useState(true)
  const [name, setName] = useState(profile?.full_name || '')
  const [position, setPosition] = useState(profile?.department || '')
  const [comments, setComments] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef(null)
  const drawing = useRef(false)

  const drawMode = enrol || !useSaved

  useEffect(() => {
    if (!drawMode) return
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
    setIsEmpty(true)
  }, [drawMode])

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }
  function onDown(e) {
    if (!e.touches) e.preventDefault() // stops mouse drags selecting page text; touch scrolling is off via CSS touch-action
    drawing.current = true
    const { x, y } = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsEmpty(false)
  }
  function onMove(e) {
    if (!drawing.current) return
    const { x, y } = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function onUp() { drawing.current = false }
  function clear() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }

  async function submit() {
    setError('')
    setBusy(true)
    const signature = drawMode ? canvasRef.current.toDataURL('image/png') : undefined
    const err = await onSign({
      signature, use_enrolled: !drawMode, password,
      name, position, manager_comments: mode === 'manager' ? comments : undefined,
    })
    setBusy(false)
    if (err) setError(err)
  }

  const canSubmit = !busy && password && (enrol || name.trim()) && (!drawMode || !isEmpty)
  const title = enrol ? 'My Signature' : mode === 'applicant' ? 'Sign as Applicant' : 'Authorise as Manager'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>{title}</h2>
        <p className="subtitle">
          {enrol
            ? 'Draw your signature once. You can then apply it when signing an RIE — your password is still required every time.'
            : useSaved ? 'Your saved signature will be applied.' : 'Draw your signature in the box below.'}
        </p>

        {!enrol && (
          <div className="field-row">
            <div className="field">
              <label>Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="field">
              <label>Position / Role</label>
              <input type="text" value={position} onChange={e => setPosition(e.target.value)}
                placeholder={mode === 'applicant' ? 'e.g. MOC Engineer' : 'e.g. Chief Pilot'} />
            </div>
          </div>
        )}

        {mode === 'manager' && (
          <div className="field">
            <label>Manager Comments <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional — include previous RIE history for this item)</span></label>
            <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3}
              placeholder="Any comments, previous RIE history for this defect item…" />
          </div>
        )}

        {drawMode ? (
          <div className="sig-canvas-wrap">
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 130, display: 'block' }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
              onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            />
          </div>
        ) : (
          <div className="sig-canvas-wrap sig-saved">
            <img src={profile.signature_image} alt="Your saved signature" />
          </div>
        )}

        {hasSaved && (
          <button type="button" className="link-btn" onClick={() => setUseSaved(!useSaved)}>
            {useSaved ? 'Draw a new signature instead' : 'Use my saved signature'}
          </button>
        )}

        <div className="field" style={{ marginTop: 12 }}>
          <label>Confirm your password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && canSubmit && submit()} />
        </div>

        {!enrol && (
          <p className="modal-hint">By signing, I confirm the information in this RIE is accurate and I authorise this request in accordance with DHL Cargo procedures.</p>
        )}
        {error && <div className="auth-error" style={{ marginTop: 8 }}>{error}</div>}

        <div className="modal-actions">
          {drawMode && <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>}
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Saving…' : enrol ? 'Save Signature' : mode === 'applicant' ? 'Sign as Applicant' : 'Authorise'}
          </button>
        </div>
      </div>
    </div>
  )
}
