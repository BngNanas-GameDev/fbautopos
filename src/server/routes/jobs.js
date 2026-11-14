import { Router } from 'express'
import * as jobRunner from '../jobRunner.js'
import { startScheduler, stopScheduler } from '../scheduler.js'
import { store } from '../store.js'

const router = Router()

router.post('/run', async (req, res) => {
  try {
    const { dryRun, limit } = req.body || {}
    const summary = await jobRunner.runNow({
      dryRun: !!dryRun,
      limit: limit ? Number(limit) : undefined
    })
    res.json(summary)
  } catch (e) {
    res.status(409).json({ error: String(e.message || e) })
  }
})

router.post('/login', async (req, res) => {
  try {
    const result = await jobRunner.login()
    res.json(result)
  } catch (e) {
    res.status(409).json({ error: String(e.message || e) })
  }
})

router.post('/discover', async (req, res) => {
  try {
    const result = await jobRunner.discover()
    res.json(result)
  } catch (e) {
    res.status(409).json({ error: String(e.message || e) })
  }
})

router.post('/scheduler/start', async (req, res) => {
  try {
    const settings = await store.getSettings()
    res.json(startScheduler(settings))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

router.post('/scheduler/stop', (req, res) => {
  res.json(stopScheduler())
})

export default router