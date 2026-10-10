/**
 * LANGFUSE SEM SDK — custo, latência e qualidade de cada chamada de IA, por plano e por função.
 *
 * POR QUE EXISTE. O orçamento global (`orcamentoDeIa.ts`) diz QUANTO o mês custou e o Prometheus
 * (`server/http/metricas.ts`) diz a p95 por provedor. Nenhum dos dois responde a pergunta que decide
 * o preço dos planos: "quanto custa, de verdade, um assinante Essencial que usa o microfone uma hora
 * por dia?". Para isso é preciso o custo POR CHAMADA com o plano, a função e um identificador
 * estável do usuário ao lado — é o que o Langfuse agrega (custo por usuário, por tag, p50/p95).
 *
 * SEM SDK, pela mesma razão do Sentry (`server/lib/sentry.ts`): o SDK traria OpenTelemetry inteiro
 * como dependência, instrumentação automática que captura prompt e resposta por padrão, e mais uma
 * superfície de supply chain — para mandar um POST de JSON a cada 5 s. Aqui o que sai é montado
 * campo a campo, e o que não está nesta lista não sai.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * O ENDPOINT É O OTLP, NÃO O `/api/public/ingestion` — decisão tomada ao ler a referência da API
 * em 25/09/2026. A ingestão "clássica" (`trace-create`/`generation-create`) está DEPRECIADA no
 * Langfuse Cloud e, a partir de 16/11/2026, só aceita eventos de score. O caminho atual é
 * `POST /api/public/otel/v1/traces` em OTLP/HTTP **JSON** (o protobuf não é obrigatório), com o
 * cabeçalho `x-langfuse-ingestion-version: 4` para a ingestão em tempo real do modelo v4. Escrever
 * contra o endpoint velho seria entregar uma integração que morre sete semanas depois do deploy.
 *
 * O mapeamento de atributos é o documentado pelo Langfuse ("OpenTelemetry — property mapping"):
 *   span raiz              → o trace (`langfuse.trace.name`, `langfuse.user.id`, `langfuse.session.id`,
 *                            `langfuse.trace.tags`, `langfuse.trace.metadata.*`)
 *   span filho             → a geração (`langfuse.observation.type=generation`, `.model.name`,
 *                            `.usage_details` e `.cost_details` como JSON, `.level`,
 *                            `.status_message`, `langfuse.observation.metadata.*`)
 * Só `*.metadata.<chave>` vira metadado FILTRÁVEL no painel — por isso cada metadado é um atributo.
 *
 * O ARQUIVO (`LANGFUSE_ARQUIVO`) grava os MESMOS eventos, mas no formato legível de ingestão
 * (`{ id, timestamp, type: 'trace-create' | 'generation-create', body }`, com `usageDetails` e
 * `costDetails`): é para o dono analisar com DuckDB/planilha antes de o projeto no Langfuse existir,
 * e esse formato é o que se lê sem conhecer OTLP. Funciona mesmo sem chave nenhuma.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * TELEMETRIA NUNCA DERRUBA O QUE ELA OBSERVA:
 *   - `enviar()` só enfileira — síncrono, sem rede, sem lançar;
 *   - fila LIMITADA (1.000 eventos): acima disso o mais velho sai e `descartados` conta. Um Langfuse
 *     fora do ar por uma hora não pode virar vazamento de memória no servidor;
 *   - lote de 50 eventos ou a cada 5 s, timeout de 5 s, UMA retentativa. Sem backoff exponencial
 *     em fila: com o destino fora, cada lote custa no máximo duas tentativas e é descartado — o
 *     próximo lote tenta de novo sozinho, sem tempestade;
 *   - desligamento gracioso descarrega o que ficou (`server/lib/desligamento.ts`).
 *
 * PRIVACIDADE POR PADRÃO (LGPD; menores usam o app). O que sai: plano, função, provedor, modelo,
 * tokens, segundos de áudio, custo, latência, status, pseudônimo do usuário. O que NUNCA sai sem
 * `LANGFUSE_CONTEUDO=1`: texto de transcrição, tradução, prompt ou resposta do tutor. E
 * `LANGFUSE_CONTEUDO` é RECUSADA em produção — ver `opcoesDoAmbiente`.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { appendFile } from 'node:fs/promises'

/** Resultado de UMA tentativa contra o provedor — o que o painel agrupa como "status". */
export type StatusDaChamada =
  | 'ok'
  | '429'
  | '4xx'
  | '5xx'
  | 'timeout'
  | 'rede'
  | 'vazio'
  | 'filtrado-vazio'
  | 'disjuntor'
  /** Quem pediu desistiu e a chamada foi abortada (`server/ai/cancelamento.ts`): não é falha do provedor. */
  | 'cancelado'

