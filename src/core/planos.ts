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
 * A MATRIZ V3 (decisões de 09/10/2026, ADR 0013, `openspec/changes/archive/2026-11-25-planos-v3-e-rota-inteligente`):
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
export type PlanoDeAssinatura = 'free' | 'essencial' | 'premium' | 'aovivo' | 'plus' | 'familia' | 'pro4' | 'selfhost';

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
 *
 * 3 dias desde 14/11/2026 (change `teste-de-3-dias`, decisão do dono): eram 14, e o negócio não
 * banca teste longo agora. Mudar o número muda tela, site e termos juntos (todos leem daqui).
 */
export const DIAS_DO_TESTE_PREMIUM = 3;

/**
 * EM QUE NÍVEL O PLANO FALA (planos v3): a voz do `aparelho` (a do sistema, de graça), a neural
 * `basica` ou a neural `boa`, na ordem. Quais vozes são a básica e a boa fica para a medição de custo
 * (`design.md` §11, item 10): até lá as duas saem do mesmo provedor, e o nível só registra o que o
 * plano promete.
 */
export const NIVEIS_DE_VOZ = ['aparelho', 'basica', 'boa'] as const;
export type NivelDeVoz = (typeof NIVEIS_DE_VOZ)[number];

export interface EntitlementsDoPlano {
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
   * A CONVERSA VIRTUAL (`interprete-conversa-virtual`; decisão assumida 25/11: legenda dos dois lados livre
   * para quem tem conta, 18+ conferido à parte; custo de nuvem zero porque a legenda roda no aparelho).
   * A VOZ na chamada (Fase 5, adiada) só vale no Plus e no selfhost: ela usa `vozNatural`, não este campo.
   * Convidado e "tudo fechado" ficam sem: sem conta não há aferição de idade (LGPD art. 14).
   */
  conversaVirtual: boolean;
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
  /**
   * A IA DE ESTUDO (planos v4, etapa 2): explicações de frase e resumos de sessão por mês, com contadores
   * PRÓPRIOS (`server/lib/iaDeEstudo.ts`). Os tokens de cada chamada saem da cota `tokensMes` do plano (a conta do
   * Plus já os inclui). `0` = o plano não tem (o Grátis usa a `AMOSTRA_DE_IA`, à parte); `null` = sem teto.
   */
  explicacoesMes: number | null;
  resumosMes: number | null;
  /**
   * A ESCRITA DA LEITURA ATIVA (openspec `leitura-ativa-textos-simples`, `POST /api/ai/escrita`): retornos da IA sobre o
   * texto que a pessoa escreveu (reescrever ou opinar), por mês, com contador próprio (`server/lib/iaDeEstudo.ts`). Os
   * tokens de cada retorno saem da `tokensMes` do plano. `0` = o plano não tem (Grátis e convidado ficam com a
   * conferência no aparelho; o teste de 3 dias também, decidido no núcleo); `null` = sem teto.
   */
  escritasMes: number | null;
  /**
   * O "AJUSTAR NÍVEL" DA LEITURA (openspec `leitura-assistida`, fatia D; `POST /api/leitura/ajustar-nivel`): reescritas de
   * palavra, trecho ou parágrafo (`ajustesDeNivelMes`) e de capítulo inteiro (`ajustesDeCapituloMes`, 1 por capítulo, não por
   * parágrafo) por mês, com contadores próprios (`server/lib/ajustesDeNivel.ts`). Os tokens saem da `tokensMes`. `0` = o plano
   * não tem (Grátis, convidado e teste de 3 dias); `null` = sem teto. Os valores dos pagos são PROVISÓRIOS (decisão do dono,
   * depois da medição de custo); com a flag `ia_ajustar_nivel` desligada nada é cobrado.
   */
  ajustesDeNivelMes: number | null;
  ajustesDeCapituloMes: number | null;
  /**
   * O ASSISTENTE AO VIVO (`docs/specs/2026-10-25-assistente-ao-vivo.md`): chamadas de nuvem POR DIA LOCAL, somando
   * expressões, termos, "Como respondo?" e a correção da fala (contador próprio, `server/lib/assistenteAoVivo.ts`). Os
   * tokens de cada chamada saem da `tokensMes` do plano (como a IA de estudo), então o custo já está na conta do plano;
   * o teto do dia é o uso justo. As palavras acima do nível são locais e não contam. `0` = o plano não tem (Grátis e
   * convidado); `null` = sem teto.
   */
  assistenteDia: number | null;
  /**
   * A SUBCOTA DE TOKENS DO ASSISTENTE AO VIVO por mês: 25% da `tokensMes` (`FRACAO_DA_COTA_DO_ASSISTENTE`). Os tokens do
   * assistente contam AQUI e TAMBÉM na `tokensMes` (o custo continua dentro do que o plano já paga), e esta subcota é
   * checada antes: o assistente nunca passa de 25% da cota, então a legenda e o resto da IA de texto ficam com pelo
   * menos 75% (decisão de 25/10/2026, spec `docs/specs/2026-10-25-assistente-ao-vivo.md`, "Cota e custo"). Contador
   * próprio (`server/lib/assistenteAoVivo.ts`). `0` = o plano não tem; `null` = sem teto.
   */
  assistenteTokensMes: number | null;
  /**
   * O PARCEIRO DE LEITURA (L4 de Livros & Leitura, `POST /api/ai/leitura/parceiro`): explicar o trecho, analogia,
   * pergunta sobre o capítulo, curiosidade, ideia para discutir e "o que observar". Chamadas de nuvem POR DIA LOCAL
   * (contador próprio, `server/lib/parceiroDeLeitura.ts`); a resposta que sai do CACHE compartilhado (livro PD) não
   * conta. `0` = o plano não tem (Grátis e convidado); `null` = sem teto.
   */
  parceiroDia: number | null;
  /**
   * A SUBCOTA DE TOKENS DO PARCEIRO por mês: 20% da `tokensMes` (`FRACAO_DA_COTA_DO_PARCEIRO`), no molde da do
   * assistente. Os tokens contam AQUI e TAMBÉM na `tokensMes`; o parceiro para nos 20% e a legenda fica com o resto.
   * `0` = o plano não tem; `null` = sem teto.
   */
  parceiroTokensMes: number | null;
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
  /**
   * O FIM DE VENDA (planos v4): o plano SAI de `planosAVenda` quando QUALQUER flag desta lista está ligada.
   * Diferente de `flagsDeVenda` (que abre), isto fecha — e só a venda: quem já tem o plano o mantém, e
   * entitlements, cotas e o reconhecimento do valor pago no webhook seguem valendo. Ausente = nunca encerra.
   */
  encerradoPor?: readonly string[];
  entitlements: EntitlementsDoPlano;
  quotas: QuotasDoPlano;
}

/**
 * AS CHAVES DA VENDA (planos v3). `venda_planos_v3` abre a venda dos planos novos; `stt_ao_vivo` diz
 * que a nuvem ao vivo existe. As duas nascem DESLIGADAS (migração 0048): abrir a venda é ato do dono.
 */
export const FLAG_VENDA_PLANOS_V3 = 'venda_planos_v3';
export const FLAG_STT_AO_VIVO = 'stt_ao_vivo';

/**
 * AS CHAVES DA VENDA V4 (`docs/specs/2026-10-24-planos-v4.md`; migração 0054). `venda_planos_v4` vende o Plus e
 * ENCERRA a venda do Essencial, do Premium e do Ao Vivo (`encerradoPor`). `venda_familia` e `venda_pro4` abrem a
 * Família e o Pro (junto com a v4): nascem desligadas e nenhuma é ligada na etapa 1, então os dois planos são
 * "em breve" — existem na matriz, mas `planosAVenda` nunca os devolve.
 */
