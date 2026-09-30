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
 * OS NÚMEROS DO LANÇAMENTO (Fase 2, decisão do dono em 24/09/2026) — a conta de custo, para que
 * nenhum plano dê prejuízo no PIOR caso (assinante que usa o teto inteiro):
 *
 *   Preços (Groq, 24/09/2026): whisper-large-v3-turbo US$ 0,04/h, mínimo de 10 s por requisição
 *   (cobrado do DONO, não da cota: o assinante gasta segundos REAIS — `segundosDeAudioDoUsuario`; o
 *   mínimo entra só no orçamento global); gpt-oss-120b US$ 0,15 por 1M tokens de entrada e US$ 0,60
 *   de saída. Câmbio de planejamento R$ 5,60/US$. Líquido = preço − Asaas (R$ 1,09) − Simples (~6%).
 *   Tradução medida: ~350 tokens de entrada + ~90 de saída por fala (US$ 0,107 por mil falas).
 *
 *   MEDIDO NA BANCADA DE 2026-09 (docs/auditoria/eval/bancada-2026-09.md): com o VAD fechando a
 *   fala após 800 ms, a Groq fatura 1,08× o tempo real (mínimo de 10 s por pedaço; com 450 ms eram
 *   2,06×). A tradução com gpt-oss-120b em raciocínio "low" custou US$ 0,036 por hora de fala.
 *
 *   ESSENCIAL R$ 19,90 → líquido ≈ R$ 17,62
 *     STT   54.000 s = 15 h × 1,08 × US$ 0,04                           = US$ 0,65
 *     LLM   3.000.000 tokens: pior caso tudo saída 3M × 0,60            = US$ 1,80
 *           (típico, 80% entrada: 3M × (0,8 × 0,15 + 0,2 × 0,60) / 1M  = US$ 0,72)
 *     PIOR CASO US$ 2,45 ≈ R$ 13,72 < R$ 17,62. 3M tokens ≈ 6.800 falas traduzidas + tutor.
 *     Chamadas 20.000: 15 h ÷ 6 s ≈ 9.000 falas × 2 (transcrever + traduzir) = 18.000, com folga
 *     para o tutor. Quem limita dinheiro são segundos e tokens; chamadas é fair-use.
 *
 *   PRO R$ 39,90 → líquido ≈ R$ 36,42
 *     STT   72.000 s = 20 h × 1,08 × US$ 0,04                           = US$ 0,86
 *     LLM   5.000.000 tokens: pior caso 5M × 0,60                       = US$ 3,00
 *     PIOR CASO US$ 3,86 ≈ R$ 21,62 < R$ 36,42. Chamadas 26.000 (20 h ÷ 6 s × 2 = 24.000 + folga).
 *     O MODELO MAIOR (`LLM_MODEL_GRANDE`) muda a conta: para o pior caso não passar do líquido, ele
 *     pode custar até ~US$ 1,10 por 1M tokens de SAÍDA ((36,42 ÷ 5,60 − 0,86) ÷ 5M). Acima disso,
 *     baixe `PRO_MONTHLY_LLM_TOKENS`. O orçamento global (`AI_BUDGET_USD_MONTH`) cobre o resto.
 */

/** Planos que o servidor pode atribuir. Derive listas com `PLANOS_DE_ASSINATURA`, nunca à mão. */
export type PlanoDeAssinatura = 'free' | 'essencial' | 'pro' | 'selfhost';

export interface EntitlementsDoPlano {
  /** Importação de YouTube (yt-dlp roda no servidor — custo/infra de quem hospeda). */
  youtubeImport: boolean;
  /** STT de nuvem com a chave do DONO do serviço. BYOK é sempre livre, em qualquer plano. */
  managedCloudStt: boolean;
  /** Tradução/LLM de nuvem com a chave do dono. */
  managedCloudLlm: boolean;
  /** Modelos locais maiores (whisper-base+). */
  largerModels: boolean;
  /**
   * A "Tradução Nuance" (B3 da Fase B): o nível `nuance` da tradução e do tutor — o modelo que o
   * registro de provedores marca para a nuance. Sem ela, o nível é o `rapida` ("Tradução rápida ao
   * vivo"). O servidor decide o nível por ESTE campo, nunca pelo nome do plano
   * (`src/core/nivelDeTraducao.ts`).
   */
  traducaoNuance: boolean;
}

