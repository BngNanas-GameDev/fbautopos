import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

import { logger } from './logger.js'
import { store } from './store.js'
import { startScheduler } from './scheduler.js'

import configRoutes from './routes/config.js'
import groupsRoutes from './routes/groups.js'
import jobsRoutes from './routes/jobs.js'
import statusRoutes from './routes/status.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '..', '..', 'web', 'dist')

const app = express()
app.use(express.json())

// API
app.use('/api/config', configRoutes)
app.use('/api/groups', groupsRoutes)
app.use('/api/jobs', jobsRoutes)
app.use('/api/status', statusRoutes)

// Static frontend (built by `npm run build`)
app.use(express.static(DIST_DIR))

// SPA fallback for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
    if (err) next(err)
  })
})

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Request error: ${String(err.stack || err)}`)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: String(err.message || err) })
})

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '127.0.0.1'

app.listen(PORT, HOST, async () => {
  logger.info(`Server listening on http://${HOST}:${PORT}`)
  try {
    const settings = await store.getSettings()
    startScheduler(settings)
    logger.info(`Scheduler auto-started (mode=${settings.scheduleMode}, every ${settings.intervalHours}h).`)
  } catch (err) {
    logger.error(`Failed to start scheduler: ${String(err).split('\n')[0]}`)
  }
})