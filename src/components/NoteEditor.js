'use client'

/**
 * NoteEditor — the writing surface for a single note.
 *
 * Rich text is powered by Tiptap (ProseMirror), but every piece of visible
 * chrome is ours: the toolbar below is plain buttons styled with the app's CSS
 * variables, so notes look like the rest of luminaeVigila rather than like a
 * stock editor drop-in.
 *
 * StarterKit ships markdown-style input rules, so typing works both ways:
 *   **bold**  *italic*  `code`  # heading  > quote  - bullet  1. ordered
 * plus ==highlight== from the Highlight extension and `[] ` for a checkbox.
 *
 * Props
 * ─────
 *  note          Note                       — the note being edited
 *  onChange      (patch) => void            — merged into the note by the parent
 *  onDelete      () => void                 — soft delete (parent shows undo)
 *  linkOptions   { type, id, label }[]      — courses/events/todos to link to
 *  isMobile      bool
 *
 * The editor is uncontrolled between note switches: Tiptap owns the document
 * while you type, and we only push content back in when `note.id` changes.
 * Re-syncing on every keystroke would fight the cursor.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight  from '@tiptap/extension-highlight'
import TaskList   from '@tiptap/extension-task-list'
import TaskItem   from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Image      from '@tiptap/extension-image'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Highlighter,
  List, ListOrdered, ListChecks, Quote, Code, Heading1, Heading2,
  Undo2, Redo2, Star, Pin, Trash2, Bell, BellOff, Link2, Tag, X, Check,
  ArrowUpRight, CalendarPlus, ListPlus, ImagePlus, Loader2,
} from 'lucide-react'
import DatePicker from '@/components/DatePicker'
import { notePlainText, noteDisplayTitle } from '@/lib/notes'
import { imageFilesFrom, uploadNoteImage } from '@/lib/imagePaste'
import TimePicker from '@/components/TimePicker'

// Highlighter swatches — deliberately light so text stays readable in both themes.
export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green',  value: '#bbf7d0' },
  { name: 'Blue',   value: '#bfdbfe' },
  { name: 'Pink',   value: '#fbcfe8' },
  { name: 'Orange', value: '#fed7aa' },
  { name: 'Purple', value: '#ddd6fe' },
]

// Note card accents — same palette as custom lists so the two features rhyme.
export const NOTE_COLORS = [
  '#3a6fa8', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
]

const AUTOSAVE_MS = 400

// ── Toolbar button ──────────────────────────────────────────────────────────
function TBtn({ active, onClick, title, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      // Keep focus in the document so the current selection survives the click.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${active ? 'var(--blue)' : 'transparent'}`,
        background: active ? 'var(--blue-bg)' : 'transparent',
        color: disabled ? 'var(--text-3)' : active ? 'var(--blue-text)' : 'var(--text-2)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background .12s, border-color .12s, color .12s',
      }}
    >
      {children}
    </button>
  )
}

const Divider = () => (
  <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
)

export default function NoteEditor({
  note, onChange, onDelete, onConvert, linkOptions = [], isMobile = false,
  pushToast, signedIn = false,
}) {
  const [showConvert, setShowConvert] = useState(false)
  const [uploading,   setUploading]   = useState(0)
  const fileInputRef = useRef(null)
  // The toolbar scrolls horizontally (overflow-x: auto), which clips any
  // absolutely-positioned child — so the swatch popover renders through a
  // portal anchored to the button's viewport rect, the same way DatePicker does.
  const [highlightAnchor, setHighlightAnchor] = useState(null) // { top, left } | null
  const highlightBtnRef = useRef(null)
  const [showReminder,   setShowReminder]   = useState(false)
  const [showLink,       setShowLink]       = useState(false)
  const [tagDraft,       setTagDraft]       = useState('')
  const [savedAt,        setSavedAt]        = useState(null)

  const saveTimer  = useRef(null)
  const loadedId   = useRef(null)
  // onChange identity changes every render in the parent; a ref keeps the
  // debounced save from capturing a stale closure without re-creating the editor.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // useEditor is created once (deps: []), so anything its editorProps call must be
  // reached through a ref or it captures the first render's closure forever.
  const editorRef       = useRef(null)
  const insertImagesRef = useRef(null)

  /**
   * Upload each file, then place it at the cursor.
   *
   * Sequential rather than parallel: pasting four screenshots should insert them in
   * the order you picked them, and `setImage` writes at the current selection, which
   * concurrent uploads would race over.
   */
  const insertImages = useCallback(async files => {
    const ed = editorRef.current
    if (!ed || files.length === 0) return

    // An image kept only in this browser's localStorage would vanish the moment the
    // note synced to another device — a broken picture is worse than a clear refusal.
    if (!signedIn) {
      pushToast?.('Sign in to add images', 'Images are stored with your account so they reach your other devices.')
      return
    }

    for (const file of files) {
      setUploading(n => n + 1)
      try {
        const { url } = await uploadNoteImage(file)
        ed.chain().focus().setImage({ src: url, alt: file.name || 'Pasted image' }).run()
      } catch (err) {
        pushToast?.('Could not add image', err?.message || 'Please try again.')
      } finally {
        setUploading(n => n - 1)
      }
    }
  }, [signedIn, pushToast])

  useEffect(() => { insertImagesRef.current = insertImages }, [insertImages])

  const editor = useEditor({
    immediatelyRender: false, // required under SSR — Next renders this on the server first
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link:    { openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing… ** for bold, - for a list, [] for a checkbox' }),
      // allowBase64 stays off on purpose: a data: URI would put the whole image
      // inside the note body, which is exactly the localStorage-and-sync blowup
      // that lib/noteImages.js exists to avoid.
      Image.configure({ allowBase64: false, HTMLAttributes: { class: 'lv-note-img' } }),
    ],
    content: note?.html ?? '',
    editorProps: {
      attributes: { class: 'lv-note-body' },
      // Only claim the event when it actually carries image files — otherwise text,
      // HTML, and ProseMirror's own internal node moves must fall through untouched.
      handlePaste: (view, event) => {
        const files = imageFilesFrom(event.clipboardData)
        if (files.length === 0) return false
        event.preventDefault()
        insertImagesRef.current?.(files)
        return true
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false // dragging a node around inside the document
        const files = imageFilesFrom(event.dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        insertImagesRef.current?.(files)
        return true
      },
    },
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onChangeRef.current({ html: editor.getHTML() })
        setSavedAt(Date.now())
      }, AUTOSAVE_MS)
    },
  }, [])

  useEffect(() => { editorRef.current = editor }, [editor])

  // Swap the document when the user selects a different note. Flush any pending
  // save for the outgoing note first so the last keystrokes aren't dropped.
  useEffect(() => {
    if (!editor || !note) return
    if (loadedId.current === note.id) return
    clearTimeout(saveTimer.current)
    editor.commands.setContent(note.html ?? '', { emitUpdate: false })
    loadedId.current = note.id
    setSavedAt(null)
  }, [editor, note])

  // Escape closes the swatch popover without touching the document.
  useEffect(() => {
    if (!highlightAnchor) return
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); setHighlightAnchor(null) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [highlightAnchor])

  // Flush on unmount so closing the panel mid-sentence still saves.
  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    if (editor && !editor.isDestroyed && loadedId.current) {
      onChangeRef.current({ html: editor.getHTML() })
    }
  }, [editor])

  const activeHighlight = editor?.getAttributes('highlight')?.color

  const addTag = useCallback(() => {
    const t = tagDraft.trim().replace(/^#/, '')
    if (!t) return
    const existing = note.tags ?? []
    if (!existing.some(x => x.toLowerCase() === t.toLowerCase())) {
      onChange({ tags: [...existing, t] })
    }
    setTagDraft('')
  }, [tagDraft, note, onChange])

  if (!note) return null

  return (
    <div className="lv-note-editor-enter" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--surface)' }}>

      {/* ── Title row ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        padding: isMobile ? '12px 14px 8px' : '16px 20px 10px',
      }}>
        <div style={{ width: 4, height: 26, borderRadius: 2, background: note.color, flexShrink: 0 }} />
        <input
          value={note.title ?? ''}
          onChange={e => onChange({ title: e.target.value })}
          placeholder="Untitled note"
          maxLength={120}
          style={{
            flex: 1, minWidth: 0, border: 'none', background: 'transparent',
            color: 'var(--text)', fontSize: isMobile ? '1.05rem' : '1.15rem',
            fontWeight: 800, fontFamily: 'inherit', outline: 'none', padding: 0,
          }}
        />
        <TBtn active={note.pinned} title={note.pinned ? 'Unpin' : 'Pin to top'}
              onClick={() => onChange({ pinned: !note.pinned })}>
          <Pin size={15} fill={note.pinned ? 'currentColor' : 'none'} />
        </TBtn>
        <TBtn active={note.starred} title={note.starred ? 'Unstar' : 'Star'}
              onClick={() => onChange({ starred: !note.starred })}>
          <Star size={15} fill={note.starred ? 'currentColor' : 'none'} />
        </TBtn>
        <TBtn title="Move to trash" onClick={onDelete}>
          <Trash2 size={15} />
        </TBtn>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
        padding: isMobile ? '0 10px 8px' : '0 16px 10px',
        overflowX: 'auto', overflowY: 'visible', position: 'relative',
      }}>
        <TBtn title="Bold (Ctrl+B)"      active={editor?.isActive('bold')}          onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></TBtn>
        <TBtn title="Italic (Ctrl+I)"    active={editor?.isActive('italic')}        onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></TBtn>
        <TBtn title="Underline (Ctrl+U)" active={editor?.isActive('underline')}     onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></TBtn>
        <TBtn title="Strikethrough"      active={editor?.isActive('strike')}        onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></TBtn>

        {/* Highlight — opens a swatch popover in a portal (see highlightAnchor) */}
        <div ref={highlightBtnRef} style={{ flexShrink: 0 }}>
          <TBtn title="Highlight (==text==)" active={editor?.isActive('highlight')}
                onClick={() => {
                  if (highlightAnchor) { setHighlightAnchor(null); return }
                  const r = highlightBtnRef.current?.getBoundingClientRect()
                  if (r) setHighlightAnchor({ top: r.bottom + 6, left: r.left })
                }}>
            <Highlighter size={15} style={activeHighlight ? { color: activeHighlight } : undefined} />
          </TBtn>
        </div>
        {highlightAnchor && typeof document !== 'undefined' && createPortal(
          <>
            <div onClick={() => setHighlightAnchor(null)}
                 style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
            <div className="lv-pop-in" style={{
              position: 'fixed', top: highlightAnchor.top, left: highlightAnchor.left, zIndex: 301,
              display: 'flex', gap: 5, padding: 8, borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-modal)',
            }}>
              {HIGHLIGHT_COLORS.map(c => (
                <button key={c.value} type="button" title={c.name}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { editor?.chain().focus().setHighlight({ color: c.value }).run(); setHighlightAnchor(null) }}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', background: c.value,
                          border: activeHighlight === c.value ? '2px solid var(--text)' : '1px solid var(--border)',
                          cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'transform .12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.18)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
              ))}
              <button type="button" title="Remove highlight"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { editor?.chain().focus().unsetHighlight().run(); setHighlightAnchor(null) }}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: 'transparent',
                        border: '1px solid var(--border)', color: 'var(--text-3)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
                      }}>
                <X size={12} />
              </button>
            </div>
          </>,
          document.body,
        )}

        <Divider />
        <TBtn title="Heading 1"   active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></TBtn>
        <TBtn title="Heading 2"   active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></TBtn>
        <Divider />
        <TBtn title="Bullet list"  active={editor?.isActive('bulletList')}  onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></TBtn>
        <TBtn title="Numbered list" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></TBtn>
        <TBtn title="Checklist ([] )" active={editor?.isActive('taskList')}  onClick={() => editor?.chain().focus().toggleTaskList().run()}><ListChecks size={15} /></TBtn>
        <TBtn title="Quote"        active={editor?.isActive('blockquote')}  onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={15} /></TBtn>
        <TBtn title="Inline code"  active={editor?.isActive('code')}        onClick={() => editor?.chain().focus().toggleCode().run()}><Code size={15} /></TBtn>
        <Divider />

        {/* Images. Paste and drag-drop are the primary paths — this button exists
            for mobile, where there is no comfortable way to do either. */}
        <TBtn title="Add an image (or just paste one)" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus size={15} />
        </TBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={e => {
            const files = [...(e.target.files ?? [])]
            // Reset first, so picking the same file twice in a row still fires onChange.
            e.target.value = ''
            insertImagesRef.current?.(files)
          }}
        />

        <Divider />
        <TBtn title="Undo" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></TBtn>
        <TBtn title="Redo" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={15} /></TBtn>

        {uploading > 0 && (
          <span role="status" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
            marginLeft: 4, fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)',
          }}>
            <Loader2 size={12} style={{ animation: 'gc-spin 1s linear infinite' }} />
            {uploading > 1 ? `Uploading ${uploading} images…` : 'Uploading…'}
          </span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="lv-note-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: isMobile ? '0 14px 16px' : '0 20px 20px',
      }}>
        <EditorContent editor={editor} />
      </div>

      {/* ── Meta bar: colour, tags, reminder, link, save state ─────────── */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid var(--border)',
        padding: isMobile ? '8px 12px' : '9px 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Tag size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          {(note.tags ?? []).map(t => (
            <span key={t} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
              background: 'var(--blue-bg)', color: 'var(--blue-text)',
            }}>
              {t}
              <button type="button" onClick={() => onChange({ tags: note.tags.filter(x => x !== t) })}
                      aria-label={`Remove tag ${t}`}
                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}>
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
            onBlur={addTag}
            placeholder="Add tag…"
            maxLength={24}
            style={{
              border: 'none', background: 'transparent', color: 'var(--text)',
              fontSize: '0.72rem', fontFamily: 'inherit', outline: 'none',
              width: 84, padding: '2px 0',
            }}
          />
        </div>

        {/* Colour swatches + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {NOTE_COLORS.map(c => (
              <button key={c} type="button" title="Note colour"
                      onClick={() => onChange({ color: c })}
                      style={{
                        width: 15, height: 15, borderRadius: '50%', background: c, padding: 0,
                        border: note.color === c ? '2px solid var(--text)' : '1px solid var(--border)',
                        cursor: 'pointer', flexShrink: 0,
                      }} />
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Link to a course / event / task */}
          {linkOptions.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => setShowLink(v => !v)}
                      title={note.linkedTo ? `Linked to ${note.linkedTo.label}` : 'Link to a course, event, or task'}
                      style={metaBtn(!!note.linkedTo)}>
                <Link2 size={12} />
                {note.linkedTo && <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.linkedTo.label}</span>}
              </button>
              {showLink && (
                <>
                  <div onClick={() => setShowLink(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                  <div style={{
                    position: 'absolute', bottom: 28, right: 0, zIndex: 61, width: 240, maxHeight: 260,
                    overflowY: 'auto', borderRadius: 10, background: 'var(--surface)',
                    border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 5,
                  }}>
                    {note.linkedTo && (
                      <button type="button" onClick={() => { onChange({ linkedTo: null }); setShowLink(false) }}
                              style={linkRow(false)}>
                        <X size={12} /> Remove link
                      </button>
                    )}
                    {linkOptions.map(o => (
                      <button key={`${o.type}-${o.id}`} type="button"
                              onClick={() => { onChange({ linkedTo: o }); setShowLink(false) }}
                              style={linkRow(note.linkedTo?.id === o.id)}>
                        <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 800, flexShrink: 0 }}>{o.type}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                        {note.linkedTo?.id === o.id && <Check size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Turn into a task or event */}
          {onConvert && (
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => setShowConvert(v => !v)}
                      title="Turn this note (or the selected text) into a task or event"
                      style={metaBtn(false)}>
                <ArrowUpRight size={12} /> Turn into
              </button>
              {showConvert && (
                <>
                  <div onClick={() => setShowConvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                  <div className="lv-pop-in" style={{
                    position: 'absolute', bottom: 28, right: 0, zIndex: 61, width: 200,
                    borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-md)', padding: 5,
                  }}>
                    <button type="button" style={linkRow(false)}
                            onClick={() => { setShowConvert(false); onConvert('task', convertPayload(editor, note)) }}>
                      <ListPlus size={13} /> Task
                    </button>
                    <button type="button" style={linkRow(false)}
                            onClick={() => { setShowConvert(false); onConvert('event', convertPayload(editor, note)) }}>
                      <CalendarPlus size={13} /> Event
                    </button>
                    <p style={{ fontSize: '0.64rem', color: 'var(--text-3)', margin: '4px 6px 2px', lineHeight: 1.4 }}>
                      Select text first to use just that line as the title.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Reminder */}
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setShowReminder(v => !v)}
                    title={note.reminder ? `Reminder: ${note.reminder.label}` : 'Set a reminder'}
                    style={metaBtn(!!note.reminder)}>
              {note.reminder ? <Bell size={12} /> : <BellOff size={12} />}
              {note.reminder && <span>{note.reminder.label}</span>}
            </button>
            {showReminder && (
              <ReminderPopover
                reminder={note.reminder}
                onClose={() => setShowReminder(false)}
                onSet={r => { onChange({ reminder: r }); setShowReminder(false) }}
              />
            )}
          </div>

          <span style={{ fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 600, minWidth: 52, textAlign: 'right' }}>
            {savedAt ? 'Saved' : relativeTime(note.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Reminder popover ────────────────────────────────────────────────────────
// Notes have no due date, so reminders are always an absolute date + time.
// That maps to the `{ at }` branch of reminderFireTime() in the push cron.
function ReminderPopover({ reminder, onClose, onSet }) {
  const existing = reminder?.at ? new Date(reminder.at) : null
  const [date, setDate] = useState(existing ? toLocalDate(existing) : '')
  const [time, setTime] = useState(existing ? toLocalTime(existing) : '09:00')

  function save() {
    if (!date) return
    const at = new Date(`${date}T${time || '09:00'}:00`)
    if (Number.isNaN(at.getTime())) return
    onSet({
      at: at.toISOString(),
      label: at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    })
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
      <div style={{
        position: 'absolute', bottom: 28, right: 0, zIndex: 61, width: 240,
        borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)', padding: 12,
      }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Remind me
        </div>
        <div style={{ marginBottom: 8 }}><DatePicker value={date} onChange={setDate} placeholder="Pick a date" /></div>
        <div style={{ marginBottom: 12 }}><TimePicker value={time} onChange={setTime} /></div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {reminder && (
            <button type="button" onClick={() => onSet(null)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
              Clear
            </button>
          )}
          <button type="button" onClick={save} disabled={!date}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: date ? 'var(--blue)' : 'var(--surface2)', color: date ? '#fff' : 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: date ? 'pointer' : 'default' }}>
            Set
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * What to carry across when turning a note into a task or event.
 *
 * If there's a selection, that's what the user pointed at — use it as the title
 * and leave the body as supporting detail. Otherwise fall back to the note's
 * own title and text.
 */
function convertPayload(editor, note) {
  const sel = editor?.state
    ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ').trim()
    : ''
  const body = notePlainText(note?.html)
  return {
    noteId: note.id,
    title:  (sel || noteDisplayTitle(note)).slice(0, 120),
    notes:  body,
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function metaBtn(active) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 8px', borderRadius: 7, fontFamily: 'inherit',
    fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
    background: active ? 'var(--blue-bg)' : 'transparent',
    color: active ? 'var(--blue-text)' : 'var(--text-3)',
  }
}

function linkRow(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
    background: active ? 'var(--blue-bg)' : 'transparent',
    color: active ? 'var(--blue-text)' : 'var(--text-2)',
    fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, textAlign: 'left',
  }
}

const pad = n => String(n).padStart(2, '0')
const toLocalDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toLocalTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff)) return ''
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
