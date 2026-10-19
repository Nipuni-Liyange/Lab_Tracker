import { useEffect, useRef, useState } from 'react'

export function EquipmentImage({ src, alt, children, className = '' }) {
  const [failedSource, setFailedSource] = useState(null)
  if (!src || failedSource === src) return children
  return <img className={`ws-equipment-image ${className}`} src={src} alt={alt} loading="lazy" onError={() => setFailedSource(src)} />
}

export function EquipmentImageField({ currentUrl, onChange, disabled }) {
  const input = useRef(null)
  const [selection, setSelection] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => () => { if (selection) URL.revokeObjectURL(selection.url) }, [selection])

  function choose(event) {
    const file = event.target.files?.[0]
    const message = file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name))
      ? 'Choose a JPG, PNG or WebP image.'
      : file?.size > 5 * 1024 * 1024 ? 'Image must be 5 MB or smaller.' : ''
    event.target.setCustomValidity(message)
    setError(message)
    setSelection(file && !message ? { name: file.name, url: URL.createObjectURL(file) } : null)
    onChange(message ? null : file || null)
  }
  function reset() {
    input.current.value = ''
    input.current.setCustomValidity('')
    setSelection(null); setError(''); onChange(null)
  }

  return <div className="ws-image-field">
    <label>Equipment image<input ref={input} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={disabled} onChange={choose} aria-describedby="equipment-image-help equipment-image-error" /></label>
    <p id="equipment-image-help" className="ws-muted">JPG, PNG or WebP · maximum 5 MB. Choose a new file to replace the current image when you save.</p>
    <div id="equipment-image-error" role={error ? 'alert' : undefined}>{error}</div>
    {(selection || currentUrl) && <div className="ws-image-preview"><EquipmentImage src={selection?.url || currentUrl} alt={selection ? `Preview: ${selection.name}` : 'Current equipment image'}><p className="ws-muted">Image preview unavailable.</p></EquipmentImage></div>}
    {(selection || error) && <button className="ws-text-button" type="button" disabled={disabled} onClick={reset}>{currentUrl ? 'Keep current image' : 'Clear selection'}</button>}
  </div>
}
