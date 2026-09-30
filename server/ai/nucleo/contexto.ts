/**
 * O CONTEXTO DE UM PEDIDO AO NÚCLEO DE IA — quem pede, já resolvido (Fase F, ganchos para API e MCP).
 *
 * As funções do núcleo (`traduzirNoNivel`, `sugerirAlternativas`, `polirLote`, `sintetizarVoz`,
 * `transcrever`, `conversarComTutor`) não leem `req`: tudo o que dependia da requisição do app chega aqui, explícito. O
 * adaptador HTTP do app monta este objeto a partir do `req` (a porta gratuita, o plano, as flags); a
 * rota `/v1` com chave de API, ou o servidor MCP, vão montá-lo a partir da chave — e chamar o MESMO
 * código, com as mesmas recusas, a mesma cota, o mesmo custo e a mesma retenção zero.
 *
 * O que NÃO está aqui, de propósito: a PORTA de quem entra (convidado, pool gratuito, nuvem de
 * alívio — `server/lib/convidado.ts`), que lê IP, cabeçalho e flag do request e é do app. O núcleo
 * recebe o veredicto dela (`modo`, `registrarCusto`), não a pergunta.
 */
import type { UserId } from '../../lib/authContext'
import type { Entitlements } from '../../lib/entitlements'
import type { ModoDaCota } from '../../lib/usageQuota'
import type { RastroDeIa } from '../telemetriaDeIa'
import { recusaDeErro, type RecusaDeIa } from './recusa'

/**
 * Por onde o pedido entrou. Só o `app` existe hoje; `api` (a rota `/v1` com chave) e `mcp` (o servidor
 * MCP remoto) são os ganchos da change `api-e-mcp` — declarados já para a regra do perfil protegido
 * (abaixo) valer no núcleo, e não depender de cada adaptador futuro lembrar dela.
 */
export type CanalDoPedido = 'app' | 'api' | 'mcp'

export interface ContextoDeIa {
  /** Quem pede: o dono da cota, do glossário, da sessão e do gasto. */
  userId: UserId
  /** O id da requisição (ou da chamada de API/MCP) — vai ao log e ao texto que o cliente cita. */
  requestId?: string
  /** O rastro de telemetria, aberto por quem chamou; quem chamou o encerra com o status final. */
  rastro: RastroDeIa
  /** O plano e as capacidades JÁ RESOLVIDOS — uma leitura de plano por pedido, feita fora daqui. */
  entitlements: Entitlements
  /** O Premium é o do teste de 14 dias (C6): a admissão trata a conta como grátis. */
  emTeste: boolean
  /** De que franquia saem a chamada, os tokens e os segundos: a do plano, ou a da nuvem de alívio (A10). */
  modo: ModoDaCota
  canal: CanalDoPedido
  /**
   * PERFIL PROTEGIDO (menor, ou idade não declarada). No `app` vale `null`: a conta restrita já foi
   * recusada no mount (`exigirContaLiberada`), e o menor liberado usa a nuvem como qualquer assinante.
   * Fora do app é obrigatório, e só `false` (adulto declarado) passa — a API é só para adultos.
   */
  perfilProtegido: boolean | null
  /**
   * O custo ENTREGUE também numa franquia de quem abriu a porta: o pool gratuito e o do alívio no app;
   * na API, o medidor da chave (`usage_counters` `api:<keyId>`). O gasto global do mês é do núcleo.
   */
  registrarCusto?: (usd: number) => Promise<void>
  /** As flags de produto de quem pede (a voz natural). Ausente = desligada: fail-closed. */
  flagLigada?: (chave: string) => Promise<boolean>
}

/**
 * A regra de QUEM PODE, antes de qualquer outra: fora do app, só adulto declarado. No app é sempre
 * `null` (o mount já decidiu), e por isso o comportamento das rotas de hoje não muda.
 */
export function recusaDeQuemPede(ctx: Pick<ContextoDeIa, 'canal' | 'perfilProtegido'>): RecusaDeIa | null {
  if (ctx.canal === 'app' || ctx.perfilProtegido === false) return null
  return recusaDeErro(403, 'a API e o MCP são só para contas de adultos', 'perfil_protegido')
}
