import { describe, it, expect } from 'vitest'
import { buildSyncDelta, fingerprint, SYNC_KEYS } from './syncDelta'

function fullPayload(over = {}) {
  return {
    events:          [{ id: 'e1', title: 'Physics' }],
    todos:           [{ id: 't1', title: 'Reading' }],
    todoCategories:  [{ id: 'c1' }],
    eventCategories: [{ id: 'ec1' }],
    classSchedule:   [{ id: 'cls1' }],
    eventPrefs:      { e1: { hidden: true } },
    studySessions:   [{ id: 's1' }],
    customLists:     [{ id: 'l1' }],
    notes:           [{ id: 'n1', body: 'hello' }],
    ...over,
  }
}

describe('buildSyncDelta', () => {
  it('sends everything when there is no previous push', () => {
    const { body, isEmpty } = buildSyncDelta(fullPayload(), null)
    expect(Object.keys(body).sort()).toEqual([...SYNC_KEYS].sort())
    expect(isEmpty).toBe(false)
  })

  it('sends only the collection that changed', () => {
    const first  = fullPayload()
    const { sent } = buildSyncDelta(first, null)

    const second = fullPayload({ todos: [{ id: 't1', title: 'Reading, ch. 4' }] })
    const { body } = buildSyncDelta(second, sent)

    // The point of the exercise: editing one todo must not rewrite the events table.
    expect(Object.keys(body)).toEqual(['todos'])
    expect(body.todos[0].title).toBe('Reading, ch. 4')
  })

  it('sends nothing when nothing changed', () => {
    const payload = fullPayload()
    const { sent } = buildSyncDelta(payload, null)
    const again = buildSyncDelta(fullPayload(), sent)
    expect(again.body).toEqual({})
    expect(again.isEmpty).toBe(true)
  })

  it('notices a change nested deep inside an item', () => {
    const { sent } = buildSyncDelta(fullPayload(), null)
    const edited = fullPayload({ notes: [{ id: 'n1', body: 'hello there' }] })
    expect(Object.keys(buildSyncDelta(edited, sent).body)).toEqual(['notes'])
  })

  it('notices a deletion, not just an edit', () => {
    const { sent } = buildSyncDelta(fullPayload(), null)
    const { body } = buildSyncDelta(fullPayload({ events: [] }), sent)
    expect(body).toHaveProperty('events')
    expect(body.events).toEqual([])
  })

  it('treats reordering as a change', () => {
    // Array position is how task order is stored, so it is a real change.
    const a = fullPayload({ todos: [{ id: 't1' }, { id: 't2' }] })
    const { sent } = buildSyncDelta(a, null)
    const b = fullPayload({ todos: [{ id: 't2' }, { id: 't1' }] })
    expect(Object.keys(buildSyncDelta(b, sent).body)).toEqual(['todos'])
  })

  it('handles eventPrefs, which is an object rather than an array', () => {
    const { sent } = buildSyncDelta(fullPayload(), null)
    const { body } = buildSyncDelta(fullPayload({ eventPrefs: { e1: { hidden: false } } }), sent)
    expect(Object.keys(body)).toEqual(['eventPrefs'])
  })

  it('omits keys the caller did not supply at all', () => {
    const partial = { events: [{ id: 'e1' }] }
    const { body, sent } = buildSyncDelta(partial, null)
    expect(Object.keys(body)).toEqual(['events'])
    expect(sent.notes).toBeUndefined()
  })

  it('reports several changed collections together', () => {
    const { sent } = buildSyncDelta(fullPayload(), null)
    const { body } = buildSyncDelta(
      fullPayload({ events: [], notes: [{ id: 'n2' }] }),
      sent,
    )
    expect(Object.keys(body).sort()).toEqual(['events', 'notes'])
  })

  it('keeps resending something it cannot serialise rather than dropping it', () => {
    const circular = { id: 'n1' }
    circular.self = circular
    const first  = buildSyncDelta(fullPayload({ notes: [circular] }), null)
    const second = buildSyncDelta(fullPayload({ notes: [circular] }), first.sent)
    expect(second.body).toHaveProperty('notes')
  })
})

describe('fingerprint', () => {
  it('produces a string per supplied collection', () => {
    const fp = fingerprint({ events: [{ id: 'e1' }] })
    expect(typeof fp.events).toBe('string')
    expect(Object.keys(fp)).toEqual(['events'])
  })

  it('ignores keys that are not part of the sync payload', () => {
    expect(fingerprint({ events: [], somethingElse: [1, 2, 3] })).not.toHaveProperty('somethingElse')
  })
})
