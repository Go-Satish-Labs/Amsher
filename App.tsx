import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Auth from './Auth'
import Library from './Library'
import Editor from './Editor'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (!ready) return <div className="center muted">Loading…</div>
  if (!session) return <Auth />
  return (
    <>
      <header className="top">
        <Link to="/" className="logo"><span className="logo-mark">L</span><span>libris</span></Link>
        <nav className="topnav"><Link to="/">My library</Link><a href="#about">The workspace</a></nav>
        <span className="user-pill">{session.user.email}</span>
        <button className="ghost logout" onClick={() => supabase.auth.signOut()}>Log out</button>
      </header>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/book/:id" element={<Editor />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  )
}
