import { describe, it, expect } from 'vitest'
import { classifyDbError, QUOTA_STATUS } from './dbErrors'

describe('classifyDbError', () => {
  it('recognises the Neon quota status', () => {
    expect(classifyDbError({ status: QUOTA_STATUS })).toBe('db_quota')
    expect(classifyDbError({ statusCode: 402 })).toBe('db_quota')
  })

  it('recognises quota wording when no status is attached', () => {
    // The serverless driver does not always surface the HTTP status on the error, so
    // the message is the only signal left.
    for (const m of [
      'Request failed with status code 402',
      'Payment Required',
      'compute quota exceeded for this project',
      'project is suspended',
    ]) {
      expect(classifyDbError({ message: m }), m).toBe('db_quota')
    }
  })

  it('does not mistake an unrelated number containing 402 for a quota error', () => {
    // Word-bounded on purpose: "4021" and a timestamp are not HTTP 402.
    expect(classifyDbError({ message: 'connection id 4021 reset' })).not.toBe('db_quota')
    expect(classifyDbError({ message: 'failed at 1402ms' })).not.toBe('db_quota')
  })

  it('still reports an unconfigured or unreachable database separately', () => {
    expect(classifyDbError({ message: 'DATABASE_URL is not set.' })).toBe('db_unavailable')
    expect(classifyDbError({ message: 'could not connect to database' })).toBe('db_unavailable')
    expect(classifyDbError({ code: 'ECONNREFUSED', message: 'connect refused' })).toBe('db_unavailable')
  })

  it('prefers the quota answer over the generic one when both could match', () => {
    // "database quota exceeded" contains 'database' too; quota is the more useful
    // answer because it has a different fix.
    expect(classifyDbError({ message: 'database quota exceeded' })).toBe('db_quota')
  })

  it('passes anything else through URL-encoded so it stays reportable', () => {
    expect(classifyDbError({ message: 'weird failure & stuff' })).toBe('weird%20failure%20%26%20stuff')
  })

  it('survives a thrown non-error', () => {
    expect(classifyDbError(null)).toBe('')
    expect(classifyDbError(undefined)).toBe('')
    expect(classifyDbError({})).toBe('')
  })
})
