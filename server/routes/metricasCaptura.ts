/**
 * `POST /api/metricas/captura` — telemetria ANÔNIMA de qualidade da captura.
 *
 * POR QUE EXISTE. `ia_provedor_latencia_ms` (server/ai) diz quanto o PROVEDOR demorou; não diz
 * quanto a PESSOA esperou. O primeiro parcial na tela, o texto final depois do fim da fala, a
 * tradução e o fator de tempo real do Whisper LOCAL só existem no navegador — e sem eles não há
 * como saber se uma mudança no VAD, no modelo ou na cadeia de fallback piorou a experiência.
 *
 * O QUE ELA NÃO É. Não guarda nada: cada lote vira observação em histograma do Prometheus
 * (`server/http/metricas.ts`) e some. Não tem identidade: a rota fica ANTES do `authMiddleware`,
 * então nem com sessão aberta existe `req.userId` aqui — e nada neste arquivo o procuraria. Com
 * `METRICS_ENABLED` desligado o lote é validado e descartado (204 do mesmo jeito: o cliente não
 * precisa saber como o servidor está configurado).
 *
 * O CONTRATO (o cliente manda exatamente isto; `v` é a versão do formato):
 *
 *   { v: 1, sttFinalMs: number[], primeiroParcialMs: number[], mtMs: number[], rtf: number[],
 *     descartesAlucinacao: number, fallbacks: Record<string, number>, motorStt: string,
 *     motorMt: string }
 *
 * O CONTRATO `v: 2` (telemetria de campo da latência da legenda, flag `rum_latencia`; openspec
 * `lab-medicao-legenda-traduzida`). Os campos do `v: 1` passam a ser opcionais; acrescenta-se:
 *
 *   { v: 2, classe, fimDaFalaAteLegenda?: { idioma, baldes: number[9], n, falhas, semTraducao },
 *     carga?: [{ modelo, fase, baldes: number[9] }],
 *     roteador?: { idioma, trocas, linhas: [{ tomaria, efetiva, motivo, rtf, fila, n }] } }
 *
 * `roteador` é o roteador adaptativo EM SOMBRA (flag `roteador_adaptativo_sombra`; openspec `roteador-adaptativo-em-sombra`):
 * `tomaria` é um de `DEGRAUS_ADAPTATIVOS`, `efetiva` um degrau da rota (`DEGRAUS_EFETIVOS`), `motivo` um de `MOTIVOS_DA_ROTA`,
 * `rtf` um balde 0..3 e `fila` um balde 0..2, `n` e `trocas` contagens grampeadas. TUDO fechado: valor fora da lista, balde
 * fora da faixa ou mais de `MAX_LINHAS_DO_ROTEADOR` linhas é 400 (não há como criar série por string inventada).
 *
 * SÓ LISTAS FECHADAS: `classe` é um dos 5 perfis de `src/lib/dispositivo/perfil.ts`, `idioma` é o idioma-base
 * (`pt|en|es`), `modelo` é motor do registro, `fase` é `download|compilacao|aquecimento`. Valor fora da lista de
 * classe, idioma ou modelo vira `outro` (não cria série); fase inventada, `baldes` que não tenha exatamente 9 contagens e
 * qualquer tipo errado são 400. Contagens são grampeadas em 0..200. O corpo NÃO tem texto, id nem hora, e o servidor só
 * incrementa histogramas (os baldes são os de `LIMITES_DOS_BALDES_DE_CAMPO_MS`).
 *
 * CARDINALIDADE É O RISCO, como em todo o `/metrics`: o nome do motor vira LABEL, e label com texto
 * livre do cliente é uma série nova por string inventada. Por isso o motor passa por um alfabeto
 * fechado (`[a-z0-9-]{1,40}`) e o que não casa vira `outro`; os números são grampeados em faixas
 * plausíveis em vez de recusados — um relógio de navegador que pulou não deve derrubar o lote todo.
 */
import { type Request, type Response, Router } from 'express'

import { REGISTRO_DE_MOTORES } from '../../src/core/harness/registroDeMotores'
import { DEGRAUS_ADAPTATIVOS, MOTIVOS_DA_ROTA } from '../../src/core/rota/politicaDeRota'
import {
  BALDES_DE_FILA,
  BALDES_DE_RTF,
  DEGRAUS_EFETIVOS,
  MAX_LINHAS_DO_ROTEADOR,
} from '../../src/core/rota/sombraDoRoteador'
import type { TipoDeDispositivo } from '../../src/lib/dispositivo/perfil'
import { LIMITES_DOS_BALDES_DE_CAMPO_MS, observarCaptura, type RelatorioDeCaptura } from '../http/metricas'

/** Itens por lista. Um lote é de uma sessão de captura, e 200 falas é mais que uma hora de conversa. */
export const MAX_ITENS = 200
/** Faixa das latências, em ms: 2 minutos é o teto de qualquer espera que ainda seja "latência". */
export const MAX_MS = 120_000
/** Faixa do fator de tempo real: 50× mais lento que a fala é a CPU mais fraca que ainda termina. */
export const MAX_RTF = 50
/** Chaves em `fallbacks`: um motor por elo da cadeia, com folga. */
const MAX_FALLBACKS = 20

