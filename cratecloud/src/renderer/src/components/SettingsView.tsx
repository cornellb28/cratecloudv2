import { useEffect, useRef, useState } from 'react'
import { useBillingStore, type PlanId } from '../stores/useBillingStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useFolderStore } from '../stores/useFolderStore'
import { useLibraryRootsStore } from '../stores/useLibraryRootsStore'
import { useImport } from '../hooks/useImport'

const PLAN_COPY: Record<PlanId, { title: string; price: string; blurb: string }> = {
  pro: {
    title: 'Pro',
    price: '$39 one-time',
    blurb: 'Unlimited crates, folders, and Serato export for a single seat.',
  },
  corporate: {
    title: 'Corporate',
    price: '$199 / seat, one-time',
    blurb: 'Everything in Pro, licensed per seat for your whole team.',
  },
}

function PlanButton({
  plan,
  currentPlan,
  disabled,
  onSelect,
}: {
  plan: PlanId
  currentPlan: string
  disabled: boolean
  onSelect: () => void
}): React.JSX.Element {
  if (currentPlan === plan) {
    return (
      <button className="btn btn-outline" disabled>
        Current plan
      </button>
    )
  }
  if (plan === 'pro' && currentPlan === 'corporate') {
    return (
      <button className="btn btn-outline" disabled>
        Included in Corporate
      </button>
    )
  }
  return (
    <button className="btn btn-solid" onClick={onSelect} disabled={disabled}>
      Select {PLAN_COPY[plan].title}
    </button>
  )
}

