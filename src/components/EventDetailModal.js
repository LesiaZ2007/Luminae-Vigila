'use client'

/**
 * EventDetailModal — what a calendar event looks like when you tap it.
 *
 * Tapping an event used to drop straight into the edit form, which is the wrong
 * default: most taps are "what is this / where is it", not "change it". The form also
 * can't answer those questions well, because a row of inputs reads as work to do
 * rather than information to take in. So a tap lands here, and editing is one button
 * away.
 *
 * This is also the one place that can show every source consistently. Google and
 * Canvas events used to answer a tap with a toast — fine for a line of text, but they
 * carry locations and descriptions that deserve the same layout as an own event. The
 * read-only ones simply have no Edit button, and their source-specific actions (open
 * in Canvas, recolor, hide) live in the same footer as everything else.
 *
 * Props:
 *   event         — FullCalendar EventApi *or* a plain stored event object
 *   categories    — event categories, for the colored category chip
 *   colorOverride — per-event color from eventPrefs, if the user set one
 *   hidden        — whether this event is currently hidden
 *   important     — whether this event is flagged important (also from eventPrefs)
 *   onEdit, onDelete, onClose
 *   onHide, onUnhide, onRecolor, onToggleImportant — omit to leave the action out
 *   allNotes, onOpenNote        — linked notes, same contract as EventModal
 */

import { useState, useEffect, useMemo } from 'react'
import {
  X, Pencil, Trash2, MapPin, ExternalLink, Clock, CalendarDays, Bell,
  Repeat, AlignLeft, EyeOff, Eye, Link2, Video, CalendarX, CalendarPlus, GraduationCap,
  Star,
} from 'lucide-react'
import { describeLocation } from '@/lib/maps'
import { toYMDLocal }       from '@/lib/calendarView'
import { EXAM_COLOR }       from '@/lib/classInstances'

const SOURCE_LABELS = {
  google:         'Google Calendar',
  'canvas-cal':   'Canvas',
  'canvas-ics':   'Canvas',
  'canvas-class': 'Class schedule',
}

/** Sources the user cannot edit here — they live in Google or Canvas. */
function isReadOnly(source) {
  return !!source && source !== 'local'
}

function fmtTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDay(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

/**
 * Parse an event boundary into a Date.
 *
 * A bare `YYYY-MM-DD` — which is how all-day events are stored — is parsed as UTC
 * midnight by the Date constructor. Everything below reads local components off these
 * values, so left alone an all-day event would render a day early for anyone west of
 * UTC. Anchoring the date-only form to local noon keeps the calendar day intact in
 * either direction, which is the same trick the rest of the app uses.
 */
function toDate(value) {
  if (value instanceof Date) return value
  if (!value) return null
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value)
}

/**
 * Flatten the two shapes an event arrives in.
 *
 * A tap from the calendar hands over a FullCalendar EventApi, where `start` is a Date
 * and the custom fields sit under `extendedProps`. Search results and the agenda hand
 * over the stored object, where `start` is an ISO string. Everything below reads from
 * this one shape so no branch has to care which it got.
 */
