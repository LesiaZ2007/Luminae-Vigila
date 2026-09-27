/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { NodeSelection } from '@tiptap/pm/state'
import {
  NoteImage, normalizeImageLayout, nextImageLayout, DEFAULT_IMAGE_LAYOUT,
} from '@/lib/noteImageLayout'

describe('normalizeImageLayout', () => {
  it('falls back to the defaults for missing or junk values', () => {
    expect(normalizeImageLayout()).toEqual(DEFAULT_IMAGE_LAYOUT)
    expect(normalizeImageLayout({ align: 'diagonal', wrap: 'yes', size: 'huge' })).toEqual(DEFAULT_IMAGE_LAYOUT)
  })

  it('accepts wrap as a boolean or the string the HTML carries', () => {
    expect(normalizeImageLayout({ align: 'right', wrap: true }).wrap).toBe(true)
    expect(normalizeImageLayout({ align: 'right', wrap: 'true' }).wrap).toBe(true)
  })

  it('never lets a centered image wrap', () => {
    expect(normalizeImageLayout({ align: 'center', wrap: true })).toEqual({ align: 'center', wrap: false, size: null })
  })
})

describe('nextImageLayout', () => {
  it('merges a plain change', () => {
    expect(nextImageLayout({ align: 'left', wrap: true, size: 'small' }, { align: 'right' }))
      .toEqual({ align: 'right', wrap: true, size: 'small' })
  })

  it('choosing center switches wrapping off', () => {
    expect(nextImageLayout({ align: 'right', wrap: true, size: 'small' }, { align: 'center' }))
      .toEqual({ align: 'center', wrap: false, size: 'small' })
  })

  it('turning wrap on for a centered image moves it left', () => {
    expect(nextImageLayout({ align: 'center', size: 'small' }, { wrap: true }))
      .toEqual({ align: 'left', wrap: true, size: 'small' })
  })

  it('turning wrap on at natural width picks a size so text has room', () => {
    expect(nextImageLayout({ align: 'right' }, { wrap: true }))
      .toEqual({ align: 'right', wrap: true, size: 'medium' })
  })

  it('keeps a size the user already chose when wrapping', () => {
    expect(nextImageLayout({ align: 'left', size: 'large' }, { wrap: true }).size).toBe('large')
  })

  it('lets the size go back to natural', () => {
    expect(nextImageLayout({ align: 'left', wrap: true, size: 'small' }, { size: null }).size).toBeNull()
  })
})

describe('NoteImage HTML round-trip', () => {
  let editor
  afterEach(() => editor?.destroy())

  const make = content => {
    editor = new Editor({ extensions: [StarterKit, NoteImage], content })
    return editor
  }

  it('leaves images written before this feature untouched', () => {
    const html = make('<img src="/api/notes/images/img-a" alt="x">').getHTML()
    expect(html).toBe('<img src="/api/notes/images/img-a" alt="x">')
  })

  it('keeps alignment, wrap, and size through save and load', () => {
    const src = '<img src="/api/notes/images/img-a" data-align="right" data-wrap="true" data-size="small"><p>text</p>'
    const html = make(src).getHTML()
    expect(html).toContain('data-align="right"')
    expect(html).toContain('data-wrap="true"')
    expect(html).toContain('data-size="small"')
    expect(editor.state.doc.firstChild.attrs).toMatchObject({ align: 'right', wrap: true, size: 'small' })
  })

  it('drops values the stylesheet has no meaning for', () => {
    const html = make('<img src="/a.png" data-align="sideways" data-size="enormous" data-wrap="maybe">').getHTML()
    expect(html).toBe('<img src="/a.png">')
  })

  it('does not honour wrap on a centered image even if the HTML says so', () => {
    const html = make('<img src="/a.png" data-align="center" data-wrap="true">').getHTML()
    expect(html).toBe('<img src="/a.png" data-align="center">')
  })

  it('updating the selected image keeps it selected, so the menu stays open', () => {
    make('<img src="/a.png"><p>text</p>')
    editor.commands.setNodeSelection(0)
    editor.chain().updateAttributes('image', nextImageLayout({}, { align: 'right', wrap: true })).run()

    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.getHTML()).toContain('data-align="right" data-wrap="true" data-size="medium"')
  })
})
