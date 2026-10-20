/**
 * CONFIGURAÇÃO DO `pg.Pool` A PARTIR DO AMBIENTE — regra pura, sem abrir nada.
 *
 * Sem prazo nenhum, um Postgres inalcançável deixava `pool.connect()` pendurado até o TCP desistir
 * (minutos), e uma consulta presa numa trava segurava a conexão — e com `max: 5`, o servidor — sem
 * limite. Os prazos aqui fazem a falha virar ERRO em tempo conhecido:
 *
 *  - `connectionTimeoutMillis` (DB_CONNECT_TIMEOUT_MS, 5 s): abrir conexão nova;
 *  - `idleTimeoutMillis` (30 s, fixo): conexão ociosa volta ao servidor;
 *  - `statement_timeout` (DB_STATEMENT_TIMEOUT_MS, 30 s): uma instrução;
 *  - `lock_timeout` (DB_LOCK_TIMEOUT_MS, 10 s): esperar trava de linha (inclusive as de `travas`) —
 *    estoura com SQLSTATE 55P03;
 *  - `idle_in_transaction_session_timeout` (DB_IDLE_TX_TIMEOUT_MS, 60 s): transação aberta e parada.
 *
 * Os três últimos são do SERVIDOR. A fonte de verdade é o PAPEL do banco (migration 0004,
 * `ALTER ROLE … SET`): o pooler do Supabase e o Hyperdrive ignoram o `options` da abertura da sessão.
 * O pool segue mandando `options: -c …` (vale onde é honrado, e deixa DB_*_TIMEOUT_MS por processo);
 * `DB_SESSION_OPTIONS=0` deixa de mandar. Quem sobrescreve DB_*_TIMEOUT_MS atrás de um pooler precisa
 * alterar o papel também (docs/runbook.md). O tamanho do pool é `DB_POOL_MAX` (5).
 *
 * Valor inválido (não inteiro, zero, negativo) LANÇA, com o nome da variável: cair no padrão em
 * silêncio esconderia um erro de digitação num prazo de produção. As variáveis estão declaradas em
 * `server/lib/config.ts`; esta leitura mora aqui porque `config.ts` importa `db.ts` (via `bootStatus`).
 */

interface ConfigDoPool {
  max: number
  connectionTimeoutMillis: number
  idleTimeoutMillis: number
  options?: string
}

const OCIOSA_MS = 30_000

/** Prazos padrão da sessão (ms). A migration 0004 grava os mesmos valores no papel do banco
    (tests/configDoPool.test.ts confere): mudar aqui exige nova migration. */
export const PRAZOS_PADRAO_MS = { statement: 30_000, lock: 10_000, ociosaEmTx: 60_000 } as const

function zeroOuUm(nome: string, valor: string | undefined): boolean {
  const bruto = valor?.trim()
  if (!bruto || bruto === '1') return true
  if (bruto === '0') return false
  throw new Error(`Erro de configuração: ${nome} deve ser 0 ou 1 (veio "${bruto.slice(0, 40)}")`)
}

function inteiroPositivo(nome: string, valor: string | undefined, padrao: number): number {
  const bruto = valor?.trim()
  if (!bruto) return padrao
  const n = Number(bruto)
  if (!/^\d+$/.test(bruto) || !Number.isSafeInteger(n) || n <= 0)
    throw new Error(`Erro de configuração: ${nome} deve ser um inteiro positivo (veio "${bruto.slice(0, 40)}")`)
  return n
}

/* Leituras ESCRITAS por extenso (`env.NOME`), e não montadas: é o que o inventário de configuração
   (tests/integration/config-inventario.test.ts) enxerga. */
export function configDoPool(env: NodeJS.ProcessEnv = process.env): ConfigDoPool {
  const statement = inteiroPositivo('DB_STATEMENT_TIMEOUT_MS', env.DB_STATEMENT_TIMEOUT_MS, PRAZOS_PADRAO_MS.statement)
  const lock = inteiroPositivo('DB_LOCK_TIMEOUT_MS', env.DB_LOCK_TIMEOUT_MS, PRAZOS_PADRAO_MS.lock)
  const ociosaEmTx = inteiroPositivo('DB_IDLE_TX_TIMEOUT_MS', env.DB_IDLE_TX_TIMEOUT_MS, PRAZOS_PADRAO_MS.ociosaEmTx)
  const enviaOptions = zeroOuUm('DB_SESSION_OPTIONS', env.DB_SESSION_OPTIONS)
  return {
    max: inteiroPositivo('DB_POOL_MAX', env.DB_POOL_MAX, 5),
    connectionTimeoutMillis: inteiroPositivo('DB_CONNECT_TIMEOUT_MS', env.DB_CONNECT_TIMEOUT_MS, 5_000),
    idleTimeoutMillis: OCIOSA_MS,
    ...(enviaOptions && {
      options: `-c statement_timeout=${statement} -c lock_timeout=${lock} -c idle_in_transaction_session_timeout=${ociosaEmTx}`,
    }),
  }
}
