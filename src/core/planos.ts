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
 * A MATRIZ V3 (decisões de 09/10/2026, ADR 0013, `openspec/changes/planos-v3-e-rota-inteligente`):
 * Grátis + TRÊS planos pagos por NÍVEL DE SERVIÇO — Essencial (no aparelho, com a nuvem por trechos
 * sob demanda), Premium (a nuvem por trechos por padrão onde compensa) e Ao Vivo (o texto durante a
 * fala). Substitui a v2 (ADR 0011, um plano pago só). O id `essencial` voltou a ser um plano de
 * verdade, e por isso SAIU dos apelidos: só `pro` continua sendo lido como Premium (`PLANOS_LEGADOS`).
 *
 * O PLANO É IDENTIFICADO PELO VALOR PAGO (`planoPeloPagamento`), então todo valor cobrável — a
 * mensalidade, o ano e as duas parcelas do 12x de cada plano — tem de ser DIFERENTE de todos os
 * outros. `tests/planos-matriz.test.ts` cobra isso: quem mexer num preço e criar um empate quebra o
 * teste, e não a conta de um assinante.
 *
 * A CONTA DE CUSTO, para que nenhum plano dê prejuízo no uso TÍPICO de quem usa o teto inteiro:
 *
 *   Preços (Groq, 24/09/2026): whisper-large-v3-turbo US$ 0,04/h, faturado 1,08× o tempo real com o
 *   VAD fechando a fala após 800 ms (mínimo de 10 s por pedaço — custo do DONO, não da cota: o
 *   assinante gasta segundos REAIS, `segundosDeAudioDoUsuario`); gpt-oss-120b em raciocínio "low"
 *   custou US$ 0,036 por hora de fala traduzida (docs/auditoria/eval/bancada-2026-09.md), a US$ 0,15
 *   por 1M tokens de entrada e US$ 0,60 de saída. Câmbio de planejamento R$ 5,60/US$.
 *   UMA HORA DE LEGENDA POR TRECHOS (transcrita e traduzida) ≈ 1,08 × 0,04 + 0,036 = US$ 0,079.
 *   TOKENS: US$ 0,036/h ÷ US$ 0,24 por 1M (mistura medida: 80% entrada, 20% saída) ≈ 150 MIL TOKENS
 *   POR HORA DE FALA. CHAMADAS: uma fala de ~6 s usa duas (transcrever + traduzir).
 *
 *   ESSENCIAL R$ 9,90 → líquido ≈ R$ 8,22 (− Asaas R$ 1,09 − Simples ~6%) ≈ US$ 1,47
 *     5 h por trechos × US$ 0,079 = US$ 0,40 no teto. Tokens 750 mil (5 h); chamadas 6.000 + folga.
 *     Sem teto no dia: 5 h no mês já são o limite (como no convidado).
 *   PREMIUM R$ 19,90 → líquido ≈ R$ 17,62 ≈ US$ 3,15
 *     20 h por trechos × US$ 0,079 = US$ 1,58 no teto (a v2 vendia 40 h, que era o EMPATE: todo
 *     assinante intenso saía no zero). Tokens 3 M (20 h); chamadas 26.000 = 20 h ÷ 6 s × 2, com folga
 *     para o tutor.
 *   AO VIVO R$ 39,90 → líquido ≈ R$ 36,42 ≈ US$ 6,50
 *     20 h por trechos (US$ 1,58) MAIS 10 h ao vivo. O serviço de fluxo NÃO foi escolhido (§11, item
 *     12): o custo da hora ao vivo é estimativa, e por isso o plano não é vendido enquanto a flag
 *     `stt_ao_vivo` estiver desligada. Tokens 4,5 M (a tradução das 30 h); chamadas 24.000 dos
 *     trechos + 6.000 traduções das 10 h ao vivo + 1.200 blocos de 30 s = 31.200; 34.000 com folga.
 *
 *   O PIOR CASO TEÓRICO de tokens (tudo saída) não fecha no líquido, e isto é declarado: quem segura
 *   esse caso é o orçamento global (`AI_BUDGET_USD_MONTH`/`_DAY`) e o teto do dia, não esta matriz.
 *   São ESTIMATIVAS; o uso real por assinante precisa ser medido antes de abrir a venda do anual.
 *
 *   O USO JUSTO DO DIA (ADR 0011, mantido): 2 h de nuvem por trechos por dia local, e os tokens de
 *   2 h de fala. Passando disso a nuvem descansa até amanhã e a legenda segue no aparelho (429
 *   `uso_justo_do_dia`, `src/core/usoJusto.ts`) — sem venda nenhuma. Com 20 h no mês, quem usa 2 h
 *   TODO dia encontra o mensal no dia 10.
 */