export type ValorDeMetadado = string | number | boolean

export interface DadosDaGeracao {
  /** 16 hex (span id do OTLP). Ausente, é gerado. */
  id?: string
  nome: string
  /** Epoch em ms. */
  inicio: number
  fim: number
  /** Nome NEUTRO do provedor (`groq`, `openrouter`, `ollama`, `byok`) — nunca a URL. */
  provedor: string
  modelo: string
  status: StatusDaChamada
  /** 1 = primeira tentativa; 2+ = retentativa ou perna de reserva. */
  tentativa: number
  /** `input`/`output`/`cached_input` (tokens) ou `audio_seconds`/`audio_seconds_billed`. */
  uso?: Record<string, number>
  /** Custo ESTIMADO pela tabela única de `orcamentoDeIa.ts`. Ausente = não é dinheiro do dono. */
  custoUsd?: number
  metadados?: Record<string, ValorDeMetadado | undefined>
  /** Só saem com `conteudo` ligado (dev). Quem coleta já os descarta quando está desligado. */
  entrada?: string
  saida?: string
}

export interface DadosDoRastro {
  /** 32 hex (trace id do OTLP). */
  id: string
  nome: string
  inicio: number
  fim: number
  /** JÁ pseudonimizado (`pseudonimo`). */
  usuario?: string
  /** JÁ pseudonimizado. */
  sessao?: string
  tags: string[]
  metadados: Record<string, ValorDeMetadado | undefined>
  geracoes: DadosDaGeracao[]
}

/** O evento na fila: é também a linha do arquivo JSONL (depois de `paraLinha`). */
export type EventoNaFila =
  | { tipo: 'trace-create'; corpo: Omit<DadosDoRastro, 'geracoes'> }
  | { tipo: 'generation-create'; corpo: DadosDaGeracao & { traceId: string } }

export interface OpcoesDoLangfuse {
  chavePublica?: string
  chaveSecreta?: string
  /** Padrão: `https://cloud.langfuse.com` (região UE). */
  baseUrl?: string
  /** Caminho de um `.jsonl` para análise local. Funciona sem chaves. */
  arquivo?: string
  /** Texto de entrada/saída nas gerações. Só dev — `opcoesDoAmbiente` recusa em produção. */
  conteudo?: boolean
  ambiente?: string
  buscar?: typeof fetch
  /** Período do descarregamento automático. 0 = sem relógio (testes). */
  intervaloMs?: number
  loteMaximo?: number
  filaMaxima?: number
  timeoutMs?: number
}

const BASE_PADRAO = 'https://cloud.langfuse.com'
const INTERVALO_PADRAO_MS = 5_000
const LOTE_PADRAO = 50
const FILA_PADRAO = 1_000
const TIMEOUT_PADRAO_MS = 5_000

/**
 * As opções a partir do ambiente. `avisar` recebe a mensagem de recusa do conteúdo em produção —
 * é injetado para o teste ver o aviso sem depender do logger (e para este arquivo não importar o
 * logger só por isso: o logger é quem um dia pode querer mandar coisas para cá).
 */
