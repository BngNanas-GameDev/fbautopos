import { Router } from 'express'
import { store } from '../store.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const [groups, state] = await Promise.all([store.getGroups(), store.getState()])
    res.json(
      groups.map((g) => ({
        ...g,
        lastPosted: state.lastPostByGroup[g.id] || null
      }))
    )
  } catch (e) {
    next(e)
  }
})

router.post('/bulk', async (req, res, next) => {
  try {
    const { ids, enabled } = req.body || {}
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' })
    const groups = await store.getGroups()
    const set = new Set(ids.map(String))
    const next_ = groups.map((g) => (set.has(String(g.id)) ? { ...g, enabled: !!enabled } : g))
    await store.setGroups(next_)
    res.json({ updated: ids.length })
  } catch (e) {
    next(e)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const groups = await store.getGroups()
    const idx = groups.findIndex((g) => g.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Group not found' })
    groups[idx] = { ...groups[idx], ...req.body, id: groups[idx].id }
    await store.setGroups(groups)
    res.json(groups[idx])
  } catch (e) {
    next(e)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const groups = await store.getGroups()
    const next_ = groups.filter((g) => g.id !== req.params.id)
    await store.setGroups(next_)
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

export default router