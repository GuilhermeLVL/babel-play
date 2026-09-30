/**
 * MATRIZ DE PLANOS — a fonte única de planos, entitlements, quotas e rótulos.
 *
 * POR QUE ISTO EXISTE. A lista de planos estava copiada à mão em CINCO lugares (tipo do servidor,
 * guard do servidor, tipo do cliente, lista do cliente, z.enum do admin), e quatro deles falhavam
 * EM SILÊNCIO: uma assinatura com plano fora da lista degradava para `free`, o cliente descartava a
 * resposta inteira de entitlements, e as quotas devolviam zero. Especificação original:
 * `openspec/changes/archive/2026-09-07-planos-essencial/`; a matriz v2: `openspec/changes/planos-v2/`.
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
 * A MATRIZ V2 (decisão do dono em 29/09/2026, ADR 0011): Grátis + PREMIUM. O Essencial e o Pro
 * saíram — dois planos pagos quase iguais pediam uma conta que a pessoa não quer fazer — e os nomes
 * antigos continuam sendo LIDOS como Premium (`PLANOS_LEGADOS`, `normalizarPlano`): linha antiga no
 * banco, regra antiga de flag e cache antigo no navegador não derrubam o acesso de ninguém.
 *
 * A CONTA DE CUSTO, para que o Premium não dê prejuízo no uso TÍPICO de quem usa o teto inteiro:
 *
 *   Preços (Groq, 24/09/2026): whisper-large-v3-turbo US$ 0,04/h, faturado 1,08× o tempo real com o
 *   VAD fechando a fala após 800 ms (mínimo de 10 s por pedaço — custo do DONO, não da cota: o
 *   assinante gasta segundos REAIS, `segundosDeAudioDoUsuario`); gpt-oss-120b em raciocínio "low"
 *   custou US$ 0,036 por hora de fala traduzida (docs/auditoria/eval/bancada-2026-09.md), a US$ 0,15
 *   por 1M tokens de entrada e US$ 0,60 de saída. Câmbio de planejamento R$ 5,60/US$.
 *   UMA HORA DE LEGENDA (transcrita e traduzida) ≈ 1,08 × 0,04 + 0,036 = US$ 0,079.
 *
 *   PREMIUM R$ 19,90 → líquido ≈ R$ 17,62 (− Asaas R$ 1,09 − Simples ~6%) ≈ US$ 3,15
 *     O TETO MENSAL É O EMPATE: 40 h × US$ 0,079 = US$ 3,17. É o número do plano ATÉ o B7 medir a
 *     cascata barata (DeepInfra ~US$ 0,024/h); aí o mensal sobe para 60 h (= 30 dias × 2 h) — com a
 *     pilha de hoje 60 h custariam ~US$ 4,74, prejuízo em todo assinante intenso. Quem mexe antes disso
 *     mexe por `PREMIUM_MONTHLY_STT_SECONDS`, sabendo que passa do empate.
 *     TOKENS: US$ 0,036/h ÷ US$ 0,24 por 1M (mistura medida: 80% entrada, 20% saída) ≈ 150 MIL TOKENS
 *     POR HORA DE FALA → 6 M no mês (40 h) e 300 mil no dia (2 h). O PIOR CASO TEÓRICO (tudo saída,
 *     6 M × 0,60 = US$ 3,60, mais o STT) NÃO fecha no líquido, e isto é declarado: quem segura esse
 *     caso é o orçamento global (`AI_BUDGET_USD_MONTH`/`_DAY`) e o teto do dia, não esta matriz.
 *     CHAMADAS 50.000: 40 h ÷ 6 s × 2 (transcrever + traduzir) = 48.000, com folga para o tutor. Quem
 *     limita dinheiro são segundos e tokens; chamadas é fair-use.
 *
 *   O USO JUSTO DO DIA ("sem limite no dia a dia", decisão do dono): 2 h de STT por dia local, e os
 *   tokens de 2 h de fala. Passando disso a nuvem descansa até amanhã e a legenda segue no aparelho
 *   (429 `uso_justo_do_dia`, `src/core/usoJusto.ts`) — sem venda nenhuma. Com o mensal em 40 h, quem
 *   usa 2 h TODO dia encontra o mensal no dia 20; depois do B7 o diário passa a ser o teto que manda.
 */

/** Planos que o servidor pode atribuir. Derive listas com `PLANOS_DE_ASSINATURA`, nunca à mão. */
export type PlanoDeAssinatura = 'free' | 'premium' | 'selfhost';

