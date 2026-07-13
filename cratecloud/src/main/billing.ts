import { app, shell } from 'electron'
import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import { getSetting, setSetting, deleteSetting } from './db'

export type PlanId = 'pro' | 'corporate'
export type UserPlan = 'free' | PlanId

// Public half of the RS256 keypair whose private half lives only in the
// server/ deployment's LICENSE_PRIVATE_KEY env var. The app can verify a
// license token's authenticity with this but can never mint one — forging a
// paid-tier unlock would require the private key, which never ships here.
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy/C37TV4rxWhALSKho2e
kC5ui0bNdG6k8ILCJRpXL8cOC8qtZh3x/oHvkG4HIrB8wuUXQ7HaxxWqo4BHKcsl
xhRE05cH4au4JT6vGAbwx2StzqWW7OA0fja9HPkjxg5C8vy7Sjo5ysQd1vQ4HwR+
YW8JRVDMO23ljCofumjD7+IQpL0im8ptDdK+58LNBbMrmNuObpMwYESJj8y/r/kU
BllmJm1SzF6JwImOJ82uSv4DrXoKkMHXJNJN/lpWrYhz7tMP6tl7XGWVeYltRiXA
Ny8NMQrQUmZhP4UL3Ul5xDCO6vEqSLqY3ql6QEwYtB10Jco0h5I+371nHS2Huyj+
1QIDAQAB
-----END PUBLIC KEY-----`

// Base URL of the deployed server/ Vercel project, e.g. https://cratecloud-billing.vercel.app
// Set via env until the project is deployed and a permanent URL exists.
const BILLING_API_BASE = process.env.CRATECLOUD_BILLING_API ?? ''

type LicenseClaims = { plan: PlanId; seats: number; sessionId: string; iat?: number }

type PendingCheckout = { sessionId: string; plan: PlanId; seats: number; createdAt: number }

export type BillingState = {
  plan: UserPlan
  seats: number
  pendingCheckout: PendingCheckout | null
  activatedAt: number | null
  licenseKeyMasked: string | null
}

// Shows enough of the token to recognize it, not enough to be useful to anyone else.
function maskLicenseKey(token: string): string {
  if (token.length <= 20) return '••••'
  return `${token.slice(0, 10)}…${token.slice(-8)}`
}

const PLAN_RANK: Record<UserPlan, number> = { free: 0, pro: 1, corporate: 2 }

function getDeviceId(): string {
  let id = getSetting('device_id')
  if (!id) {
    id = randomUUID()
    setSetting('device_id', id)
  }
  return id
}

type LicenseInfo = { plan: UserPlan; seats: number; activatedAt: number | null; licenseKeyMasked: string | null }

function readLicense(): LicenseInfo {
  const token = getSetting('license_token')
  if (!token) return { plan: 'free', seats: 0, activatedAt: null, licenseKeyMasked: null }
  try {
    const claims = jwt.verify(token, LICENSE_PUBLIC_KEY, {
      algorithms: ['RS256'],
      issuer: 'cratecloud',
    }) as LicenseClaims
    return {
      plan: claims.plan,
      seats: claims.seats,
      activatedAt: claims.iat ?? null,
      licenseKeyMasked: maskLicenseKey(token),
    }
  } catch {
    // Corrupt, tampered, or otherwise untrustworthy — never trust a raw token blindly.
    deleteSetting('license_token')
    return { plan: 'free', seats: 0, activatedAt: null, licenseKeyMasked: null }
  }
}

function readPendingCheckout(): PendingCheckout | null {
  const raw = getSetting('pending_checkout')
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingCheckout
  } catch {
    return null
  }
}

export function getBillingState(): BillingState {
  const { plan, seats, activatedAt, licenseKeyMasked } = readLicense()
  return { plan, seats, activatedAt, licenseKeyMasked, pendingCheckout: readPendingCheckout() }
}

export function cancelPendingCheckout(): void {
  deleteSetting('pending_checkout')
}

// Manual activation path: the "license key" a user pastes here is the same
// signed JWT the automatic checkout flow stores — there's no separate short
// key format or server-side key registry (that would need persistent storage
// this deployment deliberately doesn't have). This just lets someone paste
// that same credential on a second machine, or recover from a missed
// deep-link/poll, without hitting the network at all — verification is a
// pure local signature check, identical to what happens on every app launch.
export function activateLicenseKey(rawKey: string): { ok: true; state: BillingState } | { ok: false; error: string } {
  const token = rawKey.trim()
  if (!token) {
    return { ok: false, error: 'Paste a license key first.' }
  }

  try {
    jwt.verify(token, LICENSE_PUBLIC_KEY, { algorithms: ['RS256'], issuer: 'cratecloud' })
  } catch (err) {
    const message =
      (err as { name?: string }).name === 'TokenExpiredError'
        ? 'This license key has expired.'
        : 'Invalid license key.'
    return { ok: false, error: message }
  }

  // TODO: once purchases are tracked server-side, reject keys already
  // activated on another device (currently unenforceable — tokens carry no
  // device binding, so the same key can be pasted anywhere).
  setSetting('license_token', token)
  return { ok: true, state: getBillingState() }
}

export function deactivateLicense(): BillingState {
  deleteSetting('license_token')
  return getBillingState()
}

export async function startCheckout(
  plan: PlanId,
  seats: number
): Promise<{ ok: true } | { ok: false; error: string; reason?: 'already-owned' }> {
  if (!BILLING_API_BASE) {
    return { ok: false, error: 'Billing server is not configured (CRATECLOUD_BILLING_API is unset).' }
  }

  const current = readLicense()
  if (PLAN_RANK[plan] <= PLAN_RANK[current.plan]) {
    return {
      ok: false,
      reason: 'already-owned',
      error:
        current.plan === 'corporate'
          ? "You're already on Corporate — there's nothing higher to buy."
          : 'You already own Pro. Upgrade to Corporate for team seats instead.',
    }
  }

  const deviceId = getDeviceId()
  const quantity = plan === 'corporate' ? Math.max(1, Math.floor(seats)) : 1

  let res: Response
  try {
    res = await fetch(`${BILLING_API_BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, seats: quantity, deviceId }),
    })
  } catch (err) {
    return { ok: false, error: `Could not reach billing server: ${(err as Error).message}` }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    return { ok: false, error: body.error ?? `Checkout request failed (${res.status})` }
  }

  const { url, sessionId } = (await res.json()) as { url: string; sessionId: string }

  const pending: PendingCheckout = { sessionId, plan, seats: quantity, createdAt: Date.now() }
  setSetting('pending_checkout', JSON.stringify(pending))

  await shell.openExternal(url)
  return { ok: true }
}

