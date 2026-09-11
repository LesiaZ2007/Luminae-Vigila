'use client'

/**
 * NotesPanel — the Notes tab.
 *
 * Two-pane on desktop (note list on the left, editor on the right); on mobile
 * the list fills the screen and selecting a note pushes the editor over it,
 * matching how the rest of the app handles narrow viewports.
 *
 * Trash is a soft delete with a 30-day retention window (see lib/notes.js).
 * Deleting from the editor calls onDelete, and page.js raises an undo toast —
 * this component only ever flips `trashedAt`.
 *
 * Props
 * ─────
 *  notes         Note[]                 — all notes, trashed included
 *  activeNoteId  string | null
 *  onSelect      (id | null) => void
 *  onCreate      () => void             — parent creates + selects a new note
 *  onUpdate      (id, patch) => void
 *  onTrash       (id) => void
 *  onRestore     (id) => void
 *  onPurge       (id) => void           — permanent delete from trash
 *  linkOptions   { type, id, label }[]
 *  isMobile      bool
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  Plus, Search, Star, Pin, Bell, Trash2, ArrowLeft, NotebookPen,
  RotateCcw, X, Link2, Tags, ChevronRight, ChevronDown,
} from 'lucide-react'
import NoteEditor from '@/components/NoteEditor'
import {
  noteDisplayTitle, notePreview, sortNotes, noteMatches, collectTags,
  matchesTagFilter, groupNotesByTag, foldFurledTags, sameTag, tagGroupKey,
  loadFurledTags, saveFurledTags, loadTagGrouping, saveTagGrouping,
} from '@/lib/notes'

const FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'starred', label: 'Starred' },
  { id: 'trash',   label: 'Trash' },
]

export default function NotesPanel({
  notes = [], activeNoteId, onSelect, onCreate, onUpdate,
  onTrash, onRestore, onPurge, onConvert, linkOptions = [], isMobile = false,
  pushToast, signedIn = false,
}) {
  const [query,  setQuery]  = useState('')
  const [filter, setFilter] = useState('all')
  // Several tags can be active at once — see matchesTagFilter for why that ORs.
  const [tags,   setTags]   = useState(() => [])

  // Grouping and furling are view state, restored from localStorage rather than
  // synced (see lib/notes.js). The panel is client-only (`ssr: false` in page.js),
  // so reading storage in the initializer is safe.
  const [grouped, setGrouped] = useState(loadTagGrouping)
  const [furled,  setFurled]  = useState(() => new Set(loadFurledTags()))

  useEffect(() => { saveTagGrouping(grouped) }, [grouped])
  useEffect(() => { saveFurledTags([...furled]) }, [furled])

  const toggleTag = useCallback(t => {
    setTags(prev => (prev.some(x => sameTag(x, t)) ? prev.filter(x => !sameTag(x, t)) : [...prev, t]))
  }, [])

  const toggleFurl = useCallback(key => {
    setFurled(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  // Ids currently playing their removal animation. The note is still in `notes`
  // during this window — we hold the parent's delete until the row has collapsed,
  // otherwise React unmounts it instantly and there's nothing left to animate.
  const [exitingIds, setExitingIds] = useState(() => new Set())
  const exitTimers = useRef([])
  useEffect(() => () => exitTimers.current.forEach(clearTimeout), [])

  const animateOut = useCallback((id, commit) => {
    setExitingIds(prev => new Set(prev).add(id))
    exitTimers.current.push(setTimeout(() => {
      commit(id)
      setExitingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }, 200)) // must match .lv-note-row-exit duration in globals.css
  }, [])

  const handleTrash   = useCallback(id => animateOut(id, onTrash),   [animateOut, onTrash])
  const handlePurge   = useCallback(id => animateOut(id, onPurge),   [animateOut, onPurge])
  const handleRestore = useCallback(id => animateOut(id, onRestore), [animateOut, onRestore])

  // { tag, count }[] — counts are of live notes, so a chip never promises rows
  // it can't show.
  const allTags = useMemo(() => collectTags(notes), [notes])

  const visible = useMemo(() => {
    const inScope = notes.filter(n => (filter === 'trash' ? !!n.trashedAt : !n.trashedAt))
    const filtered = inScope
      .filter(n => (filter === 'starred' ? n.starred : true))
      .filter(n => matchesTagFilter(n, tags))
      .filter(n => noteMatches(n, query))
    return sortNotes(filtered)
  }, [notes, filter, tags, query])

  // Grouping is for browsing the live list; Trash is a flat "what did I throw
  // away" view and stays one list — and furling there would hide exactly what
  // you came to look at, so neither applies to it.
  const canFurl    = filter !== 'trash'
  const showGroups = grouped && canFurl

  /**
   * Asking to see a tag beats having furled it.
   *
   * Clicking a tag chip to filter by it is a direct request for those notes;
   * leaving them folded away behind a bundle row would be answering a question
   * with a shrug. The furl itself is remembered — clear the filter and the tag
   * is folded up again.
   */
  const effectiveFurl = useMemo(() => {
    if (!canFurl) return new Set()
    const selected = new Set(tags.map(tagGroupKey))
    return new Set([...furled].filter(k => !selected.has(k)))
  }, [furled, tags, canFurl])

  const groups = useMemo(() => (showGroups ? groupNotesByTag(visible) : []), [showGroups, visible])

  // The flat list is a mix of note rows and one-row stand-ins for furled tags.
  const items = useMemo(
    () => (showGroups ? [] : foldFurledTags(visible, effectiveFurl)),
    [showGroups, visible, effectiveFurl],
  )

  // Furl-all covers whatever is furlable in the current view: every group when
  // grouped (Untagged included), every tag when flat.
  const furlTargets = useMemo(
    () => (showGroups ? groups.map(g => g.key) : allTags.map(t => tagGroupKey(t.tag))),
    [showGroups, groups, allTags],
  )
  const allFurled = furlTargets.length > 0 && furlTargets.every(k => furled.has(k))
  const furlAll   = useCallback(() => {
    setFurled(prev => {
      const next = new Set(prev)
      for (const key of furlTargets) {
        if (allFurled) next.delete(key); else next.add(key)
      }
      return next
    })
  }, [allFurled, furlTargets])

  const activeNote = notes.find(n => n.id === activeNoteId && !n.trashedAt) ?? null
  const trashCount = notes.filter(n => n.trashedAt).length

  // On mobile the editor takes over the whole tab once a note is open.
  const showList   = !isMobile || !activeNote
  const showEditor = !isMobile || !!activeNote

  return (
    <div className="lv-notes-load" style={{ display: 'flex', height: '100%', minHeight: 0, flex: 1, overflow: 'hidden' }}>

      {/* ── List pane ──────────────────────────────────────────────────── */}
      {showList && (
        <div style={{
          width: isMobile ? '100%' : 300,
          flexShrink: 0,
          borderRight: isMobile ? 'none' : '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          {/* Header */}
          <div style={{ padding: isMobile ? '14px 16px 10px' : '16px 16px 10px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>
                <NotebookPen size={17} style={{ color: 'var(--blue)' }} />
                Notes
              </div>
              <button
                onClick={onCreate}
                title="New note (W)"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                  borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff',
                  fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                }}>
                <Plus size={14} /> New
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search notes…"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '7px 9px 7px 27px',
                  borderRadius: 9, border: '1px solid var(--border)', background: 'var(--input-bg)',
                  color: 'var(--text)', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {FILTERS.map(f => {
                if (f.id === 'trash' && trashCount === 0) return null
                const active = filter === f.id
                return (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                          style={{
                            padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
                            border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                            background: active ? 'var(--blue-bg)' : 'transparent',
                            color: active ? 'var(--blue-text)' : 'var(--text-3)',
                            fontFamily: 'inherit', fontSize: '0.68rem', fontWeight: 700,
                          }}>
                    {f.label}{f.id === 'trash' ? ` (${trashCount})` : ''}
                  </button>
                )
              })}

              <div style={{ flex: 1 }} />

              {/* Group by tag. Hidden until there's a tag to group by, so the
                  control never appears as a toggle that does nothing. */}
              {allTags.length > 0 && filter !== 'trash' && (
                <button
                  onClick={() => setGrouped(v => !v)}
                  title={grouped ? 'Show one flat list' : 'Group notes by tag'}
                  aria-label={grouped ? 'Show one flat list' : 'Group notes by tag'}
                  aria-pressed={grouped}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                    borderRadius: 999, cursor: 'pointer', flexShrink: 0,
                    border: `1px solid ${grouped ? 'var(--blue)' : 'var(--border)'}`,
                    background: grouped ? 'var(--blue-bg)' : 'transparent',
                    color: grouped ? 'var(--blue-text)' : 'var(--text-3)',
                    fontFamily: 'inherit', fontSize: '0.68rem', fontWeight: 700,
                  }}>
                  <Tags size={12} /> Group
                </button>
              )}
            </div>

            {/* Tag chips — multi-select filtering on the left half, furl on the
                right. Two buttons rather than one because a chip does two
                different things, and a click has to mean one of them. */}
            {allTags.length > 0 && filter !== 'trash' && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                {allTags.map(({ tag: t, count }) => {
                  const active   = tags.some(x => sameTag(x, t))
                  const key      = tagGroupKey(t)
                  const isFurled = furled.has(key)
                  return (
                    <span key={t} style={{
                      display: 'inline-flex', alignItems: 'center', borderRadius: 999,
                      border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                      background: active ? 'var(--blue-bg)' : 'transparent',
                      overflow: 'hidden',
                    }}>
                      <button onClick={() => toggleTag(t)}
                              aria-pressed={active}
                              title={`Show only notes tagged ${t} (${count})`}
                              style={{
                                padding: '2px 4px 2px 8px', border: 'none', background: 'transparent',
                                cursor: 'pointer', color: active ? 'var(--blue-text)' : 'var(--text-3)',
                                fontFamily: 'inherit', fontSize: '0.66rem', fontWeight: 700,
                              }}>
                        {t} <span style={{ opacity: .65 }}>{count}</span>
                      </button>
                      <button onClick={() => toggleFurl(key)}
                              aria-label={isFurled ? `Unfurl ${t}` : `Furl ${t}`}
                              aria-pressed={isFurled}
                              title={isFurled
                                ? `Unfurl ${t} — show its notes in the list again`
                                : `Furl ${t} — collapse its notes into one row`}
                              style={{
                                display: 'flex', alignItems: 'center', padding: '2px 5px 2px 3px',
                                border: 'none', background: 'transparent', cursor: 'pointer',
                                color: isFurled ? 'var(--blue-text)' : 'var(--text-3)',
                              }}>
                        {isFurled ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                      </button>
                    </span>
                  )
                })}
                {tags.length > 0 && (
                  <button onClick={() => setTags([])}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px',
                            borderRadius: 999, border: 'none', background: 'transparent',
                            color: 'var(--text-3)', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: '0.64rem', fontWeight: 700,
                          }}>
                    <X size={10} /> Clear
                  </button>
                )}
              </div>
            )}

            {/* Furl-everything shortcut. */}
            {canFurl && furlTargets.length > 0 && (
              <div style={{ display: 'flex', marginTop: 8 }}>
                <button onClick={furlAll}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px',
                          borderRadius: 7, border: 'none', background: 'transparent',
                          color: 'var(--text-3)', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: '0.64rem', fontWeight: 700,
                        }}>
                  {allFurled ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  {allFurled ? 'Unfurl all' : 'Furl all'}
                </button>
              </div>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 10px 12px' }}>
            {visible.length === 0 ? (
              <EmptyState filter={filter} query={query} tags={tags} onCreate={onCreate} />
            ) : showGroups ? (
              groups.map(group => {
                const isFurled = effectiveFurl.has(group.key)
                return (
                  <div key={group.key} style={{ marginBottom: 4 }}>
                    <GroupHeader
                      group={group}
                      furled={isFurled}
                      onToggle={() => toggleFurl(group.key)}
                    />
                    {!isFurled && group.notes.map(note => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        indented
                        active={note.id === activeNoteId}
                        trashed={false}
                        exiting={exitingIds.has(note.id)}
                        onClick={() => onSelect(note.id)}
                        onToggleStar={() => onUpdate(note.id, { starred: !note.starred })}
                      />
                    ))}
                  </div>
                )
              })
            ) : items.map(item => (
              item.type === 'bundle' ? (
                <FurledBundle
                  key={item.key}
                  bundle={item}
                  hasActive={item.notes.some(n => n.id === activeNoteId)}
                  onUnfurl={() => toggleFurl(item.key)}
                />
              ) : (
                <NoteRow
                  key={item.note.id}
                  note={item.note}
                  active={item.note.id === activeNoteId && filter !== 'trash'}
                  trashed={filter === 'trash'}
                  exiting={exitingIds.has(item.note.id)}
                  onClick={() => (filter === 'trash' ? null : onSelect(item.note.id))}
                  onToggleStar={() => onUpdate(item.note.id, { starred: !item.note.starred })}
                  onRestore={() => handleRestore(item.note.id)}
                  onPurge={() => handlePurge(item.note.id)}
                />
              )
            ))}
          </div>
        </div>
      )}

      {/* ── Editor pane ────────────────────────────────────────────────── */}
      {showEditor && (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
          {activeNote ? (
            <>
              {isMobile && (
                <button
                  onClick={() => onSelect(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                    margin: '10px 0 0 10px', padding: '5px 9px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.74rem',
                    fontWeight: 700, cursor: 'pointer',
                  }}>
                  <ArrowLeft size={13} /> All notes
                </button>
              )}
              {/* keyed so switching notes replays the fade — and so Tiptap gets
                  a fresh instance rather than a document swap mid-edit */}
              <NoteEditor
                key={activeNote.id}
                note={activeNote}
                onChange={patch => onUpdate(activeNote.id, patch)}
                onDelete={() => handleTrash(activeNote.id)}
                onConvert={onConvert}
                knownTags={allTags.map(t => t.tag)}
                linkOptions={linkOptions}
                isMobile={isMobile}
                pushToast={pushToast}
                signedIn={signedIn}
              />
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 10, color: 'var(--text-3)', padding: 24, textAlign: 'center',
            }}>
              <NotebookPen size={34} style={{ opacity: .5 }} />
              <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>Select a note</div>
              <div style={{ fontSize: '0.74rem', maxWidth: 260 }}>
                Or press <Kbd>W</Kbd> anywhere in the app to start a new one.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── A furled tag, standing in for its notes in the flat list ────────────────
//
// Deliberately the size of one note row: that is the deal furling offers — a
// tag you're not working on today costs you one row instead of a screenful,
// and it sits exactly where its notes were rather than being banished to the
// bottom, so the list doesn't jump around as you furl and unfurl.
function FurledBundle({ bundle, hasActive, onUnfurl }) {
  const count  = bundle.notes.length
  // A few of the member notes' spines, stacked — enough of a hint that this row
  // is standing in for several notes rather than being one odd note.
  const spines = bundle.notes.slice(0, 3).map(n => n.color)
  return (
    <button
      type="button"
      onClick={onUnfurl}
      aria-expanded={false}
      aria-label={`Unfurl ${bundle.tag} (${count} note${count === 1 ? '' : 's'})`}
      className="lv-focusable lv-note-row-enter"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '9px 10px', borderRadius: 10, marginBottom: 3,
        border: '1px dashed var(--border)', background: 'transparent',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        transition: 'background .12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
        {spines.map((c, i) => (
          <span key={i} style={{ width: 3, height: 18, borderRadius: 2, background: c, opacity: 1 - i * 0.28 }} />
        ))}
      </span>
      <ChevronRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <span style={{
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-2)',
      }}>
        {bundle.tag}
      </span>
      {/* Without this, opening a note and then furling its tag looks like the
          note was closed — the editor is still showing something the list no
          longer admits to having. */}
      {hasActive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />}
      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', flexShrink: 0 }}>
        {count} note{count === 1 ? '' : 's'}
      </span>
    </button>
  )
}

// ── A furlable tag group header ─────────────────────────────────────────────
//
// Sticky, so that scrolling through a long group still tells you which tag
// you're inside. Furling collapses the group to this one row — the whole point
// of the grouped view is that a tag you're not working on costs 28px, not a
// screenful.
function GroupHeader({ group, furled, onToggle }) {
  const label = group.tag ?? 'Untagged'
  const Chevron = furled ? ChevronRight : ChevronDown
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!furled}
      aria-label={`${furled ? 'Unfurl' : 'Furl'} ${label} (${group.notes.length} note${group.notes.length === 1 ? '' : 's'})`}
      className="lv-focusable"
      style={{
        position: 'sticky', top: 0, zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        padding: '6px 8px', marginBottom: 2, borderRadius: 8,
        border: 'none', background: 'var(--surface)', cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'left',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
    >
      <Chevron size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <span style={{
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '.02em',
        color: group.tag ? 'var(--text-2)' : 'var(--text-3)',
      }}>
        {label}
      </span>
      <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-3)', flexShrink: 0 }}>
        {group.notes.length}
      </span>
    </button>
  )
}