export interface QuotasDoPlano {
  /** Chamadas gerenciadas por mês (STT + tradução + tutor dividem este pool). `null` = sem teto. */
  chamadasMes: number | null;
  /** Segundos REAIS de áudio no STT de nuvem por mês — a promessa ao assinante ("15 h"). O custo do
   dono é maior (mínimo de 10 s por requisição do provedor); ver a conta no topo. `null` = sem teto. */
  sttSegundosMes: number | null;
  /** Tokens (entrada + saída) no LLM de nuvem por mês — tradução e tutor dividem. `null` = sem teto. */
  tokensMes: number | null;
  /** Armazenamento de sessões/mídia, em MB. `null` = sem teto. */
  armazenamentoMb: number | null;
}

export interface DefinicaoDePlano {
  rotulo: string;
  /** Preço mensal em reais. `null` = não-vendável (free é grátis; selfhost não se compra). */
  precoMensalBrl: number | null;
  entitlements: EntitlementsDoPlano;
  quotas: QuotasDoPlano;
}

export const PLAN_MATRIX: Record<PlanoDeAssinatura, DefinicaoDePlano> = {
  free: {
    rotulo: 'Grátis',
    precoMensalBrl: null,
    entitlements: {
      youtubeImport: false,
      managedCloudStt: false,
      managedCloudLlm: false,
      largerModels: false,
      traducaoNuance: false,
    },
    // Chamadas 0: o free já é barrado antes, pelo entitlement — o teto só reafirma.
    quotas: { chamadasMes: 0, sttSegundosMes: 0, tokensMes: 0, armazenamentoMb: 500 },
  },
  essencial: {
    rotulo: 'Essencial',
    precoMensalBrl: 19.9,
    /* LLM e transcrição de nuvem, com o modelo padrão. YouTube fica de fora em TODO plano vendido:
       no modo hospedado a importação responde 403 (o yt-dlp roda no servidor; só o self-host a
       libera) — vender o que a rota recusa seria cobrar por uma promessa. */
    entitlements: {
      youtubeImport: false,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: false,
      traducaoNuance: true,
    },
    quotas: { chamadasMes: 20_000, sttSegundosMes: 54_000, tokensMes: 3_000_000, armazenamentoMb: 1_000 },
  },
  pro: {
    rotulo: 'Pro',
    precoMensalBrl: 39.9,
    entitlements: {
      youtubeImport: false,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
    },
    /* 20 h de transcrição e o modelo maior. A conta de cada número está no topo do arquivo. */
    quotas: { chamadasMes: 26_000, sttSegundosMes: 72_000, tokensMes: 5_000_000, armazenamentoMb: 5_000 },
  },
  selfhost: {
    rotulo: 'Self-host (tudo liberado)',
    precoMensalBrl: null,
    // A chave de IA é do próprio dono da instância: não há custo nosso, nada a gatear.
    entitlements: {
      youtubeImport: true,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
    },
    quotas: { chamadasMes: null, sttSegundosMes: null, tokensMes: null, armazenamentoMb: null },
  },
};

/**
 * O CONVIDADO (Fase 7 — `openspec/audits/2026-09-25-prontidao/fase7-convidado.md`). NÃO é plano de
 * assinatura — ninguém o compra e nenhuma linha de `subscriptions` o concede —, por isso fica FORA
 * de `PLAN_MATRIX` (e de `PLANOS_DE_ASSINATURA`, do admin e do webhook). É o plano que o servidor
 * dá a um usuário ANÔNIMO do Supabase (JWT com `is_anonymous: true`), e só enquanto ele for anônimo.
 *
 * Os números vêm da proposta de custo da Fase 3 (`fase3-custo.md` §4, `P.proposta.convidado` em
 * `scripts/custo/modelo.mjs`): 10 min de nuvem por mês (STT e tradução no mesmo pool), 5 mensagens de
 * tutor, teto de US$ 0,02 por convidado/mês.
 *
 *   STT   600 s × 1,08 (VAD) × US$ 0,04/h                               = US$ 0,0072
 *   LLM   40.000 tokens — ~90 falas traduzidas (~440 tokens) + 5 do tutor
 *         típico, 80% entrada: 40k × (0,8 × 0,15 + 0,2 × 0,60) / 1M      = US$ 0,0096
 *   TÍPICO US$ 0,017 < US$ 0,02. O pior caso (tudo saída) passaria do teto, e é por isso que o
 *   teto em DÓLAR (`tetoUsdMes`) é conferido à parte, no servidor: ele fecha a nuvem antes.
 *
 * A NUVEM DO CONVIDADO NASCE DESLIGADA: além destes números, o servidor exige a flag
 * `nuvem_convidado` (desligada enquanto a Groq estiver na camada grátis, e porque o convidado não
 * passa pela aferição de idade — LGPD art. 14). Os `entitlements` abaixo dizem o que o plano PODE;
 * a flag diz se pode AGORA.
 */