/** Planos que o servidor pode atribuir. Derive listas com `PLANOS_DE_ASSINATURA`, nunca à mão. */
export type PlanoDeAssinatura = 'free' | 'essencial' | 'premium' | 'aovivo' | 'selfhost';

/**
 * OS NOMES QUE JÁ EXISTIRAM, e o plano que eles são hoje. Existe porque o nome antigo vive FORA do
 * código: `subscriptions.plan` gravado antes da migração 0041 (ou por um processo velho durante o
 * deploy), `regras.planos` de uma flag editada à mão, o script de admin de alguém, o cache do
 * navegador de quem não recarregou a aba. Toda fronteira que lê plano de fora passa por
 * `normalizarPlano`; o código de dentro só conhece os nomes atuais.
 *
 * `essencial` SAIU daqui na matriz v3: voltou a ser um plano (o de R$ 9,90), e lê-lo como Premium
 * daria o plano de cima a quem paga o de baixo. O servidor nunca foi implantado com o Essencial antigo
 * (`docs/ESTADO-DO-LANCAMENTO.md`), e a migração 0041 já tinha reescrito qualquer linha com esse nome.
 */
export const PLANOS_LEGADOS = Object.freeze({ pro: 'premium' }) satisfies Readonly<Record<string, PlanoDeAssinatura>>;

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

/**
 * O TESTE DO PREMIUM (C6): quantos dias ele dura. Sem cartão e sem cobrança automática nunca — no
 * fim a conta volta ao Grátis sozinha. Um por pessoa (o servidor guarda a marca do e-mail, ver
 * `server/lib/testePremium.ts`). A tela diz o número a partir daqui, nunca à mão.
 */
export const DIAS_DO_TESTE_PREMIUM = 14;

/**
 * EM QUE NÍVEL O PLANO FALA (planos v3): a voz do `aparelho` (a do sistema, de graça), a neural
 * `basica` ou a neural `boa`, na ordem. Quais vozes são a básica e a boa fica para a medição de custo
 * (`design.md` §11, item 10): até lá as duas saem do mesmo provedor, e o nível só registra o que o
 * plano promete.
 */
export const NIVEIS_DE_VOZ = ['aparelho', 'basica', 'boa'] as const;
export type NivelDeVoz = (typeof NIVEIS_DE_VOZ)[number];

