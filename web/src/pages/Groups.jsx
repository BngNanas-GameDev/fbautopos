import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import Icon from '../components/Icons.jsx'

function relative(iso) {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return 'just now'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function Groups({ notify, refresh }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = () => {
    setLoading(true)
    api
      .getGroups()
      .then(setGroups)
      .catch((e) => notify('error', String(e.message || e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [notify])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups.filter((g) => {
      if (filter === 'enabled' && g.enabled === false) return false
      if (filter === 'disabled' && g.enabled !== false) return false
      if (!q) return true
      return (g.name || '').toLowerCase().includes(q) || String(g.id).toLowerCase().includes(q)
    })
  }, [groups, query, filter])

  const counts = useMemo(
    () => ({
      all: groups.length,
      enabled: groups.filter((g) => g.enabled !== false).length,
      disabled: groups.filter((g) => g.enabled === false).length
    }),
    [groups]
  )

  const toggle = async (g) => {
    try {
      const updated = await api.updateGroup(g.id, { enabled: !g.enabled })
      setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, ...updated } : x)))
      refresh()
    } catch (e) {
      notify('error', String(e.message || e))
    }
  }

  const remove = async (g) => {
    if (!window.confirm(`Remove "${g.name || g.id}" from the list?`)) return
    try {
      await api.deleteGroup(g.id)
      setGroups((prev) => prev.filter((x) => x.id !== g.id))
      refresh()
    } catch (e) {
      notify('error', String(e.message || e))
    }
  }

  const bulk = async (enabled) => {
    if (!filtered.length) return
    setBulkBusy(true)
    try {
      await api.bulkGroups(filtered.map((g) => g.id), enabled)
      setGroups((prev) =>
        prev.map((g) =>
          filtered.some((f) => f.id === g.id) ? { ...g, enabled } : g
        )
      )
      refresh()
      notify('ok', `${enabled ? 'Enabled' : 'Disabled'} ${filtered.length} group(s).`)
    } catch (e) {
      notify('error', String(e.message || e))
    } finally {
      setBulkBusy(false)
    }
  }

  const discover = async () => {
    setDiscovering(true)
    try {
      await api.discover()
      notify('ok', 'Discovery finished.')
      load()
      refresh()
    } catch (e) {
      notify('error', String(e.message || e))
    } finally {
      setDiscovering(false)
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="segmented">
              {[
                ['all', `All ${counts.all}`],
                ['enabled', `Enabled ${counts.enabled}`],
                ['disabled', `Disabled ${counts.disabled}`]
              ].map(([val, label]) => (
                <button
                  key={val}
                  className={filter === val ? 'seg active' : 'seg'}
                  onClick={() => setFilter(val)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="input-with-icon search">
              <Icon name="search" size={16} />
              <input
                placeholder="Search groups…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="toolbar-right">
            <button className="btn" disabled={bulkBusy || !filtered.length} onClick={() => bulk(true)}>
              Enable shown
            </button>
            <button className="btn" disabled={bulkBusy || !filtered.length} onClick={() => bulk(false)}>
              Disable shown
            </button>
            <button className="btn primary" disabled={discovering} onClick={discover}>
              <Icon name="refresh" size={16} />
              {discovering ? 'Discovering…' : 'Discover groups'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty"><span>Loading groups…</span></div>
        ) : groups.length === 0 ? (
          <div className="empty">
            <Icon name="users" size={30} />
            <strong>No groups discovered yet</strong>
            <span>Click “Discover groups” to scan the groups your account belongs to.</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <Icon name="search" size={28} />
            <span>No groups match your search.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table groups-table">
              <thead>
                <tr>
                  <th className="col-toggle">On</th>
                  <th>Group</th>
                  <th>Last posted</th>
                  <th className="col-url">URL</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.id} className={g.enabled === false ? 'row-off' : ''}>
                    <td>
                      <button
                        className={`switch ${g.enabled !== false ? 'on' : ''}`}
                        onClick={() => toggle(g)}
                        aria-label={g.enabled !== false ? 'Disable group' : 'Enable group'}
                      >
                        <span className="knob" />
                      </button>
                    </td>
                    <td>
                      <div className="group-name">{g.name || 'Untitled group'}</div>
                      <div className="group-id mono">{g.id}</div>
                    </td>
                    <td className="muted small">{relative(g.lastPosted)}</td>
                    <td className="col-url">
                      <a className="url-link" href={g.url} target="_blank" rel="noreferrer">
                        {g.url.replace('https://www.facebook.com', '')}
                      </a>
                    </td>
                    <td className="col-actions">
                      <button className="iconbtn danger" title="Remove" onClick={() => remove(g)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}