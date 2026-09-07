import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (session === null) return <Navigate to="/login" replace />
  return <>{children}</>
}
