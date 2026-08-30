'use client'

/**
 * ClassesPanel — everything about one class, in one place.
 *
 * There used to be two tabs asking almost the same question. **Courses** was a Canvas
 * view: assignments grouped by Canvas course, hidden entirely without a token.
 * **My Classes** was a schedule view: the classes typed in by hand, which expand into
 * calendar meetings, carry exam blocks, and derive the `class:` task categories.
 *
 * Two tabs called "Courses" and "My Classes", listing overlapping things under
 * different names, is a question the app was asking the reader rather than answering.
 * So there is one tab. It looks different depending on whether Canvas is connected —
 * which is the actual difference — rather than being two places to look.
 *
 * ## What a card is
 *
 * The unit is a class, and a class can arrive two ways:
 *
 *   'class'   a schedule entry. Knows when and where it meets, can hold exams and
 *             reminder rules, and *may* be linked to a Canvas course for assignments.
 *   'canvas'  a Canvas course with no schedule entry yet. Has assignments and a grade
 *             and nothing else — no meeting times to show, and nowhere to keep a
 *             reminder rule, since rules live on the schedule entry.
 *
 * A Canvas course is not silently dropped just because it was never typed in — that
 * would have been the old Courses tab quietly losing rows. It gets a card that offers
 * to become a real class, which is the one action that makes the rest of it work.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  GraduationCap, ChevronDown, ChevronRight, Plus, Pencil, MapPin, Clock,
  CalendarDays, AlertCircle, User, Timer, TrendingUp, BookOpen, CircleCheck, Circle,
  Video, Link2, RefreshCw, Settings2, CalendarPlus, LayoutGrid,
} from 'lucide-react'
import LinkedNotes           from '@/components/LinkedNotes'
import ClassRemindersEditor  from '@/components/ClassRemindersEditor'
import ClassCalendar         from '@/components/ClassCalendar'
import AssignmentRow, { isCompleted } from '@/components/AssignmentRow'
import AssignmentDetailModal from '@/components/AssignmentDetailModal'
import GpaPanel              from '@/components/GpaPanel'
import StudyTimeCard         from '@/components/StudyTimeCard'
import { CanvasLogo }        from '@/components/CanvasSettingsModal'
import { EXAM_COLOR }        from '@/lib/classInstances'
import { classIdForTodo }    from '@/lib/classReminders'
import { classCategoryId }   from '@/lib/classCategories'
import { courseGradeSummary, gradeColor } from '@/lib/grades'
import { getCourseColor, CANVAS_COLOR }   from '@/lib/courseColors'
import { describeLocation }  from '@/lib/maps'
import { buildCourseworkItems } from '@/lib/classCalendar'
import { toYMDLocal }        from '@/lib/calendarView'

/** One icon per `describeLocation` kind — a Zoom class is not a place on a map. */
const LOCATION_ICONS = { place: MapPin, online: Video, link: Link2 }

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

