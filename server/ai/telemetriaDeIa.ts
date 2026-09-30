/**
 * TELEMETRIA DE IA POR REQUISIÇÃO — a ponte entre as rotas de IA e o cliente do Langfuse.
 *
 * UM RASTRO POR REQUISIÇÃO HTTP, UMA GERAÇÃO POR TENTATIVA AO PROVEDOR. A granularidade é a que
 * responde as duas perguntas de preço e de qualidade ao mesmo tempo:
 *   - o rastro carrega QUEM (pseudônimo, plano, se é perfil de menor) e O QUÊ (a função: `stt`,
 *     `mt-fala`, `mt-texto`, `tutor`, `corretor`, `byok-chat`) — é por ele que o Langfuse soma custo
 *     por usuário e por plano;
 *   - cada tentativa vira uma geração: o 429 do primário, a perna da reserva que salvou, a
 *     retentativa do STT. Uma geração só por requisição esconderia justamente o fallback, que é o
 *     custo que ninguém vê (duas chamadas pagas por uma legenda).
 *
 * O PLANO E A IDADE SÃO RESOLVIDOS DEPOIS DA RESPOSTA. `encerrar()` é chamado no `finally` da
 * rota; a leitura do plano (`getPlanForUser`) e do perfil (`ehMenor`) acontece num `void` depois
 * disso, e só quando a telemetria está ligada. Resolver antes custaria duas consultas ao banco no
 * caminho de quem está esperando a legenda — para um dado que só o painel lê.
 *
 * NADA DAQUI LANÇA para a rota. Rastro desligado é um objeto que não faz nada, e não um `null` que
 * cada chamador teria de conferir.
 */
import type { Request } from 'express'

import type { NivelDaTraducao } from '../../src/core/nivelDeTraducao'
import { contarLimiteDoProvedor } from '../http/metricas'
import type { UserId } from '../lib/authContext'
import { getPlanForUser } from '../lib/entitlements'
import { ehMenor } from '../lib/idade'
import {
  aguardarRastrosPendentes,
  type DadosDaGeracao,
  langfuse,
  novoIdDeRastro,
  pseudonimo,
  registrarFechamento,
  type StatusDaChamada,
  type ValorDeMetadado,
} from '../lib/langfuse'
import { log } from '../lib/logger'
import { salDoPseudonimo } from '../lib/pseudonimoDeUsuario'
import { fornecedorDaBase } from './registroDeProvedores'

/** A função de produto que a requisição serve — a dimensão "feature" do painel. `tts`: a voz natural do intérprete (E4 da Fase E). */
export type FuncaoTelemetrada =
  | 'stt'
  | 'mt-fala'
  | 'mt-texto'
  | 'mt-alternativas'
  | 'tutor'
  | 'corretor'
  | 'byok-chat'
  | 'tts'

/** Os metadados de RASTRO que as rotas podem anotar. Lista fechada: nada de texto livre. */
export interface AnotacoesDoRastro {
  cacheHit?: boolean
  /** `pt-en`, `auto-pt`… só códigos de idioma saneados (`codigoDeIdioma`). */
  parDeIdiomas?: string
  menor?: boolean
  byok?: boolean
  /** Segmentos que o filtro de qualidade do STT descartou (sem fala + repetição + alucinação). */
  segmentosDescartados?: number
  /** O nível da tradução/tutor que o plano recebeu (B3): `rapida`, `nuance`, `polimento`. */
  nivel?: NivelDaTraducao
  /** A política de custo começou no degrau mais barato (B4): `orcamento_70` ou `orcamento_90`. */
  degradacao?: 'orcamento_70' | 'orcamento_90'
  /** Quantas entradas do glossário pessoal foram ao pedido (D3 da Fase D) — o número, nunca o texto. */
  glossario?: number
}

/** O id da sessão de captura que o cliente PODE mandar. Formato fechado; fora dele, ignorado. */
const SESSAO_VALIDA = /^[A-Za-z0-9_-]{8,64}$/

/** Código de idioma saneado para metadado: `pt`, `pt-BR`, `zh-Hans`. Fora disso, `outro`. */
export function codigoDeIdioma(v: unknown): string {
  if (typeof v !== 'string' || !v) return 'auto'
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/.test(v) ? v : 'outro'
}

