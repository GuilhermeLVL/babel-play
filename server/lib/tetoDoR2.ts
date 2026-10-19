/**
 * TETO DE USO DO R2 (`openspec/changes/r2-teto-de-uso`).
 *
 * A Cloudflare não tem teto de gasto que bloqueie: passado o nível gratuito (10 GB guardados, 1 milhão
 * de operações de classe A e 10 milhões de classe B por mês), ela só manda um e-mail depois. Os tetos
 * daqui são a trava do lado do app, ligada, ajustada e revertida só por variável de ambiente:
 *
 *   - `R2_TETO_MB`: bytes guardados somando a conta inteira (conferido em `reservarArmazenamento`);
 *   - `R2_TETO_OPS_A_MES` / `R2_TETO_OPS_B_MES`: operações por mês (UTC), contadas no adaptador S3.
 *
 * Gramática das três: ausente → padrão (90 % do grátis); inteiro ≥ 1 → o teto; `0` → fecha (kill
 * switch); `ilimitado` → sem teto. Qualquer outro valor é erro de configuração e derruba o boot (o
 * adaptador S3 lê os tetos ao ser criado, no import das rotas).
 */

const MB = 1024 * 1024

export interface TetoDoR2 {
  /** Bytes guardados na conta inteira. `Infinity` = sem teto. */
  bytes: number
  /** Operações de classe A (PUT/DELETE) no mês UTC. */
  opsA: number
  /** Operações de classe B (GET/HEAD) no mês UTC. */
  opsB: number
}

const PADRAO_MB = 9216
const PADRAO_OPS_A = 900_000
const PADRAO_OPS_B = 9_000_000

function lerVariavel(nome: string, valor: string | undefined, padrao: number): number {
  const bruto = valor?.trim()
  if (!bruto) return padrao
  if (bruto === 'ilimitado') return Infinity
  if (/^\d+$/.test(bruto)) return Number(bruto)
  throw new Error(`Erro de configuração: ${nome} deve ser um inteiro ≥ 0 ou "ilimitado" (veio "${bruto.slice(0, 40)}")`)
}

/** Os três tetos do ambiente. Lança em valor inválido (erro de configuração). */
export function lerTetoDoR2(env: NodeJS.ProcessEnv = process.env): TetoDoR2 {
  const mb = lerVariavel('R2_TETO_MB', env.R2_TETO_MB, PADRAO_MB)
  return {
    bytes: Number.isFinite(mb) ? mb * MB : Infinity,
    opsA: lerVariavel('R2_TETO_OPS_A_MES', env.R2_TETO_OPS_A_MES, PADRAO_OPS_A),
    opsB: lerVariavel('R2_TETO_OPS_B_MES', env.R2_TETO_OPS_B_MES, PADRAO_OPS_B),
  }
}