export function SettingsView(): React.JSX.Element {
  const {
    plan, seats, pendingCheckout, activatedAt, licenseKeyMasked,
    loading, error, activationError, highlightPlanCard,
    init, selectPlan, cancelPendingCheckout, checkPendingNow, dismissError,
    activateLicense, deactivateLicense, dismissActivationError, setHighlightPlanCard,
  } = useBillingStore()
  const [corporateSeats, setCorporateSeats] = useState(5)
  const [licenseInput, setLicenseInput] = useState('')
  const proCardRef = useRef<HTMLDivElement>(null)

  const initFromDb = useLibraryStore((s) => s.initFromDb)
  const reinitFolders = useFolderStore((s) => s.init)
  const { importPaths } = useImport()
  const [rescanning, setRescanning] = useState(false)
  const [rescanStatus, setRescanStatus] = useState<string | null>(null)

  const {
    roots, scanning, lastScanResult,
    init: initRoots, importRoot, stopTracking, clearLastScanResult,
  } = useLibraryRootsStore()
  const [rootError, setRootError] = useState<string | null>(null)

  const handleRescanRoot = async (rootPath: string): Promise<void> => {
    setRootError(null)
    try {
      await importRoot(rootPath)
    } catch (err) {
      setRootError(String(err))
    }
  }

  const handleAddLibraryRoot = async (): Promise<void> => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    await handleRescanRoot(folder)
  }

  const handleRescan = async (): Promise<void> => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    setRescanning(true)
    setRescanStatus('Checking for moved or renamed files…')
    try {
      const { relinked, stillMissing } = await window.api.library.rescanFolder(folder)
      await Promise.all([initFromDb(), reinitFolders()])
      setRescanStatus(
        relinked > 0 || stillMissing > 0
          ? `Relinked ${relinked} track${relinked === 1 ? '' : 's'}` +
            (stillMissing > 0 ? `, ${stillMissing} still missing.` : '.')
          : 'No moved or renamed files found.'
      )
      // Anything genuinely new in this folder goes through the normal import path.
      await importPaths([folder])
    } finally {
      setRescanning(false)
    }
  }

  useEffect(() => {
    init()
    initRoots()
  }, [])

  useEffect(() => {
    if (highlightPlanCard !== 'pro') return
    proCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => setHighlightPlanCard(null), 1800)
    return () => clearTimeout(timer)
  }, [highlightPlanCard, setHighlightPlanCard])

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h2>Settings</h2>
        <div className="settings-current-plan">
          Current plan: <strong>{plan === 'free' ? 'Free' : PLAN_COPY[plan].title}</strong>
          {plan === 'corporate' && seats > 0 && <span> &middot; {seats} seat{seats === 1 ? '' : 's'}</span>}
        </div>
      </div>

      {pendingCheckout && (
        <div className="settings-pending-banner">
          <span>
            Waiting for payment confirmation for {PLAN_COPY[pendingCheckout.plan].title}
            {pendingCheckout.plan === 'corporate' ? ` (${pendingCheckout.seats} seats)` : ''}&hellip;
          </span>
          <div className="settings-pending-actions">
            <button className="settings-link-btn" onClick={() => checkPendingNow()} disabled={loading}>
              I've paid — check now
            </button>
            <button className="settings-link-btn danger" onClick={() => cancelPendingCheckout()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={`settings-error-banner${error.reason === 'already-owned' ? ' info' : ''}`}>
          <span>{error.message}</span>
          <button className="settings-link-btn" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}

      <div className="settings-plans">
        <div className="settings-plan-card">
          <div className="settings-plan-title">Free</div>
          <div className="settings-plan-price">$0</div>
          <p className="settings-plan-blurb">Core library, boards, and tagging.</p>
          <button className="btn btn-outline" disabled>
            {plan === 'free' ? 'Current plan' : 'Included'}
          </button>
        </div>

        <div
          ref={proCardRef}
          className={`settings-plan-card${highlightPlanCard === 'pro' ? ' highlight' : ''}`}
        >
          <div className="settings-plan-title">{PLAN_COPY.pro.title}</div>
          <div className="settings-plan-price">{PLAN_COPY.pro.price}</div>
          <p className="settings-plan-blurb">{PLAN_COPY.pro.blurb}</p>
          <PlanButton
            plan="pro"
            currentPlan={plan}
            disabled={loading || !!pendingCheckout}
            onSelect={() => selectPlan('pro', 1)}
          />
        </div>

        <div className="settings-plan-card">
          <div className="settings-plan-title">{PLAN_COPY.corporate.title}</div>
          <div className="settings-plan-price">{PLAN_COPY.corporate.price}</div>
          <p className="settings-plan-blurb">{PLAN_COPY.corporate.blurb}</p>
          {plan !== 'corporate' && (
            <div className="settings-seat-stepper">
              <button
                onClick={() => setCorporateSeats((n) => Math.max(1, n - 1))}
                disabled={loading || !!pendingCheckout}
              >
                &minus;
              </button>
              <span>{corporateSeats} seat{corporateSeats === 1 ? '' : 's'}</span>
              <button
                onClick={() => setCorporateSeats((n) => Math.min(500, n + 1))}
                disabled={loading || !!pendingCheckout}
              >
                +
              </button>
            </div>
          )}
          <PlanButton
            plan="corporate"
            currentPlan={plan}
            disabled={loading || !!pendingCheckout}
            onSelect={() => selectPlan('corporate', corporateSeats)}
          />
        </div>
      </div>

      {plan === 'corporate' && (
        <div className="settings-seats-placeholder">
          <span>Manage Seats</span>
          <span className="settings-todo-badge">Coming soon</span>
          <p>Assigning and revoking individual team seats isn't built yet — all {seats} seats on this key currently unlock on any machine it's activated on.</p>
        </div>
      )}

      <div className="settings-section">
        <h3>Library Sources</h3>
        <p className="settings-plan-blurb">
          Registered root folders CrateCloud remembers and can rescan without re-importing
          everything. Use "Import Library" in the top bar to add one.
        </p>

        {roots.length === 0 ? (
          <p className="settings-plan-blurb">No library sources registered yet.</p>
        ) : (
          <div className="settings-roots-list">
            {roots.map((r) => (
              <div key={r.id} className="settings-root-row">
                <div className="settings-root-info">
                  <div className="settings-root-name">
                    {r.name}
                    <span className={`settings-root-status settings-root-status-${r.status}`}>{r.status}</span>
                  </div>
                  <div className="settings-root-path">{r.path}</div>
                  <div className="settings-root-meta">
                    {r.last_scanned_at
                      ? `Last scanned ${new Date(r.last_scanned_at * 1000).toLocaleString()}`
                      : 'Never scanned'}
                  </div>
                </div>
                <div className="settings-root-actions">
                  <button
                    className="settings-link-btn"
                    onClick={() => handleRescanRoot(r.path)}
                    disabled={scanning}
                  >
                    Rescan
                  </button>
                  <button
                    className="settings-link-btn danger"
                    onClick={() => stopTracking(r.id)}
                    disabled={scanning}
                    title="Stops tracking this as a library source. Already-imported tracks are kept."
                  >
                    Stop tracking
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-solid" onClick={handleAddLibraryRoot} disabled={scanning}>
          {scanning ? 'Scanning…' : '+ Import Library…'}
        </button>

        {rootError && <p className="settings-error-banner">{rootError}</p>}

        {lastScanResult && (
          <div className="settings-scan-result">
            <span>
              {lastScanResult.total_tracks_found} new track{lastScanResult.total_tracks_found === 1 ? '' : 's'},{' '}
              {lastScanResult.total_folders_found} folders, {lastScanResult.total_files_scanned} files scanned
              {lastScanResult.total_errors > 0 ? `, ${lastScanResult.total_errors} errors` : ''} —{' '}
              {(lastScanResult.scan_duration / 1000).toFixed(1)}s
            </span>
            <button className="settings-link-btn" onClick={clearLastScanResult}>Dismiss</button>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>Rescan for Moved Files</h3>
        <p className="settings-plan-blurb">
          If files were moved or renamed outside CrateCloud (Finder, Serato, Rekordbox), rescan
          their folder to relink them — tags, crates, and board placement are preserved.
        </p>
        <button className="btn btn-solid" onClick={handleRescan} disabled={rescanning}>
          {rescanning ? 'Rescanning…' : 'Rescan Library…'}
        </button>
        {rescanStatus && <p className="settings-plan-blurb">{rescanStatus}</p>}
      </div>

      <div className="settings-section">
        <h3>License Activation</h3>

        {plan === 'free' ? (
          <div className="settings-activation-form">
            <p className="settings-plan-blurb">
              Already purchased on another machine? Paste your license key below to activate it here.
            </p>
            <div className="settings-activation-row">
              <input
                type="text"
                className="settings-key-input"
                placeholder="Paste license key…"
                value={licenseInput}
                onChange={(e) => setLicenseInput(e.target.value)}
                disabled={loading}
              />
              <button
                className="btn btn-solid"
                disabled={loading || !licenseInput.trim()}
                onClick={async () => {
                  const ok = await activateLicense(licenseInput)
                  if (ok) setLicenseInput('')
                }}
              >
                Activate
              </button>
            </div>
            {activationError && (
              <div className="settings-error-banner">
                <span>{activationError}</span>
                <button className="settings-link-btn" onClick={dismissActivationError}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="settings-activation-status">
            <div>
              License key: <code>{licenseKeyMasked}</code>
            </div>
            <div>Plan: {PLAN_COPY[plan].title}{plan === 'corporate' ? ` (${seats} seats)` : ''}</div>
            {activatedAt && (
              <div>Activated: {new Date(activatedAt * 1000).toLocaleDateString()}</div>
            )}
            <button className="settings-link-btn danger" onClick={() => deactivateLicense()}>
              Deactivate license
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
