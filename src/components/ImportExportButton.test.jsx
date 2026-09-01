/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportExportButton from './ImportExportButton'
import { parseIcs } from '@/lib/ics'

/* The export writes a Blob and clicks an <a>. jsdom has neither URL.createObjectURL
   nor a working download, so the Blob is captured on its way past — which is also the
   only way to assert on what the file actually contains. */
let written = []

beforeEach(() => {
  written = []
  global.URL.createObjectURL = vi.fn(blob => { written.push(blob); return 'blob:mock' })
  global.URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

/** Blob.text() is not implemented in this jsdom, so read the parts directly. */
async function lastFile() {
  const blob = written[written.length - 1]
  return blob.text ? await blob.text() : ''
}

const CLASSES = [{
  id: 'c1', courseName: 'Physics 101', section: '002', color: '#3a6fa8', enabled: true,
  days: [1, 3, 5], startTime: '09:00', endTime: '09:50',
  semesterStart: '2026-01-12', semesterEnd: '2026-05-08',
}]

const MEETINGS = [{
  id: 'canvascls_c1_0', title: 'Physics 101 (002)',
  start: '2026-03-02T09:00:00', end: '2026-03-02T09:50:00',
  extendedProps: { source: 'canvas-class', classId: 'c1', location: 'Tech Hall' },
}, {
  id: 'canvascls_c1_1', title: 'Physics 101 (002)',
  start: '2026-03-04T09:00:00', end: '2026-03-04T09:50:00',
  extendedProps: { source: 'canvas-class', classId: 'c1', location: 'Tech Hall' },
}]

function renderExporter(props = {}) {
  return render(
    <ImportExportButton
      events={[]} todos={[]} todoCategories={[]} notes={[]}
      classSchedule={CLASSES} classMeetings={MEETINGS}
      onImport={vi.fn()}
      inline
      {...props}
    />,
  )
}

describe('JSON export', () => {
  /* The reported bug: the schedule was never handed to the exporter, so a "backup"
     silently omitted every class the user had entered. */
  it('includes the class schedule', async () => {
    renderExporter()
    await userEvent.click(screen.getByRole('button', { name: /Export JSON backup/ }))
    const data = JSON.parse(await lastFile())
    expect(data.classSchedule).toHaveLength(1)
    expect(data.classSchedule[0]).toMatchObject({ id: 'c1', courseName: 'Physics 101' })
  })

  it('keeps every field a class needs to be rebuilt', async () => {
    renderExporter()
    await userEvent.click(screen.getByRole('button', { name: /Export JSON backup/ }))
    const cls = JSON.parse(await lastFile()).classSchedule[0]
    for (const key of ['days', 'startTime', 'endTime', 'semesterStart', 'semesterEnd', 'color']) {
      expect(cls[key]).toBeDefined()
    }
  })

  it('declares a version, so an older reader can tell the shape changed', async () => {
    renderExporter()
    await userEvent.click(screen.getByRole('button', { name: /Export JSON backup/ }))
    expect(JSON.parse(await lastFile()).version).toBe(2)
  })
})

describe('ICS export', () => {
  /* Class meetings are expanded from the schedule rather than stored, so exporting
     `events` alone produced a file with no classes in it at all. */
  it('includes every class meeting', async () => {
    renderExporter()
    await userEvent.click(screen.getByRole('button', { name: /Export ICS/ }))
    const parsed = parseIcs(await lastFile())
    expect(parsed).toHaveLength(2)
    expect(parsed.every(e => e.title === 'Physics 101 (002)')).toBe(true)
  })

  it('carries the room, which used to be dropped', async () => {
    renderExporter()
    await userEvent.click(screen.getByRole('button', { name: /Export ICS/ }))
    expect(await lastFile()).toContain('LOCATION:Tech Hall')
  })

  it('exports own events and class meetings together', async () => {
    renderExporter({
      events: [{ id: 'e1', title: 'Dentist', start: '2026-03-03T10:00:00', end: '2026-03-03T11:00:00' }],
    })
    await userEvent.click(screen.getByRole('button', { name: /Export ICS/ }))
    const titles = parseIcs(await lastFile()).map(e => e.title).sort()
    expect(titles).toEqual(['Dentist', 'Physics 101 (002)', 'Physics 101 (002)'])
  })

  it('still writes a valid empty calendar with nothing to export', async () => {
    renderExporter({ classMeetings: [] })
    await userEvent.click(screen.getByRole('button', { name: /Export ICS/ }))
    const text = await lastFile()
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('END:VCALENDAR')
  })
})

describe('JSON import', () => {
  /** Drive the hidden file input the way the browser would. */
  async function importFile(container, contents, name = 'backup.json') {
    const input = container.querySelector('input[type="file"]')
    const file  = new File([contents], name, { type: 'application/json' })
    // jsdom's FileReader needs the text available synchronously enough for the
    // component's onload; File.text() is not wired to it, so stub the reader.
    const original = global.FileReader
    global.FileReader = class {
      readAsText() { this.result = contents; this.onload({ target: { result: contents } }) }
    }
    await userEvent.upload(input, file)
    global.FileReader = original
  }

  it('offers to restore classes from a backup', async () => {
    const { container } = renderExporter({ classSchedule: [] })
    await importFile(container, JSON.stringify({ version: 2, classSchedule: CLASSES }))
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('+1 new')).toBeInTheDocument()
  })

  it('hands the merged schedule back on confirm', async () => {
    const onImport = vi.fn()
    const { container } = renderExporter({ classSchedule: [], onImport })
    await importFile(container, JSON.stringify({ version: 2, classSchedule: CLASSES }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
      classSchedule: [expect.objectContaining({ id: 'c1' })],
    }))
  })

  it('accepts a backup that carries only classes', async () => {
    const { container } = renderExporter({ classSchedule: [] })
    await importFile(container, JSON.stringify({ version: 2, classSchedule: CLASSES }))
    expect(screen.queryByText(/doesn't look like/)).not.toBeInTheDocument()
  })

  // An older file has no such key; it must import as it always did, not blank the
  // schedule the user already has.
  it('leaves the schedule untouched for a pre-v2 backup', async () => {
    const onImport = vi.fn()
    const { container } = renderExporter({ onImport })
    await importFile(container, JSON.stringify({
      version: 1, events: [{ id: 'e9', title: 'Old', start: '2026-03-04T10:00:00' }],
    }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(onImport.mock.calls[0][0].classSchedule).toEqual(CLASSES)
  })

  it('spots a class it already has as a duplicate rather than doubling it', async () => {
    const { container } = renderExporter()
    await importFile(container, JSON.stringify({ version: 2, classSchedule: CLASSES }))
    expect(screen.getByText('1 duplicate')).toBeInTheDocument()
  })
})
