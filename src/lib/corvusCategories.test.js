import { describe, it, expect } from 'vitest'
import { categoriesContext, describeCategories, resolveCategory } from './corvusCategories'

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

describe('categoriesContext', () => {
  const cats = [
    { id: 'academic', label: 'Academic' },
    { id: 'class:c1', label: 'Physics 101' },
    { id: 'class:c2', label: 'Chemistry' },
  ]

  it('names each class beside the id used to file work against it', () => {
    const out = categoriesContext(cats)
    expect(out).toContain('Physics 101 — category id class:c1')
    expect(out).toContain('Chemistry — category id class:c2')
  })

  it('keeps classes and ordinary categories in separate sections', () => {
    const out = categoriesContext(cats)
    expect(out.indexOf("THE STUDENT'S CLASSES")).toBeLessThan(out.indexOf('OTHER TASK CATEGORIES'))
    // Academic must not be listed as a class.
    const classBlock = out.slice(0, out.indexOf('OTHER TASK CATEGORIES'))
    expect(classBlock).not.toContain('Academic')
  })

  it('says so plainly when there is no schedule yet', () => {
    // Silence would read as "the classes were omitted", which invites the model to
    // invent one; an explicit "None" is what stops it.
    expect(categoriesContext([{ id: 'academic', label: 'Academic' }])).toContain('None on the schedule yet')
  })

  it('survives an empty list', () => {
    const out = categoriesContext([])
    expect(out).toContain('None on the schedule yet')
    expect(out).toContain('None.')
  })

  it('tolerates a category with no label', () => {
    expect(categoriesContext([{ id: 'weird' }])).toContain('weird')
  })
})