export function opcoesDoAmbiente(
  env: Record<string, string | undefined> = process.env,
  avisar: (mensagem: string) => void = (m) => console.warn(m),
): OpcoesDoLangfuse {
  const pediuConteudo = env.LANGFUSE_CONTEUDO === '1'
  const producao = env.NODE_ENV === 'production'
  if (pediuConteudo && producao) {
    /* RECUSA, não aviso. O público inclui menores (LGPD art. 14): a fala de uma criança mandada a
       um terceiro "só para depurar" é exatamente o tratamento que a política de privacidade diz que
       não fazemos. Uma variável esquecida no painel do Fly não pode mudar isso. */
    avisar(
      JSON.stringify({
        ts: Date.now(),
        level: 'warn',
        event: 'langfuse_conteudo_recusado',
        error: 'LANGFUSE_CONTEUDO=1 ignorada em produção: texto do usuário nunca sai para o Langfuse aqui',
      }),
    )
  }
  return {
    chavePublica: env.LANGFUSE_PUBLIC_KEY?.trim() || undefined,
    chaveSecreta: env.LANGFUSE_SECRET_KEY?.trim() || undefined,
    baseUrl: env.LANGFUSE_BASE_URL?.trim() || BASE_PADRAO,
    arquivo: env.LANGFUSE_ARQUIVO?.trim() || undefined,
    conteudo: pediuConteudo && !producao,
    ambiente: env.NODE_ENV?.trim() || 'development',
  }
}

/**
 * PSEUDÔNIMO do usuário: HMAC-SHA256 com um sal que só o servidor tem, truncado em 96 bits.
 *
 * HMAC e não `sha256(id)`: o id é um UUID do Supabase, e um hash puro de um identificador que
 * aparece em outros lugares (logs do Supabase, e-mails de suporte) é reversível por quem tem a
 * lista de ids — basta hashear todos e comparar. Com o sal, o valor só é recalculável dentro do
 * servidor. É ESTÁVEL (mesmo usuário → mesmo pseudônimo), que é o que o Langfuse precisa para somar
 * custo por usuário; e não identifica ninguém fora daqui (LGPD art. 13, §4º).
 */
export function pseudonimo(sal: string | Buffer, id: string): string {
  return 'u_' + createHmac('sha256', sal).update(id).digest('hex').slice(0, 24)
}

export const novoIdDeRastro = (): string => randomBytes(16).toString('hex')
export const novoIdDeSpan = (): string => randomBytes(8).toString('hex')

/* ───────────────────────────── serialização ───────────────────────────── */

type ValorOtlp =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: ValorOtlp[] } }

interface AtributoOtlp {
  key: string
  value: ValorOtlp
}

function valorOtlp(v: ValorDeMetadado): ValorOtlp {
  if (typeof v === 'boolean') return { boolValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }
  return { stringValue: v }
}

const nano = (ms: number): string => (BigInt(Math.round(ms)) * 1_000_000n).toString()

/** O span raiz de um trace usa um id DERIVADO do trace, para a geração saber quem é o pai sem estado. */
const spanRaizDe = (traceId: string): string => traceId.slice(0, 16)

function nivelDe(status: StatusDaChamada): 'DEFAULT' | 'WARNING' | 'ERROR' {
  if (status === 'ok') return 'DEFAULT'
  /* 429 é AVISO, não erro: o provedor está pedindo para diminuir o ritmo — é o sinal de subir o
     tier, e a cascata geralmente salvou a chamada na reserva. `filtrado-vazio` é o filtro de
     qualidade funcionando; `disjuntor` é a proteção funcionando. `cancelado` é o cliente que
     desistiu: nada quebrou. */
  if (status === 'cancelado') return 'DEFAULT'
  if (status === '429' || status === 'filtrado-vazio' || status === 'disjuntor' || status === 'vazio') return 'WARNING'
  return 'ERROR'
}

function metadadosComoAtributos(prefixo: string, m: Record<string, ValorDeMetadado | undefined> | undefined) {
  const out: AtributoOtlp[] = []
  for (const [k, v] of Object.entries(m ?? {})) {
    if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) continue
    out.push({ key: `${prefixo}${k}`, value: valorOtlp(v) })
  }
  return out
}

/** Os metadados que uma geração SEMPRE leva, além dos que o chamador passou. */
function metadadosDaGeracao(g: DadosDaGeracao): Record<string, ValorDeMetadado | undefined> {
  return { provedor: g.provedor, status: g.status, tentativa: g.tentativa, ...g.metadados }
}

