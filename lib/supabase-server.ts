import { createClient } from '@supabase/supabase-js'

// ⚠️ 这个文件只能在 API routes 里 import
// 绝对不要在 'use client' 组件里 import
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)