import jwt from 'jsonwebtoken'
import type { PlanId } from './plans'

export type LicenseClaims = {
  plan: PlanId
  seats: number
  sessionId: string
}

// Signed with the private half of an RS256 keypair held only here.
// The Electron app ships the public half and can verify but never forge.
export function signLicense(claims: LicenseClaims): string {
  const privateKey = process.env.LICENSE_PRIVATE_KEY
  if (!privateKey) throw new Error('LICENSE_PRIVATE_KEY is not set')

  return jwt.sign(claims, privateKey.replace(/\\n/g, '\n'), {
    algorithm: 'RS256',
    issuer: 'cratecloud',
    subject: claims.sessionId,
  })
}
