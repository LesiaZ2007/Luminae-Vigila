import { describe, it, expect, vi } from 'vitest'
import { sendToSubscription } from './pushSend'

const sub = { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p256', auth: 'auth' }

/** A fake tagged-template sql client that just records what it was asked to run. */
function fakeSql() {
  const calls = []
  const impl = (strings, ...values) => {
    calls.push({ text: strings.join('?'), values })
    return Promise.resolve([])
  }
  impl.calls = calls
  return impl
}

describe('sendToSubscription', () => {
  it('reports success and touches neither the push service nor the database further', async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined)
    const sqlImpl = fakeSql()

    const result = await sendToSubscription(sub, '{"title":"hi"}', { sendNotification, sqlImpl })

    expect(result).toEqual({ ok: true, deleted: false, status: null, error: null })
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      '{"title":"hi"}',
    )
    expect(sqlImpl.calls).toHaveLength(0)
  })

  it('deletes the subscription on a 410 Gone', async () => {
    const err = Object.assign(new Error('gone'), { statusCode: 410, body: 'Gone' })
    const sendNotification = vi.fn().mockRejectedValue(err)
    const sqlImpl = fakeSql()

    const result = await sendToSubscription(sub, '{}', { sendNotification, sqlImpl })

    expect(result).toEqual({ ok: false, deleted: true, status: 410, error: 'Gone' })
    expect(sqlImpl.calls).toHaveLength(1)
    expect(sqlImpl.calls[0].values).toEqual([sub.id])
  })

  it('deletes the subscription on a 404 Not Found, same as a 410', async () => {
    const err = Object.assign(new Error('not found'), { statusCode: 404 })
    const sendNotification = vi.fn().mockRejectedValue(err)
    const sqlImpl = fakeSql()

    const result = await sendToSubscription(sub, '{}', { sendNotification, sqlImpl })

    expect(result).toEqual({ ok: false, deleted: true, status: 404, error: 'not found' })
    expect(sqlImpl.calls).toHaveLength(1)
  })

  it('leaves the subscription alone on any other error, and reports it', async () => {
    const err = Object.assign(new Error('key mismatch'), { statusCode: 403, body: 'Forbidden' })
    const sendNotification = vi.fn().mockRejectedValue(err)
    const sqlImpl = fakeSql()

    const result = await sendToSubscription(sub, '{}', { sendNotification, sqlImpl })

    expect(result).toEqual({ ok: false, deleted: false, status: 403, error: 'Forbidden' })
    expect(sqlImpl.calls).toHaveLength(0)
  })

  it('reports an error with no statusCode (e.g. a network failure) without deleting', async () => {
    const err = new Error('fetch failed')
    const sendNotification = vi.fn().mockRejectedValue(err)
    const sqlImpl = fakeSql()

    const result = await sendToSubscription(sub, '{}', { sendNotification, sqlImpl })

    expect(result).toEqual({ ok: false, deleted: false, status: null, error: 'fetch failed' })
    expect(sqlImpl.calls).toHaveLength(0)
  })

  it('does not throw when the cleanup DELETE itself fails', async () => {
    // The daily and digest crons send to many subscriptions at once and rely on this
    // never throwing; a database blip during cleanup must not sink the batch.
    const err = Object.assign(new Error('gone'), { statusCode: 410, body: 'Gone' })
    const sendNotification = vi.fn().mockRejectedValue(err)
    const sqlImpl = vi.fn().mockRejectedValue(new Error('connection reset'))

    const result = await sendToSubscription(sub, '{}', { sendNotification, sqlImpl })

    expect(result).toEqual({ ok: false, deleted: false, status: 410, error: 'Gone' })
    expect(sqlImpl).toHaveBeenCalledTimes(1)
  })
})
