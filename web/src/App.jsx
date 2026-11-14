import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import Icon from './components/Icons.jsx'
import LogConsole from './components/LogConsole.jsx'
import Toasts from './components/Toasts.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Content from './pages/Content.jsx'
import GroupsPage from './pages/Groups.jsx'
import Schedule from './pages/Schedule.jsx'

const NAV = [
  {
    key: 'Dashboard',
    label: 'Dashboard',
    icon: 'grid',
    title: 'Dashboard',
    subtitle: 'Status, controls and recent activity'
  },
  {
    key: 'Content',
    label: 'Content',
    icon: 'pen',
    title: 'Post content',
    subtitle: 'The text and link sent to every group'
  },
  {
    key: 'Groups',
    label: 'Groups',
    icon: 'users',
    title: 'Groups',
    subtitle: 'Auto-discovered groups and which ones to post to'
  },
  {
    key: 'Schedule',
    label: 'Schedule',
    icon: 'clock',
    title: 'Schedule & limits',
    subtitle: 'Cadence, pacing and safety options'
  }
]

export default function App() {
  const [tab, setTab] = useState('Dashboard')
  const [status, setStatus] = useState(null)
  const [logs, setLogs] = useState([])
  const [toasts, setToasts] = useState([])
  const toastTimers = useRef(new Map())

  const notify = useCallback((kind, msg) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, kind, msg }].slice(-4))
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      toastTimers.current.delete(id)
    }, 5200)
    toastTimers.current.set(id, timer)
  }, [])

  const dismiss = useCallback((id) => {
    const timer = toastTimers.current.get(id)
    if (timer) clearTimeout(timer)
    toastTimers.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getStatus())
    } catch {
      /* silent poll failure */
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    const es = new EventSource('/api/status/logs/stream')
    es.onmessage = (ev) => {
      try {
        const entry = JSON.parse(ev.data)
        setLogs((prev) => {
          const next = [...prev, entry]
          return next.length > 400 ? next.slice(next.length - 400) : next
        })
      } catch {
        /* ignore */
      }
    }
    return () => es.close()
  }, [])

  const active = NAV.find((n) => n.key === tab) || NAV[0]
  const job = status?.job || {}
  const sched = status?.scheduler || {}

  const run = async (opts = {}) => {
    notify('info', 'Starting run…')
    try {
      const summary = await api.run(opts)
      if (summary?.aborted) notify('error', `Run aborted after ${summary.posted ?? 0} post(s).`)
      else if (summary?.failed) notify('error', `Run finished: ${summary.posted ?? 0} posted, ${summary.failed} failed.`)
      else notify('ok', `Run finished: ${summary?.posted ?? 0} posted.`)
      refresh()
    } catch (e) {
      notify('error', String(e.message || e))
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">f</div>
          <div className="brand-text">
            <strong>Autopost</strong>
            <span>Facebook groups</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? 'navitem active' : 'navitem'}
              onClick={() => setTab(item.key)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button
            className={`account ${status?.identity?.name ? 'on' : ''}`}
            onClick={() => setTab('Dashboard')}
            title={status?.identity?.name ? 'Logged in' : 'Not logged in'}
          >
            {status?.identity?.name ? (
              <span className="account-avatar">
                {status.identity.name.trim().charAt(0).toUpperCase()}
              </span>
            ) : (
              <span className="account-avatar muted">?</span>
            )}
            <span className="account-meta">
              <span className="account-label">Account</span>
              <span className="account-name">
                {status?.identity?.name || 'Not logged in'}
              </span>
            </span>
          </button>
          <div className="sched-state">
            <span className={`pulse ${sched.running ? 'on' : 'off'}`} />
            <div>
              <div className="sched-label">{sched.running ? 'Scheduler armed' : 'Scheduler stopped'}</div>
              <div className="sched-sub">
                {sched.running
                  ? sched.mode === 'cron'
                    ? sched.cronExpr
                    : `every ${sched.intervalHours}h`
                  : 'manual mode'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="pagehead">
          <div className="pagehead-text">
            <h1>{active.title}</h1>
            <p>{active.subtitle}</p>
          </div>
          <div className="pagehead-side">
            <div className={`statusbadge ${job.running ? 'working' : sched.running ? 'armed' : 'idle'}`}>
              <span className="pulse" />
              {job.running ? `Working · ${job.type}` : sched.running ? 'Scheduled' : 'Idle'}
            </div>
            <button className="iconbtn bordered" title="Refresh" onClick={refresh}>
              <Icon name="refresh" size={16} />
            </button>
          </div>
        </header>

        <main className="page">
          {tab === 'Dashboard' && (
            <Dashboard status={status} refresh={refresh} run={run} notify={notify} />
          )}
          {tab === 'Content' && <Content notify={notify} />}
          {tab === 'Groups' && <GroupsPage notify={notify} refresh={refresh} />}
          {tab === 'Schedule' && (
            <Schedule status={status} refresh={refresh} notify={notify} />
          )}
        </main>

        <LogConsole logs={logs} />
      </div>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}