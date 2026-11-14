import { launchContext } from './browser.js'
import { pathToFileURL } from 'node:url'
import { store } from '../server/store.js'
import { logger } from '../server/logger.js'
import { postToGroup } from './postToGroup.js'
import { rand, delay } from './util.js'

const ENV_GROUP_MIN = Number(process.env.BETWEEN_GROUP_DELAY_MIN || 120000)
const ENV_GROUP_MAX = Number(process.env.BETWEEN_GROUP_DELAY_MAX || 300000)

function selectGroups(groups, state, settings, limit) {
  const now = Date.now()
  const windowMs = Math.max(0, (settings.intervalHours || 6) * 3600 * 1000)
  const enabled = groups.filter((g) => g.enabled !== false)

  const fresh = enabled.filter((g) => {
    const last = state.lastPostByGroup[g.id]
    if (!last) return true
    return now - new Date(last).getTime() >= windowMs
  })

  // Oldest-posted first.
  fresh.sort(
    (a, b) =>
      new Date(state.lastPostByGroup[a.id] || 0).getTime() -
      new Date(state.lastPostByGroup[b.id] || 0).getTime()
  )

  const cap = Math.max(1, Number(settings.maxGroupsPerRun) || 10)
  const hardLimit = limit && limit > 0 ? Math.min(limit, cap) : cap
  return fresh.slice(0, hardLimit)
}

/**
 * Run one posting pass.
 * @param {{dryRun?:boolean, headless?:boolean, limit?:number, context?:import('playwright').BrowserContext}} opts
 */
export async function runOnce({ dryRun, headless, limit, context } = {}) {
  const settings = await store.getSettings()
  const content = await store.getContent()
  const groups = await store.getGroups()
  const state = await store.getState()

  const isDry = dryRun ?? settings.dryRun
  const runHeadless = headless ?? settings.headless
  const selected = selectGroups(groups, state, settings, limit)

  const startedAt = new Date().toISOString()
  const summary = {
    startedAt,
    finishedAt: null,
    dryRun: isDry,
    selected: selected.map((g) => g.id),
    results: []
  }

  if (!selected.length) {
    summary.finishedAt = new Date().toISOString()
    logger.info('No groups selected (all filtered out by interval/cap or none enabled).')
    return summary
  }

  logger.info(
    `Run starting: ${selected.length} group(s)${isDry ? ' [DRY RUN]' : ''}.`
  )

  const ownContext = !context
  const ctx = context || (await launchContext({ headless: runHeadless }))
  // Reuse a single tab for the whole run so the window stays on Facebook
  // (a fresh page per group leaves Chrome showing about:blank).
  const page = ctx.pages()[0] || (await ctx.newPage())
  let aborted = false

  try {
    for (let i = 0; i < selected.length; i++) {
      const group = selected[i]
      let result
      try {
        result = await postToGroup(
          ctx,
          group,
          content,
          { typing: settings.typing, dryRun: isDry },
          { page }
        )
      } catch (err) {
        result = { ok: false, reason: String(err).split('\n')[0] }
      }

      summary.results.push({ group, ok: result.ok, reason: result.reason })

      const ts = new Date().toISOString()
      if (result.ok && !isDry) {
        state.lastPostByGroup[group.id] = ts
        state.history.unshift({ ts, groupId: group.id, name: group.name, ok: true })
      } else {
        state.history.unshift({
          ts,
          groupId: group.id,
          name: group.name,
          ok: false,
          reason: result.reason
        })
      }

      if (/block|checkpoint|temporarily|restricted|suspicious/i.test(result.reason || '')) {
        logger.error('Aborting run: Facebook blocked the session.')
        aborted = true
        break
      }

      if (i < selected.length - 1) {
        const floorMs = Math.max(0, (settings.minGapMinutes || 0) * 60000)
        const gap = Math.max(rand(ENV_GROUP_MIN, ENV_GROUP_MAX), floorMs)
        logger.info(`Waiting ${Math.round(gap / 1000)}s before next group…`)
        await delay(gap)
      }
    }
  } finally {
    state.history = state.history.slice(0, 300)
    await store.setState(state)
    if (ownContext) await ctx.close().catch(() => {})
    summary.finishedAt = new Date().toISOString()
  }

  const posted = summary.results.filter((r) => r.ok).length
  const failed = summary.results.length - posted
  summary.posted = posted
  summary.failed = failed
  summary.aborted = aborted
  logger.info(
    `Run finished: ${posted} posted, ${failed} failed${aborted ? ', aborted' : ''}.`
  )
  return summary
}

// CLI entry: `npm run post` / `npm run post:dry`
async function cli() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run') || args.includes('--dry')
  const limitArg = args.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined
  const summary = await runOnce({ dryRun, limit })
  console.log(JSON.stringify(summary, null, 2))
  process.exit(summary.failed && !summary.dryRun ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}