'use client'

/**
 * GpaPanel — GPA / grade-projection card for the Courses tab.
 *
 * Props:
 *   canvasAssignments  — array from page.js state (fields: id, courseId, courseName,
 *                        score, pointsPossible, submissionState, dueAt, title)
 *   courseColors       — { [courseId]: hexColor }
 *
 * Canvas grade auto-import:
 *   - Fetches live grades from /api/canvas/grades whenever the panel opens or
 *     canvasAssignments changes (i.e. the same cadence as the existing Canvas sync).
 *   - Auto-imported scores populate the grade display.
 *   - A manual override (stored in localStorage under lv-gpa.overrides) always wins
 *     over the auto-imported value. A small badge shows the source; overridden values
 *     show a "reset to Canvas" affordance.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { GraduationCap, ChevronDown, ChevronRight, TrendingUp, RefreshCw, RotateCcw } from 'lucide-react'
import { getCourseColor } from '@/components/CoursesPanel'

// ── GPA scale ────────────────────────────────────────────────────────────────

const GPA_SCALE = [
  { min: 93, letter: 'A',  points: 4.0 },
  { min: 90, letter: 'A-', points: 3.7 },
  { min: 87, letter: 'B+', points: 3.3 },
  { min: 83, letter: 'B',  points: 3.0 },
  { min: 80, letter: 'B-', points: 2.7 },
  { min: 77, letter: 'C+', points: 2.3 },
  { min: 73, letter: 'C',  points: 2.0 },
  { min: 70, letter: 'C-', points: 1.7 },
  { min: 67, letter: 'D+', points: 1.3 },
  { min: 63, letter: 'D',  points: 1.0 },
  { min: 60, letter: 'D-', points: 0.7 },
  { min: 0,  letter: 'F',  points: 0.0 },
]

function pctToGrade(pct) {
  for (const g of GPA_SCALE) {
    if (pct >= g.min) return g
  }
  return GPA_SCALE[GPA_SCALE.length - 1]
}

function gradeColor(letter) {
  if (letter.startsWith('A')) return '#10b981'
  if (letter.startsWith('B')) return '#3a6fa8'
  if (letter.startsWith('C')) return '#f59e0b'
  return '#ef4444'
}

const LS_KEY = 'lv-gpa'

function loadGpaPrefs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}

function saveGpaPrefs(prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)) } catch {}
}

// ── Source badge ───────────────────────────────────────────────────────────────

function SourceBadge({ isManual, onReset }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '1px 6px', borderRadius: 999, background: isManual ? 'rgba(245,158,11,.15)' : 'rgba(16,185,129,.1)', color: isManual ? '#f59e0b' : '#10b981', flexShrink: 0 }}>
      {isManual ? 'manual' : 'Canvas live'}
      {isManual && (
        <button
          onClick={onReset}
          title="Reset to Canvas auto-grade"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#f59e0b', lineHeight: 0, marginLeft: 2 }}
        >
          <RotateCcw size={9} />
        </button>
      )}
    </span>
  )
}

// ── WhatINeed helper ──────────────────────────────────────────────────────────

function WhatINeedRow({ earnedPts, possiblePts, totalPossible, color }) {
  const [targetPct, setTargetPct] = useState('')

  const remaining = totalPossible - possiblePts
  const neededResult = useMemo(() => {
    const t = parseFloat(targetPct)
    if (isNaN(t) || t < 0 || t > 100) return null
    if (remaining <= 0) return null
    // target % means: (earnedPts + needed) / totalPossible * 100 = t
    const needed = (t / 100) * totalPossible - earnedPts
    const neededPct = (needed / remaining) * 100
    return neededPct
  }, [targetPct, earnedPts, totalPossible, remaining])

  if (remaining <= 0) return null

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        What do I need?
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>Target %</span>
        <input
          type="number"
          min="0"
          max="100"
          value={targetPct}
          onChange={e => setTargetPct(e.target.value)}
          placeholder="e.g. 90"
          style={{
            width: 68, padding: '3px 7px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.78rem',
            outline: 'none',
          }}
        />
        {neededResult !== null && (
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, marginLeft: 4,
            color: neededResult > 100 ? '#ef4444' : neededResult > 90 ? '#f59e0b' : '#10b981',
          }}>
            {neededResult > 100
              ? 'Not achievable'
              : `Need avg ${Math.round(neededResult)}% on remaining ${Math.round(remaining)} pts`}
          </span>
        )}
      </div>
    </div>
  )
}

// ── CourseGpaRow ──────────────────────────────────────────────────────────────

/**
 * canvasLive  — { currentScore, currentGrade } from /api/canvas/grades (may be null)
 * override    — { score, grade } manual entry stored in prefs (may be null)
 * onOverride  — (score) => void  — set manual score override
 * onResetOverride — () => void   — clear manual override
 */
