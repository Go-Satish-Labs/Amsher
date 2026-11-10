import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { TEMPLATES } from './templates'

type Book = { id: string; title: string; book_type: string; cover_color: string; is_favorite: boolean; updated_at: string }

export default function Library() {
  const [books, setBooks] = useState<Book[]>([])
  const [picking, setPicking] = useState(false)
  const [title, setTitle] = useState('')
  const [err, setErr] = useState(''), [q, setQ] = useState('')
  const nav = useNavigate()
  const load = async () => {
    const { data, error } = await supabase.from('books').select('id,title,book_type,cover_color,is_favorite,updated_at')
      .is('deleted_at', null).order('updated_at', { ascending: false })
    error ? setErr(error.message) : setBooks(data ?? [])
  }
  useEffect(() => { load() }, [])
  const create = async (t: (typeof TEMPLATES)[number]) => {
    setErr('')
    const { data: b, error } = await supabase.from('books').insert({ title: title.trim() || t.name, book_type: t.id, cover_color: t.color }).select('id').single()
    if (error || !b) return setErr(error?.message ?? 'Could not create book')
    for (const [i, name] of t.sections.entries()) {
      const { data: s } = await supabase.from('sections').insert({ book_id: b.id, title: name, sort_order: i }).select('id').single()
      if (i === 0 && s) await supabase.from('pages').insert({ book_id: b.id, section_id: s.id, title: 'First page' })
    }
    nav(`/book/${b.id}`)
  }
  const fav = async (b: Book) => { await supabase.from('books').update({ is_favorite: !b.is_favorite }).eq('id', b.id); load() }
  const trash = async (b: Book) => { if (confirm(`Move "${b.title}" to trash?`)) { await supabase.from('books').update({ deleted_at: new Date().toISOString() }).eq('id', b.id); load() } }
  const shown = books.filter(b => b.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite))

  return (
    <main className="wrap">
      <section className="library-hero">
        <div><p className="eyebrow">Your private collection</p><h1>Good ideas<br /><em>need somewhere to live.</em></h1>
          <p className="hero-copy">Write freely. Keep what matters. Return to it whenever you need.</p></div>
        <div className="hero-note"><span className="note-line"></span><b>{books.length.toString().padStart(2, '0')}</b><small>books<br />in your library</small></div>
      </section>
      <div className="library-toolbar"><div><p className="section-label">The shelf</p><h2>My library</h2></div>
        <div className="toolbar-actions"><input placeholder="Search your library" value={q} onChange={e => setQ(e.target.value)} />
        <button onClick={() => setPicking(true)}><span>+</span> New book</button></div></div>
      {err && <p className="err">{err}</p>}
      {!books.length && !picking && <div className="empty"><div className="empty-icon">✦</div><h2>Your shelf is waiting.</h2><p className="muted">Create a first book and give your ideas a place to grow.</p><button onClick={() => setPicking(true)}>Create your first book</button></div>}
      <div className="shelf">{shown.map(b => (
        <div key={b.id} className="book" style={{ background: b.cover_color }}>
          <Link to={`/book/${b.id}`}><h3>{b.title}</h3><small>{TEMPLATES.find(t => t.id === b.book_type)?.name}</small>
            <small>Edited {new Date(b.updated_at).toLocaleDateString()}</small></Link>
          <div className="acts"><button className="ghost" onClick={() => fav(b)}>{b.is_favorite ? '★' : '☆'}</button>
            <button className="ghost" onClick={() => trash(b)}>Trash</button></div>
        </div>))}</div>
      {picking && <div className="modal" onClick={() => setPicking(false)}><div className="card" onClick={e => e.stopPropagation()}>
        <h2>Choose a book</h2>
        <input placeholder="Title (optional)" value={title} onChange={e => setTitle(e.target.value)} />
        <div className="tpl">{TEMPLATES.map(t => (
          <button key={t.id} className="tplbtn" style={{ background: t.color }} onClick={() => create(t)}>
            <b>{t.name}</b><small>{t.desc}</small></button>))}</div>
      </div></div>}
    </main>
  )
}
