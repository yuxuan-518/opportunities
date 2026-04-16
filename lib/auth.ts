import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

export function verifyAdmin(req: NextRequest) {
  // 先从 cookie 读（新方式）
  const cookieToken = req.cookies.get('admin_token')?.value
  // 再从 Authorization header 读（向后兼容）
  const auth = req.headers.get('authorization')
  const headerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : null

  const token = cookieToken || headerToken
  if (!token) return null

  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as { id: string; username: string; display_name: string }
  } catch {
    return null
  }
}