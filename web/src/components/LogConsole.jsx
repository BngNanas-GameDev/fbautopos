import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons.jsx'

const LEVELS = ['all', 'info', 'warn', 'error']

export default function LogConsole({ logs }) {
  const [level, setLevel] = useState('all')
  const [collapsed, setCollapsed] = useState(false)
  const [follow, setFollow] = useState(true)
  const viewRef = useRef(null)

  const filtered = logs.filter((l) => level === 'all' || l.level === level)

  useEffect(() => {
    if (follow && viewRef.current) {
      viewRef.current.scrollTop = viewRef.current.scrollHeight
    }
  }, [filtered.length, follow, collapsed])

  return (
    <section className={`logpanel ${collapsed ? 'collapsed' : ''}`}>
      <div className="logpanel-head">
        <button className="logpanel-title" onClick={() => setCollapsed((c) => !c)}>
          <Icon name="chevron" size={14} className={collapsed ? 'rot-180' : ''} />
          <span>Console</span>
          <span className="count">{logs.length}</span>
        </button>
        <div className="logfilters">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              className={level === lv ? 'logfilter active' : 'logfilter'}
              onClick={() => setLevel(lv)}
            >
              {lv}
            </button>
          ))}
        </div>
        <div className="logpanel-actions">
          <label className="follow">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            <span>Follow</span>
          </label>
          <button className="iconbtn" title="Collapse" onClick={() => setCollapsed((c) => !c)}>
            <Icon name="chevron" size={14} className={collapsed ? 'rot-180' : ''} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="logview" ref={viewRef}>
          {filtered.length === 0 && <div className="logline muted">Waiting for activity…</div>}
          {filtered.map((l, i) => (
            <div key={i} className={`logline ${l.level}`}>
              <span className="ts">{new Date(l.ts).toLocaleTimeString()}</span>
              <span className={`lvl ${l.level}`}>{l.level}</span>
              <span className="msg">{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}