export const FLAG_VENDA_PLANOS_V4 = 'venda_planos_v4';
export const FLAG_VENDA_FAMILIA = 'venda_familia';
export const FLAG_VENDA_PRO4 = 'venda_pro4';

/**
 * A IA DE ESTUDO (planos v4, etapa 2): a explicação da frase (`POST /api/ai/explicar`) e o resumo da sessão que
 * vira cartões. Nasce DESLIGADA (migração 0055 / PG 0009): desligada, as rotas respondem 404 `recurso_indisponivel`
 * e as telas ficam como estão. Não é permissão nem cota: quem pode é o plano (`explicacoesMes`/`resumosMes`) ou a
 * `AMOSTRA_DE_IA` do Grátis.
 */
export const FLAG_IA_DE_ESTUDO = 'ia_de_estudo';

/**
 * O ASSISTENTE AO VIVO (`docs/specs/2026-10-25-assistente-ao-vivo.md`): expressões e gírias da legenda, termo técnico ou
 * sigla em uma linha, "Como respondo?" e a correção gentil da própria fala (`POST /api/ai/assistente/*`). Nasce
 * DESLIGADA (migração SQLite 0057 / PG 0011): desligada, as rotas respondem 404 `recurso_indisponivel`. Não é
 * permissão nem cota: quem pode é o plano (`assistenteDia`). As palavras acima do nível são locais e valem também no
 * Grátis, sem flag de servidor.
 */
export const FLAG_ASSISTENTE_AO_VIVO = 'assistente_ao_vivo';

/**
 * O TETO DO DIA do assistente nos planos pagos: 200 chamadas por dia local. A conta (spec, "Custo"): o uso cheio
 * estimado é de ~450 mil tokens por mês (~22% da `tokensMes` do Plus), uns 25 usos por hora em 40 min por dia; 200 por
 * dia cobre o dia mais intenso (≈3 h de vídeo com glosa) e corta o uso automático em laço. Os tokens saem da
 * `tokensMes`, então o teto não muda a margem (`npm run ia:custo`).
 */
export const ASSISTENTE_DIA_DOS_PAGOS = 200;

/** A fração da `tokensMes` que o assistente ao vivo pode usar no mês (`assistenteTokensMes` = 25% em todo plano). */
export const FRACAO_DA_COTA_DO_ASSISTENTE = 0.25;

/**
 * O PARCEIRO DE LEITURA (L4 de Livros & Leitura; `server/ai/nucleo/parceiroDeLeitura.ts`). Nasce DESLIGADO (migração
 * PG 0014): desligado, a rota responde 404 `recurso_indisponivel`. Não é permissão nem cota: quem pode é o plano
 * (`parceiroDia`), e o teste de 3 dias, que tem o plano dele.
 */
export const FLAG_PARCEIRO_DE_LEITURA = 'parceiro_de_leitura';

/**
 * A LEITURA ATIVA (openspec `leitura-ativa-textos-simples`; migrações PG 0020 e SQLite 0062): a tela "Leituras"
 * (`/leitura`), textos curtos para ouvir, ler em voz alta e responder perguntas. Nasce DESLIGADA e sem regra de plano:
 * desligada, o menu não mostra o item e a URL cai no início. Liga o microfone para menores, por isso é sensível no painel.
 */
export const FLAG_LEITURA_ATIVA = 'leitura_ativa';

/**
 * LEITURA ATIVA COM VOZ LOCAL (openspec `leitura-ativa-com-moonshine`; migrações PG 0040 e SQLite 0079, PROVISÓRIAS):
 * com a flag (e a `leitura_ativa`), "Ler em voz alta" também funciona sem Web Speech local, ouvindo a leitura em inglês
 * com o Moonshine NO APARELHO. O áudio nunca sai do aparelho. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono.
 */
export const FLAG_LEITURA_VOZ_LOCAL = 'leitura_voz_local';

/**
 * O ACESSO RESTRITO SEM CONTA (openspec `acesso-sem-conta-v2`; migrações PG 0022 e SQLite 0064): depois da 1ª
 * sessão, quem não tem conta e se declara adulto passa pela porta de entrada. Nasce DESLIGADA e sem regra de
 * plano; a regra mora em `src/core/acessoSemConta.ts` (a flag só liga o fluxo). Desligada = comportamento de hoje.
 */
export const FLAG_ACESSO_RESTRITO_SEM_CONTA = 'acesso_restrito_sem_conta';

/**
 * A TELEMETRIA DE CAMPO DA LATÊNCIA DA LEGENDA (openspec `lab-medicao-legenda-traduzida`; migrações PG 0023 e SQLite 0065):
 * o lote `v: 2` de métricas (baldes e contagens por classe de aparelho). Nasce DESLIGADA e sem regra de plano. Ligar em
 * produção depende do parecer de privacidade do dono. Desligada = só o `v: 1` de hoje.
 */
export const FLAG_RUM_LATENCIA = 'rum_latencia';

/**
 * A NORMALIZAÇÃO DE VOLUME DO ÁUDIO ENVIADO AO STT DE NUVEM (openspec `stt-ingles-volume-e-rota`; migrações PG 0024 e SQLite
 * 0066): o pico (percentil 99,9) do trecho vai a −3 dBFS antes do encode. Nasce DESLIGADA e sem regra de plano; ligar é ato
 * do dono, depois da medição. Desligada = o corpo enviado é o de antes. Só a nuvem: o caminho local não passa por ela.
 */
export const FLAG_STT_NUVEM_NORMALIZAR = 'stt_nuvem_normalizar';

/**
 * O ROTEADOR ADAPTATIVO EM SOMBRA (openspec `roteador-adaptativo-em-sombra`; migrações PG 0025 e SQLite 0067, números
 * PROVISÓRIOS): por fala, calcula o que um roteador por RTF, fila e confiança do STT decidiria e REGISTRA só contagens
 * agregadas; NUNCA muda a rota real. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono. Desligada = nada é
 * calculado, registrado nem carregado.
 */
export const FLAG_ROTEADOR_ADAPTATIVO_SOMBRA = 'roteador_adaptativo_sombra';

/**
 * A TRADUÇÃO LOCAL POR DIREÇÃO (openspec `traducao-local-por-direcao`; migrações PG 0026 e SQLite 0068, números
 * PROVISÓRIOS): liga o uso dos pares X→en do Bergamot publicados no CDN (`VITE_BERGAMOT_MODELOS_URL`); en→pt-BR segue no
 * opus-mt com o alvo `pt_br`. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono. Desligada = o Bergamot atende só
 * o pt→en embutido, como antes, mesmo com modelos no R2.
 */
export const FLAG_TRADUCAO_LOCAL_POR_DIRECAO = 'traducao_local_por_direcao';

/**
 * OS PARCIAIS VIVOS (openspec `parciais-incrementais`, V1; migrações PG 0029 e SQLite 0069): o parcial
 * do Whisper/Moonshine usa o `onUpdate`, a cadência passa a ser adaptativa (RTF e ocupação do worker) e o texto confirmado
 * por LocalAgreement-2 nunca regride (a cauda sai em estilo provisório). Nasce DESLIGADA e sem regra de plano; ligar é ato
 * do dono. Desligada = o parcial de hoje (tique de 2 s, no máximo 3 por fala). Parcial nunca vai à nuvem.
 */
