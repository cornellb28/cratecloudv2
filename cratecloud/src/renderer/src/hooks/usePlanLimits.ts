import { useBillingStore } from '../stores/useBillingStore'

export type FeatureKey =
  | 'trackMatch'
  | 'duplicateDetection'
  | 'bulkEdit'
  | 'seratoExport'
  | 'seratoImport'
  | 'customStatuses'
  | 'unlimitedTracks'
  | 'unlimitedBoards'

const FREE_TRACK_LIMIT = 500
const FREE_BOARD_LIMIT = 2

// Anything not listed here is available on every plan. Serato export is
// deliberately absent — confirmed Free tier, despite being a FeatureKey.
// customStatuses mirrors unlimitedBoards: boards ARE the status columns,
// there's no separate status entity in this app.
const PRO_GATED: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  'trackMatch',
  'duplicateDetection',
  'bulkEdit',
  'seratoImport',
  'customStatuses',
  'unlimitedTracks',
  'unlimitedBoards',
])

export type PlanLimits = {
  plan: 'free' | 'pro' | 'corporate'
  isLocked: (feature: FeatureKey) => boolean
  trackLimit: number
  boardLimit: number
}

export function usePlanLimits(): PlanLimits {
  const plan = useBillingStore((s) => s.plan)
  const isPaid = plan !== 'free'

  return {
    plan,
    isLocked: (feature) => !isPaid && PRO_GATED.has(feature),
    trackLimit: isPaid ? Infinity : FREE_TRACK_LIMIT,
    boardLimit: isPaid ? Infinity : FREE_BOARD_LIMIT,
  }
}
