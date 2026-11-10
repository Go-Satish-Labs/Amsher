import { useState } from 'react'
import { supabase } from './supabase'

export default function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
    setMsg(error ? error.message : mode === 'up' ? 'Check your email to verify your account.' : '')
    setBusy(false)
  }
  const reset = async () => {
    if (!email) return setMsg('Enter your email first.')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
    setMsg(error ? error.message : 'Password reset email sent.')
  }
  return (
    <div className="auth-page">
      <div className="auth-intro">
        <div className="brand-lockup"><span className="logo-mark">L</span><span>libris</span></div>
        <p className="eyebrow">A place for your thinking</p>
        <h1>Your ideas deserve<br /><em>a beautiful home.</em></h1>
        <p className="intro-copy">A quiet, personal library for writing, research and the thoughts you want to keep.</p>
        <div className="paper-stack"><span>Research</span><span>Journal</span><span>Ideas</span></div>
      </div>
      <form className="card auth" onSubmit={submit}>
      <p className="eyebrow">{mode === 'in' ? 'Welcome back' : 'Start your library'}</p>
      <h2>{mode === 'in' ? 'Enter your library' : 'Create your account'}</h2><p className="muted">Everything you write, in one considered place.</p>
      <input type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password (min 6)" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
      <button disabled={busy}>{mode === 'in' ? 'Log in' : 'Create account'}</button>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted"><a onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'New here? Register' : 'Have an account? Log in'}</a>{' · '}<a onClick={reset}>Forgot password</a></p>
      </form>
    </div>
  )
}
