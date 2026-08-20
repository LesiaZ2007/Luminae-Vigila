'use client'

/**
 * Skeleton — shimmering placeholders shown while content loads.
 *
 * Two reasons these exist rather than a spinner:
 *  - The Notes tab and the calendar are code-split (`next/dynamic`), so on a
 *    cold load there's a real gap before the chunk arrives. A skeleton in the
 *    shape of the eventual layout makes that gap read as "loading" instead of
 *    "broken".
 *  - Canvas and Google Calendar fetch over the network, which on a phone can
 *    take seconds.
 *
 * The shimmer itself is a single CSS animation (`lvShimmer` in globals.css)
 * driven by a moving background gradient, so a screen full of these is one
 * compositor-level animation rather than dozens of JS timers. It's disabled
 * under prefers-reduced-motion, where the bars render as flat blocks.
 */

/** A single shimmering bar. Width/height accept any CSS length. */
export function SkeletonBar({ width = '100%', height = 12, radius = 6, style }) {
  return (
    <div
      className="lv-skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  )
}

/** A circle — avatars, checkboxes, icon slots. */
export function SkeletonCircle({ size = 20, style }) {
  return (
    <div
      className="lv-skeleton"
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, ...style }}
    />
  )
}

/**
 * Wrapper that announces loading to assistive tech. The bars themselves are
 * aria-hidden, so without this a screen reader would hear nothing at all.
 */
export function SkeletonGroup({ label = 'Loading…', children, style }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={style}>
      <span className="lv-sr-only">{label}</span>
      {children}
    </div>
  )
}

/** Rows that mirror the note list: color spine, title, preview, tag pills. */
export function NoteListSkeleton({ rows = 6 }) {
  return (
    <SkeletonGroup label="Loading notes" style={{ padding: '0 10px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', gap: 8, padding: '9px 10px', marginBottom: 3,
          // Fade the tail of the list so it reads as "more below", not "cut off"
          opacity: 1 - i * 0.13,
        }}>
          <SkeletonBar width={3} height={34} radius={2} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <SkeletonBar width={`${70 - (i % 3) * 12}%`} height={11} />
            <SkeletonBar width={`${90 - (i % 4) * 10}%`} height={9} style={{ marginTop: 6 }} />
          </div>
          <SkeletonCircle size={13} style={{ marginTop: 2 }} />
        </div>
      ))}
    </SkeletonGroup>
  )
}

/** Full Notes tab placeholder — list pane plus editor pane. */
export function NotesPanelSkeleton({ isMobile = false }) {
  return (
    <div style={{ display: 'flex', height: '100%', flex: 1, overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{
        width: isMobile ? '100%' : 300, flexShrink: 0,
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        padding: '16px 6px 10px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', marginBottom: 12 }}>
          <SkeletonBar width={82} height={15} />
          <SkeletonBar width={58} height={26} radius={8} />
        </div>
        <div style={{ padding: '0 10px', marginBottom: 12 }}>
          <SkeletonBar height={30} radius={9} />
        </div>
        <NoteListSkeleton />
      </div>

      {!isMobile && (
        <div style={{ flex: 1, padding: '18px 20px' }}>
          <SkeletonBar width="42%" height={20} />
          <SkeletonBar width={230} height={28} radius={8} style={{ marginTop: 16 }} />
          <div style={{ marginTop: 22 }}>
            {['92%', '86%', '70%', '94%', '61%', '80%', '45%'].map((w, i) => (
              <SkeletonBar key={i} width={w} height={10} style={{ marginTop: i ? 12 : 0 }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Calendar placeholder — day columns with a few blocked-out events. */
export function CalendarSkeleton() {
  const cols = 7
  return (
    <SkeletonGroup
      label="Loading calendar"
      style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <SkeletonBar width={160} height={18} />
        <SkeletonBar width={190} height={30} radius={9} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, flex: 1, minHeight: 0 }}>
        {Array.from({ length: cols }).map((_, c) => (
          <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkeletonBar height={13} radius={5} />
            {/* Deterministic block placement — Math.random() here would make
                every re-render reshuffle the shapes while you're staring at it */}
            {[0, 1, 2].map(b => {
              const show = (c + b) % 3 !== 0
              if (!show) return <div key={b} style={{ height: 44 }} />
              return <SkeletonBar key={b} height={38 + ((c * 7 + b * 13) % 34)} radius={8} />
            })}
          </div>
        ))}
      </div>
    </SkeletonGroup>
  )
}

/** Generic list placeholder — Canvas assignments, courses, agenda entries. */
export function ListSkeleton({ rows = 5, label = 'Loading', showCircle = true, padding = 0 }) {
  return (
    <SkeletonGroup label={label} style={{ padding }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px', opacity: 1 - i * 0.12 }}>
          {showCircle && <SkeletonCircle size={18} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <SkeletonBar width={`${76 - (i % 3) * 14}%`} height={11} />
            <SkeletonBar width={`${52 - (i % 2) * 12}%`} height={9} style={{ marginTop: 6 }} />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  )
}
