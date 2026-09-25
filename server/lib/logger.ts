/**
 * Logger estruturado do servidor (M-01, versão mínima — sem dependência; Sentry é Camada 2).
 *
 * Emite UMA linha JSON por evento, com uma ALLOWLIST de campos: qualquer campo fora da lista é
 * DESCARTADO. Isso garante, por construção, que transcrição, chave de API ou texto de prompt do
 * usuário NUNCA vão para o log — mesmo que um caller passe por engano (LGPD + S-01). Dá base para os
 * SLIs da Fase 4 (latência/provedor/rota/fallback) e substitui os `console.*` soltos nos caminhos
 * de rede/adapter que hoje engolem a exceção em silêncio (parte dos 171 `catch` do M-01).
 */
import { redigirErro } from './redacao'
import { requestIdAtual } from './requestId'

export interface LogFields {
  event: string
  route?: string
  provider?: string
  status?: number
  latencyMs?: number
  fallbackLevel?: number
  /** Mensagem CURTA do erro — nunca dados do usuário: `log()` a passa por `redigirErro`. */
  error?: string
  /**
   * Cadeia de causas + stack, JÁ REDIGIDA e truncada. Existe para o dump multilinha de
   * `console.error` não precisar mais existir em produção: ele quebrava o contrato de UMA linha
   * JSON por evento, que é o que um agregador consegue ler. Só `erroDeRota`/`erroGlobal`
   * preenchem, e só em nível `error`.
   */
  stack?: string
  requestId?: string
  /* Z3 — instrumentação da distribuição de dificuldade. Números agregados, sem nada do usuário:
     é o que torna o drift de faixa observável em produção em vez de virar reclamação. */
  maiorFaixaPct?: number
  tipoDeCorte?: string
  total?: number
  /* Tokens que o modelo gastou RACIOCINANDO. Entra aqui porque é a causa não óbvia de uma tradução
     vazia: o modelo consome o `max_tokens` inteiro pensando e devolve HTTP 200 sem conteúdo. É
     número agregado do provedor, sem nada do usuário. */
  raciocinio?: number
  /* Orçamento global de IA (Fase 2 do lançamento): gasto e teto do MÊS, em US$. Números do serviço,
     sem nada do usuário — é o que o alerta de 80%/100% precisa carregar para virar alerta externo. */
  gastoUsd?: number
  tetoUsd?: number
  /* Triagem do STT de nuvem (`server/ai/sttQualidade.ts`): QUANTOS segmentos o servidor descartou
     e POR QUÊ. Só contagens — o texto da fala nunca entra no log (`total` leva quantos vieram). */
  semFala?: number
  repeticao?: number
  alucinacao?: number
  /* Gasto anômalo por usuário (`server/lib/orcamentoDeIa.ts`): SÓ o pseudônimo `u_…` (HMAC com sal
     do servidor, o mesmo do Langfuse) — nunca o id do Supabase — e a mediana do dia para comparação. */
  usuario?: string
  medianaUsd?: number
}

const ALLOWED = new Set([
  'ts',
  'level',
  'event',
  'route',
  'provider',
  'status',
  'latencyMs',
  'fallbackLevel',
  'error',
  'requestId',
  'maiorFaixaPct',
  'tipoDeCorte',
  'total',
  'raciocinio',
  'stack',
  'gastoUsd',
  'tetoUsd',
  'semFala',
  'repeticao',
  'alucinacao',
  'usuario',
  'medianaUsd',
])

/**
 * DESTINO EXTERNO, PLUGÁVEL — achado F5-04 da auditoria.
 *
 * O logger sempre esteve certo: JSON por linha, com allowlist, para stdout. O problema medido é
 * que **ninguém lê o stdout** — zero Sentry, zero OpenTelemetry, e um erro em produção só aparece
 * quando um usuário reclama (D3 de deploy-readiness.md).
 *
 * Escolher o fornecedor é decisão de infraestrutura e não é minha. O que dá para fazer sem essa
 * decisão é o encaixe: quem for adotado registra um sink aqui e passa a receber TODO evento de
 * erro, já filtrado pela allowlist. Sem isso, adotar Sentry depois significaria varrer o servidor
 * inteiro de novo.
 *
 * O sink recebe o objeto JÁ SANEADO, nunca os campos crus — a garantia de que transcrição, chave
 * e prompt não vazam vale para o destino externo exatamente como vale para o stdout. Um sink que
 * lança é engolido de propósito: telemetria quebrada não pode derrubar o request que ela observa.
 */
