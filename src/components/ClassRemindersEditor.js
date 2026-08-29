'use client'

/**
 * ClassRemindersEditor — "remind me two days before anything due in Physics".
 *
 * Two rows of toggle chips, one for coursework and one for exams. Multi-select on
 * purpose: a week's warning *and* a nudge the day before is a normal want, and making
 * them exclusive would mean choosing which of the two to lose.
 *
 * The chips write straight through to the class rather than into a draft — this sits
 * inside an always-visible card, not a modal with a Save button, and a rule that
 * needed saving somewhere else would be a rule people set and then wonder about.
 * `src/lib/classReminders.js` explains why the rule stays on the class instead of
 * being copied onto each task.
 *
 * Props
 * ─────
 *  cls      the class entry
 *  color    the class colour, used for an active chip
 *  onChange (reminders) => void — the new `{ tasks, exams }`, ready to save
 */

import { Bell, GraduationCap, ListTodo } from 'lucide-react'
import { reminderLabelForMs } from '@/lib/reminders'
import {
  CLASS_REMINDER_PRESETS, getClassRules, describeRules,
} from '@/lib/classReminders'

const ROWS = [
  {
    kind:  'tasks',
    icon:  ListTodo,
    label: 'Tasks due',
    empty: 'No reminder for coursework in this class.',
    lead:  offsets => `You'll be reminded ${offsets} anything is due in this class.`,
  },
  {
    kind:  'exams',
    icon:  GraduationCap,
    label: 'Exams',
    empty: 'No reminder for this class’s exams.',
    lead:  offsets => `You'll be reminded ${offsets} each exam in this class.`,
  },
]

export default function ClassRemindersEditor({ cls, color = 'var(--blue)', onChange }) {
  // Read through the validator rather than off the class, so a malformed stored rule
  // shows the editor its cleaned-up state instead of rendering a chip that does nothing.
  const rules = getClassRules(cls)

  function toggle(kind, ms) {
    const current = rules[kind]
    const next = current.some(r => r.ms === ms)
      ? current.filter(r => r.ms !== ms)
      : [...current, { ms, label: reminderLabelForMs(ms, []) }].sort((a, b) => b.ms - a.ms)
    onChange?.({ ...rules, [kind]: next })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <Bell size={12} style={{ color: 'var(--blue)' }} />
        <label className="field-label" style={{ margin: 0 }}>Reminders</label>
      </div>

      {ROWS.map(row => {
        const selected = rules[row.kind]
        const summary  = describeRules(selected)
        const Icon     = row.icon
        return (
          <div key={row.kind} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <Icon size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)' }}>{row.label}</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {CLASS_REMINDER_PRESETS[row.kind].map(ms => {
                const on   = selected.some(r => r.ms === ms)
                const full = reminderLabelForMs(ms, [])
                return (
                  <button
                    key={ms}
                    type="button"
                    aria-pressed={on}
                    /* The visible text is trimmed to "2 days" so the chips stay small,
                       and both rows offer some of the same offsets — so read aloud,
                       four of these buttons would otherwise be called the same thing. */
                    aria-label={`${full}, ${row.label}`}
                    onClick={() => toggle(row.kind, ms)}
                    style={{
                      padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.7rem', fontWeight: 700, transition: 'all .13s',
                      border: on ? `1px solid ${color}` : '1px solid var(--border)',
                      background: on ? `${typeof color === 'string' && color.startsWith('#') ? color + '22' : 'var(--blue-bg)'}` : 'var(--surface2)',
                      color: on ? color : 'var(--text-3)',
                    }}
                  >
                    {full.replace(/ before$/, '')}
                  </button>
                )
              })}
            </div>

            <p style={{ margin: '5px 0 0', fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.45 }}>
              {summary ? row.lead(summary) : row.empty}
            </p>
          </div>
        )
      })}

      {/* The precedence rule, stated where someone can act on it — otherwise a task
          with its own reminder looks like the class rule silently failed. */}
      <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-3)', lineHeight: 1.5 }}>
        A task with its own reminder keeps it — the class rule only fills in where there
        isn&apos;t one, so nothing fires twice.
      </p>
    </div>
  )
}
