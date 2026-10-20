/**
 * ADMISSÃO DE IA AO VIVO (ADR 0007) — quem entra na nuvem, e quando.
 *
 * O PROBLEMA MEDIDO (`openspec/audits/2026-09-25-prontidao/fase2-escala.md` §3 e §4.3). A conta do
 * provedor é UMA para o app inteiro: 20 STT por minuto e 1.000 pedidos de LLM por dia na camada
 * atual da Groq. A partir de ~67 cadastrados o limite por minuto quebra, e cada 429 virava TRÊS
 * pedidos por causa da retentativa do STT. A legenda ao vivo é tempo real: resposta que chega 10 s
 * depois não tem valor, então fila não serve — o certo é recusar RÁPIDO e o cliente cair no motor
 * local na hora.
 *
 * O QUE ESTE MÓDULO FAZ, em ordem de consulta:
 *
 *   1. VAGA EM VOO POR USUÁRIO — 1 STT e 2 LLM (tradução + tutor) ao mesmo tempo. Uma aba que
 *      dispara falas em paralelo não pode esvaziar o bucket de todo mundo sozinha.
 *   2. TOKEN BUCKET POR PROVEDOR E MODELO, NO BANCO — capacidade = pedidos por minuto, reabastecido de
 *      forma contínua (preguiçosa: quem reserva desconta o que escorreu); ao lado, os tetos DIÁRIOS de
 *      pedidos e de tokens, em janela fixa do dia UTC (como a Groq conta).
 *   3. PRIORIDADE POR PLANO, como LIMIAR sobre o saldo: o Premium (e o self-host) alcança o bucket
 *      inteiro; quem não paga — convidado, Grátis sem alívio e, no C6, o TESTE do Premium — para na
 *      metade (ou antes, se a reserva dos pagantes passar disso); a nuvem de alívio do Grátis (A10)
 *      só usa os 20% de cima — os 80% são de quem paga. Assim quem paga nunca encontra o bucket vazio
 *      por causa de quem não paga. (Matriz v3, ADR 0013: os três planos pagos dividem a MESMA
 *      faixa de pagante — quem separa um do outro é a cota de cada um, não a prioridade. A faixa do
 *      meio que o Essencial da v1 ocupava não voltou.)
 *   4. O 429 DO PROVEDOR FECHA O BUCKET até o `Retry-After` dele, para todas as instâncias. O provedor
 *      sabe mais do que o nosso contador (outro app na mesma organização). Passado o prazo, vale o saldo
 *      que o balde tiver (o 429 não o zera desde a tarefa 8 da Fase 2).
 *   5. OS LIMITES SÃO OS DO REGISTRO (B4 da Fase B, 29/09/2026). As `IA_ADMISSAO_*` são os da camada
 *      da Groq, e valiam para QUALQUER provedor: com a DeepInfra (muito mais que 30 por minuto) o
 *      balde recusaria à toa; com uma conta nova do Workers AI, deixaria passar até o 429. Agora a
 *      perna leva os `limites` que o registro declara (`registroDeProvedores.ts`): os do MODELO valem
 *      para o balde dele; os do PROVEDOR (sem os do modelo) para UM balde de todos os modelos dele
 *      naquela função — o teto é da conta, e dois baldes cheios somariam o dobro; sem nenhum, as
 *      `IA_ADMISSAO_*` de sempre (o legado inteiro). Dimensão declarada ausente é SEM TETO nela: o
 *      operador escreveu o que sabe, e herdar o número da Groq seria inventar. O `tpm` (tokens por
 *      minuto), que a admissão não tinha, é um balde de tokens ao lado do de pedidos.
 *
 * Tudo é consultado ANTES de reservar a cota do usuário e ANTES de chamar o provedor. Recusa é 429
 * `nuvem_ocupada` com `Retry-After` em segundos.
 *
 * ESTADO NO BANCO (Fase 2, tarefa 8; ADR 0007 revisto). Os baldes, o bloqueio do 429 e as vagas em voo
 * moram na tabela `admissao_de_ia` (`server/db/repositories/admissaoDeIa.ts`), reservados numa instrução
 * atômica: com várias instâncias (isolates do Worker, réplicas) a soma nunca passa do limite da conta.
 * O minuto continua token bucket contínuo: a linha `min` de cada balde guarda o `usado` e o instante, e a
 * própria instrução de reserva desconta o que escorreu (`limite / 60.000` por ms) — sem pico de 2× na
 * virada do minuto, e a recusa pede a espera de um pedido (~3 s a 20 rpm). A memória do processo guarda só
 * o que não decide admissão: os limites em vigor de cada balde, o último saldo visto (gauge) e um CACHE DE
 * RECUSA de até 1 s (`recusasRecentes`, consultado também antes da vaga em voo: `recusaEmCacheDeTodas`).
 */
