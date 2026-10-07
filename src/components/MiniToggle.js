'use client'

/**
 * The small pill toggle used by the sidebar's inline Canvas/Google sections —
 * a compact variant of the bigger `Toggle` switches the settings modals use.
 * Lived once in each sidebar section as an identical, unexported copy.
 */
export default function MiniToggle({ enabled, onChange, disabled = false }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      style={{
        width: 26, height: 14, borderRadius: 999, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: (enabled && !disabled) ? 'rgba(99,179,237,.8)' : 'rgba(255,255,255,.12)',
        position: 'relative', transition: 'background .18s', flexShrink: 0,
        opacity: disabled ? 0.3 : 1, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: enabled ? 13 : 2,
        width: 10, height: 10, borderRadius: '50%',
        background: '#fff', transition: 'left .18s',
        display: 'block',
      }} />
    </button>
  )
}