export const FLAG_PARCIAIS_VIVOS = 'parciais_vivos';

/**
 * O PARCIAL DO PARAKEET (openspec `parciais-incrementais`, V2; migrações PG 0030 e SQLite 0070): re-decode da
 * janela que cresce, só onde o Parakeet já é o motor do perfil, sem modelo novo. Nasce DESLIGADA e sem regra de plano; só
 * tem efeito com `parciais_vivos` ligada. Desligada = o Parakeet não emite parcial, como antes.
 */
export const FLAG_PARCIAIS_PARAKEET = 'parciais_parakeet';

/**
 * A TRADUÇÃO INCREMENTAL DO PARCIAL (openspec `parciais-incrementais`, V3; migrações PG 0031 e SQLite 0071):
 * traduz só o prefixo confirmado pelo LocalAgreement-2, com mask-k, só com motor local já carregado. Nasce DESLIGADA e sem
 * regra de plano; só tem efeito com `parciais_vivos` ligada. Desligada = a tradução do parcial de hoje.
 */
export const FLAG_TRADUCAO_INCREMENTAL = 'traducao_incremental';

/**
 * A PRÉ-TRADUÇÃO DE LEGENDAS IMPORTADAS (openspec `pre-traducao-de-legendas`; migrações PG 0032 e SQLite 0072): traduz a legenda
 * inteira em lote, NO APARELHO (Bergamot/opus-mt), em lotes canceláveis, com progresso honesto e a legenda segura aplicada.
 * Só motor local, nunca nuvem. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono. Desligada = a importação só
 * produz o texto, como antes.
 */
export const FLAG_PRE_TRADUCAO_DE_LEGENDAS = 'pre_traducao_de_legendas';

/**
 * A FORÇA 1 A 4 NA LEGENDA E NO LEITOR (openspec `status-da-palavra-na-legenda`; migrações PG 0033 e SQLite 0073): a etiqueta da palavra sai da força do cartão (`forcaDoCartao`: 1 = salva, 2 e 3 = aprendendo, 4 = silenciosa)
 * e a glosa do leitor some em força 3, em vez da régua de três estados com relógio. Nasce DESLIGADA e sem regra de plano;
 * ligar é ato do dono, depois de simular no deck dele. Desligada = as etiquetas de hoje.
 */
export const FLAG_FORCA_NA_LEGENDA = 'forca_na_legenda';

/**
 * O MODO "FRASE POR FRASE" (openspec `repetir-e-pausar-por-frase`; migrações PG 0034 e SQLite 0074): o player da
 * sessão repete a frase 1x a 3x, espera a pessoa repetir em voz alta e segue (ou para no fim). Só mídia do próprio Frasy;
 * nada é gravado nem sai do aparelho. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono. Desligada = player de hoje.
 */
export const FLAG_FRASE_POR_FRASE = 'frase_por_frase';

/**
 * O MAPEADOR DE CAMPOS DO ANKI (openspec `motor-anki-mapeador`, versão enxuta; migrações PG 0036 e SQLite 0075):
 * a leitura do `.apkg` (que continua no navegador) diz a confiança de cada palpite de campo; com confiança baixa em palavra ou
 * tradução, a pessoa confere e troca os campos ANTES do primeiro lote. O mapeamento confirmado fica só no aparelho
 * (`localStorage`), sem dado novo no servidor. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono. Desligada = a
 * importação de hoje (nome primeiro, posição depois, sem parada).
 */
export const FLAG_ANKI_MAPEADOR = 'anki_mapeador';

/**
 * SOMBRA LOCAL (openspec `sombra-sem-web-speech`): com a flag, a prática de pronúncia transcreve a frase NO APARELHO
 * (PCM 16 kHz + VAD + Moonshine/Whisper) onde o Web Speech não existe ou o perfil protegido não pode usá-lo. Só inglês
 * no começo. O áudio nunca sai do aparelho. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono.
 */
export const FLAG_SOMBRA_LOCAL = 'sombra_local';

/**
 * A LATÊNCIA PUBLICADA POR APARELHO (openspec `latencia-publicada-por-aparelho`; migrações PG 0038 e SQLite 0077):
 * o app lê o arquivo estático `latencia.json` (agregado semanal por classe de aparelho e idioma) e mostra o selo "metade das
 * legendas aparece em até X s"; o site gera `/desempenho` e o admin mostra o painel. Nasce DESLIGADA e sem regra de plano; só
 * tem efeito com `rum_latencia` ligada. Ligar é ato do dono, depois do parecer de privacidade e de uma semana de dados.
 */
export const FLAG_LATENCIA_PUBLICADA = 'latencia_publicada';

/**
 * A CHAVE DE DUPLICATA POR IDIOMA (openspec `modelo-do-aluno-e-dados`, fatia 5; migrações PG 0039 e SQLite 0078, provisórias):
 * com a flag ligada o servidor compara palavras pela chave v2 (`chaveDedup(..., 2)`), que mantém as marcas que distinguem
 * palavras (`año` x `ano`). Só vale DEPOIS da reescrita de `norm_key` (`operacao.cjs chave-de-duplicata`). Nasce DESLIGADA e
 * sem regra de plano; ligar é ato do dono, com backup e o app parado.
 */
export const FLAG_CHAVE_DEDUP_V2 = 'chave_dedup_v2';

/**
 * O CARTÃO COM ÁUDIO DO TRECHO (openspec `cartao-com-audio-do-trecho`; migrações PG 0041 e SQLite 0080, provisórias): o cartão guarda
 * a fala de onde a palavra veio (Ogg Opus curto) SÓ NO APARELHO (IndexedDB) e o verso toca esse clipe antes do trecho da sessão.
 * Nasce DESLIGADA e sem regra de plano; nenhuma cota nova (o teto é por aparelho, não por conta). Ligar é ato do dono.
 */
export const FLAG_CARTAO_COM_AUDIO = 'cartao_com_audio';

/**
 * O DIÁRIO COM CORREÇÃO QUE VIRA CARTÃO (openspec `diario-com-correcao-que-vira-cartao`; migrações PG 0042 e SQLite 0081,
 * provisórias): a tela `/diario` e `POST /api/ai/diario`. Nasce DESLIGADA e sem regra de plano. A cota é a MESMA `escritasMes`
 * da Leitura ativa (decisão assumida: recomendação da decisão 31, 25/11; nenhum número novo na matriz). A IA é só para adulto
 * declarado; o perfil protegido só tem o "Conferir sozinho" até `filtro-tutor-menores` 4.3/4.4 e a rodada de risco (decisão do dono).
 * Ligar é ato do dono.
 */
export const FLAG_DIARIO = 'diario';

/**
 * O CARTÃO COM A CENA DA TELA (openspec `cartao-com-captura-de-tela`; migrações PG 0043 e SQLite 0082): a pessoa
 * ADULTA toca em "Guardar a cena", vê um quadro da tela compartilhada, cobre o que quiser e só então guarda, SÓ NO APARELHO
 * (IndexedDB). Fora do perfil protegido, sem rota de servidor para imagem. Nasce DESLIGADA e sem regra de plano; nenhuma cota.
 */
export const FLAG_CARTAO_COM_CENA = 'cartao_com_cena';

/**
 * O PLAYER COMPACTO DA ESCUTA GUIADA (openspec `leitura-assistida`, Fatia A; migrações PG 0044 e SQLite 0083): o player vira UMA barra e a
 * transcrição reserva o espaço dele. Só desenho. Nasce DESLIGADA e sem regra de plano; nenhuma cota. Desligada = o player de hoje.
 */