/**
 * OS NOMES QUE JÁ EXISTIRAM, e o plano que eles são hoje. Existe porque o nome antigo vive FORA do
 * código: `subscriptions.plan` gravado antes da migração 0041 (ou por um processo velho durante o
 * deploy), `regras.planos` de uma flag editada à mão, o script de admin de alguém, o cache do
 * navegador de quem não recarregou a aba. Toda fronteira que lê plano de fora passa por
 * `normalizarPlano`; o código de dentro só conhece os nomes atuais.
 */
export const PLANOS_LEGADOS = Object.freeze({ essencial: 'premium', pro: 'premium' }) satisfies Readonly<
  Record<string, PlanoDeAssinatura>
>;

/** Como a pessoa paga: por MÊS, ou o ANO (inteiro, na assinatura `YEARLY`, ou em 12x no cartão). */
export type CicloDeCobranca = 'mensal' | 'anual';

/**
 * O FLUXO do Asaas que cobra (sondagem de 29/09/2026, `openspec/changes/planos-v2/design.md`): a
 * ASSINATURA recorrente (mensal ou `YEARLY`), o PARCELAMENTO do anual em 12x (outro recurso da API,
 * sem renovação automática) e o Pix Automático (API de autorização à parte, atrás de flag no C5).
 */
export type MeioDeCobranca = 'assinatura' | 'parcelamento' | 'pix_automatico';

/** Em quantas vezes o anual é vendido. Outra quantidade de parcelas não paga plano nenhum. */
export const PARCELAS_DO_ANUAL = 12;

export interface EntitlementsDoPlano {
  /** Importação de YouTube (yt-dlp roda no servidor — custo/infra de quem hospeda). */
  youtubeImport: boolean;
  /** STT de nuvem com a chave do DONO do serviço. BYOK é sempre livre, em qualquer plano. */
  managedCloudStt: boolean;
  /** Tradução/LLM de nuvem com a chave do dono. */
  managedCloudLlm: boolean;
  /** Modelos locais maiores (whisper-base+) e o `LLM_MODEL_GRANDE`, quando o operador o define. */
  largerModels: boolean;
  /** A TRADUÇÃO NUANCE (Fase D): o nível `nuance` do contrato `src/core/nivelDeTraducao.ts` (B3). */
  traducaoNuance: boolean;
  /** A VOZ NATURAL da nuvem no modo intérprete (Fase E); sem ela, a voz do aparelho. */
  vozNatural: boolean;
}

export interface QuotasDoPlano {
  /** Chamadas gerenciadas por mês (STT + tradução + tutor dividem este pool). `null` = sem teto. */
  chamadasMes: number | null;
  /** Segundos REAIS de áudio no STT de nuvem por mês — a promessa ao assinante. O custo do dono é
   maior (mínimo de 10 s por requisição do provedor); ver a conta no topo. `null` = sem teto. */
  sttSegundosMes: number | null;
  /** Tokens (entrada + saída) no LLM de nuvem por mês — tradução e tutor dividem. `null` = sem teto. */
  tokensMes: number | null;
  /** Armazenamento de sessões/mídia, em MB. `null` = sem teto. */
  armazenamentoMb: number | null;
  /** O USO JUSTO DO DIA: segundos de STT de nuvem por dia LOCAL da pessoa. `null` = sem teto no dia
   (e nada é contado por dia). */
  sttSegundosDia: number | null;
  /** Tokens de LLM de nuvem por dia local. `null` = sem teto no dia. */
  tokensDia: number | null;
}

export interface DefinicaoDePlano {
  rotulo: string;
  /** Preço mensal em reais. `null` = não-vendável (free é grátis; selfhost não se compra). */
  precoMensalBrl: number | null;
  /** Preço do ANO em reais (à vista na assinatura `YEARLY`, ou em `PARCELAS_DO_ANUAL` vezes). */
  precoAnualBrl: number | null;
  entitlements: EntitlementsDoPlano;
  quotas: QuotasDoPlano;
}

