import { stripe } from '../lib/stripe'
import { PLANS, isPlanId } from '../lib/plans'

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const { plan, seats, deviceId } = body as { plan?: string; seats?: number; deviceId?: string }

  if (!isPlanId(plan)) {
    res.status(400).json({ error: 'Invalid plan' })
    return
  }
  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ error: 'Missing deviceId' })
    return
  }

  const planDef = PLANS[plan]
  const quantity = planDef.perSeat ? Math.max(1, Math.floor(Number(seats) || 1)) : 1
  const baseUrl = process.env.PUBLIC_BASE_URL ?? `https://${req.headers.host}`

  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      client_reference_id: deviceId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: planDef.name },
            unit_amount: planDef.unitAmount,
          },
          quantity,
        },
      ],
      metadata: { plan, seats: String(quantity), deviceId },
      success_url: `${baseUrl}/api/return?session_id={CHECKOUT_SESSION_ID}&result=success`,
      cancel_url: `${baseUrl}/api/return?result=cancel`,
    })

    res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
