import { useEffect, useState } from 'react'
import { useBillingStore, type PlanId } from '../stores/useBillingStore'

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
      <button className="settings-plan-btn owned" disabled>
        Current plan
      </button>
    )
  }
  if (plan === 'pro' && currentPlan === 'corporate') {
    return (
      <button className="settings-plan-btn owned" disabled>
        Included in Corporate
      </button>
    )
  }
  return (
    <button className="settings-plan-btn" onClick={onSelect} disabled={disabled}>
      Select {PLAN_COPY[plan].title}
    </button>
  )
}

export function SettingsView(): React.JSX.Element {
  const {
    plan, seats, pendingCheckout, activatedAt, licenseKeyMasked,
    loading, error, activationError,
    init, selectPlan, cancelPendingCheckout, checkPendingNow, dismissError,
    activateLicense, deactivateLicense, dismissActivationError,
  } = useBillingStore()
  const [corporateSeats, setCorporateSeats] = useState(5)
  const [licenseInput, setLicenseInput] = useState('')

  useEffect(() => {
    init()
  }, [])

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
          <button className="settings-plan-btn owned" disabled>
            {plan === 'free' ? 'Current plan' : 'Included'}
          </button>
        </div>

        <div className="settings-plan-card">
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
                className="settings-plan-btn"
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
