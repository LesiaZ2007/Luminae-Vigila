import { describe, it, expect } from 'vitest'
import { referencedImageIds, noteImageUrl } from '@/lib/noteImages'

describe('referencedImageIds', () => {
  it('finds the id in an img tag the editor produced', () => {
    const html = `<p>before</p><img class="lv-note-img" src="${noteImageUrl('img-abc123')}" alt="x">`
    expect([...referencedImageIds(html)]).toEqual(['img-abc123'])
  })

  it('finds every id when a note holds several images', () => {
    const html = `<img src="/api/notes/images/img-a"><img src="/api/notes/images/img-b">`
    expect([...referencedImageIds(html)].sort()).toEqual(['img-a', 'img-b'])
  })

  it('deduplicates the same image used twice', () => {
    const html = `<img src="/api/notes/images/img-a"><img src="/api/notes/images/img-a">`
    expect([...referencedImageIds(html)]).toEqual(['img-a'])
  })

  it('ignores images hosted somewhere else', () => {
    const html = `<img src="https://example.com/cat.png">`
    expect([...referencedImageIds(html)]).toEqual([])
  })

  it('survives empty and missing bodies rather than throwing', () => {
    expect([...referencedImageIds('')]).toEqual([])
    expect([...referencedImageIds(null)]).toEqual([])
    expect([...referencedImageIds(undefined)]).toEqual([])
  })

  it('agrees with the url helper — the reaper must match what the uploader wrote', () => {
    const id  = 'img-lz4k2p-9f3a1b'
    const ids = referencedImageIds(`<img src="${noteImageUrl(id)}">`)
    expect(ids.has(id)).toBe(true)
  })
})