export type SinkDeErro = (evento: Record<string, unknown>) => void

const sinks: SinkDeErro[] = []

/**
 * Os poucos `warn` que PRECISAM chegar a alguém (Fase 5). Os destinos externos recebem todo `error`
 * e, além deles, só estes avisos — que não são falha, são o aviso ANTES da falha:
 *   - `ia_orcamento_alerta_80`: 80% do orçamento mensal de IA gasto (server/lib/orcamentoDeIa.ts);
 *     a 100% sai `ia_orcamento_esgotado`, que já é `error`;
 *   - `backup_heartbeat_falhou`: o snapshot diário foi feito, mas o alarme externo não soube;
 *   - `ia_provedor_limite`: o provedor de IA respondeu 429 — a camada contratada não aguenta o
 *     tráfego. Já sai no máximo uma vez por minuto por provedor (`server/ai/telemetriaDeIa.ts`).
 * O resto dos `warn` fica no stdout: mandar todos viraria ruído e gastaria a cota do Sentry.
 */
export const AVISOS_QUE_ALERTAM: ReadonlySet<string> = new Set([
  'ia_orcamento_alerta_80',
  'ia_orcamento_diario_alerta_80',
  'ia_gasto_anomalo_usuario',
  'backup_heartbeat_falhou',
  'ia_provedor_limite',
])

/** Registra um destino externo para eventos `error`. Devolve como desregistrar. */
export function registrarSinkDeErro(sink: SinkDeErro): () => void {
  sinks.push(sink)
  return () => {
    const i = sinks.indexOf(sink)
    if (i >= 0) sinks.splice(i, 1)
  }
}

export function log(level: 'info' | 'warn' | 'error', fields: LogFields): void {
  const out: Record<string, unknown> = { ts: Date.now(), level }
  /**
   * O `requestId` IMPLÍCITO — achado da Fase 5, medido em 2026-09-09.
   *
   * Das 45 chamadas de `log()` em `server/**` + `server.ts` (comentários descontados), 23 não
   * passavam `requestId`: metade do diário era evento solto, impossível de amarrar à requisição
   * que o produziu. E a lista de quem não passava explica o porquê — `storageQuota.ts` (4),
   * `usageQuota.ts` (5), `bootStatus.ts` (3), `entitlements.ts`, `repositories/credentials.ts`:
   * são funções de domínio, sem `Request` nenhum em mãos. Cobrar o parâmetro delas significaria
   * atravessar a assinatura de toda a camada com um argumento de telemetria.
   *
   * O id vem do `AsyncLocalStorage` aberto por `requestIdMiddleware` (server/lib/requestId.ts),
   * então a leitura acontece AQUI, no chokepoint — pelo mesmo motivo que a allowlist e a redação
   * moram aqui: um `log()` novo nasce correlacionado.
   *
   * O EXPLÍCITO GANHA. `fields.requestId` só é substituído quando ausente — quem carimba um id
   * próprio (reprocessamento, tarefa de fundo) continua mandando no que escreve.
   */
  const implicito = requestIdAtual()
  if (implicito !== undefined && fields.requestId === undefined) out.requestId = implicito
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED.has(k) || v === undefined) continue
    /**
     * A ALLOWLIST É SOBRE A CHAVE; ESTA LINHA É SOBRE O VALOR — ver `redacao.ts` para a medição.
     * `error` e `stack` são os dois únicos campos de texto livre da lista, e são justamente os
     * que carregam o que o drizzle anexou (a query INTEIRA com os valores vinculados). Os
     * outros campos são enum, número ou id.
     */
    out[k] = (k === 'error' || k === 'stack') && typeof v === 'string' ? redigirErro(v) : v
  }
  const line = JSON.stringify(out)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)

  if ((level === 'error' || (level === 'warn' && AVISOS_QUE_ALERTAM.has(fields.event))) && sinks.length) {
    for (const sink of sinks) {
      try {
        sink(out)
      } catch {
        /* telemetria quebrada não derruba o request que ela observa */
      }
    }
  }
}