export const FLAG_ESCUTA_PLAYER_COMPACTO = 'escuta_player_compacto';

/**
 * A SELEÇÃO FIRME DO LEITOR (openspec `leitura-assistida`, Fatia A; mesma migração PG 0044 e SQLite 0083): bordas de palavra, sem deriva
 * para outro bloco ou coluna, toque/duplo/triplo previsíveis e alças. Só no navegador. Nasce DESLIGADA e sem regra de plano; nenhuma cota.
 */
export const FLAG_LEITOR_SELECAO_FIRME = 'leitor_selecao_firme';

/**
 * O MODO TRADUÇÃO DO LEITOR (openspec `leitura-assistida`, fatia B; migrações PG 0045 e SQLite 0084): ao grifar um trecho, a
 * tradução aparece num balão ancorado a ele (sem cobri-lo), sem cliques extras; mais "ler em voz alta", copiar, atalhos T/V/C/A,
 * exportar grifos com as traduções e ditado de uma frase. A tradução usa o motor do aparelho primeiro e a nuvem só como hoje
 * (plano, idade, consentimento); nada do livro é gravado no servidor. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono.
 */
export const FLAG_LEITOR_MODO_TRADUCAO = 'leitor_modo_traducao';

/**
 * O DESTAQUE POR VOCABULÁRIO NO LEITOR (openspec `leitura-assistida`, Fatia C; migrações PG 0046 e SQLite 0085): as palavras do
 * capítulo ganham grifo com intensidade pela força no vocabulário da pessoa, legenda, cartão da palavra de 1 toque e 5 cartões no
 * fim do capítulo. Tudo no aparelho, sem rota nova. Nasce DESLIGADA e sem regra de plano; nenhuma cota. Ligar é ato do dono.
 */
export const FLAG_LEITOR_DESTAQUE_VOCAB = 'leitor_destaque_vocab';

/**
 * Os RETORNOS DA ESCRITA por mês nos planos pagos (provisório, spec `leitura-ativa-escrita`). A conta (design.md,
 * "Custo da escrita"): um retorno leva ~900 tokens de entrada (system + texto de até 120 palavras) e até 500 de saída;
 * 30 por mês ficam na casa de US$ 0,01 por assinante que usa tudo, e os tokens já saem da `tokensMes`.
 */
export const ESCRITAS_MES_DOS_PAGOS = 30;

/**
 * A FLAG DO "AJUSTAR NÍVEL" (openspec `leitura-assistida`, fatia D; migrações PG 0047 e SQLite 0086, reservadas): reescrever
 * palavra, trecho, parágrafo ou capítulo de A1 a C2 com IA, com o original ao lado. Nasce DESLIGADA e sem regra de plano.
 * Ligar é ato do dono, depois de medir o custo e o acerto de nível (`scripts/leitura/simular-nivel.ts`).
 */
export const FLAG_IA_AJUSTAR_NIVEL = 'ia_ajustar_nivel';

/**
 * A FLAG DA NAVEGAÇÃO "O INÍCIO É O MENU" (openspec `navegacao-mais-simples`, opção 3, decisão do dono de 27/11/2026; migrações
 * PG 0048 e SQLite 0087): sem trilho, sem "Mais" e sem barra de baixo; o Início vira a grade de destinos e as outras telas ganham
 * um cabeçalho fino (‹ Início, nome, busca, sino, avatar). Só interface. Nasce DESLIGADA e sem regra de plano; ligar é ato do dono.
 */
export const FLAG_NAVEGACAO_SIMPLES = 'navegacao_simples';

/**
 * As cotas do "Ajustar nível" nos planos pagos (PROVISÓRIAS, a proposta da spec; o dono decide depois de medir o custo por
 * parágrafo). Um ajuste de parágrafo leva ~700 tokens de entrada e ~400 de saída por chamada, no máximo 2 chamadas.
 */
export const AJUSTES_DE_NIVEL_MES_DOS_PAGOS = 60;
export const AJUSTES_DE_CAPITULO_MES_DOS_PAGOS = 4;

/**
 * OS AVATARES (`docs/specs/2026-10-28-avatar-interprete.md`; migração PG 0016). Três flags que nascem DESLIGADAS:
 * `avatar_3d` (a base: o avatar da pessoa e o do intérprete, em 3D com fallback 2D), `avatar_sinais` (soletração
 * rotulada como demonstração, nunca "tradução para Libras") e `avatar_elenco` (narrador e personagens nos livros).
 * Desligadas, nada muda na tela. Não são permissão nem cota: avatar é recurso livre e a acessibilidade não depende dele.
 */
export const FLAG_AVATAR_3D = 'avatar_3d';
export const FLAG_AVATAR_SINAIS = 'avatar_sinais';
export const FLAG_AVATAR_ELENCO = 'avatar_elenco';

/**
 * OS AUDIOLIVROS (`docs/specs/2026-10-31-audiolivros-e-leitura.md` §9.1; migrações PG 0017 e SQLite 0059). Nascem
 * DESLIGADAS e sem regra de plano: `audiolivros` (o áudio pré-gerado do catálogo no "Ouvir"), `audiolivros_nuvem`
 * (voz natural para livro próprio) e `audiolivros_elenco` (voz por personagem). Nenhuma cota aqui.
 */
export const FLAG_AUDIOLIVROS = 'audiolivros';
export const FLAG_AUDIOLIVROS_NUVEM = 'audiolivros_nuvem';
export const FLAG_AUDIOLIVROS_ELENCO = 'audiolivros_elenco';

/**
 * O TETO DO DIA do parceiro nos planos pagos: 40 pedidos por dia local. A conta: um pedido leva até ~8 mil caracteres
 * do capítulo (~2,3 mil tokens), ~600 tokens da ficha e o system, e até 900 de saída — ~4 mil tokens, ≈ US$ 0,0011 no
 * DeepSeek V4.1 Flash (US$ 0,15/0,65 por 1M) e menos no Gemma 4. 40 por dia cobrem uma tarde inteira de leitura com
 * perguntas; quem vai além é uso automático. O mês é segurado pela subcota (`parceiroTokensMes`, 20% da `tokensMes`:
 * no Plus, 400 mil tokens ≈ 100 pedidos sem cache ≈ US$ 0,11), e a resposta em cache (livro PD) não conta em nada.
 */
export const PARCEIRO_DIA_DOS_PAGOS = 40;

/** A fração da `tokensMes` que o parceiro de leitura pode usar no mês (`parceiroTokensMes` = 20% em todo plano). */
export const FRACAO_DA_COTA_DO_PARCEIRO = 0.2;

