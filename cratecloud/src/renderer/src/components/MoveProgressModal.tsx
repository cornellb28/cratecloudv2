import { createPortal } from 'react-dom'
import type { Track } from '../types/track'

export type MoveResult = { track: Track; success: boolean; newPath?: string; error?: string }

export function MoveProgressModal({
  results,
  onClose,
}: {
  results: MoveResult[]
  onClose: () => void
}): React.JSX.Element {
  const ok = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  return createPortal(
    <div className="ted-backdrop" onClick={onClose}>
      <div className="mpm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="spm-header">
          <span>Move results</span>
          <button className="ted-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="mpm-summary">
          <span className="mpm-ok">{ok.length} moved</span>
          {failed.length > 0 && <span className="mpm-fail">{failed.length} failed</span>}
        </div>
        <div className="mpm-list">
          {results.map((r) => (
            <div key={r.track.id} className={`mpm-row${r.success ? ' mpm-row-ok' : ' mpm-row-fail'}`}>
              <span className="mpm-row-icon">{r.success ? '✓' : '✗'}</span>
              <span className="mpm-row-title">{r.track.title}</span>
              {!r.success && <span className="mpm-row-err">{r.error}</span>}
            </div>
          ))}
        </div>
        <div className="spm-footer">
          <button className="spm-create-btn" onClick={onClose} type="button">Done</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