export interface EntitlementsDoPlano {
  /** Importação de YouTube (yt-dlp roda no servidor — custo/infra de quem hospeda). */
  youtubeImport: boolean;
  /** STT de nuvem com a chave do DONO do serviço. BYOK é sempre livre, em qualquer plano. */
  managedCloudStt: boolean;
  /** Tradução/LLM de nuvem com a chave do dono. */
  managedCloudLlm: boolean;
  /** Modelos locais maiores (whisper-base+) e o `LLM_MODEL_GRANDE`, quando o operador o define. */
  largerModels: boolean;
  /**
   * A TRADUÇÃO NUANCE (B3 da Fase B, telas na Fase D): o nível `nuance` da tradução e do tutor — o
   * modelo que o registro de provedores marca para a nuance. Sem ela, o nível é o `rapida`
   * ("Tradução rápida ao vivo"). O servidor decide o nível por ESTE campo, nunca pelo nome do plano
   * (`src/core/nivelDeTraducao.ts`).
   */
  traducaoNuance: boolean;
  /** A VOZ NATURAL da nuvem no modo intérprete (Fase E); sem ela, a voz do aparelho. */
  vozNatural: boolean;
  /**
   * O MODO AUTOMÁTICO do intérprete (E7; decisão do dono, 30/09: só no Premium): ninguém toca em lado,
   * o idioma de cada fala é medido pelo áudio. Precisa do Whisper (a Web Speech não detecta idioma), e
   * no Grátis isso seria um download no aparelho — lá fica o modo por toque.
   */
  interpreteAutomatico: boolean;
  /**
   * SEM ANÚNCIOS (planos v3). A política de anúncios (`src/core/anuncios`, atrás da flag `anuncios`)
   * nega por ESTE campo; quem paga, quem testa o Premium e o self-host não veem anúncio.
   */
  semAnuncios: boolean;
  /**
   * A NUVEM AO VIVO (planos v3): o texto durante a fala, em fluxo, com a cota própria
   * `sttAoVivoSegundosMes`. O plano diz que PODE; se a rota existe AGORA é a flag `stt_ao_vivo`.
   */
  sttAoVivo: boolean;
  /**
   * O nível da voz que lê a tradução. `vozNatural` continua sendo o campo que as rotas leem ("tem voz
   * de nuvem?"), e é sempre o mesmo que `nivelDeVoz !== 'aparelho'` (`tests/planos-capacidades.test.ts`).
   */
  nivelDeVoz: NivelDeVoz;
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
  /**
   * A VOZ NATURAL do modo intérprete (Fase E): caracteres lidos em voz alta pela nuvem, no mês e no
   * dia local. Só conta para quem tem `vozNatural`; sem ele, o plano nem chega à nuvem (402). A conta
   * está em `PLAN_MATRIX.premium`. `null` = sem teto.
   */
  vozCaracteresMes: number | null;
  vozCaracteresDia: number | null;
  /**
   * Segundos de fala na NUVEM AO VIVO por mês (planos v3) — um contador À PARTE do de trechos
   * (`stt_live_seconds` ao lado de `stt_seconds`), e as duas cotas se SOMAM. `0` em quem não tem
   * `sttAoVivo`; `null` = sem teto.
   */
  sttAoVivoSegundosMes: number | null;
}

/**
 * OS NÍVEIS DA NOSSA NUVEM que têm horas no plano (planos v3): `trechos` (a fala fechada pelo VAD e
 * enviada inteira — `POST /api/ai/stt`, a cota `sttSegundosMes`) e `aovivo` (o texto durante a fala,
 * em fluxo — a cota `sttAoVivoSegundosMes`). Cada um tem o SEU contador; as horas se somam.
 */
export const NIVEIS_DA_NUVEM = ['trechos', 'aovivo'] as const;
export type NivelDaNuvem = (typeof NIVEIS_DA_NUVEM)[number];

export interface DefinicaoDePlano {
  rotulo: string;
  /** Preço mensal em reais. `null` = não-vendável (free é grátis; selfhost não se compra). */
  precoMensalBrl: number | null;
  /** Preço do ANO em reais (à vista na assinatura `YEARLY`, ou em `PARCELAS_DO_ANUAL` vezes). */
  precoAnualBrl: number | null;
  /**
   * AS FLAGS QUE ABREM A VENDA deste plano (planos v3): `POST /api/billing/assinar` só o vende com
   * TODAS ligadas. Vazio = vende como sempre (o Premium). Não é permissão de USO: quem já tem o plano
   * (pagou antes, ou o admin concedeu) continua com ele, flag ligada ou não.
   */
  flagsDeVenda: readonly string[];
  entitlements: EntitlementsDoPlano;
  quotas: QuotasDoPlano;
}

