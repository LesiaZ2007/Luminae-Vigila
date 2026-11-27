'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Planner from '@/components/Planner'
import { buildDemoSeed } from '@/demo/seedDemo'
import { disableDemoStore, enableDemoStore, isDemoStore } from '@/lib/usePersist'

const subscribe = () => () => {}

/** Client-only wrapper so /demo seeds its in-memory store before Planner mounts. */
export default function DemoPage() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const [instance, setInstance] = useState(0)

  useEffect(() => () => disableDemoStore(), [])

  if (!mounted) {
    return <div style={{ height: '100dvh', background: 'var(--bg)' }} />
  }

  if (!isDemoStore()) {
    enableDemoStore(buildDemoSeed())
  }

  return (
    <Planner
      key={instance}
      demo
      onResetDemo={() => {
        enableDemoStore(buildDemoSeed())
        setInstance(n => n + 1)
      }}
    />
  )
}