/**
 * O nome NEUTRO do provedor pela base — nunca a URL: no BYOK ela é escolha do usuário, e mesmo no
 * gerenciado não há por que mandá-la a um terceiro. Desde o B1 da Fase B a resposta sai do registro
 * (`fornecedorDaBase`): o `id` declarado em `IA_PROVEDORES` quando a base é de um provedor dele;
 * senão, pelo host — `groq`, `openrouter`, `deepinfra`, `cerebras`, `cloudflare`, `ollama` ou `outro`.
 * É uma lista FECHADA: o rótulo nunca carrega texto que o usuário escolheu.
 */
export function nomeDoProvedor(base: string): string {
  return fornecedorDaBase(base)
}

/** O status de uma tentativa a partir do HTTP (0 = rede/timeout) e da causa. */
export function statusDaTentativa(http: number | undefined, causa?: string): StatusDaChamada {
  if (http === 429) return '429'
  if (http === 200) return 'vazio' // 200 sem conteúdo: o `llmClient` só devolve falha 200 assim
  if (http !== undefined && http >= 200 && http < 300) return 'ok'
  if (http !== undefined && http >= 500) return '5xx'
  if (http !== undefined && http >= 400) return '4xx'
  return causa && /sem resposta|abort|timeout/i.test(causa) ? 'timeout' : 'rede'
}

/* ─────────────────────── alerta de limite do provedor (429) ─────────────────────── */

const JANELA_DO_AVISO_MS = 60_000
const ultimoAviso = new Map<string, number>()

/**
 * Um 429 do provedor: conta na métrica SEMPRE, e avisa no log NO MÁXIMO uma vez por minuto por
 * provedor. O aviso entra em `AVISOS_QUE_ALERTAM` (logger), então chega ao Sentry — é o sinal de
 * que a camada contratada não aguenta o tráfego. Um por minuto e não um por 429: numa janela de
 * limite o provedor responde 429 a TODA chamada, e mil avisos iguais só queimam a cota do Sentry.
 */
export function registrarLimiteDoProvedor(provedor: string, modelo: string, agora = Date.now()): void {
  try {
    contarLimiteDoProvedor(provedor, modelo)
    const ultimo = ultimoAviso.get(provedor) ?? 0
    if (agora - ultimo < JANELA_DO_AVISO_MS) return
    ultimoAviso.set(provedor, agora)
    log('warn', {
      event: 'ia_provedor_limite',
      provider: provedor,
      status: 429,
      error:
        `limite de taxa do provedor ${provedor} (modelo ${modelo}) atingido; ` +
        'se se repetir, suba o tier/plano no painel do provedor ou configure a reserva (LLM_RESERVA_*)',
    })
  } catch (err) {
    /* telemetria quebrada não derruba o request que ela observa — mas deixa rastro no log */
    avisarFalha(err)
  }
}

function avisarFalha(err: unknown): void {
  log('warn', { event: 'telemetria_ia_falhou', error: String((err as Error)?.message ?? err).slice(0, 160) })
}

/** Só para os testes: esquece a janela do aviso. */
export function esquecerAvisosDeLimite(): void {
  ultimoAviso.clear()
}

/* ─────────────────────────────── o rastro ─────────────────────────────── */

/** Uma tentativa, como a rota a descreve. `tentativa` é numerada pelo rastro. */
export type TentativaDeIa = Omit<DadosDaGeracao, 'tentativa' | 'nome' | 'id'> & { nome?: string }

export interface RastroDeIa {
  /** Conteúdo (entrada/saída) só é guardado quando a telemetria o permite — ver `langfuse.ts`. */
  readonly conteudoPermitido: boolean
  anotar(a: AnotacoesDoRastro): void
  tentativa(t: TentativaDeIa): void
  /** Fecha o rastro. Não espera nada: plano e perfil são resolvidos depois, fora da rota. */
  encerrar(statusHttp: number): void
}

const RASTRO_NULO: RastroDeIa = {
  conteudoPermitido: false,
  anotar() {},
  tentativa() {},
  encerrar() {},
}

/**
 * AMOSTRAGEM (Fase 3 da auditoria de prontidão). O Langfuse cobra por unidade, e cada chamada gera
 * duas (rastro + geração): sem amostrar, a observabilidade custava MAIS que a própria IA no plano
 * Essencial (R$ 6,29 contra R$ 2,79 por assinante/mês, `fase3-custo.md`). Amostra-se só o que deu
 * certo e de primeira: erro, 429, fallback e retentativa vão SEMPRE — é o que se investiga. O custo
 * e a latência agregados não dependem disto: vêm do Prometheus e da tabela `gasto_de_ia`.
 */
