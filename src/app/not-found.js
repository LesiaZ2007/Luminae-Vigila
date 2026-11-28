import Link from 'next/link'
import CrowIcon from '@/components/CrowIcon'

export const metadata = {
  title: 'Page not found · luminaeVigila',
}

/** Custom 404 matching the Luminae Vigila planner card surface and crow emblem. */
export default function NotFound() {
  return (
    <main style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: 24, background: 'var(--bg)', color: 'var(--text)',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '44px 32px', borderRadius: 20, background: 'var(--surface)',
        border: '1px solid var(--border)', gap: 18, textAlign: 'center',
        maxWidth: 400, width: '100%', boxShadow: 'var(--shadow-modal)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: '#243b55', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(36,59,85,0.28)',
        }}>
          <CrowIcon size={30} color="#ffffff" />
        </div>
        <div style={{
          fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--blue)',
        }}>
          404 · Not found
        </div>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>
            That page slipped off the schedule
          </h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
            Check the address, head back to your planner, or explore the live demo workspace.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '10px 20px', borderRadius: 999,
              background: 'var(--blue)', color: '#fff',
              textDecoration: 'none', fontSize: '0.84rem', fontWeight: 700,
            }}
          >
            Open planner
          </Link>
          <Link
            href="/demo"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '10px 20px', borderRadius: 999,
              background: 'var(--surface2)', color: 'var(--text)',
              border: '1px solid var(--border)',
              textDecoration: 'none', fontSize: '0.84rem', fontWeight: 700,
            }}
          >
            Try demo
          </Link>
        </div>
        <a
          href="https://lastivka.dev/guide/luminae/"
          rel="noopener"
          style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-3)', textDecoration: 'none' }}
        >
          Back to Lastivka field guide ↗
        </a>
      </div>
    </main>
  )
}
