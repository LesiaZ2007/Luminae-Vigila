'use client'

/**
 * GpaPanel — GPA / grade-projection card for the Courses tab.
 *
 * Props:
 *   canvasAssignments  — array from page.js state (fields: id, courseId, courseName,
 *                        score, pointsPossible, submissionState, dueAt, title)
 *   courseColors       — { [courseId]: hexColor }
 */

import { useState, useMemo, useEffect } from 'react'
import { GraduationCap, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
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

function CourseGpaRow({ course, color, credits, onCreditsChange }) {
  const { name, earnedPts, possiblePts, totalPossible, pct, grade } = course
  const gc = gradeColor(grade.letter)

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

        {/* Letter badge */}
        <span style={{
          fontSize: '0.78rem', fontWeight: 800, padding: '2px 9px', borderRadius: 999,
          color: gc, background: `${gc}18`, flexShrink: 0,
        }}>
          {grade.letter}
        </span>

        {/* Numeric % */}
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>
          {pct.toFixed(1)}%
        </span>
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
        </div>

        {/* Progress bar */}
        <div style={{ height: 5, borderRadius: 999, background: 'var(--border)' }}>
          <div style={{
            height: '100%', borderRadius: 999,
            background: gc,
            width: `${Math.min(pct, 100)}%`,
            transition: 'width .4s ease',
          }} />
        </div>

        {/* GPA points row + credit hours editor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
            GPA points: <strong style={{ color: 'var(--text-2)' }}>{grade.points.toFixed(1)}</strong>
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

        {/* What-do-I-need helper */}
        <WhatINeedRow
          earnedPts={earnedPts}
          possiblePts={possiblePts}
          totalPossible={totalPossible}
          color={color}
        />
      </div>
    </div>
  )
}

// ── Main GpaPanel ─────────────────────────────────────────────────────────────

export default function GpaPanel({ canvasAssignments = [], courseColors = {} }) {
  const [open, setOpen] = useState(false)
  const [credits, setCredits] = useState({}) // { [courseId]: number }

  // Load persisted credits on mount
  useEffect(() => {
    const prefs = loadGpaPrefs()
    if (prefs.credits) setCredits(prefs.credits)
  }, [])

  function handleCreditsChange(courseId, val) {
    setCredits(prev => {
      const next = { ...prev, [courseId]: val }
      saveGpaPrefs({ credits: next })
      return next
    })
  }

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

  // Credit-weighted GPA
  const overallGpa = useMemo(() => {
    if (!courses.length) return null
    let weightedSum = 0
    let totalCredits = 0
    for (const c of courses) {
      const cr = credits[c.id] ?? 3
      weightedSum  += c.grade.points * cr
      totalCredits += cr
    }
    return totalCredits > 0 ? weightedSum / totalCredits : null
  }, [courses, credits])

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
                />
              ))}

              <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>
                Based on graded assignments only. Credit hours persist locally.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
