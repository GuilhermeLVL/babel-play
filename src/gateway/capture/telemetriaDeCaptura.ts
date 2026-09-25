/**
 * TELEMETRIA DE QUALIDADE DA CAPTURA — manda ao servidor os números que `captureMetrics` mede.
 *
 * O ring buffer de `captureMetrics` morria na aba: `window.__capSummary()` só servia a quem abrisse
 * o DevTools, e "a legenda está lenta" não tinha como ser medido em produção. Este módulo drena o
 * acumulador de telemetria a cada 60 s enquanto a captura roda, e uma última vez ao parar.
 *
 * O QUE VAI, E SÓ ISSO: `{ v: 1, sttFinalMs, primeiroParcialMs, mtMs, rtf, descartesAlucinacao,
 * fallbacks, motorStt, motorMt }` — latências, RTF, contagens e o NOME do motor. Nenhum texto,
 * nenhum id de sessão ou de usuário (o servidor sabe quem é pelo Bearer, e não precisa guardar).
 *
 * QUANDO NÃO VAI NADA:
 *  - "Métricas de uso anônimas" desligada em Ajustes → Privacidade (`consentimentos.metricas`): é a
 *    mesma promessa — números de uso, sem conteúdo — e quem disse não, disse não para isto também.
 *    Não há preferência nova: uma segunda chave para a mesma promessa seria um interruptor que a
 *    pessoa não sabe que existe;
 *  - sem conta (modo anônimo): não há servidor para onde mandar — e o funil responderia 501 em
 *    silêncio de qualquer forma (a rota está em `SO_COM_CONTA` do teste de rotas espelhadas);
 *  - conta de menor RESTRITA (sem o responsável): os dados ficam no aparelho.
 *
 * TRANSPORTE. Periódico e no "parar": `apiFetch` com `keepalive` — leva o Bearer, trata 401 e passa
 * pelo funil (o `fetch` cru para `/api` é proibido fora dele). Na SAÍDA DA PÁGINA (`pagehide`):
 * `navigator.sendBeacon`, o único envio que o navegador garante com a aba morrendo — sem Bearer,
 * então só chega se o servidor aceitar a rota sem ele; se recusar, perde-se o último minuto, que é
 * o preço de não segurar a aba. No "parar" o beacon NÃO é usado justamente por isso: a página está
 * viva e o envio autenticado é possível. Toda falha é silenciosa: telemetria nunca vira erro na tela.
 */
import { apiFetch } from '../../data/api'
import { estadoDeIdentidade } from '../../lib/identidade'
import { lerPreferencias } from '../../lib/preferencias'
import { estadoDaProtecao } from '../../lib/protecaoDoMenor'
import { capMetrics, type LoteDeTelemetria } from './captureMetrics'

export const ROTA_DA_TELEMETRIA = '/api/metricas/captura'
export const INTERVALO_DA_TELEMETRIA_MS = 60_000

export type PayloadDeTelemetria = { v: 1 } & LoteDeTelemetria

let relogio: ReturnType<typeof setInterval> | null = null
let aoSairDaPagina: (() => void) | null = null

function podeEnviar(): boolean {
  try {
    if (lerPreferencias().consentimentos.metricas === false) return false
    const id = estadoDeIdentidade()
    if (id !== 'conta' && id !== 'selfhost') return false
    return estadoDaProtecao()?.restrita !== true
  } catch {
    return false
  }
}

function vazio(l: LoteDeTelemetria): boolean {
  return (
    !l.sttFinalMs.length &&
    !l.primeiroParcialMs.length &&
    !l.mtMs.length &&
    !l.rtf.length &&
    !l.descartesAlucinacao &&
    !Object.keys(l.fallbacks).length
  )
}

/** Drena e envia. `saindo`: a página está indo embora — só o beacon chega. */
function enviar(saindo: boolean): void {
  // Drena SEMPRE: sem permissão, o lote é descartado em vez de acumular até alguém deixar mandar.
  const lote = capMetrics.drenarTelemetria()
  if (!podeEnviar() || vazio(lote)) return
  const payload: PayloadDeTelemetria = { v: 1, ...lote }
  const corpo = JSON.stringify(payload)
  try {
    if (saindo && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ROTA_DA_TELEMETRIA, new Blob([corpo], { type: 'application/json' }))
      return
    }
    void apiFetch(ROTA_DA_TELEMETRIA, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
    }).catch(() => {
      /* telemetria que falha morre aqui, de propósito */
    })
  } catch {
    /* idem: nunca derruba a captura */
  }
}

/** Começa a janela de envio (START da captura). Idempotente. */
export function iniciarTelemetriaDeCaptura(): void {
  pararRelogio()
  relogio = setInterval(() => enviar(false), INTERVALO_DA_TELEMETRIA_MS)
  if (typeof window !== 'undefined') {
    aoSairDaPagina = () => enviar(true)
    window.addEventListener('pagehide', aoSairDaPagina)
  }
}

function pararRelogio(): void {
  if (relogio) clearInterval(relogio)
  relogio = null
  if (aoSairDaPagina && typeof window !== 'undefined') window.removeEventListener('pagehide', aoSairDaPagina)
  aoSairDaPagina = null
}

/** Fecha a janela (STOP da captura): manda o que sobrou e para o relógio. Sem captura, não faz nada. */
export function pararTelemetriaDeCaptura(): void {
  if (!relogio && !aoSairDaPagina) return
  pararRelogio()
  enviar(false)
}
