import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

type AuthState = 'loading' | 'unauthenticated' | 'not-admin' | 'admin'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading')

  useEffect(() => {
    async function check(session: Session | null) {
      if (!session) {
        setState('unauthenticated')
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      if (error || data?.role !== 'admin') {
        setState('not-admin')
        return
      }
      setState('admin')
    }

    supabase.auth.getSession().then(({ data }) => check(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => check(session))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (state === 'loading') return null
  if (state === 'unauthenticated') return <Navigate to="/login" replace />
  if (state === 'not-admin') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-600">관리자 권한이 없는 계정입니다.</p>
      </div>
    )
  }
  return <>{children}</>
}
