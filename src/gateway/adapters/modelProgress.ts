/**
 * Tradutor dos eventos de progresso do @huggingface/transformers para a barra da UI.
 *
 * POR QUE ESTE MÓDULO EXISTE: os dois workers mantinham agregadores próprios de progresso, e os
 * dois estavam errados de formas diferentes (A-P0-1 e A-P0-2 em docs/discovery/A-model-download.md).
 * A biblioteca já entrega o agregado certo: `pipelines.js` busca os metadados de TODOS os arquivos
 * esperados ANTES do primeiro byte e pré-semeia o denominador, e `DefaultProgressCallback` emite
 * `progress_total` com `loaded`/`total` em bytes reais a cada chunk. Validado na Fase 0 contra o
 * bundle que o browser carrega (`dist/transformers.web.js`) — ver `results/fase0-premissas.json`.
 *
 * Então a regra é uma só, e é de subtração: SÓ `progress_total` e `ready` movem a barra.
 *
 *  - `progress`  é o percentual DO ARQUIVO, não do conjunto. Misturá-lo com o agregado fazia a
 *                barra do tradutor oscilar para trás continuamente.
 *  - `done`      é POR ARQUIVO e nem carrega `total`. Tratá-lo como 100% cravava a barra no
 *                primeiro `config.json` concluído.
 *  - `initiate`/`download` não carregam bytes.
 */

/** Formato estrutural dos eventos da lib (não importamos o tipo para não acoplar à versão). */
export interface EventoDeProgresso {
  status: string
  name?: string
  file?: string
  loaded?: number
  total?: number
  progress?: number
  files?: Record<string, { loaded: number; total: number }>
}

export interface ProgressoModelo {
  /** 0..1, por bytes reais do conjunto completo de arquivos do modelo. */
  progress: number
  loaded: number
  total: number
}

/**
 * Traduz um evento da lib. Devolve `null` para todo evento que não deve mover a barra —
 * o `null` é a correção, não um caso de borda.
 */
export function lerProgresso(info: EventoDeProgresso): ProgressoModelo | null {
  if (info.status === 'ready') {
    return { progress: 1, loaded: 0, total: 0 }
  }
  if (info.status === 'progress_total') {
    const loaded = info.loaded ?? 0
    const total = info.total ?? 0
    // total 0 acontece na primeira emissão, antes de os metadados chegarem.
    const bruto = total > 0 ? loaded / total : 0
    return { progress: Math.min(Math.max(bruto, 0), 1), loaded, total }
  }
  return null
}

/**
 * Cria um rastreador com estado PRÓPRIO para uma carga de modelo.
 *
 * O estado antigo (`fileBytes`, `lastEmitted`) era global de módulo e nunca resetado: a segunda
 * carga herdava o 100% da primeira e nascia com a barra travada. Aqui cada carga tem o seu, e o
 * `criar…` deixa isso explícito na assinatura.
 *
 * A guarda de monotonicidade permanece, mas agora é apenas higiene contra reordenação de eventos —
 * não é mais ela que segura o número, porque o denominador já é o certo desde o início. (Era o
 * clamp sobre um denominador incompleto que travava a barra em 100%.)
 */
export function criarRastreadorDeProgresso(
  emitir: (p: ProgressoModelo) => void,
): (info: EventoDeProgresso) => void {
  let ultimo = -1
  return (info: EventoDeProgresso) => {
    const p = lerProgresso(info)
    if (!p) return
    if (p.progress < ultimo) return
    ultimo = p.progress
    emitir(p)
  }
}

export interface OpcoesWatchdog {
  /** Tempo SEM progresso que caracteriza travamento. */
  semProgressoMs: number
  /** Frequência de checagem. */
  tickMs: number
  /** Chamado quando estagnou. Recebe há quanto tempo não há sinal de vida. */
  aoTravar: (paradoHaMs: number) => void
  /** Injetável para teste. */
  agora?: () => number
}

/**
 * Watchdog de carga POR ESTAGNAÇÃO.
 *
 * Um prazo absoluto não distingue "travou" de "está baixando devagar" — era o defeito A-P1-6:
 * 45 s desde o início do load derrubavam o worker no meio de um download legítimo (medido: 2×
 * na mesma página). Aqui o relógio reinicia a cada `sinalDeVida()`, então só dispara quando
 * realmente não chega mais nenhum byte.
 */
export function criarWatchdogDeEstagnacao(opts: OpcoesWatchdog) {
  const agora = opts.agora ?? (() => Date.now())
  let ultimo = agora()
  let parado = false
  const timer = setInterval(() => {
    if (parado) return
    const paradoHa = agora() - ultimo
    if (paradoHa >= opts.semProgressoMs) {
      parado = true
      clearInterval(timer)
      opts.aoTravar(paradoHa)
    }
  }, opts.tickMs)
  return {
    sinalDeVida: () => { ultimo = agora() },
    cancelar: () => { parado = true; clearInterval(timer) },
  }
}

/** Rótulo honesto de tamanho para a UI: "12,4 MB de 85,0 MB". */
export function rotuloDeBytes(loaded: number, total: number): string | null {
  if (!total || total <= 0) return null
  const mb = (n: number) => (n / 1_048_576).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${mb(loaded)} MB de ${mb(total)} MB`
}
