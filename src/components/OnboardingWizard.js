'use client'

/**
 * OnboardingWizard — first-run modal wizard shown once to new users.
 *
 * localStorage keys:
 *   lv-onboarding-done   — "true" once dismissed/completed (never shown again)
 *
 * Steps:
 *   1. Welcome — what luminaeVigila does
 *   2. Connect Google Calendar (or skip)
 *   3. Connect Canvas (or skip)
 *   4. Quick tour of main areas
 *
 * Props:
 *   onClose            — called when the wizard is dismissed/completed
 *   onOpenGoogleSettings  — opens the Google Calendar settings modal
 *   onOpenCanvasSettings  — opens the Canvas settings modal
 */

import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, CalendarDays, BookOpen, Timer, Sparkles, Check } from 'lucide-react'

const STORAGE_KEY = 'lv-onboarding-done'

/* ── Step data ───────────────────────────────────────── */
function useSteps({ onOpenGoogleSettings, onOpenCanvasSettings }) {
  return [
    {
      id: 'welcome',
      title: 'Welcome to luminaeVigila',
      subtitle: 'Your all-in-one student planner',
      content: WelcomeContent,
    },
    {
      id: 'google',
      title: 'Connect Google Calendar',
      subtitle: 'Optional — you can always do this later',
      content: (props) => <GoogleContent {...props} onOpenGoogleSettings={onOpenGoogleSettings} />,
    },
    {
      id: 'canvas',
      title: 'Connect Canvas LMS',
      subtitle: 'Optional — you can always do this later',
      content: (props) => <CanvasContent {...props} onOpenCanvasSettings={onOpenCanvasSettings} />,
    },
    {
      id: 'tour',
      title: "You're all set!",
      subtitle: 'Here is a quick look at the main areas',
      content: TourContent,
    },
  ]
}

/* ── Main component ──────────────────────────────────── */
export default function OnboardingWizard({ onClose, onOpenGoogleSettings, onOpenCanvasSettings }) {
  const [step,    setStep]    = useState(0)
  const [closing, setClosing] = useState(false)

  const steps = useSteps({ onOpenGoogleSettings, onOpenCanvasSettings })
  const isLast  = step === steps.length - 1
  const isFirst = step === 0

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, 'true') } catch {}
    setClosing(true)
    setTimeout(() => onClose(), 220)
  }

  function next() {
    if (isLast) { dismiss(); return }
    setStep(s => s + 1)
  }

  function prev() {
    if (isFirst) return
    setStep(s => s - 1)
  }

  // Keyboard: Escape = dismiss, ArrowRight = next, ArrowLeft = prev
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') dismiss()
      if (e.key === 'ArrowRight' && !isLast) setStep(s => s + 1)
      if (e.key === 'ArrowLeft'  && !isFirst) setStep(s => s - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isFirst, isLast])

  const StepContent = steps[step].content

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 5000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: closing ? 'backdrop-out 0.22s ease forwards' : 'backdrop-in 0.22s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      {/* Modal card */}
      <div
        className="modal-surface"
        style={{
          width: 'min(520px, 100%)',
          maxHeight: 'min(640px, calc(100dvh - 32px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: closing ? 'modal-out 0.18s cubic-bezier(0.4,0,1,1) forwards' : undefined,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12,
          background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {/* Luminae logo mark */}
              <CrowMark size={20} />
              <span style={{
                fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--blue)', opacity: 0.9,
              }}>
                Step {step + 1} of {steps.length}
              </span>
            </div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>
              {steps[step].title}
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', margin: '4px 0 0', fontWeight: 500 }}>
              {steps[step].subtitle}
            </p>
          </div>
          <button onClick={dismiss} title="Skip tour"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 8, display: 'flex', flexShrink: 0, transition: 'color .12s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
            <X size={18} />
          </button>
        </div>

        {/* Progress dots */}
        <div style={{ padding: '10px 24px 0', display: 'flex', gap: 6, alignItems: 'center' }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              height: 4, borderRadius: 999,
              flex: i === step ? 3 : 1,
              background: i <= step ? 'var(--blue)' : 'var(--border)',
              transition: 'flex 0.3s cubic-bezier(0.22,1,0.36,1), background 0.2s',
            }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 8px' }}>
          <StepContent />
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderTop: '1px solid var(--border)',
          gap: 8,
        }}>
          <button onClick={dismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.76rem', fontWeight: 600, padding: '4px 0', fontFamily: 'inherit', transition: 'color .12s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
            Skip tour
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button onClick={prev} className="btn-ghost" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <ChevronLeft size={15} /> Back
              </button>
            )}
            <button onClick={next} className="btn-primary" style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 5 }}>
              {isLast ? <><Check size={14} /> Done</> : <>Next <ChevronRight size={15} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Helper: check if onboarding should be shown ── */
export function shouldShowOnboarding() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'true' } catch { return false }
}

/* ── Helper: reset onboarding (for "Show tour" button in settings) ── */
export function resetOnboarding() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

/* ════════════════ Step content components ════════════════ */

