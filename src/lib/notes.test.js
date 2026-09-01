import { describe, it, expect } from 'vitest'
import {
  mergeNotes, mergeNotesCloudWins, makeNote, purgeExpiredTrash,
  notePlainText, noteDisplayTitle, notePreview, noteHasImage, sortNotes, noteMatches,
  TRASH_RETENTION_MS, sharedTextToHtml, isNoteEmpty, dropEmptyNotes,
} from './notes'

const at = iso => iso

describe('mergeNotes', () => {
  it('keeps notes that exist on only one side', () => {
    const merged = mergeNotes(
      [{ id: 'a', updatedAt: at('2026-01-01T00:00:00Z') }],
      [{ id: 'b', updatedAt: at('2026-01-01T00:00:00Z') }],
    )
    expect(merged.map(n => n.id).sort()).toEqual(['a', 'b'])
  })

  it('resolves conflicts by newest updatedAt, not by side', () => {
    const cloudWins = mergeNotes(
      [{ id: 'a', html: 'cloud', updatedAt: at('2026-02-01T00:00:00Z') }],
      [{ id: 'a', html: 'local', updatedAt: at('2026-01-01T00:00:00Z') }],
    )
    expect(cloudWins[0].html).toBe('cloud')

    const localWins = mergeNotes(
      [{ id: 'a', html: 'cloud', updatedAt: at('2026-01-01T00:00:00Z') }],
      [{ id: 'a', html: 'local', updatedAt: at('2026-02-01T00:00:00Z') }],
    )
    expect(localWins[0].html).toBe('local')
  })

  it('falls back to local when timestamps are equal or missing', () => {
    const merged = mergeNotes([{ id: 'a', html: 'cloud' }], [{ id: 'a', html: 'local' }])
    expect(merged[0].html).toBe('local')
  })

  it('drops entries without an id rather than keying them as undefined', () => {
    const merged = mergeNotes([{ html: 'no id' }], [{ id: 'a', html: 'ok' }])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a')
  })

  it('cloud-wins variant ignores timestamps', () => {
    const merged = mergeNotesCloudWins(
      [{ id: 'a', html: 'cloud', updatedAt: at('2020-01-01T00:00:00Z') }],
      [{ id: 'a', html: 'local', updatedAt: at('2026-01-01T00:00:00Z') }],
    )
    expect(merged[0].html).toBe('cloud')
  })

  it('handles null/undefined inputs', () => {
    expect(mergeNotes(null, undefined)).toEqual([])
  })
})

describe('purgeExpiredTrash', () => {
  const now = new Date('2026-06-01T00:00:00Z').getTime()

  it('keeps untrashed notes regardless of age', () => {
    const kept = purgeExpiredTrash([{ id: 'a', trashedAt: null }], now)
    expect(kept).toHaveLength(1)
  })

  it('keeps recently trashed notes so undo still works', () => {
    const recent = new Date(now - 1000).toISOString()
    expect(purgeExpiredTrash([{ id: 'a', trashedAt: recent }], now)).toHaveLength(1)
  })

  it('drops notes trashed past the retention window', () => {
    const old = new Date(now - TRASH_RETENTION_MS - 1000).toISOString()
    expect(purgeExpiredTrash([{ id: 'a', trashedAt: old }], now)).toHaveLength(0)
  })

  it('keeps notes with an unparseable trashedAt rather than deleting data', () => {
    expect(purgeExpiredTrash([{ id: 'a', trashedAt: 'garbage' }], now)).toHaveLength(1)
  })
})

describe('notePlainText', () => {
  it('strips tags and turns block ends into newlines', () => {
    expect(notePlainText('<p>one</p><p>two</p>')).toBe('one\ntwo')
  })

  it('separates list items instead of running them together', () => {
    expect(notePlainText('<ul><li>milk</li><li>eggs</li></ul>')).toBe('milk\neggs')
  })

  it('decodes the entities Tiptap emits', () => {
    expect(notePlainText('<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f</p>'))
      .toBe('a & b <c> "d" \'e\' f')
  })

  it('returns empty string for empty input', () => {
    expect(notePlainText('')).toBe('')
    expect(notePlainText(null)).toBe('')
  })
})

