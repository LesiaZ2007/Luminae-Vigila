'use client'

/**
 * Open Google's consent popup and resolve when it finishes.
 *
 * Shared because there were two call sites doing this differently and one of them was
 * broken: the "Reconnect" action on the disconnected-account toast called
 * `window.open('/api/google/auth')` directly. That endpoint returns **JSON containing**
 * the consent URL — it is not a redirect — so the popup showed a wall of raw JSON.
 * The single most reachable path back from a disconnected account did not work at all.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.email]  Pre-select this Google account on the consent screen.
 * @returns {Promise<{ok: boolean, error?: string, reason?: string}>}
 */
export function connectGoogleAccount({ email } = {}) {
  return new Promise(resolve => {
    // Opened synchronously, before any await: a popup opened after an async gap is no
    // longer attributed to the user's click and gets blocked.
    const popup = window.open('', 'google-auth', 'width=520,height=660,menubar=no,toolbar=no,location=yes,scrollbars=yes')
    if (!popup) {
      resolve({ ok: false, reason: 'popup_blocked', error: 'Your browser blocked the sign-in window. Allow popups for this site and try again.' })
      return
    }
    popup.document.write('<p style="font:14px system-ui;padding:24px">Opening Google…</p>')

    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMsg)
      clearInterval(poll)
      resolve(result)
    }

    function onMsg(e) {
      if (e.data?.type === 'gc_connected') { try { popup.close() } catch {} ; finish({ ok: true }) }
      else if (e.data?.type === 'gc_error') { try { popup.close() } catch {} ; finish({ ok: false, error: e.data.error }) }
    }
    window.addEventListener('message', onMsg)

    // The postMessage can be missed if the user closes the window at the wrong moment,
    // so a closed popup also ends the wait — the caller reloads accounts either way.
    const poll = setInterval(() => {
      if (popup.closed) finish({ ok: true, reason: 'closed' })
    }, 600)

    // `email` becomes login_hint, so reconnecting an account goes straight to that
    // account rather than an account chooser. Picking the wrong one there connects a
    // *second* account instead of repairing the broken one.
    const url = email ? `/api/google/auth?email=${encodeURIComponent(email)}` : '/api/google/auth'

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data?.error === 'not_configured') {
          try { popup.close() } catch {}
          finish({ ok: false, reason: 'not_configured', error: 'Google sign-in is not configured on this deployment.' })
          return
        }
        if (!data?.url) {
          try { popup.close() } catch {}
          finish({ ok: false, error: 'Could not start Google sign-in.' })
          return
        }
        popup.location.href = data.url
      })
      .catch(() => {
        try { popup.close() } catch {}
        finish({ ok: false, error: 'Could not reach the server.' })
      })
  })
}