export const PLAN_MATRIX: Record<PlanoDeAssinatura, DefinicaoDePlano> = {
  free: {
    rotulo: 'Grátis',
    precoMensalBrl: null,
    precoAnualBrl: null,
    entitlements: {
      youtubeImport: false,
      managedCloudStt: false,
      managedCloudLlm: false,
      largerModels: false,
      traducaoNuance: false,
      vozNatural: false,
    },
    /* Chamadas 0: o free já é barrado antes, pelo entitlement — o teto só reafirma. A nuvem de
       aparelho fraco do Grátis NÃO é esta quota: é a `FRANQUIA_DE_ALIVIO`, com contadores próprios. */
    quotas: {
      chamadasMes: 0,
      sttSegundosMes: 0,
      tokensMes: 0,
      armazenamentoMb: 500,
      sttSegundosDia: null,
      tokensDia: null,
    },
  },
  premium: {
    rotulo: 'Premium',
    precoMensalBrl: 19.9,
    precoAnualBrl: 179,
    /* A nuvem inteira. YouTube fica de fora: no modo hospedado a importação responde 403 (o yt-dlp
       roda no servidor; só o self-host a libera) — vender o que a rota recusa seria cobrar por uma
       promessa. `largerModels` vem do Pro (quem pagava por ele não perde nada); `LLM_MODEL_GRANDE`
       continua ausente por padrão, e o modelo mais forte chega pelo nível `nuance` (B3/D1). */
    entitlements: {
      youtubeImport: false,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
    },
    /* 5 GB: o maior dos dois planos antigos — ninguém do Pro perde espaço. A conta de cada número
       está no topo do arquivo. */
    quotas: {
      chamadasMes: 50_000,
      sttSegundosMes: 144_000,
      tokensMes: 6_000_000,
      armazenamentoMb: 5_000,
      sttSegundosDia: 7_200,
      tokensDia: 300_000,
    },
  },
  selfhost: {
    rotulo: 'Self-host (tudo liberado)',
    precoMensalBrl: null,
    precoAnualBrl: null,
    // A chave de IA é do próprio dono da instância: não há custo nosso, nada a gatear.
    entitlements: {
      youtubeImport: true,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
    },
    quotas: {
      chamadasMes: null,
      sttSegundosMes: null,
      tokensMes: null,
      armazenamentoMb: null,
      sttSegundosDia: null,
      tokensDia: null,
    },
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
  precoAnualBrl: null,
  entitlements: {
    youtubeImport: false,
    managedCloudStt: true,
    managedCloudLlm: true,
    largerModels: false,
    traducaoNuance: false,
    vozNatural: false,
  },
  /* Armazenamento 0: o convidado guarda tudo no aparelho; o servidor recusa escrita (`exige_conta`).
     Chamadas: 600 s ÷ 6 s × 2 (transcrever + traduzir) = 200, mais as 5 do tutor, com folga. Sem teto
     no dia: os 10 min do mês já são o limite, e o teto em dólar fecha antes. */
  quotas: {
    chamadasMes: 220,
    sttSegundosMes: 600,
    tokensMes: 40_000,
    armazenamentoMb: 0,
    sttSegundosDia: null,
    tokensDia: null,
  },
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

/** ESTRITO: só o nome ATUAL é plano de assinatura. Quem aceita nome antigo chama `normalizarPlano`. */
export const ehPlanoDeAssinatura = (v: unknown): v is PlanoDeAssinatura =>
  typeof v === 'string' && (PLANOS_DE_ASSINATURA as readonly string[]).includes(v);

/**
 * O PLANO QUE UM NOME É HOJE: o atual passa, o antigo (`PLANOS_LEGADOS`) vira o atual, o resto é
 * `null` — e quem recebe `null` decide (o servidor degrada para `free` com log; o cliente, para o
 * rótulo Grátis com as flags que o servidor mandou). `hasOwn`, e não `in`: `constructor` não é plano.
 */
export function normalizarPlano(v: unknown): PlanoDeAssinatura | null {
  if (ehPlanoDeAssinatura(v)) return v;
  if (typeof v === 'string' && Object.hasOwn(PLANOS_LEGADOS, v))
    return PLANOS_LEGADOS[v as keyof typeof PLANOS_LEGADOS];
  return null;
}

/** O plano é vendável (tem preço)? Hoje, só o Premium. */
export const ehPlanoPago = (p: unknown): p is PlanoDeAssinatura =>
  ehPlanoDeAssinatura(p) && PLAN_MATRIX[p].precoMensalBrl !== null;

/**
 * OS PREÇOS QUE JÁ FORAM COBRADOS, e o plano que eles pagam hoje. Uma assinatura recorrente criada
 * antes da matriz v2 continua mandando a mesma cobrança ao Asaas todo mês (o Pro a R$ 39,90, até o
 * dono decidir baixar o valor dela) — e o webhook precisa reconhecê-la, senão o assinante antigo
 * cairia na intenção gravada ou, pior, ficaria sem plano no mês seguinte.
 */
const PRECOS_LEGADOS: ReadonlyArray<{ valor: number; plano: PlanoDeAssinatura }> = [
  { valor: 19.9, plano: 'premium' }, // Essencial (o mesmo preço do Premium mensal)
  { valor: 39.9, plano: 'premium' }, // Pro
];

/* O provedor devolve o valor em ponto flutuante (19.899999…). Meio centavo, e não um: todo preço é
   um número inteiro de centavos, então o ruído do ponto flutuante fica muito abaixo disso — e um
   centavo inteiro de tolerância deixaria dois preços vizinhos (R$ 14,91 e R$ 14,92) empatarem. */
const casa = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * AS PARCELAS COMO O ASAAS AS COBRA (sondagem de 29/09/2026): com `totalValue`, ele TRUNCA a divisão
 * e joga a diferença na ÚLTIMA — 179 em 12x são 11 × R$ 14,91 + R$ 14,99. Em centavos inteiros, para
 * a soma fechar exata.
 */
export function valoresDasParcelas(total: number, parcelas: number): { padrao: number; ultima: number } {
  const centavos = Math.round(total * 100);
  const padrao = Math.floor(centavos / parcelas);
  return { padrao: padrao / 100, ultima: (centavos - padrao * (parcelas - 1)) / 100 };
}

/**
 * QUE PLANO E QUE CICLO ESTE PAGAMENTO PAGA — a pergunta que o webhook faz.
 *
 * O DEFEITO QUE ISTO FECHA (auditoria de 01/09, GAP-001). O webhook concedia `atual.plan`, que é a
 * INTENÇÃO gravada por `POST /api/billing/assinar` — e assinar é de graça: assinar o barato, assinar
 * o caro, pagar só o barato e receber o caro. O dinheiro tem de decidir, não a intenção.
 *
 * NA MATRIZ V2 o valor também diz o CICLO: o preço mensal é mensal; o anual inteiro é anual; a
 * parcela do 12x (`parcelas: PARCELAS_DO_ANUAL`, que o webhook do parcelamento informa) é anual.
 * Parcela de outra quantidade, ou parcela que chega sem dizer que é parcela, não paga plano nenhum:
 * R$ 14,91 como mensalidade seria o Premium pela terça parte. Os preços antigos pagam Premium mensal.
 */
export function planoPeloPagamento(
  valor: number | undefined,
  opcoes: { parcelas?: number } = {},
): { plano: PlanoDeAssinatura; ciclo: CicloDeCobranca } | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return null;
  const parcelas = opcoes.parcelas ?? 1;
  if (parcelas > 1) {
    if (parcelas !== PARCELAS_DO_ANUAL) return null;
    for (const plano of PLANOS_DE_ASSINATURA) {
      const anual = PLAN_MATRIX[plano].precoAnualBrl;
      if (anual === null) continue;
      const { padrao, ultima } = valoresDasParcelas(anual, parcelas);
      if (casa(valor, padrao) || casa(valor, ultima)) return { plano, ciclo: 'anual' };
    }
    return null;
  }
  for (const plano of PLANOS_DE_ASSINATURA) {
    const { precoMensalBrl: mensal, precoAnualBrl: anual } = PLAN_MATRIX[plano];
    if (mensal !== null && casa(valor, mensal)) return { plano, ciclo: 'mensal' };
    if (anual !== null && casa(valor, anual)) return { plano, ciclo: 'anual' };
  }
  const legado = PRECOS_LEGADOS.find((p) => casa(valor, p.valor));
  return legado ? { plano: legado.plano, ciclo: 'mensal' } : null;
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
 * Horas de transcrição de nuvem por mês, derivadas da quota em segundos — a tela escreve o número
 * a partir daqui, nunca à mão. `null` = sem teto (self-host).
 */
export function horasDeTranscricao(plano: PlanoDeAssinatura): number | null {
  const s = PLAN_MATRIX[plano].quotas.sttSegundosMes;
  return s === null ? null : Math.round((s / 3600) * 10) / 10;
}

/** Horas de nuvem por DIA (o uso justo), da quota do dia. `null` = sem teto no dia. */
export function horasDoUsoJusto(plano: PlanoDeAssinatura): number | null {
  const s = PLAN_MATRIX[plano].quotas.sttSegundosDia;
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
