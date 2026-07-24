import { useGoToUpgrade } from '../utils/upgrade'

type Props = {
  featureName: string
  description?: string
}

// Tab-level lock: replaces the whole view, reuses the existing
// .view-placeholder pattern rather than a one-off layout.
export function LockedView({ featureName, description }: Props): React.JSX.Element {
  const goToUpgrade = useGoToUpgrade()

  return (
    <div className="view-placeholder">
      <div className="view-placeholder-icon">🔒</div>
      <div className="view-placeholder-title">{featureName} is a Pro feature</div>
      {description && <div className="view-placeholder-sub">{description}</div>}
      <button className="bem-btn primary" style={{ marginTop: 12 }} onClick={goToUpgrade}>
        Upgrade to Pro
      </button>
    </div>
  )
}
