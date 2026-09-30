/**
 * QUAL PROVEDOR, QUAL MODELO, QUAL ENDEREÇO — resolvido num lugar (auditoria de 2026-09-07,
 * achado A31).
 *
 * A cadeia `LLM_MODEL || GROQ_LLM_MODEL || GROQ_MODEL || 'openai/gpt-oss-120b'` estava escrita
 * três vezes, com ordens ligeiramente diferentes; `openai/gpt-oss-120b` aparecia em três arquivos
 * e `whisper-large-v3-turbo` em outros três. Um default mudado num lugar deixava os outros dois
 * respondendo com o modelo antigo, e ninguém percebia até a conta chegar ou o provedor recusar.
 *
 * O caso que custou caro e está documentado em `mtProxy.ts`: a Groq moveu o
 * `llama-3.3-70b-versatile` para enterprise e ele passou a responder `model_not_found`. O
 * `mtProxy` foi corrigido; o `Onboarding.tsx` continuou sugerindo o modelo morto para quem estava
 * configurando o app pela primeira vez.
 */

/** O default do LLM de nuvem. Medido no gold set (docs/auditoria/eval-producao-v1.md). */
export const MODELO_LLM_PADRAO = 'openai/gpt-oss-120b'
/** O default do LLM local. */
export const MODELO_OLLAMA_PADRAO = 'llama3.2'
/**
 * A base do OpenRouter, para o atalho `OPENROUTER_API_KEY` da reserva. O Gemini saiu daqui na Fase 2
 * do lançamento: o app é aberto a menores, e os termos do Gemini proíbem esse uso.
 */
const BASE_OPENROUTER = 'https://openrouter.ai/api/v1'

/**
 * O MODELO MAIOR, O QUE O PLANO PROMETE E NINGUEM ENTREGAVA (Fase 4).
 *
 * `largerModels` existe na matriz de planos desde a Fatia 1 (`src/core/planos.ts`): `false` para
 * anonimo, free e essencial, `true` para pro e selfhost. Ele e devolvido ao cliente por
 * `/api/me/entitlements` e — medido em 2026-09-09 com `grep largerModels server/` — **nenhuma
 * linha do servidor o lia**. Todo plano recebia exatamente o mesmo modelo.
 *
 * Sao dois defeitos num: o Pro paga por uma diferenca que nao existe, e o free usa o modelo caro
 * sem que nada o impeca. O segundo e o que custa dinheiro.
 *
 * `LLM_MODEL_GRANDE` AUSENTE MANTEM O COMPORTAMENTO DE HOJE — todo mundo no mesmo modelo. E
 * deliberado: a variavel e uma decisao de produto (qual modelo vale a diferenca de preco) e nao
 * cabe a este arquivo inventar um. O que muda e que, definida, ela passa a ser respeitada.
 */
export const LLM_MODEL_GRANDE = (env: NodeJS.ProcessEnv = process.env) => env.LLM_MODEL_GRANDE?.trim() || null

/** Quem tem `largerModels` e um modelo grande configurado recebe ele; o resto, o de sempre. */
function modeloDoPlano(padrao: string, modelosGrandes: boolean | undefined, env: NodeJS.ProcessEnv): string {
  return (modelosGrandes && LLM_MODEL_GRANDE(env)) || padrao
}

/** O que o chamador sabe sobre o plano de quem esta pedindo. */
export interface OpcoesDeProvedor {
  /** `largerModels` do plano, resolvido NO SERVIDOR (`getEntitlementsForUser`). */
  modelosGrandes?: boolean
}

const semBarra = (u: string) => u.replace(/\/+$/, '')

export interface Provedor {
  rotulo: string
  base: string
  apiKey?: string | null
  model: string
}

