/**
 * The app's accent colour.
 *
 * Applied as a `data-accent` attribute on <html> and stored under `lv-accent`. An
 * inline script in layout.js reads the stored value before first paint, so the page
 * never flashes the default blue first — which is why the default is "no attribute"
 * rather than `data-accent="blue"`.
 *
 * These used to live in components/AccentPicker.js beside a popover picker nothing
 * rendered any more; the settings menu had grown its own copy of the picker, and of
 * the storage key.
 */

export const ACCENT_OPTIONS = [
  { id: 'blue',     label: 'Luminae Blue', color: '#3a6fa8' },
  { id: 'violet',   label: 'Violet',       color: '#7c3aed' },
  { id: 'emerald',  label: 'Emerald',      color: '#059669' },
  { id: 'rose',     label: 'Rose',         color: '#e11d48' },
  { id: 'amber',    label: 'Amber',        color: '#d97706' },
  { id: 'slate',    label: 'Slate',        color: '#475569' },
]

const STORAGE_KEY    = 'lv-accent'
const DEFAULT_ACCENT = 'blue'

/** Apply an accent id to the document. Unknown ids fall back to the default. */
export function applyAccent(id) {
  const safe = ACCENT_OPTIONS.some(o => o.id === id) ? id : DEFAULT_ACCENT
  if (safe === DEFAULT_ACCENT) {
    document.documentElement.removeAttribute('data-accent')
  } else {
    document.documentElement.setAttribute('data-accent', safe)
  }
}

/** The stored accent, or the default when there is none or storage is unavailable. */
export function getSavedAccent() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT } catch { return DEFAULT_ACCENT }
}

/** Apply an accent and remember it for the next load. */
export function saveAccent(id) {
  applyAccent(id)
  try { localStorage.setItem(STORAGE_KEY, id) } catch {}
}