/** A fila em OTLP/JSON (`ExportTraceServiceRequest`). Exportada para o teste do formato. */
export function paraOtlp(eventos: EventoNaFila[], o: { ambiente?: string; conteudo?: boolean }) {
  const spans = eventos.map((e) => {
    if (e.tipo === 'trace-create') {
      const t = e.corpo
      const attributes: AtributoOtlp[] = [
        { key: 'langfuse.trace.name', value: { stringValue: t.nome } },
        { key: 'langfuse.observation.type', value: { stringValue: 'span' } },
        ...(t.usuario ? [{ key: 'langfuse.user.id', value: { stringValue: t.usuario } }] : []),
        ...(t.sessao ? [{ key: 'langfuse.session.id', value: { stringValue: t.sessao } }] : []),
        {
          key: 'langfuse.trace.tags',
          value: { arrayValue: { values: t.tags.map((s) => ({ stringValue: s })) } },
        },
        ...metadadosComoAtributos('langfuse.trace.metadata.', t.metadados),
        ...(o.ambiente ? [{ key: 'langfuse.environment', value: { stringValue: o.ambiente } }] : []),
      ]
      return {
        traceId: t.id,
        spanId: spanRaizDe(t.id),
        name: t.nome,
        kind: 2, // SERVER: é a requisição HTTP que o servidor atendeu
        startTimeUnixNano: nano(t.inicio),
        endTimeUnixNano: nano(t.fim),
        attributes,
        status: { code: 1 },
      }
    }
    const g = e.corpo
    const nivel = nivelDe(g.status)
    const attributes: AtributoOtlp[] = [
      { key: 'langfuse.observation.type', value: { stringValue: 'generation' } },
      { key: 'langfuse.observation.model.name', value: { stringValue: g.modelo } },
      { key: 'langfuse.observation.level', value: { stringValue: nivel } },
      ...(g.status !== 'ok'
        ? [{ key: 'langfuse.observation.status_message', value: { stringValue: `status ${g.status}` } }]
        : []),
      ...(g.uso && Object.keys(g.uso).length
        ? [{ key: 'langfuse.observation.usage_details', value: { stringValue: JSON.stringify(g.uso) } }]
        : []),
      ...(g.custoUsd !== undefined && Number.isFinite(g.custoUsd)
        ? [
            {
              key: 'langfuse.observation.cost_details',
              value: { stringValue: JSON.stringify({ total: g.custoUsd }) },
            },
          ]
        : []),
      ...metadadosComoAtributos('langfuse.observation.metadata.', metadadosDaGeracao(g)),
      ...(o.ambiente ? [{ key: 'langfuse.environment', value: { stringValue: o.ambiente } }] : []),
      ...(o.conteudo && g.entrada !== undefined
        ? [{ key: 'langfuse.observation.input', value: { stringValue: g.entrada } }]
        : []),
      ...(o.conteudo && g.saida !== undefined
        ? [{ key: 'langfuse.observation.output', value: { stringValue: g.saida } }]
        : []),
    ]
    return {
      traceId: g.traceId,
      spanId: g.id ?? novoIdDeSpan(),
      parentSpanId: spanRaizDe(g.traceId),
      name: g.nome,
      kind: 3, // CLIENT: a chamada que o servidor fez ao provedor
      startTimeUnixNano: nano(g.inicio),
      endTimeUnixNano: nano(g.fim),
      attributes,
      status: nivel === 'ERROR' ? { code: 2, message: `status ${g.status}` } : { code: 1 },
    }
  })
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'babel-play-server' } }],
        },
        scopeSpans: [{ scope: { name: 'babel-play/langfuse', version: '1' }, spans }],
      },
    ],
  }
}

/** A linha do arquivo: o formato de ingestão do Langfuse, que se lê sem conhecer OTLP. */
function paraLinha(e: EventoNaFila, conteudo: boolean): string {
  if (e.tipo === 'trace-create') {
    const t = e.corpo
    return JSON.stringify({
      id: t.id,
      timestamp: new Date(t.fim).toISOString(),
      type: 'trace-create',
      body: {
        id: t.id,
        name: t.nome,
        timestamp: new Date(t.inicio).toISOString(),
        userId: t.usuario,
        sessionId: t.sessao,
        tags: t.tags,
        metadata: { ...t.metadados, latenciaMs: t.fim - t.inicio },
      },
    })
  }
  const g = e.corpo
  return JSON.stringify({
    id: g.id,
    timestamp: new Date(g.fim).toISOString(),
    type: 'generation-create',
    body: {
      id: g.id,
      traceId: g.traceId,
      name: g.nome,
      startTime: new Date(g.inicio).toISOString(),
      endTime: new Date(g.fim).toISOString(),
      model: g.modelo,
      level: nivelDe(g.status),
      statusMessage: g.status === 'ok' ? undefined : `status ${g.status}`,
      usageDetails: g.uso,
      costDetails: g.custoUsd !== undefined ? { total: g.custoUsd } : undefined,
      metadata: { ...metadadosDaGeracao(g), latenciaMs: g.fim - g.inicio },
      ...(conteudo ? { input: g.entrada, output: g.saida } : {}),
    },
  })
}

