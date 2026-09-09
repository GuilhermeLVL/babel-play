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
/** O default do Gemini. */
export const MODELO_GEMINI_PADRAO = 'gemini-2.0-flash'

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
export const LLM_MODEL_GRANDE = () => process.env.LLM_MODEL_GRANDE?.trim() || null

/** Quem tem `largerModels` e um modelo grande configurado recebe ele; o resto, o de sempre. */
function modeloDoPlano(padrao: string, modelosGrandes?: boolean): string {
  return (modelosGrandes && LLM_MODEL_GRANDE()) || padrao
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
export function llmDeNuvem(opcoes: OpcoesDeProvedor = {}): Provedor | null {
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY
  if (!apiKey) return null
  return {
    rotulo: 'llm-primario',
    base: semBarra(process.env.LLM_BASE_URL || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'),
    apiKey,
    model: modeloDoPlano(
      process.env.LLM_MODEL || process.env.GROQ_LLM_MODEL || process.env.GROQ_MODEL || MODELO_LLM_PADRAO,
      opcoes.modelosGrandes,
    ),
  }
}

/**
 * O provedor de RESERVA da cascata. Ele NAO segue `largerModels`: a reserva existe para a chamada
 * nao morrer quando o primario cai, e o modelo dela e o que o operador configurou naquele
 * provedor — trocar por um nome de modelo de outro catalogo produziria `model_not_found`
 * exatamente no momento em que a reserva precisa funcionar. Só existe com as três variáveis definidas: meia configuração
 * viraria uma segunda tentativa contra um endereço incompleto, o que atrasa a falha sem evitá-la.
 */
export function llmDeReserva(): Provedor | null {
  const { LLM_RESERVA_BASE_URL, LLM_RESERVA_API_KEY, LLM_RESERVA_MODEL } = process.env
  if (!LLM_RESERVA_BASE_URL || !LLM_RESERVA_API_KEY || !LLM_RESERVA_MODEL) return null
  return {
    rotulo: 'llm-reserva',
    base: semBarra(LLM_RESERVA_BASE_URL),
    apiKey: LLM_RESERVA_API_KEY,
    model: LLM_RESERVA_MODEL,
  }
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
 * A CASCATA da tradução: primário e, quando configurada, a reserva.
 *
 * O primário pode ser barato ou gratuito — a bancada mediu o `minimax-m3:free` EMPATANDO com o
 * pago (docs/auditoria/eval-modelos-v1.md §6) — mas camada gratuita é intermitente: some por
 * janelas inteiras com 429. A reserva é o que permite colher a economia sem apostar a experiência
 * do assinante na cota de um terceiro.
 */
export function cascataDeTraducao(opcoes: OpcoesDeProvedor = {}): Provedor[] {
  const primario = llmDeNuvem(opcoes)
  const reserva = llmDeReserva()
  return [...(primario ? [primario] : []), ...(reserva ? [reserva] : [])]
}