/**
 * AS CHAVES DA VENDA (planos v3). `venda_planos_v3` abre a venda dos planos novos; `stt_ao_vivo` diz
 * que a nuvem ao vivo existe. As duas nascem DESLIGADAS (migração 0048): abrir a venda é ato do dono.
 */
export const FLAG_VENDA_PLANOS_V3 = 'venda_planos_v3';
export const FLAG_STT_AO_VIVO = 'stt_ao_vivo';

export const PLAN_MATRIX: Record<PlanoDeAssinatura, DefinicaoDePlano> = {
  free: {
    rotulo: 'Grátis',
    precoMensalBrl: null,
    precoAnualBrl: null,
    flagsDeVenda: [],
    entitlements: {
      youtubeImport: false,
      managedCloudStt: false,
      managedCloudLlm: false,
      largerModels: false,
      traducaoNuance: false,
      vozNatural: false,
      interpreteAutomatico: false,
      semAnuncios: false,
      sttAoVivo: false,
      nivelDeVoz: 'aparelho',
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
      vozCaracteresMes: 0,
      vozCaracteresDia: null,
      sttAoVivoSegundosMes: 0,
    },
  },
  essencial: {
    rotulo: 'Essencial',
    precoMensalBrl: 9.9,
    precoAnualBrl: 79.9,
    flagsDeVenda: [FLAG_VENDA_PLANOS_V3],
    /* NO APARELHO, com a nuvem por trechos SOB DEMANDA (5 h no mês para transcrever e traduzir, não
       por padrão — quem decide quando usar é a política de rota) e a Tradução Nuance. Sem anúncios.
       Fala com a voz do aparelho e o intérprete é por toque. `largerModels` fica de fora: além dos
       modelos locais maiores ele liga o `LLM_MODEL_GRANDE` do registro legado, que é custo de nuvem. */
    entitlements: {
      youtubeImport: false,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: false,
      traducaoNuance: true,
      vozNatural: false,
      interpreteAutomatico: false,
      semAnuncios: true,
      sttAoVivo: false,
      nivelDeVoz: 'aparelho',
    },
    /* 5 h por trechos; a conta está no topo. Sem teto no dia (o mês já é curto) e sem voz de nuvem. */
    quotas: {
      chamadasMes: 6_500,
      sttSegundosMes: 18_000,
      tokensMes: 750_000,
      armazenamentoMb: 500,
      sttSegundosDia: null,
      tokensDia: null,
      vozCaracteresMes: 0,
      vozCaracteresDia: null,
      sttAoVivoSegundosMes: 0,
    },
  },
  premium: {
    rotulo: 'Premium',
    precoMensalBrl: 19.9,
    precoAnualBrl: 149.9,
    flagsDeVenda: [],
    /* A nuvem por trechos POR PADRÃO onde compensa. YouTube fica de fora: no modo hospedado a
       importação responde 403 (o yt-dlp roda no servidor; só o self-host a libera) — vender o que a
       rota recusa seria cobrar por uma promessa. `largerModels` vem do Pro (quem pagava por ele não
       perde nada); `LLM_MODEL_GRANDE` continua ausente por padrão, e o modelo mais forte chega pelo
       nível `nuance` (B3/D1). É o plano do TESTE de 14 dias (`PLANO_DO_TESTE`). */
    entitlements: {
      youtubeImport: false,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: true,
      semAnuncios: true,
      sttAoVivo: false,
      nivelDeVoz: 'basica',
    },
    /* 20 h por trechos (a v2 vendia 40 h, o empate de custo). A conta de cada número está no topo. */
    quotas: {
      chamadasMes: 26_000,
      sttSegundosMes: 72_000,
      tokensMes: 3_000_000,
      /* MVP (04/10/2026, decisão do dono): nenhum plano VENDE espaço. Sem armazenamento externo o áudio
         divide com o banco um volume de 1 a 10 GB, e dois assinantes com 5 GB cheios o enchiam. O teto é
         o mesmo do Grátis; volta a subir quando houver bucket (S3_*) e a oferta voltar à tela. */
      armazenamentoMb: 500,
      sttSegundosDia: 7_200,
      tokensDia: 300_000,
      /* A VOZ NATURAL (E4 da Fase E). Chatterbox Multilingual na DeepInfra: US$ 1,00 por 1M de caracteres
         (deepinfra.com, 30/09/2026). A voz lê ~15 caracteres por segundo → ~54.000 por hora de voz
         → ~US$ 0,054 por hora.
           dia  60.000 ≈ 1,1 h de voz — a tradução lida de ~2 h de conversa (o uso justo do dia,
                a metade do tempo é a pessoa falando) → no máximo ~US$ 0,06 no dia;
           mês 600.000 ≈ 11 h de voz → no máximo ~US$ 0,60 por assinante no mês.
         PROVISÓRIO: o teto liga com o custo medido no uso real (E6); `PREMIUM_*_TTS_CHARS` sobrepõe.
         Passando dele, a voz do aparelho segue — o intérprete nunca para. */
      vozCaracteresMes: 600_000,
      vozCaracteresDia: 60_000,
      sttAoVivoSegundosMes: 0,
    },
  },
  aovivo: {
    rotulo: 'Ao Vivo',
    precoMensalBrl: 39.9,
    /* Só mensal no início (`design.md` §1): o custo da hora ao vivo ainda é estimativa, e um ano
       vendido adiantado travaria o preço antes de ele ser medido. */
    precoAnualBrl: null,
    /* Duas chaves: a venda dos planos novos E a nuvem ao vivo existir — vender o plano sem a rota
       seria cobrar por uma promessa (§11, item 12). */
    flagsDeVenda: [FLAG_VENDA_PLANOS_V3, FLAG_STT_AO_VIVO],
    /* Tudo do Premium, MAIS o texto durante a fala (`sttAoVivo`) e a voz neural boa. Até a medição de
       custo escolher as vozes, a "boa" e a "básica" saem do mesmo provedor (§11, item 10). */
    entitlements: {
      youtubeImport: false,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: true,
      semAnuncios: true,
      sttAoVivo: true,
      nivelDeVoz: 'boa',
    },
    /* 20 h por trechos MAIS 10 h ao vivo (as duas se somam; contadores separados). O dia: as 2 h de
       trechos do uso justo, e os tokens de 4 h de fala — as 2 h de trechos mais 2 h de conversa ao
       vivo, que não tem teto próprio no dia. PROVISÓRIO até o serviço de fluxo ser escolhido. */
    quotas: {
      chamadasMes: 34_000,
      sttSegundosMes: 72_000,
      tokensMes: 4_500_000,
      armazenamentoMb: 500,
      sttSegundosDia: 7_200,
      tokensDia: 600_000,
      vozCaracteresMes: 600_000,
      vozCaracteresDia: 60_000,
      sttAoVivoSegundosMes: 36_000,
    },
  },
  selfhost: {
    rotulo: 'Self-host (tudo liberado)',
    precoMensalBrl: null,
    precoAnualBrl: null,
    flagsDeVenda: [],
    // A chave de IA é do próprio dono da instância: não há custo nosso, nada a gatear.
    entitlements: {
      youtubeImport: true,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: true,
      semAnuncios: true,
      sttAoVivo: true,
      nivelDeVoz: 'boa',
    },
    quotas: {
      chamadasMes: null,
      sttSegundosMes: null,
      tokensMes: null,
      armazenamentoMb: null,
      sttSegundosDia: null,
      tokensDia: null,
      vozCaracteresMes: null,
      vozCaracteresDia: null,
      sttAoVivoSegundosMes: null,
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
  flagsDeVenda: [],
  entitlements: {
    youtubeImport: false,
    managedCloudStt: true,
    managedCloudLlm: true,
    largerModels: false,
    traducaoNuance: false,
    vozNatural: false,
    interpreteAutomatico: false,
    semAnuncios: false,
    sttAoVivo: false,
    nivelDeVoz: 'aparelho',
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
    vozCaracteresMes: 0,
    vozCaracteresDia: null,
    sttAoVivoSegundosMes: 0,
  },
};

/**
 * TUDO FECHADO — o que vale para um campo que o servidor não mandou (servidor anterior, cache antigo
 * do navegador) e para quem não tem conta na edição estática. O tipo obriga: um campo novo em
 * `EntitlementsDoPlano` não compila sem dizer aqui como é "fechado".
 */
export const ENTITLEMENTS_FECHADOS: Readonly<EntitlementsDoPlano> = Object.freeze({
  youtubeImport: false,
  managedCloudStt: false,
  managedCloudLlm: false,
  largerModels: false,
  traducaoNuance: false,
  vozNatural: false,
  interpreteAutomatico: false,
  semAnuncios: false,
  sttAoVivo: false,
  nivelDeVoz: 'aparelho',
});

/**
 * OS ENTITLEMENTS DE UMA RESPOSTA DE FORA (`GET /api/me/entitlements`, o cache do navegador), campo a
 * campo, pela forma de `ENTITLEMENTS_FECHADOS`. É o que acaba com a cópia manual no cliente: a lista
 * de campos é a da matriz, e o que não veio (ou veio fora da forma) fica FECHADO.
 */
export function lerEntitlements(o: Record<string, unknown>): EntitlementsDoPlano {
  const lidos: Record<string, unknown> = { ...ENTITLEMENTS_FECHADOS };
  for (const [campo, fechado] of Object.entries(ENTITLEMENTS_FECHADOS)) {
    if (typeof fechado === 'boolean') lidos[campo] = o[campo] === true;
  }
  /* O único campo que não é sim/não: o nível de voz só vale se for um dos conhecidos. */
  if ((NIVEIS_DE_VOZ as readonly unknown[]).includes(o.nivelDeVoz)) lidos.nivelDeVoz = o.nivelDeVoz;
  return lidos as unknown as EntitlementsDoPlano;
}

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

/**
 * OS PLANOS QUE SE COMPRAM. O tipo tira os dois que nunca têm preço; a LISTA sai da matriz (quem tem
 * `precoMensalBrl`), e `tests/planos-n-pagos.test.ts` cobra que as duas coisas digam o mesmo. Tudo
 * que pergunta "é pagante?" — a faixa da admissão, o "já assinou" do teste, a intenção do webhook, o
 * tipo do cliente — pergunta AQUI, nunca comparando com um nome.
 */
export type PlanoPago = Exclude<PlanoDeAssinatura, 'free' | 'selfhost'>;

/** O plano é vendável (tem preço)? */
export const ehPlanoPago = (p: unknown): p is PlanoPago =>
  ehPlanoDeAssinatura(p) && PLAN_MATRIX[p].precoMensalBrl !== null;

/** Os planos pagos, na ordem da matriz. */
export const PLANOS_PAGOS: readonly PlanoPago[] = PLANOS_DE_ASSINATURA.filter(ehPlanoPago);

/**
 * OS PLANOS À VENDA AGORA: os pagos cujas `flagsDeVenda` estão TODAS ligadas — quem pergunta diz como
 * ler uma flag (o servidor, pelo request; a tela, pelo cache de `GET /api/flags`). É a régua única de
 * `POST /api/billing/assinar` e do que a tela oferece. Com tudo desligado (a venda fechada da matriz
 * v3) sobra o que nunca teve chave: o Premium.
 */
export function planosAVenda(flagLigada: (chave: string) => boolean): PlanoPago[] {
  return PLANOS_PAGOS.filter((p) => PLAN_MATRIX[p].flagsDeVenda.every(flagLigada));
}

/** Nenhuma chave de venda ligada: a venda dos planos novos fechada, como nasce. */
const VENDA_FECHADA = (): boolean => false;

/**
 * O plano que o TESTE de 14 dias concede (`DIAS_DO_TESTE_PREMIUM`). É uma decisão comercial, e por
 * isso mora ao lado da matriz: o servidor (`resolverPlano`) e a tela leem daqui.
 */
export const PLANO_DO_TESTE: PlanoPago = 'premium';

/**
 * O plano pago de MENOR mensalidade. É o que o webhook concede quando um pagamento confirmado chega
 * sem valor E sem intenção gravada: sem saber quanto entrou, o que se dá é o mínimo que qualquer
 * pagamento de plano paga — nunca o mais caro por omissão.
 */
export function planoPagoMaisBarato(): PlanoPago {
  return PLANOS_PAGOS.reduce((a, b) =>
    (PLAN_MATRIX[b].precoMensalBrl as number) < (PLAN_MATRIX[a].precoMensalBrl as number) ? b : a,
  );
}

/* NÃO HÁ MAIS PREÇOS LEGADOS (matriz v3, `design.md` §11, item 3). A v2 lia R$ 39,90 como "o Pro
   antigo" e o concedia como Premium; hoje R$ 39,90 é o Ao Vivo, e um valor não pode pagar dois planos.
   O anual antigo (R$ 179, e as parcelas de R$ 14,91 e R$ 14,99) também não paga mais nada. O servidor
   nunca foi implantado, então este sistema não criou assinatura nesses valores; se o dono tiver
   cobrança MANUAL no Asaas num deles, precisa avisar antes de abrir a venda — o webhook dela cairia
   em "sem plano" (ou, a R$ 39,90, concederia o Ao Vivo). */

/* O provedor devolve o valor em ponto flutuante (19.899999…). Meio centavo, e não um: todo preço é
   um número inteiro de centavos, então o ruído do ponto flutuante fica muito abaixo disso — e um
   centavo inteiro de tolerância deixaria dois preços vizinhos (R$ 14,91 e R$ 14,92) empatarem. */
const casa = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * AS PARCELAS COMO O ASAAS AS COBRA (sondagem de 29/09/2026): com `totalValue`, ele TRUNCA a divisão
 * e joga a diferença na ÚLTIMA — 149,90 em 12x são 11 × R$ 12,49 + R$ 12,51 (na sondagem, com o preço
 * da v2: 179 = 11 × R$ 14,91 + R$ 14,99). Em centavos inteiros, para a soma fechar exata.
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
 * O valor também diz o CICLO: o preço mensal é mensal; o anual inteiro é anual; a parcela do 12x
 * (`parcelas: PARCELAS_DO_ANUAL`, que o webhook do parcelamento informa) é anual. Parcela de outra
 * quantidade, ou parcela que chega sem dizer que é parcela, não paga plano nenhum: R$ 12,49 como
 * mensalidade seria o Premium por menos que o Essencial. Com VÁRIOS planos pagos (matriz v3) o valor
 * também diz QUAL: por isso todo valor cobrável é distinto dos outros, e pagar R$ 9,90 com a intenção
 * do Premium concede o Essencial.
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

/**
 * O menor preço mensal entre os planos À VENDA — para "a partir de R$ X". Sem dizer quais flags estão
 * ligadas, vale a venda fechada: anunciar "a partir de R$ 9,90" de um plano que o checkout recusa
 * seria prometer o que não se vende.
 */
export function menorPrecoDeAssinatura(flagLigada: (chave: string) => boolean = VENDA_FECHADA): string | null {
  const precos = planosAVenda(flagLigada)
    .map((p) => PLAN_MATRIX[p].precoMensalBrl)
    .filter((v): v is number => typeof v === 'number' && v > 0);
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
