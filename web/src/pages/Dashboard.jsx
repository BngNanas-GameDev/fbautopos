import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import Icon from '../components/Icons.jsx'

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString() : '—'
}

function countdown(iso, now) {
  if (!iso) return '—'
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'due now'
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `in ${d}d ${h % 24}h`
  if (h > 0) return `in ${h}h ${m % 60}m`
  return `in ${m}m`
}

function Stat({ icon, tone, label, value, sub }) {
  return (
    <div className="stat">
      <div className={`stat-icon ${tone || ''}`}>
        <Icon name={icon} size={20} />
      </div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard({ status, refresh, run, notify }) {
  const [busy, setBusy] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const job = status?.job || {}
  const sched = status?.scheduler || {}
  const last = job.lastResult
  const disabled = job.running || !!busy

  const guard = async (name, fn, okMsg) => {
    setBusy(name)
    try {
      await fn()
      if (okMsg) notify('ok', okMsg)
      refresh()
    } catch (e) {
      notify('error', String(e.message || e))
    } finally {
      setBusy(null)
    }
  }

  const lastRun = last && Array.isArray(last.results) ? last : null
  const loginResult = last && typeof last.ok === 'boolean' && !Array.isArray(last.results) ? last : null
  const discoverResult = last && last.discovered != null ? last : null

  return (
    <div className="stack">
      <div className="stats">
        <Stat
          icon="clock"
          tone={sched.running ? 'green' : 'gray'}
          label="Scheduler"
          value={sched.running ? 'Armed' : 'Stopped'}
          sub={
            sched.running
              ? `${sched.mode === 'cron' ? sched.cronExpr : `every ${sched.intervalHours}h`} · ${
                  sched.nextRun ? countdown(sched.nextRun, now) : '—'
                }`
              : 'manual runs only'
          }
        />
        <Stat
          icon="activity"
          tone={job.running ? 'amber' : 'gray'}
          label="Current job"
          value={job.running ? `Running · ${job.type}` : 'Idle'}
          sub={job.running ? `started ${fmt(job.startedAt)}` : 'no job in progress'}
        />
        <Stat
          icon="users"
          tone="blue"
          label="Groups"
          value={`${status?.groupCount ?? 0} / ${status?.groupTotal ?? 0}`}
          sub="enabled / total discovered"
        />
        <Stat
          icon="send"
          tone={lastRun && lastRun.failed ? 'red' : 'green'}
          label="Last run"
          value={
            lastRun
              ? `${lastRun.posted ?? 0} posted${lastRun.failed ? ` · ${lastRun.failed} failed` : ''}`
              : discoverResult
              ? `${discoverResult.discovered} found`
              : loginResult
              ? loginResult.ok
                ? 'Logged in'
                : 'Login failed'
              : '—'
          }
          sub={job.finishedAt ? fmt(job.finishedAt) : 'not run yet'}
        />
      </div>

      <div className="cols">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Controls</h2>
              <p className="card-sub">Each run opens a headed browser window.</p>
            </div>
          </div>
          <div className="btn-grid">
            <button className="btn primary" disabled={disabled} onClick={() => { setBusy('run'); run({}).finally(() => setBusy(null)) }}>
              <Icon name="play" size={16} />
              Run now
            </button>
            <button className="btn" disabled={disabled} onClick={() => { setBusy('dry'); run({ dryRun: true }).finally(() => setBusy(null)) }}>
              <Icon name="activity" size={16} />
              Dry run
            </button>
            <button className="btn" disabled={disabled} onClick={() => guard('login', () => api.login(), 'Login window closed.')}>
              <Icon name="login" size={16} />
              {busy === 'login' ? 'Waiting for login…' : 'Login to Facebook'}
            </button>
            <button className="btn" disabled={disabled} onClick={() => guard('discover', () => api.discover(), 'Group discovery finished.')}>
              <Icon name="refresh" size={16} />
              {busy === 'discover' ? 'Discovering…' : 'Discover groups'}
            </button>
          </div>
          <div className="divider" />
          <div className="schedule-controls">
            <div>
              <div className="mini-label">Scheduler</div>
              <div className="mini-value">{sched.running ? 'Running automatically' : 'Paused'}</div>
            </div>
            {sched.running ? (
              <button className="btn danger" disabled={disabled} onClick={() => guard('stop', () => api.stopScheduler(), 'Scheduler stopped.')}>
                <Icon name="pause" size={16} />
                Stop schedule
              </button>
            ) : (
              <button className="btn" disabled={disabled} onClick={() => guard('start', () => api.startScheduler(), 'Scheduler started.')}>
                <Icon name="power" size={16} />
                Start schedule
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Recent activity</h2>
              <p className="card-sub">Latest per-group results from this account.</p>
            </div>
          </div>
          {status?.history?.length ? (
            <ul className="activity">
              {status.history.slice(0, 8).map((h, i) => (
                <li key={i} className="activity-item">
                  <span className={`dot-badge ${h.ok ? 'ok' : 'bad'}`}>
                    <Icon name={h.ok ? 'check' : 'x'} size={12} />
                  </span>
                  <div className="activity-main">
                    <div className="activity-name">{h.name || h.groupId}</div>
                    {h.reason && <div className="activity-reason">{h.reason}</div>}
                  </div>
                  <time className="activity-time">{new Date(h.ts).toLocaleTimeString()}</time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <Icon name="activity" size={26} />
              <span>No activity yet. Run a dry run to verify the flow.</span>
            </div>
          )}
        </section>
      </div>

      {lastRun && lastRun.results.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Last run details</h2>
              <p className="card-sub">
                {lastRun.dryRun ? 'Dry run' : 'Run'} · {fmt(lastRun.startedAt)} → {fmt(lastRun.finishedAt)}
              </p>
            </div>
            <span className={`badge ${lastRun.aborted ? 'bad' : lastRun.failed ? 'warn' : 'ok'}`}>
              {lastRun.posted ?? 0} posted · {lastRun.failed ?? 0} failed
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {lastRun.results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.group?.name || r.group?.id || '—'}</td>
                    <td>
                      <span className={`badge ${r.ok ? 'ok' : 'bad'}`}>
                        {r.ok ? 'Posted' : 'Failed'}
                      </span>
                    </td>
                    <td className="muted small">{r.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}