export const PLAN_MATRIX: Record<PlanoDeAssinatura, DefinicaoDePlano> = {
  free: {
    rotulo: 'Grátis',
    precoMensalBrl: null,
    precoAnualBrl: null,
    flagsDeVenda: [],
    entitlements: {
      managedCloudStt: false,
      managedCloudLlm: false,
      largerModels: false,
      traducaoNuance: false,
      vozNatural: false,
      interpreteAutomatico: false,
      conversaVirtual: true,
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
      explicacoesMes: 0,
      resumosMes: 0,
      escritasMes: 0,
      ajustesDeNivelMes: 0,
      ajustesDeCapituloMes: 0,
      assistenteDia: 0,
      assistenteTokensMes: 0,
      parceiroDia: 0,
      parceiroTokensMes: 0,
    },
  },
  essencial: {
    rotulo: 'Essencial',
    precoMensalBrl: 9.9,
    precoAnualBrl: 79.9,
    flagsDeVenda: [FLAG_VENDA_PLANOS_V3],
    encerradoPor: [FLAG_VENDA_PLANOS_V4],
    /* NO APARELHO, com a nuvem por trechos SOB DEMANDA (5 h no mês para transcrever e traduzir, não
       por padrão — quem decide quando usar é a política de rota) e a Tradução Nuance. Sem anúncios.
       Fala com a voz do aparelho e o intérprete é por toque. `largerModels` fica de fora: além dos
       modelos locais maiores ele liga o `LLM_MODEL_GRANDE` do registro legado, que é custo de nuvem. */
    entitlements: {
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: false,
      traducaoNuance: true,
      vozNatural: false,
      interpreteAutomatico: false,
      conversaVirtual: true,
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
      explicacoesMes: 300,
      resumosMes: 60,
      escritasMes: ESCRITAS_MES_DOS_PAGOS,
      ajustesDeNivelMes: AJUSTES_DE_NIVEL_MES_DOS_PAGOS,
      ajustesDeCapituloMes: AJUSTES_DE_CAPITULO_MES_DOS_PAGOS,
      assistenteDia: ASSISTENTE_DIA_DOS_PAGOS,
      assistenteTokensMes: 187_500,
      parceiroDia: PARCEIRO_DIA_DOS_PAGOS,
      parceiroTokensMes: 150_000,
    },
  },
  premium: {
    rotulo: 'Premium',
    precoMensalBrl: 19.9,
    precoAnualBrl: 149.9,
    flagsDeVenda: [],
    encerradoPor: [FLAG_VENDA_PLANOS_V4],
    /* A nuvem por trechos POR PADRÃO onde compensa. A importação do YouTube foi removida (a rota
       responde 410), então nenhum plano a vende. `largerModels` vem do Pro (quem pagava por ele não
       perde nada); `LLM_MODEL_GRANDE` continua ausente por padrão, e o modelo mais forte chega pelo
       nível `nuance` (B3/D1). É o plano do TESTE de 3 dias (`PLANO_DO_TESTE`). */
    entitlements: {
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: true,
      conversaVirtual: true,
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
      /* A VOZ NATURAL (E4 da Fase E; pelo OpenRouter desde 17/11/2026, change `voz-natural-openrouter`). Kokoro 82M
         com retenção zero: US$ 0,62/1M na DeepInfra, US$ 4/1M na Together, e o OpenRouter escolhe quem atende (a
         voz não aceita `order`). A conta usa o PIOR, US$ 4/1M. A voz lê ~15 caracteres por segundo → ~54.000 por
         hora de voz → no máximo ~US$ 0,22 por hora (~US$ 0,04 no esperado).
           dia  15.000 ≈ 17 min de voz → no máximo ~US$ 0,06 no dia;
           mês 150.000 ≈ 2,8 h de voz → no máximo ~US$ 0,60 por assinante no mês: o MESMO dinheiro dos 600.000 a
                US$ 1/1M de antes, e o que mantém a mistura de 3% de pagantes do `npm run ia:custo` com margem ≥ 0.
         PROVISÓRIO: o teto liga com o custo medido no uso real (E6); `PREMIUM_*_TTS_CHARS` sobrepõe.
         Passando dele, a voz do aparelho segue — o intérprete nunca para. Os tetos de cada plano estão em
         `openspec/changes/archive/2026-11-23-voz-natural-openrouter/design.md`. */
      vozCaracteresMes: 150_000,
      vozCaracteresDia: 15_000,
      sttAoVivoSegundosMes: 0,
      explicacoesMes: 300,
      resumosMes: 60,
      escritasMes: ESCRITAS_MES_DOS_PAGOS,
      ajustesDeNivelMes: AJUSTES_DE_NIVEL_MES_DOS_PAGOS,
      ajustesDeCapituloMes: AJUSTES_DE_CAPITULO_MES_DOS_PAGOS,
      assistenteDia: ASSISTENTE_DIA_DOS_PAGOS,
      assistenteTokensMes: 750_000,
      parceiroDia: PARCEIRO_DIA_DOS_PAGOS,
      parceiroTokensMes: 600_000,
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
    encerradoPor: [FLAG_VENDA_PLANOS_V4],
    /* Tudo do Premium, MAIS o texto durante a fala (`sttAoVivo`) e a voz neural boa. Até a medição de
       custo escolher as vozes, a "boa" e a "básica" saem do mesmo provedor (§11, item 10). */
    entitlements: {
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: true,
      conversaVirtual: true,
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
      vozCaracteresMes: 300_000,
      vozCaracteresDia: 30_000,
      sttAoVivoSegundosMes: 36_000,
      explicacoesMes: 300,
      resumosMes: 60,
      escritasMes: ESCRITAS_MES_DOS_PAGOS,
      ajustesDeNivelMes: AJUSTES_DE_NIVEL_MES_DOS_PAGOS,
      ajustesDeCapituloMes: AJUSTES_DE_CAPITULO_MES_DOS_PAGOS,
      assistenteDia: ASSISTENTE_DIA_DOS_PAGOS,
      assistenteTokensMes: 1_125_000,
      parceiroDia: PARCEIRO_DIA_DOS_PAGOS,
      parceiroTokensMes: 900_000,
    },
  },
  /* PLUS (planos v4): o plano de entrada pago. Tudo do Premium, menos o intérprete automático (que é do Pro).
     8 h por trechos; o dia é o uso justo de 2 h. Tokens: 150 mil por hora de fala × 8 h = 1,2 M, com folga até 2 M
     (explicação da frase e resumo→cartões, etapa 2). Voz natural até 150 mil caracteres (≈ 2,8 h de voz).
     Chamadas: no meio entre o Essencial (6.500) e o Premium (26.000). Armazenamento: o do Grátis (MVP). */
  plus: {
    rotulo: 'Plus',
    precoMensalBrl: 14.9,
    precoAnualBrl: 149.0,
    flagsDeVenda: [FLAG_VENDA_PLANOS_V4],
    entitlements: {
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: false,
      conversaVirtual: true,
      semAnuncios: true,
      sttAoVivo: false,
      nivelDeVoz: 'basica',
    },
    quotas: {
      chamadasMes: 16_250,
      sttSegundosMes: 28_800,
      tokensMes: 2_000_000,
      armazenamentoMb: 500,
      sttSegundosDia: 7_200,
      tokensDia: 200_000,
      vozCaracteresMes: 150_000,
      vozCaracteresDia: 15_000,
      sttAoVivoSegundosMes: 0,
      explicacoesMes: 300,
      resumosMes: 60,
      escritasMes: ESCRITAS_MES_DOS_PAGOS,
      ajustesDeNivelMes: AJUSTES_DE_NIVEL_MES_DOS_PAGOS,
      ajustesDeCapituloMes: AJUSTES_DE_CAPITULO_MES_DOS_PAGOS,
      assistenteDia: ASSISTENTE_DIA_DOS_PAGOS,
      assistenteTokensMes: 500_000,
      parceiroDia: PARCEIRO_DIA_DOS_PAGOS,
      parceiroTokensMes: 400_000,
    },
  },
  /* FAMÍLIA (planos v4, "em breve"): as capacidades do Plus com 12 h compartilhadas. Só existe como produto
     quando houver grupo, convite do responsável e painel; até lá `venda_familia` fica desligada. Dia, chamadas
     e armazenamento seguem o Premium (a Família divide as horas, não relaxa o uso justo de cada dia). */
  familia: {
    rotulo: 'Família',
    precoMensalBrl: 24.9,
    precoAnualBrl: 249.0,
    flagsDeVenda: [FLAG_VENDA_PLANOS_V4, FLAG_VENDA_FAMILIA],
    entitlements: {
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: false,
      conversaVirtual: true,
      semAnuncios: true,
      sttAoVivo: false,
      nivelDeVoz: 'basica',
    },
    quotas: {
      chamadasMes: 26_000,
      sttSegundosMes: 43_200,
      tokensMes: 3_000_000,
      armazenamentoMb: 500,
      sttSegundosDia: 7_200,
      tokensDia: 300_000,
      vozCaracteresMes: 300_000,
      vozCaracteresDia: 30_000,
      sttAoVivoSegundosMes: 0,
      explicacoesMes: 300,
      resumosMes: 60,
      escritasMes: ESCRITAS_MES_DOS_PAGOS,
      ajustesDeNivelMes: AJUSTES_DE_NIVEL_MES_DOS_PAGOS,
      ajustesDeCapituloMes: AJUSTES_DE_CAPITULO_MES_DOS_PAGOS,
      assistenteDia: ASSISTENTE_DIA_DOS_PAGOS,
      assistenteTokensMes: 750_000,
      parceiroDia: PARCEIRO_DIA_DOS_PAGOS,
      parceiroTokensMes: 600_000,
    },
  },
  /* PRO (planos v4, "em breve"; id \`pro4\`, NUNCA \`pro\`, que é o apelido antigo do Premium): 20 h e o intérprete
     automático. A conversa por voz com o tutor (5 h de voz) ainda não existe: sem quota própria aqui até a
     medição de custo; \`venda_pro4\` fica desligada até lá. */
  pro4: {
    rotulo: 'Pro',
    precoMensalBrl: 34.9,
    precoAnualBrl: 349.0,
    flagsDeVenda: [FLAG_VENDA_PLANOS_V4, FLAG_VENDA_PRO4],
    entitlements: {
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: true,
      conversaVirtual: true,
      semAnuncios: true,
      sttAoVivo: false,
      nivelDeVoz: 'basica',
    },
    quotas: {
      chamadasMes: 26_000,
      sttSegundosMes: 72_000,
      tokensMes: 3_000_000,
      armazenamentoMb: 500,
      sttSegundosDia: 7_200,
      tokensDia: 300_000,
      vozCaracteresMes: 200_000,
      vozCaracteresDia: 20_000,
      sttAoVivoSegundosMes: 0,
      explicacoesMes: 300,
      resumosMes: 60,
      escritasMes: ESCRITAS_MES_DOS_PAGOS,
      ajustesDeNivelMes: AJUSTES_DE_NIVEL_MES_DOS_PAGOS,
      ajustesDeCapituloMes: AJUSTES_DE_CAPITULO_MES_DOS_PAGOS,
      assistenteDia: ASSISTENTE_DIA_DOS_PAGOS,
      assistenteTokensMes: 750_000,
      parceiroDia: PARCEIRO_DIA_DOS_PAGOS,
      parceiroTokensMes: 600_000,
    },
  },
  selfhost: {
    rotulo: 'Self-host (tudo liberado)',
    precoMensalBrl: null,
    precoAnualBrl: null,
    flagsDeVenda: [],
    // A chave de IA é do próprio dono da instância: não há custo nosso, nada a gatear.
    entitlements: {
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      traducaoNuance: true,
      vozNatural: true,
      interpreteAutomatico: true,
      conversaVirtual: true,
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
      explicacoesMes: null,
      resumosMes: null,
      escritasMes: null,
      ajustesDeNivelMes: null,
      ajustesDeCapituloMes: null,
      assistenteDia: null,
      assistenteTokensMes: null,
      parceiroDia: null,
      parceiroTokensMes: null,
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
    managedCloudStt: true,
    managedCloudLlm: true,
    largerModels: false,
    traducaoNuance: false,
    vozNatural: false,
    interpreteAutomatico: false,
    conversaVirtual: false,
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
    explicacoesMes: 0,
    resumosMes: 0,
    escritasMes: 0,
    ajustesDeNivelMes: 0,
    ajustesDeCapituloMes: 0,
    assistenteDia: 0,
    assistenteTokensMes: 0,
    parceiroDia: 0,
    parceiroTokensMes: 0,
  },
};

/**
 * TUDO FECHADO — o que vale para um campo que o servidor não mandou (servidor anterior, cache antigo
 * do navegador) e para quem não tem conta na edição estática. O tipo obriga: um campo novo em
 * `EntitlementsDoPlano` não compila sem dizer aqui como é "fechado".
 */
export const ENTITLEMENTS_FECHADOS: Readonly<EntitlementsDoPlano> = Object.freeze({
  managedCloudStt: false,
  managedCloudLlm: false,
  largerModels: false,
  traducaoNuance: false,
  vozNatural: false,
  interpreteAutomatico: false,
  conversaVirtual: false,
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

/**
 * A AMOSTRA DA IA DE ESTUDO DO GRÁTIS (planos v4, etapa 2). NÃO é cota de plano nem muda o `free` da matriz (que
 * continua sem `managedCloudLlm` e com `tokensMes: 0`, e por isso sem tutor, Nuance ou polimento): é uma franquia à
 * parte, com contadores próprios por conta (`server/lib/iaDeEstudo.ts`), que passa pela admissão (faixa `gratis`) e
 * pelo orçamento global de IA como qualquer chamada. A janela do dia é o dia LOCAL da pessoa (o fuso da cota); a da
 * semana começa na segunda-feira desse dia.
 *
 * O teto de tokens por chamada é o `maxTokens` da função (`server/ai/funcoesDeIa.ts`): 1.200 de saída na explicação
 * e 1.500 no resumo (o teto geral por chamada; a amostra admitia até 2.000). A amostra usa o nível `rapida` (o Grátis não tem `traducaoNuance`).
 *
 * A CONTA DE CUSTO (pior caso: uma conta que usa TODA a amostra do mês, todo pedido no teto de entrada e de saída,
 * `ops/ia-provedores.openrouter.json`; `scripts/ia/modeloDeCusto.ts` a calcula a partir destes números — o
 * `npm run ia:custo` de 25/10/2026):
 *   explicação  no DeepSeek V4.1 Flash (a primeira perna desde 25/10/2026; preço declarado conservador, US$ 0,15/1M de
 *               entrada e US$ 0,65 de saída): ~2.000 tokens de entrada + 1.200 de saída ≈ US$ 0,0011; 5/dia × 30 =
 *               150/mês ≈ US$ 0,162
 *   resumo      no Llama 3.3 70B (a perna mais cara da cascata rápida do tutor, US$ 0,10/0,32): ~7.000 tokens de
 *               entrada + 1.500 de saída ≈ US$ 0,0012; 1/semana × ~4,3 ≈ US$ 0,0051 (no Gemma 4, ≈ US$ 0,0035)
 *   TETO POR CONTA GRÁTIS QUE USA TUDO ≈ US$ 0,167/mês (conservador) e ≈ US$ 0,166 (esperado: o mesmo DeepSeek na
 *   explicação, o resumo no Gemma 4). Na base, o `npm run ia:custo` supõe 30% dos grátis no teto no pior caso
 *   (`--amostra`).
 *
 * O POOL DIÁRIO GLOBAL (`poolChamadasDia`, no molde do pool do alívio): somando TODAS as contas Grátis, no máximo
 * 120 chamadas da amostra (explicações + resumos) por dia UTC. É ele que fecha o custo da amostra, qualquer que seja
 * o tamanho da base: no pior caso, toda chamada no preço do resumo (~US$ 0,0012) → 120 × 30 × 0,0012 ≈ US$ 4,25/mês.
 * O número veio do `npm run ia:custo`: com 3% de pagantes (1.000 usuários, 15 Essencial + 15 Premium) a margem no
 * pior caso sem a amostra é ~US$ 5,0, e 120 é o maior pool redondo que a mantém ≥ 0 (~US$ 0,8). Esgotado, a conta
 * recebe o mesmo 402 `amostra_acabou` da franquia individual; volta à meia-noite UTC.
 */
export const AMOSTRA_DE_IA = {
  explicacoesDia: 5,
  resumosSemana: 1,
  poolChamadasDia: 120,
} as const;

/**
 * OS TETOS DO ANÚNCIO PREMIADO (spec `anuncios-no-gratis`, "Amostra de nuvem com teto global"). A recompensa
 * é creditada pelo servidor (`server/routes/anuncios.ts`), e os dois tetos contam as exibições CONCLUÍDAS no
 * dia UTC: o da pessoa (somando todos os espaços premiados) e o de todas as contas juntas — este segura o
 * custo da amostra de nuvem (`nuvem-30`) e das Seeds num dia de pico. Atingido qualquer um, a exibição nem
 * começa (429 `teto_do_dia`) e a captura segue no aparelho.
 */
export const LIMITE_DE_PREMIADOS_POR_DIA = 5;
export const TETO_GLOBAL_DE_PREMIADOS_POR_DIA = 2_000;
/**
 * O `nuvem-30` tem custo de nuvem do nosso lado: dentro dos 5 do dia, no máximo 2 deles (1 h de nuvem por dia
 * por pessoa), contados nas exibições desse espaço concluídas no dia UTC.
 */
export const LIMITE_DE_NUVEM_30_POR_DIA = 2;
/**
 * E no MÊS UTC: no máximo 10 `nuvem-30` concluídos por pessoa (10 × 30 min = 5 h de nuvem a mais no mês), para o
 * dia a dia não virar 2 por dia × 31 = 31 h. Atingido, o `iniciar` e o `concluir` recusam (429 `teto_do_mes`).
 */
export const LIMITE_DE_NUVEM_30_POR_MES = 10;
/**
 * Exibições PENDENTES (iniciadas e não concluídas) por pessoa nos últimos 10 min: acima disto o `iniciar` recusa
 * (429 `exibicoes_pendentes`). Sem ele, um laço abriria linhas sem fim, e cada uma poderia virar recompensa.
 */
export const LIMITE_DE_PREMIADOS_PENDENTES = 3;
/**
 * TETOS POR IP E POR REDE das exibições premiadas CONCLUÍDAS no dia UTC (revisão de segurança de 15/11/2026). Sem
 * a verificação servidor a servidor (SSV) da rede de anúncios, um script conclui exibições sem anúncio nenhum, e os
 * tetos por CONTA não seguram uma fazenda de contas: estes a prendem ao endereço (`server/lib/premiadoPorIp.ts`, IP
 * pseudonimizado). 15 por IP = 3 adultos no teto de 5 atrás do mesmo IP; 60 por rede (/24 no IPv4, /48 no IPv6) =
 * 3% do teto global. Folgados de propósito: o CGNAT das operadoras móveis põe muita gente no mesmo IP. Atingido,
 * o `concluir` recusa (429 `teto_do_ip`) e não credita.
 */
export const LIMITE_DE_PREMIADOS_POR_IP_POR_DIA = 15;
export const LIMITE_DE_PREMIADOS_POR_REDE_POR_DIA = 60;
/**
 * O `nuvem-30` é nuvem de verdade (custo nosso), não Seeds: só para conta com 30 dias ou mais (403 `conta_nova`),
 * dez vezes a idade mínima das outras recompensas. Uma fazenda de contas precisa envelhecer um mês antes de render
 * nuvem, e até lá os tetos por IP e o teto do mês valem. O espaço ainda nem está ativo (`ESPACOS_PREMIADOS_ATIVOS`).
 */
export const IDADE_MINIMA_DA_CONTA_PARA_NUVEM_30_MS = 30 * 86_400_000;
/**
 * A DURAÇÃO MÍNIMA de uma exibição, por espaço premiado (R33): sem verificação servidor a servidor, concluir logo
 * depois de iniciar seria forjar a recompensa. O premiado da web dura até 30 s; abaixo de 15 s entre o `iniciar` e
 * o `concluir` o servidor recusa (409 `cedo_demais`).
 */
export const DURACAO_MINIMA_DA_EXIBICAO_MS: Readonly<
  Record<'fim-premiado' | 'ajuda-premiada' | 'tema-24h' | 'nuvem-30' | 'loja-seeds', number>
> = {
  'fim-premiado': 15_000,
  'ajuda-premiada': 15_000,
  'tema-24h': 15_000,
  'nuvem-30': 15_000,
  'loja-seeds': 15_000,
};

/**
 * O TETO DO TESTE DE 3 DIAS, EM USO (não em tempo). O teste dá os recursos do Premium, mas a nuvem dele é uma AMOSTRA:
 * antes ele herdava as 20 h do mês inteiro (US$ 1,16 a US$ 1,76 por pessoa no teto, sem receita), e quem testa e some é
 * a maioria. Agora o teste acaba no que vier primeiro: os 3 dias ou este teto.
 *
 * A CONTA (17/10/2026; STT + tradução por hora de legenda: US$ 0,028 esperado a US$ 0,058 conservador — Whisper turbo e
 * Gemma 4 pelo OpenRouter, `ops/ia-provedores.openrouter.json`):
 *   1 h de legenda na nuvem        ≤ US$ 0,06 (conservador)  — 3.600 s
 *   voz natural                    = US$ 0                   — o teste NÃO tem voz da nuvem (17/11/2026, change
 *                                                                `voz-natural-openrouter`: só plano pago; a voz do
 *                                                                aparelho lê a tradução no teste)
 *   TOTAL POR TESTE                ≤ US$ 0,06, contra US$ 0,20 com as 3 h de antes e US$ 1,76 com o mês inteiro.
 *   1 h basta para sentir a diferença (a nuvem acerta o que o aparelho erra) sem torná-la uma assinatura grátis.
 * Tokens: 150 mil por hora de fala. Chamadas: 1 h ÷ 6 s × 2 = 1.200, com folga até 1.400.
 *
 * 1 h desde 14/11/2026 (change `teste-de-3-dias`): eram 3 h para 14 dias; o teto encolheu na proporção do prazo.
 *
 * Usa os MESMOS contadores do plano (o teto vale o menor entre os dois): quem assina no meio do teste continua com
 * o mês do plano, descontado do que gastou no teste. O mês de um teste que cruza a virada recomeça o contador.
 */
export const FRANQUIA_DO_TESTE = {
  sttSegundosMes: 3_600,
  tokensMes: 150_000,
  chamadasMes: 1_400,
  vozCaracteresMes: 0,
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
 * v3) sobra o que nunca teve chave: o Premium. Com `venda_planos_v4` ligada, os v3 saem (`encerradoPor`) e
 * entra o Plus; a Família e o Pro só com as flags próprias (nunca ligadas na etapa 1: "em breve").
 */
export function planosAVenda(flagLigada: (chave: string) => boolean): PlanoPago[] {
  return PLANOS_PAGOS.filter(
    (p) => PLAN_MATRIX[p].flagsDeVenda.every(flagLigada) && !(PLAN_MATRIX[p].encerradoPor ?? []).some(flagLigada),
  );
}

/** Nenhuma chave de venda ligada: a venda dos planos novos fechada, como nasce. */
const VENDA_FECHADA = (): boolean => false;

/**
 * O plano que o TESTE de 3 dias concede (`DIAS_DO_TESTE_PREMIUM`). É uma decisão comercial, e por
 * isso mora ao lado da matriz: o servidor (`resolverPlano`) e a tela leem daqui.
 */
export const PLANO_DO_TESTE: PlanoPago = 'premium';

/**
 * O plano que o teste concede AGORA, dada a leitura das flags (planos v4): o Plus com `venda_planos_v4`
 * ligada, o Premium sem. Quem começou o teste num plano o segue até acabar: o servidor grava o plano na
 * concessão. `PLANO_DO_TESTE` fica para os chamadores que não leem flags (valor da v3, o de hoje).
 */
export function planoDoTeste(flagLigada: (chave: string) => boolean): PlanoPago {
  return flagLigada(FLAG_VENDA_PLANOS_V4) ? 'plus' : PLANO_DO_TESTE;
}

/**
 * O plano que as ofertas e os "Ver o plano" SUGEREM (planos v4): o Plus com `venda_planos_v4` ligada, o
 * Premium sem ela. Hoje coincide com o do teste (a entrada paga é a mesma porta), mas é outra decisão:
 * se o teste um dia for de outro plano, as ofertas continuam apontando para o que se vende primeiro.
 */
export function planoDeEntrada(flagLigada: (chave: string) => boolean): PlanoPago {
  return flagLigada(FLAG_VENDA_PLANOS_V4) ? 'plus' : PLANO_DO_TESTE;
}

/**
 * O plano SEM ANÚNCIOS que se vende agora (o de menor mensalidade entre os à venda): o que a porta "Sem
 * anúncios no …" de um anúncio nomeia. O Essencial com a v3, o Plus com a v4, o Premium sem nenhuma das
 * duas. `null` quando nenhum plano à venda tira os anúncios.
 */
export function planoSemAnuncios(flagLigada: (chave: string) => boolean): PlanoPago | null {
  const semAnuncios = planosAVenda(flagLigada).filter((p) => PLAN_MATRIX[p].entitlements.semAnuncios);
  if (!semAnuncios.length) return null;
  return semAnuncios.reduce((a, b) =>
    (PLAN_MATRIX[b].precoMensalBrl as number) < (PLAN_MATRIX[a].precoMensalBrl as number) ? b : a,
  );
}

/**
 * Os planos "em breve" com a v4 ligada: os que dependem da `venda_planos_v4` (estão no desenho da v4) e
 * ainda não estão à venda (Família e Pro, cujas chaves próprias seguem desligadas). Sem a v4 ligada
 * (`aVenda` sem o Plus), a lista é vazia: a tela de hoje não anuncia nada que não vende.
 */
export function planosEmBreve(aVenda: readonly PlanoPago[]): PlanoPago[] {
  if (!aVenda.includes('plus')) return [];
  return PLANOS_PAGOS.filter((p) => PLAN_MATRIX[p].flagsDeVenda.includes(FLAG_VENDA_PLANOS_V4) && !aVenda.includes(p));
}

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
 *
 * UMA COLISÃO CONHECIDA (v4): a última parcela do 12x do Plus (R$ 149,00 → 11 × 12,41 + 12,49) é igual à parcela
 * padrão do Premium (R$ 149,90 → 11 × 12,49 + 12,51). Valor que casa com MAIS DE UM plano só concede se
 * `preferido` (a intenção gravada do pagador) estiver entre os candidatos; senão devolve `null` — ambíguo, e o
 * chamador não concede por palpite. `tests/planos-v4-matriz.test.ts` falha se surgir outra colisão.
 */
export function planoPeloPagamento(
  valor: number | undefined,
  opcoes: { parcelas?: number; preferido?: PlanoPago | null } = {},
): { plano: PlanoDeAssinatura; ciclo: CicloDeCobranca } | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return null;
  const parcelas = opcoes.parcelas ?? 1;
  if (parcelas > 1 && parcelas !== PARCELAS_DO_ANUAL) return null;
  const candidatos: Array<{ plano: PlanoDeAssinatura; ciclo: CicloDeCobranca }> = [];
  for (const plano of PLANOS_DE_ASSINATURA) {
    const { precoMensalBrl: mensal, precoAnualBrl: anual } = PLAN_MATRIX[plano];
    if (parcelas > 1) {
      if (anual === null) continue;
      const { padrao, ultima } = valoresDasParcelas(anual, parcelas);
      if (casa(valor, padrao) || casa(valor, ultima)) candidatos.push({ plano, ciclo: 'anual' });
      continue;
    }
    if (mensal !== null && casa(valor, mensal)) candidatos.push({ plano, ciclo: 'mensal' });
    else if (anual !== null && casa(valor, anual)) candidatos.push({ plano, ciclo: 'anual' });
  }
  if (candidatos.length <= 1) return candidatos[0] ?? null;
  /* AMBÍGUO (a parcela de R$ 12,49 é do Plus e do Premium): quem decide é a intenção, mas só ENTRE os
     candidatos que o dinheiro permite. Sem intenção, ou com uma que não está entre eles, não se concede por
     palpite: `null`, e o webhook registra e mantém o estado. */
  const preferido = opcoes.preferido ? candidatos.find((c) => c.plano === opcoes.preferido) : undefined;
  return preferido ?? null;
}

/** Um valor que o Asaas pode cobrar por um plano, com o que ele tem de pagar. */
export interface ValorCobravel {
  plano: PlanoDeAssinatura;
  ciclo: CicloDeCobranca;
  valor: number;
  /** 1 = cobrança única (mensalidade ou ano à vista); `PARCELAS_DO_ANUAL` = parcela do 12x. */
  parcelas: number;
  oQue: 'mensalidade' | 'ano à vista' | 'parcela do 12x' | 'última parcela do 12x';
}

/**
 * TODO VALOR que o Asaas pode cobrar por um plano: a mensalidade, o ano à vista e as duas parcelas do 12x
 * (padrão e última). É o que o webhook casa em `planoPeloPagamento` e o que os testes enumeram para provar que
 * nenhum valor novo colide com outro plano. Plano sem preço (Grátis, self-host) devolve `[]`; sem anual (Ao Vivo),
 * só a mensalidade.
 */
export function valoresCobraveis(plano: PlanoDeAssinatura): ValorCobravel[] {
  const { precoMensalBrl: mensal, precoAnualBrl: anual } = PLAN_MATRIX[plano];
  const lista: ValorCobravel[] = [];
  if (mensal !== null) lista.push({ plano, ciclo: 'mensal', valor: mensal, parcelas: 1, oQue: 'mensalidade' });
  if (anual === null) return lista;
  const { padrao, ultima } = valoresDasParcelas(anual, PARCELAS_DO_ANUAL);
  lista.push({ plano, ciclo: 'anual', valor: anual, parcelas: 1, oQue: 'ano à vista' });
  lista.push({ plano, ciclo: 'anual', valor: padrao, parcelas: PARCELAS_DO_ANUAL, oQue: 'parcela do 12x' });
  lista.push({ plano, ciclo: 'anual', valor: ultima, parcelas: PARCELAS_DO_ANUAL, oQue: 'última parcela do 12x' });
  return lista;
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
