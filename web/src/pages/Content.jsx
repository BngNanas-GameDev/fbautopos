import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import Icon from '../components/Icons.jsx'

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export default function Content({ notify }) {
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const [saved, setSaved] = useState({ message: '', link: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getConfig()
      .then(({ content }) => {
        const c = { message: content.message || '', link: content.link || '' }
        setMessage(c.message)
        setLink(c.link)
        setSaved(c)
      })
      .catch((e) => notify('error', String(e.message || e)))
      .finally(() => setLoading(false))
  }, [notify])

  const dirty = message !== saved.message || link !== saved.link
  const host = useMemo(() => hostOf(link), [link])

  const save = async () => {
    setSaving(true)
    try {
      await api.saveConfig({ content: { message, link } })
      setSaved({ message, link })
      notify('ok', 'Content saved.')
    } catch (e) {
      notify('error', String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setMessage(saved.message)
    setLink(saved.link)
  }

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (dirty && !saving) save()
    }
  }

  if (loading) return <div className="card muted">Loading…</div>

  return (
    <div className="cols content-cols" onKeyDown={onKeyDown}>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Composer</h2>
            <p className="card-sub">The same post is sent to every enabled group.</p>
          </div>
          {dirty && <span className="badge warn">Unsaved</span>}
        </div>

        <label className="field">
          <div className="field-label">
            <span>Message</span>
            <span className="counter">{message.length} chars</span>
          </div>
          <textarea
            rows={8}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your post text…"
          />
        </label>

        <label className="field">
          <div className="field-label">
            <span>Link</span>
            {host && <span className="counter">{host}</span>}
          </div>
          <div className="input-with-icon">
            <Icon name="send" size={16} />
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com/article"
            />
          </div>
        </label>

        <p className="hint">
          Facebook generates the link preview automatically when the post is composed.
          Use <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save.
        </p>

        <div className="btn-row">
          <button className="btn primary" disabled={saving || !dirty} onClick={save}>
            <Icon name="check" size={16} />
            {saving ? 'Saving…' : 'Save content'}
          </button>
          <button className="btn" disabled={!dirty} onClick={reset}>
            Reset
          </button>
        </div>
      </section>

      <section className="card preview-card">
        <div className="card-head">
          <div>
            <h2>Preview</h2>
            <p className="card-sub">Approximation of the post as it will appear.</p>
          </div>
        </div>

        <div className="fb-post">
          <div className="fb-head">
            <div className="fb-avatar">Y</div>
            <div>
              <div className="fb-name">Your account</div>
              <div className="fb-meta">Just now · Group</div>
            </div>
          </div>
          <div className="fb-text">{message || <span className="muted">Your message will appear here…</span>}</div>
          {link && (
            <div className="fb-linkcard">
              <div className="fb-link-top">
                <span className="fb-link-domain">{host || link}</span>
              </div>
              <div className="fb-link-bottom">
                <div className="fb-link-title">{host || 'Link preview'}</div>
                <div className="fb-link-url">{link}</div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}