'use client'

/**
 * ClassesPanel — everything about one class, in one place.
 *
 * The Courses tab has always been a *Canvas* view: it groups Canvas assignments by
 * Canvas course, and the whole tab is hidden unless a token is connected. But the app
 * has had a real class model all along — the schedule entries typed in by hand, which
 * expand into calendar meetings, carry cancellations and exam blocks, and derive the
 * `class:<id>` task categories. Nothing read *those* back. Your schedule was in the
 * sidebar, your coursework in To-Do, your exams on the calendar and your notes in
 * Notes, and nothing answered "what is the state of Physics?".
 *
 * So this is the class-first view, and it works with Canvas disconnected. When a class
 * *is* linked to a Canvas course, its assignments, grade and study time join the card
 * rather than living in a separate tab — the Canvas link is an enrichment here, not a
 * precondition. The Courses tab is untouched and still does the Canvas-native view.
 *
 * One card per class, expandable, rather than a master/detail split: it matches the
 * panels next to it, and it collapses to a phone without a second layout.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  GraduationCap, ChevronDown, ChevronRight, Plus, Pencil, MapPin, Clock,
  CalendarDays, AlertCircle, User, Timer, TrendingUp, BookOpen, CircleCheck, Circle,
} from 'lucide-react'
import LinkedNotes           from '@/components/LinkedNotes'
import ClassRemindersEditor  from '@/components/ClassRemindersEditor'
import { AssignmentRow, isCompleted } from '@/components/CoursesPanel'
import { EXAM_COLOR }        from '@/lib/classInstances'
import { classIdForTodo }    from '@/lib/classReminders'
import { classCategoryId }   from '@/lib/classCategories'
import { courseGradeSummary, gradeColor } from '@/lib/grades'
import { mapsUrl, isMappable, describeLocation } from '@/lib/maps'

const DEFAULT_COLOR = '#3a6fa8'
const DAY_LETTERS   = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES     = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Formatting ────────────────────────────────────────────────────────────────

/** "9:00 AM" from "09:00". */
function fmt12(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return ''
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hr     = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m ?? 0).padStart(2, '0')} ${period}`
}

/** "MWF" while it stays readable, "Mon, Wed, Fri" once it doesn't. */
function daysLabel(days = []) {
  if (!days.length) return 'No days set'
  const sorted = [...days].sort((a, b) => a - b)
  return sorted.length <= 3
    ? sorted.map(d => DAY_LETTERS[d]).join('')
    : sorted.map(d => DAY_NAMES[d]).join(', ')
}

function shortDate(iso) {
  if (!iso) return ''
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** How a due date reads relative to now — the same vocabulary the Courses tab uses. */
function dueLabel(dateStr) {
  if (!dateStr) return null
  const d    = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`)
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const days = Math.round((d - now) / 86_400_000)
  if (days < 0)  return { label: days === -1 ? 'Yesterday' : `${Math.abs(days)}d overdue`, tone: 'late' }
  if (days === 0) return { label: 'Today',    tone: 'soon' }
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' }
  if (days <= 7)  return { label: `In ${days} days`, tone: 'plain' }
  return { label: shortDate(dateStr), tone: 'plain' }
}

function dueColor(tone) {
  if (tone === 'late') return 'var(--red)'
  if (tone === 'soon') return 'var(--amber)'
  return 'var(--text-3)'
}

/** "in 42m" / "in 3h" — only ever used for something already known to be ahead. */
function untilLabel(ms) {
  const mins = Math.round(ms / 60_000)
  if (mins < 60)      return `in ${mins}m`
  if (mins < 60 * 24) return `in ${Math.round(mins / 60)}h`
  return `in ${Math.round(mins / (60 * 24))}d`
}

