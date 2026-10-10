/**
 * OS TEMPOS LIMITE DO SERVIDOR HTTP (auditoria de desempenho do servidor de 10/10/2026, achado A6;
 * era a recomendação 4 da Fase 4, `fase4-carga.md` §8, aberta desde 25/09).
 *
 * O `server.ts` só chamava `app.listen`, então valiam os padrões do Node 22+: `keepAliveTimeout`
 * de 5 s, `headersTimeout` de 60 s, `requestTimeout` de 300 s. O primeiro é o defeito: o proxy do
 * Fly reaproveita as conexões com a máquina e só as fecha depois de 60 s sem tráfego. Com 5 s do
 * nosso lado, o servidor fecha um socket parado no mesmo instante em que o proxy manda nele a
 * requisição seguinte, e ela vira erro de conexão (502 esporádico, repetição do cliente). A suíte
 * de carga viu de 8 a 149 repetições por minuto.
 *
 * A REGRA: quem fecha a conexão ociosa é o lado de FORA (o proxy), nunca o servidor por baixo dele.
 *
 *   keepAliveTimeout  65 s   acima dos 60 s do proxy, com folga para relógio e rede;
 *   headersTimeout    +1 s   acima do ocioso: com ele menor ou igual, o Node pode derrubar o
 *                            socket parado pelo relógio dos cabeçalhos antes de o ocioso vencer
 *                            (nodejs/node#27363; é a recomendação de todo servidor atrás de proxy);
 *   requestTimeout    300 s  o pedido INTEIRO (cabeçalhos e corpo) chegar. É o padrão do Node,
 *                            agora escrito: um upload de áudio de 25 MB ou um `.apkg` numa rede de
 *                            celular leva minutos, e cortar em 60 s cortaria gente de verdade.
 *
 * O QUE NENHUM DOS TRÊS MEDE: a duração da RESPOSTA. O `keepAliveTimeout` só conta entre uma
 * resposta terminada e o pedido seguinte; os outros dois acabam quando o pedido termina de chegar.
 * O SSE do tutor, a importação e a transcrição longa não são tocados. O relógio que os derrubaria
 * é `server.timeout` (inatividade do socket), que fica em 0, o padrão, de propósito.
 *
 * COM O DESLIGAMENTO GRACIOSO (`server/lib/desligamento.ts`): `server.close()` derruba as conexões
 * ociosas na hora (Node 19+), então um ocioso de 65 s não segura o dreno. Medido lá: 2 ms.
 *
 * O VALOR DO PROXY: os 60 s vêm de resposta da equipe do Fly no fórum ("60s is our timeout for
 * connections", community.fly.io/t/2373), e não da referência do `fly.toml`, que não diz o padrão.
 * Por isso os dois números são ajustáveis por variável de ambiente, sem deploy de código.
 */
import type { Server } from 'node:http'

/** O ocioso do proxy do Fly: fecha a conexão que passa 60 s sem enviar nem receber. */
export const OCIOSO_DO_PROXY_DO_FLY_MS = 60_000

const KEEP_ALIVE_PADRAO_MS = OCIOSO_DO_PROXY_DO_FLY_MS + 5_000
const FOLGA_DOS_CABECALHOS_MS = 1_000
const PEDIDO_INTEIRO_PADRAO_MS = 300_000

interface TemposLimiteHttp {
  keepAliveTimeout: number
  headersTimeout: number
  requestTimeout: number
}

/** Inteiro positivo, ou o padrão: valor inválido nunca vira 0 (0 desliga o relógio no Node). */
function msOuPadrao(valor: string | undefined, padrao: number): number {
  const n = Number(valor)
  return valor !== undefined && valor.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao
}

/**
 * Os três valores, com as variáveis de ambiente no meio. `headersTimeout` é derivado: sempre
 * acima do ocioso, e o pedido inteiro nunca fica abaixo dele (o Node recusa essa combinação na criação do servidor).
 */
export function temposLimiteHttp(env: Record<string, string | undefined> = process.env): TemposLimiteHttp {
  const keepAliveTimeout = msOuPadrao(env.HTTP_KEEP_ALIVE_TIMEOUT_MS, KEEP_ALIVE_PADRAO_MS)
  const headersTimeout = keepAliveTimeout + FOLGA_DOS_CABECALHOS_MS
  const requestTimeout = Math.max(msOuPadrao(env.HTTP_REQUEST_TIMEOUT_MS, PEDIDO_INTEIRO_PADRAO_MS), headersTimeout)
  return { keepAliveTimeout, headersTimeout, requestTimeout }
}

/** Aplica os tempos no servidor que escuta. Devolve o que aplicou, para o log e para o teste. */
export function aplicarTemposLimite(
  servidor: Server,
  env: Record<string, string | undefined> = process.env,
): TemposLimiteHttp {
  const t = temposLimiteHttp(env)
  servidor.requestTimeout = t.requestTimeout
  servidor.headersTimeout = t.headersTimeout
  servidor.keepAliveTimeout = t.keepAliveTimeout
  return t
}
