/**
 * Server-side token storage for Google OAuth accounts.
 * Saves to data/google-tokens.json (gitignored).
 */
import fs   from 'fs'
import path from 'path'

const DATA_DIR   = path.join(process.cwd(), 'data')
const TOKEN_FILE = path.join(DATA_DIR, 'google-tokens.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function read() {
  try {
    ensureDir()
    if (!fs.existsSync(TOKEN_FILE)) return { accounts: [] }
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
  } catch {
    return { accounts: [] }
  }
}

function write(data) {
  ensureDir()
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), 'utf8')
}

export function getAccounts() {
  return read().accounts
}

export function getAccount(id) {
  return read().accounts.find(a => a.id === id) ?? null
}

export function upsertAccount(account) {
  const data = read()
  const idx  = data.accounts.findIndex(a => a.id === account.id)
  if (idx >= 0) data.accounts[idx] = account
  else          data.accounts.push(account)
  write(data)
}

export function removeAccount(id) {
  const data = read()
  data.accounts = data.accounts.filter(a => a.id !== id)
  write(data)
}
