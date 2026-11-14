import { logger } from '../server/logger.js'
import {
  humanDelay,
  delay,
  typeLike,
  clickFirst,
  screenshot,
  looksBlocked
} from './util.js'

// The group composer trigger is a div[role=button] whose text is "Write something...".
// It has no aria-label, so match by text.
const COMPOSER_TRIGGERS = [
  'div[role="button"]:has-text("Write something")',
  'div[role="button"]:has-text("Create a public post")',
  'div[role="button"][aria-label*="Write something"]',
  'div[aria-label*="Write something"]',
  'span:has-text("Write something")'
]

// The composer is a [role=dialog] that contains a contenteditable textbox.
// Scope the textbox to that dialog so we don't hit the feed.
const composerDialog = '[role="dialog"]:has([contenteditable="true"][role="textbox"])'
const TEXTBOX = `${composerDialog} [contenteditable="true"][role="textbox"], ${composerDialog} [contenteditable="true"]`

// Post button lives inside the composer dialog and has aria-label="Post".
const POST_BUTTON = `${composerDialog} [role="button"][aria-label="Post"], ${composerDialog} button[aria-label="Post"]`

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
export async function postToGroup(context, group, content, settings = {}, options = {}) {
  // Reuse a caller-provided page when given (keeps one tab for the whole run,
  // so Chrome never falls back to about:blank between groups).
  const page = options.page || (await context.newPage())
  const ownsPage = !options.page
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

    // Focus the composer textbox (inside the composer dialog only).
    const box = page.locator(TEXTBOX).first()
    try {
      await box.waitFor({ state: 'visible', timeout: 8000 })
    } catch {
      const shot = await screenshot(page, `no-textbox-${group.id}`)
      return { ok: false, reason: `Composer textbox not found (${shot || 'no screenshot'})` }
    }

    const body = buildBody(content)
    logger.info(`[${label}] Composing ${body.length} chars…`)
    await typeLike(box, body, { typing: settings.typing !== false })
    await delay(1800) // allow link preview fetch

    if (settings.dryRun) {
      logger.info(`[${label}] DRY RUN — not clicking Post.`)
      const shot = await screenshot(page, `dryrun-${group.id}`)
      return { ok: true, dryRun: true, screenshot: shot }
    }

    // Click Post.
    const posted = await clickFirst(page, [POST_BUTTON], { timeout: 6000 })
    if (!posted) {
      const shot = await screenshot(page, `no-postbtn-${group.id}`)
      return { ok: false, reason: `Could not find Post button (${shot || 'no screenshot'})` }
    }

    // Success = the composer dialog closes.
    const dialog = page.locator(composerDialog).first()
    let closed = false
    try {
      await dialog.waitFor({ state: 'hidden', timeout: 20000 })
      closed = true
    } catch {
      closed = false
    }

    if (!closed) {
      // Some UIs keep the dialog mounted; verify the textbox is gone/empty.
      const stillTyping = await page
        .locator(TEXTBOX)
        .first()
        .isVisible()
        .catch(() => false)
      if (stillTyping) {
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
    // Only close the page if we created it. Reused pages stay open so the
    // browser window doesn't drop to about:blank.
    if (ownsPage) await page.close().catch(() => {})
  }
}