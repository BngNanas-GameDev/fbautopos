const BASE = '/api'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  getStatus: () => req('/status'),
  getConfig: () => req('/config'),
  saveConfig: (body) => req('/config', { method: 'PUT', body: JSON.stringify(body) }),

  getGroups: () => req('/groups'),
  updateGroup: (id, body) => req(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  bulkGroups: (ids, enabled) =>
    req('/groups/bulk', { method: 'POST', body: JSON.stringify({ ids, enabled }) }),
  deleteGroup: (id) => req(`/groups/${id}`, { method: 'DELETE' }),

  run: (body = {}) => req('/jobs/run', { method: 'POST', body: JSON.stringify(body) }),
  login: () => req('/jobs/login', { method: 'POST' }),
  discover: () => req('/jobs/discover', { method: 'POST' }),

  startScheduler: () => req('/jobs/scheduler/start', { method: 'POST' }),
  stopScheduler: () => req('/jobs/scheduler/stop', { method: 'POST' }),

  getLogs: () => req('/status/logs')
}