function CourseGpaRow({ course, color, credits, onCreditsChange, canvasLive, override, onOverride, onResetOverride }) {
  const { name, earnedPts, possiblePts, totalPossible, pct: assignmentPct } = course

  // Determine effective grade/pct:
  //   1. manual override wins
  //   2. else Canvas live score (currentScore) wins when available
  //   3. else fall back to assignment-computed grade
  const isManualOverride = override != null
  const effectivePct = isManualOverride
    ? override.score
    : (canvasLive?.currentScore != null ? canvasLive.currentScore : assignmentPct)
  const effectiveGrade = pctToGrade(effectivePct)
  const gc = gradeColor(effectiveGrade.letter)

  // Inline manual-override input state (local to the row)
  const [editingScore, setEditingScore] = useState(false)
  const [draftScore, setDraftScore]     = useState('')

  return (
    <div style={{
      borderRadius: 10, border: '1px solid var(--border)',
      background: 'var(--surface)', overflow: 'hidden', marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {name}
        </span>

        {/* Source badge */}
        {canvasLive?.currentScore != null && (
          <SourceBadge isManual={isManualOverride} onReset={onResetOverride} />
        )}

        {/* Letter badge */}
        <span style={{
          fontSize: '0.78rem', fontWeight: 800, padding: '2px 9px', borderRadius: 999,
          color: gc, background: `${gc}18`, flexShrink: 0,
        }}>
          {effectiveGrade.letter}
        </span>

        {/* Numeric % — click to override */}
        {editingScore ? (
          <input
            autoFocus
            type="number" min="0" max="100" step="0.1"
            value={draftScore}
            onChange={e => setDraftScore(e.target.value)}
            onBlur={() => {
              const n = parseFloat(draftScore)
              if (!isNaN(n) && n >= 0 && n <= 100) onOverride(n)
              setEditingScore(false); setDraftScore('')
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.currentTarget.blur() }
              if (e.key === 'Escape') { setEditingScore(false); setDraftScore('') }
            }}
            style={{ width: 60, padding: '2px 5px', borderRadius: 6, border: '1px solid var(--blue)', background: 'var(--input-bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.78rem', textAlign: 'right', outline: 'none', flexShrink: 0 }}
          />
        ) : (
          <button
            onClick={() => { setDraftScore(effectivePct.toFixed(1)); setEditingScore(true) }}
            title="Click to override grade"
            style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', borderRadius: 4, textDecoration: 'underline dotted', textUnderlineOffset: 2 }}
          >
            {effectivePct.toFixed(1)}%
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Points earned / possible */}
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
          {earnedPts.toFixed(1)} / {possiblePts.toFixed(1)} pts graded
          {totalPossible > possiblePts && (
            <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
              ({(totalPossible - possiblePts).toFixed(1)} ungraded)
            </span>
          )}
          {canvasLive?.currentScore != null && !isManualOverride && (
            <span style={{ color: 'var(--text-3)', marginLeft: 6, fontStyle: 'italic' }}>
              · Canvas: {canvasLive.currentScore.toFixed(1)}%
              {canvasLive.currentGrade ? ` (${canvasLive.currentGrade})` : ''}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ height: 5, borderRadius: 999, background: 'var(--border)' }}>
          <div style={{
            height: '100%', borderRadius: 999,
            background: gc,
            width: `${Math.min(effectivePct, 100)}%`,
            transition: 'width .4s ease',
          }} />
        </div>

        {/* GPA points row + credit hours editor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
            GPA points: <strong style={{ color: 'var(--text-2)' }}>{effectiveGrade.points.toFixed(1)}</strong>
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            Credits:
            <input
              type="number"
              min="0"
              max="12"
              step="0.5"
              value={credits}
              onChange={e => onCreditsChange(parseFloat(e.target.value) || 0)}
              style={{
                width: 44, padding: '2px 5px', borderRadius: 5,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.72rem',
                textAlign: 'center', outline: 'none',
              }}
            />
          </span>
        </div>

        {/* What-do-I-need helper — only relevant in assignment-based mode */}
        <WhatINeedRow
          earnedPts={earnedPts}
          possiblePts={possiblePts}
          totalPossible={totalPossible}
          color={color}
        />
        {/* Hint to override */}
        {canvasLive?.currentScore == null && !isManualOverride && (
          <div style={{ fontSize: '0.62rem', color: 'var(--text-3)', marginTop: 2, fontStyle: 'italic' }}>
            Click the % above to set a manual grade override.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main GpaPanel ─────────────────────────────────────────────────────────────

export default function GpaPanel({ canvasAssignments = [], courseColors = {} }) {
  const [open,     setOpen]    = useState(false)
  const [credits,  setCredits] = useState({})   // { [courseId]: number }
  // Canvas live grades: null = not loaded yet, {} = loaded (map courseId → grade obj)
  const [canvasGrades,  setCanvasGrades]  = useState(null)
  const [gradesLoading, setGradesLoading] = useState(false)
  // Manual overrides: { [courseId]: { score: number } }
  const [overrides, setOverrides] = useState({})

  // Load persisted credits + overrides on mount
  useEffect(() => {
    const prefs = loadGpaPrefs()
    if (prefs.credits)   setCredits(prefs.credits)
    if (prefs.overrides) setOverrides(prefs.overrides)
  }, [])

  function handleCreditsChange(courseId, val) {
    setCredits(prev => {
      const next = { ...prev, [courseId]: val }
      saveGpaPrefs({ ...loadGpaPrefs(), credits: next })
      return next
    })
  }

  function handleOverride(courseId, score) {
    setOverrides(prev => {
      const next = { ...prev, [courseId]: { score } }
      saveGpaPrefs({ ...loadGpaPrefs(), overrides: next })
      return next
    })
  }

  function handleResetOverride(courseId) {
    setOverrides(prev => {
      const next = { ...prev }
      delete next[courseId]
      saveGpaPrefs({ ...loadGpaPrefs(), overrides: next })
      return next
    })
  }

  // Fetch Canvas grades — called when the panel opens or canvasAssignments changes
  // Uses the same credential flow as the existing GradesPanel in CoursesPanel.js.
  const fetchRef = useRef(null)
  const fetchCanvasGrades = useCallback(async (courseIds) => {
    if (!courseIds.length) { setCanvasGrades({}); return }
    // De-bounce: cancel any in-flight fetch
    const id = Symbol()
    fetchRef.current = id
    setGradesLoading(true)
    try {
      const res  = await fetch(`/api/canvas/grades?courseIds=${courseIds.join(',')}`)
      if (fetchRef.current !== id) return   // stale
      if (!res.ok) return
      const data = await res.json()
      if (fetchRef.current !== id) return
      const map = {}
      for (const g of data.grades ?? []) map[g.courseId] = g
      setCanvasGrades(map)
    } catch (_) {
      // non-fatal — fall back to assignment-computed grades
    } finally {
      if (fetchRef.current === id) setGradesLoading(false)
    }
  }, [])

  // Derive unique course IDs from canvasAssignments (stable for useMemo)
  const courseIds = useMemo(() => {
    const seen = new Set()
    for (const a of canvasAssignments) seen.add(a.courseId)
    return [...seen]
  }, [canvasAssignments])

  // Fetch Canvas grades whenever the set of course IDs changes (same cadence as sync)
  useEffect(() => {
    if (!courseIds.length) return
    fetchCanvasGrades(courseIds)
  }, [courseIds.join(','), fetchCanvasGrades]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build per-course grade summaries from graded assignments
  const courses = useMemo(() => {
    const map = {}
    for (const a of canvasAssignments) {
      const key = a.courseId
      if (!map[key]) map[key] = { id: key, name: a.courseName, graded: [], all: [] }
      if (a.pointsPossible != null && a.pointsPossible > 0) map[key].all.push(a)
      if (a.score != null && a.pointsPossible != null && a.pointsPossible > 0) map[key].graded.push(a)
    }
    return Object.values(map)
      .filter(c => c.graded.length > 0)
      .map(c => {
        const earnedPts   = c.graded.reduce((s, a) => s + a.score, 0)
        const possiblePts = c.graded.reduce((s, a) => s + a.pointsPossible, 0)
        const totalPossible = c.all.reduce((s, a) => s + a.pointsPossible, 0)
        const pct         = possiblePts > 0 ? (earnedPts / possiblePts) * 100 : 0
        const grade       = pctToGrade(pct)
        return { ...c, earnedPts, possiblePts, totalPossible, pct, grade }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [canvasAssignments])

  // Credit-weighted GPA — uses override → Canvas live → assignment-computed
  const overallGpa = useMemo(() => {
    if (!courses.length) return null
    let weightedSum = 0
    let totalCredits = 0
    for (const c of courses) {
      const cr  = credits[c.id] ?? 3
      const ov  = overrides[c.id]
      const live = canvasGrades?.[c.id]
      const effectivePct = ov != null
        ? ov.score
        : (live?.currentScore != null ? live.currentScore : c.pct)
      weightedSum  += pctToGrade(effectivePct).points * cr
      totalCredits += cr
    }
    return totalCredits > 0 ? weightedSum / totalCredits : null
  }, [courses, credits, overrides, canvasGrades])

  const hasGraded = courses.length > 0

  // Derive a representative accent color from the first course
  const accentColor = courses.length > 0 ? getCourseColor(courses[0].id, courseColors) : 'var(--blue)'

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Collapsible toggle header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: open ? '12px 12px 0 0' : 12,
          border: '1px solid var(--border)',
          borderBottom: open ? '1px solid var(--border)' : '1px solid var(--border)',
          background: open ? 'var(--surface2)' : 'var(--surface2)',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          transition: 'border-radius .15s',
        }}
      >
        {open
          ? <ChevronDown  size={13} style={{ color: accentColor, flexShrink: 0, opacity: 0.8 }} />
          : <ChevronRight size={13} style={{ color: accentColor, flexShrink: 0, opacity: 0.8 }} />}

        <GraduationCap size={13} style={{ color: accentColor, flexShrink: 0 }} />

        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          GPA / Grades
        </span>

        {/* Refresh Canvas grades button */}
        {open && (
          <button
            onClick={e => { e.stopPropagation(); fetchCanvasGrades(courseIds) }}
            title="Refresh Canvas grades"
            style={{ background: 'none', border: 'none', cursor: gradesLoading ? 'wait' : 'pointer', padding: '3px 5px', borderRadius: 6, color: 'var(--text-3)', display: 'flex', flexShrink: 0 }}
          >
            <RefreshCw size={11} style={{ animation: gradesLoading ? 'gc-spin 1s linear infinite' : 'none' }} />
          </button>
        )}

        {/* Overall GPA pill */}
        {overallGpa !== null && (
          <span style={{
            fontSize: '0.68rem', fontWeight: 800, flexShrink: 0,
            color: overallGpa >= 3.5 ? '#10b981' : overallGpa >= 2.7 ? '#3a6fa8' : overallGpa >= 2.0 ? '#f59e0b' : '#ef4444',
            background: overallGpa >= 3.5 ? 'rgba(16,185,129,.12)' : overallGpa >= 2.7 ? 'rgba(58,111,168,.14)' : overallGpa >= 2.0 ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.12)',
            padding: '2px 9px', borderRadius: 999,
          }}>
            GPA {overallGpa.toFixed(2)}
          </span>
        )}

        {hasGraded && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', color: 'var(--text-3)', flexShrink: 0 }}>
            <TrendingUp size={10} />
            {courses.length} course{courses.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded body */}
      {open && (
        <div style={{
          border: '1px solid var(--border)',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          background: 'var(--surface)',
          padding: '12px 14px 14px',
        }}>
          {!hasGraded ? (
            /* Empty state */
            <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text-3)', fontSize: '0.82rem' }}>
              <GraduationCap size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No graded assignments yet</div>
              <div style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                Grades will appear here once Canvas assignments have scores.
              </div>
            </div>
          ) : (
            <>
              {/* Overall GPA summary bar */}
              {overallGpa !== null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '8px 12px', borderRadius: 10,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  marginBottom: 14,
                }}>
                  <GraduationCap size={14} style={{ color: accentColor, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                    Projected GPA
                  </span>
                  <span style={{
                    fontSize: '1.4rem', fontWeight: 900, lineHeight: 1,
                    color: overallGpa >= 3.5 ? '#10b981' : overallGpa >= 2.7 ? '#3a6fa8' : overallGpa >= 2.0 ? '#f59e0b' : '#ef4444',
                  }}>
                    {overallGpa.toFixed(2)}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>/ 4.00</span>
                </div>
              )}

              {/* Per-course rows */}
              {courses.map(course => (
                <CourseGpaRow
                  key={course.id}
                  course={course}
                  color={getCourseColor(course.id, courseColors)}
                  credits={credits[course.id] ?? 3}
                  onCreditsChange={val => handleCreditsChange(course.id, val)}
                  canvasLive={canvasGrades?.[course.id] ?? null}
                  override={overrides[course.id] ?? null}
                  onOverride={score => handleOverride(course.id, score)}
                  onResetOverride={() => handleResetOverride(course.id)}
                />
              ))}

              <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>
                {canvasGrades ? 'Canvas live grades · ' : ''}Based on graded assignments. Credit hours persist locally.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
