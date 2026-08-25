/** Rotas de configurações da app (montadas em `/api/settings`). Linha única. */
import { Router } from 'express'
import { settingsRepo, type SettingsPatch } from '../db/repositories/settings'
import { erroDeRota } from '../lib/erroDeRota'
import { settingsPatchSchema, parseOr400 } from '../validation'

export const settingsRouter = Router()

settingsRouter.get('/', async (req, res) => {
  res.json(await settingsRepo.ensure(req.userId))
})

settingsRouter.put('/', async (req, res) => {
  // P2-1: `ui` ia cru para JSON.stringify — um blob de até 5mb por usuário.
  const body = parseOr400(settingsPatchSchema, req.body, res)
  if (!body) return
  try {
    const patch: SettingsPatch = {}
    if ('activeProfileId' in body) patch.activeProfileId = body.activeProfileId
    if ('targetLanguage' in body) patch.targetLanguage = body.targetLanguage
    if ('ui' in body) patch.ui = body.ui
    res.json(await settingsRepo.update(req.userId, patch))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'settings_route_error', route: req.path, requestId: req.requestId }) })
  }
})