import { ehPlanoPago, normalizarPlano } from '../../src/core/planos'
import { admissaoDeIaRepo, JANELA_DO_MINUTO, type Reserva, TIPOS_DE_IA } from '../db/repositories/admissaoDeIa'
import { contarAdmissaoRecusada, registrarLeitorDeSaldo } from '../http/metricas'
import { configDeAdmissao } from '../lib/config'
import type { LimitesDeclarados } from './registroDeProvedores'

/** `tts`: a voz natural do modo intérprete (E4 da Fase E) — balde e vaga em voo próprios, sem tokens. */
export type TipoDeIa = (typeof TIPOS_DE_IA)[number]
export type PlanoDeAdmissao = 'premium' | 'gratis' | 'alivio'
export type MotivoDeRecusa = 'minuto' | 'tokens_minuto' | 'dia' | 'tokens_dia' | 'provedor_limitou' | 'em_voo'

export interface Recusa {
  motivo: MotivoDeRecusa
  /** Segundos inteiros até valer a pena tentar de novo (>= 1). */
  retryAfterS: number
}

/**
 * A RESERVA DOS PAGANTES NA CAPACIDADE (A10): a nuvem de alívio do Grátis nunca alcança os 80% de
 * baixo do balde (pedidos por minuto, por dia e tokens por dia). O dinheiro tem a mesma reserva, no
 * pool do dia (`src/core/nuvemDeAlivio.ts`).
 */
export const PISO_DO_ALIVIO = 0.8

/**
 * O plano da assinatura vira uma das faixas de prioridade. A faixa `premium` é a de QUEM PAGA — todo
 * plano pago da matriz (`ehPlanoPago`), e não um nome: um plano pago novo entra nela sem tocar aqui.
 * `selfhost` também: a chave é do próprio dono. A requisição da nuvem de alívio (A10: conta Grátis, oferta aceita, franquia conferida na porta)
 * é `alivio`. O TESTE de 14 dias do Premium (C6) tem os entitlements do Premium mas entra como
 * `gratis`: ele ainda não paga, e a capacidade de quem paga não pode encolher por causa de uma
 * campanha de teste. Todo o resto (free sem alívio, anônimo/convidado) é `gratis` — o seguro.
 * O nome antigo (`pro`) é lido como Premium, como em toda fronteira.
 */
export function planoDeAdmissao(plan: string | undefined, alivio = false, teste = false): PlanoDeAdmissao {
  if (alivio) return 'alivio'
  if (teste) return 'gratis'
  const plano = normalizarPlano(plan)
  if (ehPlanoPago(plano) || plano === 'selfhost') return 'premium'
  return 'gratis'
}

/**
 * A fração do limite que o plano NÃO alcança. `reservaDosPagantes` é a fração do saldo que só quem
 * paga alcança (`IA_ADMISSAO_RESERVA_PRO`, 0,2 por padrão): ela só pesa quando passa do piso de
 * cada faixa gratuita (metade do balde; 80% no alívio).
 */
