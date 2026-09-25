/**
 * PERCORRER A CASCATA DE NUVEM — primário, depois reserva — com o disjuntor na frente de cada perna.
 *
 * O laço morava inteiro dentro do `mtProxy.ts`. Quando o tutor trocou o Gemini pela mesma cascata
 * Groq → OpenRouter (Fase 2 do lançamento), copiar o laço seria repetir o defeito que o
 * `llmClient.ts` já documenta: uma correção num lugar e o defeito continuando no outro. O que
 * difere entre os dois chamadores — o prefixo do evento de log e a rota — entra por parâmetro.
 */
import { observarChamadaDeProvedor } from '../http/metricas'
import { log } from '../lib/logger'
import { custoDeLlm } from '../lib/orcamentoDeIa'
import { chaveDoProvedor, disjuntorPermite, registrarFalha, registrarSucesso } from './disjuntor'
import { chamarChat, parametrosDoProvedor, type PedidoDeChat } from './llmClient'
import type { Provedor } from './provedores'
import { nomeDoProvedor, type RastroDeIa, registrarLimiteDoProvedor, statusDaTentativa } from './telemetriaDeIa'

/** O esforço de raciocínio que `parametrosDoProvedor` pediu — metadado da geração, nunca decisão. */
function esforcoPedido(base: string, model: string): string | undefined {
  const p = parametrosDoProvedor(base, model) as { reasoning_effort?: string; reasoning?: { effort?: string } }
  return p.reasoning_effort ?? p.reasoning?.effort
}

interface EntregaDaCascata {
  texto: string
  tokensEntrada: number
  tokensSaida: number
  rotulo: string
  model: string
}

interface ResultadoDaCascata {
  entregue: EntregaDaCascata | null
  /** Causa da última perna que falhou — vai para o LOG, nunca para o cliente. */
  ultimaFalha: string
}

export async function percorrerCascata(
  provedores: Provedor[],
  pedido: Omit<PedidoDeChat, 'base' | 'apiKey' | 'model'>,
  /** `funcao` rotula a métrica do provedor (`traducao`, `tutor`, `corretor`) — valor fixo do código. */
  contexto: { evento: string; route: string; requestId?: string; funcao?: string; rastro?: RastroDeIa },
): Promise<ResultadoDaCascata> {
  const rastro = contexto.rastro
  let ultimaFalha = 'sem provedor'
  for (const prov of provedores) {
    /* O DISJUNTOR ANTES DA CHAMADA (Fase 5): com o primário fora do ar, cada pedido pagava o
       timeout dele antes de chegar à reserva. Aberto, a perna é pulada sem abrir socket. */
    const chave = chaveDoProvedor(prov)
    if (!disjuntorPermite(chave)) {
      ultimaFalha = `disjuntor aberto para ${prov.rotulo} (${prov.model})`
      log('warn', {
        event: `${contexto.evento}_provedor_em_disjuntor`,
        route: contexto.route,
        provider: prov.rotulo,
        error: ultimaFalha,
        requestId: contexto.requestId,
      })
      /* A perna PULADA também é geração (latência zero, status `disjuntor`): sem ela o painel
         mostraria a reserva servindo sem dizer por quê. */
      const agora = Date.now()
      rastro?.tentativa({
        inicio: agora,
        fim: agora,
        provedor: nomeDoProvedor(prov.base),
        modelo: prov.model,
        status: 'disjuntor',
        metadados: { rotulo: prov.rotulo },
      })
      continue
    }
    const inicio = Date.now()
    const r = await chamarChat({ ...pedido, base: prov.base, apiKey: prov.apiKey, model: prov.model })
    const fim = Date.now()
    const provedor = nomeDoProvedor(prov.base)
    if (r.status === 429) registrarLimiteDoProvedor(provedor, prov.model)
    /* UMA GERAÇÃO POR PERNA, inclusive a que falhou — é assim que o fallback aparece no painel. O
       custo sai da MESMA `custoDeLlm` do orçamento e da métrica: os três nunca discordam. O texto
       só entra quando o rastro permite (dev, `LANGFUSE_CONTEUDO=1`); em produção nem é montado. */
    rastro?.tentativa({
      inicio,
      fim,
      provedor,
      modelo: prov.model,
      status: r.ok ? 'ok' : statusDaTentativa(r.status, r.causa),
      uso: r.ok
        ? { input: r.tokensEntrada ?? 0, output: r.tokensSaida ?? 0, cached_input: r.tokensEmCache ?? 0 }
        : undefined,
      custoUsd: r.ok ? custoDeLlm(prov.model, r.tokensEntrada ?? 0, r.tokensSaida ?? 0) : undefined,
      metadados: {
        rotulo: prov.rotulo,
        esforco: esforcoPedido(prov.base, prov.model),
        statusHttp: r.status,
      },
      ...(rastro?.conteudoPermitido
        ? { entrada: JSON.stringify(pedido.messages), saida: r.texto ?? r.causa ?? '' }
        : {}),
    })
    /* A latência de CADA perna, inclusive a que falhou: um primário que demora 12 s para cair é
       exatamente o que a p95 da tradução precisa mostrar. Custo só de quem entregou. */
    observarChamadaDeProvedor({
      provedor: prov.rotulo,
      funcao: contexto.funcao ?? contexto.evento,
      ms: fim - inicio,
      custoUsd: r.ok ? custoDeLlm(prov.model, r.tokensEntrada ?? 0, r.tokensSaida ?? 0) : undefined,
    })
    if (r.ok) {
      registrarSucesso(chave)
      return {
        entregue: {
          texto: r.texto ?? '',
          tokensEntrada: r.tokensEntrada ?? 0,
          tokensSaida: r.tokensSaida ?? 0,
          rotulo: prov.rotulo,
          model: prov.model,
        },
        ultimaFalha: '',
      }
    }
    registrarFalha(chave, r.status)
    ultimaFalha = r.causa ?? 'falha sem causa declarada'
    /* Todo tipo de falha do primário tenta a reserva — inclusive 4xx: chave revogada ou modelo
       aposentado são exatamente os casos em que a reserva salva o assinante. */
    log('warn', {
      event: `${contexto.evento}_provedor_falhou`,
      route: contexto.route,
      provider: prov.rotulo,
      status: r.status,
      error: ultimaFalha.slice(0, 120),
      requestId: contexto.requestId,
    })
  }
  return { entregue: null, ultimaFalha }
}
