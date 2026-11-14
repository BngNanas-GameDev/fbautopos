import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import Icon from '../components/Icons.jsx'

function Field({ label, hint, children, error }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

function Switch({ checked, onChange, label, hint }) {
  return (
    <button type="button" className="toggle" onClick={() => onChange(!checked)}>
      <span className={`switch ${checked ? 'on' : ''}`}><span className="knob" /></span>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </span>
    </button>
  )
}

export default function Schedule({ status, refresh, notify }) {
  const [s, setS] = useState(null)
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getConfig()
      .then(({ settings }) => {
        setS(settings)
        setSaved(settings)
      })
      .catch((e) => notify('error', String(e.message || e)))
  }, [notify])

  const set = (k, v) => setS((prev) => ({ ...prev, [k]: v }))
  const dirty = s && saved && JSON.stringify(s) !== JSON.stringify(saved)

  const errors = useMemo(() => {
    if (!s) return {}
    const e = {}
    if (s.scheduleMode === 'hours' && (!Number.isFinite(s.intervalHours) || s.intervalHours < 1)) {
      e.intervalHours = 'Must be at least 1 hour.'
    }
    if (s.scheduleMode === 'cron') {
      const parts = String(s.cronExpr || '').trim().split(/\s+/)
      if (parts.length < 5) e.cronExpr = 'Use a 5-field cron expression, e.g. 0 9 * * *'
    }
    if (!Number.isFinite(s.maxGroupsPerRun) || s.maxGroupsPerRun < 1) {
      e.maxGroupsPerRun = 'Must be at least 1.'
    }
    if (!Number.isFinite(s.minGapMinutes) || s.minGapMinutes < 0) {
      e.minGapMinutes = 'Cannot be negative.'
    }
    return e
  }, [s])

  const valid = Object.keys(errors).length === 0

  const save = async () => {
    if (!valid) {
      notify('error', 'Fix the highlighted fields first.')
      return
    }
    setSaving(true)
    try {
      const res = await api.saveConfig({ settings: s })
      setS(res.settings)
      setSaved(res.settings)
      notify('ok', 'Settings saved. Restart the scheduler to apply cadence changes.')
      refresh()
    } catch (e) {
      notify('error', String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const toggleSched = async () => {
    try {
      if (status?.scheduler?.running) {
        await api.stopScheduler()
        notify('ok', 'Scheduler stopped.')
      } else {
        if (valid) {
          const res = await api.saveConfig({ settings: s })
          setS(res.settings)
          setSaved(res.settings)
        }
        await api.startScheduler()
        notify('ok', 'Scheduler started.')
      }
      refresh()
    } catch (e) {
      notify('error', String(e.message || e))
    }
  }

  if (!s) return <div className="card muted">Loading…</div>
  const sched = status?.scheduler || {}

  return (
    <div className="cols schedule-cols">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Cadence</h2>
            <p className="card-sub">How often a posting pass runs.</p>
          </div>
          {dirty && <span className="badge warn">Unsaved</span>}
        </div>

        <div className="segmented wide">
          <button
            className={s.scheduleMode === 'hours' ? 'seg active' : 'seg'}
            onClick={() => set('scheduleMode', 'hours')}
          >
            Every N hours
          </button>
          <button
            className={s.scheduleMode === 'cron' ? 'seg active' : 'seg'}
            onClick={() => set('scheduleMode', 'cron')}
          >
            Cron expression
          </button>
        </div>

        {s.scheduleMode === 'hours' ? (
          <Field label="Interval (hours)" error={errors.intervalHours}>
            <input
              type="number"
              min="1"
              value={s.intervalHours}
              onChange={(e) => set('intervalHours', Number(e.target.value))}
            />
          </Field>
        ) : (
          <Field label="Cron expression" hint="minute hour day month weekday" error={errors.cronExpr}>
            <input value={s.cronExpr} onChange={(e) => set('cronExpr', e.target.value)} placeholder="0 9 * * *" />
          </Field>
        )}

        <div className="form-grid">
          <Field label="Max groups per run" error={errors.maxGroupsPerRun}>
            <input
              type="number"
              min="1"
              value={s.maxGroupsPerRun}
              onChange={(e) => set('maxGroupsPerRun', Number(e.target.value))}
            />
          </Field>
          <Field label="Min gap between groups (min)" error={errors.minGapMinutes}>
            <input
              type="number"
              min="0"
              value={s.minGapMinutes}
              onChange={(e) => set('minGapMinutes', Number(e.target.value))}
            />
          </Field>
        </div>

        <p className="hint">
          Groups posted within the interval are skipped automatically, so runs won’t double-post.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Behavior</h2>
            <p className="card-sub">Safety and stealth toggles.</p>
          </div>
        </div>

        <div className="toggles">
          <Switch
            checked={!!s.dryRun}
            onChange={(v) => set('dryRun', v)}
            label="Dry run"
            hint="Compose posts but never click Post."
          />
          <Switch
            checked={!!s.headless}
            onChange={(v) => set('headless', v)}
            label="Headless browser"
            hint="Not recommended — Facebook detects it more easily."
          />
          <Switch
            checked={s.typing !== false}
            onChange={(v) => set('typing', v)}
            label="Human-like typing"
            hint="Types the post gradually instead of instant fill."
          />
          <Switch
            checked={!!s.warmup}
            onChange={(v) => set('warmup', v)}
            label="Warm-up browsing"
            hint="Browses the feed before a fresh profile posts (placeholder)."
          />
        </div>

        <div className="divider" />

        <div className="summary">
          <div className="summary-row">
            <span>Current scheduler</span>
            <b className={sched.running ? 'armed' : 'idle'}>{sched.running ? 'Armed' : 'Stopped'}</b>
          </div>
          <div className="summary-row">
            <span>Planned cadence</span>
            <b>{s.scheduleMode === 'cron' ? s.cronExpr : `every ${s.intervalHours}h`}</b>
          </div>
          <div className="summary-row">
            <span>Per run</span>
            <b>up to {s.maxGroupsPerRun} groups · {s.minGapMinutes} min gap</b>
          </div>
        </div>

        <div className="btn-row">
          <button className="btn primary" disabled={saving || !valid || !dirty} onClick={save}>
            <Icon name="check" size={16} />
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button className={sched.running ? 'btn danger' : 'btn'} onClick={toggleSched}>
            <Icon name={sched.running ? 'pause' : 'power'} size={16} />
            {sched.running ? 'Stop scheduler' : 'Start scheduler'}
          </button>
        </div>
      </section>
    </div>
  )
}