/**
 * MATRIZ DE PLANOS — a fonte única de planos, entitlements, quotas e rótulos.
 *
 * POR QUE ISTO EXISTE. A lista de planos estava copiada à mão em CINCO lugares (tipo do servidor,
 * guard do servidor, tipo do cliente, lista do cliente, z.enum do admin), e quatro deles falhavam
 * EM SILÊNCIO: uma assinatura com plano fora da lista degradava para `free`, o cliente descartava a
 * resposta inteira de entitlements, e as quotas devolviam zero. Adicionar o plano Essencial em cima
 * disso semearia exatamente essa classe de bug — por isso a consolidação veio ANTES do plano novo.
 * Especificação: `openspec/changes/planos-essencial/`.
 *
 * PURO E ISOMÓRFICO, de propósito. Servidor e cliente importam DAQUI (o precedente é
 * `src/lib/traducao/promptComunicativo.ts`, compartilhado com `server/ai/mtProxy.ts`). Nada de I/O
 * e nada de `process.env`: no bundle do cliente `process.env` é substituição estática do Vite, e um
 * override de quota que só o servidor enxerga viraria mentira na tela. Os overrides por env são
 * aplicados por quem chama, no servidor (`server/lib/usageQuota.ts`, `storageQuota.ts`).
 *
 * `anonimo` NÃO está aqui: é identidade do cliente sem conta, não um plano que o servidor possa
 * atribuir a uma assinatura. O tipo do cliente o acrescenta por união.
 *
 * OS NÚMEROS DO ESSENCIAL têm motivo, não gosto (docs/auditoria/decisao-infraestrutura-v1.md):
 * ele vende a TRADUÇÃO de nuvem — a maior queixa medida (idiomático 27%→83%) — mantendo a
 * transcrição local. `sttSegundosMes: 0` é o que faz o plano custar menos de R$ 1/usuário/mês.
 */

/** Planos que o servidor pode atribuir. Derive listas com `PLANOS_DE_ASSINATURA`, nunca à mão. */
export type PlanoDeAssinatura = 'free' | 'essencial' | 'pro' | 'selfhost'

export interface EntitlementsDoPlano {
  /** Importação de YouTube (yt-dlp roda no servidor — custo/infra de quem hospeda). */
  youtubeImport: boolean
  /** STT de nuvem com a chave do DONO do serviço. BYOK é sempre livre, em qualquer plano. */
  managedCloudStt: boolean
  /** Tradução/LLM de nuvem com a chave do dono. */
  managedCloudLlm: boolean
  /** Modelos locais maiores (whisper-base+). */
  largerModels: boolean
}

export interface QuotasDoPlano {
  /** Chamadas gerenciadas por mês (STT + tradução + tutor dividem este pool). `null` = sem teto. */
  chamadasMes: number | null
  /** Segundos de áudio FATURÁVEIS no STT de nuvem por mês. É o teto de gasto real. `null` = sem teto. */
  sttSegundosMes: number | null
  /** Armazenamento de sessões/mídia, em MB. `null` = sem teto. */
  armazenamentoMb: number | null
}

export interface DefinicaoDePlano {
  rotulo: string
  /** Preço mensal em reais. `null` = não-vendável (free é grátis; selfhost não se compra). */
  precoMensalBrl: number | null
  entitlements: EntitlementsDoPlano
  quotas: QuotasDoPlano
}

export const PLAN_MATRIX: Record<PlanoDeAssinatura, DefinicaoDePlano> = {
  free: {
    rotulo: 'Grátis',
    precoMensalBrl: null,
    entitlements: { youtubeImport: false, managedCloudStt: false, managedCloudLlm: false, largerModels: false },
    // Chamadas 0: o free já é barrado antes, pelo entitlement — o teto só reafirma.
    quotas: { chamadasMes: 0, sttSegundosMes: 0, armazenamentoMb: 500 },
  },
  essencial: {
    rotulo: 'Essencial',
    precoMensalBrl: 9.9,
    /* Tradução de nuvem SIM, STT de nuvem NÃO — os dois gates são independentes nos proxies
       (mtProxy.ts:46, sttProxy.ts:44), e essa independência é o que torna o plano viável. */
    entitlements: { youtubeImport: false, managedCloudStt: false, managedCloudLlm: true, largerModels: false },
    quotas: { chamadasMes: 12_000, sttSegundosMes: 0, armazenamentoMb: 1_000 },
  },
  pro: {
    rotulo: 'Pro',
    precoMensalBrl: 19.9,
    entitlements: { youtubeImport: true, managedCloudStt: true, managedCloudLlm: true, largerModels: true },
    /* 12.000 ≈ 6.000 falas ≈ 10 h de conversa/mês (cada fala usa 2 chamadas); 36.000 s = 10 h
       faturadas de STT. Orçamento explícito em docs/auditoria/viabilidade-producao-v1.md. */
    quotas: { chamadasMes: 12_000, sttSegundosMes: 36_000, armazenamentoMb: 5_000 },
  },
  selfhost: {
    rotulo: 'Self-host (tudo liberado)',
    precoMensalBrl: null,
    // A chave de IA é do próprio dono da instância: não há custo nosso, nada a gatear.
    entitlements: { youtubeImport: true, managedCloudStt: true, managedCloudLlm: true, largerModels: true },
    quotas: { chamadasMes: null, sttSegundosMes: null, armazenamentoMb: null },
  },
}

/** A lista derivada — o que substitui as cinco cópias manuais. */
export const PLANOS_DE_ASSINATURA = Object.keys(PLAN_MATRIX) as readonly PlanoDeAssinatura[]

export const ehPlanoDeAssinatura = (v: unknown): v is PlanoDeAssinatura =>
  typeof v === 'string' && (PLANOS_DE_ASSINATURA as readonly string[]).includes(v)

/**
 * QUAL PLANO CUSTA ESTE VALOR — a pergunta que o webhook precisa fazer.
 *
 * O DEFEITO QUE ISTO FECHA (auditoria de 01/09). O webhook concedia `atual.plan`, que é a
 * INTENÇÃO gravada por `POST /api/billing/assinar` — e assinar é de graça. A sequência era:
 * assinar `essencial`, assinar `pro` (a intenção vira `pro`), pagar só a cobrança do essencial, e
 * receber Pro por R$ 9,90. O dinheiro tem de decidir, não a intenção.
 *
 * Tolerância de um centavo porque o provedor devolve o valor em ponto flutuante.
 */
export function planoPeloPreco(valor: number | undefined): PlanoDeAssinatura | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  for (const p of PLANOS_DE_ASSINATURA) {
    const preco = PLAN_MATRIX[p].precoMensalBrl
    if (preco !== null && Math.abs(preco - valor) < 0.01) return p
  }
  return null
}