describe('noteDisplayTitle', () => {
  it('prefers an explicit title', () => {
    expect(noteDisplayTitle({ title: 'Chem', html: '<p>body</p>' })).toBe('Chem')
  })

  it('falls back to the first line of the body', () => {
    expect(noteDisplayTitle({ title: '  ', html: '<p>Titration steps</p><p>more</p>' }))
      .toBe('Titration steps')
  })

  it('labels a genuinely empty note', () => {
    expect(noteDisplayTitle({ title: '', html: '' })).toBe('Untitled note')
  })
})

describe('notePreview', () => {
  it('skips the first line when it became the title', () => {
    expect(notePreview({ title: '', html: '<p>Heading</p><p>body text</p>' })).toBe('body text')
  })

  it('shows the whole body when there is an explicit title', () => {
    expect(notePreview({ title: 'T', html: '<p>Heading</p><p>body</p>' })).toBe('Heading body')
  })

  it('truncates with an ellipsis', () => {
    const long = { title: 'T', html: `<p>${'x'.repeat(200)}</p>` }
    const out = notePreview(long, 20)
    expect(out).toHaveLength(21)
    expect(out.endsWith('…')).toBe(true)
  })

  // A note that is only a pasted screenshot flattens to '' — without this it
  // renders as a blank card, indistinguishable from an empty note.
  it('says "Image" for a note whose body is only an image', () => {
    expect(notePreview({ title: 'Whiteboard', html: '<img src="/api/notes/images/img-a">' })).toBe('Image')
  })

  it('prefers real text over the image fallback', () => {
    expect(notePreview({ title: 'T', html: '<img src="/api/notes/images/img-a"><p>caption</p>' })).toBe('caption')
  })

  it('stays empty for a note with neither text nor image', () => {
    expect(notePreview({ title: 'T', html: '<p></p>' })).toBe('')
  })
})

describe('noteHasImage', () => {
  it('detects an img tag', () => {
    expect(noteHasImage('<p>a</p><img src="/api/notes/images/x">')).toBe(true)
  })

  it('is false for text-only and empty bodies', () => {
    expect(noteHasImage('<p>just words</p>')).toBe(false)
    expect(noteHasImage('')).toBe(false)
    expect(noteHasImage(null)).toBe(false)
  })

  // 'imgur' contains 'img'; a naive substring check would call this a picture.
  it('does not match a word that merely starts with img', () => {
    expect(noteHasImage('<p>see imgur.com for the picture</p>')).toBe(false)
  })
})

describe('sortNotes', () => {
  it('orders pinned, then starred, then most recently updated', () => {
    const notes = [
      { id: 'old',     updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'starred', starred: true, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'new',     updatedAt: '2026-05-01T00:00:00Z' },
      { id: 'pinned',  pinned: true, updatedAt: '2020-01-01T00:00:00Z' },
    ]
    expect(sortNotes(notes).map(n => n.id)).toEqual(['pinned', 'starred', 'new', 'old'])
  })

  it('does not mutate the input array', () => {
    const notes = [{ id: 'a', updatedAt: '2026-01-01T00:00:00Z' }, { id: 'b', pinned: true }]
    const before = notes.map(n => n.id)
    sortNotes(notes)
    expect(notes.map(n => n.id)).toEqual(before)
  })
})