const MOTOR = /^[a-z0-9-]{1,40}$/

/* Só motores CONHECIDOS viram rótulo: a rota é pública, e `[a-z0-9-]{1,40}` aceitava 36^40 nomes — cada um uma série nova
   no registro do prom-client. Id de motor e id de adaptador do registro; o resto cai em `outro`. */
const MOTORES_CONHECIDOS: ReadonlySet<string> = new Set(
  REGISTRO_DE_MOTORES.flatMap((m) => [m.id, m.adapterId]).filter((id): id is string => !!id),
)

const motorSaneado = (v: unknown): string =>
  typeof v === 'string' && MOTOR.test(v) && MOTORES_CONHECIDOS.has(v) ? v : 'outro'

/* As 5 classes de aparelho (`TipoDeDispositivo`); o `Record` faz o compilador acusar se o tipo mudar. */
const CLASSES: Record<TipoDeDispositivo, true> = {
  quest: true,
  'celular-fraco': true,
  'celular-bom': true,
  'desktop-sem-gpu': true,
  'desktop-com-gpu': true,
}
const IDIOMAS: ReadonlySet<string> = new Set(['pt', 'en', 'es'])
const FASES: ReadonlySet<string> = new Set(['download', 'compilacao', 'aquecimento'])
/** Os baldes do `v: 2`: 8 limites + o "acima de 10 s". */
const N_BALDES = LIMITES_DOS_BALDES_DE_CAMPO_MS.length + 1
/** Falas por lote no campo (o mesmo teto de itens do `v: 1`). */
const MAX_CONTAGEM = MAX_ITENS
const MAX_CARGAS = 20

const TOMARIA: ReadonlySet<string> = new Set(DEGRAUS_ADAPTATIVOS)
const EFETIVA: ReadonlySet<string> = new Set(DEGRAUS_EFETIVOS)
const MOTIVOS: ReadonlySet<string> = new Set(MOTIVOS_DA_ROTA)

const classeSaneada = (v: unknown): string => (typeof v === 'string' && Object.hasOwn(CLASSES, v) ? v : 'outro')

/** Idioma-base: `pt-BR` e `PT` viram `pt`; o que não é pt, en ou es vira `outro`. */
function idiomaSaneado(v: unknown): string {
  const base = typeof v === 'string' ? (v.toLowerCase().split('-')[0] ?? '') : ''
  return IDIOMAS.has(base) ? base : 'outro'
}

/** Exatamente `N_BALDES` contagens inteiras, grampeadas em `[0, MAX_CONTAGEM]`; `null` se o formato não bate. */
function baldesDeCampo(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length !== N_BALDES) return null
  const out: number[] = []
  for (const n of v) {
    const q = contagem(n)
    if (q === null) return null
    out.push(grampear(q, MAX_CONTAGEM))
  }
  return out
}

const grampear = (n: number, max: number): number => Math.min(max, Math.max(0, n))

/** Lista de números finitos com no máximo `MAX_ITENS`, grampeados em `[0, max]`; `null` se inválida. */
function listaDeNumeros(v: unknown, max: number): number[] | null {
  if (!Array.isArray(v) || v.length > MAX_ITENS) return null
  const out: number[] = []
  for (const n of v) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    out.push(grampear(n, max))
  }
  return out
}

/** Contagem inteira não negativa; `null` se não for número finito. */
function contagem(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.max(0, Math.floor(v))
}

/** A parte `v: 2` do corpo; `null` = fora do contrato. */
function validarCampo(c: Record<string, unknown>): NonNullable<RelatorioDeCaptura['campo']> | null {
  if (typeof c.classe !== 'string') return null
  const classe = classeSaneada(c.classe)

  let legenda: NonNullable<RelatorioDeCaptura['campo']>['legenda']
  if (c.fimDaFalaAteLegenda !== undefined) {
    const f = c.fimDaFalaAteLegenda
    if (!f || typeof f !== 'object' || Array.isArray(f)) return null
    const l = f as Record<string, unknown>
    const baldes = baldesDeCampo(l.baldes)
    const n = contagem(l.n)
    const falhas = contagem(l.falhas)
    const semTraducao = contagem(l.semTraducao)
    if (!baldes || n === null || falhas === null || semTraducao === null) return null
    legenda = {
      idioma: idiomaSaneado(l.idioma),
      baldes,
      n: grampear(n, MAX_CONTAGEM),
      falhas: grampear(falhas, MAX_CONTAGEM),
      semTraducao: grampear(semTraducao, MAX_CONTAGEM),
    }
  }

  const carga: NonNullable<RelatorioDeCaptura['campo']>['carga'] = []
  if (c.carga !== undefined) {
    if (!Array.isArray(c.carga) || c.carga.length > MAX_CARGAS) return null
    for (const item of c.carga) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const i = item as Record<string, unknown>
      const baldes = baldesDeCampo(i.baldes)
      if (!baldes || typeof i.fase !== 'string' || !FASES.has(i.fase)) return null
      carga.push({ modelo: motorSaneado(i.modelo), fase: i.fase, baldes })
    }
  }
  let roteador: NonNullable<RelatorioDeCaptura['campo']>['roteador']
  if (c.roteador !== undefined) {
    const r = validarRoteador(c.roteador)
    if (!r) return null
    roteador = r
  }
  return { classe, legenda, carga, roteador }
}