export function pisoDoPlano(plano: PlanoDeAdmissao, reservaDosPagantes: number): number {
  if (plano === 'premium') return 0
  if (plano === 'alivio') return Math.max(PISO_DO_ALIVIO, reservaDosPagantes)
  return Math.max(0.5, reservaDosPagantes)
}

/** Os limites efetivos de UM balde. `0` numa dimensão = sem teto nela. */
interface LimitesDoBalde {
  rpm: number
  tpm: number
  rpd: number
  tpd: number
}

/**
 * DE QUEM É O BALDE: provedor, modelo e, desde o B4, os limites que o registro declarou para a perna
 * e se eles são da CONTA no provedor (`compartilhado`: um balde só para todos os modelos dele).
 */
export interface AlvoDoBalde {
  limites?: LimitesDeclarados
  compartilhado?: boolean
}

/**
 * O QUE ESTA INSTÂNCIA SABE de um balde — nunca o saldo que admite (esse é do banco): as chaves, os
 * limites em vigor e o último `usado` do minuto que ela viu (só para o gauge de `/metrics`).
 */
interface Balde {
  provedor: string
  modelo: string
  /** Pedidos (minuto, dia) e o bloqueio do 429. */
  chave: string
  /** Tokens (minuto, dia). */
  chaveDeTokens: string
  lim: LimitesDoBalde
  /** Os limites vieram do registro? Então quem pergunta sem eles (o gauge, um repique) não os troca pelos do env. */
  declarado: boolean
  /** Último `usado` efetivo de pedidos do minuto que esta instância viu, e quando (gauge). */
  usadoVisto: number
  vistoEm: number
}

const baldes = new Map<string, Balde>()

/**
 * CACHE DE RECUSA (por instância). Depois de uma recusa do banco, o mesmo balde e plano é recusado aqui,
 * sem ir ao banco, por até `CACHE_DE_RECUSA_MS` — e nunca depois de o balde ter saldo de novo (`reabre`).
 * Numa rajada contra um balde vazio, cada isolate vai ao banco no máximo uma vez por segundo. O custo:
 * uma vaga aberta por outra instância (ticket devolvido lá) demora até 1 s para ser vista aqui. Um ticket
 * devolvido NESTA instância apaga a recusa do balde na hora.
 */
const CACHE_DE_RECUSA_MS = 1_000
/** `ate`: fim do cache; `reabre`: quando o balde (o dia, ou o bloqueio) que recusou abre de novo. */
const recusasRecentes = new Map<string, { em: number; ate: number; reabre: number; motivo: MotivoDeRecusa }>()

const diaUtc = (agora: number) => new Date(agora).toISOString().slice(0, 10)
function inicioDoProximoDia(agora: number): number {
  const d = new Date(agora)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
}

/** Folga de ponto flutuante no teto: 20 × (1 − 0,8) dá 3,999…, e o 4º pedido do alívio tem de caber. */
const FOLGA = 1e-9

/**
 * Os limites do balde: os DECLARADOS na perna, dimensão a dimensão (ausente = sem teto), ou, sem
 * declaração nenhuma, as `IA_ADMISSAO_*` — o comportamento de sempre, que é o do legado inteiro.
 */
function limitesDe(tipo: TipoDeIa, declarados?: LimitesDeclarados): LimitesDoBalde {
  if (declarados) {
    return {
      rpm: declarados.rpm ?? 0,
      tpm: tipo === 'llm' ? (declarados.tpm ?? 0) : 0,
      rpd: declarados.rpd ?? 0,
      tpd: tipo === 'llm' ? (declarados.tpd ?? 0) : 0,
    }
  }
  const c = configDeAdmissao()
  const l = tipo === 'stt' ? c.stt : tipo === 'tts' ? c.tts : c.llm
  return { rpm: l.rpm, tpm: 0, rpd: l.rpd, tpd: l.tpd }
}

