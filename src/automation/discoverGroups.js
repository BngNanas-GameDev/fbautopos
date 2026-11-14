import { launchContext } from './browser.js'
import { pathToFileURL } from 'node:url'
import { store } from '../server/store.js'
import { logger } from '../server/logger.js'
import { delay, humanDelay } from './util.js'

const GROUPS_URLS = [
  'https://www.facebook.com/groups/feed/',
  'https://www.facebook.com/groups/'
]

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
    const u = new URL(href)
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
 * Open the given Playwright context and scrape the user's groups.
 * @param {import('playwright').BrowserContext} context
 * @returns {Promise<Array<{id:string,url:string,name:string}>>}
 */
export async function discoverGroupsFromContext(context) {
  const page = await context.newPage()
  const found = new Map()

  try {
    for (const url of GROUPS_URLS) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await humanDelay()

        // Scroll to lazy-load more groups.
        for (let i = 0; i < 8; i++) {
          await page.mouse.wheel(0, 2500)
          await delay(700)
        }

        const anchors = await page.$$eval('a[href*="/groups/"]', (as) =>
          as.map((a) => ({ href: a.href, text: (a.textContent || '').trim() }))
        )
        for (const a of anchors) {
          const g = parseGroupHref(a.href)
          if (!g) continue
          if (!found.has(g.id)) {
            found.set(g.id, { id: g.id, url: g.url, name: a.text || g.id })
          } else if (found.get(g.id).name === g.id && a.text) {
            found.get(g.id).name = a.text
          }
        }
      } catch (err) {
        logger.warn(`Group discovery failed for ${url}: ${String(err).split('\n')[0]}`)
      }
    }
  } finally {
    await page.close().catch(() => {})
  }

  return [...found.values()]
}

/**
 * Merge discovered groups into config/groups.json, preserving existing
 * enabled/excluded flags. Returns the merged list.
 */
export async function mergeGroups(discovered) {
  const existing = await store.getGroups()
  const byId = new Map(existing.map((g) => [g.id, g]))
  for (const g of discovered) {
    if (!byId.has(g.id)) {
      byId.set(g.id, { id: g.id, name: g.name, url: g.url, enabled: true })
    } else {
      const cur = byId.get(g.id)
      byId.set(g.id, { ...cur, name: g.name || cur.name, url: g.url })
    }
  }
  const merged = [...byId.values()]
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
    logger.info(`Discovered ${discovered.length} groups; ${merged.length} total stored.`)
    return { discovered, merged }
  } finally {
    await context.close().catch(() => {})
  }
}

// CLI entry
async function cli() {
  const { discovered } = await discoverGroups({ headless: false })
  console.log(`\nDiscovered ${discovered.length} groups:`)
  for (const g of discovered) console.log(` - ${g.name || g.id}  ${g.url}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}