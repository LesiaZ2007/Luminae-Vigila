import { describe, it, expect } from 'vitest'
import {
  linkedParentId, buildClassLinks, classLinksFor, canonicalClassId, isLinkedSection,
  hasLinkedSections, linkedSectionIds, sectionIds, sectionsOf, canonicalCategoryId,
  linkabilityError, linkCandidates, linkClasses, unlinkClass, clearLinksTo,
} from './classLinks'

/** A lecture and its lab, the case the whole module exists for. */
const LECTURE = { id: 'chem',     courseName: 'Organic Chemistry',     color: '#3a6fa8' }
const LAB     = { id: 'chem_lab', courseName: 'Organic Chemistry Lab', color: '#10b981', linkedToClassId: 'chem' }
const OTHER   = { id: 'calc',     courseName: 'Calculus II',           color: '#8b5cf6' }

const LINKED = [LECTURE, LAB, OTHER]

describe('linkedParentId', () => {
  it('reads the stored link', () => {
    expect(linkedParentId(LAB)).toBe('chem')
  })

  it('is null for a class that stands on its own', () => {
    expect(linkedParentId(LECTURE)).toBeNull()
    expect(linkedParentId({ id: 'x', linkedToClassId: null })).toBeNull()
    expect(linkedParentId({ id: 'x', linkedToClassId: '' })).toBeNull()
    expect(linkedParentId(null)).toBeNull()
  })

  it('refuses a class as its own parent', () => {
    expect(linkedParentId({ id: 'x', linkedToClassId: 'x' })).toBeNull()
  })

  it('compares as a string, since ids arrive both ways', () => {
    expect(linkedParentId({ id: 7, linkedToClassId: 7 })).toBeNull()
    expect(linkedParentId({ id: 7, linkedToClassId: 8 })).toBe('8')
  })
})

describe('buildClassLinks', () => {
  it('maps the section onto the class it belongs to, and back', () => {
    const links = buildClassLinks(LINKED)
    expect(links.parentOf.get('chem_lab')).toBe('chem')
    expect(links.childrenOf.get('chem')).toEqual(['chem_lab'])
    expect(links.parentOf.has('chem')).toBe(false)
  })

  it('orders several sections by name, not by entry order', () => {
    const links = buildClassLinks([
      LECTURE,
      { id: 's2', courseName: 'Studio', linkedToClassId: 'chem' },
      { id: 's1', courseName: 'Lab',    linkedToClassId: 'chem' },
    ])
    expect(links.childrenOf.get('chem')).toEqual(['s1', 's2'])
  })

  it('drops a link whose parent is not there', () => {
    const links = buildClassLinks([LAB])
    expect(links.parentOf.size).toBe(0)
  })

  it('drops a link whose parent was deleted', () => {
    const links = buildClassLinks([{ ...LECTURE, deletedAt: '2026-01-01' }, LAB])
    expect(links.parentOf.size).toBe(0)
  })

  /* The one that is easy to get wrong: `classCategories` omits a disabled class, so a
     live section resolving onto one would have no category anywhere in the app. */
  it('drops a link whose parent is switched off, so the section keeps its own category', () => {
    const links = buildClassLinks([{ ...LECTURE, enabled: false }, LAB])
    expect(links.parentOf.size).toBe(0)
    expect(canonicalClassId(links, 'chem_lab')).toBe('chem_lab')
  })

  it('ignores a deleted section rather than resolving it', () => {
    const links = buildClassLinks([LECTURE, { ...LAB, deletedAt: '2026-01-01' }])
    expect(links.parentOf.size).toBe(0)
  })

  it('links nothing when two classes name each other', () => {
    const links = buildClassLinks([
      { id: 'a', courseName: 'A', linkedToClassId: 'b' },
      { id: 'b', courseName: 'B', linkedToClassId: 'a' },
    ])
    expect(links.parentOf.size).toBe(0)
  })

  it('flattens a chain onto its root', () => {
    const links = buildClassLinks([
      { id: 'a', courseName: 'A' },
      { id: 'b', courseName: 'B', linkedToClassId: 'a' },
      { id: 'c', courseName: 'C', linkedToClassId: 'b' },
    ])
    expect(links.parentOf.get('b')).toBe('a')
    expect(links.parentOf.get('c')).toBe('a')
    expect(links.childrenOf.get('a')).toEqual(['b', 'c'])
  })

  it('survives junk', () => {
    expect(buildClassLinks().parentOf.size).toBe(0)
    expect(buildClassLinks([null, {}, { id: 'a' }]).parentOf.size).toBe(0)
  })
})

describe('classLinksFor', () => {
  it('returns the same structure for the same array', () => {
    expect(classLinksFor(LINKED)).toBe(classLinksFor(LINKED))
  })

  it('rebuilds for a different array', () => {
    expect(classLinksFor([...LINKED])).not.toBe(classLinksFor(LINKED))
  })

  it('tolerates a non-array', () => {
    expect(classLinksFor(undefined).parentOf.size).toBe(0)
  })
})