function WelcomeContent() {
  const features = [
    { icon: <CalendarDays size={16} />, label: 'Calendar & events', desc: 'Weekly, monthly, and daily views with reminders and recurrence' },
    { icon: <ListTodoIcon size={16} />, label: 'Tasks & to-dos',    desc: 'Priorities, due dates, subtasks, and category tags' },
    { icon: <BookOpen size={16} />,     label: 'Canvas LMS sync',   desc: 'Assignments, grades, and due dates pulled automatically' },
    { icon: <CalendarSyncIcon size={16} />, label: 'Google Calendar', desc: 'Read your calendars alongside your own events' },
    { icon: <Timer size={16} />,        label: 'Focus timer',       desc: 'Pomodoro timer linked to your tasks with zen full-screen mode' },
    { icon: <Sparkles size={16} />,     label: 'Corvus AI',         desc: 'Chat-based assistant that knows your schedule and tasks' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
        luminaeVigila is your all-in-one student planner — built around your real schedule, not a generic to-do list.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {features.map(f => (
          <div key={f.label} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 10px',
            borderRadius: 10, background: 'var(--surface2)',
          }}>
            <span style={{ color: 'var(--blue)', marginTop: 1, flexShrink: 0 }}>{f.icon}</span>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{f.label}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GoogleContent({ onOpenGoogleSettings }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
        Connect Google Calendar to see your existing events alongside your luminaeVigila calendar. You can add multiple Google accounts and toggle individual calendars on or off.
      </p>
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>📖</span>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Read-only</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.4 }}>
              Google Calendar events are shown but cannot be edited here. Create and edit events in luminaeVigila directly.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>🔑</span>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Requires sign-in</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.4 }}>
              You need a luminaeVigila account to connect Google Calendar. You can sign in with any Google account.
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={onOpenGoogleSettings}
        className="btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '11px 18px' }}
      >
        Connect Google Calendar
      </button>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
        You can also connect from the sidebar at any time — look for the Google Calendar section.
      </p>
    </div>
  )
}

function CanvasContent({ onOpenCanvasSettings }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
        Connect Canvas to automatically sync your assignments, due dates, and course calendar. No IT setup needed — just your personal API token.
      </p>
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>How to get your token</div>
        {[
          'In Canvas, go to Account → Settings',
          'Scroll to Approved Integrations → New Access Token',
          'Give it a name and copy the token',
          'Paste it in the Canvas Settings here',
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', background: 'var(--blue)', color: '#fff',
              fontSize: '0.66rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.4, paddingTop: 2 }}>{step}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onOpenCanvasSettings}
        className="btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '11px 18px' }}
      >
        Connect Canvas
      </button>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
        No Canvas account? You can still paste an iCal feed URL from Canvas → Calendar → Calendar Feed.
      </p>
    </div>
  )
}

function TourContent() {
  const areas = [
    {
      icon: <CalendarDays size={18} />,
      label: 'Calendar',
      desc: 'Switch between month, week, and day views. Click any slot to create an event. Drag events to reschedule them.',
      color: '#3a6fa8',
    },
    {
      icon: <ListTodoIcon size={18} />,
      label: 'To-Do',
      desc: 'Your task list lives in a side panel on desktop or the To-Do tab on mobile. Prioritize, set due dates, and link tasks to events.',
      color: '#10b981',
    },
    {
      icon: <Sparkles size={18} />,
      label: 'Corvus AI',
      desc: 'The crow icon (bottom-right on desktop, Corvus tab on mobile) opens your AI assistant. Ask it to summarize your week, add tasks, or plan your day.',
      color: '#8b5cf6',
    },
    {
      icon: <Timer size={18} />,
      label: 'Focus Timer',
      desc: 'The timer icon (bottom-right FAB) opens a Pomodoro timer. Link it to a task, pick an ambient background, and enter zen full-screen mode.',
      color: '#f59e0b',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 4px' }}>
        Here is a quick overview of the key areas. Explore at your own pace — everything is one click away.
      </p>
      {areas.map(a => (
        <div key={a.label} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
          borderRadius: 11, background: 'var(--surface2)',
          borderLeft: `3px solid ${a.color}`,
        }}>
          <span style={{ color: a.color, marginTop: 1, flexShrink: 0 }}>{a.icon}</span>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{a.label}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.45 }}>{a.desc}</div>
          </div>
        </div>
      ))}
      <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '4px 0 0', lineHeight: 1.5 }}>
        Tip: You can re-open this tour any time from the sidebar (look for "Show tour").
      </p>
    </div>
  )
}

/* ── Inline icon stand-ins (Lucide ones not needed as separate imports) ── */
function ListTodoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="6" height="6" rx="1"/>
      <path d="m3 17 2 2 4-4"/>
      <path d="M13 6h8"/>
      <path d="M13 12h8"/>
      <path d="M13 18h8"/>
    </svg>
  )
}

function CalendarSyncIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/>
      <path d="M16 2v4"/>
      <path d="M8 2v4"/>
      <path d="M3 10h5"/>
      <path d="m17 17 2 2 4-4"/>
    </svg>
  )
}

function CrowMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 -64 640 640" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path fill="var(--blue)" d="M544 32h-16.36C513.04 12.68 490.09 0 464 0c-44.18 0-80 35.82-80 80v20.98L12.09 393.57A30.216 30.216 0 0 0 0 417.74c0 22.46 23.64 37.07 43.73 27.03L165.27 384h96.49l44.41 120.1c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38L312.94 384H352c1.91 0 3.76-.23 5.66-.29l44.51 120.38c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38l-41.24-111.53C485.74 352.8 544 279.26 544 192v-80l96-16c0-35.35-42.98-64-96-64zm-80 72c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"/>
    </svg>
  )
}