export function taxaDeAmostragem(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = env.LANGFUSE_AMOSTRAGEM
  const n = bruto === undefined || bruto.trim() === '' ? NaN : Number(bruto)
  if (Number.isFinite(n)) return Math.min(1, Math.max(0, n))
  return env.NODE_ENV === 'production' ? 0.1 : 1
}

/** O rastro precisa ir, independentemente da amostra? */
export function rastroObrigatorio(statusHttp: number, geracoes: Pick<DadosDaGeracao, 'status'>[]): boolean {
  return statusHttp >= 400 || geracoes.length > 1 || geracoes.some((g) => g.status !== 'ok')
}

/** Reexportado para os testes das rotas esperarem o envio sem dormir. */
export { aguardarRastrosPendentes }

/**
 * Abre o rastro de UMA requisição. Telemetria desligada (sem chaves e sem arquivo) devolve um
 * rastro que não faz nada — custo zero no caminho da requisição.
 */
export function abrirRastro(req: Request, funcao: FuncaoTelemetrada): RastroDeIa {
  let cliente
  try {
    cliente = langfuse()
  } catch {
    return RASTRO_NULO
  }
  if (!cliente.ligado) return RASTRO_NULO

  const inicio = Date.now()
  const id = novoIdDeRastro()
  const userId = req.userId as UserId | undefined
  const sessaoBruta = typeof req.header === 'function' ? req.header('x-sessao-captura') : undefined
  const anotacoes: AnotacoesDoRastro = {}
  const geracoes: DadosDaGeracao[] = []
  let fechado = false

  return {
    conteudoPermitido: cliente.conteudoPermitido,
    anotar(a) {
      Object.assign(anotacoes, a)
    },
    tentativa(t) {
      if (fechado) return
      const g: DadosDaGeracao = { ...t, nome: t.nome ?? funcao, tentativa: geracoes.length + 1 }
      if (!cliente.conteudoPermitido) {
        delete g.entrada
        delete g.saida
      }
      geracoes.push(g)
    },
    encerrar(statusHttp) {
      if (fechado) return
      fechado = true
      if (!rastroObrigatorio(statusHttp, geracoes) && Math.random() >= taxaDeAmostragem()) return
      const fim = Date.now()
      const p = (async () => {
        try {
          /* Plano e perfil DEPOIS da resposta, e cada um com a sua rede: um banco lento aqui só
             atrasa a telemetria, e um erro vira `desconhecido` em vez de sumir com o rastro. */
          const plano = userId ? await getPlanForUser(userId).catch(() => 'desconhecido') : 'anonimo'
          const menor = anotacoes.menor ?? (userId ? await ehMenor(userId).catch(() => undefined) : undefined)
          const s = await salDoPseudonimo()
          const sessao =
            sessaoBruta && SESSAO_VALIDA.test(sessaoBruta) ? pseudonimo(s, 'sessao:' + sessaoBruta) : undefined
          const metadados: Record<string, ValorDeMetadado | undefined> = {
            plano,
            feature: funcao,
            statusHttp,
            tentativas: geracoes.length,
            fallback: geracoes.length > 1,
            cacheHit: anotacoes.cacheHit,
            parDeIdiomas: anotacoes.parDeIdiomas,
            menor,
            byok: anotacoes.byok,
            segmentosDescartados: anotacoes.segmentosDescartados,
            nivel: anotacoes.nivel,
            degradacao: anotacoes.degradacao,
            glossario: anotacoes.glossario,
            custoUsd: somaDeCusto(geracoes),
          }
          cliente.enviar({
            id,
            nome: funcao,
            inicio,
            fim,
            usuario: userId ? pseudonimo(s, String(userId)) : undefined,
            sessao,
            tags: [funcao, String(plano)],
            metadados,
            geracoes: geracoes.map((g) => ({
              ...g,
              metadados: { ...g.metadados, plano, feature: funcao, menor },
            })),
          })
        } catch (err) {
          avisarFalha(err)
        }
      })()
      registrarFechamento(p)
    },
  }
}

function somaDeCusto(geracoes: DadosDaGeracao[]): number | undefined {
  let total = 0
  let algum = false
  for (const g of geracoes) {
    if (g.custoUsd !== undefined && Number.isFinite(g.custoUsd)) {
      total += g.custoUsd
      algum = true
    }
  }
  return algum ? total : undefined
}
