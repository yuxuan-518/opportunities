import { createClient } from '@supabase/supabase-js'

// 公开 client，使用 anon key，可以在客户端组件里安全 import
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)