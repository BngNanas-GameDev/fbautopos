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
  const [selected, setSelected] = useState(() => new Set())

  const load = () => {
    setLoading(true)
    api
      .getGroups()
      .then((g) => {
        setGroups(g)
        setSelected((prev) => {
          const ids = new Set(g.map((x) => String(x.id)))
          const next = new Set([...prev].filter((id) => ids.has(id)))
          return next
        })
      })
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

  const visibleIds = filtered.map((g) => String(g.id))
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const someSelected = visibleIds.some((id) => selected.has(id))
  const selectedCount = selected.size

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const key = String(id)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

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
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(String(g.id))
        return next
      })
      refresh()
    } catch (e) {
      notify('error', String(e.message || e))
    }
  }

  const bulkDelete = async () => {
    if (selectedCount === 0) return
    const ids = [...selected]
    if (!window.confirm(`Delete ${ids.length} selected group(s)? This only removes them from the list, not from Facebook.`)) return
    setBulkBusy(true)
    try {
      await api.bulkDeleteGroups(ids)
      setGroups((prev) => prev.filter((g) => !selected.has(String(g.id))))
      clearSelection()
      refresh()
      notify('ok', `Deleted ${ids.length} group(s).`)
    } catch (e) {
      notify('error', String(e.message || e))
    } finally {
      setBulkBusy(false)
    }
  }

  const bulk = async (enabled) => {
    if (!filtered.length) return
    setBulkBusy(true)
    try {
      const ids = selectedCount > 0 ? [...selected] : filtered.map((g) => g.id)
      await api.bulkGroups(ids, enabled)
      setGroups((prev) =>
        prev.map((g) => (selectedCount > 0 && !selected.has(String(g.id)) ? g : { ...g, enabled }))
      )
      refresh()
      notify('ok', `${enabled ? 'Enabled' : 'Disabled'} ${ids.length} group(s).`)
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
              {selectedCount > 0 ? `Enable selected (${selectedCount})` : 'Enable shown'}
            </button>
            <button className="btn" disabled={bulkBusy || !filtered.length} onClick={() => bulk(false)}>
              {selectedCount > 0 ? `Disable selected (${selectedCount})` : 'Disable shown'}
            </button>
            <button
              className="btn danger"
              disabled={bulkBusy || selectedCount === 0}
              onClick={bulkDelete}
            >
              <Icon name="trash" size={15} />
              Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
            <button className="btn primary" disabled={discovering} onClick={discover}>
              <Icon name="refresh" size={16} />
              {discovering ? 'Discovering…' : 'Discover groups'}
            </button>
          </div>
        </div>

        {selectedCount > 0 && (
          <div className="selection-bar">
            <span>
              <b>{selectedCount}</b> selected
            </span>
            <button className="btn small" onClick={toggleSelectAll}>
              {allVisibleSelected ? 'Deselect shown' : 'Select all shown'}
            </button>
            <button className="btn small" onClick={clearSelection}>
              Clear
            </button>
            <button className="btn small danger" disabled={bulkBusy} onClick={bulkDelete}>
              <Icon name="trash" size={13} /> Delete selected
            </button>
          </div>
        )}

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
                  <th className="col-check">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => el && (el.indeterminate = someSelected && !allVisibleSelected)}
                      onChange={toggleSelectAll}
                      aria-label="Select all shown"
                    />
                  </th>
                  <th className="col-toggle">On</th>
                  <th>Group</th>
                  <th>Last posted</th>
                  <th className="col-url">URL</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const isSel = selected.has(String(g.id))
                  return (
                    <tr key={g.id} className={`${g.enabled === false ? 'row-off' : ''} ${isSel ? 'row-selected' : ''}`}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(g.id)}
                          aria-label={`Select ${g.name || g.id}`}
                        />
                      </td>
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}