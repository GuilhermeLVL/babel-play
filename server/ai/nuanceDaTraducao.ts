/**
 * O QUE A TRADUÇÃO NUANCE MUDA NUM PEDIDO DE TRADUÇÃO (D2 da Fase D, 30/09/2026): o REGISTRO
 * (formal/informal) e a VARIANTE do destino (pt-BR/pt-PT, es-419/es-ES).
 *
 * SÓ PARA QUEM TEM A CAPACIDADE. As variantes são do Premium (decisão do dono), e o formal/informal
 * é parte da Tradução Nuance. Os dois campos vêm do CORPO — qualquer um os escreve —, então quem não
 * tem `traducaoNuance` recebe o pedido de sempre: sem registro, e com o destino sem a região quando
 * ela é uma das variantes oferecidas. Esse é o prompt de antes, byte a byte (o `nomeDoIdioma` antigo
 * já jogava a região fora), e por isso a chave do cache também é a de antes.
 *
 * A CHAVE DO CACHE (`registro` da consulta, `cacheDeTraducao.ts`): o registro e a variante que de fato
 * foram ao prompt, mais um hash curto do TEXTO dos sufixos. Sem nada disso, ausente — e a chave é
 * exatamente a de antes do D2: o L2 dura 30 dias e não pode ser jogado fora por um recurso novo.
 */
import { createHash } from 'node:crypto'

import type { CapacidadeDeNivel } from '../../src/core/nivelDeTraducao'
import {
  type RegistroDaTraducao,
  semRegiao,
  TEXTO_DOS_SUFIXOS_DA_NUANCE,
  type VarianteDaTraducao,
  varianteDoCodigo,
} from '../../src/lib/traducao/promptComunicativo'

/** Hash curto do texto dos sufixos: mudou o texto do registro, as traduções com registro vencem. */
const VERSAO_DOS_SUFIXOS = createHash('sha256').update(TEXTO_DOS_SUFIXOS_DA_NUANCE).digest('hex').slice(0, 8)

export interface PedidoDeNuance {
  tgt: string
  src?: string
  registro?: RegistroDaTraducao
  variante?: VarianteDaTraducao
}

export interface NuanceAplicada {
  /** O destino que vai ao prompt (com a variante, se couber). */
  tgt: string
  /** A origem que vai ao prompt. */
  src?: string
  registro?: RegistroDaTraducao
  /** O pedaço da chave do cache; ausente = a chave de antes do D2. */
  chave?: string
}

/** Tira a região só quando ela é uma variante oferecida: o resto dos códigos vai como sempre foi. */
const semVariante = (code: string): string => (varianteDoCodigo(code) ? semRegiao(code) : code)

export function aplicarNuance(p: PedidoDeNuance, capacidade: CapacidadeDeNivel): NuanceAplicada {
  if (capacidade.traducaoNuance !== true) {
    return { tgt: semVariante(p.tgt), ...(p.src ? { src: semVariante(p.src) } : {}) }
  }
  /* A variante pedida só vale para o idioma do destino (pt-PT com destino inglês não quer dizer
     nada); sem ela, o destino que já traz a região (`pt-PT`, `es-es`) vale por si. */
  const pedida = p.variante && semRegiao(p.variante) === semRegiao(p.tgt) ? p.variante : null
  const variante = pedida ?? varianteDoCodigo(p.tgt)
  const partes = [...(p.registro ? [p.registro] : []), ...(variante ? [`variante:${variante}`] : [])]
  return {
    tgt: variante ?? p.tgt,
    ...(p.src ? { src: p.src } : {}),
    ...(p.registro ? { registro: p.registro } : {}),
    ...(partes.length ? { chave: `${partes.join('|')}@${VERSAO_DOS_SUFIXOS}` } : {}),
  }
}
