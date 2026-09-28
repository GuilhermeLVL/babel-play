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
import { efeitosGuardados, equiparEfeito } from '../comemoracao/efeitos'
import { equiparEstiloDeLegenda, lerEstiloDeLegenda } from '../estilosDeLegenda'
import { estadoDoItem, type ItemDaLoja } from '../loja'
import { type ParticulasType, readParticulas, setParticulas } from '../particulas'
import { equiparPeleDeCartao, lerPeleDeCartao } from '../pelesDeCartao'
import { readRastro, setRastro } from '../rastroDoMouse'

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

/* MOLDURA E TÍTULO DE PERFIL (recompensas v2, onda 3): nesta onda são dado + posse — o que está
   vestido fica guardado aqui, e o perfil passa a desenhar na onda 5 (`MolduraETitulo`). */
const CHAVE_DO_PERFIL = 'babel.perfil_equipado'

export function perfilEquipado(): { moldura?: string; titulo?: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_DO_PERFIL) || '{}') as unknown
    return v && typeof v === 'object' ? (v as { moldura?: string; titulo?: string }) : {}
  } catch {
    return {}
  }
}

function vestirNoPerfil(campo: 'moldura' | 'titulo', id: string): void {
  try {
    localStorage.setItem(CHAVE_DO_PERFIL, JSON.stringify({ ...perfilEquipado(), [campo]: id }))
  } catch {
    /* sem storage */
  }
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
    // Efeitos de jogo (onda 3): quem confere se vale NESTE jogo é o motor, na hora da festa.
    case 'efeito-acerto':
    case 'efeito-combo':
    case 'finalizacao': equiparEfeito(item.tipo, item.alvo); return true
    case 'moldura':
    case 'titulo': vestirNoPerfil(item.tipo, item.id); return true
    // Legenda e cartão (onda 4).
    case 'legenda': equiparEstiloDeLegenda(item.alvo); return true
    case 'cartao': equiparPeleDeCartao(item.alvo); return true
    default: return false
  }
}

/**
 * A PEÇA ESTÁ EM USO AGORA? Uma resposta só para o inventário, a Loja e a Coleção (recompensas v2,
 * Task 5.4): tema, fonte e menu vêm do estado do App; o resto, do que cada módulo guardou.
 */
export function estaEquipado(
  item: ItemDaLoja,
  atual: { theme: ThemeType; fonte: FonteType; menuPosition: MenuPositionType },
): boolean {
  switch (item.tipo) {
    case 'tema': return atual.theme === item.alvo
    case 'fonte': return atual.fonte === item.alvo
    case 'posicao': return atual.menuPosition === item.alvo
    case 'particulas': return readParticulas() === item.alvo
    case 'rastro': return readRastro() === item.alvo
    case 'legenda': return lerEstiloDeLegenda() === item.alvo
    case 'cartao': return lerPeleDeCartao() === item.alvo
    case 'efeito-acerto': return efeitosGuardados().acerto === item.alvo
    case 'efeito-combo': return efeitosGuardados().combo === item.alvo
    case 'finalizacao': return efeitosGuardados().finalizacao === item.alvo
    case 'moldura': return perfilEquipado().moldura === item.id
    case 'titulo': return perfilEquipado().titulo === item.id
    default: return false
  }
}
