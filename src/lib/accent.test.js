/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyAccent, getSavedAccent, saveAccent } from './accent'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-accent')
})

describe('accent', () => {
  it('sets data-accent for a non-default accent', () => {
    applyAccent('violet')
    expect(document.documentElement.getAttribute('data-accent')).toBe('violet')
  })

  it('removes the attribute for the default, matching the pre-paint script in layout.js', () => {
    applyAccent('violet')
    applyAccent('blue')
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false)
  })

  it('treats an unknown accent as the default', () => {
    applyAccent('chartreuse')
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false)
  })

  it('remembers a saved accent', () => {
    expect(getSavedAccent()).toBe('blue')
    saveAccent('emerald')
    expect(getSavedAccent()).toBe('emerald')
    expect(document.documentElement.getAttribute('data-accent')).toBe('emerald')
  })
})
