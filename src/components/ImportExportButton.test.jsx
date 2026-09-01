/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportExportButton from './ImportExportButton'
import { parseIcs } from '@/lib/ics'
import { BACKUP_COLLECTIONS, PREF_KEYS } from '@/lib/backup'

/* The export writes a Blob and clicks an <a>. jsdom has neither URL.createObjectURL
   nor a working download, so the Blob is captured on its way past — which is also the
   only way to assert on what the file actually contains. */
let written = []

beforeEach(() => {
  written = []
  window.localStorage.clear()
  global.URL.createObjectURL = vi.fn(blob => { written.push(blob); return 'blob:mock' })
  global.URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear() })

async function lastFile() {
  const blob = written[written.length - 1]
  return blob.text ? await blob.text() : ''
}

const CLASSES = [{
  id: 'c1', courseName: 'Physics 101', section: '002', color: '#3a6fa8', enabled: true,
  days: [1, 3, 5], startTime: '09:00', endTime: '09:50',
  semesterStart: '2026-01-12', semesterEnd: '2026-05-08',
}]

const MEETINGS = [
  { id: 'm0', title: 'Physics 101 (002)', start: '2026-03-02T09:00:00', end: '2026-03-02T09:50:00',
    extendedProps: { source: 'canvas-class', classId: 'c1', location: 'Tech Hall' } },
  { id: 'm1', title: 'Physics 101 (002)', start: '2026-03-04T09:00:00', end: '2026-03-04T09:50:00',
    extendedProps: { source: 'canvas-class', classId: 'c1', location: 'Tech Hall' } },
]

/** Something in every collection, so "the whole thing" can be asserted at once. */
const FULL = {
  events:          [{ id: 'e1', title: 'Dentist', start: '2026-03-03T10:00:00', end: '2026-03-03T11:00:00' }],
  todos:           [{ id: 't1', title: 'Lab report', dueDate: '2026-03-04' }],
  todoCategories:  [{ id: 'tc1', label: 'Academic', color: '#3a6fa8' }],
  eventCategories: [{ id: 'ec1', label: 'Class', color: '#3a6fa8' }],
  notes:           [{ id: 'n1', title: 'Chem notes', html: '<p>hi</p>' }],
  classSchedule:   CLASSES,
  customLists:     [{ id: 'l1', name: 'Groceries', items: [] }],
  studySessions:   [{ id: 's1', courseId: 42, durationSec: 3600, date: '2026-03-01' }],
}

function renderExporter(props = {}) {
  return render(
    <ImportExportButton
      collections={FULL}
      eventPrefs={{ e1: { hidden: true } }}
      classMeetings={MEETINGS}
      onImport={vi.fn()}
      inline
      {...props}
    />,
  )
}

async function exportJson() {
  await userEvent.click(screen.getByRole('button', { name: /Export JSON backup/ }))
  return JSON.parse(await lastFile())
}

describe('JSON export — the whole thing', () => {
  /* Three times running a collection was missing from what called itself a backup.
     This asserts the list, not four hand-picked keys. */
  it('writes every collection a backup is defined to carry', async () => {
    renderExporter()
    const data = await exportJson()
    for (const { key } of BACKUP_COLLECTIONS) {
      expect(Array.isArray(data[key]), `${key} missing`).toBe(true)
    }
  })

  it('actually carries the records, not just the keys', async () => {
    renderExporter()
    const data = await exportJson()
    expect(data.classSchedule[0]).toMatchObject({ id: 'c1', courseName: 'Physics 101' })
    expect(data.customLists[0]).toMatchObject({ id: 'l1', name: 'Groceries' })
    expect(data.studySessions[0]).toMatchObject({ id: 's1' })
    expect(data.eventCategories[0]).toMatchObject({ id: 'ec1' })
  })

  it('includes hidden/recoloured event settings', async () => {
    renderExporter()
    expect((await exportJson()).eventPrefs).toEqual({ e1: { hidden: true } })
  })

  it('includes the local settings blobs', async () => {
    window.localStorage.setItem(PREF_KEYS.gpa, JSON.stringify({ credits: { 42: 4 } }))
    renderExporter()
    expect((await exportJson()).preferences.gpa.credits).toEqual({ 42: 4 })
  })

  /* A feed URL is a capability, not a preference — and backups get emailed around. */
  it('never writes the Canvas feed URL into the file', async () => {
    window.localStorage.setItem(PREF_KEYS.canvas, JSON.stringify({
      icsUrl: 'https://canvas.example/feeds/SECRET.ics', showOnCalendar: true,
    }))
    renderExporter()
    await userEvent.click(screen.getByRole('button', { name: /Export JSON backup/ }))
    const text = await lastFile()
    expect(text).not.toContain('SECRET')
    expect(JSON.parse(text).preferences.canvas.showOnCalendar).toBe(true)
  })

  it('declares version 3', async () => {
    renderExporter()
    expect((await exportJson()).version).toBe(3)
  })
})

