import { stripe } from '../lib/stripe'
import { signLicense } from '../lib/license'
import { isPlanId } from '../lib/plans'

// Stateless on purpose: this deployment has no database. Rather than trusting
// the webhook to have written a fulfillment record somewhere, this endpoint
// asks Stripe directly whether the session is paid and mints the license
// token on demand. Safe to call repeatedly — same session always yields the
// same entitlement, so retries from the desktop app are harmless.
export default async function handler(req: any, res: any): Promise<void> {
  const sessionId = req.method === 'GET' ? req.query.session_id : req.body?.sessionId

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Missing session_id' })
    return
  }

  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId)

    if (session.mode !== 'payment' || session.payment_status !== 'paid') {
      // Checkout Sessions expire ~24h after creation but Stripe still returns
      // them with a 200 (status: 'expired') rather than erroring — surface
      // that distinctly so the app can drop an abandoned checkout instead of
      // polling it forever.
      res.status(200).json({
        paid: false,
        status: session.status === 'expired' ? 'expired' : session.payment_status,
      })
      return
    }

    const plan = session.metadata?.plan
    const seats = Number(session.metadata?.seats ?? '1')

    if (!isPlanId(plan)) {
      res.status(400).json({ error: 'Session missing plan metadata' })
      return
    }

    const token = signLicense({ plan, seats, sessionId: session.id })
    res.status(200).json({ paid: true, plan, seats, token })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
