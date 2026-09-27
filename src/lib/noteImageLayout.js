/**
 * Image layout in notes — alignment, text wrapping, and size.
 *
 * Three attributes ride on each image node and are written into the note HTML as
 * data-attributes, so the layout syncs with the note like any other formatting:
 *
 *   data-align  'left' | 'center' | 'right'   (left is the default and is omitted)
 *   data-wrap   'true'                        text flows around the image
 *   data-size   'small' | 'medium' | 'large'  33% / 50% / 75% of the column
 *                                             (omitted = natural width, capped at 100%)
 *
 * The CSS in globals.css turns those into floats and widths. Nothing here uses an
 * inline `style`: a data-attribute can only mean what our stylesheet says it
 * means, whereas a pasted `style="position:fixed…"` could do anything.
 *
 * Omitting defaults keeps every note written before this feature byte-identical
 * after a round-trip — an old image parses as left / no wrap / natural size,
 * which is exactly how it already rendered.
 */

import Image from '@tiptap/extension-image'

export const IMAGE_ALIGNS = ['left', 'center', 'right']
export const IMAGE_SIZES  = ['small', 'medium', 'large'] // null = natural width

export const DEFAULT_IMAGE_LAYOUT = { align: 'left', wrap: false, size: null }

// Wrapping a natural-width image usually does nothing visible — a phone photo is
// already wider than the column, so there is no room left beside it for text.
// Switching wrap on without a size picks this one so the click has an effect.
const WRAP_DEFAULT_SIZE = 'medium'

export function normalizeAlign(v) {
  return IMAGE_ALIGNS.includes(v) ? v : 'left'
}

export function normalizeSize(v) {
  return IMAGE_SIZES.includes(v) ? v : null
}

export function normalizeWrap(v) {
  return v === true || v === 'true'
}

/**
 * Coerce any attrs object into a valid layout. Centered images never wrap:
 * a float can only go left or right, and "text on both sides" is not something
 * CSS can do without splitting the paragraph.
 */
export function normalizeImageLayout(attrs = {}) {
  const align = normalizeAlign(attrs?.align)
  const wrap  = align === 'center' ? false : normalizeWrap(attrs?.wrap)
  const size  = normalizeSize(attrs?.size)
  return { align, wrap, size }
}

/**
 * The layout after applying one change from the image menu.
 *
 * Rules beyond plain merging:
 *  - choosing center turns wrapping off (see normalizeImageLayout);
 *  - turning wrap on while the image is centered moves it left, since that is
 *    the side text reads from;
 *  - turning wrap on with no size set picks a medium size, so text actually has
 *    somewhere to go.
 */
export function nextImageLayout(current, change = {}) {
  const cur = normalizeImageLayout(current)
  const next = { ...cur, ...change }

  if (change.wrap === true) {
    if (normalizeAlign(next.align) === 'center') next.align = 'left'
    if (!normalizeSize(next.size)) next.size = WRAP_DEFAULT_SIZE
  }

  return normalizeImageLayout(next)
}

/**
 * The Image node, extended with the layout attributes. Everything else
 * (src/alt/title, the markdown input rule, allowBase64) is inherited unchanged.
 */
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: DEFAULT_IMAGE_LAYOUT.align,
        parseHTML: el => normalizeAlign(el.getAttribute('data-align')),
        renderHTML: attrs => {
          const align = normalizeAlign(attrs.align)
          return align === 'left' ? {} : { 'data-align': align }
        },
      },
      wrap: {
        default: DEFAULT_IMAGE_LAYOUT.wrap,
        parseHTML: el => normalizeAlign(el.getAttribute('data-align')) !== 'center'
          && normalizeWrap(el.getAttribute('data-wrap')),
        renderHTML: attrs => {
          const { wrap } = normalizeImageLayout(attrs)
          return wrap ? { 'data-wrap': 'true' } : {}
        },
      },
      size: {
        default: DEFAULT_IMAGE_LAYOUT.size,
        parseHTML: el => normalizeSize(el.getAttribute('data-size')),
        renderHTML: attrs => {
          const size = normalizeSize(attrs.size)
          return size ? { 'data-size': size } : {}
        },
      },
    }
  },
})
