import { describe, it, expect, vi, afterEach } from 'vitest'
import { ddlOnce, resetDdlCache } from './ddlOnce'

afterEach(() => resetDdlCache())

describe('ddlOnce', () => {
  it('runs the migration once per key, however many times it is called', async () => {
    const run = vi.fn().mockResolvedValue('ok')

    await ddlOnce('k', run)
    await ddlOnce('k', run)
    await ddlOnce('k', run)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('keeps separate keys independent', async () => {
    const runA = vi.fn().mockResolvedValue('a')
    const runB = vi.fn().mockResolvedValue('b')

    await Promise.all([ddlOnce('a', runA), ddlOnce('b', runB)])

    expect(runA).toHaveBeenCalledTimes(1)
    expect(runB).toHaveBeenCalledTimes(1)
  })

  it('lets concurrent callers share one in-flight promise rather than racing their own', async () => {
    let resolveRun
    const run = vi.fn(() => new Promise(resolve => { resolveRun = resolve }))

    const first  = ddlOnce('k', run)
    const second = ddlOnce('k', run)

    // Both callers were handed the exact same promise, not two separate ones —
    // this is what makes them await one round trip instead of issuing their own.
    expect(first).toBe(second)
    expect(run).toHaveBeenCalledTimes(1)

    resolveRun('done')
    await expect(first).resolves.toBe('done')
    await expect(second).resolves.toBe('done')
  })

  it('evicts a rejection so the next call retries rather than staying poisoned', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok')

    await expect(ddlOnce('k', run)).rejects.toThrow('transient')
    // A second call after the failure must actually invoke `run` again, not
    // reuse (and re-throw) the same rejected promise forever.
    await expect(ddlOnce('k', run)).resolves.toBe('ok')

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('resetDdlCache clears every key, so the next call re-runs regardless of past success', async () => {
    const run = vi.fn().mockResolvedValue('ok')

    await ddlOnce('k', run)
    resetDdlCache()
    await ddlOnce('k', run)

    expect(run).toHaveBeenCalledTimes(2)
  })
})
