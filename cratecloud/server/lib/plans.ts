export type PlanId = 'pro' | 'corporate'

export const PLANS: Record<PlanId, { name: string; unitAmount: number; perSeat: boolean }> = {
  pro: { name: 'CrateCloud Pro (Lifetime)', unitAmount: 3900, perSeat: false },
  corporate: { name: 'CrateCloud Corporate (Lifetime, per seat)', unitAmount: 19900, perSeat: true },
}

export function isPlanId(value: unknown): value is PlanId {
  return value === 'pro' || value === 'corporate'
}
