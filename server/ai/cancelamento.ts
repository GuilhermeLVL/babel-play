/**
 * O CLIENTE DESISTIU — o sinal que leva essa notícia até o `fetch` do provedor (auditoria de
 * desempenho do servidor de 10/10/2026, achado A7).
 *
 * ANTES. Toda chamada a provedor tinha só o relógio da tentativa (`AbortSignal.timeout`: 12 s na
 * tradução e na voz, 30 s no STT). Quem fechava a aba, saía da tela ou cancelava o pedido (os
 * adaptadores de IA do cliente passam `signal`) deixava a chamada rodando até o fim: o provedor
 * cobrava, a resposta era jogada fora, e a cota de quem pediu era debitada por algo que ninguém
 * recebeu. No STT a vaga em voo era solta no fechamento com a chamada ainda viva, então fechar e
 * reabrir empilhava chamadas em voo.
 *
 * AGORA. O adaptador HTTP tira um `AbortSignal` da resposta (`sinalDoCliente`) e o entrega ao
 * núcleo no contexto do pedido (`ContextoDeIa.sinal`). Cada `fetch` ao provedor recebe esse sinal
 * junto com o relógio da tentativa (`comTempoLimite`). Quando ele dispara:
 *   - o `fetch` em curso é abortado, e a cascata PARA: a perna de reserva não é chamada;
 *   - o núcleo decide `recusaCancelada()` e sai pelo mesmo `finally` de toda falha, que é onde a
 *     vaga de admissão é solta e a cota reservada é estornada. Nenhum caminho novo de estorno;
 *   - o disjuntor NÃO conta: quem desistiu foi o cliente, não o provedor.
 *
 * O QUE CONTINUA GASTO: o pedido no balde por minuto do provedor (a requisição saiu, e a conta lá
 * pode tê-la contado) e, se o provedor não percebe a conexão fechada a tempo, o que ele cobrar. O
 * que volta é a cota DO USUÁRIO, pela mesma regra da falha: ele não paga pelo que não recebeu.
 *
 * FORA DO HTTP (API, MCP, testes que chamam o handler com uma resposta falsa) não há sinal: o
 * campo é opcional, e sem ele vale só o relógio da tentativa, como sempre.
 */
import type { Response } from 'express'

import { recusaDeErro, type RecusaDeIa } from './nucleo/recusa'

/** O código estável da recusa. Ninguém o lê no cliente (ele já foi embora): é do log e da telemetria. */
export const CODIGO_DE_CANCELAMENTO = 'cancelado'

/**
 * 499 é o "cliente fechou a conexão" do nginx: não é erro do servidor (5xx) nem do pedido (4xx que
 * alguém vá ler), e separa o cancelamento das falhas nos painéis.
 */
const STATUS_DE_CANCELAMENTO = 499

/**
 * O sinal que aborta quando a resposta FECHA SEM TER TERMINADO. `close` também é emitido no fim
 * normal de toda resposta; o que distingue os dois é `writableFinished`.
 *
 * `undefined` quando a resposta não emite eventos: os testes de rota chamam os handlers com um
 * objeto simples, e a API e o MCP não têm resposta do Express.
 */
export function sinalDoCliente(res: Response): AbortSignal | undefined {
  if (typeof (res as { on?: unknown })?.on !== 'function') return undefined
  const controle = new AbortController()
  const desistiu = () => {
    if (!res.writableFinished && !controle.signal.aborted)
      controle.abort(new DOMException('o cliente fechou a conexão', 'AbortError'))
  }
  /* Já fechada quando o handler começou (o cliente caiu durante o envio do corpo): o `close` não
     volta a ser emitido, então a pergunta é feita agora. */
  if (res.destroyed) desistiu()
  else res.on('close', desistiu)
  return controle.signal
}

/** O relógio da tentativa, junto com o sinal do cliente quando há um. */
export function comTempoLimite(ms: number, sinal?: AbortSignal): AbortSignal {
  const relogio = AbortSignal.timeout(ms)
  return sinal ? AbortSignal.any([relogio, sinal]) : relogio
}

/** Quem pediu já foi embora? */
export const clienteDesistiu = (sinal?: AbortSignal): boolean => sinal?.aborted === true

/** A decisão do núcleo quando o cliente desistiu. O adaptador HTTP não a escreve (não há a quem). */
export function recusaCancelada(): RecusaDeIa {
  return recusaDeErro(STATUS_DE_CANCELAMENTO, 'pedido cancelado por quem pediu', CODIGO_DE_CANCELAMENTO)
}
