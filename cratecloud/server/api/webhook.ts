import type Stripe from 'stripe'
import { stripe } from '../lib/stripe'

// Vercel needs the raw, unparsed body to verify the Stripe signature.
export const config = { api: { bodyParser: false } }

function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// Fulfillment itself happens on-demand in /api/verify-session (this
// deployment has no database to persist a webhook-driven order record into).
// This endpoint exists so Stripe has an authenticated delivery target and so
// events are cryptographically verified — extend it if persistent order
// records, receipts, or fraud monitoring are added later.
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const signature = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    res.status(400).send('Missing signature or webhook secret')
    return
  }

  let event: Stripe.Event
  try {
    const rawBody = await readRawBody(req)
    event = stripe().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    res.status(400).send(`Webhook signature verification failed: ${(err as Error).message}`)
    return
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    console.log('[webhook] checkout completed:', session.id, session.metadata)
  }

  res.status(200).json({ received: true })
}
