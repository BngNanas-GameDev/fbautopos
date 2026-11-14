import { Router } from 'express'
import * as jobRunner from '../jobRunner.js'
import { getSchedulerStatus } from '../scheduler.js'
import { logger } from '../logger.js'
import { store } from '../store.js'
import { readSavedIdentity } from '../../automation/identity.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const [settings, groups, state, identity] = await Promise.all([
      store.getSettings(),
      store.getGroups(),
      store.getState(),
      readSavedIdentity()
    ])
    res.json({
      job: jobRunner.getJobStatus(),
      scheduler: getSchedulerStatus(),
      settings,
      identity: identity || null,
      groupCount: groups.filter((g) => g.enabled !== false).length,
      groupTotal: groups.length,
      history: (state.history || []).slice(0, 25)
    })
  } catch (e) {
    next(e)
  }
})

// Re-check the live session and return the account name.
router.get('/whoami', async (req, res) => {
  try {
    res.json(await jobRunner.whoami())
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

router.get('/logs', (req, res) => {
  const limit = Number(req.query.limit) || 200
  res.json(logger.history().slice(-limit))
})

router.get('/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (entry) => res.write(`data: ${JSON.stringify(entry)}\n\n`)
  res.write(`event: hello\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`)
  for (const e of logger.history()) send(e)

  const unsubscribe = logger.subscribe(send)
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

export default router