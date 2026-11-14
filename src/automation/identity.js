import { writeFile, readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { ROOT, CONFIG_DIR } from '../server/store.js'
import { USER_DATA_DIR } from './browser.js'

const IDENTITY_FILE = path.join(CONFIG_DIR, 'identity.json')

/**
 * Try to read the logged-in Facebook user's name from the page.
 * Facebook exposes a few stable-ish handles; we try several and fall back
 * to the page title.
 */
async function readAccountName(page) {
  // Facebook's profile header shows the display name in an h1/h2 near the
  // profile photo. Prefer the profile page; fall back to the home page.
  try {
    const onProfile = /facebook\.com\/(profile\.php|[^/]+\/?$)/i.test(page.url())
    if (!onProfile) {
      await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 60000 })
      await new Promise((r) => setTimeout(r, 3000))
    }

    // If redirected to login/checkpoint, bail out.
    if (/facebook\.com\/(login|checkpoint)/i.test(page.url())) return null

    const name = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
      const lines = (document.body.innerText || '')
        .split('\n')
        .map(clean)
        .filter(Boolean)

      const noise = /^(facebook|log in|notifications|new|add to story|edit profile|update your profile|personal details|highlights|posts|get more out of facebook|share a thought.*|what's on your mind.*|number of unread notifications|when you add.*|we've made it easier.*)$/i

      // The profile display name appears immediately before "Edit profile"
      // (or "Add to story"), inside the profile header.
      const idxEdit = lines.findIndex((l) => /^edit profile$/i.test(l))
      if (idxEdit > 0) {
        for (let i = idxEdit - 1; i >= 0 && i >= idxEdit - 6; i--) {
          const cand = lines[i]
          if (cand && !noise.test(cand) && !/^\d+$/.test(cand) && cand.length <= 60) {
            return cand
          }
        }
      }

      // Fallback: the largest heading that is not UI chrome.
      const heads = [...document.querySelectorAll('h1, h2')]
        .map((h) => clean(h.textContent))
        .filter((h) => h && !noise.test(h) && h.length <= 60)
      if (heads.length) return heads[0]

      return null
    })

    if (name && !noiseName(name)) return name
  } catch {
    /* ignore */
  }

  // 3) Last resort: document title with notification count stripped.
  try {
    const t = (await page.title()).replace(/\(\d+\)\s*/, '').split('|')[0].trim()
    if (t && !/^facebook$/i.test(t) && !/^log in/i.test(t) && t.length <= 60) return t
  } catch {
    /* ignore */
  }
  return null
}

function noiseName(n) {
  return /^(facebook|log in|notifications)$/i.test(n)
}

export async function readSavedIdentity() {
  try {
    if (!existsSync(IDENTITY_FILE)) return null
    const raw = (await readFile(IDENTITY_FILE, 'utf8')).replace(/^\uFEFF/, '')
    if (!raw.trim()) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function saveIdentity(name, avatar) {
  const data = { name, avatar: avatar || null, savedAt: new Date().toISOString() }
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(IDENTITY_FILE, JSON.stringify(data, null, 2))
  return data
}

/**
 * Detect the current account in an already-open context.
 * @param {import('playwright').BrowserContext} context
 */
export async function detectIdentity(context) {
  const page = context.pages()[0] || (await context.newPage())
  try {
    if (!/facebook\.com/i.test(page.url())) {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
      await new Promise((r) => setTimeout(r, 2500))
    }
    if (/facebook\.com\/(login|checkpoint)/i.test(page.url())) {
      return { loggedIn: false, name: null }
    }
    // readAccountName navigates to /me when needed to read the profile header.
    const name = await readAccountName(page)
    if (!name) return { loggedIn: false, name: null }
    return { loggedIn: true, name }
  } catch {
    return { loggedIn: false, name: null }
  }
}

/**
 * Probe the saved profile to see who is logged in (no visible window).
 * Updates config/identity.json. Never throws.
 * @param {{headless?:boolean}} opts
 */
export async function verifySession({ headless = true } = {}) {
  let context
  try {
    const { launchContext } = await import('./browser.js')
    context = await launchContext({ headless })
    const res = await detectIdentity(context)
    if (res.loggedIn && res.name) {
      const identity = await saveIdentity(res.name)
      return { ok: true, name: res.name, identity, profile: USER_DATA_DIR }
    }
    return { ok: false, name: null, profile: USER_DATA_DIR }
  } catch (err) {
    return { ok: false, name: null, error: String(err).split('\n')[0], profile: USER_DATA_DIR }
  } finally {
    if (context) await context.close().catch(() => {})
  }
}