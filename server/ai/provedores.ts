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
 *
 * DESDE O B1 DA FASE B (29/09/2026) A RESOLUÇÃO MORA NO REGISTRO (`registroDeProvedores.ts`): o
 * `IA_PROVEDORES` declarado ou, sem ele, o registro LEGADO derivado das mesmas variáveis de antes —
 * `LLM_*`/`GROQ_*` para o primário, `LLM_RESERVA_*` ou o atalho `OPENROUTER_API_KEY` para a reserva.
 * Este arquivo mantém as funções que o resto do servidor já chamava; o teste de equivalência
 * (`tests/integration/registro-de-provedores.test.ts`) prende que, sem `IA_PROVEDORES`, elas
 * devolvem exatamente as pernas de antes.
 */
import type { NivelDaTraducao } from '../../src/core/nivelDeTraducao'
import type { FuncaoDeIa } from './funcoesDeIa'
import { funcoesSemReserva, pernasDaFuncao, type Provedor } from './registroDeProvedores'

export type { Provedor } from './registroDeProvedores'
export { MODELO_LLM_PADRAO } from './registroDeProvedores'

/** O default do LLM local. */
export const MODELO_OLLAMA_PADRAO = 'llama3.2'

/**
 * O MODELO MAIOR, O QUE O PLANO PROMETE E NINGUEM ENTREGAVA (Fase 4).
 *
 * `largerModels` existe na matriz de planos desde a Fatia 1 (`src/core/planos.ts`): `false` para
 * anonimo e free, `true` para premium e selfhost (matriz v2). Ele e devolvido ao cliente por
 * `/api/me/entitlements` e — medido em 2026-09-09 com `grep largerModels server/` — **nenhuma
 * linha do servidor o lia**. Todo plano recebia exatamente o mesmo modelo.
 *
 * `LLM_MODEL_GRANDE` AUSENTE MANTEM O COMPORTAMENTO DE HOJE — todo mundo no mesmo modelo. No
 * registro legado, o modelo grande é o `grande: true` que ele monta a partir da variável, e ele
 * substitui o comum DAQUELE provedor para quem tem o entitlement. A reserva não segue: o modelo dela
 * é o que o operador configurou naquele catálogo, e trocar por um nome de outro catálogo produziria
 * `model_not_found` exatamente quando a reserva precisa funcionar.
 *
 * DESDE O B3 DA FASE B o eixo de quem paga é o NÍVEL (`src/core/nivelDeTraducao.ts`): no registro
 * declarado o modelo melhor é o que declara `niveis: ["nuance"]` (o `grande` declarado virou sinônimo
 * disso), e quem o recebe é quem tem `traducaoNuance`. O `modelosGrandes` fica só para o legado.
 */
export interface OpcoesDeProvedor {
  /** `largerModels` do plano, resolvido NO SERVIDOR (`getEntitlementsForUser`). Só o legado o lê. */
  modelosGrandes?: boolean
  /** A função que vai usar a cascata. Padrão: `traducao`. O `corretor` usa os modelos do `tutor`. */
  funcao?: FuncaoDeIa
  /**
   * O NÍVEL (B3): de quais modelos a cascata começa. Ausente = `rapida`, o barato. Quem chama com o
   * plano de alguém usa `cascataDoPlano` (`server/ai/niveis.ts`), que resolve os dois — o nível pela
   * capacidade `traducaoNuance` e o `modelosGrandes` pelo `largerModels` — num lugar só.
   */
  nivel?: NivelDaTraducao
}

/** O LLM de nuvem principal. `null` quando não há chave — quem chama decide o que fazer. */
export function llmDeNuvem(opcoes: OpcoesDeProvedor = {}, env: NodeJS.ProcessEnv = process.env): Provedor | null {
  return pernasDaFuncao(opcoes.funcao ?? 'traducao', opcoes, env).find((p) => p.rotulo === 'llm-primario') ?? null
}