// Re-checks a pending (or just-returned) checkout session against Stripe and,
// if paid, stores the signed license token. Safe to call repeatedly — never
// trusts a bare "success" redirect on its own, only a live Stripe lookup.
export async function verifyPendingCheckout(
  sessionIdHint?: string
): Promise<BillingState & { justUnlocked: boolean }> {
  const pending = readPendingCheckout()
  const sessionId = sessionIdHint ?? pending?.sessionId

  if (!sessionId || !BILLING_API_BASE) {
    return { ...getBillingState(), justUnlocked: false }
  }

  try {
    const res = await fetch(
      `${BILLING_API_BASE}/api/verify-session?session_id=${encodeURIComponent(sessionId)}`
    )

    if (!res.ok) {
      // Session lookup failed outright (expired/invalid/unknown id) — treat as abandoned.
      if (pending?.sessionId === sessionId) cancelPendingCheckout()
      return { ...getBillingState(), justUnlocked: false }
    }

    const data = (await res.json()) as
      | { paid: true; plan: PlanId; seats: number; token: string }
      | { paid: false; status: string }

    if (!data.paid) {
      // Expired sessions are abandoned for good — drop the pending checkout so
      // the UI doesn't poll a dead session forever. Anything else (open/unpaid)
      // may still complete, so leave it in place for the app to retry later.
      if (data.status === 'expired' && pending?.sessionId === sessionId) cancelPendingCheckout()
      return { ...getBillingState(), justUnlocked: false }
    }

    setSetting('license_token', data.token)
    if (pending?.sessionId === sessionId) cancelPendingCheckout()
    return { ...getBillingState(), justUnlocked: true }
  } catch {
    // Network error — leave pending checkout as-is, caller (or next launch) can retry.
    return { ...getBillingState(), justUnlocked: false }
  }
}

// ── cratecloud:// deep link handling ─────────────────────────────────────────
// Stripe Checkout redirects the system browser to our /api/return endpoint,
// which bounces it to cratecloud://checkout-return?session_id=...&result=...
// so Electron can verify+unlock immediately instead of waiting for relaunch.
export function parseCheckoutReturnUrl(
  raw: string
): { sessionId: string | null; result: 'success' | 'cancel' } | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'cratecloud:' || url.hostname !== 'checkout-return') return null
  return {
    sessionId: url.searchParams.get('session_id'),
    result: url.searchParams.get('result') === 'success' ? 'success' : 'cancel',
  }
}

export function registerBillingProtocol(): void {
  if (!app.isDefaultProtocolClient('cratecloud')) {
    app.setAsDefaultProtocolClient('cratecloud')
  }
}
