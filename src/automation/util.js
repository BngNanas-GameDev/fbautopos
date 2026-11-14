import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { ROOT } from '../server/store.js'

export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
export const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// Random pause between UI actions to look human.
export function humanDelay() {
  const min = Number(process.env.ACTION_DELAY_MIN || 700)
  const max = Number(process.env.ACTION_DELAY_MAX || 2200)
  return delay(rand(min, max))
}

// Type text into a contenteditable / input, optionally human-paced.
export async function typeLike(locator, text, { typing = true } = {}) {
  await locator.click()
  await delay(rand(150, 450))
  if (!typing) {
    await locator.fill(text)
    return
  }
  // Slow, human-ish typing. Keeps under a sane cap for long posts.
  const chars = [...text]
  const step = chars.length > 400 ? 8 : chars.length > 150 ? 3 : 1
  let buffer = ''
  for (let i = 0; i < chars.length; i += step) {
    buffer += chars.slice(i, i + step).join('')
    await locator.fill(buffer)
    await delay(rand(18, 70))
  }
  await locator.fill(text)
}

// Click the first selector that is visible; returns true if one was clicked.
export async function clickFirst(page, selectors, { timeout = 4000 } = {}) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    try {
      await loc.waitFor({ state: 'visible', timeout })
      await loc.click()
      return true
    } catch {
      /* try next */
    }
  }
  return false
}

export async function screenshot(page, name = 'shot') {
  try {
    const dir = path.resolve(ROOT, process.env.SCREENSHOT_DIR || 'logs')
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `${name}-${Date.now()}.png`)
    await page.screenshot({ path: file, fullPage: false })
    return file
  } catch {
    return null
  }
}

const BLOCK_PATTERNS = [
  'checkpoint',
  'temporarily blocked',
  'you can.t post right now',
  'we limit how often',
  'confirm it.s you',
  'suspicious activity',
  'account has been restricted'
]

export function looksBlocked(text) {
  const t = (text || '').toLowerCase()
  return BLOCK_PATTERNS.some((p) => t.includes(p))
}