import { pathToFileURL } from 'node:url'
import { launchContext } from './browser.js'
import { logger } from '../server/logger.js'
import { delay } from './util.js'
import { detectIdentity, readSavedIdentity } from './identity.js'

const FB_HOME = 'https://www.facebook.com/'

async function isLoggedIn(page) {
  const url = page.url()
  if (/facebook\.com\/(login|checkpoint)/i.test(url)) return false
  try {
    if (await page.locator('#email').count()) return false
    if (await page.locator('input[name="pass"]').count()) return false
  } catch {
    /* ignore */
  }
  try {
    if (await page.locator('[role="feed"], [aria-label="Notifications"], [aria-label="Menu"]').count()) {
      return true
    }
  } catch {
    /* ignore */
  }
  return /facebook\.com\/?$|\/home\b/i.test(url)
}

/**
 * Open a headed browser and wait for the user to log in.
 * @param {{onStatus?:(s:string)=>void, timeoutMs?:number}} opts
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function performLogin({ onStatus = () => {}, timeoutMs = 5 * 60 * 1000 } = {}) {
  onStatus('Opening browser…')
  const context = await launchContext({ headless: false })
  const page = context.pages()[0] || (await context.newPage())
  try {
    await page.goto(FB_HOME, { waitUntil: 'domcontentloaded', timeout: 60000 })
    onStatus('Log in in the opened window. Waiting for login…')

    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (page.isClosed()) return { ok: false, reason: 'Browser window closed before login completed.' }
      if (await isLoggedIn(page)) {
        onStatus('Login detected. Reading account…')
        // Give the page a moment to settle, then read the account name.
        await delay(1200)
        const id = await detectIdentity(context)
        if (id.loggedIn && id.name) {
          onStatus(`Logged in as ${id.name}. Saving session.`)
          return { ok: true, name: id.name }
        }
        onStatus('Login detected, but the account name could not be read. Saving session anyway.')
        await delay(1500)
        return { ok: true, name: (await readSavedIdentity())?.name || null }
      }
      await delay(2500)
    }
    return { ok: false, reason: 'Timed out waiting for login.' }
  } catch (err) {
    return { ok: false, reason: String(err) }
  } finally {
    try {
      await context.close()
    } catch {
      /* ignore */
    }
  }
}

// CLI entry: `npm run login`
async function cli() {
  logger.info('Starting interactive login…')
  const result = await performLogin({
    onStatus: (s) => logger.info(s)
  })
  if (result.ok) {
    logger.info('Login complete. Session saved to the persistent profile.')
    process.exit(0)
  } else {
    logger.error(`Login failed: ${result.reason}`)
    process.exit(1)
  }
}

// Run directly (`node src/automation/login.js`) or via `npm run login`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli()
}