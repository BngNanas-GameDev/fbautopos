import { launchContext } from './browser.js'
import { pathToFileURL } from 'node:url'
import { store } from '../server/store.js'
import { logger } from '../server/logger.js'
import { delay, humanDelay } from './util.js'

// The reliable "groups you've joined" listing.
const JOINS_URL = 'https://www.facebook.com/groups/joins/?ordering=viewer_added'

const RESERVED = new Set([
  'feed',
  'joins',
  'create',
  'discover',
  'browse',
  'search',
  'about',
  'new',
  'your-groups',
  'groups'
])

function parseGroupHref(href) {
  try {
    const u = new URL(href, 'https://www.facebook.com')
    if (u.hostname !== 'www.facebook.com') return null
    const m = u.pathname.match(/\/groups\/([^/]+)/)
    if (!m) return null
    const id = m[1]
    if (!id || RESERVED.has(id)) return null
    if (!/^\d+$/.test(id) && !/^[a-z0-9.\-_]+$/i.test(id)) return null
    return { id, url: `https://www.facebook.com/groups/${id}/` }
  } catch {
    return null
  }
}

/**
 * Open the given Playwright context and scrape the groups the user has joined.
 * Uses the "All groups you've joined" page, scrolling to lazy-load them all.
 * @param {import('playwright').BrowserContext} context
 * @returns {Promise<Array<{id:string,url:string,name:string}>>}
 */
export async function discoverGroupsFromContext(context) {
  const page = await context.newPage()
  const found = new Map()

  const collect = async () => {
    // The joined-groups page renders each group as a card with a "View group"
    // link. That link's href carries the exact group id; the name is the first
    // line of the card text.
    const cards = await page.$$eval('a', (as) =>
      as
        .filter((a) => /^view group$/i.test((a.textContent || '').replace(/\s+/g, ' ').trim()))
        .map((a) => {
          const href = a.getAttribute('href') || ''
          // Climb to the card container (2 levels up holds the name + button).
          let card = a
          for (let i = 0; i < 3 && card.parentElement; i++) {
            const t = (card.innerText || '').replace(/\s+/g, ' ').trim()
            if (t && !/^view group$/i.test(t)) break
            card = card.parentElement
          }
          const lines = (card.innerText || '')
            .split('\n')
            .map((s) => s.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
          const name = lines[0] || ''
          return { href, name }
        })
    )

    for (const c of cards) {
      const g = parseGroupHref(c.href)
      if (!g) continue
      const name = c.name
        .replace(/\bLast active\b.*$/i, '')
        .replace(/\bYou last visited\b.*$/i, '')
        .replace(/\bActive\b.*$/i, '')
        .trim()
      if (!found.has(g.id)) {
        found.set(g.id, { id: g.id, url: g.url, name: name || g.id })
      } else if (found.get(g.id).name === g.id && name) {
        found.get(g.id).name = name
      }
    }
  }

  try {
    await page.goto(JOINS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await humanDelay()

    // Scroll until the group count stops growing (or we hit the scroll cap).
    let prev = -1
    let stable = 0
    for (let i = 0; i < 40; i++) {
      await collect()
      if (found.size === prev) {
        stable += 1
        if (stable >= 3) break
      } else {
        stable = 0
        prev = found.size
      }
      await page.mouse.wheel(0, 3000)
      await delay(900)
    }
    await collect()
  } catch (err) {
    logger.warn(`Group discovery failed: ${String(err).split('\n')[0]}`)
  } finally {
    await page.close().catch(() => {})
  }

  return [...found.values()]
}

/**
 * Merge discovered groups into config/groups.json.
 * - New groups are added (enabled by default).
 * - Existing groups keep their enabled flag but get refreshed name/url.
 * - Groups no longer in the discovered list are pruned (you left them),
 *   but only when discovery actually returned results (guards against a
 *   failed scrape wiping the list).
 */
export async function mergeGroups(discovered, { prune = true } = {}) {
  const existing = await store.getGroups()
  const byId = new Map(existing.map((g) => [g.id, g]))
  const discoveredIds = new Set(discovered.map((g) => g.id))

  for (const g of discovered) {
    if (!byId.has(g.id)) {
      byId.set(g.id, { id: g.id, name: g.name, url: g.url, enabled: true })
    } else {
      const cur = byId.get(g.id)
      byId.set(g.id, { ...cur, name: g.name || cur.name, url: g.url })
    }
  }

  // Prune groups we're no longer a member of — but only when the scrape
  // looks complete (found at least as many as we already had). This avoids
  // deleting real groups if scrolling only loaded a partial list.
  let merged = [...byId.values()]
  if (prune && discovered.length > 0 && discovered.length >= existing.length) {
    merged = merged.filter((g) => discoveredIds.has(g.id))
  }
  await store.setGroups(merged)
  return merged
}

/**
 * Full discovery: launches a fresh persistent context, scrapes, merges.
 * @param {{headless?:boolean}} opts
 */
export async function discoverGroups({ headless = false } = {}) {
  const context = await launchContext({ headless })
  try {
    const discovered = await discoverGroupsFromContext(context)
    const merged = await mergeGroups(discovered)
    logger.info(`Discovered ${discovered.length} joined groups; ${merged.length} total stored.`)
    return { discovered, merged }
  } finally {
    await context.close().catch(() => {})
  }
}

// CLI entry
async function cli() {
  const { discovered } = await discoverGroups({ headless: false })
  console.log(`\nDiscovered ${discovered.length} joined groups:`)
  for (const g of discovered) console.log(` - ${g.name || g.id}  ${g.url}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}