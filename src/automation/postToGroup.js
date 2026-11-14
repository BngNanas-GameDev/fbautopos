import { logger } from '../server/logger.js'
import {
  humanDelay,
  delay,
  typeLike,
  clickFirst,
  screenshot,
  looksBlocked
} from './util.js'

const COMPOSER_TRIGGERS = [
  '[role="button"][aria-label*="Write something"]',
  '[role="button"][aria-label*="Create post"]',
  'div[aria-label*="Write something"]',
  'div[aria-label*="Create post"]',
  'div[aria-label*="What\'s on your mind"]',
  'span:has-text("What\'s on your mind")',
  'span:has-text("Write something")'
]

const TEXTBOX_SELECTORS = [
  '[role="dialog"] div[contenteditable="true"]',
  '[role="dialog"] [role="textbox"]',
  'div[contenteditable="true"]',
  '[role="textbox"]'
]

const POST_BUTTON_SELECTORS = [
  '[role="dialog"] div[role="button"][aria-label="Post"]',
  '[role="dialog"] div[role="button"]:has-text("Post")',
  '[role="dialog"] button:has-text("Post")',
  'div[role="button"][aria-label="Post"]',
  'div[role="button"]:has-text("Post")'
]

function buildBody(content) {
  const msg = (content?.message || '').trim()
  const link = (content?.link || '').trim()
  if (msg && link && !msg.includes(link)) return `${msg}\n${link}`
  if (msg) return msg
  return link
}

/**
 * Post content to a single group using an already-open context.
 * @param {import('playwright').BrowserContext} context
 * @param {{id:string,name:string,url:string}} group
 * @param {{message:string,link:string}} content
 * @param {{typing?:boolean,dryRun?:boolean}} settings
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function postToGroup(context, group, content, settings = {}) {
  const page = await context.newPage()
  const label = group.name || group.id
  try {
    logger.info(`[${label}] Opening group…`)
    await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await humanDelay()

    const bodyText = await page.locator('body').innerText().catch(() => '')
    if (looksBlocked(bodyText)) {
      const shot = await screenshot(page, `blocked-${group.id}`)
      return { ok: false, reason: `Blocked/checkpoint screen detected (${shot || 'no screenshot'})` }
    }

    // Open composer.
    const opened = await clickFirst(page, COMPOSER_TRIGGERS, { timeout: 8000 })
    if (!opened) {
      const shot = await screenshot(page, `no-composer-${group.id}`)
      return { ok: false, reason: `Could not find composer trigger (${shot || 'no screenshot'})` }
    }
    await delay(1200)

    // Focus the post textbox.
    const box = page.locator(TEXTBOX_SELECTORS.join(', ')).first()
    await box.waitFor({ state: 'visible', timeout: 8000 })

    const body = buildBody(content)
    logger.info(`[${label}] Composing ${body.length} chars…`)
    await typeLike(box, body, { typing: settings.typing !== false })
    await delay(1500) // allow link preview fetch

    if (settings.dryRun) {
      logger.info(`[${label}] DRY RUN — not clicking Post.`)
      const shot = await screenshot(page, `dryrun-${group.id}`)
      return { ok: true, dryRun: true, screenshot: shot }
    }

    // Submit.
    const posted = await clickFirst(page, POST_BUTTON_SELECTORS, { timeout: 6000 })
    if (!posted) {
      const shot = await screenshot(page, `no-postbtn-${group.id}`)
      return { ok: false, reason: `Could not find Post button (${shot || 'no screenshot'})` }
    }

    // Wait for the composer to close (dialog gone) as success signal.
    try {
      await page.locator('[role="dialog"]').first().waitFor({ state: 'hidden', timeout: 20000 })
    } catch {
      // Some UIs keep an empty dialog; verify by checking textbox is gone.
      const stillOpen = await page.locator(TEXTBOX_SELECTORS.join(', ')).first().isVisible().catch(() => false)
      if (stillOpen) {
        const shot = await screenshot(page, `post-stuck-${group.id}`)
        return { ok: false, reason: `Post may not have gone through (${shot || 'no screenshot'})` }
      }
    }

    const after = await page.locator('body').innerText().catch(() => '')
    if (looksBlocked(after)) {
      return { ok: false, reason: 'Post blocked after submit (spam/checkpoint).' }
    }

    logger.info(`[${label}] Posted OK.`)
    return { ok: true }
  } catch (err) {
    const shot = await screenshot(page, `error-${group.id}`)
    return { ok: false, reason: String(err).split('\n')[0] + ` (${shot || 'no screenshot'})` }
  } finally {
    await page.close().catch(() => {})
  }
}