/** How a due date reads relative to now — the vocabulary the assignment rows use. */
function dueLabel(dateStr) {
  if (!dateStr) return null
  const d    = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`)
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const days = Math.round((d - now) / 86_400_000)
  if (days < 0)   return { label: days === -1 ? 'Yesterday' : `${Math.abs(days)}d overdue`, tone: 'late' }
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

/** Monday–Sunday around now, which is what "this week" means everywhere here. */
function thisWeekBounds(now) {
  const d   = new Date(now)
  const day = d.getDay() // 0=Sun
  const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7)); mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999)
  return { start: mon.getTime(), end: sun.getTime() }
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

function IconButton({ icon: Icon, label, onClick, active, spinning, disabled }) {
  return (
    <button
      onClick={onClick} title={label} aria-label={label} disabled={disabled}
      style={{
        background: active ? `${CANVAS_COLOR}18` : 'none',
        border: active ? `1px solid ${CANVAS_COLOR}44` : '1px solid transparent',
        cursor: disabled ? 'wait' : 'pointer', padding: '5px 7px', borderRadius: 7,
        color: active ? CANVAS_COLOR : 'var(--text-3)', display: 'flex',
        transition: 'color .13s, background .13s', flexShrink: 0,
      }}
      onMouseEnter={e => { if (!disabled && !active) e.currentTarget.style.color = CANVAS_COLOR }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-3)' }}
    >
      <Icon size={14} style={{ animation: spinning ? 'gc-spin 1s linear infinite' : 'none' }} />
    </button>
  )
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
  entry, todos, meetings, assignments, notes, studySessions, now, weekOnly,
  defaultOpen, onEdit, onSaveReminders, onAdoptCourse, onTodoClick, onToggleTodo, onAddTask,
  onEventClick, onOpenNote, onCreateLinkedNote, onToggleAssignment, onAssignmentDetail,
  selectMode, selectedIds, onToggleSelect, isMobile,
}) {
  const [open, setOpen]         = useState(defaultOpen)
  const [showDone, setShowDone] = useState(false)

  const isCanvasOnly = entry.kind === 'canvas'
  const cls   = entry.cls
  const color = isCanvasOnly ? entry.color : (cls.color || DEFAULT_COLOR)
  const name  = isCanvasOnly ? entry.courseName : cls.courseName

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

  // The grade is computed from every assignment, not from the filtered view — "your
  // grade in this class" does not mean "your grade this week".
  const grade = useMemo(
    () => (assignments.length ? courseGradeSummary(assignments) : null),
    [assignments],
  )

  // Study time is keyed by the *Canvas* course id, which is why it only appears for a
  // linked class — the Focus Timer has never known about schedule entries.
  const canvasCourseId = isCanvasOnly ? entry.courseId : cls.canvasCourseId
  const studySec = useMemo(() => {
    if (canvasCourseId == null) return 0
    const weekAgo = now - 7 * 86_400_000
    return (studySessions ?? [])
      .filter(s => String(s.courseId) === String(canvasCourseId) && new Date(`${s.date}T00:00:00`).getTime() >= weekAgo)
      .reduce((sum, s) => sum + (s.durationSec ?? 0), 0)
  }, [studySessions, canvasCourseId, now])

  // "This week" filters the two lists of *work*, which is what the filter is for.
  // Meetings and the grade are left alone.
  const week = useMemo(() => thisWeekBounds(now), [now])
  const shownTasks = weekOnly
    ? openTasks.filter(t => {
        if (!t.dueDate) return false
        const at = new Date(`${t.dueDate}T00:00:00`).getTime()
        return at >= week.start && at <= week.end
      })
    : openTasks
  const shownAssignments = useMemo(() => {
    const list = weekOnly
      ? assignments.filter(a => {
          if (!a.dueAt) return false
          const at = new Date(a.dueAt).getTime()
          return at >= week.start && at <= week.end
        })
      : assignments
    return [...list].sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt) - new Date(b.dueAt)
    })
  }, [assignments, weekOnly, week])

  const openAssignments = assignments.filter(a => !isCompleted(a))
  const location = isCanvasOnly ? { kind: 'empty' } : describeLocation(cls.location)

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden', marginBottom: 12,
      border: '1px solid var(--border)', background: 'var(--surface2)',
      /* The spine is what makes a collapsed list of six classes scannable by colour
         rather than by reading six names. It runs the full height, so an expanded
         card stays visibly owned by its class all the way down. */
      borderLeft: `4px solid ${color}`,
    }}>
      {/* ── Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '11px 14px', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
          background: `${color}14`,
        }}
      >
        {open
          ? <ChevronDown  size={13} style={{ color, flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color, flexShrink: 0 }} />}

        <span style={{ flex: 1, minWidth: 0 }}>
          {/* Deliberately NOT the class colour. Half the palette — lime, amber, cyan —
              fails contrast as small text on a light background, and a course whose
              name you cannot read is a worse outcome than one whose name is not tinted.
              Colour identifies in blocks (the spine, the header wash, the swatches);
              text stays at full contrast. */}
          <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
            {!isCanvasOnly && cls.section && <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {cls.section}</span>}
          </span>
          {!open && (
            <span style={{ display: 'block', fontSize: '0.71rem', color: 'var(--text-3)', marginTop: 1 }}>
              {isCanvasOnly
                ? `From Canvas · ${openAssignments.length} open`
                : <>
                    {daysLabel(cls.days)} · {fmt12(cls.startTime)}
                    {nextMeeting && ` · next ${new Date(nextMeeting.start).toLocaleDateString('en-US', { weekday: 'short' })} ${untilLabel(new Date(nextMeeting.start).getTime() - now)}`}
                  </>}
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

          {/* ── Meeting details, or the offer to make this a real class ── */}
          {isCanvasOnly ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '9px 12px', marginBottom: 12, borderRadius: 9,
              background: `${CANVAS_COLOR}0f`, border: `1px solid ${CANVAS_COLOR}33`,
            }}>
              <CanvasLogo size={14} />
              <span style={{ flex: 1, minWidth: 160, fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.45 }}>
                Straight from Canvas. Add its meeting times to get it on the calendar, file
                tasks under it, and set reminders.
              </span>
              {onAdoptCourse && (
                <button
                  onClick={() => onAdoptCourse(entry)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    padding: isMobile ? '7px 13px' : '5px 11px', borderRadius: 8,
                    border: `1px solid ${CANVAS_COLOR}66`, background: `${CANVAS_COLOR}18`,
                    color: CANVAS_COLOR, fontFamily: 'inherit', fontSize: '0.75rem',
                    fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <CalendarPlus size={12} /> Add meeting times
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 12 }}>
              <MetaChip icon={Clock}>{daysLabel(cls.days)} · {fmt12(cls.startTime)}–{fmt12(cls.endTime)}</MetaChip>
              {cls.professor && <MetaChip icon={User}>{cls.professor}</MetaChip>}
              {/* `describeLocation` has already worked out whether the room is a place,
                  an online meeting, or a bare link — the same classification the event
                  detail view uses, so a Zoom class offers its join link rather than a
                  map search for the word "Zoom". */}
              {location.kind !== 'empty' && (
                <MetaChip
                  icon={LOCATION_ICONS[location.kind] ?? MapPin}
                  href={location.url ?? undefined}
                  title={location.kind === 'place' ? 'Open in Google Maps' : location.url ? 'Open link' : undefined}
                >
                  {location.text}
                </MetaChip>
              )}
              {cls.semesterStart && cls.semesterEnd && (
                <MetaChip icon={CalendarDays}>{shortDate(cls.semesterStart)} – {shortDate(cls.semesterEnd)}</MetaChip>
              )}
              {cls.canvasCourseId != null && (
                <MetaChip icon={BookOpen} title="Linked to a Canvas course">Canvas linked</MetaChip>
              )}
            </div>
          )}

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

          {/* ── Tasks. A Canvas-only card has nowhere to file one, so it has no list ── */}
          {!isCanvasOnly && (
            <div style={{ marginBottom: 14 }}>
              <SectionHeading
                icon={CircleCheck}
                count={shownTasks.length}
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

              {shownTasks.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-3)' }}>
                  {weekOnly && openTasks.length > 0
                    ? `Nothing due this week — ${openTasks.length} outstanding overall.`
                    : 'Nothing outstanding for this class.'}
                </p>
              ) : (
                shownTasks.map(t => (
                  <TaskRow key={t.id} todo={t} color={color} onToggle={onToggleTodo} onClick={onTodoClick} />
                ))
              )}

              {!weekOnly && doneTasks.length > 0 && (
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
          )}

          {/* ── Canvas assignments ── */}
          {assignments.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <SectionHeading icon={BookOpen} count={openAssignments.length}>
                {isCanvasOnly ? 'Assignments' : 'Canvas assignments'}
              </SectionHeading>
              {shownAssignments.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-3)' }}>
                  Nothing due this week.
                </p>
              ) : (
                shownAssignments.slice(0, 12).map(a => (
                  <AssignmentRow
                    key={a.id} a={a}
                    courseColor={color}
                    onToggle={onToggleAssignment}
                    onClickDetail={onAssignmentDetail}
                    selectMode={selectMode}
                    isSelected={selectedIds?.has(a.id)}
                    onToggleSelect={onToggleSelect}
                  />
                ))
              )}
            </div>
          )}

          {/* ── Upcoming meetings, exams among them ── */}
          {!isCanvasOnly && (
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
          )}

          {/* ── Notes filed against this class ── */}
          {!isCanvasOnly && (
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
          )}

          {/* ── Reminder rules. They live on the schedule entry, so a Canvas-only
                 course has nowhere to keep one until it becomes a class. ── */}
          {!isCanvasOnly && (
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <ClassRemindersEditor
                cls={cls}
                color={color}
                onChange={reminders => onSaveReminders?.(cls, reminders)}
              />
            </div>
          )}

          {/* ── Footer ── */}
          {!isCanvasOnly && (
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
          )}
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
  courseColors = {},
  notes = [],
  studySessions = [],
  canvasConnected = false,
  syncing = false,
  onAddClass,
  onEditClass,
  onSaveClass,
  onAdoptCourse,
  onTodoClick,
  onToggleTodo,
  onAddTask,
  onRescheduleTask,
  onEventClick,
  onOpenNote,
  onCreateLinkedNote,
  onToggleAssignment,
  onUpdateAssignmentNotes,
  onTagSession,
  onSyncCanvas,
  onOpenCanvasSettings,
  isMobile = false,
}) {
  // One clock for the whole panel, ticking once a minute. Per-card intervals would
  // be a timer per class to say the same thing.
  const now = useNow()

  const [weekOnly,     setWeekOnly]     = useState(false)
  const [detailAssign, setDetailAssign] = useState(null)
  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState(new Set())

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelect() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function bulkMarkDone() {
    // Only the ones that are not already done — toggling is what the handler does,
    // so including a finished assignment would un-finish it.
    for (const id of selectedIds) {
      const a = canvasAssignments.find(x => x.id === id)
      if (a && !isCompleted(a)) onToggleAssignment?.(id)
    }
    exitSelect()
  }

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

  /**
   * The card list: schedule entries, then any Canvas course none of them claimed.
   *
   * An unclaimed Canvas course would otherwise vanish the moment the Courses tab did,
   * which is the one way merging two tabs can quietly lose something. It gets a card
   * of its own instead, offering to become a real class.
   *
   * Order: classes you are taking, then Canvas courses awaiting times, then disabled
   * classes. A disabled class is still yours — it keeps its notes and its history —
   * it just should not sit at the top competing with the ones you are in.
   */
  const entries = useMemo(() => {
    const claimed = new Set()
    const active  = []
    const off     = []

    for (const cls of [...canvasClasses].sort((a, b) => (a.courseName ?? '').localeCompare(b.courseName ?? ''))) {
      if (cls.canvasCourseId != null) claimed.add(String(cls.canvasCourseId))
      const entry = { kind: 'class', key: String(cls.id), cls }
      if (cls.enabled === false) off.push(entry)
      else active.push(entry)
    }

    const fromCanvas = []
    const seen = new Set()
    for (const a of canvasAssignments) {
      const id = String(a.courseId)
      if (!id || id === 'undefined' || seen.has(id) || claimed.has(id)) continue
      seen.add(id)
      fromCanvas.push({
        kind: 'canvas', key: `canvas:${id}`,
        courseId: a.courseId, courseName: a.courseName || 'Canvas course',
        color: getCourseColor(a.courseId, courseColors),
      })
    }
    fromCanvas.sort((a, b) => a.courseName.localeCompare(b.courseName))

    return [...active, ...fromCanvas, ...off]
  }, [canvasClasses, canvasAssignments, courseColors])

  /* Everything dated, from every class, for the month grid. Built from the same
     `todos` / `canvasAssignments` / `canvasClassEvents` the cards read, so the two
     views cannot disagree about what is due. */
  const courseworkItems = useMemo(() => buildCourseworkItems({
    classes:     canvasClasses,
    todos,
    assignments: canvasAssignments,
    classEvents: canvasClassEvents,
    courseColors,
  }), [canvasClasses, todos, canvasAssignments, canvasClassEvents, courseColors])

  const todayStr = useMemo(() => toYMDLocal(new Date(now)), [now])

  /* The calendar's colour key. Built from the items actually on the grid rather than
     from the class list, so it never explains a colour that does not appear — a key to
     absent colours is just a second class list. */
  const legend = useMemo(() => {
    const seen = new Map()
    for (const it of courseworkItems) {
      const key = it.className ?? 'Unfiled'
      if (!seen.has(key)) seen.set(key, { id: key, name: key, color: it.color })
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [courseworkItems])

  /* A calendar item is a task, an assignment, or an exam, and each already has a
     detail view elsewhere in the app. Routing to the existing one keeps this a *view*
     rather than a fourth place where coursework can be edited. */
  function openItem(item) {
    if (item.kind === 'task')       onTodoClick?.(item.ref)
    else if (item.kind === 'exam')  onEventClick?.(item.ref)
    else                            setDetailAssign(item.ref)
  }

  function toggleItem(item) {
    if (item.kind === 'task')            onToggleTodo?.(item.ref.id)
    else if (item.kind === 'assignment') onToggleAssignment?.(item.ref.id)
    // An exam is not a thing you tick off; it happens to you.
  }

  function assignmentsFor(entry) {
    const courseId = entry.kind === 'canvas' ? entry.courseId : entry.cls.canvasCourseId
    if (courseId == null) return []
    return assignmentsByCourse.get(String(courseId)) ?? []
  }

  // ── Term summary for the subtitle ──
  const summary = useMemo(() => {
    let openWork = 0
    for (const entry of entries) {
      if (entry.kind === 'class') {
        if (entry.cls.enabled === false) continue
        openWork += (todosByClass.get(String(entry.cls.id)) ?? []).filter(t => !t.completed).length
      }
      openWork += assignmentsFor(entry).filter(a => !isCompleted(a)).length
    }
    const nextExam = canvasClassEvents
      .filter(ev => ev.extendedProps?.isExam && new Date(ev.start).getTime() >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))[0]

    const count = entries.filter(e => e.kind === 'canvas' || e.cls.enabled !== false).length
    const parts = [`${count} ${count === 1 ? 'class' : 'classes'}`]
    if (openWork > 0) parts.push(`${openWork} open`)
    if (nextExam) parts.push(`next exam ${new Date(nextExam.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
    return parts.join(' · ')
  }, [entries, todosByClass, assignmentsByCourse, canvasClassEvents, now]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const anyAssignments = canvasAssignments.length > 0

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: isMobile ? '14px 16px 10px' : '18px 20px 12px',
          borderBottom: '1px solid var(--border)',
        }}>
          <GraduationCap size={17} style={{ color: 'var(--blue)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.015em' }}>
              My Classes
            </div>
            {entries.length > 0 && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 1 }}>{summary}</div>
            )}
          </div>

          {/* Canvas chrome, only once there is a Canvas to talk to. */}
          {anyAssignments && (
            <button
              onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
              style={{
                background: selectMode ? 'rgba(147,197,253,.15)' : 'none',
                border: selectMode ? '1px solid rgba(147,197,253,.35)' : '1px solid transparent',
                cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
                color: selectMode ? '#93c5fd' : 'var(--text-3)',
                fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}
          {canvasConnected && onSyncCanvas && (
            <IconButton icon={RefreshCw} label="Sync Canvas" onClick={onSyncCanvas} spinning={syncing} disabled={syncing} />
          )}
          {canvasConnected && onOpenCanvasSettings && (
            <IconButton icon={Settings2} label="Canvas settings" onClick={onOpenCanvasSettings} />
          )}
          {entries.length > 0 && addButton}
        </div>


        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '8px 14px 28px' : '10px 20px 28px' }}>
          {entries.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, padding: 32, textAlign: 'center' }}>
              <GraduationCap size={38} style={{ color: 'var(--text-3)', opacity: 0.35 }} />
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>No classes yet</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', lineHeight: 1.55, maxWidth: 380 }}>
                  Add the classes you&apos;re taking — days, times and room — and this becomes one
                  page per class: its meetings, its coursework, its exams and its notes. No Canvas
                  account needed, though connecting one pulls in assignments and grades alongside.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {addButton}
                {!canvasConnected && onOpenCanvasSettings && (
                  <button
                    onClick={onOpenCanvasSettings}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: isMobile ? '8px 14px' : '6px 12px', borderRadius: 9,
                      border: `1px solid ${CANVAS_COLOR}66`, background: `${CANVAS_COLOR}18`,
                      color: CANVAS_COLOR, fontFamily: 'inherit', fontSize: '0.78rem',
                      fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <CanvasLogo size={13} /> Connect Canvas
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ── The month, which is what the tab is for ── */}
              <section aria-label="Coursework calendar">
              <ClassCalendar
                items={courseworkItems}
                legend={legend}
                assignments={canvasAssignments}
                todayStr={todayStr}
                onSelectItem={openItem}
                onToggleItem={toggleItem}
                onReschedule={onRescheduleTask ? (item, date) => onRescheduleTask(item.ref, date) : undefined}
                isMobile={isMobile}
              />
              </section>

              {/* ── Then each class in detail, on the same page ──
                     Below the calendar rather than behind a tab: the two answer
                     different questions and you often want the second right after the
                     first — "Thursday is brutal" is followed by "what *is* all that",
                     and a switch would make that a round trip.

                     A landmark rather than a bare div: naming the two halves lets a
                     screen reader jump between them the way a sighted reader scrolls
                     past the grid. */}
              <section aria-label="Your classes">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--border)',
              }}>
                <LayoutGrid size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>
                  Your classes
                </span>
                {/* Narrows the cards only. On the month above it would mean hiding most
                    of what you are looking at, which is less a filter than a lie. */}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                  {[{ id: false, label: 'Everything' }, { id: true, label: 'This week' }].map(t => (
                    <button key={String(t.id)} onClick={() => setWeekOnly(t.id)} style={{
                      padding: '3px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.73rem', fontWeight: 600, transition: 'all .13s',
                      background: weekOnly === t.id ? 'var(--blue-bg)' : 'transparent',
                      color: weekOnly === t.id ? 'var(--blue-text)' : 'var(--text-3)',
                    }}>
                      {t.label}
                    </button>
                  ))}
                </span>
              </div>
              <div style={{ height: 12 }} />

              {/* Account-wide roll-ups. Both are Canvas-derived, so both are absent
                  until there is Canvas data — they render nothing on their own. */}
              {anyAssignments && (
                <>
                  <GpaPanel canvasAssignments={canvasAssignments} courseColors={courseColors} />
                  <StudyTimeCard
                    courseColors={courseColors}
                    studySessions={studySessions}
                    canvasAssignments={canvasAssignments}
                    onTagSession={onTagSession}
                  />
                </>
              )}

              {entries.map(entry => (
                <ClassCard
                  key={entry.key}
                  entry={entry}
                  /* All shut. When the cards were the tab, opening the first one was
                     what stopped it reading as a wall of closed rows — but they now sit
                     below a month grid that already fills the screen, and an open card
                     would just push the other five out of reach. */
                  defaultOpen={false}
                  todos={entry.kind === 'class' ? (todosByClass.get(String(entry.cls.id)) ?? []) : []}
                  meetings={entry.kind === 'class' ? (meetingsByClass.get(String(entry.cls.id)) ?? []) : []}
                  assignments={assignmentsFor(entry)}
                  notes={notes}
                  studySessions={studySessions}
                  now={now}
                  weekOnly={weekOnly}
                  onEdit={onEditClass}
                  onSaveReminders={(c, reminders) => onSaveClass?.({ ...c, reminders })}
                  onAdoptCourse={onAdoptCourse}
                  onTodoClick={onTodoClick}
                  onToggleTodo={onToggleTodo}
                  onAddTask={onAddTask ? c => onAddTask(classCategoryId(c.id)) : undefined}
                  onEventClick={onEventClick}
                  onOpenNote={onOpenNote}
                  onCreateLinkedNote={onCreateLinkedNote}
                  onToggleAssignment={onToggleAssignment}
                  onAssignmentDetail={setDetailAssign}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  isMobile={isMobile}
                />
              ))}
              </section>
            </>
          )}
        </div>

        {/* ── Bulk action bar ── */}
        {selectMode && selectedIds.size > 0 && (
          <div style={{
            flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--surface)',
            padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)' }}>
              {selectedIds.size} selected
            </span>
            <button
              onClick={bulkMarkDone}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none',
                background: CANVAS_COLOR, color: '#fff',
                fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Mark done
            </button>
            <button
              onClick={exitSelect}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text-2)',
                fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Assignment detail ── */}
      {detailAssign && (
        <AssignmentDetailModal
          assignment={detailAssign}
          courseColor={getCourseColor(detailAssign.courseId, courseColors)}
          onClose={() => setDetailAssign(null)}
          onToggleDone={id => { onToggleAssignment?.(id); setDetailAssign(prev => prev?.id === id ? { ...prev, done: !prev.done } : prev) }}
          onUpdateNotes={(id, n) => { onUpdateAssignmentNotes?.(id, n); setDetailAssign(prev => prev?.id === id ? { ...prev, notes: n } : prev) }}
        />
      )}
    </>
  )
}
