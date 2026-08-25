import { useState, type ReactElement } from 'react'
import { useGoToUpgrade } from '../utils/upgrade'

type Props = {
  locked: boolean
  featureName: string
  children: ReactElement
}

// Button-level lock: wraps an existing control without touching its layout.
// Stays clickable — intercepts the click and shows an upgrade prompt instead
// of a dead disabled button.
export function LockBadge({ locked, featureName, children }: Props): React.JSX.Element {
  const [promptOpen, setPromptOpen] = useState(false)
  const goToUpgrade = useGoToUpgrade()

  if (!locked) return children

  return (
    <span
      className="lock-badge-wrap"
      onClickCapture={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setPromptOpen((v) => !v)
      }}
    >
      {children}
      <span className="lock-badge-icon" title={`${featureName} is a Pro feature`}>
        🔒
      </span>
      {promptOpen && (
        <div className="lock-badge-popover" onClick={(e) => e.stopPropagation()}>
          <div className="lock-badge-popover-title">{featureName} is a Pro feature</div>
          <div className="lock-badge-popover-actions">
            <button
              className="btn btn-solid"
              onClick={() => {
                setPromptOpen(false)
                goToUpgrade()
              }}
            >
              Upgrade to Pro
            </button>
            <button className="btn btn-outline" onClick={() => setPromptOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