export function normalizeEvent(event) {
  if (!event) return null

  const ext    = event.extendedProps ?? {}
  const start  = toDate(event.start)
  const rawEnd = toDate(event.end)
  const allDay = !!event.allDay

  // FullCalendar stores an all-day end as the exclusive next midnight. Showing that
  // verbatim reads as an extra day ("Mon – Tue" for a Monday-only event), so pull it
  // back to the last day the event actually covers.
  const end = allDay && rawEnd ? new Date(rawEnd.getTime() - 86_400_000) : rawEnd

  return {
    id:       event.id,
    title:    event.title || 'Untitled',
    start, end, allDay,
    source:   ext.source ?? 'local',
    category: ext.category ?? null,
    // Canvas class events name their location the same way; Canvas calendar events
    // call it locationName. Own events and Google events both use `location`.
    location: ext.location ?? ext.locationName ?? null,
    notes:    ext.notes ?? null,
    // Google descriptions are frequently a wall of invite HTML. Strip it rather than
    // render remote markup inside the app.
    description: ext.description ? String(ext.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null,
    professor:   ext.professor ?? null,
    classId:     ext.classId ?? null,
    isExtra:     !!ext.isExtra,
    isExam:      !!ext.isExam,
    courseName:  ext.courseName ?? null,
    htmlUrl:     ext.htmlUrl ?? null,
    reminder:    event.reminder ?? null,
    recurrence:  ext.seriesRecurrence ?? event.recurrence ?? null,
    isRecurring: !!ext.recurrenceGroupId,
    color:       event.backgroundColor || event.borderColor || event.color || null,
  }
}

/** "Wed, Aug 19 · 2:00 – 3:15 PM", collapsing a same-day range. */
function whenLabel(ev) {
  if (!ev.start) return null
  if (ev.allDay) {
    const sameDay = !ev.end || ev.end.toDateString() === ev.start.toDateString()
    return sameDay ? `${fmtDay(ev.start)} · All day` : `${fmtDay(ev.start)} – ${fmtDay(ev.end)}`
  }
  const range = ev.end ? `${fmtTime(ev.start)} – ${fmtTime(ev.end)}` : fmtTime(ev.start)
  if (ev.end && ev.end.toDateString() !== ev.start.toDateString()) {
    return `${fmtDay(ev.start)}, ${fmtTime(ev.start)} → ${fmtDay(ev.end)}, ${fmtTime(ev.end)}`
  }
  return `${fmtDay(ev.start)} · ${range}`
}

function recurrenceLabel(rec) {
  if (!rec) return null
  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const base = rec.type === 'custom' && rec.days?.length
    ? `Weekly on ${rec.days.map(d => DAY[d]).join(', ')}`
    : rec.type === 'daily'   ? 'Every day'
    : rec.type === 'monthly' ? 'Every month'
    : 'Every week'
  return rec.until ? `${base}, until ${new Date(rec.until + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : base
}

/** Small uppercase caption used above each block. */
function Label({ icon: Icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <Icon size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {children}
      </span>
    </div>
  )
}

function ReadonlyBlock({ children }) {
  return (
    <div style={{
      fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.6,
      padding: '10px 14px', borderRadius: 10,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto',
    }}>
      {children}
    </div>
  )
}

export default function EventDetailModal({
  event, categories = [], colorOverride, hidden = false, important = false,
  onEdit, onDelete, onClose, onHide, onUnhide, onRecolor, onToggleImportant,
  allNotes = [], onOpenNote,
  // Class schedule meetings only: call off this one occurrence, or drop a one-off
  // that was added. Omit either to leave the action out.
  onCancelMeeting, onRemoveMeeting,
  // Class schedule meetings only: turn this one period into an exam block, or turn it
  // back. Marking opens a form, so the handler receives the whole occurrence.
  onMarkExam, onClearExam,
  // Start a fresh event from here. Offered alongside Edit because the two are easy to
  // confuse once a popup is already open on top of an existing event.
  onNewEvent,
}) {
  const [closing, setClosing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ev = useMemo(() => normalizeEvent(event), [event])

  function handleClose() { setClosing(true); setTimeout(onClose, 180) }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ev) return null

  const readOnly = isReadOnly(ev.source)
  const cat      = categories.find(c => c.id === ev.category)
  const accent   = colorOverride || cat?.color || ev.color || 'var(--blue)'
  const loc      = describeLocation(ev.location)
  const when     = whenLabel(ev)
  const repeat   = recurrenceLabel(ev.recurrence)
  const linked   = (allNotes ?? []).filter(n => !n.trashedAt && n.linkedTo?.type === 'event' && n.linkedTo.id === ev.id)

  const isClassMeeting = ev.source === 'canvas-class' && !!ev.classId && !!ev.start
  // The calendar day this occurrence falls on, which is what an exception is keyed by.
  const meetingDate    = ev.start ? toYMDLocal(ev.start) : null

  const sourceLabel = SOURCE_LABELS[ev.source] ?? 'Read-only'
  const heading     = ev.courseName || cat?.label || (readOnly ? sourceLabel : 'Event')

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={handleClose}
    >
      <div
        className={`modal-surface${closing ? ' modal-closing' : ''}`}
        style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — category or source, and the close button */}
        <div className="modal-header" style={{ gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {heading}
            </span>
            {/* The badge only earns its space when it says something the heading did
                not — a Google event with no course or category is already labelled
                "Google Calendar" to its left. */}
            {readOnly && heading !== sourceLabel && (
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>
                {sourceLabel}
              </span>
            )}
          </div>
          <button onClick={handleClose} aria-label="Close"
                  style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Title */}
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
            {ev.title}
          </h2>

          {hidden && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-3)' }}>
              <EyeOff size={12} /> Hidden from the calendar
            </div>
          )}

          {important && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, color: 'var(--amber, #f59e0b)' }}>
              <Star size={12} fill="currentColor" /> Important — sits on top of anything it overlaps
            </div>
          )}

          {ev.isExtra && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-3)' }}>
              <CalendarPlus size={12} /> One-off meeting, not part of the usual schedule
            </div>
          )}

          {ev.isExam && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, color: EXAM_COLOR }}>
              <GraduationCap size={12} /> Exam — this period, not the usual class
            </div>
          )}

          {/* When */}
          {when && (
            <div>
              <Label icon={ev.allDay ? CalendarDays : Clock}>When</Label>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{when}</div>
              {repeat && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: '0.75rem', color: 'var(--text-3)' }}>
                  <Repeat size={11} /> {repeat}
                </div>
              )}
            </div>
          )}

          {/* Where — the action sits on the same line as the address rather than
              under it. The two belong together, and a full-width button below pushed
              everything after it down for something that is one tap wide. The address
              takes the remaining width and wraps; the button never shrinks. */}
          {loc.kind !== 'empty' && (
            <div>
              <Label icon={loc.kind === 'online' ? Video : MapPin}>Where</Label>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', color: 'var(--text)', overflowWrap: 'anywhere' }}>
                  {loc.text}
                </div>
                {loc.kind === 'place' && (
                  <InlineAction href={loc.url} accent={accent} icon={MapPin} label="Open in Google Maps" short="Maps" />
                )}
                {loc.kind !== 'place' && loc.url && (
                  <InlineAction href={loc.url} accent={accent} icon={Video} label="Join meeting" short="Join" />
                )}
              </div>
            </div>
          )}

          {ev.professor && (
            <div>
              <Label icon={AlignLeft}>Instructor</Label>
              <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{ev.professor}</div>
            </div>
          )}

          {/* Reminder */}
          {ev.reminder && (ev.reminder.label || ev.reminder.ms) && (
            <div>
              <Label icon={Bell}>Reminder</Label>
              <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                {ev.reminder.label || `${Math.round(ev.reminder.ms / 60000)} min before`}
              </div>
            </div>
          )}

          {/* Notes (own events) and description (imported ones) */}
          {ev.notes && (
            <div>
              <Label icon={AlignLeft}>Notes</Label>
              <ReadonlyBlock>{ev.notes}</ReadonlyBlock>
            </div>
          )}
          {ev.description && (
            <div>
              <Label icon={AlignLeft}>Description</Label>
              <ReadonlyBlock>{ev.description}</ReadonlyBlock>
            </div>
          )}

          {/* Linked notes */}
          {linked.length > 0 && (
            <div>
              <Label icon={Link2}>Linked notes</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {linked.map(n => (
                  <button key={n.id} onClick={() => { onOpenNote?.(n.id); handleClose() }}
                          style={{ textAlign: 'left', padding: '7px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem' }}>
                    {n.title || 'Untitled note'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Canvas deep link */}
          {ev.htmlUrl && <ActionLink href={ev.htmlUrl} accent={accent} icon={ExternalLink} label="Open in Canvas" />}

          {/* Color — mirrors the calendar's right-click recolor, which mobile can't reach */}
          {onRecolor && (
            <div>
              <Label icon={Pencil}>Color</Label>
              <input type="color" value={toHexInput(colorOverride || ev.color)} onChange={e => onRecolor(ev.id, e.target.value)}
                     aria-label="Event color"
                     style={{ width: 46, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 7, background: 'none', cursor: 'pointer' }} />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 16px', flexWrap: 'wrap' }}>
          {!readOnly && onEdit && (
            <button onClick={() => { onEdit(event); onClose() }} className="btn-primary" style={{ flex: 1, minWidth: 120 }}>
              <Pencil size={14} /> Edit this event
            </button>
          )}

          {/* Explicitly "a different event", so there is never a doubt about which of
              the two a button does while a popup is open on top of an existing one. */}
          {onNewEvent && (
            <FooterButton icon={CalendarPlus} label="New event"
                          onClick={() => { onNewEvent(ev.start ?? null); handleClose() }} />
          )}

          {/* Stays open on purpose, unlike the actions around it: this one is a
              toggle, and closing the popup would hide the badge that confirms it
              took. */}
          {onToggleImportant && (
            <FooterButton icon={Star} iconFilled={important} highlight={important}
                          label={important ? 'Not important' : 'Mark important'}
                          onClick={() => onToggleImportant(ev.id)} />
          )}

          {hidden
            ? onUnhide && <FooterButton icon={Eye}    label="Unhide" onClick={() => { onUnhide(ev.id); handleClose() }} />
            : onHide   && <FooterButton icon={EyeOff} label="Hide"   onClick={() => { onHide(ev.id);   handleClose() }} />}

          {/* A class meeting is one occurrence of a recurring pattern, so neither Edit
              nor Delete fits: both would rewrite the whole term. Calling off this one
              date leaves the pattern alone and is reversible from the class settings. */}
          {/* An exam is a property of the period, so it sits with the other one-off
              changes to it rather than under Edit, which edits the whole term. */}
          {isClassMeeting && (
            ev.isExam
              ? onClearExam && (
                  <FooterButton icon={GraduationCap} label="Not an exam any more"
                                onClick={() => { onClearExam(ev.classId, meetingDate); handleClose() }} />
                )
              : onMarkExam && (
                  <FooterButton icon={GraduationCap} label="Make this an exam"
                                onClick={() => { onMarkExam(ev.classId, meetingDate, ev); handleClose() }} />
                )
          )}

          {isClassMeeting && (
            ev.isExtra
              ? onRemoveMeeting && (
                  <FooterButton icon={Trash2} label="Remove this meeting" danger
                                onClick={() => { onRemoveMeeting(ev.classId, meetingDate); handleClose() }} />
                )
              : onCancelMeeting && (
                  <FooterButton icon={CalendarX} label="Cancel this class"
                                onClick={() => { onCancelMeeting(ev.classId, meetingDate); handleClose() }} />
                )
          )}

          {!readOnly && onDelete && (
            confirmDelete ? (
              <FooterButton icon={Trash2} label="Confirm delete" danger
                            onClick={() => { onDelete(ev.id, event?.extendedProps?.recurrenceGroupId, ev.isRecurring); handleClose() }} />
            ) : (
              <FooterButton icon={Trash2} label="Delete" danger onClick={() => setConfirmDelete(true)} />
            )
          )}
        </div>
      </div>
    </div>
  )
}

/** `<input type="color">` only accepts #rrggbb, so anything else has to fall back. */
function toHexInput(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#3a6fa8'
}

/**
 * Compact tinted link that sits beside the text it belongs to.
 *
 * `short` is the visible label; the full `label` stays in the accessible name and the
 * tooltip, so "Maps" on screen still reads as "Open in Google Maps" to a screen reader
 * and on hover.
 */
function InlineAction({ href, accent, icon: Icon, label, short }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       title={label} aria-label={label}
       style={{
         display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
         padding: '5px 10px', borderRadius: 8,
         border: `1px solid ${solid(accent)}55`, background: `${solid(accent)}11`,
         color: solid(accent), fontWeight: 700, fontSize: '0.75rem',
         textDecoration: 'none', transition: 'background .13s, border-color .13s',
       }}
       onMouseEnter={e => { e.currentTarget.style.background = `${solid(accent)}22`; e.currentTarget.style.borderColor = solid(accent) }}
       onMouseLeave={e => { e.currentTarget.style.background = `${solid(accent)}11`; e.currentTarget.style.borderColor = `${solid(accent)}55` }}>
      <Icon size={12} /> {short}
    </a>
  )
}

/** Full-width tinted link — the shape used for "Open in Canvas" elsewhere. */
function ActionLink({ href, accent, icon: Icon, label }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       style={{
         display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
         padding: '9px 16px', borderRadius: 10,
         border: `1px solid ${solid(accent)}55`, background: `${solid(accent)}11`,
         color: solid(accent), fontWeight: 700, fontSize: '0.82rem',
         textDecoration: 'none', transition: 'all .13s',
       }}
       onMouseEnter={e => { e.currentTarget.style.background = `${solid(accent)}22` }}
       onMouseLeave={e => { e.currentTarget.style.background = `${solid(accent)}11` }}>
      <Icon size={13} /> {label}
    </a>
  )
}

/**
 * The accent can be a CSS variable reference, which cannot have an alpha suffix
 * appended to it. Fall back to the brand blue for the tinted backgrounds in that case.
 */
function solid(accent) {
  return typeof accent === 'string' && accent.startsWith('#') ? accent : '#3a6fa8'
}

/**
 * `highlight` is for the on state of a toggle — the button has to say which way
 * round it currently is, which a plain outlined row cannot.
 */
function FooterButton({ icon: Icon, label, onClick, danger, highlight, iconFilled }) {
  const amber = 'var(--amber, #f59e0b)'
  const idle  = highlight ? 'rgba(245,158,11,.1)' : 'transparent'
  return (
    <button onClick={onClick}
            aria-pressed={highlight === undefined ? undefined : !!highlight}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${highlight ? amber : 'var(--border)'}`, background: idle,
              color: danger ? 'var(--red)' : highlight ? amber : 'var(--text-2)',
              fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600,
              transition: 'background .13s, border-color .13s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,.08)' : highlight ? 'rgba(245,158,11,.18)' : 'var(--surface2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = idle }}>
      <Icon size={13} fill={iconFilled ? 'currentColor' : 'none'} /> {label}
    </button>
  )
}
