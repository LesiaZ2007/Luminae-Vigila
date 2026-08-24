import { describe, it, expect } from 'vitest'
import {
  CLASS_PREFIX, classCategoryId, isClassCategoryId, classIdFromCategoryId,
  classCategories, mergeCategories, findCategory,
} from './classCategories'

const CLASSES = [
  { id: 'cls1', courseName: 'Physics 101', color: '#3a6fa8' },
  { id: 'cls2', courseName: 'Calculus II', color: '#10b981' },
]

const STORED = [
  { id: 'academic', label: 'Academic', color: '#3a6fa8' },
  { id: 'personal', label: 'Personal', color: '#10b981' },
]

describe('class category ids', () => {
  it('round-trips a class id', () => {
    const id = classCategoryId('cls1')
    expect(id).toBe(CLASS_PREFIX + 'cls1')
    expect(isClassCategoryId(id)).toBe(true)
    expect(classIdFromCategoryId(id)).toBe('cls1')
  })

  it('does not treat an ordinary category as a class', () => {
    expect(isClassCategoryId('academic')).toBe(false)
    expect(classIdFromCategoryId('academic')).toBeNull()
    expect(classIdFromCategoryId(null)).toBeNull()
    expect(classIdFromCategoryId(undefined)).toBeNull()
  })

  it('rejects the bare prefix with nothing after it', () => {
    expect(classIdFromCategoryId(CLASS_PREFIX)).toBeNull()
  })
})

describe('classCategories', () => {
  it('derives one category per class, carrying its name and color', () => {
    expect(classCategories(CLASSES)).toEqual([
      { id: 'class:cls1', label: 'Physics 101', color: '#3a6fa8', isClass: true, classId: 'cls1' },
      { id: 'class:cls2', label: 'Calculus II', color: '#10b981', isClass: true, classId: 'cls2' },
    ])
  })

  it('leaves out disabled and deleted classes', () => {
    const mixed = [
      ...CLASSES,
      { id: 'off', courseName: 'Dropped', enabled: false },
      { id: 'gone', courseName: 'Deleted', deletedAt: '2026-08-01T00:00:00.000Z' },
    ]
    expect(classCategories(mixed).map(c => c.classId)).toEqual(['cls1', 'cls2'])
  })

  it('falls back for a class with no name or color yet', () => {
    const [c] = classCategories([{ id: 'x' }])
    expect(c.label).toBe('Class')
    expect(c.color).toBeTruthy()
  })

  it('skips entries with no id and copes with no schedule at all', () => {
    expect(classCategories([{ courseName: 'No id' }])).toEqual([])
    expect(classCategories([])).toEqual([])
    expect(classCategories()).toEqual([])
  })
})

describe('mergeCategories', () => {
  it('puts the user\u2019s own categories first, then the schedule\u2019s', () => {
    const merged = mergeCategories(STORED, classCategories(CLASSES))
    expect(merged.map(c => c.id)).toEqual(['academic', 'personal', 'class:cls1', 'class:cls2'])
  })

  it('lets a stored category win an id collision rather than shadowing it', () => {
    const stored = [{ id: 'class:cls1', label: 'Hand made', color: '#000' }]
    const merged = mergeCategories(stored, classCategories(CLASSES))
    expect(merged.filter(c => c.id === 'class:cls1')).toHaveLength(1)
    expect(merged[0].label).toBe('Hand made')
  })

  it('copes with either side missing', () => {
    expect(mergeCategories(STORED, [])).toHaveLength(2)
    expect(mergeCategories([], classCategories(CLASSES))).toHaveLength(2)
    expect(mergeCategories()).toEqual([])
  })
})

describe('findCategory', () => {
  const all = mergeCategories(STORED, classCategories(CLASSES))

  it('finds a stored category and a class category alike', () => {
    expect(findCategory(all, 'academic').label).toBe('Academic')
    expect(findCategory(all, 'class:cls2').label).toBe('Calculus II')
  })

  it('returns null for a task filed under a class that is gone', () => {
    // A deleted or disabled class leaves its tasks pointing at a category that no
    // longer exists. The row drops its chip rather than breaking.
    expect(findCategory(all, 'class:deleted')).toBeNull()
  })

  it('returns null for no id at all', () => {
    expect(findCategory(all, null)).toBeNull()
    expect(findCategory(all, undefined)).toBeNull()
    expect(findCategory(undefined, 'academic')).toBeNull()
  })
})
