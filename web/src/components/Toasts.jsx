import React from 'react'
import Icon from './Icons.jsx'

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon
            name={t.kind === 'error' ? 'alert' : t.kind === 'ok' ? 'check' : 'activity'}
            size={16}
          />
          <span className="toast-msg">{t.msg}</span>
          <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}