describe('ICS export', () => {
  it('includes every class meeting alongside your own events', async () => {
    renderExporter()
    await userEvent.click(screen.getByRole('button', { name: /Export ICS/ }))
    const titles = parseIcs(await lastFile()).map(e => e.title).sort()
    expect(titles).toEqual(['Dentist', 'Physics 101 (002)', 'Physics 101 (002)'])
  })

  it('carries the room, which used to be dropped', async () => {
    renderExporter()
    await userEvent.click(screen.getByRole('button', { name: /Export ICS/ }))
    expect(await lastFile()).toContain('LOCATION:Tech Hall')
  })

  // A tombstone records a deletion; no calendar wants to import one.
  it('leaves deleted events out', async () => {
    renderExporter({
      collections: { ...FULL, events: [...FULL.events, { id: 'e2', title: 'Gone', start: '2026-03-05T10:00:00', deletedAt: '2026-03-01' }] },
    })
    await userEvent.click(screen.getByRole('button', { name: /Export ICS/ }))
    expect(parseIcs(await lastFile()).some(e => e.title === 'Gone')).toBe(false)
  })
})

describe('JSON import', () => {
  async function importFile(container, contents, name = 'backup.json') {
    const input = container.querySelector('input[type="file"]')
    const file  = new File([contents], name, { type: 'application/json' })
    const original = global.FileReader
    global.FileReader = class {
      readAsText() { this.result = contents; this.onload({ target: { result: contents } }) }
    }
    await userEvent.upload(input, file)
    global.FileReader = original
  }

  const emptyCollections = Object.fromEntries(BACKUP_COLLECTIONS.map(c => [c.key, []]))

  it('summarises every collection it is about to restore', async () => {
    const { container } = renderExporter({ collections: emptyCollections })
    await importFile(container, JSON.stringify({ version: 3, ...FULL }))
    for (const { label } of BACKUP_COLLECTIONS) {
      expect(screen.getByText(label), `${label} row missing`).toBeInTheDocument()
    }
  })

  it('hands every merged collection back on confirm', async () => {
    const onImport = vi.fn()
    const { container } = renderExporter({ collections: emptyCollections, onImport })
    await importFile(container, JSON.stringify({ version: 3, ...FULL }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    const merged = onImport.mock.calls[0][0].collections
    for (const { key } of BACKUP_COLLECTIONS) {
      expect(merged[key], `${key} missing`).toHaveLength(FULL[key].length)
    }
  })

  it('restores the settings blobs to storage', async () => {
    const { container } = renderExporter({ collections: emptyCollections })
    await importFile(container, JSON.stringify({
      version: 3, ...FULL, preferences: { gpa: { credits: { 7: 5 } } },
    }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(JSON.parse(window.localStorage.getItem(PREF_KEYS.gpa)).credits).toEqual({ 7: 5 })
  })

  /* Restoring must not wipe a feed URL the device already has, purely because the
     file was written without one. */
  it('leaves an existing feed URL alone', async () => {
    window.localStorage.setItem(PREF_KEYS.canvas, JSON.stringify({ icsUrl: 'https://keep.me/f.ics' }))
    const { container } = renderExporter({ collections: emptyCollections })
    await importFile(container, JSON.stringify({
      version: 3, ...FULL, preferences: { canvas: { showOnCalendar: false } },
    }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(JSON.parse(window.localStorage.getItem(PREF_KEYS.canvas)).icsUrl).toBe('https://keep.me/f.ics')
  })

  it('accepts a backup carrying only one collection', async () => {
    const { container } = renderExporter({ collections: emptyCollections })
    await importFile(container, JSON.stringify({ version: 3, classSchedule: CLASSES }))
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.queryByText(/doesn't look like/)).not.toBeInTheDocument()
  })

  // An older file has no such keys; it must import as it always did.
  it('restores a v1 backup without disturbing what it never knew about', async () => {
    const onImport = vi.fn()
    const { container } = renderExporter({ onImport })
    await importFile(container, JSON.stringify({
      version: 1, events: [{ id: 'e9', title: 'Old', start: '2026-03-04T10:00:00' }],
    }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    const { collections, eventPrefs, preferences } = onImport.mock.calls[0][0]
    expect(collections.events).toHaveLength(2)          // the local one plus the import
    expect(collections.classSchedule).toEqual(CLASSES)  // untouched
    expect(eventPrefs).toBeUndefined()
    expect(preferences).toBeUndefined()
  })

  it('spots records it already has as duplicates rather than doubling them', async () => {
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({ version: 3, ...FULL }))
    expect(screen.getAllByText(/duplicate/).length).toBeGreaterThan(0)
    expect(screen.queryByText('+1 new')).not.toBeInTheDocument()
  })

  it('rejects a file that is not one of ours', async () => {
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({ hello: 'world' }))
    expect(screen.getByText(/doesn't look like/)).toBeInTheDocument()
  })

  it('imports an ICS without touching anything but events', async () => {
    const onImport = vi.fn()
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:x1', 'DTSTART:20260304T140000Z', 'SUMMARY:From ICS', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const { container } = renderExporter({ onImport })
    await importFile(container, ics, 'feed.ics')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    const { collections } = onImport.mock.calls[0][0]
    expect(collections.events).toHaveLength(2)
    expect(collections.classSchedule).toEqual(CLASSES)
    expect(collections.studySessions).toEqual(FULL.studySessions)
  })
})

describe('Replace everything', () => {
  async function importFile(container, contents, name = 'backup.json') {
    const input = container.querySelector('input[type="file"]')
    const file  = new File([contents], name, { type: 'application/json' })
    const original = global.FileReader
    global.FileReader = class {
      readAsText() { this.result = contents; this.onload({ target: { result: contents } }) }
    }
    await userEvent.upload(input, file)
    global.FileReader = original
  }

  const INCOMING = {
    ...Object.fromEntries(BACKUP_COLLECTIONS.map(c => [c.key, []])),
    events: [{ id: 'x1', title: 'Only this', start: '2026-03-09T10:00:00' }],
  }

  async function chooseReplace() {
    await userEvent.click(screen.getByRole('radio', { name: /Replace everything/ }))
  }

  // A destructive default is how a restore happens by accident.
  it('defaults to merging, not replacing', async () => {
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({ version: 3, ...INCOMING }))
    expect(screen.getByRole('radio', { name: /Add to what I have/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('names how many records it will delete before it can be run', async () => {
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({ version: 3, ...INCOMING }))
    await chooseReplace()
    // Eight collections, one record each in the fixture.
    expect(screen.getByText(/Deletes/)).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument()
  })

  it('renames the action so the button itself says what it does', async () => {
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({ version: 3, ...INCOMING }))
    await chooseReplace()
    expect(screen.getByRole('button', { name: 'Replace everything' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument()
  })

  it('leaves the device holding exactly what the file said', async () => {
    const onImport = vi.fn()
    const { container } = renderExporter({ onImport })
    await importFile(container, JSON.stringify({ version: 3, ...INCOMING }))
    await chooseReplace()
    await userEvent.click(screen.getByRole('button', { name: 'Replace everything' }))
    const { collections, mode } = onImport.mock.calls[0][0]
    expect(mode).toBe('replace')
    expect(collections.events).toEqual(INCOMING.events)
    expect(collections.classSchedule).toEqual([])
    expect(collections.studySessions).toEqual([])
  })

  /* Clearing your classes because an ICS says nothing about classes would be data
     loss dressed up as a restore. */
  it('keeps collections the file does not mention, and says which', async () => {
    const onImport = vi.fn()
    const { container } = renderExporter({ onImport })
    await importFile(container, JSON.stringify({
      version: 1, events: [{ id: 'x1', title: 'Old', start: '2026-03-09T10:00:00' }],
    }))
    await chooseReplace()
    expect(screen.getByText(/Not in this file, so kept as-is:/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Replace everything' }))
    const { collections } = onImport.mock.calls[0][0]
    expect(collections.events).toHaveLength(1)
    expect(collections.classSchedule).toEqual(CLASSES)
    expect(collections.studySessions).toEqual(FULL.studySessions)
  })

  it('does not ask about duplicates — a replace has none to resolve', async () => {
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({ version: 3, ...FULL }))
    expect(screen.getByText('For duplicates')).toBeInTheDocument()
    await chooseReplace()
    expect(screen.queryByText('For duplicates')).not.toBeInTheDocument()
  })

  it('takes the settings from the file wholesale', async () => {
    window.localStorage.setItem(PREF_KEYS.gpa, JSON.stringify({ credits: { 1: 3 }, overrides: { 1: 90 } }))
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({
      version: 3, ...INCOMING, preferences: { gpa: { credits: { 2: 4 } } },
    }))
    await chooseReplace()
    await userEvent.click(screen.getByRole('button', { name: 'Replace everything' }))
    expect(JSON.parse(window.localStorage.getItem(PREF_KEYS.gpa))).toEqual({ credits: { 2: 4 } })
  })

  // Absent because we stripped it on export, not because the user cleared it.
  it('still keeps the Canvas feed URL a restore was never given', async () => {
    window.localStorage.setItem(PREF_KEYS.canvas, JSON.stringify({ icsUrl: 'https://keep.me/f.ics', old: 1 }))
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({
      version: 3, ...INCOMING, preferences: { canvas: { showOnCalendar: true } },
    }))
    await chooseReplace()
    await userEvent.click(screen.getByRole('button', { name: 'Replace everything' }))
    const after = JSON.parse(window.localStorage.getItem(PREF_KEYS.canvas))
    expect(after.icsUrl).toBe('https://keep.me/f.ics')
    expect(after.old).toBeUndefined()
  })

  it('forgets the choice, so the next import is not silently destructive', async () => {
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({ version: 3, ...INCOMING }))
    await chooseReplace()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await importFile(container, JSON.stringify({ version: 3, ...INCOMING }))
    expect(screen.getByRole('radio', { name: /Add to what I have/ })).toBeChecked()
  })
})
