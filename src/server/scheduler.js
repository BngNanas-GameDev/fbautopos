import cron from 'node-cron'
import * as runner from './jobRunner.js'
import { logger } from './logger.js'

let timer = null
let cronTask = null
let current = {
  running: false,
  mode: null,
  nextRun: null,
  intervalHours: null,
  cronExpr: null
}

async function tick() {
  if (runner.getJobStatus().running) {
    logger.warn('Scheduler tick skipped: a job is already running.')
    return
  }
  logger.info('Scheduler tick: starting posting pass.')
  try {
    const summary = await runner.runNow()
    logger.info(`Scheduled run: ${summary.posted} posted, ${summary.failed} failed.`)
  } catch (err) {
    logger.error(`Scheduled run failed: ${String(err).split('\n')[0]}`)
  }
}

export function startScheduler(settings) {
  stopScheduler()
  const mode = settings.scheduleMode || 'hours'

  if (mode === 'cron') {
    const expr = settings.cronExpr || '0 9 * * *'
    if (!cron.validate(expr)) {
      logger.error(`Invalid cron expression: ${expr}`)
      return getSchedulerStatus()
    }
    cronTask = cron.schedule(expr, tick)
    current = { running: true, mode: 'cron', cronExpr: expr, nextRun: null, intervalHours: null }
  } else {
    const h = Number(settings.intervalHours) || 6
    const ms = h * 3600 * 1000
    timer = setInterval(tick, ms)
    current = {
      running: true,
      mode: 'hours',
      intervalHours: h,
      cronExpr: null,
      nextRun: new Date(Date.now() + ms).toISOString()
    }
  }

  logger.info(`Scheduler started (mode=${mode}).`)
  return getSchedulerStatus()
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (cronTask) {
    cronTask.stop()
    cronTask = null
  }
  if (current.running) {
    current = { ...current, running: false, nextRun: null }
    logger.info('Scheduler stopped.')
  }
  return getSchedulerStatus()
}

export function getSchedulerStatus() {
  return { ...current }
}