/** O balde do par provedor + modelo (`*` quando os limites são da conta no provedor), com os limites de agora. */
function baldeDe(tipo: TipoDeIa, provedor: string, modelo: string, alvo: AlvoDoBalde = {}): Balde {
  const doBalde = alvo.compartilhado && alvo.limites ? '*' : modelo
  const chave = `bucket:${provedor}:${doBalde}:${tipo}`
  const lim = limitesDe(tipo, alvo.limites)
  let b = baldes.get(chave)
  if (!b) {
    b = {
      provedor,
      modelo: doBalde,
      chave,
      chaveDeTokens: `tokens:${provedor}:${doBalde}:${tipo}`,
      lim,
      declarado: Boolean(alvo.limites),
      usadoVisto: 0,
      vistoEm: 0,
    }
    baldes.set(chave, b)
    return b
  }
  /* Os limites valem os de AGORA (o registro ou o env podem ter mudado) — menos quando quem pergunta
     não traz os declarados de um balde que os tem: aí os dele continuam. */
  if (alvo.limites || !b.declarado) {
    b.lim = lim
    b.declarado = Boolean(alvo.limites)
  }
  return b
}

/** Anota o `usado` efetivo de pedidos do minuto que esta instância viu (gauge). */
function verUsado(b: Balde, agora: number, usado: number): void {
  b.vistoEm = agora
  b.usadoVisto = usado
}

/** Esquece as recusas em cache de um balde (todas as faixas): ele acabou de ganhar folga nesta instância. */
function esquecerRecusasDo(b: Balde): void {
  for (const k of recusasRecentes.keys()) if (k.startsWith(`${b.chave}|`)) recusasRecentes.delete(k)
}

/**
 * O pedido admitido no BALDE de um modelo. Quem admitiu é dono dele: se o provedor NÃO for chamado
 * (cota do usuário recusou, áudio ilegível), `devolver()` põe o pedido de volta — recusa nossa não
 * pode gastar o limite do provedor. Guarda as JANELAS em que reservou: devolver e acertar mexem nelas,
 * mesmo que o dia já tenha virado. A falha do banco ao devolver ou acertar NÃO é retentada: propaga a
 * quem chamou e o balde fica com o pedido (erro para menos, que o reabastecimento do minuto absorve).
 */
export class TicketDeBalde {
  private devolvido = false
  constructor(
    private readonly balde: Balde,
    private readonly reservas: Reserva[],
    private readonly dia: string,
    private tokens: number,
  ) {}

  async devolver(): Promise<void> {
    if (this.devolvido) return
    this.devolvido = true
    esquecerRecusasDo(this.balde)
    const desfazer = this.reservas.map((r) => ({
      chave: r.chave,
      janela: r.janela,
      delta: -r.custo,
    }))
    this.tokens = 0
    await admissaoDeIaRepo.ajustar(desfazer)
  }

  /** O provedor respondeu: os tokens do minuto e do dia passam da estimativa para o uso REAL. */
  async acertarTokens(reais: number): Promise<void> {
    if (this.devolvido || !Number.isFinite(reais) || reais < 0) return
    const delta = Math.round(reais) - this.tokens
    this.tokens = Math.round(reais)
    if (delta < 0) esquecerRecusasDo(this.balde) // a estimativa sobrou: o balde ganhou folga aqui
    const { tpm, tpd } = this.balde.lim
    const ajustes = [
      ...(tpm > 0 ? [{ chave: this.balde.chaveDeTokens, janela: JANELA_DO_MINUTO, delta }] : []),
      ...(tpd > 0 ? [{ chave: this.balde.chaveDeTokens, janela: this.dia, delta }] : []),
    ]
    await admissaoDeIaRepo.ajustar(ajustes)
  }
}