/** O campo `roteador` (sombra do roteador adaptativo): só listas fechadas e baldes; `null` = fora do contrato. */
function validarRoteador(v: unknown): NonNullable<NonNullable<RelatorioDeCaptura['campo']>['roteador']> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const trocas = contagem(r.trocas)
  if (trocas === null || !Array.isArray(r.linhas) || r.linhas.length > MAX_LINHAS_DO_ROTEADOR) return null
  const linhas: NonNullable<NonNullable<RelatorioDeCaptura['campo']>['roteador']>['linhas'] = []
  for (const item of r.linhas) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const l = item as Record<string, unknown>
    const rtf = contagem(l.rtf)
    const fila = contagem(l.fila)
    const n = contagem(l.n)
    if (typeof l.tomaria !== 'string' || !TOMARIA.has(l.tomaria)) return null
    if (typeof l.efetiva !== 'string' || !EFETIVA.has(l.efetiva)) return null
    if (typeof l.motivo !== 'string' || !MOTIVOS.has(l.motivo)) return null
    if (rtf === null || rtf >= BALDES_DE_RTF || fila === null || fila >= BALDES_DE_FILA || n === null) return null
    linhas.push({
      tomaria: l.tomaria,
      efetiva: l.efetiva,
      motivo: l.motivo,
      rtf,
      fila,
      n: grampear(n, MAX_CONTAGEM),
    })
  }
  return { idioma: idiomaSaneado(r.idioma), trocas: grampear(trocas, MAX_CONTAGEM), linhas }
}

/**
 * Valida e sanea o corpo. `null` = fora do contrato (a rota responde 400).
 *
 * Exportada para o teste: as regras de faixa e de alfabeto são o que protege o `/metrics`, e
 * merecem ser cobradas sem subir servidor.
 */
export function validarRelatorioDeCaptura(corpo: unknown): RelatorioDeCaptura | null {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return null
  const c = corpo as Record<string, unknown>
  if (c.v !== 1 && c.v !== 2) return null
  if (c.v === 2) return validarV2(c)
  return validarV1(c)
}

function validarV1(c: Record<string, unknown>): RelatorioDeCaptura | null {
  const sttFinalMs = listaDeNumeros(c.sttFinalMs, MAX_MS)
  const primeiroParcialMs = listaDeNumeros(c.primeiroParcialMs, MAX_MS)
  const mtMs = listaDeNumeros(c.mtMs, MAX_MS)
  const rtf = listaDeNumeros(c.rtf, MAX_RTF)
  const descartesAlucinacao = contagem(c.descartesAlucinacao)
  if (!sttFinalMs || !primeiroParcialMs || !mtMs || !rtf || descartesAlucinacao === null) return null
  if (typeof c.motorStt !== 'string' || typeof c.motorMt !== 'string') return null

  const brutos = c.fallbacks
  if (!brutos || typeof brutos !== 'object' || Array.isArray(brutos)) return null
  const entradas = Object.entries(brutos as Record<string, unknown>)
  if (entradas.length > MAX_FALLBACKS) return null
  const fallbacks: Record<string, number> = {}
  for (const [motor, n] of entradas) {
    const q = contagem(n)
    if (q === null) return null
    const chave = motorSaneado(motor)
    // Dois nomes inválidos caem no mesmo `outro`: somar, e não sobrescrever.
    fallbacks[chave] = (fallbacks[chave] ?? 0) + q
  }

  return {
    sttFinalMs,
    primeiroParcialMs,
    mtMs,
    rtf,
    descartesAlucinacao,
    fallbacks,
    motorStt: motorSaneado(c.motorStt),
    motorMt: motorSaneado(c.motorMt),
  }
}

/** `v: 2`: os campos do `v: 1` são opcionais (sem eles, listas vazias e `outro`) e a parte de campo é obrigatoriamente válida. */
function validarV2(c: Record<string, unknown>): RelatorioDeCaptura | null {
  const campo = validarCampo(c)
  if (!campo) return null
  const base = validarV1({
    sttFinalMs: [],
    primeiroParcialMs: [],
    mtMs: [],
    rtf: [],
    descartesAlucinacao: 0,
    fallbacks: {},
    motorStt: 'outro',
    motorMt: 'outro',
    ...c,
  })
  return base && { ...base, campo }
}

export const metricasCapturaRouter = Router()

metricasCapturaRouter.post('/captura', (req: Request, res: Response) => {
  const relatorio = validarRelatorioDeCaptura(req.body)
  if (!relatorio) {
    res.status(400).json({ error: 'relatório de captura fora do contrato', code: 'payload_invalido' })
    return
  }
  observarCaptura(relatorio)
  res.status(204).end()
})
