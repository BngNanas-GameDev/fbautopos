import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { ROOT } from './store.js'

const LOG_DIR = path.join(ROOT, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')
const MAX_ENTRIES = 500

/** @type {Array<{ts:string,level:string,msg:string}>} */
const buffer = []
/** @type {Set<(entry:any)=>void>} */
const subscribers = new Set()

let ready = false
async function ensureReady() {
  if (ready) return
  await mkdir(LOG_DIR, { recursive: true })
  ready = true
}

export function log(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.shift()

  const line = `[${entry.ts}] ${level.toUpperCase()} ${msg}`
  if (level === 'error') console.error(line)
  else console.log(line)

  ensureReady()
    .then(() => appendFile(LOG_FILE, line + '\n'))
    .catch(() => {})

  for (const send of subscribers) {
    try {
      send(entry)
    } catch {
      /* ignore broken subscriber */
    }
  }
  return entry
}

export const logger = {
  info: (m) => log('info', m),
  warn: (m) => log('warn', m),
  error: (m) => log('error', m),
  debug: (m) => log('debug', m),
  history: () => buffer.slice(),
  /** Subscribe to live entries. Returns an unsubscribe fn. */
  subscribe(fn) {
    subscribers.add(fn)
    return () => subscribers.delete(fn)
  }
}