describe('noteMatches', () => {
  const note = { title: 'Chem Lab', html: '<p>titration endpoint</p>', tags: ['Science'] }

  it('matches on title, body, and tags, case-insensitively', () => {
    expect(noteMatches(note, 'chem')).toBe(true)
    expect(noteMatches(note, 'ENDPOINT')).toBe(true)
    expect(noteMatches(note, 'science')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(noteMatches(note, 'calculus')).toBe(false)
  })

  it('treats a blank query as matching everything', () => {
    expect(noteMatches(note, '   ')).toBe(true)
  })
})

describe('makeNote', () => {
  it('produces a complete note with unique ids', () => {
    const a = makeNote()
    const b = makeNote()
    expect(a.id).not.toBe(b.id)
    expect(a.trashedAt).toBeNull()
    expect(a.tags).toEqual([])
    expect(a.createdAt).toBe(a.updatedAt)
  })

  it('applies overrides', () => {
    expect(makeNote({ title: 'Seeded', starred: true }).title).toBe('Seeded')
  })
})

describe('sharedTextToHtml', () => {
  it('escapes untrusted text before adding markup', () => {
    const html = sharedTextToHtml('<script>alert(1)</script>')
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(html).not.toContain('<script>')
  })

  it('turns blank lines into paragraphs and single newlines into <br>', () => {
    expect(sharedTextToHtml('one\ntwo\n\nthree'))
      .toBe('<p>one<br>two</p><p>three</p>')
  })

  it('handles CRLF line endings', () => {
    expect(sharedTextToHtml('a\r\n\r\nb')).toBe('<p>a</p><p>b</p>')
  })

  it('escapes quotes and ampersands', () => {
    expect(sharedTextToHtml(`a & "b" 'c'`))
      .toBe('<p>a &amp; &quot;b&quot; &#39;c&#39;</p>')
  })

  it('survives a round-trip through notePlainText with lines intact', () => {
    // Not byte-identical by design: notePlainText renders a paragraph break as
    // a single newline, so the blank line between paragraphs collapses. What
    // matters is that no content is lost and line order is preserved.
    const original = 'Line one\nline two\n\nSecond para'
    expect(notePlainText(sharedTextToHtml(original)).split('\n'))
      .toEqual(['Line one', 'line two', 'Second para'])
  })

  it('returns empty string for blank input', () => {
    expect(sharedTextToHtml('')).toBe('')
    expect(sharedTextToHtml('   ')).toBe('')
    expect(sharedTextToHtml(null)).toBe('')
  })
})

describe('isNoteEmpty', () => {
  const empty = () => makeNote()

  it('treats a freshly created note as empty', () => {
    expect(isNoteEmpty(empty())).toBe(true)
  })

  it('treats an editor-flavoured blank document as empty', () => {
    // Tiptap never hands back a truly empty string — a cleared document is a
    // single empty paragraph, and that is what the autosave writes.
    expect(isNoteEmpty(makeNote({ html: '<p></p>' }))).toBe(true)
    expect(isNoteEmpty(makeNote({ html: '<p><br></p>' }))).toBe(true)
    expect(isNoteEmpty(makeNote({ html: '<p>&nbsp;</p>' }))).toBe(true)
  })

  it('is not empty once there is body text or a title', () => {
    expect(isNoteEmpty(makeNote({ html: '<p>hi</p>' }))).toBe(false)
    expect(isNoteEmpty(makeNote({ title: 'Chem' }))).toBe(false)
    expect(isNoteEmpty(makeNote({ title: '   ' }))).toBe(true)
  })

  it('counts an image-only note as content', () => {
    expect(isNoteEmpty(makeNote({ html: '<p><img src="/x.png"></p>' }))).toBe(false)
  })

  it('counts deliberate metadata as content', () => {
    expect(isNoteEmpty(makeNote({ tags: ['chem'] }))).toBe(false)
    expect(isNoteEmpty(makeNote({ reminder: { at: '2026-01-01T09:00:00' } }))).toBe(false)
    expect(isNoteEmpty(makeNote({ linkedTo: { type: 'event', id: 'e1', label: 'Lab' } }))).toBe(false)
    expect(isNoteEmpty(makeNote({ starred: true }))).toBe(false)
    expect(isNoteEmpty(makeNote({ pinned: true }))).toBe(false)
  })

  it('says no for a missing note rather than claiming it is empty', () => {
    expect(isNoteEmpty(null)).toBe(false)
    expect(isNoteEmpty(undefined)).toBe(false)
  })
})

describe('dropEmptyNotes', () => {
  it('removes empty notes and keeps the rest', () => {
    const kept = dropEmptyNotes([
      makeNote({ id: 'a' }),
      makeNote({ id: 'b', html: '<p>real</p>' }),
      makeNote({ id: 'c', html: '<p></p>' }),
    ])
    expect(kept.map(n => n.id)).toEqual(['b'])
  })

  it('leaves trashed notes alone, empty or not', () => {
    const trashed = makeNote({ id: 't', trashedAt: '2026-01-01T00:00:00Z' })
    expect(dropEmptyNotes([trashed]).map(n => n.id)).toEqual(['t'])
  })

  it('tolerates nullish input', () => {
    expect(dropEmptyNotes(null)).toEqual([])
    expect(dropEmptyNotes(undefined)).toEqual([])
  })
})
