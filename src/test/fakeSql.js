/**
 * A programmable stand-in for lib/db's tagged-template `sql`, for route tests.
 *
 * Not a test file itself (vitest only collects `*.test.*`); route tests import it and
 * hand it to `vi.mock('@/lib/db', …)`. Modelled on the recording fake in
 * lib/pushSend.test.js, plus the two things a whole route needs on top:
 *
 *   - **Answers by query text.** `sql.on(/FROM todos/, rows)` registers a handler for
 *     any query whose text matches. A handler is a row array, an Error (the query
 *     rejects with it), or a function `(values, call) => rows` that may itself throw
 *     or return a promise. The most recently registered match wins, so a test can set
 *     defaults and then override one of them. A query nothing matches resolves to `[]`
 *     — DDL and housekeeping statements need no registration.
 *   - **Real promises.** Every call returns a genuine Promise, so a route can chain
 *     `.catch(() => [])` onto a query (the status route does) and a handler's throw
 *     surfaces as a rejection rather than a synchronous exception — exactly how a
 *     failing Neon query behaves.
 *
 * Every call is recorded as `{ text, values }`, with the template's whitespace
 * collapsed so assertions can match on readable fragments.
 */

/** Joined template text with placeholders as `$n`, whitespace collapsed. */
function queryText(strings) {
  return strings
    .reduce((acc, s, i) => acc + (i > 0 ? `$${i}` : '') + s, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createFakeSql() {
  let handlers = []
  const calls  = []

  function sql(strings, ...values) {
    const call = { text: queryText(strings), values }
    calls.push(call)
    const match = [...handlers].reverse().find(h => h.pattern.test(call.text))
    return Promise.resolve().then(() => {
      if (!match) return []
      const { answer } = match
      if (answer instanceof Error) throw answer
      if (typeof answer === 'function') return answer(values, call)
      return answer
    })
  }

  /**
   * Register an answer for queries matching `pattern` (a RegExp or a substring).
   * @returns the fake itself, for chaining.
   */
  sql.on = (pattern, answer) => {
    const re = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    handlers.push({ pattern: re, answer })
    return sql
  }

  /** Every recorded call, in order. */
  sql.calls = calls

  /** The recorded calls whose text matches `pattern`. */
  sql.callsMatching = pattern => {
    const re = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return calls.filter(c => re.test(c.text))
  }

  /** Forget every handler and every recorded call. */
  sql.reset = () => {
    handlers = []
    calls.length = 0
  }

  // lib/db's two extra entry points, faked just far enough for a route that uses them.
  sql.transaction = queries => Promise.all(queries)
  sql.unsafe      = str => ({ unsafe: str })

  return sql
}
