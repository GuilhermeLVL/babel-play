/**
 * REMAPEAR SEM REIMPORTAR — a decisão por nota, pura (sem banco, sem rede), para a rota e os testes usarem a mesma.
 *
 * Parte dos campos ORIGINAIS guardados em `anki_notes.campos_brutos` e dos papéis escolhidos para o tipo de nota
 * (`remapearNota`, do núcleo), e refaz o que o servidor sempre refaz com o que vem do cliente: limpeza (`limparCampo`) e
 * régua de qualidade (`avaliarCartao`, perfil `'curado'`).
 *
 * O QUE ELA PROTEGE. Nota ATIVADA (projetada em cartão: `estado = 'ativa'` ou `projected_card_id` preenchido) já virou
 * item de estudo, com histórico de revisão: o texto dela não é reescrito e o motivo de descarte não muda. Só o exemplo,
 * se estava vazio, é preenchido ("preenche buraco, não sobrescreve o que já é bom"). Estado, vínculo com o cartão e SRS
 * nunca passam por aqui: o resultado só tem texto e motivo de descarte.
 */
import { limparCampo, type PapelNaImportacao, remapearNota } from '../../src/core/anki'
import { avaliarCartao } from '../../src/core/learning/quality'
import type { NotaParaRemapear, TextoRemapeado } from '../db/repositories/anki'

export type DestinoDaNota =
  /** O texto ou o motivo mudou. */
  | { tipo: 'mudou'; mudanca: TextoRemapeado; passouAServir: boolean; deixouDeServir: boolean }
  /** Nota ativada: só um exemplo vazio foi preenchido. */
  | { tipo: 'preencheu'; mudanca: TextoRemapeado }
  /** Nota ativada, intacta. */
  | { tipo: 'protegida' }
  /** O novo mapeamento daria o mesmo resultado. */
  | { tipo: 'igual' }
  /** Sem mapeamento para o tipo, campos que não batem, ou frente/verso vazios com o mapeamento novo: fica como está. */
  | { tipo: 'ignorada' }

const ativada = (n: NotaParaRemapear) => n.estado === 'ativa' || n.projectedCardId != null

export function decidirRemapeamento(
  nota: NotaParaRemapear,
  mapeamentos: ReadonlyMap<string, PapelNaImportacao[]>,
): DestinoDaNota {
  const papeis = nota.estruturaHash ? mapeamentos.get(nota.estruturaHash) : undefined
  const novo = papeis ? remapearNota(nota.camposBrutos, papeis) : null
  if (!novo) return ativada(nota) ? { tipo: 'protegida' } : { tipo: 'ignorada' }

  const frente = limparCampo(novo.frente)
  const verso = limparCampo(novo.verso)
  const exemploLimpo = novo.exemplo ? limparCampo(novo.exemplo) : ''
  // Exemplo igual à frente ou ao verso não é exemplo (mesma regra de `montarNota` e do lote).
  const exemplo = exemploLimpo && exemploLimpo !== frente && exemploLimpo !== verso ? exemploLimpo : null

  if (ativada(nota)) {
    if (nota.exemplo || !exemplo) return { tipo: 'protegida' }
    return {
      tipo: 'preencheu',
      mudanca: {
        id: nota.id,
        frente: nota.frente,
        verso: nota.verso,
        exemplo,
        motivoDescarte: nota.motivoDescarte,
      },
    }
  }

  // Um dos lados vazio: o mapeamento escolhido não serve a esta nota, e inventar o lado que falta é pior que deixá-la.
  if (!frente || !verso) return { tipo: 'ignorada' }

  const veredito = avaliarCartao(
    { word: frente, translation: verso, sentence: exemplo ?? '', srcLang: undefined } as never,
    {
      origem: 'curado',
    },
  )
  const motivoDescarte = veredito.serve ? null : (veredito.motivo ?? 'descartada')

  if (
    frente === nota.frente &&
    verso === nota.verso &&
    exemplo === (nota.exemplo ?? null) &&
    motivoDescarte === (nota.motivoDescarte ?? null)
  ) {
    return { tipo: 'igual' }
  }
  return {
    tipo: 'mudou',
    mudanca: { id: nota.id, frente, verso, exemplo, motivoDescarte },
    passouAServir: nota.motivoDescarte != null && motivoDescarte == null,
    deixouDeServir: nota.motivoDescarte == null && motivoDescarte != null,
  }
}
