/**
 * EQUIPAR EM UM LUGAR SÓ.
 *
 * Personalizar v3 (2026-08-28): Personalizar (peças), Loja ("Equipar agora") e o modal de
 * resgate chamam esta função — antes cada tela chamava os setters por conta própria, e a
 * centralização de ontem tinha acabado de tirar o terceiro caminho. Este é o único.
 *
 * Retorna `false` quando o item não é equipável (galeria é CAPACIDADE, não peça; o Estúdio abre
 * em vez de equipar), quando está trancado ou quando é de um tipo que saiu do catálogo
 * (recompensas v2: cursor, pack, aprimoramento) — nunca lança.
 */
import type { MenuPositionType } from '../../components/shell/navItems'
import type { FonteType,ThemeType } from '../appearance'
import { equiparEstiloDeLegenda } from '../estilosDeLegenda'
import { estadoDoItem, type ItemDaLoja } from '../loja'
import { type ParticulasType, setParticulas } from '../particulas'
import { equiparPeleDeCartao } from '../pelesDeCartao'
import { setRastro } from '../rastroDoMouse'

export interface ContextoDeEquipar {
  setTheme: (t: ThemeType) => void
  setFonte: (f: FonteType) => void
  setMenuPosition: (p: MenuPositionType) => void
  onOpenStudio: () => void
  /** Estado para conferir o cadeado. */
  nivel: number
  saldo: number
}

/** O item é uma PEÇA que se equipa (e não uma capacidade ou upgrade)? */
export function equipavel(item: ItemDaLoja): boolean {
  return item.tipo !== 'galeria'
}

export function equiparItem(item: ItemDaLoja, ctx: ContextoDeEquipar): boolean {
  if (!equipavel(item)) return false
  if (estadoDoItem(item, ctx.nivel, ctx.saldo).estado !== 'equipavel') return false
  switch (item.tipo) {
    case 'tema': ctx.setTheme(item.alvo as ThemeType); return true
    case 'fonte': ctx.setFonte(item.alvo as FonteType); return true
    case 'posicao': ctx.setMenuPosition(item.alvo as MenuPositionType); return true
    case 'estudio': ctx.onOpenStudio(); return true
    case 'particulas': setParticulas(item.alvo as ParticulasType); return true
    case 'rastro': setRastro(item.alvo); return true
    case 'legenda': equiparEstiloDeLegenda(item.alvo); return true
    case 'cartao': equiparPeleDeCartao(item.alvo); return true
    default: return false
  }
}