/* ───────────────────────────── o cliente ───────────────────────────── */

export class ClienteLangfuse {
  /** Rede OU arquivo configurados. Desligado, `enviar` não faz nada. */
  readonly ligado: boolean
  /** Texto de entrada/saída permitido (dev). Quem coleta consulta ANTES de guardar o texto. */
  readonly conteudoPermitido: boolean
  /** Eventos jogados fora pela fila cheia. */
  descartados = 0
  /** Tentativas de POST que falharam (rede, timeout ou HTTP não-2xx). */
  falhas = 0
  /** Lotes desistidos depois da retentativa. */
  lotesPerdidos = 0

  private readonly rede: boolean
  private readonly url: string
  private readonly auth: string
  private readonly fila: EventoNaFila[] = []
  private readonly buscar: typeof fetch
  private readonly lote: number
  private readonly teto: number
  private readonly timeoutMs: number
  private relogio: ReturnType<typeof setInterval> | undefined
  private emCurso: Promise<void> | undefined

  constructor(private readonly o: OpcoesDoLangfuse = {}) {
    this.rede = Boolean(o.chavePublica && o.chaveSecreta)
    this.ligado = this.rede || Boolean(o.arquivo)
    this.conteudoPermitido = Boolean(o.conteudo)
    this.url = (o.baseUrl || BASE_PADRAO).replace(/\/+$/, '') + '/api/public/otel/v1/traces'
    this.auth = 'Basic ' + Buffer.from(`${o.chavePublica ?? ''}:${o.chaveSecreta ?? ''}`).toString('base64')
    /* Resolvido NA CHAMADA, não na construção: quem troca o `fetch` global depois (testes) é visto. */
    this.buscar = o.buscar ?? ((url, init) => fetch(url, init))
    this.lote = Math.max(1, o.loteMaximo ?? LOTE_PADRAO)
    this.teto = Math.max(1, o.filaMaxima ?? FILA_PADRAO)
    this.timeoutMs = o.timeoutMs ?? TIMEOUT_PADRAO_MS
    const intervalo = o.intervaloMs ?? INTERVALO_PADRAO_MS
    if (this.ligado && intervalo > 0) {
      this.relogio = setInterval(() => void this.descarregar(), intervalo)
      /* `unref`: o relógio da telemetria nunca é o motivo de o processo continuar vivo. */
      this.relogio.unref?.()
    }
  }

  pendentes(): number {
    return this.fila.length
  }

  /** Enfileira um rastro e as suas gerações. Síncrono; NUNCA lança. */
  enviar(r: DadosDoRastro): void {
    if (!this.ligado) return
    try {
      const { geracoes, ...trace } = r
      this.enfileirar({ tipo: 'trace-create', corpo: trace })
      for (const g of geracoes ?? []) {
        const corpo = { ...g, id: g.id ?? novoIdDeSpan(), traceId: r.id }
        if (!this.conteudoPermitido) {
          delete corpo.entrada
          delete corpo.saida
        }
        this.enfileirar({ tipo: 'generation-create', corpo })
      }
      if (this.fila.length >= this.lote) void this.descarregar()
    } catch {
      /* telemetria quebrada não derruba o request que ela observa */
    }
  }

  private enfileirar(e: EventoNaFila): void {
    this.fila.push(e)
    /* O MAIS VELHO sai: numa queda longa do destino, o que interessa ao voltar é o presente. */
    while (this.fila.length > this.teto) {
      this.fila.shift()
      this.descartados++
    }
  }

