// Stripe Checkout redirects the system browser here after payment (or cancellation).
// Electron can't receive that redirect directly, so this page bounces the browser
// to the app's registered custom protocol, which the OS hands to CrateCloud.
export default function handler(req: any, res: any): void {
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : ''
  const result = req.query.result === 'success' ? 'success' : 'cancel'

  const params = new URLSearchParams({ result })
  if (sessionId) params.set('session_id', sessionId)
  const deepLink = `cratecloud://checkout-return?${params.toString()}`

  res.setHeader('Content-Type', 'text/html')
  res.status(200).send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>CrateCloud</title></head>
  <body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 15vh; background: #111; color: #eee;">
    <h2>${result === 'success' ? 'Payment received' : 'Checkout canceled'}</h2>
    <p>Returning you to CrateCloud&hellip;</p>
    <script>window.location.href = ${JSON.stringify(deepLink)};</script>
    <p><a href="${deepLink}" style="color:#7f77dd;">Click here if nothing happens</a></p>
  </body>
</html>`)
}
