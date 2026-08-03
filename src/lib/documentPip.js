'use client'

/**
 * documentPip.js — always-on-top pop-out window via the Document
 * Picture-in-Picture API.
 *
 * This is the only way the web can float UI above other applications. It is
 * genuinely always-on-top: it survives switching tabs, minimising the browser,
 * and full-screening something else, which is exactly what a timer needs.
 *
 * Availability is narrow and worth being honest about:
 *   - Chrome / Edge / other Chromium, desktop only, 116+
 *   - NOT Firefox, NOT Safari
 *   - NOT Android or iOS at all. Floating over other apps on a phone or tablet
 *     requires a native overlay permission; no web API exposes it. Callers
 *     should hide or explain the control rather than let it fail silently.
 */

export function pipSupported() {
  return typeof window !== 'undefined'
    && 'documentPictureInPicture' in window
    && typeof window.documentPictureInPicture?.requestWindow === 'function'
}

/**
 * Copy the page's styles into the pop-out.
 *
 * A PiP window is a genuinely separate document: it inherits no stylesheets, so
 * without this every CSS custom property (--blue, --surface, the accent palette)
 * resolves to nothing and the timer renders unstyled. Same-origin rules are
 * cloned by text; cross-origin ones can only be re-linked, since reading
 * .cssRules on them throws.
 */
function copyStyles(target) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const cssText = Array.from(sheet.cssRules).map(r => r.cssText).join('\n')
      const style = document.createElement('style')
      style.textContent = cssText
      target.head.appendChild(style)
    } catch {
      // Cross-origin (fonts, CDNs) — re-request it by href instead.
      if (sheet.href) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.head.appendChild(link)
      }
    }
  }

  // Theme and accent live as attributes/classes on <html>, and the font as a
  // class. Without these the pop-out is always light-mode default blue.
  const src = document.documentElement
  target.documentElement.className = src.className
  for (const attr of ['data-accent', 'data-theme']) {
    const val = src.getAttribute(attr)
    if (val) target.documentElement.setAttribute(attr, val)
  }
  target.body.style.margin = '0'
}

/**
 * Open the pop-out. MUST be called from a user gesture — the browser rejects it
 * otherwise, the same way it rejects an unprompted popup.
 *
 * @returns {Promise<Window|null>} null if unsupported or the user declined.
 */
export async function openPipWindow({ width = 320, height = 380 } = {}) {
  if (!pipSupported()) return null
  try {
    const pip = await window.documentPictureInPicture.requestWindow({ width, height })
    copyStyles(pip.document)
    return pip
  } catch {
    return null
  }
}