/** O LLM de nuvem principal. `null` quando não há chave — quem chama decide o que fazer. */
export function llmDeNuvem(opcoes: OpcoesDeProvedor = {}, env: NodeJS.ProcessEnv = process.env): Provedor | null {
  const apiKey = env.LLM_API_KEY || env.GROQ_API_KEY
  if (!apiKey) return null
  return {
    rotulo: 'llm-primario',
    base: semBarra(env.LLM_BASE_URL || env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'),
    apiKey,
    model: modeloDoPlano(
      env.LLM_MODEL || env.GROQ_LLM_MODEL || env.GROQ_MODEL || MODELO_LLM_PADRAO,
      opcoes.modelosGrandes,
      env,
    ),
  }
}

/**
 * O provedor de RESERVA da cascata. Ele NAO segue `largerModels`: a reserva existe para a chamada
 * nao morrer quando o primario cai, e o modelo dela e o que o operador configurou naquele
 * provedor — trocar por um nome de modelo de outro catalogo produziria `model_not_found`
 * exatamente no momento em que a reserva precisa funcionar.
 *
 * Duas formas de configurar:
 *   - as TRÊS `LLM_RESERVA_*` (qualquer provedor OpenAI-compatible). Meia configuração não vale:
 *     viraria uma segunda tentativa contra um endereço incompleto, o que atrasa a falha sem evitá-la;
 *   - o ATALHO `OPENROUTER_API_KEY`, a reserva escolhida para o lançamento: base do OpenRouter e o
 *     modelo de `LLM_RESERVA_MODEL`, ou o padrão (`openai/gpt-oss-120b` tem o mesmo nome no
 *     catálogo do OpenRouter). As `LLM_RESERVA_*` completas vencem o atalho.
 */
export function llmDeReserva(env: NodeJS.ProcessEnv = process.env): Provedor | null {
  const { LLM_RESERVA_BASE_URL, LLM_RESERVA_API_KEY, LLM_RESERVA_MODEL, OPENROUTER_API_KEY } = env
  if (LLM_RESERVA_BASE_URL && LLM_RESERVA_API_KEY && LLM_RESERVA_MODEL) {
    return {
      rotulo: 'llm-reserva',
      base: semBarra(LLM_RESERVA_BASE_URL),
      apiKey: LLM_RESERVA_API_KEY,
      model: LLM_RESERVA_MODEL,
    }
  }
  if (OPENROUTER_API_KEY) {
    return {
      rotulo: 'llm-reserva',
      base: BASE_OPENROUTER,
      apiKey: OPENROUTER_API_KEY,
      model: LLM_RESERVA_MODEL || MODELO_LLM_PADRAO,
    }
  }
  return null
}

/** O LLM local (Ollama). Não tem chave; a ausência do serviço é descoberta na chamada. */
export function llmLocal(): Provedor {
  return {
    rotulo: 'ollama',
    base: semBarra(process.env.OLLAMA_URL || 'http://localhost:11434/v1'),
    apiKey: null,
    model: process.env.OLLAMA_MODEL || MODELO_OLLAMA_PADRAO,
  }
}

/**
 * A CASCATA da nuvem — tradução e tutor: primário e, quando configurada, a reserva.
 *
 * O primário pode ser barato ou gratuito — a bancada mediu o `minimax-m3:free` EMPATANDO com o
 * pago (docs/auditoria/eval-modelos-v1.md §6) — mas camada gratuita é intermitente: some por
 * janelas inteiras com 429. A reserva é o que permite colher a economia sem apostar a experiência
 * do assinante na cota de um terceiro.
 */
export function cascataDeNuvem(opcoes: OpcoesDeProvedor = {}, env: NodeJS.ProcessEnv = process.env): Provedor[] {
  const primario = llmDeNuvem(opcoes, env)
  const reserva = llmDeReserva(env)
  return [...(primario ? [primario] : []), ...(reserva ? [reserva] : [])]
}

/**
 * O AVISO DO ADR 0008: em produção, a nuvem configurada SEM reserva. O ADR diz como a decisão é
 * cobrada — "aviso no boot em produção quando não há reserva configurada" — e o aviso não existia,
 * justo quando a reserva de produção está fora (a chave da OpenRouter expirou). Sem ela, um 429 ou
 * uma queda do primário derruba a tradução e o tutor de todo assinante AO MESMO TEMPO; o piso local
 * do navegador segura a legenda, mas quem paga sente. Fora de produção não avisa (ruído de dev), e
 * sem primário não há o que reservar — a ausência da nuvem já aparece em `config_capacidade_degradada`.
 *
 * Devolve a frase do aviso, ou `null`. Quem loga é o `server.ts`, com o evento `ia_sem_reserva`.
 */
export function avisoDeIaSemReserva(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV !== 'production') return null
  if (!llmDeNuvem({}, env) || llmDeReserva(env)) return null
  return (
    'a IA de nuvem (tradução e tutor) está SEM RESERVA (ADR 0008): uma queda ou um 429 do provedor ' +
    'principal derruba todo assinante ao mesmo tempo. Configure as três LLM_RESERVA_* ou o atalho ' +
    'OPENROUTER_API_KEY (docs/LANCAMENTO.md, passo 5).'
  )
}
