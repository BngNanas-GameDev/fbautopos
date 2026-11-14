import { runOnce } from '../automation/run.js'
import { performLogin } from '../automation/login.js'
import { verifySession, readSavedIdentity } from '../automation/identity.js'
import { discoverGroups } from '../automation/discoverGroups.js'
import { logger } from './logger.js'

// Single-job lock: only one browser job runs at a time.
let state = {
  running: false,
  type: null,
  startedAt: null,
  finishedAt: null,
  lastResult: null
}

export function getJobStatus() {
  return { ...state }
}

async function withLock(type, fn) {
  if (state.running) {
    throw new Error('A job is already running. Try again when it finishes.')
  }
  state = {
    running: true,
    type,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastResult: state.lastResult
  }
  logger.info(`Job started: ${type}`)
  try {
    const result = await fn()
    state.lastResult = result
    return result
  } finally {
    state.running = false
    state.finishedAt = new Date().toISOString()
    logger.info(`Job finished: ${type}`)
  }
}

export function runNow(opts = {}) {
  return withLock('post', () => runOnce(opts))
}

export function login() {
  return withLock('login', () =>
    performLogin({ onStatus: (s) => logger.info(`[login] ${s}`) })
  )
}

export function discover() {
  return withLock('discover', async () => {
    const { discovered, merged } = await discoverGroups({ headless: false })
    return { discovered: discovered.length, total: merged.length }
  })
}

// Verify (and remember) which account is signed into the saved profile.
export async function whoami() {
  try {
    const result = await verifySession({ headless: true })
    return { ok: result.ok, name: result.name || null }
  } catch {
    return readSavedIdentity()
  }
}