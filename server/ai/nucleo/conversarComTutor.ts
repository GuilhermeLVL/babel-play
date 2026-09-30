/**
 * CONVERSAR COM O TUTOR — o núcleo de `POST /api/tutor/chat` (e do corretor), sem Express. Até a Fase
 * F ele era a única função de IA que ainda decidia e respondia no mesmo passo, dentro da rota
 * (`server/routes/tutor.ts`); agora recebe o `ContextoDeIa` e devolve o resultado, como as outras cinco
 * (ADR 0012).
 *
 * A CASCATA, em ordem:
 *   1. nuvem gerenciada — a cascata do NÍVEL do plano (`niveis.ts`), só com o entitlement
 *      `managedCloudLlm` e com a cota reservada ANTES da chamada;
 *   2. Ollama local — SÓ no self-host (`AUTH_REQUIRED` desligado). Num servidor hospedado o
 *      `localhost:11434` não existe: tentar só atrasava a resposta e fingia um caminho que o
 *      assinante não tem. No self-host, o portão fechado e a nuvem ocupada também caem nele.
 *
 * O PROMPT É DO SERVIDOR (`server/ai/llmRequest.ts` + `funcoesDeIa.ts`): o corpo diz a função
 * (`tutor` | `corretor`) e traz o conteúdo; `systemInstruction`, temperatura e `max_tokens` do
 * cliente são descartados. PÚBLICO MENOR (ECA Digital, Fase 4): menor — ou quem ainda não declarou a
 * idade — recebe a instrução de segurança no fim do `system` (`ehMenor`; no self-host é sempre falso).
 * A tradução não recebe: ela verte fielmente um texto que a pessoa já tem.
 *
 * "INDISPONÍVEL" NÃO É RECUSA. A nuvem fora, o plano sem nuvem e o self-host sem modelo local
 * respondem 200 com `text: null` e o motivo — o cliente mostra a frase certa e segue. Recusa é o
 * 400/413/422 do corpo, o 402 da cota, o 429 da nuvem ocupada, o 503 do portão e o 502 do erro.
 *
 * E O TUTOR NÃO É FUNÇÃO DA API nesta fase (change `api-e-mcp`): expô-lo em `/v1` é decisão do dono.
 * O núcleo já recusa o perfil protegido fora do app, como as outras.
 */