interface PedidoDeAdmissao extends AlvoDoBalde {
  tipo: TipoDeIa
  provedor: string
  modelo: string
  plano: PlanoDeAdmissao
  /** Tokens estimados (só LLM). */
  tokens?: number
  agora?: number
  /** Não conta a recusa na métrica — quem consulta várias pernas conta UMA vez no fim. */
  silenciosa?: boolean
}

/**
 * Consulta e CONSOME o balde, no banco, numa instrução (`admissaoDeIaRepo.reservarJuntas`): o bloqueio
 * do 429 e cada dimensão com teto — pedidos e tokens do minuto, pedidos e tokens do dia —, tudo ou nada.
 * O LIMIAR DO PLANO vira o teto da reserva: a faixa alcança `limite × (1 − piso)`. Não mexe na vaga em
 * voo (`ocuparVaga`): a perna de reserva da cascata é admitida no balde DELA, na hora de ser chamada.
 */
export async function admitirNoBalde(
  p: PedidoDeAdmissao,
): Promise<{ ok: true; ticket: TicketDeBalde } | { ok: false; recusa: Recusa }> {
  const agora = p.agora ?? Date.now()
  const cfg = configDeAdmissao()
  const piso = pisoDoPlano(p.plano, cfg.reservaDosPagantes)
  const tokens = Math.max(0, Math.round(p.tokens ?? 0))
  const b = baldeDe(p.tipo, p.provedor, p.modelo, p)
  const lim = b.lim

  const recusar = (motivo: MotivoDeRecusa, retryAfterS: number) => {
    if (!p.silenciosa) contarAdmissaoRecusada(motivo, p.plano)
    return {
      ok: false as const,
      recusa: { motivo, retryAfterS: Math.max(1, Math.ceil(retryAfterS)) },
    }
  }

  const chaveDoCache = `${b.chave}|${p.plano}`
  const emCache = recusasRecentes.get(chaveDoCache)
  if (emCache && agora >= emCache.em && agora < emCache.ate) {
    return recusar(emCache.motivo, (emCache.reabre - agora) / 1000)
  }
  if (emCache) recusasRecentes.delete(chaveDoCache)

  const dia = diaUtc(agora)
  const fracao = 1 - piso
  const itens: Array<Reserva & { motivo: MotivoDeRecusa }> = []
  if (lim.rpm > 0)
    itens.push({
      chave: b.chave,
      janela: JANELA_DO_MINUTO,
      custo: 1,
      teto: lim.rpm * fracao + FOLGA,
      taxa: lim.rpm / 60_000,
      motivo: 'minuto',
    })
  if (lim.tpm > 0 && tokens > 0) {
    /* Um pedido maior que a parte do plano conta como a parte inteira — senão ele nunca passaria, nem
       com a janela vazia; o excesso fica devendo (`usado` acima do teto) e segura os próximos. */
    const teto = lim.tpm * fracao
    itens.push({
      chave: b.chaveDeTokens,
      janela: JANELA_DO_MINUTO,
      custo: tokens,
      exigido: Math.min(tokens, teto),
      teto: teto + FOLGA,
      taxa: lim.tpm / 60_000,
      motivo: 'tokens_minuto',
    })
  }
  if (lim.rpd > 0)
    itens.push({
      chave: b.chave,
      janela: dia,
      custo: 1,
      teto: lim.rpd * fracao + FOLGA,
      motivo: 'dia',
    })
  if (lim.tpd > 0 && tokens > 0) {
    itens.push({
      chave: b.chaveDeTokens,
      janela: dia,
      custo: tokens,
      teto: lim.tpd * fracao + FOLGA,
      motivo: 'tokens_dia',
    })
  }

  const r = await admissaoDeIaRepo.reservarJuntas(
    itens.map(({ motivo: _m, ...reserva }) => reserva),
    { agora, bloqueio: b.chave },
  )
  const iMinuto = itens.findIndex((i) => i.motivo === 'minuto')
  if (iMinuto >= 0) verUsado(b, agora, r.usados[iMinuto] ?? 0)
  if (r.ok === true) return { ok: true, ticket: new TicketDeBalde(b, itens, dia, tokens) }
  return recusarPeloBanco(r)

  function recusarPeloBanco(n: { bloqueadoAte?: number; recusadas: number[]; usados: number[] }) {
    let motivo: MotivoDeRecusa
    let reabre: number
    const i = n.recusadas[0]
    const item = itens[i]
    if (n.bloqueadoAte) {
      motivo = 'provedor_limitou'
      reabre = n.bloqueadoAte
    } else if (item?.taxa) {
      /* O MINUTO: quanto falta escorrer para este pedido caber — `(usado + exigido − teto) / taxa`. */
      motivo = item.motivo
      const falta = (n.usados[i] ?? 0) + (item.exigido ?? item.custo) - item.teto
      reabre = agora + Math.max(0, falta) / item.taxa
    } else {
      motivo = item?.motivo ?? 'dia'
      reabre = inicioDoProximoDia(agora)
    }
    recusasRecentes.set(chaveDoCache, { em: agora, ate: Math.min(agora + CACHE_DE_RECUSA_MS, reabre), reabre, motivo })
    return recusar(motivo, (reabre - agora) / 1000)
  }
}

