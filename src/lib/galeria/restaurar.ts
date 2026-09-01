/**
 * VOLTAR AO VISUAL ORIGINAL — o direito de desfazer (auditoria ux-v2 §3/§4.3).
 *
 * Um clique devolve os padrões do app SEM tocar na posse: o que foi desbloqueado ou comprado
 * continua desbloqueado — reset é sobre o que está VESTIDO, nunca sobre o guarda-roupa.
 * Antes disto, voltar ao padrão dependia de "ganhar" o item-padrão no passe (Cursor do sistema,
 * Rastro desligado) — um DIREITO vendido como recompensa.
 *
 * Tema e fonte moram no React (props de App) e são devolvidos ao chamador em vez de setados
 * aqui — o mesmo contrato de `equiparItem`, que também não é dono do estado do tema.
 */
import { DEFAULT_THEME, DEFAULT_FONTE } from '../theme'
import type { ThemeType, FonteType } from '../appearance'
import { setParticulas } from '../particulas'
import { setPack } from '../particulas'
import { setCursor } from '../cursores'
import { setRastro } from '../rastroDoMouse'

export const VISUAL_PADRAO = {
  tema: DEFAULT_THEME as ThemeType,
  fonte: DEFAULT_FONTE as FonteType,
  particulas: 'tema' as const,
  pack: 'classico',
  cursor: 'padrao',
  rastro: 'off',
} as const

export function restaurarVisualPadrao(): { tema: ThemeType; fonte: FonteType } {
  setParticulas(VISUAL_PADRAO.particulas)
  setPack(VISUAL_PADRAO.pack)
  setCursor(VISUAL_PADRAO.cursor)
  setRastro(VISUAL_PADRAO.rastro)
  // A paleta ativa é um apontador para o tema `custom`; sem ela, o tema padrão volta limpo.
  try { localStorage.removeItem('babel.paleta_ativa') } catch { /* sem storage */ }
  return { tema: VISUAL_PADRAO.tema, fonte: VISUAL_PADRAO.fonte }
}