  /** Espera o envio em curso (se houver). Para testes e para o desligamento. */
  async aguardarEnvio(): Promise<void> {
    while (this.emCurso) await this.emCurso
  }

  /** Esvazia a fila, em lotes. Nunca lança. Chamadas concorrentes esperam a mesma. */
  async descarregar(): Promise<void> {
    if (this.emCurso) return await this.emCurso
    if (this.fila.length === 0) return
    this.emCurso = (async () => {
      try {
        while (this.fila.length > 0) {
          const lote = this.fila.splice(0, this.lote)
          await Promise.all([this.gravarArquivo(lote), this.mandar(lote)])
        }
      } catch {
        /* idem */
      } finally {
        this.emCurso = undefined
      }
    })()
    return await this.emCurso
  }

  private async gravarArquivo(lote: EventoNaFila[]): Promise<void> {
    if (!this.o.arquivo) return
    try {
      await appendFile(this.o.arquivo, lote.map((e) => paraLinha(e, this.conteudoPermitido)).join('\n') + '\n', 'utf8')
    } catch {
      /* arquivo sem permissão ou diretório inexistente: a telemetria local é conveniência */
    }
  }

  private async mandar(lote: EventoNaFila[]): Promise<void> {
    if (!this.rede) return
    const corpo = JSON.stringify(paraOtlp(lote, { ambiente: this.o.ambiente, conteudo: this.conteudoPermitido }))
    /* UMA retentativa, imediata. O destino fora do ar custa duas tentativas por lote — e o lote
       seguinte, 5 s depois, é a próxima "retentativa" natural, sem fila de reenvio crescendo. */
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        const r = await this.buscar(this.url, {
          method: 'POST',
          headers: {
            authorization: this.auth,
            'content-type': 'application/json',
            'x-langfuse-ingestion-version': '4',
          },
          body: corpo,
          signal: AbortSignal.timeout(this.timeoutMs),
        })
        if (r.ok) return
        this.falhas++
        /* 4xx que não seja 429 é configuração (chave errada, projeto apagado): repetir o mesmo
           corpo daria o mesmo 4xx. */
        if (r.status >= 400 && r.status < 500 && r.status !== 429) break
      } catch {
        this.falhas++
      }
    }
    this.lotesPerdidos++
  }

  /** Para o relógio e descarrega o que sobrou. Chamado no desligamento gracioso. */
  async encerrar(): Promise<void> {
    if (this.relogio) clearInterval(this.relogio)
    this.relogio = undefined
    await this.aguardarEnvio()
    await this.descarregar()
  }
}

/* ───────────────────────────── a instância do processo ───────────────────────────── */

let instancia: ClienteLangfuse | undefined

/** O cliente do processo, criado na primeira chamada a partir do ambiente. */
export function langfuse(): ClienteLangfuse {
  if (!instancia) instancia = new ClienteLangfuse(opcoesDoAmbiente())
  return instancia
}

/**
 * Troca o cliente do processo (testes) — ou, sem argumento, esquece o atual para o próximo
 * `langfuse()` reler o ambiente. O anterior é encerrado sem esperar.
 */
export function redefinirLangfuse(o?: OpcoesDoLangfuse): ClienteLangfuse | undefined {
  const anterior = instancia
  instancia = o ? new ClienteLangfuse(o) : undefined
  if (anterior) void anterior.encerrar()
  return instancia
}

/**
 * Rastros FECHANDO — a rota já respondeu, e o plano do usuário está sendo lido do banco antes do
 * `enviar` (`server/ai/telemetriaDeIa.ts`). Moram aqui, e não lá, para o desligamento poder
 * esperá-los sem importar o módulo que abre o banco.
 */
const fechamentos = new Set<Promise<void>>()

export function registrarFechamento(p: Promise<void>): void {
  fechamentos.add(p)
  void p.finally(() => fechamentos.delete(p))
}

export async function aguardarRastrosPendentes(): Promise<void> {
  while (fechamentos.size) await Promise.all([...fechamentos])
}

/** Descarrega no desligamento. Não cria o cliente se ninguém o usou. Nunca lança. */
export async function encerrarLangfuse(): Promise<void> {
  try {
    await aguardarRastrosPendentes()
    await instancia?.encerrar()
  } catch {
    /* idem */
  }
}