/**
 * QUANTO SOBRA NO BALDE, de 0 a 1 — a "demanda" da política de custo (`politicaDeCusto.ts`, B4): a
 * menor das dimensões com teto (pedidos e tokens do minuto, pedidos e tokens do dia). Fechado pelo
 * 429 do provedor, zero; sem teto nenhum, 1. Só LÊ (uma instrução): não consome nem conta recusa.
 */
export async function fracaoDoBalde(
  p: AlvoDoBalde & {
    tipo: TipoDeIa
    provedor: string
    modelo: string
    agora?: number
  },
): Promise<number> {
  const agora = p.agora ?? Date.now()
  const b = baldeDe(p.tipo, p.provedor, p.modelo, p)
  const { rpm, tpm, rpd, tpd } = b.lim
  const dia = diaUtc(agora)
  const dimensoes = [
    { limite: rpm, chave: b.chave, janela: JANELA_DO_MINUTO, taxa: rpm / 60_000 },
    { limite: tpm, chave: b.chaveDeTokens, janela: JANELA_DO_MINUTO, taxa: tpm / 60_000 },
    { limite: rpd, chave: b.chave, janela: dia },
    { limite: tpd, chave: b.chaveDeTokens, janela: dia },
  ].filter((d) => d.limite > 0)
  const lido = await admissaoDeIaRepo.ler(dimensoes, b.chave, agora)
  if (lido.bloqueadoAte) return 0
  const fracoes = dimensoes.map((d, i) => 1 - lido.usados[i] / d.limite)
  return Math.max(0, Math.min(1, ...fracoes))
}

/**
 * A RECUSA EM CACHE QUE VALE PARA TODAS AS PERNAS — consultada pelos chamadores ANTES de `ocuparVaga`:
 * se todo balde candidato está recusado no cache desta instância, a fala recusada em rajada faz ZERO
 * idas ao banco (nem a vaga em voo). Devolve a menor espera (a primeira perna que voltar atende), ou
 * `null` se alguma perna precisa ir ao banco. Não conta a recusa na métrica: quem chama conta uma vez.
 */
export function recusaEmCacheDeTodas(
  tipo: TipoDeIa,
  alvos: Array<AlvoDoBalde & { provedor: string; modelo: string }>,
  plano: PlanoDeAdmissao,
  agora = Date.now(),
): Recusa | null {
  if (alvos.length === 0) return null
  let menor: Recusa | null = null
  for (const a of alvos) {
    const b = baldeDe(tipo, a.provedor, a.modelo, a)
    const c = recusasRecentes.get(`${b.chave}|${plano}`)
    if (!c || agora < c.em || agora >= c.ate) return null
    const retryAfterS = Math.max(1, Math.ceil((c.reabre - agora) / 1000))
    if (!menor || retryAfterS < menor.retryAfterS) menor = { motivo: c.motivo, retryAfterS }
  }
  return menor
}