import { authRequired } from '../../lib/auth'
import { erroDeRota } from '../../lib/erroDeRota'
import { ehMenor, INSTRUCAO_DE_SEGURANCA_PARA_MENORES } from '../../lib/idade'
import { log } from '../../lib/logger'
import { type Portao, portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import { estimarTokens } from '../../lib/usageQuota'
import { planoDeAdmissao } from '../admissao'
import { type AdmissaoDaCascata, admitirCascata, encerrarAdmissao, percorrerCascata } from '../cascata'
import type { FuncaoDeIa } from '../funcoesDeIa'
import { chamarChat, type MensagemDeChat, tamanhoDoPrompt } from '../llmClient'
import { type LlmChatBody, prepareLlmRequest } from '../llmRequest'
import { cascataDoPlano } from '../niveis'
import { aplicarPoliticaDeCusto } from '../politicaDeCusto'
import { llmLocal } from '../provedores'
import { ReservaDeLlm, reservarLlm } from '../reservaDeNuvem'
import { nomeDoProvedor, type RastroDeIa, statusDaTentativa } from '../telemetriaDeIa'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'

/** O rótulo de log e de métrica é o da rota do app. */
const ROTA = '/api/tutor/chat'
/** Teto de espera da nuvem. Alguém está olhando o balão de "pensando". */
const TIMEOUT_NUVEM_MS = 30_000
/** O local roda na CPU de quem usa o app: a espera é o preço de não depender de nuvem. */
const TIMEOUT_LOCAL_MS = 60_000

/** O pedido do tutor validado — sai de `lerPedidoDoTutor`. O `system` é montado no núcleo, que sabe
 *  se quem pede é menor. */
export interface PedidoDoTutor {
  funcao: FuncaoDeIa
  corpo: LlmChatBody
}

/** Lê o corpo cru: o pedido (função e conteúdo), ou o 400/413/422 de `prepareLlmRequest`. */
export function lerPedidoDoTutor(corpo: unknown): { ok: true; pedido: PedidoDoTutor } | RecusaDeIa {
  const bruto = (corpo ?? {}) as LlmChatBody
  const prep = prepareLlmRequest(bruto)
  if (!prep.ok) return recusar(prep.status, { error: prep.error as string, code: prep.code })
  return { ok: true, pedido: { funcao: prep.funcao, corpo: bruto } }
}

/** Por que não houve resposta — o cliente escolhe a frase por ele. */
export type MotivoDoTutorIndisponivel = 'nuvem_indisponivel' | 'managed_requires_plan' | 'no_local_model'

/**
 * A conversa: a resposta e quem a escreveu (`motor`), ou `texto: null` com o motivo. Interface PLANA,
 * como a de `llmRequest.ts`: sem `strictNullChecks` no tsconfig raiz, união discriminada por `null`
 * não estreita.
 */
export interface ConversaDoTutor {
  ok: true
  texto: string | null
  motor: 'nuvem' | 'ollama' | null
  indisponivel?: MotivoDoTutorIndisponivel
}

export type ResultadoDoTutor = ConversaDoTutor | RecusaDeIa

const indisponivel = (motivo: MotivoDoTutorIndisponivel): ConversaDoTutor => ({
  ok: true,
  texto: null,
  motor: null,
  indisponivel: motivo,
})

export async function conversarComTutor(
  ctx: ContextoDeIa,
  pedido: PedidoDoTutor,
  ganchos?: GanchosDoNucleo<ResultadoDoTutor>,
): Promise<ResultadoDoTutor> {
  const decidir = decisor(ganchos)
  return decidir(await conversar(ctx, pedido, decidir))
}

async function tentarLocal(messages: MensagemDeChat[], maxTokens: number, rastro: RastroDeIa): Promise<string | null> {
  const local = llmLocal()
  const inicio = Date.now()
  const r = await chamarChat({ ...local, messages, maxTokens, timeoutMs: TIMEOUT_LOCAL_MS })
  /* O Ollama do self-host também é geração: custo zero (a máquina é do dono), mas latência e taxa
     de falha dele são o que decide se vale oferecer a nuvem a quem roda em casa. */
  rastro.tentativa({
    inicio,
    fim: Date.now(),
    provedor: nomeDoProvedor(local.base),
    modelo: local.model,
    status: r.ok ? 'ok' : statusDaTentativa(r.status, r.causa),
    uso: r.ok ? { input: r.tokensEntrada ?? 0, output: r.tokensSaida ?? 0 } : undefined,
    custoUsd: 0,
    metadados: { rotulo: local.rotulo, statusHttp: r.status },
  })
  if (!r.ok) {
    log('warn', { event: 'tutor_ollama_indisponivel', error: r.causa })
    return null
  }
  return r.texto ?? null
}

async function conversar(
  ctx: ContextoDeIa,
  pedido: PedidoDoTutor,
  decidir: (r: ResultadoDoTutor) => ResultadoDoTutor,
): Promise<ResultadoDoTutor> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { rastro } = ctx
  const plano = ctx.entitlements
  // Reserva de cota (chamada + tokens): estornada em todo caminho que não entrega resposta da nuvem.
  let reserva: ReservaDeLlm | null = null
  /* Admissão da cascata (ADR 0007): vaga em voo do usuário + balde do modelo. Fechada no `finally`. */
  let admissao: AdmissaoDaCascata | null = null
  try {
    const menor = await ehMenor(ctx.userId)
    rastro.anotar({ menor })
    const prep = prepareLlmRequest(
      pedido.corpo,
      menor ? { instrucaoParaMenor: INSTRUCAO_DE_SEGURANCA_PARA_MENORES } : {},
    )
    if (!prep.ok) return decidir(recusar(prep.status, { error: prep.error as string, code: prep.code }))
    const selfHost = !authRequired()

    if (plano.managedCloudLlm) {
      /* B1: com `IA_PROVEDORES`, o tutor (e o corretor) têm os modelos DELES; no legado, a mesma cascata.
         B3: o modelo sai do NÍVEL do plano (`niveis.ts`) — a nuance para quem tem `traducaoNuance`. */
      const { nivel, pernas: provedores } = cascataDoPlano(prep.funcao, plano)
      rastro.anotar({ nivel })
      // Chave de emergência e orçamento global: fechado, o hospedado explica; o self-host cai no Ollama.
      const portao: Portao = provedores.length > 0 ? await portaoDaNuvem() : { ok: false }
      if (provedores.length > 0 && !portao.ok && !selfHost) return decidir(recusaPortaoFechado(portao))
      const estimativa = estimarTokens(tamanhoDoPrompt(prep.messages), prep.maxTokens)
      /* B4: a política de custo — o degrau mais barato primeiro a 70% (pagante, balde baixo) e a 90%
         (todos), com a saída dos modelos sem raciocínio a 75% (`politicaDeCusto.ts`). */
      const custo = aplicarPoliticaDeCusto({
        pernas: provedores,
        nivel,
        fracaoDoOrcamento: portao.fracaoDoOrcamento ?? 0,
        tokensEntrada: estimativa - prep.maxTokens,
        tokensSaida: prep.maxTokens,
      })
      if (custo.degradacao !== 'nenhuma') rastro.anotar({ degradacao: custo.degradacao })
      /* ADMISSÃO antes da cota: sem saldo, o hospedado recusa 429 `nuvem_ocupada` (o cliente tenta de
         novo depois do `Retry-After`); o self-host cai no Ollama, como com o portão fechado. O teste de
         14 dias (C6) tem o Premium nos entitlements, mas entra na faixa grátis. */
      const faixa = planoDeAdmissao(plano.plan, ctx.modo === 'alivio', ctx.emTeste)
      const admitida =
        provedores.length > 0 && portao.ok
          ? admitirCascata(custo.pernas, { userId: ctx.userId, plano: faixa, tokens: estimativa })
          : null
      if (admitida && admitida.ok === false && !selfHost) return decidir(recusaNuvemOcupada(admitida.recusa))
      if (admitida?.ok === true) admissao = admitida.admissao
      if (admissao) {
        const reservada = await reservarLlm(ctx.userId, estimativa, ctx.modo)
        if (!(reservada instanceof ReservaDeLlm)) return decidir(reservada) // 402 de cota ou 503 do contador
        reserva = reservada
        const { entregue, ultimaFalha } = await percorrerCascata(
          custo.pernas,
          {
            messages: prep.messages,
            temperature: prep.temperature,
            maxTokens: prep.maxTokens,
            timeoutMs: TIMEOUT_NUVEM_MS,
          },
          {
            evento: 'tutor',
            route: ROTA,
            requestId: ctx.requestId,
            funcao: prep.funcao,
            rastro,
            admissao,
            fatorDeSaida: custo.fatorDeSaida,
          },
        )
        if (entregue) {
          await reserva.consumir(entregue.tokensEntrada + entregue.tokensSaida)
          /* B2: o custo de quem respondeu, pelo preço dele e com o cache — calculado na cascata. */
          await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
          await ctx.registrarCusto?.(entregue.custoUsd)
          return decidir({ ok: true, texto: entregue.texto, motor: 'nuvem' })
        }
        log('error', {
          event: 'tutor_nuvem_indisponivel',
          route: ROTA,
          error: ultimaFalha.slice(0, 300),
          requestId: ctx.requestId,
        })
      }
      if (!selfHost) return decidir(indisponivel('nuvem_indisponivel'))
    } else if (!selfHost) {
      // Modo público, plano sem nuvem: explica o plano. Não há modelo local no servidor hospedado.
      return decidir(indisponivel('managed_requires_plan'))
    }

    // Self-host: o Ollama da máquina do dono é o piso.
    const local = await tentarLocal(prep.messages, prep.maxTokens, rastro)
    if (local) return decidir({ ok: true, texto: local, motor: 'ollama' })
    return decidir(indisponivel('no_local_model'))
  } catch (error) {
    log('error', { event: 'tutor_erro', error: erroDeRota(error, { event: 'tutor_erro' }), requestId: ctx.requestId })
    return decidir(recusaDeErro(502, 'tutor indisponível', 'provedor_indisponivel'))
  } finally {
    encerrarAdmissao(admissao)
    await reserva?.estornar()
  }
}
