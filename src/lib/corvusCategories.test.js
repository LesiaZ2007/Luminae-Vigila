import { describe, it, expect } from 'vitest'
import { describeCategories, resolveCategory } from './corvusCategories'

const CATS = [
  { id: 'academic', label: 'Academic' },
  { id: 'personal', label: 'Personal' },
  { id: 'class:cls1', label: 'Physics 101' },
  { id: 'class:cls2', label: 'Calculus II' },
]

describe('describeCategories', () => {
  it('names the real categories rather than the hardcoded defaults', () => {
    const d = describeCategories(CATS)
    expect(d).toContain('academic')
    expect(d).toContain('personal')
  })

  it('pairs each class id with its course name', () => {
    // The id is opaque, so on its own it tells the model nothing. The pairing is what
    // lets "add a task for Physics" land on the right category.
    const d = describeCategories(CATS)
    expect(d).toContain('class:cls1 (Physics 101)')
    expect(d).toContain('class:cls2 (Calculus II)')
  })

  it('says something usable when there are no categories at all', () => {
    expect(describeCategories([])).toBeTruthy()
    expect(describeCategories()).toBeTruthy()
  })

  it('omits the class sentence when the schedule is empty', () => {
    const d = describeCategories([{ id: 'academic', label: 'Academic' }])
    expect(d).toContain('academic')
    expect(d).not.toContain('class')
  })

  it('does not grow without bound', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, label: `C${i}` }))
    expect(describeCategories(many).length).toBeLessThan(2000)
  })
})

describe('resolveCategory', () => {
  it('accepts an exact id', () => {
    expect(resolveCategory('class:cls1', CATS)).toBe('class:cls1')
    expect(resolveCategory('academic', CATS)).toBe('academic')
  })

  it('accepts a label when the model returns the name instead of the id', () => {
    expect(resolveCategory('Physics 101', CATS)).toBe('class:cls1')
    expect(resolveCategory('physics 101', CATS)).toBe('class:cls1')
    expect(resolveCategory('  Academic  ', CATS)).toBe('academic')
  })

  it('accepts the prefix with the course name after it', () => {
    // A plausible near-miss: the model understood the shape but guessed the id part.
    expect(resolveCategory('class:Physics 101', CATS)).toBe('class:cls1')
  })

  it('returns null for an invented category rather than guessing', () => {
    // The preview card is shown before anything is saved. No category reads as "it
    // did not pick one"; a wrong one reads as a decision.
    expect(resolveCategory('class:does-not-exist', CATS)).toBeNull()
    expect(resolveCategory('chemistry', CATS)).toBeNull()
  })

  it('returns null for nothing at all', () => {
    expect(resolveCategory(undefined, CATS)).toBeNull()
    expect(resolveCategory('', CATS)).toBeNull()
    expect(resolveCategory(null, CATS)).toBeNull()
  })

  it('returns null when there are no categories to match against', () => {
    expect(resolveCategory('academic', [])).toBeNull()
    expect(resolveCategory('academic')).toBeNull()
  })

  it('is not confused by a non-string', () => {
    expect(resolveCategory(42, CATS)).toBeNull()
    expect(resolveCategory({}, CATS)).toBeNull()
  })
})