/**
 * O provedor de RESERVA da cascata (o primeiro depois do primário). Ele NAO segue `largerModels`.
 *
 * No legado, duas formas de configurar:
 *   - as TRÊS `LLM_RESERVA_*` (qualquer provedor OpenAI-compatible). Meia configuração não vale:
 *     viraria uma segunda tentativa contra um endereço incompleto, o que atrasa a falha sem evitá-la;
 *   - o ATALHO `OPENROUTER_API_KEY`, a reserva escolhida para o lançamento: base do OpenRouter e o
 *     modelo de `LLM_RESERVA_MODEL`, ou o padrão (`openai/gpt-oss-120b` tem o mesmo nome no
 *     catálogo do OpenRouter). As `LLM_RESERVA_*` completas vencem o atalho.
 */
export function llmDeReserva(env: NodeJS.ProcessEnv = process.env): Provedor | null {
  return pernasDaFuncao('traducao', {}, env).find((p) => p.rotulo === 'llm-reserva') ?? null
}

/** O LLM local (Ollama). Não tem chave; a ausência do serviço é descoberta na chamada. */
export function llmLocal(): Provedor {
  return {
    rotulo: 'ollama',
    base: (process.env.OLLAMA_URL || 'http://localhost:11434/v1').replace(/\/+$/, ''),
    apiKey: null,
    model: process.env.OLLAMA_MODEL || MODELO_OLLAMA_PADRAO,
  }
}

/**
 * A CASCATA da nuvem — tradução e tutor: primário e, quando configurada(s), a(s) reserva(s), na
 * ordem do registro.
 *
 * O primário pode ser barato ou gratuito — a bancada mediu o `minimax-m3:free` EMPATANDO com o
 * pago (docs/auditoria/eval-modelos-v1.md §6) — mas camada gratuita é intermitente: some por
 * janelas inteiras com 429. A reserva é o que permite colher a economia sem apostar a experiência
 * do assinante na cota de um terceiro.
 */
export function cascataDeNuvem(opcoes: OpcoesDeProvedor = {}, env: NodeJS.ProcessEnv = process.env): Provedor[] {
  return pernasDaFuncao(opcoes.funcao ?? 'traducao', opcoes, env)
}

const NOME_DA_FUNCAO = { traducao: 'tradução', tutor: 'tutor', stt: 'STT' } as const

/**
 * O AVISO DO ADR 0008: em produção, a nuvem configurada SEM reserva. O ADR diz como a decisão é
 * cobrada — "aviso no boot em produção quando não há reserva configurada" — e o aviso não existia,
 * justo quando a reserva de produção está fora (a chave da OpenRouter expirou). Sem ela, um 429 ou
 * uma queda do primário derruba a tradução e o tutor de todo assinante AO MESMO TEMPO; o piso local
 * do navegador segura a legenda, mas quem paga sente. Fora de produção não avisa (ruído de dev), e
 * sem primário não há o que reservar — a ausência da nuvem já aparece em `config_capacidade_degradada`.
 * "Sem reserva" é ter pernas só num endereço (`funcoesSemReserva`): uma queda leva todas.
 *
 * Devolve a frase do aviso, ou `null`. Quem loga é o `server.ts`, com o evento `ia_sem_reserva`.
 */
export function avisoDeIaSemReserva(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV !== 'production') return null
  const sem = funcoesSemReserva(env)
  if (!sem.length) return null
  return (
    `a IA de nuvem está SEM RESERVA em ${sem.map((f) => NOME_DA_FUNCAO[f]).join(', ')} (ADR 0008): uma queda ` +
    'ou um 429 do provedor principal chega a todo assinante ao mesmo tempo. Configure as três ' +
    'LLM_RESERVA_* ou o atalho OPENROUTER_API_KEY — ou, com IA_PROVEDORES, um segundo provedor para ' +
    'cada função (docs/LANCAMENTO.md, passo 5).'
  )
}
