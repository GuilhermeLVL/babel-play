/**
 * A RESERVA DE UMA CHAMADA DE LLM GERENCIADO — chamada + tokens, abertas juntas e fechadas juntas.
 *
 * Tradução e tutor faziam, cada um, "reserva a chamada; se o provedor falhar, estorna". Com o teto
 * de TOKENS aplicado (Fase 2 do lançamento) cada chamada passou a ter duas reservas, e a cota a
 * falhar FECHADA — três caminhos de recusa (402 de chamadas, 402 de tokens, 503 do contador) e dois
 * estornos que precisam andar juntos. Escrever isso duas vezes seria convidar um dos dois a
 * esquecer o estorno de tokens, que é exatamente o defeito que ninguém percebe (o usuário perde
 * cota por uma tradução que não recebeu).
 */
import type { Response } from 'express'

import type { UserId } from '../lib/authContext'
import { responderErro } from '../lib/respostaDeErro'
import {
  acertarTokensDeLlm,
  ContadorIndisponivel,
  type ModoDaCota,
  refundManagedCall,
  reservarTokensDeLlm,
  reserveManagedCall,
} from '../lib/usageQuota'

/** O corpo do 503 quando o contador não responde. O cliente cai nos modelos locais. */
export function responderContadorIndisponivel(res: Response): void {
  res.status(503).json({
    error: 'O contador de uso da IA de nuvem está fora do ar agora; o app segue com os modelos locais.',
    code: 'contador_indisponivel',
  })
}

/**
 * A FRANQUIA DE ALÍVIO DO MÊS ACABOU (A10). É o 402 `quota_exceeded` de sempre — o cliente mostra o
 * aviso FUNCIONAL de fim de cota ("a cota volta no dia 1º"), nunca uma oferta promocional —, com o
 * `escopo` dizendo que foi a nuvem grátis, e não um plano, que acabou. Serve ao STT e ao LLM.
 */
export function responderFranquiaDeAlivioEsgotada(res: Response): void {
  responderErro(
    res,
    402,
    'A nuvem grátis deste mês acabou; o app segue no aparelho e ela volta no dia 1º.',
    'quota_exceeded',
    { escopo: 'alivio' },
  )
}

export class ReservaDeLlm {
  private pendente = true
  constructor(
    private readonly userId: UserId,
    private readonly tokensReservados: number,
    private readonly modo: ModoDaCota = 'plano',
  ) {}

  /** A chamada aconteceu: a reserva de chamada vira consumo e os tokens são acertados pelo real. */
  async consumir(tokensReais: number): Promise<void> {
    if (!this.pendente) return
    this.pendente = false
    await acertarTokensDeLlm(this.userId, this.tokensReservados, tokensReais, this.modo)
  }

  /** A chamada NÃO aconteceu (provedor fora, erro): devolve as duas reservas. */
  async estornar(): Promise<void> {
    if (!this.pendente) return
    this.pendente = false
    await refundManagedCall(this.userId, this.modo)
    await acertarTokensDeLlm(this.userId, this.tokensReservados, 0, this.modo)
  }
}

/**
 * Abre as duas reservas. Devolve `null` quando JÁ RESPONDEU (402 de cota, 503 de contador) — quem
 * chama só precisa sair. Nenhum caminho de recusa deixa reserva pendurada.
 */
export async function abrirReservaDeLlm(
  userId: UserId,
  estimativaDeTokens: number,
  res: Response,
  /** De que franquia sai a chamada: a do plano, ou a da nuvem de alívio do Grátis (A10). */
  modo: ModoDaCota = 'plano',
): Promise<ReservaDeLlm | null> {
  try {
    if (!(await reserveManagedCall(userId, modo))) {
      if (modo === 'alivio') responderFranquiaDeAlivioEsgotada(res)
      else res.status(402).json({ error: 'limite mensal do plano atingido', code: 'quota_exceeded' })
      return null
    }
    let cabe: boolean
    try {
      cabe = await reservarTokensDeLlm(userId, estimativaDeTokens, modo)
    } catch (err) {
      await refundManagedCall(userId, modo)
      throw err
    }
    if (!cabe) {
      await refundManagedCall(userId, modo)
      if (modo === 'alivio') responderFranquiaDeAlivioEsgotada(res)
      else res.status(402).json({ error: 'limite mensal de IA de nuvem do plano atingido', code: 'quota_exceeded' })
      return null
    }
    return new ReservaDeLlm(userId, estimativaDeTokens, modo)
  } catch (err) {
    if (err instanceof ContadorIndisponivel) {
      responderContadorIndisponivel(res)
      return null
    }
    throw err
  }
}