function fmtHours(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * "Now", as state rather than a `Date.now()` in the render body.
 *
 * Reading the clock during render is impure — two renders in the same paint can
 * disagree — and it is also just wrong for what this panel shows: "next class in 42m"
 * would freeze at whatever it said when the tab was opened. A minute is the resolution
 * everything here is displayed at, so it is the resolution it ticks at.
 */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// ── Small shared bits ─────────────────────────────────────────────────────────

function SectionHeading({ icon: Icon, children, count, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
      <Icon size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>
        {children}
      </span>
      {count != null && count > 0 && (
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 6px' }}>
          {count}
        </span>
      )}
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  )
}

function MetaChip({ icon: Icon, children, href, title }) {
  const inner = (
    <>
      <Icon size={11} style={{ flexShrink: 0, opacity: 0.8 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </>
  )
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
    fontSize: '0.72rem', color: href ? 'var(--blue)' : 'var(--text-3)',
    textDecoration: 'none', minWidth: 0,
  }
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" title={title} style={style}>{inner}</a>
    : <span title={title} style={style}>{inner}</span>
}

// ── Task row ──────────────────────────────────────────────────────────────────

/**
 * A task as it appears inside a class card.
 *
 * Deliberately thinner than the To-Do panel's row — no drag handle, no swipe, no
 * subtask tree. This is a read-and-jump view: tick it off, or click through to the
 * real editor. Reimplementing the full row here would mean two rows to keep in step.
 */
function TaskRow({ todo, color, onToggle, onClick }) {
  const [hovered, setHovered] = useState(false)
  const due  = dueLabel(todo.dueDate)
  const done = !!todo.completed

  return (
    <div
      onClick={() => onClick?.(todo)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 10px',
        borderRadius: 8, cursor: 'pointer', transition: 'background .12s',
        background: hovered ? 'var(--surface2)' : 'transparent',
      }}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle?.(todo.id) }}
        title={done ? 'Mark not done' : 'Mark done'}
        style={{
          flexShrink: 0, marginTop: 1, background: 'none', border: 'none', padding: 0,
          cursor: 'pointer', display: 'flex', color: done ? color : 'var(--text-3)',
        }}
      >
        {done ? <CircleCheck size={16} /> : <Circle size={16} strokeWidth={1.5} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.3,
          color: done ? 'var(--text-3)' : 'var(--text)',
          textDecoration: done ? 'line-through' : 'none',
        }}>
          {todo.title}
        </div>
        {due && !done && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: '0.71rem', fontWeight: 500, color: dueColor(due.tone) }}>
            {due.tone !== 'plain' && <AlertCircle size={10} />}
            {due.label}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Meeting / exam row ────────────────────────────────────────────────────────

