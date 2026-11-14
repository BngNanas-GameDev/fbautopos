import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..', '..')
export const CONFIG_DIR = path.join(ROOT, 'config')

const DEFAULTS = {
  'content.json': {
    message: 'Your post text goes here. Paste a link below and Facebook will attach a preview.',
    link: 'https://example.com'
  },
  'settings.json': {
    scheduleMode: 'hours',
    intervalHours: 6,
    cronExpr: '0 9 * * *',
    maxGroupsPerRun: 10,
    minGapMinutes: 3,
    dryRun: false,
    headless: false,
    warmup: false,
    typing: true
  },
  'groups.json': [],
  'state.json': { lastPostByGroup: {}, history: [] }
}

async function ensureFile(name) {
  const file = path.join(CONFIG_DIR, name)
  if (!existsSync(file)) {
    await mkdir(CONFIG_DIR, { recursive: true })
    await writeFile(file, JSON.stringify(DEFAULTS[name], null, 2))
  }
  return file
}

export async function readJSON(name) {
  const file = await ensureFile(name)
  // Strip a UTF-8 BOM if present (PowerShell/Notepad can add one).
  const raw = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '')
  if (!raw.trim()) return structuredClone(DEFAULTS[name])
  return JSON.parse(raw)
}

export async function writeJSON(name, data) {
  const file = await ensureFile(name)
  const tmp = file + '.tmp'
  await writeFile(tmp, JSON.stringify(data, null, 2))
  await rename(tmp, file)
  return data
}

export const store = {
  getContent: () => readJSON('content.json'),
  setContent: (d) => writeJSON('content.json', d),

  getSettings: () => readJSON('settings.json'),
  setSettings: (d) => writeJSON('settings.json', d),

  getGroups: () => readJSON('groups.json'),
  setGroups: (d) => writeJSON('groups.json', d),

  getState: () => readJSON('state.json'),
  setState: (d) => writeJSON('state.json', d)
}

// Merge settings patch (only known keys) and persist.
export async function updateSettings(patch) {
  const current = await store.getSettings()
  const next = { ...current }
  for (const key of Object.keys(current)) {
    if (key in patch) next[key] = patch[key]
  }
  return store.setSettings(next)
}