import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from './supabase'

type Section = { id: string; title: string; sort_order: number }
type PageRow = { id: string; title: string; section_id: string | null; sort_order: number }
type PageImage = { path: string; url: string; x: number; y: number; width: number }
type Cur = { id: string; title: string; text: string; html: string; version: number; images: PageImage[] }

export default function Editor() {
  const { id } = useParams()
  const [bookTitle, setBookTitle] = useState('')
  const [sections, setSections] = useState<Section[]>([])
  const [pages, setPages] = useState<PageRow[]>([])
  const [cur, setCur] = useState<Cur | null>(null)
  const [status, setStatus] = useState('Saved')
  const ref = useRef<Cur | null>(null), timer = useRef<number>(), dirty = useRef(false)

  const loadAll = async () => {
    const [b, s, p] = await Promise.all([
      supabase.from('books').select('title').eq('id', id).single(),
      supabase.from('sections').select('*').eq('book_id', id).order('sort_order'),
      supabase.from('pages').select('id,title,section_id,sort_order').eq('book_id', id).order('sort_order')])
    setBookTitle(b.data?.title ?? ''); setSections(s.data ?? []); setPages(p.data ?? [])
    return p.data ?? []
  }
  const open = async (pid: string) => {
    if (dirty.current) await save()
    const { data } = await supabase.from('pages').select('id,title,content_json,version').eq('id', pid).single()
    if (!data) return
    const storedImages = Array.isArray(data.content_json?.images) ? data.content_json.images : []
    const images = await Promise.all(storedImages.map(async (image: { path?: string; x?: number; y?: number; width?: number }) => {
      if (!image.path) return null
      const { data: signed, error } = await supabase.storage.from('media').createSignedUrl(image.path, 3600)
      return error || !signed ? null : { path: image.path, url: signed.signedUrl, x: image.x ?? 24, y: image.y ?? 24, width: image.width ?? 520 }
    }))
    const text = data.content_json?.text ?? ''
    const c = { id: data.id, title: data.title, text, html: data.content_json?.html ?? text.split('\n').map((line: string) => `<p>${line || '<br>'}</p>`).join(''), version: data.version, images: images.filter((image): image is PageImage => image !== null) }
    ref.current = c; setCur(c); setStatus('Saved')
  }
  useEffect(() => { loadAll().then(p => p[0] && open(p[0].id)) }, [id])

  const save = async (): Promise<void> => {
    const c = ref.current; if (!c) return
    setStatus('Saving…')
    const { data, error } = await supabase.from('pages')
      .update({ title: c.title, content_json: { type: 'rich', text: c.text, html: c.html, images: c.images.map(({ path }) => ({ path })) } })
      .eq('id', c.id).eq('version', c.version).select('version')
    if (error) { setStatus('Save failed — retrying'); timer.current = window.setTimeout(save, 3000); return }
    if (!data?.length) { setStatus('Conflict: changed elsewhere — reload page'); return }
    if (ref.current) ref.current = { ...ref.current, version: data[0].version }
    dirty.current = false; setStatus('Saved')
  }
  const edit = (patch: Partial<Cur>) => {
    if (!ref.current) return
    ref.current = { ...ref.current, ...patch }; setCur(ref.current); dirty.current = true; setStatus('Unsaved…')
    if (patch.title !== undefined) setPages(ps => ps.map(p => p.id === ref.current!.id ? { ...p, title: patch.title! } : p))
    clearTimeout(timer.current); timer.current = window.setTimeout(save, 800)
  }
  const pasteImage = async (e: React.ClipboardEvent<HTMLElement>) => {
    const image = Array.from(e.clipboardData.items).find(item => item.type.startsWith('image/'))
    if (!image || !cur) return
    e.preventDefault()
    const blob = image.getAsFile()
    if (!blob) return
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      setStatus('Could not upload image — please log in again')
      return
    }
    setStatus('Uploading image…')
    const extension = blob.type.split('/')[1] || 'png'
    const path = `${userData.user.id}/pages/${cur.id}/${Date.now()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('media').upload(path, blob, { contentType: blob.type, upsert: false })
    if (uploadError) {
      setStatus(`Image upload failed: ${uploadError.message}`)
      return
    }
    const { error: assetError } = await supabase.from('media_assets').insert({
      owner_id: userData.user.id, storage_path: path, filename: `pasted-image.${extension}`, mime_type: blob.type, size_bytes: blob.size
    })
    if (assetError) {
      await supabase.storage.from('media').remove([path])
      setStatus(`Image record failed: ${assetError.message}`)
      return
    }
    const { data: signed, error: signedError } = await supabase.storage.from('media').createSignedUrl(path, 3600)
    if (signedError || !signed) {
      setStatus(`Image preview failed: ${signedError?.message ?? 'Could not create image URL'}`)
      return
    }
    edit({ images: [...cur.images, { path, url: signed.signedUrl, x: 24, y: 24 + cur.images.length * 24, width: 520 }] })
  }
  const format = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    if (!contentRef.current || !ref.current) return
    edit({ html: contentRef.current.innerHTML, text: contentRef.current.innerText })
    contentRef.current.focus()
  }
  const contentRef = useRef<HTMLDivElement>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const dragRef = useRef<{ path: string; startX: number; startY: number; imageX: number; imageY: number } | null>(null)
  const resizeRef = useRef<{ path: string; startX: number; width: number } | null>(null)
  const updateImage = (path: string, patch: Partial<PageImage>) => {
    if (!ref.current) return
    edit({ images: ref.current.images.map(image => image.path === path ? { ...image, ...patch } : image) })
  }
  const startDrag = (e: React.PointerEvent, image: PageImage) => {
    e.preventDefault()
    setSelectedImage(image.path)
    dragRef.current = { path: image.path, startX: e.clientX, startY: e.clientY, imageX: image.x, imageY: image.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const moveImage = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const d = dragRef.current
      updateImage(d.path, { x: Math.max(0, d.imageX + e.clientX - d.startX), y: Math.max(0, d.imageY + e.clientY - d.startY) })
    }
    if (resizeRef.current) {
      const r = resizeRef.current
      updateImage(r.path, { width: Math.max(120, r.width + e.clientX - r.startX) })
    }
  }
  const stopImageEdit = () => { dragRef.current = null; resizeRef.current = null }
  const startResize = (e: React.PointerEvent, image: PageImage) => {
    e.preventDefault(); e.stopPropagation(); setSelectedImage(image.path)
    resizeRef.current = { path: image.path, startX: e.clientX, width: image.width }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const deleteImage = (path: string) => {
    if (!ref.current || !confirm('Remove this screenshot from the page?')) return
    edit({ images: ref.current.images.filter(image => image.path !== path) })
    supabase.storage.from('media').remove([path])
    supabase.from('media_assets').delete().eq('storage_path', path)
    setSelectedImage(null)
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault() }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const addSection = async () => {
    const title = prompt('Section name'); if (!title) return
    await supabase.from('sections').insert({ book_id: id, title, sort_order: sections.length }); loadAll()
  }
  const addPage = async (sid: string) => {
    const n = pages.filter(p => p.section_id === sid).length
    const { data } = await supabase.from('pages').insert({ book_id: id, section_id: sid, title: 'Untitled', sort_order: n }).select('id').single()
    await loadAll(); if (data) open(data.id)
  }
  const delPage = async (pid: string) => {
    if (!confirm('Delete this page?')) return
    await supabase.from('pages').delete().eq('id', pid)
    const p = await loadAll(); if (cur?.id === pid) { ref.current = null; setCur(null); p[0] && open(p[0].id) }
  }

  return (
    <div className="editor">
      <aside>
        <Link to="/" className="muted">← Library</Link><h2>{bookTitle}</h2>
        {sections.map(s => (<div key={s.id}><div className="sec"><b>{s.title}</b><button className="ghost" onClick={() => addPage(s.id)}>+ page</button></div>
          {pages.filter(p => p.section_id === s.id).map(p => (
            <div key={p.id} className={'pg' + (cur?.id === p.id ? ' on' : '')}>
              <a onClick={() => open(p.id)}>{p.title || 'Untitled'}</a><button className="ghost" onClick={() => delPage(p.id)}>×</button></div>))}</div>))}
        <button className="ghost" onClick={addSection}>+ Add section</button>
      </aside>
      <section className="paperwrap">
        <div className="status">{status}</div>
        {cur ? <div className="paper">
          <input className="ptitle" value={cur.title} onChange={e => edit({ title: e.target.value })} placeholder="Untitled" />
          <div className="formatbar" aria-label="Formatting toolbar">
            <button type="button" onMouseDown={e => { e.preventDefault(); format('formatBlock', 'h2') }}>H</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); format('bold') }}><b>B</b></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); format('italic') }}><i>I</i></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); format('underline') }}><u>U</u></button>
            <button type="button" onMouseDown={e => { e.preventDefault(); format('insertUnorderedList') }}>• List</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); format('insertOrderedList') }}>1. List</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); format('createLink', window.prompt('Paste link URL') || '') }}>Link</button>
          </div>
          <div ref={contentRef} className="rich-editor" contentEditable suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: cur.html }} onInput={e => edit({ html: e.currentTarget.innerHTML, text: e.currentTarget.innerText })}
            onPaste={pasteImage} data-placeholder="Start writing…"
          />
          {cur.images.length > 0 && <div className="image-canvas" onPointerMove={moveImage} onPointerUp={stopImageEdit}>
            {cur.images.map(image => <div key={image.path} className={'image-object' + (selectedImage === image.path ? ' selected' : '')}
              style={{ left: image.x, top: image.y, width: image.width }} onPointerDown={e => startDrag(e, image)}>
              <img src={image.url} alt="Pasted screenshot" draggable={false} />
              {selectedImage === image.path && <><button className="image-delete" type="button" onPointerDown={e => e.stopPropagation()} onClick={() => deleteImage(image.path)}>×</button>
                <span className="image-resize" onPointerDown={e => startResize(e, image)} /></>}
            </div>)}
          </div>}
        </div> : <p className="muted empty">Select or add a page.</p>}
      </section>
    </div>
  )
}
