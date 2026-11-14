import { chromium } from 'playwright'
import path from 'node:path'
import { ROOT } from '../server/store.js'
import { logger } from '../server/logger.js'
import 'dotenv/config'

const USER_DATA_DIR = path.resolve(
  ROOT,
  process.env.USER_DATA_DIR || 'auth'
)
const CHANNEL = process.env.BROWSER_CHANNEL || 'chrome'

// Runs before any page script to hide common automation fingerprints.
const STEALTH_INIT = () => {
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined })
  } catch {}
  try {
    // Fake a clean plugins array (headless has none).
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    })
  } catch {}
  try {
    const originalQuery = window.navigator.permissions?.query
    if (originalQuery) {
      window.navigator.permissions.query = (p) =>
        p && p.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(p)
    }
  } catch {}
}

const COMMON_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-infobars'
]

/**
 * Launch a persistent context. Tries the configured channel (real Chrome) first,
 * then falls back to Playwright's bundled Chromium.
 */
export async function launchContext({ headless = false } = {}) {
  const opts = {
    headless,
    args: COMMON_ARGS,
    viewport: null,
    locale: 'en-US',
    timezoneId: 'Europe/Warsaw',
    ignoreHTTPSErrors: true
  }

  let context
  try {
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      ...opts,
      channel: CHANNEL
    })
    logger.info(`Launched persistent context (channel=${CHANNEL}, headless=${headless})`)
  } catch (err) {
    if (CHANNEL === 'chrome') {
      logger.warn(
        `Chrome channel unavailable (${String(err).split('\n')[0]}); falling back to bundled Chromium.`
      )
      context = await chromium.launchPersistentContext(USER_DATA_DIR, opts)
      logger.info(`Launched persistent context (bundled chromium, headless=${headless})`)
    } else {
      throw err
    }
  }

  await context.addInitScript(STEALTH_INIT)
  return context
}

export { USER_DATA_DIR }