import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

export function verifyAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { id: string; username: string; display_name: string }
  } catch {
    return null
  }
}