/**
 * Ocupa uma vaga EM VOO do usuário, no banco (uma instrução). Devolve a função que a libera
 * (idempotente; chame num `finally`), ou `null` quando ele já está no teto — 1 STT, 2 LLM e 1 voz
 * natural por padrão. Vaga parada há mais de `VOO_PARADO_MS[tipo]` (isolate que caiu sem soltar) não conta.
 */
export async function ocuparVaga(
  userId: string,
  tipo: TipoDeIa,
  agora = Date.now(),
): Promise<(() => Promise<void>) | null> {
  const cfg = configDeAdmissao()
  const teto = tipo === 'stt' ? cfg.emVooStt : tipo === 'tts' ? cfg.emVooTts : cfg.emVooLlm
  if (!(await admissaoDeIaRepo.entrarEmVoo(userId, tipo, teto, agora))) return null
  let liberada = false
  return async () => {
    if (liberada) return
    liberada = true
    await admissaoDeIaRepo.sairDeVoo(userId, tipo)
  }
}

/**
 * `Retry-After` do provedor em segundos: número ou data HTTP. Ausente ou ilegível → `undefined`.
 */
export function segundosDoRetryAfter(valor: string | null | undefined, agora = Date.now()): number | undefined {
  const t = valor?.trim()
  if (!t) return undefined
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(1, Math.ceil(Number(t)))
  const data = Date.parse(t)
  if (Number.isFinite(data)) return Math.max(1, Math.ceil((data - agora) / 1000))
  return undefined
}

/**
 * O PROVEDOR RESPONDEU 429: o balde fica fechado, no banco (para todas as instâncias), até o
 * `Retry-After` dele. Sem o cabeçalho, fecha pelo tempo de UM pedido no ritmo do minuto — o mínimo
 * que faz sentido esperar. Devolve a espera em segundos.
 */
export async function registrarLimiteNaAdmissao(
  tipo: TipoDeIa,
  provedor: string,
  modelo: string,
  retryAfterS?: number,
  agora = Date.now(),
  alvo: AlvoDoBalde = {},
): Promise<number> {
  const b = baldeDe(tipo, provedor, modelo, alvo)
  const lim = b.lim
  const espera = retryAfterS ?? (lim.rpm > 0 ? Math.ceil(60 / lim.rpm) : 5)
  verUsado(b, agora, lim.rpm)
  await admissaoDeIaRepo.bloquearAte(b.chave, agora + espera * 1000, agora)
  return Math.max(1, espera)
}

/**
 * O saldo do minuto de cada balde QUE ESTA INSTÂNCIA VIU (o último `usado` que o banco lhe devolveu,
 * reabastecido até agora) — para o gauge de `/metrics`. É a visão local: outra instância pode ter gastado
 * depois.
 */
export function saldosDaAdmissao(agora = Date.now()): Array<{ provedor: string; modelo: string; saldo: number }> {
  return [...baldes.values()].map((b) => {
    const { rpm } = b.lim
    const usado = Math.max(0, b.usadoVisto - (Math.max(0, agora - b.vistoEm) * rpm) / 60_000)
    return {
      provedor: b.provedor,
      modelo: b.modelo,
      saldo: Math.floor(Math.max(0, rpm - usado) * 100) / 100,
    }
  })
}

registrarLeitorDeSaldo(() => saldosDaAdmissao())

/** Só para os testes: esquece baldes, recusas em cache e os contadores no banco. */
export async function esquecerAdmissao(): Promise<void> {
  baldes.clear()
  recusasRecentes.clear()
  await admissaoDeIaRepo.esquecerTudo()
}
