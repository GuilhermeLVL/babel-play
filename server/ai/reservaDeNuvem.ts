/**
 * A RESERVA DE UMA CHAMADA DE LLM GERENCIADO — chamada + tokens, abertas juntas e fechadas juntas.
 *
 * Tradução e tutor faziam, cada um, "reserva a chamada; se o provedor falhar, estorna". Com o teto
 * de TOKENS aplicado (Fase 2 do lançamento) cada chamada passou a ter duas reservas, e a cota a
 * falhar FECHADA — três caminhos de recusa (402 de chamadas, 402 de tokens, 503 do contador) e dois
 * estornos que precisam andar juntos. Escrever isso duas vezes seria convidar um dos dois a
 * esquecer o estorno de tokens, que é exatamente o defeito que ninguém percebe (o usuário perde
 * cota por uma tradução que não recebeu).
 *
 * E O USO JUSTO DO DIA (matriz v2, C4): a reserva de tokens confere o mês e depois o dia; a recusa do
 * dia é o 429 `uso_justo_do_dia` (`recusaUsoJustoDoDia`), nunca o 402 — e a reserva lembra a janela
 * do dia em que caiu, para o acerto voltar para ela.
 *
 * AS RECUSAS SÃO DADO (Fase F): `reservarLlm` devolve a recusa em vez de escrever na resposta, para o
 * núcleo de IA (`server/ai/nucleo/`) servir o app, a API e o MCP com as mesmas regras.
 * `abrirReservaDeLlm` é o adaptador do Express, para quem ainda fala com `res` (o tutor) — o corpo é
 * um só, o das `recusa*`.
 */
import type { Response } from 'express'

import { segundosAteVirarODia } from '../../src/core/learning/economia'
import { CODIGO_USO_JUSTO_DO_DIA } from '../../src/core/usoJusto'
import type { UserId } from '../lib/authContext'
import {
  acertarTokensDeLlm,
  ContadorIndisponivel,
  fusoDaCota,
  type ModoDaCota,
  refundManagedCall,
  reservarTokensDeLlm,
  reserveManagedCall,
} from '../lib/usageQuota'
import { recusaDeErro, type RecusaDeIa, recusar } from './nucleo/recusa'
import { responderRecusa } from './respostaDoNucleo'

/** O 503 quando o contador não responde. O cliente cai nos modelos locais. */
export function recusaContadorIndisponivel(): RecusaDeIa {
  return recusar(503, {
    error: 'O contador de uso da IA de nuvem está fora do ar agora; o app segue com os modelos locais.',
    code: 'contador_indisponivel',
  })
}

/**
 * A FRANQUIA DE ALÍVIO DO MÊS ACABOU (A10). É o 402 `quota_exceeded` de sempre — o cliente mostra o
 * aviso FUNCIONAL de fim de cota ("a cota volta no dia 1º"), nunca uma oferta promocional —, com o
 * `escopo` dizendo que foi a nuvem grátis, e não um plano, que acabou. Serve ao STT e ao LLM.
 */
export function recusaFranquiaDeAlivioEsgotada(): RecusaDeIa {
  return recusaDeErro(
    402,
    'A nuvem grátis deste mês acabou; o app segue no aparelho e ela volta no dia 1º.',
    'quota_exceeded',
    { escopo: 'alivio' },
  )
}

/**
 * O USO JUSTO DE HOJE ACABOU (429 `uso_justo_do_dia`). Serve ao STT, ao LLM e à voz. A espera é o tempo
 * até a virada do dia LOCAL da pessoa (o mesmo fuso da janela do dia) e vai no `Retry-After`; o
 * cliente pausa a nuvem, o aparelho assume e o aviso é funcional — nada de venda: quem chega aqui já é
 * assinante.
 */
export async function recusaUsoJustoDoDia(userId: UserId): Promise<RecusaDeIa> {
  const retryAfter = segundosAteVirarODia(Date.now(), await fusoDaCota(userId).catch(() => ''))
  return recusaDeErro(
    429,
    'O uso justo de nuvem de hoje acabou; a legenda segue no aparelho e a nuvem volta amanhã.',
    CODIGO_USO_JUSTO_DO_DIA,
    { retryAfter },
    retryAfter,
  )
}

export class ReservaDeLlm {
  private pendente = true
  constructor(
    private readonly userId: UserId,
    private readonly tokensReservados: number,
    private readonly modo: ModoDaCota = 'plano',
    /** A janela do dia em que os tokens foram reservados (`null` = sem teto no dia). */
    private readonly dia: string | null = null,
  ) {}

  /** A chamada aconteceu: a reserva de chamada vira consumo e os tokens são acertados pelo real. */
  async consumir(tokensReais: number): Promise<void> {
    if (!this.pendente) return
    this.pendente = false
    await acertarTokensDeLlm(this.userId, this.tokensReservados, tokensReais, this.modo, this.dia)
  }

  /** A chamada NÃO aconteceu (provedor fora, erro): devolve as duas reservas. */
  async estornar(): Promise<void> {
    if (!this.pendente) return
    this.pendente = false
    await refundManagedCall(this.userId, this.modo)
    await acertarTokensDeLlm(this.userId, this.tokensReservados, 0, this.modo, this.dia)
  }
}

/**
 * Abre as duas reservas, ou devolve a RECUSA (402 de cota do mês, 429 do uso justo do dia, 503 de
 * contador). Nenhum caminho de recusa deixa reserva pendurada. Erro que não é do contador sobe.
 */
export async function reservarLlm(
  userId: UserId,
  estimativaDeTokens: number,
  /** De que franquia sai a chamada: a do plano, ou a da nuvem de alívio do Grátis (A10). */
  modo: ModoDaCota = 'plano',
): Promise<ReservaDeLlm | RecusaDeIa> {
  try {
    if (!(await reserveManagedCall(userId, modo))) {
      if (modo === 'alivio') return recusaFranquiaDeAlivioEsgotada()
      return recusar(402, { error: 'limite mensal do plano atingido', code: 'quota_exceeded' })
    }
    let tokens: Awaited<ReturnType<typeof reservarTokensDeLlm>>
    try {
      tokens = await reservarTokensDeLlm(userId, estimativaDeTokens, modo)
    } catch (err) {
      await refundManagedCall(userId, modo)
      throw err
    }
    if (tokens.cabe === false) {
      await refundManagedCall(userId, modo)
      if (modo === 'alivio') return recusaFranquiaDeAlivioEsgotada()
      if (tokens.recusa === 'dia') return await recusaUsoJustoDoDia(userId)
      return recusar(402, { error: 'limite mensal de IA de nuvem do plano atingido', code: 'quota_exceeded' })
    }
    return new ReservaDeLlm(userId, estimativaDeTokens, modo, tokens.dia)
  } catch (err) {
    if (err instanceof ContadorIndisponivel) return recusaContadorIndisponivel()
    throw err
  }
}

/**
 * O adaptador do Express para `reservarLlm`: devolve `null` quando JÁ RESPONDEU a recusa — quem
 * chama só precisa sair.
 */
export async function abrirReservaDeLlm(
  userId: UserId,
  estimativaDeTokens: number,
  res: Response,
  modo: ModoDaCota = 'plano',
): Promise<ReservaDeLlm | null> {
  const r = await reservarLlm(userId, estimativaDeTokens, modo)
  if (r instanceof ReservaDeLlm) return r
  responderRecusa(res, r)
  return null
}