function MeetingRow({ ev, onClick }) {
  const [hovered, setHovered] = useState(false)
  const isExam = ev.extendedProps?.isExam
  const start  = new Date(ev.start)
  const color  = isExam ? EXAM_COLOR : (ev.color || DEFAULT_COLOR)

  return (
    <div
      onClick={() => onClick?.(ev)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px',
        borderRadius: 8, cursor: 'pointer', transition: 'background .12s',
        background: hovered ? 'var(--surface2)' : 'transparent',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{
        flex: 1, minWidth: 0, fontSize: '0.78rem',
        fontWeight: isExam ? 700 : 500,
        color: isExam ? EXAM_COLOR : 'var(--text-2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {isExam ? ev.title : (ev.extendedProps?.isExtra ? `${ev.title} (one-off)` : ev.title)}
      </span>
      <span style={{ fontSize: '0.71rem', color: 'var(--text-3)', flexShrink: 0 }}>
        {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        {' · '}
        {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </span>
    </div>
  )
}

// ── One class ─────────────────────────────────────────────────────────────────

function ClassCard({
  cls, todos, meetings, assignments, notes, studySessions, now,
  defaultOpen, onEdit, onSaveReminders, onTodoClick, onToggleTodo, onAddTask,
  onEventClick, onOpenNote, onCreateLinkedNote, isMobile,
}) {
  const [open, setOpen]           = useState(defaultOpen)
  const [showDone, setShowDone]   = useState(false)
  const color = cls.color || DEFAULT_COLOR

  const openTasks = todos.filter(t => !t.completed)
  const doneTasks = todos.filter(t => t.completed)

  // Meetings are already ordered by the expansion; everything ahead of `now`, exams
  // first-class among them rather than in a list of their own — an exam *is* the
  // period, and splitting them would mean reading two lists to find next Tuesday.
  const upcoming = useMemo(
    () => meetings.filter(ev => new Date(ev.start).getTime() >= now).slice(0, 6),
    [meetings, now],
  )
  const nextExam = useMemo(
    () => meetings.find(ev => ev.extendedProps?.isExam && new Date(ev.start).getTime() >= now) ?? null,
    [meetings, now],
  )
  const nextMeeting = upcoming[0] ?? null

  const grade = useMemo(
    () => (assignments.length ? courseGradeSummary(assignments) : null),
    [assignments],
  )

  // Study time is keyed by the *Canvas* course id, which is why it only appears for a
  // linked class — the Focus Timer has never known about schedule entries.
  const studySec = useMemo(() => {
    if (cls.canvasCourseId == null) return 0
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    return (studySessions ?? [])
      .filter(s => String(s.courseId) === String(cls.canvasCourseId) && new Date(`${s.date}T00:00:00`) >= weekAgo)
      .reduce((sum, s) => sum + (s.durationSec ?? 0), 0)
  }, [studySessions, cls.canvasCourseId])

  const openAssignments = assignments.filter(a => !isCompleted(a))
  const location = describeLocation(cls.location)

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden', marginBottom: 12,
      border: '1px solid var(--border)', background: 'var(--surface2)',
    }}>
      {/* ── Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        {open
          ? <ChevronDown  size={13} style={{ color, flexShrink: 0, opacity: 0.7 }} />
          : <ChevronRight size={13} style={{ color, flexShrink: 0, opacity: 0.7 }} />}
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cls.courseName}
            {cls.section && <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {cls.section}</span>}
          </span>
          {!open && (
            <span style={{ display: 'block', fontSize: '0.71rem', color: 'var(--text-3)', marginTop: 1 }}>
              {daysLabel(cls.days)} · {fmt12(cls.startTime)}
              {nextMeeting && ` · next ${new Date(nextMeeting.start).toLocaleDateString('en-US', { weekday: 'short' })} ${untilLabel(new Date(nextMeeting.start).getTime() - now)}`}
            </span>
          )}
        </span>

        {nextExam && (
          <span style={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, color: EXAM_COLOR, background: 'rgba(239,68,68,.12)', flexShrink: 0 }}>
            Exam {shortDate(String(nextExam.start).slice(0, 10))}
          </span>
        )}

        {(openTasks.length > 0 || openAssignments.length > 0) && (
          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, color, background: `${color}1a`, flexShrink: 0 }}>
            {openTasks.length + openAssignments.length} open
          </span>
        )}
      </button>

      {open && (
        <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 14px 14px' }}>

          {/* ── Meeting details ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 12 }}>
            <MetaChip icon={Clock}>{daysLabel(cls.days)} · {fmt12(cls.startTime)}–{fmt12(cls.endTime)}</MetaChip>
            {cls.professor && <MetaChip icon={User}>{cls.professor}</MetaChip>}
            {location && (
              <MetaChip
                icon={MapPin}
                href={isMappable(cls.location) ? mapsUrl(cls.location) : undefined}
                title={isMappable(cls.location) ? 'Open in Google Maps' : undefined}
              >
                {location}
              </MetaChip>
            )}
            {cls.semesterStart && cls.semesterEnd && (
              <MetaChip icon={CalendarDays}>{shortDate(cls.semesterStart)} – {shortDate(cls.semesterEnd)}</MetaChip>
            )}
            {cls.canvasCourseId != null && (
              <MetaChip icon={BookOpen} title="Linked to a Canvas course">Canvas linked</MetaChip>
            )}
          </div>

          {/* ── Grade + study time, side by side when both exist ── */}
          {(grade || studySec > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {grade && (
                <div style={{ flex: '1 1 140px', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1, color: gradeColor(grade.grade.letter) }}>
                      {Math.round(grade.pct)}%
                    </span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: gradeColor(grade.grade.letter) }}>
                      {grade.grade.letter}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.66rem', color: 'var(--text-3)' }}>
                      {grade.gradedCount}/{grade.totalCount} graded
                    </span>
                  </div>
                  {grade.gradedCount < grade.totalCount && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.7rem', color: 'var(--text-3)' }}>
                      <TrendingUp size={10} />
                      Projected {Math.round(grade.projected)}% at this rate
                    </div>
                  )}
                </div>
              )}
              {studySec > 0 && (
                <div style={{ flex: '1 1 120px', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Timer size={12} style={{ color: '#8b5cf6' }} />
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text)' }}>{fmtHours(studySec)}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 3 }}>studied in the last 7 days</div>
                </div>
              )}
            </div>
          )}

          {/* ── Tasks ── */}
          <div style={{ marginBottom: 14 }}>
            <SectionHeading
              icon={CircleCheck}
              count={openTasks.length}
              action={onAddTask && (
                <button
                  type="button"
                  onClick={() => onAddTask(cls)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = color}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                >
                  <Plus size={12} /> Add task
                </button>
              )}
            >
              Tasks
            </SectionHeading>

            {openTasks.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-3)' }}>
                Nothing outstanding for this class.
              </p>
            ) : (
              openTasks.map(t => (
                <TaskRow key={t.id} todo={t} color={color} onToggle={onToggleTodo} onClick={onTodoClick} />
              ))
            )}

            {doneTasks.length > 0 && (
              <>
                <button
                  onClick={() => setShowDone(v => !v)}
                  style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {showDone ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  {doneTasks.length} completed
                </button>
                {showDone && doneTasks.map(t => (
                  <TaskRow key={t.id} todo={t} color={color} onToggle={onToggleTodo} onClick={onTodoClick} />
                ))}
              </>
            )}
          </div>

          {/* ── Canvas assignments, when the class is linked ── */}
          {assignments.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <SectionHeading icon={BookOpen} count={openAssignments.length}>Canvas assignments</SectionHeading>
              {[...assignments]
                .sort((a, b) => {
                  if (!a.dueAt && !b.dueAt) return 0
                  if (!a.dueAt) return 1
                  if (!b.dueAt) return -1
                  return new Date(a.dueAt) - new Date(b.dueAt)
                })
                .slice(0, 8)
                .map(a => <AssignmentRow key={a.id} a={a} courseColor={color} />)}
            </div>
          )}

          {/* ── Upcoming meetings, exams among them ── */}
          <div style={{ marginBottom: 14 }}>
            <SectionHeading icon={CalendarDays}>Coming up</SectionHeading>
            {upcoming.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-3)' }}>
                No meetings left this term.
              </p>
            ) : (
              upcoming.map(ev => <MeetingRow key={ev.id} ev={ev} onClick={onEventClick} />)
            )}
          </div>

          {/* ── Notes filed against this class ── */}
          <div style={{ marginBottom: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <LinkedNotes
              notes={notes}
              targetId={String(cls.id)}
              onOpenNote={onOpenNote}
              onCreate={onCreateLinkedNote
                ? () => onCreateLinkedNote({ type: 'class', id: String(cls.id), label: cls.courseName })
                : undefined}
              compact
            />
          </div>

          {/* ── Reminder rules ── */}
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <ClassRemindersEditor
              cls={cls}
              color={color}
              onChange={reminders => onSaveReminders?.(cls, reminders)}
            />
          </div>

          {/* ── Footer ── */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => onEdit?.(cls)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: isMobile ? '7px 13px' : '5px 11px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.75rem',
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Pencil size={12} /> Edit class
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function ClassesPanel({
  canvasClasses = [],
  todos = [],
  canvasClassEvents = [],
  canvasAssignments = [],
  notes = [],
  studySessions = [],
  onAddClass,
  onEditClass,
  onSaveClass,
  onTodoClick,
  onToggleTodo,
  onAddTask,
  onEventClick,
  onOpenNote,
  onCreateLinkedNote,
  isMobile = false,
}) {
  // One clock for the whole panel, ticking once a minute. Per-card intervals would
  // be a timer per class to say the same thing.
  const now = useNow()

  // ── Index the surrounding data by class, once ──
  const todosByClass = useMemo(() => {
    const map = new Map()
    for (const td of todos) {
      const id = classIdForTodo(td)
      if (!id) continue
      if (!map.has(id)) map.set(id, [])
      map.get(id).push(td)
    }
    // Soonest first, and a task with no date after the dated ones — an undated task
    // is not urgent, it is unscheduled.
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      })
    }
    return map
  }, [todos])

  const meetingsByClass = useMemo(() => {
    const map = new Map()
    for (const ev of canvasClassEvents) {
      const id = ev.extendedProps?.classId
      if (id == null) continue
      const key = String(id)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ev)
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.start) - new Date(b.start))
    return map
  }, [canvasClassEvents])

  const assignmentsByCourse = useMemo(() => {
    const map = new Map()
    for (const a of canvasAssignments) {
      const key = String(a.courseId)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
    return map
  }, [canvasAssignments])

  // Enabled classes first, then alphabetically. A class you switched off is still
  // yours and still holds its notes and its history, so it is listed rather than
  // hidden — just not at the top competing with the ones you are taking.
  const classes = useMemo(() => {
    return [...canvasClasses].sort((a, b) => {
      const ae = a.enabled === false ? 1 : 0
      const be = b.enabled === false ? 1 : 0
      if (ae !== be) return ae - be
      return (a.courseName ?? '').localeCompare(b.courseName ?? '')
    })
  }, [canvasClasses])

  // ── Term summary for the subtitle ──
  const summary = useMemo(() => {
    let openTasks = 0
    for (const cls of classes) {
      if (cls.enabled === false) continue
      openTasks += (todosByClass.get(String(cls.id)) ?? []).filter(t => !t.completed).length
    }
    const nextExam = canvasClassEvents
      .filter(ev => ev.extendedProps?.isExam && new Date(ev.start).getTime() >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))[0]
    const active = classes.filter(c => c.enabled !== false).length
    const parts = [`${active} ${active === 1 ? 'class' : 'classes'}`]
    if (openTasks > 0) parts.push(`${openTasks} open ${openTasks === 1 ? 'task' : 'tasks'}`)
    if (nextExam) parts.push(`next exam ${new Date(nextExam.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
    return parts.join(' · ')
  }, [classes, todosByClass, canvasClassEvents, now])

  const addButton = onAddClass && (
    <button
      onClick={onAddClass}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: isMobile ? '8px 14px' : '6px 12px', borderRadius: 9,
        border: '1px solid var(--border)', background: 'var(--surface2)',
        color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.78rem',
        fontWeight: 700, cursor: 'pointer', transition: 'all .13s', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)' }}
    >
      <Plus size={13} /> Add class
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        padding: isMobile ? '14px 16px 10px' : '18px 20px 12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <GraduationCap size={17} style={{ color: 'var(--blue)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.015em' }}>
            My Classes
          </div>
          {classes.length > 0 && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 1 }}>{summary}</div>
          )}
        </div>
        {classes.length > 0 && addButton}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 14px 28px' : '14px 20px 28px' }}>
        {classes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, padding: 32, textAlign: 'center' }}>
            <GraduationCap size={38} style={{ color: 'var(--text-3)', opacity: 0.35 }} />
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>No classes yet</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', lineHeight: 1.55, maxWidth: 380 }}>
                Add the classes you&apos;re taking — days, times and room — and this becomes one
                page per class: its meetings, its coursework, its exams and its notes. No Canvas
                account needed, though a class can be linked to a Canvas course to pull in
                assignments and grades.
              </div>
            </div>
            {addButton}
          </div>
        ) : (
          classes.map((cls, i) => {
            const id = String(cls.id)
            return (
              <ClassCard
                key={id}
                cls={cls}
                // The first card opens so the tab is never a wall of closed rows;
                // the rest stay shut so a six-class term still fits on a screen.
                defaultOpen={i === 0}
                todos={todosByClass.get(id) ?? []}
                meetings={meetingsByClass.get(id) ?? []}
                assignments={cls.canvasCourseId != null
                  ? (assignmentsByCourse.get(String(cls.canvasCourseId)) ?? [])
                  : []}
                notes={notes}
                studySessions={studySessions}
                now={now}
                onEdit={onEditClass}
                onSaveReminders={(c, reminders) => onSaveClass?.({ ...c, reminders })}
                onTodoClick={onTodoClick}
                onToggleTodo={onToggleTodo}
                onAddTask={onAddTask ? c => onAddTask(classCategoryId(c.id)) : undefined}
                onEventClick={onEventClick}
                onOpenNote={onOpenNote}
                onCreateLinkedNote={onCreateLinkedNote}
                isMobile={isMobile}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