describe('reading the structure', () => {
  const links = buildClassLinks(LINKED)

  it('resolves a section, and leaves everything else alone', () => {
    expect(canonicalClassId(links, 'chem_lab')).toBe('chem')
    expect(canonicalClassId(links, 'chem')).toBe('chem')
    expect(canonicalClassId(links, 'calc')).toBe('calc')
    expect(canonicalClassId(links, 'gone')).toBe('gone')
    expect(canonicalClassId(links, null)).toBeNull()
  })

  it('tells the two ends of a link apart', () => {
    expect(isLinkedSection(links, 'chem_lab')).toBe(true)
    expect(isLinkedSection(links, 'chem')).toBe(false)
    expect(hasLinkedSections(links, 'chem')).toBe(true)
    expect(hasLinkedSections(links, 'chem_lab')).toBe(false)
    expect(hasLinkedSections(links, 'calc')).toBe(false)
  })

  it('lists the sections merged into a class', () => {
    expect(linkedSectionIds(links, 'chem')).toEqual(['chem_lab'])
    expect(linkedSectionIds(links, 'calc')).toEqual([])
  })

  it('answers sectionIds the same way whichever half you ask about', () => {
    expect(sectionIds(links, 'chem')).toEqual(['chem', 'chem_lab'])
    expect(sectionIds(links, 'chem_lab')).toEqual(['chem', 'chem_lab'])
    expect(sectionIds(links, 'calc')).toEqual(['calc'])
    expect(sectionIds(links, null)).toEqual([])
  })

  it('hands back the entries themselves, parent first', () => {
    expect(sectionsOf(LINKED, 'chem_lab').map(c => c.id)).toEqual(['chem', 'chem_lab'])
    expect(sectionsOf(LINKED, 'nope')).toEqual([])
  })
})

describe('canonicalCategoryId', () => {
  const links = buildClassLinks(LINKED)

  it('resolves a section category onto the class it merges into', () => {
    expect(canonicalCategoryId(links, 'class:chem_lab')).toBe('class:chem')
  })

  it('passes anything else through untouched', () => {
    expect(canonicalCategoryId(links, 'class:chem')).toBe('class:chem')
    expect(canonicalCategoryId(links, 'academic')).toBe('academic')
    expect(canonicalCategoryId(links, 'class:')).toBe('class:')
    expect(canonicalCategoryId(links, '')).toBe('')
    expect(canonicalCategoryId(links, null)).toBeNull()
    expect(canonicalCategoryId(links, undefined)).toBeUndefined()
  })
})

describe('linkabilityError', () => {
  it('allows the ordinary case', () => {
    expect(linkabilityError([LECTURE, OTHER], 'calc', 'chem')).toBeNull()
  })

  it('refuses a class as a section of itself', () => {
    expect(linkabilityError(LINKED, 'chem', 'chem')).toMatch(/itself/)
  })

  it('refuses a parent that is not there', () => {
    expect(linkabilityError(LINKED, 'calc', 'ghost')).toMatch(/no longer exists/)
  })

  it('refuses a parent that is switched off, and says why', () => {
    const classes = [{ ...LECTURE, enabled: false }, OTHER]
    expect(linkabilityError(classes, 'calc', 'chem')).toMatch(/switched off/)
  })

  it('points at the main class rather than one of its sections', () => {
    expect(linkabilityError(LINKED, 'calc', 'chem_lab')).toMatch(/Organic Chemistry/)
  })

  it('refuses to re-parent a class that has sections of its own', () => {
    expect(linkabilityError(LINKED, 'chem', 'calc')).toMatch(/already has sections/)
  })

  it('asks for a target when given none', () => {
    expect(linkabilityError(LINKED, 'calc', null)).toMatch(/Pick a class/)
  })
})

describe('linkCandidates', () => {
  it('offers the classes this one could be a section of', () => {
    expect(linkCandidates(LINKED, OTHER).map(c => c.id)).toEqual(['chem'])
  })

  it('offers nothing to a class that already has sections', () => {
    expect(linkCandidates(LINKED, LECTURE)).toEqual([])
  })

  it('offers nothing for a draft with no id yet', () => {
    expect(linkCandidates(LINKED, { courseName: 'New' })).toEqual([])
  })

  it('sorts by course name', () => {
    const classes = [
      { id: 'a', courseName: 'Zoology' },
      { id: 'b', courseName: 'Anthropology' },
      { id: 'c', courseName: 'Me' },
    ]
    expect(linkCandidates(classes, classes[2]).map(c => c.courseName)).toEqual(['Anthropology', 'Zoology'])
  })
})

describe('linkClasses / unlinkClass', () => {
  it('links the section and gives it the class colour', () => {
    const next = linkClasses([LECTURE, OTHER], 'calc', 'chem')
    const calc = next.find(c => c.id === 'calc')
    expect(calc.linkedToClassId).toBe('chem')
    expect(calc.color).toBe('#3a6fa8')
    // Nothing else is touched.
    expect(next.find(c => c.id === 'chem')).toBe(LECTURE)
  })

  it('keeps the section colour when the parent has none to give', () => {
    const next = linkClasses([{ id: 'chem', courseName: 'C' }, OTHER], 'calc', 'chem')
    expect(next.find(c => c.id === 'calc').color).toBe('#8b5cf6')
  })

  it('unlinks without disturbing the colour it adopted', () => {
    const next = unlinkClass(LINKED, 'chem_lab')
    const lab  = next.find(c => c.id === 'chem_lab')
    expect(lab.linkedToClassId).toBeNull()
    expect(lab.color).toBe('#10b981')
    expect(buildClassLinks(next).parentOf.size).toBe(0)
  })
})

describe('clearLinksTo', () => {
  it('stands a section back on its own when its class is deleted', () => {
    const next = clearLinksTo(LINKED, 'chem')
    expect(next.find(c => c.id === 'chem_lab').linkedToClassId).toBeNull()
  })

  it('leaves links to other classes alone', () => {
    const next = clearLinksTo(LINKED, 'calc')
    expect(next.find(c => c.id === 'chem_lab').linkedToClassId).toBe('chem')
  })
})