export const PLANO_CONVIDADO: DefinicaoDePlano = {
  rotulo: 'Convidado',
  precoMensalBrl: null,
  /* A nuvem do convidado é a da tradução RÁPIDA: a nuance é de quem paga. */
  entitlements: {
    youtubeImport: false,
    managedCloudStt: true,
    managedCloudLlm: true,
    largerModels: false,
    traducaoNuance: false,
  },
  /* Armazenamento 0: o convidado guarda tudo no aparelho; o servidor recusa escrita (`exige_conta`).
     Chamadas: 600 s ÷ 6 s × 2 (transcrever + traduzir) = 200, mais as 5 do tutor, com folga. */
  quotas: { chamadasMes: 220, sttSegundosMes: 600, tokensMes: 40_000, armazenamentoMb: 0 },
};

/** O que só o convidado tem: teto de mensagens de tutor e teto de gasto por mês. */
export const LIMITES_DO_CONVIDADO = {
  tutorMensagensMes: 5,
  /** Teto de gasto ESTIMADO por convidado no mês, em US$ (conferido antes, somado depois). */
  tetoUsdMes: 0.02,
} as const;

/**
 * Quanto a Groq FATURA para cada segundo real de fala, com o VAD fechando a fala após 800 ms
 * (mínimo de 10 s por pedaço) — MEDIDO na bancada de 2026-09 (`docs/auditoria/eval/bancada-2026-09.md`).
 * É o número que converte a cota em segundos REAIS no custo do dono.
 */
export const FATOR_FATURADO_DO_STT = 1.08;

/**
 * A NUVEM DE ALÍVIO (A10 do plano "Grátis sem travar", decisão do dono em 29/09/2026): o Grátis tem
 * 3 h/mês de nuvem PARA APARELHO FRACO, além do aparelho sem limite. NÃO é um plano nem muda o
 * `free` da matriz (que continua sem nuvem): é uma franquia à parte, contada POR CONTA no servidor
 * (`server/lib/nuvemDeAlivio.ts`, contadores próprios em `usage_counters`), que só vale para quem o
 * aparelho não aguenta o modelo local. No aparelho forte a pessoa roda local de graça, e oferecer a
 * nuvem ali só custaria dinheiro — por isso a elegibilidade por aparelho é um portão de UX no
 * cliente (`src/core/nuvemDeAlivio.ts`), e o limite de verdade é este, no servidor.
 *
 * A CONTA DE CUSTO, com os preços que o código usa (`server/lib/orcamentoDeIa.ts`, Groq 24/09/2026):
 *
 *   STT   10.800 s × 1,08 (faturado) × US$ 0,04/h                        = US$ 0,1296
 *   LLM   gpt-oss-120b: US$ 0,15 por 1M de entrada, US$ 0,60 de saída. A tradução medida na
 *         bancada custa US$ 0,036 por hora de fala (raciocínio "low"): 3 h traduzidas na nuvem
 *         seriam mais US$ 0,108 — as duas coisas juntas (~US$ 0,24) NÃO cabem no aceite.
 *
 *   O ACEITE DO PLANO É ≤ US$ 0,13 POR USUÁRIO GRÁTIS/MÊS, e quem o garante é `tetoUsdMes`: um teto
 *   em DÓLAR por conta, conferido ANTES de cada chamada e somado DEPOIS (o mesmo molde do teto do
 *   convidado). As 3 h de transcrição cabem nele (US$ 0,1296); a tradução na nuvem sai do MESMO
 *   teto, então quem traduz na nuvem transcreve menos que 3 h — e o "restam X" que a pessoa vê já
 *   é o menor dos dois (`segundosRestantesDoAlivio`). Com a cascata barata da Fase B (DeepInfra
 *   ~US$ 0,024/h de fala e tradução), as 3 h passam a caber com tradução; o teto não muda.
 *
 *   Tokens e chamadas são tetos de USO JUSTO, não de dinheiro (quem fecha o dinheiro é o dólar):
 *     tokens   540.000 = o que gastaria a franquia inteira só em tradução, na mistura típica de 80%
 *              de entrada: US$ 0,13 ÷ (0,8 × 0,15 + 0,2 × 0,60) × 1M;
 *     chamadas 4.000  = 10.800 s ÷ 6 s por fala × 2 (transcrever + traduzir) = 3.600, com folga.
 *
 * O pool DIÁRIO do alívio (teto somando TODOS os grátis, ≤ 20% do orçamento diário de nuvem) e a
 * reserva de 80% para quem paga estão em `src/core/nuvemDeAlivio.ts`.
 */
