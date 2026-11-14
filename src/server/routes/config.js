import { Router } from 'express'
import { store, updateSettings } from '../store.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const [content, settings] = await Promise.all([store.getContent(), store.getSettings()])
    res.json({ content, settings })
  } catch (e) {
    next(e)
  }
})

router.put('/', async (req, res, next) => {
  try {
    const { content, settings } = req.body || {}
    if (content && typeof content === 'object') {
      await store.setContent({ ...(await store.getContent()), ...content })
    }
    if (settings && typeof settings === 'object') {
      await updateSettings(settings)
    }
    const [c, s] = await Promise.all([store.getContent(), store.getSettings()])
    res.json({ content: c, settings: s })
  } catch (e) {
    next(e)
  }
})

export default router