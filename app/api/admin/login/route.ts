// import { NextRequest, NextResponse } from 'next/server'
// import { supabaseAdmin } from '@/lib/supabase-server'
// import bcrypt from 'bcryptjs'
// import jwt from 'jsonwebtoken'

// export async function POST(req: NextRequest) {
//   const { username, password } = await req.json()

//   const { data: admin, error } = await supabaseAdmin
//     .from('admins')
//     .select('*')
//     .eq('username', username)
//     .single()

//   if (error || !admin) {
//     return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
//   }

//   const valid = await bcrypt.compare(password, admin.password_hash)
//   if (!valid) {
//     return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
//   }

//   const token = jwt.sign(
//     { id: admin.id, username: admin.username, display_name: admin.display_name },
//     process.env.JWT_SECRET!,
//     { expiresIn: '24h' }
//   )

//   return NextResponse.json({ token, admin: { id: admin.id, username: admin.username, display_name: admin.display_name } })
// }

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const { data: admin, error } = await supabaseAdmin
    .from('admins')
    .select('*')
    .eq('username', username)
    .single()

  if (error || !admin) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, admin.password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username, display_name: admin.display_name },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  )

  const res = NextResponse.json({
    admin: { id: admin.id, username: admin.username, display_name: admin.display_name }
  })

  // 存到 httpOnly cookie，JS 无法读取
  res.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24小时
    path: '/'
  })

  return res
}