// ── One row in the note list ────────────────────────────────────────────────
function NoteRow({ note, active, trashed, exiting, indented = false, onClick, onToggleStar, onRestore, onPurge }) {
  const preview = notePreview(note, 90)
  const tags    = note.tags ?? []
  return (
    <div
      onClick={onClick}
      // Trashed rows aren't openable, so they're plain content — giving them a
      // button role would promise an interaction that doesn't exist.
      role={trashed ? undefined : 'button'}
      tabIndex={trashed ? undefined : 0}
      aria-current={active ? 'true' : undefined}
      aria-label={trashed ? undefined : `Open note: ${noteDisplayTitle(note)}`}
      onKeyDown={e => {
        if (trashed) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() }
      }}
      className={`lv-focusable ${exiting ? 'lv-note-row-exit' : 'lv-note-row-enter'}`}
      style={{
        display: 'flex', gap: 8, padding: '9px 10px', borderRadius: 10, marginBottom: 3,
        marginLeft: indented ? 10 : 0,
        cursor: trashed ? 'default' : 'pointer',
        background: active ? 'var(--blue-bg)' : 'transparent',
        border: `1px solid ${active ? 'var(--blue)' : 'transparent'}`,
        transition: 'background .12s',
        textAlign: 'left',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
      onFocus={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
      onBlur={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ width: 3, borderRadius: 2, background: note.color, flexShrink: 0, opacity: trashed ? .4 : 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {note.pinned && !trashed && <Pin size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} fill="currentColor" />}
          <span style={{
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: '0.82rem', fontWeight: 700,
            color: active ? 'var(--blue-text)' : 'var(--text)',
            opacity: trashed ? .6 : 1,
          }}>
            {noteDisplayTitle(note)}
          </span>
          {note.reminder && !trashed && <Bell size={11} style={{ color: 'var(--blue)', flexShrink: 0 }} />}
          {note.linkedTo && !trashed && <Link2 size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
        </div>
        {preview && (
          <div style={{
            fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {preview}
          </div>
        )}
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
            {tags.slice(0, 3).map(t => (
              <span key={t} style={{
                padding: '1px 6px', borderRadius: 999, fontSize: '0.62rem', fontWeight: 800,
                lineHeight: 1.5, whiteSpace: 'nowrap',
                // Tinted with the note's own color so the row reads as one unit.
                background: `${note.color}1f`,
                color: note.color,
                border: `1px solid ${note.color}3d`,
                opacity: trashed ? .55 : 1,
              }}>
                {t}
              </span>
            ))}
            {tags.length > 3 && (
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', lineHeight: 1.9 }}>
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {trashed ? (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <IconBtn title="Restore" onClick={e => { e.stopPropagation(); onRestore() }}><RotateCcw size={13} /></IconBtn>
          <IconBtn title="Delete forever" onClick={e => { e.stopPropagation(); onPurge() }}><X size={13} /></IconBtn>
        </div>
      ) : (
        <IconBtn title={note.starred ? 'Unstar' : 'Star'} onClick={e => { e.stopPropagation(); onToggleStar() }}>
          <Star size={13} fill={note.starred ? 'currentColor' : 'none'}
                style={{ color: note.starred ? 'var(--amber)' : 'var(--text-3)' }} />
        </IconBtn>
      )}
    </div>
  )
}

function IconBtn({ title, onClick, children }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
            style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0, border: 'none',
              background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
      {children}
    </button>
  )
}

function EmptyState({ filter, query, tags = [], onCreate }) {
  const message =
    query                ? 'No notes match that search.' :
    tags.length > 0      ? `Nothing tagged ${tags.join(' or ')}.` :
    filter === 'starred' ? 'No starred notes yet.' :
    filter === 'trash'   ? 'Trash is empty.' :
                           'No notes yet.'
  return (
    <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text-3)' }}>
      <NotebookPen size={26} style={{ opacity: .45, marginBottom: 8 }} />
      <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>{message}</div>
      {filter === 'all' && !query && tags.length === 0 && (
        <>
          <div style={{ fontSize: '0.7rem', marginBottom: 10 }}>Jot down anything — it syncs across your devices.</div>
          <button onClick={onCreate}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--blue)',
                    color: '#fff', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                  }}>
            Write your first note
          </button>
        </>
      )}
      {filter === 'trash' && (
        <div style={{ fontSize: '0.68rem' }}>Trashed notes are removed automatically after 30 days.</div>
      )}
    </div>
  )
}

const Kbd = ({ children }) => (
  <kbd style={{
    padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'var(--surface2)', fontSize: '0.68rem', fontWeight: 700,
    fontFamily: 'inherit', color: 'var(--text-2)',
  }}>{children}</kbd>
)
