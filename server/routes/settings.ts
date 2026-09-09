/** Rotas de configurações da app (montadas em `/api/settings`). Linha única. */
import { Router } from 'express'

import { type SettingsPatch,settingsRepo } from '../db/repositories/settings'
import { erroDeRota } from '../lib/erroDeRota'
import { type RecusaDePosse,recusaDePosse } from '../lib/posseDeCosmeticos'
import { responderErro } from '../lib/respostaDeErro'
import { parseOr400,settingsPatchSchema } from '../validation'

/**
 * Os campos do blob `ui` que nomeiam um item do catálogo, e o tipo de cada um.
 *
 * Só estes: o blob também carrega onboarding, idioma e preferências de captura, que não são
 * itens e não têm dono. Um campo novo aqui é uma decisão consciente de "isto se compra".
 */
const CAMPOS_DE_ITEM: Array<[chave: string, tipo: string]> = [
  ['theme', 'tema'],
  ['fonte', 'fonte'],
  ['menuPosition', 'posicao'],
  ['particulas', 'particulas'],
  ['pack', 'pack'],
  ['cursor', 'cursor'],
  ['rastro', 'rastro'],
]

async function conferirPosseDoPatchDeUi(userId: Parameters<typeof recusaDePosse>[0], ui: unknown): Promise<RecusaDePosse | null> {
  if (!ui || typeof ui !== 'object') return null
  const blob = ui as Record<string, unknown>
  for (const [chave, tipo] of CAMPOS_DE_ITEM) {
    const alvo = blob[chave]
    if (typeof alvo !== 'string' || !alvo) continue
    const recusa = await recusaDePosse(userId, tipo, alvo)
    if (recusa) return recusa
  }
  return null
}

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

    /**
     * A POSSE É CONFERIDA AQUI, e não só na tela (auditoria de 2026-09-07, achado A11).
     *
     * Esta rota gravava `ui.theme` validando apenas a FORMA: um POST com
     * `{"ui":{"theme":"premium"}}` equipava o tema mais caro do catálogo sem nível, sem seeds e
     * sem compra. Toda a régua vivia no cliente, e régua no cliente é sugestão — a rota está
     * aberta a quem souber o caminho. Num app que vende esses itens, isso é a diferença entre um
     * catálogo e uma vitrine.
     */
    const recusa = await conferirPosseDoPatchDeUi(req.userId, patch.ui)
    if (recusa) {
      responderErro(res, 403, `você ainda não tem esse item: ${recusa.motivo}`, 'item_nao_possuido', { ...recusa })
      return
    }
    res.json(await settingsRepo.update(req.userId, patch))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'settings_route_error', route: req.path, requestId: req.requestId }) })
  }
})
