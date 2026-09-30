/**
 * ISOLAMENTO DE ORIGEM — ligado de fábrica (A8 do plano "grátis sem travar", 29/09/2026).
 *
 * POR QUE LIGADO. Sem `crossOriginIsolated` o navegador não dá `SharedArrayBuffer`, e sem ele o WASM
 * do ONNX Runtime (Whisper, opus-mt, WeSpeaker) roda em UMA thread — o orçamento do A3
 * (`src/lib/dispositivo/orcamentoDeThreads.ts`) devolve 1 para todo motor. A edição estática já saía
 * isolada (`public/_headers`); a edição com servidor só isolava com `CROSS_ORIGIN_ISOLATION=1`, e o
 * Fly nunca a definiu. O grátis roda o modelo no aparelho, então era ali que a thread única pesava.
 *
 * OS MODOS (`CROSS_ORIGIN_ISOLATION`):
 *
 *   ausente, `1`, `completo`   COOP `same-origin` + COEP `credentialless` + DIP `isolate-and-credentialless`
 *   `dip`                      só `Document-Isolation-Policy: isolate-and-credentialless`
 *   `0`, `false`, `off`        nenhum (o COOP `same-origin` do helmet continua — ele sempre saiu)
 *
 * POR QUE OS DOIS CAMINHOS JUNTOS NO PADRÃO (suporte levantado em 29/09/2026 — MDN/BCD, blog do
 * Chrome, issue web-platform-tests/interop#1332):
 *
 *   COOP + COEP `credentialless`   Chrome/Edge 96+, Firefox 119+. O Safari não aceita `credentialless`
 *                                  (só `require-corp`) e fica sem isolamento, como na edição estática.
 *   DIP                            Chrome/Edge 137+ no desktop e 146+ no Android. Firefox: posição
 *                                  positiva (08/2026) e bug aberto, sem implementação; Safari: nada.
 *
 *   Hoje o par COOP/COEP já isola tudo o que o DIP isola, e ainda o Firefox; o DIP é o mesmo pedido
 *   pelo caminho novo, que isola SÓ o documento — sem exigir nada dos iframes nem dos popups. Os dois
 *   juntos não se atrapalham: cada política aplica a sua conferência, e as duas são `credentialless`.
 *   O modo `dip` existe para o dia em que o COEP quebrar algo (um iframe de terceiro sem COEP): ele
 *   tira o COEP e mantém as threads no Chromium, perdendo só o Firefox.
 *
 * `credentialless`, e não `require-corp`: os pesos vêm do Hugging Face e do R2 por `fetch` com CORS (o
 * que já satisfaz qualquer COEP), e as imagens de capa e de hover (`<img>` de qualquer acervo, ver
 * `server/http/csp.ts`) chegam sem cookie em vez de serem bloqueadas por falta de CORP.
 *
 * O QUE FOI VERIFICADO E NÃO QUEBRA (29/09/2026, Chromium 151 e leitura do código):
 *   - login do Supabase: `signInWithOAuth`/`linkIdentity` REDIRECIONAM a aba (`src/lib/auth.ts`); não
 *     há popup nem `window.opener` em lugar nenhum de `src/`;
 *   - cobrança do Asaas: a fatura abre com `window.open(link, '_blank', 'noopener')` e ninguém lê o
 *     retorno (`Checkout.tsx`, `Planos.tsx`, `DialogosDaAssinatura.tsx`, `ComprarCreditos.tsx`);
 *   - os popups do próprio app são da MESMA origem (`about:blank` do relatório semanal, `/termos.html`
 *     do "Baixar PDF"): herdam as mesmas políticas e continuam acessíveis a quem os abriu;
 *   - o COOP `same-origin` não é novidade: o helmet o manda por padrão desde sempre;
 *   - Turnstile (captcha do convidado): o iframe de `challenges.cloudflare.com` responde com COEP
 *     `require-corp` + CORP `cross-origin`, e o widget emitiu o token em todos os modos (chave de teste);
 *   - iframe próprio, YouTube embutido e service worker: não existem no app; `frame-ancestors 'self'`
 *     (CSP) já impedia o embed em iframe de terceiros — o motivo "AI Studio" do comentário antigo;
 *   - workers: todos são `new Worker(new URL(...))` da mesma origem, e este middleware roda antes do
 *     Vite e do estático, então o script de cada worker também sai com o cabeçalho.
 *
 * MEDIDO NO APP DE PÉ (servidor dev, Chromium 151, 12 núcleos): nos modos completo e `dip`,
 * `crossOriginIsolated` é `true`, o orçamento do A3 dá whisper 4 / mt 2, e o ORT-web carregou o
 * Silero com `numThreads` 4 abrindo 3 workers de pthread; os dois popups da mesma origem continuaram
 * acessíveis. Com `0`: `crossOriginIsolated` `false`, sem `SharedArrayBuffer`, e o ORT volta a 1 thread.
 */
import type { RequestHandler } from 'express'

import { log } from '../lib/logger'

export type ModoDeIsolamento = 'completo' | 'dip' | 'desligado'

/** As formas que um operador escreve quando quer DESLIGAR (o mesmo cuidado de `metricasHabilitadas`). */
const DESLIGADO = new Set(['0', 'false', 'off', 'desligado'])
/** As formas de "ligado"; ausente e vazio também. `1` é o valor de quem já ligava antes do A8. */
const COMPLETO = new Set(['', '1', 'true', 'on', 'completo'])

const normalizar = (env: NodeJS.ProcessEnv): string => env.CROSS_ORIGIN_ISOLATION?.trim().toLowerCase() ?? ''

/**
 * O modo pedido pelo ambiente. Valor desconhecido cai no PADRÃO (completo), e não em desligado: um
 * erro de digitação não pode tirar as threads de todo mundo em silêncio — quem quer desligar escreve `0`.
 */
export function modoDeIsolamento(env: NodeJS.ProcessEnv = process.env): ModoDeIsolamento {
  const v = normalizar(env)
  if (DESLIGADO.has(v)) return 'desligado'
  if (v === 'dip') return 'dip'
  return 'completo'
}

const COOP_COEP = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
} as const
const DIP = { 'Document-Isolation-Policy': 'isolate-and-credentialless' } as const

/** Os cabeçalhos de cada modo. */
export function cabecalhosDeIsolamento(modo: ModoDeIsolamento): Readonly<Record<string, string>> {
  if (modo === 'desligado') return {}
  if (modo === 'dip') return DIP
  return { ...COOP_COEP, ...DIP }
}

/**
 * O middleware, ou `null` no modo desligado (nada a montar). Montado em `criarApp()`, antes do Vite e
 * do estático que o bootstrap acrescenta: o cabeçalho que isola é o do DOCUMENTO e o dos scripts de
 * worker, e não o das respostas da API (que o recebem também, sem efeito nenhum).
 */
export function isolamentoDeOrigem(env: NodeJS.ProcessEnv = process.env): RequestHandler | null {
  const v = normalizar(env)
  if (!DESLIGADO.has(v) && !COMPLETO.has(v) && v !== 'dip') {
    log('warn', {
      event: 'isolamento_valor_desconhecido',
      error: `CROSS_ORIGIN_ISOLATION="${v}" não é 0, dip nem 1; seguindo no padrão (completo)`,
    })
  }
  const cabecalhos = Object.entries(cabecalhosDeIsolamento(modoDeIsolamento(env)))
  if (!cabecalhos.length) return null
  return (_req, res, next) => {
    for (const [nome, valor] of cabecalhos) res.setHeader(nome, valor)
    next()
  }
}