export const FRANQUIA_DE_ALIVIO = {
  sttSegundosMes: 10_800,
  tokensMes: 540_000,
  chamadasMes: 4_000,
  /** Teto de gasto ESTIMADO por conta no mês, em US$ — o aceite do plano. */
  tetoUsdMes: 0.13,
} as const;

/** O plano EFETIVO que o servidor resolve: um de assinatura, ou `convidado` (anônimo com JWT). */
export type PlanoEfetivo = PlanoDeAssinatura | 'convidado';

/** A definição de qualquer plano efetivo — a matriz para os de assinatura, `PLANO_CONVIDADO` para o convidado. */
export function definicaoDoPlano(plano: PlanoEfetivo): DefinicaoDePlano {
  return plano === 'convidado' ? PLANO_CONVIDADO : PLAN_MATRIX[plano];
}

/** A lista derivada — o que substitui as cinco cópias manuais. */
export const PLANOS_DE_ASSINATURA = Object.keys(PLAN_MATRIX) as readonly PlanoDeAssinatura[];

export const ehPlanoDeAssinatura = (v: unknown): v is PlanoDeAssinatura =>
  typeof v === 'string' && (PLANOS_DE_ASSINATURA as readonly string[]).includes(v);

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
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  for (const p of PLANOS_DE_ASSINATURA) {
    const preco = PLAN_MATRIX[p].precoMensalBrl;
    if (preco !== null && Math.abs(preco - valor) < 0.01) return p;
  }
  return null;
}

/**
 * O PREÇO, FORMATADO, DE UM LUGAR SÓ (mudança vender-onde-se-ve).
 *
 * A matriz sempre foi a fonte, e mesmo assim quatro telas escreviam o número à mão:
 * `Planos.tsx` na tabela comparativa (duas vezes), `MenuDaConta.tsx` no selo do avatar, e o texto
 * das quotas de armazenamento. Preço duplicado diverge — foi exatamente por isso que `PLAN_MATRIX`
 * existe, e a duplicação tinha voltado pela porta da apresentação.
 */
export function precoDoPlano(plano: PlanoDeAssinatura): string | null {
  const v = PLAN_MATRIX[plano].precoMensalBrl;
  return v === null ? null : v.toFixed(2).replace('.', ',');
}

/** O menor preço mensal entre os planos vendáveis — para "a partir de R$ X". */
export function menorPrecoDeAssinatura(): string | null {
  const precos = PLANOS_DE_ASSINATURA.map((p) => PLAN_MATRIX[p].precoMensalBrl).filter(
    (v): v is number => typeof v === 'number' && v > 0,
  );
  return precos.length
    ? Math.min(...precos)
        .toFixed(2)
        .replace('.', ',')
    : null;
}

/**
 * Horas de transcrição de nuvem por mês, derivadas da quota em segundos — a tela escreve "15 h"
 * a partir daqui, nunca à mão. `null` = sem teto (self-host).
 */
export function horasDeTranscricao(plano: PlanoDeAssinatura): number | null {
  const s = PLAN_MATRIX[plano].quotas.sttSegundosMes;
  return s === null ? null : Math.round((s / 3600) * 10) / 10;
}

/** "500 MB" / "1 GB" — o teto de armazenamento em texto, derivado da quota. */
export function armazenamentoEmTexto(plano: PlanoDeAssinatura): string {
  const mb = PLAN_MATRIX[plano].quotas.armazenamentoMb;
  if (mb === null) return 'sem teto';
  /* MIL, e não 1024: os tetos da matriz são escritos em milhares redondos (500, 1_000, 5_000),
     porque é assim que um teto comercial é decidido — e a régua binária os devolvia como
     "1000 MB" e "4.9 GB", números que ninguém escolheria escrever numa tabela de preços. Não é
     só formatação feia: "4.9 GB" faz o teto parecer arredondado para baixo por alguma pegadinha,
     quando o valor é exatamente 5. */
  return mb >= 1000 ? `${(mb / 1000).toFixed(mb % 1000 === 0 ? 0 : 1)} GB` : `${mb} MB`;
}
