import { create } from 'zustand'

export type PlanId = 'pro' | 'corporate'
export type UserPlan = 'free' | PlanId

export type PendingCheckout = { sessionId: string; plan: PlanId; seats: number; createdAt: number }

export type BillingState = {
  plan: UserPlan
  seats: number
  pendingCheckout: PendingCheckout | null
  activatedAt: number | null
  licenseKeyMasked: string | null
}

type CheckoutError = { message: string; reason?: 'already-owned' }

type BillingStore = BillingState & {
  loading: boolean
  error: CheckoutError | null
  activationError: string | null
  highlightPlanCard: PlanId | null
  setHighlightPlanCard: (plan: PlanId | null) => void
  init: () => Promise<void>
  selectPlan: (plan: PlanId, seats: number) => Promise<void>
  cancelPendingCheckout: () => Promise<void>
  checkPendingNow: () => Promise<void>
  dismissError: () => void
  activateLicense: (rawKey: string) => Promise<boolean>
  deactivateLicense: () => Promise<void>
  dismissActivationError: () => void
}

export const useBillingStore = create<BillingStore>((set) => {
  let unsubscribe: (() => void) | null = null

  return {
    plan: 'free',
    seats: 0,
    pendingCheckout: null,
    activatedAt: null,
    licenseKeyMasked: null,
    loading: false,
    error: null,
    activationError: null,
    highlightPlanCard: null,
    setHighlightPlanCard: (plan) => set({ highlightPlanCard: plan }),

    init: async () => {
      set({ loading: true })
      const state = await window.api.billing.getState()
      set({ ...state, loading: false })

      if (!unsubscribe) {
        unsubscribe = window.api.billing.onUpdated((updated) => set({ ...updated, error: null }))
      }
    },

    selectPlan: async (plan, seats) => {
      set({ error: null, loading: true })
      const result = await window.api.billing.startCheckout(plan, seats)
      if (!result.ok) {
        set({ loading: false, error: { message: result.error, reason: result.reason } })
        return
      }
      const state = await window.api.billing.getState()
      set({ ...state, loading: false })
    },

    cancelPendingCheckout: async () => {
      const state = await window.api.billing.cancelPendingCheckout()
      set({ ...state, error: null })
    },

    checkPendingNow: async () => {
      set({ loading: true })
      const state = await window.api.billing.pollPending()
      set({ ...state, loading: false })
    },

    dismissError: () => set({ error: null }),

    activateLicense: async (rawKey) => {
      set({ activationError: null, loading: true })
      const result = await window.api.billing.activateLicense(rawKey)
      if (!result.ok) {
        set({ loading: false, activationError: result.error })
        return false
      }
      set({ ...result.state, loading: false })
      return true
    },

    deactivateLicense: async () => {
      const state = await window.api.billing.deactivateLicense()
      set({ ...state, activationError: null })
    },

    dismissActivationError: () => set({ activationError: null }),
  }
})
