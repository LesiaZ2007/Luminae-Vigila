import { describe, it, expect } from 'vitest'
import { describeLocation, mapsUrl, isMappable } from './maps'

describe('mapsUrl', () => {
  it('builds a Google Maps search link', () => {
    expect(mapsUrl('Room 204, Tech Hall'))
      .toBe('https://www.google.com/maps/search/?api=1&query=Room%20204%2C%20Tech%20Hall')
  })

  it('collapses whitespace so a sloppily typed room does not double-encode', () => {
    expect(mapsUrl('  Tech   Hall  ')).toBe('https://www.google.com/maps/search/?api=1&query=Tech%20Hall')
  })

  it('returns null for values that are not locations', () => {
    expect(mapsUrl('')).toBeNull()
    expect(mapsUrl('   ')).toBeNull()
    expect(mapsUrl('TBD')).toBeNull()
    expect(mapsUrl('n/a')).toBeNull()
    expect(mapsUrl(null)).toBeNull()
    expect(mapsUrl(undefined)).toBeNull()
    expect(mapsUrl(42)).toBeNull()
  })
})

describe('describeLocation', () => {
  it('treats a room or address as a place', () => {
    const d = describeLocation('Room 204, Tech Hall')
    expect(d.kind).toBe('place')
    expect(d.text).toBe('Room 204, Tech Hall')
    expect(d.url).toContain('google.com/maps')
  })

  it('reports nothing usable for blanks and placeholders', () => {
    for (const v of ['', '   ', 'TBD', 'tba', 'N/A', 'none', '--', 'Unknown']) {
      expect(describeLocation(v).kind, v).toBe('empty')
    }
  })

  it('never offers a map for an online meeting', () => {
    // "Zoom" as a Maps query returns the company head office — a confidently wrong
    // answer, which is worse than no button.
    for (const v of ['Online', 'Zoom', 'remote', 'Google Meet', 'Teams', 'Async']) {
      expect(describeLocation(v).kind, v).toBe('online')
      expect(isMappable(v), v).toBe(false)
    }
  })

  it('pulls the join link out of a mixed online location', () => {
    const d = describeLocation('Zoom — https://zoom.us/j/123456?pwd=abc')
    expect(d.kind).toBe('online')
    expect(d.url).toBe('https://zoom.us/j/123456?pwd=abc')
  })

  it('classifies a bare URL as a link', () => {
    expect(describeLocation('https://example.com/lecture')).toMatchObject({
      kind: 'link',
      url:  'https://example.com/lecture',
    })
  })

  it('adds the missing scheme to a www URL', () => {
    expect(describeLocation('www.example.com/hall').url).toBe('https://www.example.com/hall')
  })

  it('recognises a scheme-less conferencing host as online, not a place', () => {
    const d = describeLocation('meet.google.com/abc-defg-hij')
    expect(d.kind).toBe('online')
    expect(d.url).toBe('https://meet.google.com/abc-defg-hij')
  })

  it('does not mistake a street address containing a number for a link', () => {
    expect(describeLocation('1600 Amphitheatre Parkway').kind).toBe('place')
  })

  it('is safe on non-string input', () => {
    expect(describeLocation(null).kind).toBe('empty')
    expect(describeLocation({}).kind).toBe('empty')
  })
})

describe('isMappable', () => {
  it('is true only for places', () => {
    expect(isMappable('Tech Hall 204')).toBe(true)
    expect(isMappable('Online')).toBe(false)
    expect(isMappable('TBD')).toBe(false)
    expect(isMappable('')).toBe(false)
  })
})
