#!/usr/bin/env node
/**
 * MODELO DE CUSTO DO BABEL PLAY — matriz v2 (Grátis + Premium; change `planos-v2`, ADR 0011).
 *
 * Node puro, sem dependências. Rodar da raiz do repositório:
 *
 *   node scripts/custo/modelo.mjs
 *
 * Gera `openspec/changes/planos-v2/custo/custo-v2.csv` (formato longo, uma linha por número) e
 * `custo-v2-tabelas.md` (as tabelas), e imprime as tabelas.
 *
 * DE ONDE VEIO. A 1ª versão (Fase 3 da auditoria de prontidão, 25/09/2026) modelava Essencial e Pro; as
 * tabelas dela continuam em `openspec/audits/2026-09-25-prontidao/fase3-custo*` como o retrato daquela
 * matriz (o relatório `fase3-custo.md` as cita) — este script não as sobrescreve mais. A matriz v2
 * (decisão do dono de 29/09/2026) trouxe o que este modelo agora conta:
 *   - o PREMIUM em três formas: mensal (R$ 19,90), anual à vista (R$ 179, assinatura `YEARLY`) e anual em
 *     12x no cartão (parcelamento; 11 × R$ 14,91 + R$ 14,99) — cada uma com a sua taxa do Asaas;
 *   - o TETO MENSAL de 40 h (o empate de custo na pilha de hoje) até o B7 medir a cascata barata, e o USO
 *     JUSTO de 2 h/dia (o mês nunca passa de 30 × 2 h, e o teto mensal morde antes);
 *   - o TESTE de 14 dias sem cartão, com as cotas do Premium (no máximo 14 × 2 h = 28 h), sem receita;
 *   - a NUVEM DE ALÍVIO do Grátis (A10): 3 h/mês só para aparelho fraco, teto de US$ 0,13 por conta.
 *
 * REGRA DAS PREMISSAS: cada número abaixo tem a fonte no comentário — arquivo do repositório, número
 * medido, ou URL de preço com a data de consulta. O que não tem fonte está marcado `HIPÓTESE` (decisão
 * de produto ou uso ainda não medido: o app não tem usuário) e entra na sensibilidade. Para trocar o mix
 * de planos, mexa em `P.mix`; o de ciclos, `P.mixDoCiclo`; o câmbio, `P.cambio`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAIDA = join(RAIZ, 'openspec', 'changes', 'planos-v2', 'custo')

// ───────────────────────────────────────────────────────────────────────────────────────────────
// PREMISSAS
// ───────────────────────────────────────────────────────────────────────────────────────────────
const P = {
  // ── Câmbio e IOF ──
  /** PTAX venda de 25/09/2026 = 5,1991 (Banco Central, API Olinda PTAX CotacaoDolarPeriodo, consultada
   *  25/09/2026; faixa do mês 5,0856–5,1991). `src/core/planos.ts` planeja com 5,60 — cabe no +20%. */
  cambio: 5.1991,
  /** IOF de 3,5% em compra internacional com cartão (Decreto 12.499/2025; pwc.com.br "IOF - Alterações -
   *  Decreto Federal nº 12.499/2025", consultado 25/09/2026). Todos os provedores cobram em US$ no cartão. */
  iof: 0.035,

  // ── O Premium e os ciclos (src/core/planos.ts: precoMensalBrl, precoAnualBrl, PARCELAS_DO_ANUAL) ──
  preco: { mensal: 19.9, anual: 179 },
  parcelas: 12,
  /** Como os assinantes pagam — HIPÓTESE (a venda não abriu). O 12x é só no cartão (C5). */
  mixDoCiclo: { mensal: 0.6, anual: 0.25, anual12x: 0.15 },
  quotas: {
    // src/core/planos.ts (matriz v2): o Grátis não tem nuvem gerenciada — a nuvem de alívio é à parte (`alivio`).
    free: { sttH: 0, sttHDia: null, tokens: 0, armazMb: 500 },
    // 144.000 s = 40 h/mês (o empate até o B7), 7.200 s = 2 h/dia (uso justo), 6 M tokens/mês, 5 GB.
    premium: { sttH: 40, sttHDia: 2, tokens: 6_000_000, armazMb: 5_000 },
    // O teste de 14 dias usa as cotas do Premium (C6): no máximo 14 dias × 2 h = 28 h, 14 × 300 mil tokens.
    teste: { sttH: 28, sttHDia: 2, tokens: 14 * 300_000, armazMb: 5_000 },
  },
  /** DIAS_DO_TESTE_PREMIUM (src/core/planos.ts). */
  diasDoTeste: 14,
  /** A nuvem de alívio do Grátis (A10): FRANQUIA_DE_ALIVIO = 10.800 s (3 h) e teto de US$ 0,13 por conta
   *  (src/core/planos.ts); só para aparelho fraco — a fração de aparelhos fracos é HIPÓTESE. O pool do dia
   *  é FRACAO_DO_ALIVIO_NO_ORCAMENTO (0,2, src/core/nuvemDeAlivio.ts) × AI_BUDGET_USD_DAY (4,
   *  .env.production.example). A flag `nuvem_gratuita_alivio` nasce desligada (migração 0040). */
  alivio: { horasMes: 3, tetoUsd: 0.13, fracAparelhoFraco: 0.3, fracNoOrcamento: 0.2, orcamentoDiaUsd: 4 },
  /** O convidado (PLANO_CONVIDADO, src/core/planos.ts): 10 min de nuvem, 5 mensagens de tutor, teto de
   *  US$ 0,02 — só com a flag `nuvem_convidado`, que nasce desligada. */
  convidadoNuvem: { minutos: 10, msgsTutor: 5, tetoUsd: 0.02 },
  /** Quanto da cota grátis cada perfil usa — HIPÓTESE. */
  usoDaCotaGratis: { leve: 0.3, tipico: 1, teto: 1 },

  // ── IA: preços (US$) ──
  /** whisper-large-v3-turbo US$ 0,04/h, mínimo de 10 s por requisição (console.groq.com/docs/speech-to-text,
   *  consultado 25/09/2026; igual a server/lib/orcamentoDeIa.ts). */
  sttUsdHora: 0.04,
  /** Faturado/real = 1,08 com VAD de 800 ms (docs/auditoria/eval/bancada-2026-09.md, MEDIDO). */
  sttFatorFaturado: 1.08,
  /** gpt-oss-120b na Groq: US$ 0,15 entrada, 0,075 entrada em cache, 0,60 saída por 1M
   *  (console.groq.com/docs/model/openai/gpt-oss-120b, consultado 25/09/2026; orcamentoDeIa.ts). */
  llm: { entrada: 0.15, entradaCache: 0.075, saida: 0.6 },
  /** Tradução com raciocínio "low": US$ 0,036 por hora de fala (bancada-2026-09.md, MEDIDO). */
  mtUsdHoraFala: 0.036,
  /** Fração de ENTRADA no pior caso "típico" do teto de tokens (planos.ts: 80% entrada). */
  fracEntradaTeto: 0.8,
  /** Tutor: ~1.500 tokens por mensagem — NÃO MEDIDO (estimativa herdada; o pior caso por pergunta é
   *  ~3.300 entrada + 900 saída ≈ US$ 0,001, server/ai/funcoesDeIa.ts). Divisão entrada/saída
   *  HIPÓTESE 1.200/300. */
  tutorTokens: { entrada: 1_200, saida: 300 },
  /** Falas por hora de fala: 3.600 s ÷ 6 s (planos.ts). Cada fala = 1 STT + 1 tradução. */
  falasPorHora: 600,
  chamadasPorFala: 2,

  // ── Groq camada gratuita (é o que existe hoje: bancada-2026-09.md; upgrade indisponível) ──
  /** console.groq.com/docs/rate-limits, consultado 25/09/2026: whisper turbo ASD 28.800 s/dia de áudio,
   *  RPD 2.000; gpt-oss-120b RPD 1.000, TPD 200.000. Para o app INTEIRO (limite por organização). */
  groqGratis: { sttSegDia: 28_800, sttReqDia: 2_000, llmReqDia: 1_000, llmTokDia: 200_000 },

  // ── Armazenamento ──
  /** Opus 24 kbps ≈ 11 MB por hora gravada (fase2-escala.md; bancada-2026-09.md). */
  audioMbPorHora: 11,
  /** Retenção de 90 dias (server/lib/config.ts) → em regime, ficam ~3 meses de gravação. */
  mesesRetidos: 90 / 30,
  /** Cloudflare R2: US$ 0,015/GB-mês; classe A US$ 4,50/M; classe B US$ 0,36/M; grátis 10 GB,
   *  1M A, 10M B; egress US$ 0 (developers.cloudflare.com/r2/pricing, consultado 25/09/2026). */
  r2: { gbMes: 0.015, classeAporM: 4.5, classeBporM: 0.36, gratisGb: 10, gratisA: 1e6, gratisB: 10e6 },
  /** Pesos dos modelos no bucket público — A MEDIR (docs/LANCAMENTO.md dá 5–15 GB para tudo). */
  modelosGb: 3,
  /** Snapshot diário da aplicação guardado 30 dias (docs/LANCAMENTO.md, bucket de backups) — razão de
   *  compressão gzip do SQLite HIPÓTESE 0,3. */
  backupDias: 30,
  backupRazaoGzip: 0.3,
  /** Litestream empurra o WAL a cada 1 s por padrão (litestream.io/reference/config, consultado
   *  25/09/2026; litestream.yml "perda máxima de ~1 s"). Um PUT (classe A) por intervalo com escrita. */
  litestreamIntervaloS: 1,
  /** Escritas/s no PICO = 0,076 × cadastrados (fase2-escala.md). Média do dia = pico × 0,25 — HIPÓTESE. */
  escritasPicoPorUsuario: 0.076,
  razaoMediaPico: 0.25,

  // ── Banda e banco ──
  /** Egress do Fly na América do Sul: US$ 0,04/GB (docs.fly.io/about/pricing e fly.io/pricing-update,
   *  consultados 25/09/2026). Áudio e modelos saem do R2 (egress zero), não do Fly. */
  flyEgressGb: 0.04,
  /** Volume do Fly US$ 0,15/GB-mês; snapshots US$ 0,08/GB com 10 GB grátis (mesma fonte). */
  flyVolumeGb: 0.15,

  // ── Máquinas do Fly, a partir de 01/10/2026 (fly.io/pricing-update, consultado 25/09/2026) ──
  /** Ashburn: shared-cpu-1x 256 MB US$ 2,19; performance-1x 2 GB US$ 33,00; RAM extra US$ 6,00/GB-mês.
   *  São Paulo multiplica o preço de COMPUTE por 1,615384615 (seletor de região da mesma página).
   *  Premissa: o multiplicador vale também para a RAM extra (a página diz "compute prices"). */
  fly: { shared256: 2.19, perf1x2gb: 33.0, ramGbMes: 6.0, multGru: 1.615384615 },

  // ── Serviços ──
  /** Supabase Pro US$ 25 com US$ 10 de crédito de compute (cobre o Micro); Small US$ 15, Medium 60,
   *  Large 110; disco 8 GB incluso e US$ 0,125/GB acima; 100.000 MAU inclusos (supabase.com/pricing,
   *  consultado 25/09/2026). */
  supabase: {
    pro: 25,
    credito: 10,
    compute: { micro: 10, small: 15, medium: 60, large: 110 },
    discoIncluso: 8,
    discoGb: 0.125,
  },
  /** Resend Free 3.000/mês e 100/dia; Pro US$ 20 com 50.000 (resend.com/pricing, consultado 25/09/2026). */
  resend: { gratis: 3_000, pro: 20, proIncl: 50_000, excedentePorMil: 0.9 },
  /** E-mails por cadastrado por mês (login por link + avisos) — HIPÓTESE. */
  emailsPorCadastrado: 2,
  /** Sentry Developer 5.000 erros grátis; Team US$ 26/mês anual com 50.000 (sentry.io/pricing, 25/09/2026). */
  sentry: { gratis: 5_000, team: 26 },
  /** Erros por cadastrado por mês — HIPÓTESE. */
  errosPorCadastrado: 0.5,
  /** Langfuse Hobby 50k unidades grátis; Core US$ 29 com 100k e US$ 8 por 100k a mais
   *  (langfuse.com/pricing, 25/09/2026). Cada chamada de IA vira 1 trace + 1 geração = 2 unidades, sem
   *  amostragem (server/lib/langfuse.ts). */
  langfuse: { gratis: 50_000, core: 29, coreIncl: 100_000, por100k: 8, unidadesPorChamada: 2 },
  langfuseLigado: true,
  langfuseAmostragem: 1.0, // 1 = tudo, como o código está hoje
  /** Domínio .com.br R$ 40/ano (docs/LANCAMENTO.md). UptimeRobot Free US$ 0. */
  dominioBrlMes: 40 / 12,

  // ── Pagamento (asaas.com/precos-e-taxas e blog.asaas.com/taxas-asaas, consultados 25/09/2026) ──
  /** Pix R$ 0,99 nos 3 primeiros meses e R$ 1,99 depois; cartão à vista R$ 0,49 + 2,99% (1,99% promo).
   *  Usamos o preço CHEIO (depois da promoção). */
  asaas: {
    pix: 1.99,
    cartaoFixo: 0.49,
    cartaoPct: 0.0299,
    /** O 12x no cartão: 179 − 167,12 (`netValue` do parcelamento na sondagem do sandbox, 29/09/2026,
     *  openspec/changes/planos-v2/design.md) = R$ 11,88 no ano (~R$ 0,99 por parcela), MEDIDO no sandbox. */
    parcelamento12xAno: 179 - 167.12,
  },
  /** Fração dos assinantes que paga por Pix (mensal e anual à vista) — HIPÓTESE. O 12x é só cartão. */
  fracPix: 0.5,

  // ── Impostos (Simples Nacional; LC 123/2006) ──
  /** planos.ts usa "Simples (~6%)" = 1ª faixa do Anexo III (exige Fator R ≥ 28%). Tabelas de 2026:
   *  Anexo III (contabilizei.com.br/contabilidade-online/anexo-3-simples-nacional) e Anexo V
   *  (blog.esimplesauditoria.com.br/anexo-5-do-simples-nacional), consultados 25/09/2026.
   *  IBS/CBS: em 2026 o Simples NÃO recolhe as alíquotas de teste (reformatributaria.com, 25/09/2026). */
  anexo: 'III',
  simples: {
    III: [
      [180e3, 0.06, 0],
      [360e3, 0.112, 9_360],
      [720e3, 0.135, 17_640],
      [1.8e6, 0.16, 35_640],
      [3.6e6, 0.21, 125_640],
      [4.8e6, 0.33, 648_000],
    ],
    V: [
      [180e3, 0.155, 0],
      [360e3, 0.18, 4_500],
      [720e3, 0.195, 9_900],
      [1.8e6, 0.205, 17_100],
      [3.6e6, 0.23, 62_100],
      [4.8e6, 0.305, 540_000],
    ],
  },

  // ── Perfis de uso por mês — HIPÓTESE (não há uso real; o app não lançou) ──
  /** A mesma régua da 1ª versão: leve ≈ 10% do teto de horas, típico ≈ 40%, teto = 100% da cota.
   *  horasFala = horas de fala na nuvem gerenciada; horasGravadas = horas de sessão com áudio guardado.
   *  dbMb: 3,9 MB é o usuário PESADO medido (fase2-escala.md); o resto é hipótese. egressMb: resposta de API
   *  pelo Fly — A MEDIR. O Premium "sem limite no dia a dia" tem o teto = as 40 h do mês (o uso justo de
   *  2 h/dia daria 60 h: o mensal morde antes). O teste é de 14 dias, com teto de 28 h. */
  perfis: {
    convidado: {
      leve: { horasFala: 0, msgs: 0, horasGravadas: 0, dbMb: 0, egressMb: 2 },
      tipico: { horasFala: 0, msgs: 0, horasGravadas: 0, dbMb: 0, egressMb: 5 },
      teto: { horasFala: 0, msgs: 0, horasGravadas: 0, dbMb: 0, egressMb: 10 },
    },
    free: {
      leve: { horasFala: 0, msgs: 0, horasGravadas: 1, dbMb: 0.5, egressMb: 20 },
      tipico: { horasFala: 0, msgs: 0, horasGravadas: 4, dbMb: 1.5, egressMb: 80 },
      teto: { horasFala: 0, msgs: 0, horasGravadas: 999, dbMb: 3.9, egressMb: 300 }, // capado pela cota de 500 MB
    },
    teste: {
      leve: { horasFala: 2.8, msgs: 10, horasGravadas: 2.8, dbMb: 0.3, egressMb: 15 },
      tipico: { horasFala: 11.2, msgs: 70, horasGravadas: 11.2, dbMb: 0.8, egressMb: 50 },
      teto: { horasFala: 28, msgs: 0, horasGravadas: 28, dbMb: 2, egressMb: 150, tokensNoTeto: true },
    },
    premium: {
      leve: { horasFala: 4, msgs: 30, horasGravadas: 4, dbMb: 0.5, egressMb: 30 },
      tipico: { horasFala: 16, msgs: 150, horasGravadas: 16, dbMb: 1.5, egressMb: 100 },
      teto: { horasFala: 40, msgs: 0, horasGravadas: 40, dbMb: 3.9, egressMb: 300, tokensNoTeto: true },
    },
  },

  // ── Patamares ──
  patamares: [10, 100, 1_000, 10_000],
  /** Mix entre os CADASTRADOS — HIPÓTESE, troque aqui. `teste` = contas no teste de 14 dias no mês. Os
   *  30% pagantes são os da 1ª versão (20% Essencial + 10% Pro), para as duas se compararem; é otimista
   *  para freemium, e a sensibilidade mostra 10%. */
  mix: { free: 0.65, teste: 0.05, premium: 0.3 },
  /** Convidados (sem conta) ativos por cadastrado — HIPÓTESE. */
  convidadosPorCadastrado: 1.0,
  /** Distribuição de perfis dentro de cada plano — HIPÓTESE. */
  distPerfis: { leve: 0.5, tipico: 0.4, teto: 0.1 },

  /** Infra fixa por patamar (fase2-escala.md e ADR 0006). */
  infra: {
    10: { maquina: 'shared1gb', n: 1, volumeGb: 3, postgres: null, litestream: true },
    100: { maquina: 'shared1gb', n: 1, volumeGb: 3, postgres: null, litestream: true },
    // fase2 → CPU dedicada; ADR 0006 → 1.000 ativos é gatilho da migração ao Postgres do Supabase.
    1000: { maquina: 'perf1x2gb', n: 1, volumeGb: 10, postgres: 'small', litestream: false },
    // fase2 → 2,7 núcleos; a 60% de CPU (gatilho do ADR 0006) = ceil(2,7/0,6) = 5 máquinas.
    10000: { maquina: 'perf1x2gb', n: 5, volumeGb: 5, postgres: 'large', litestream: false },
  },
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CÁLCULO
// ───────────────────────────────────────────────────────────────────────────────────────────────
const PLANOS = ['convidado', 'free', 'teste', 'premium']
const PERFIS = ['leve', 'tipico', 'teto']
const CICLOS = ['mensal', 'anual', 'anual12x']
const pagante = (pl) => pl === 'premium'

function flyMaquinaUsd(tipo, p) {
  const { shared256, perf1x2gb, ramGbMes, multGru } = p.fly
  if (tipo === 'shared1gb') return (shared256 + 0.75 * ramGbMes) * multGru
  if (tipo === 'perf1x2gb') return perf1x2gb * multGru
  throw new Error(tipo)
}

/** Alíquota efetiva do Simples: (RBT12 × nominal − dedução) ÷ RBT12. */
function aliquotaSimples(rbt12, p) {
  const tab = p.simples[p.anexo]
  if (rbt12 <= 0) return tab[0][1]
  const faixa = tab.find(([teto]) => rbt12 <= teto) ?? tab.at(-1)
  return (rbt12 * faixa[1] - faixa[2]) / rbt12
}

const brl = (usd, p) => usd * p.cambio * (1 + p.iof)

/** Taxa do Asaas de UMA cobrança à vista (Pix ou cartão, na fração de Pix). */
function taxaDeUmaCobranca(valor, p) {
  return p.fracPix * p.asaas.pix + (1 - p.fracPix) * (p.asaas.cartaoFixo + p.asaas.cartaoPct * valor)
}

/** Receita e taxa do Asaas POR MÊS de um assinante, em cada ciclo: o anual (à vista ou 12x) é 179 ÷ 12. */
function porCiclo(ciclo, p) {
  if (ciclo === 'mensal') return { receita: p.preco.mensal, taxa: taxaDeUmaCobranca(p.preco.mensal, p) }
  if (ciclo === 'anual') return { receita: p.preco.anual / 12, taxa: taxaDeUmaCobranca(p.preco.anual, p) / 12 }
  return { receita: p.preco.anual / 12, taxa: p.asaas.parcelamento12xAno / 12 }
}

/** O assinante MÉDIO, pesado pelo mix de ciclos. */
function porPagante(p) {
  let receita = 0
  let taxa = 0
  for (const c of CICLOS) {
    const x = porCiclo(c, p)
    receita += p.mixDoCiclo[c] * x.receita
    taxa += p.mixDoCiclo[c] * x.taxa
  }
  return { receita, taxa }
}

/** O teto de horas de nuvem do plano: o menor entre o mês e o uso justo do dia (× dias do período). */
function tetoDeHoras(plano, p) {
  const q = p.quotas[plano]
  if (!q) return Infinity
  const dias = plano === 'teste' ? p.diasDoTeste : 30
  return Math.min(q.sttH, q.sttHDia ? q.sttHDia * dias : Infinity)
}

/**
 * Custo VARIÁVEL de um usuário num mês (US$), por componente, e as unidades físicas que o patamar soma.
 * `nuvemGratisLigada` liga a nuvem grátis: o alívio do Grátis (3 h, só para a fração de aparelhos fracos,
 * teto de US$ 0,13) e a nuvem do convidado (10 min, teto de US$ 0,02).
 */
function variavelDoUsuario(plano, perfil, p, { nuvemGratisLigada = false, fatorUso = 1 } = {}) {
  const base = p.perfis[plano][perfil]
  const q = p.quotas[plano]
  let horasFala = Math.min(base.horasFala * fatorUso, tetoDeHoras(plano, p))
  let msgs = base.msgs * fatorUso
  /** Fração dos usuários do perfil que usam a nuvem grátis (o alívio é só do aparelho fraco). */
  let fracQueUsa = 1
  let tetoUsd = Infinity
  if (nuvemGratisLigada && plano === 'free') {
    horasFala = p.alivio.horasMes * p.usoDaCotaGratis[perfil]
    msgs = 0
    fracQueUsa = p.alivio.fracAparelhoFraco
    tetoUsd = p.alivio.tetoUsd
  }
  if (nuvemGratisLigada && plano === 'convidado') {
    horasFala = (p.convidadoNuvem.minutos / 60) * p.usoDaCotaGratis[perfil]
    msgs = p.convidadoNuvem.msgsTutor * p.usoDaCotaGratis[perfil]
    tetoUsd = p.convidadoNuvem.tetoUsd
  }
  let sttUsd = horasFala * p.sttFatorFaturado * p.sttUsdHora
  let mtUsd = horasFala * p.mtUsdHoraFala
  let tutorUsd = (msgs * (p.tutorTokens.entrada * p.llm.entrada + p.tutorTokens.saida * p.llm.saida)) / 1e6
  if (base.tokensNoTeto) {
    // Teto: o pool de tokens inteiro gasto, 80% entrada / 20% saída (planos.ts). Tutor divide o pool.
    const tok = q.tokens
    mtUsd = (tok * (p.fracEntradaTeto * p.llm.entrada + (1 - p.fracEntradaTeto) * p.llm.saida)) / 1e6
    tutorUsd = 0
  }
  let llmPiorUsd = mtUsd + tutorUsd
  if (base.tokensNoTeto) llmPiorUsd = (q.tokens * p.llm.saida) / 1e6 // pior absoluto: tudo saída
  // O teto em DÓLAR por conta (alívio e convidado) corta a nuvem antes das horas.
  const iaUsd = sttUsd + mtUsd + tutorUsd
  if (iaUsd > tetoUsd) {
    const k = tetoUsd / iaUsd
    sttUsd *= k
    mtUsd *= k
    tutorUsd *= k
    horasFala *= k
    msgs *= k
  }
  return finalizar(sttUsd * fracQueUsa, mtUsd * fracQueUsa, tutorUsd * fracQueUsa, horasFala * fracQueUsa)

  function finalizar(stt, mt, tutor, horasNuvem) {
    const horasGrav = Math.min(base.horasGravadas * fatorUso, 1e6)
    let armazMb = horasGrav * p.audioMbPorHora * p.mesesRetidos
    if (q) armazMb = Math.min(armazMb, q.armazMb)
    const dbMb = Math.min(base.dbMb * fatorUso, 3.9 * fatorUso)
    const r2Usd = (armazMb / 1000) * p.r2.gbMes // marginal (sem franquia; a franquia entra no patamar)
    const egressUsd = ((base.egressMb * fatorUso) / 1000) * p.flyEgressGb
    const dbUsd = (dbMb / 1000) * p.flyVolumeGb
    const chamadas = horasNuvem * p.falasPorHora * p.chamadasPorFala + msgs
    const lfUnidades = p.langfuseLigado ? chamadas * p.langfuse.unidadesPorChamada * p.langfuseAmostragem : 0
    const lfUsdMarginal = (lfUnidades / 100_000) * p.langfuse.por100k
    return {
      horasFala: horasNuvem,
      msgs,
      sttUsd: stt,
      mtUsd: mt,
      tutorUsd: tutor,
      llmPiorUsd,
      armazMb,
      dbMb,
      r2Usd,
      egressUsd,
      dbUsd,
      chamadas,
      lfUnidades,
      lfUsdMarginal,
      egressMb: base.egressMb * fatorUso,
      variavelUsd: stt + mt + tutor + r2Usd + egressUsd + dbUsd,
    }
  }
}

/** Custo fixo de infra do patamar (US$/mês) + itens que dependem de volume agregado. */
function fixoDoPatamar(n, agregado, p) {
  const cfg = p.infra[n]
  const itens = {}
  itens.fly_maquinas = flyMaquinaUsd(cfg.maquina, p) * cfg.n
  itens.fly_volume = cfg.volumeGb * p.flyVolumeGb
  itens.supabase = p.supabase.pro
  if (cfg.postgres) {
    itens.supabase_compute_extra = p.supabase.compute[cfg.postgres] - p.supabase.credito
    const dbGb = agregado.dbMb / 1000
    itens.supabase_disco_extra = Math.max(0, dbGb - p.supabase.discoIncluso) * p.supabase.discoGb
  }
  // R2: áudio + modelos + backups, com a franquia de 10 GB.
  const dbGb = agregado.dbMb / 1000
  const backupsGb = dbGb * p.backupRazaoGzip * p.backupDias + dbGb /* réplica do Litestream */
  const r2Gb = agregado.armazMb / 1000 + p.modelosGb + (cfg.postgres ? 0 : backupsGb)
  itens.r2_armazenamento = Math.max(0, r2Gb - p.r2.gratisGb) * p.r2.gbMes
  // Litestream: um PUT por intervalo com escrita. Fração de intervalos com ≥1 escrita = 1 − e^(−λ·Δt).
  let putsLitestream = 0
  if (cfg.litestream) {
    const lambda = p.escritasPicoPorUsuario * n * p.razaoMediaPico
    const intervalos = (30 * 86_400) / p.litestreamIntervaloS
    putsLitestream = intervalos * (1 - Math.exp(-lambda * p.litestreamIntervaloS))
  }
  const putsAudio = agregado.horasGravadas * 2 // HIPÓTESE: 1 sessão a cada 30 min, 1 PUT por sessão
  itens.r2_classe_a = (Math.max(0, putsLitestream + putsAudio - p.r2.gratisA) / 1e6) * p.r2.classeAporM
  itens.fly_egress = (agregado.egressMb / 1000) * p.flyEgressGb
  // Serviços com degrau
  const emails = n * p.emailsPorCadastrado
  itens.resend =
    emails <= p.resend.gratis
      ? 0
      : p.resend.pro + (Math.max(0, emails - p.resend.proIncl) / 1000) * p.resend.excedentePorMil
  itens.sentry = n * p.errosPorCadastrado <= p.sentry.gratis ? 0 : p.sentry.team
  const u = agregado.lfUnidades
  itens.langfuse =
    !p.langfuseLigado || u <= p.langfuse.gratis
      ? 0
      : p.langfuse.core + (Math.max(0, u - p.langfuse.coreIncl) / 100_000) * p.langfuse.por100k
  const usd = Object.values(itens).reduce((a, b) => a + b, 0)
  return { itens, usd, brl: brl(usd, p) + p.dominioBrlMes, putsLitestream, r2Gb, emails }
}

/** Um patamar inteiro: usuários por plano e perfil, receita, custos, resultado. */
function patamar(n, p, opcoes = {}) {
  const usuarios = {
    convidado: n * p.convidadosPorCadastrado,
    free: n * p.mix.free,
    teste: n * p.mix.teste,
    premium: n * p.mix.premium,
  }
  const ag = {
    armazMb: 0,
    dbMb: 0,
    egressMb: 0,
    lfUnidades: 0,
    horasGravadas: 0,
    horasFalaNuvem: 0,
    chamadasLlm: 0,
  }
  const porPlano = {}
  const pag = porPagante(p)
  let receitaBruta = 0
  let taxaPag = 0
  for (const pl of PLANOS) {
    const acc = { usuarios: usuarios[pl], iaUsd: 0, sttUsd: 0, mtUsd: 0, tutorUsd: 0, outrosUsd: 0 }
    for (const pf of PERFIS) {
      const k = usuarios[pl] * p.distPerfis[pf]
      const v = variavelDoUsuario(pl, pf, p, opcoes)
      acc.sttUsd += k * v.sttUsd
      acc.mtUsd += k * v.mtUsd
      acc.tutorUsd += k * v.tutorUsd
      acc.outrosUsd += k * (v.egressUsd + v.dbUsd) // R2 é somado no fixo (tem franquia)
      ag.armazMb += k * v.armazMb
      ag.dbMb += k * v.dbMb
      ag.egressMb += k * v.egressMb
      ag.lfUnidades += k * v.lfUnidades
      ag.horasGravadas += k * Math.min(p.perfis[pl][pf].horasGravadas, v.armazMb / p.audioMbPorHora / p.mesesRetidos)
      ag.horasFalaNuvem += k * v.horasFala
      ag.chamadasLlm += k * (v.horasFala * p.falasPorHora + v.msgs)
    }
    acc.iaUsd = acc.sttUsd + acc.mtUsd + acc.tutorUsd
    if (pagante(pl)) {
      receitaBruta += usuarios[pl] * pag.receita
      taxaPag += usuarios[pl] * pag.taxa
    }
    porPlano[pl] = acc
  }
  const aliq = aliquotaSimples(receitaBruta * 12, p)
  const imposto = receitaBruta * aliq
  const fixo = fixoDoPatamar(n, ag, p)
  const iaUsd = PLANOS.reduce((a, pl) => a + porPlano[pl].iaUsd, 0)
  // Egress, volume e R2 do agregado já estão em `fixo` (somados com as franquias); não somar de novo.
  const custoTotal = fixo.brl + brl(iaUsd, p) + taxaPag + imposto
  const resultado = receitaBruta - custoTotal
  // Capacidade da camada gratuita da Groq (restrição de hoje)
  const cap = {
    sttHorasMes: (p.groqGratis.sttSegDia * 30) / 3600 / p.sttFatorFaturado,
    llmReqMes: p.groqGratis.llmReqDia * 30,
    demandaSttH: ag.horasFalaNuvem,
    demandaLlmReq: ag.chamadasLlm,
  }
  return { n, usuarios, porPlano, receitaBruta, taxaPag, aliq, imposto, fixo, iaUsd, custoTotal, resultado, ag, cap }
}

/** Ponto de equilíbrio: menor N (cadastrados) com resultado ≥ 0 usando a infra de cada faixa. */
function equilibrio(p, opcoes) {
  const faixa = (n) => (n < 100 ? 10 : n < 1000 ? 100 : n < 10000 ? 1000 : 10000)
  for (let n = 1; n <= 20000; n++) {
    const pp = { ...p, infra: { ...p.infra, [n]: p.infra[faixa(n)] } }
    if (patamar(n, pp, opcoes).resultado >= 0) return n
  }
  return null
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// SAÍDA
// ───────────────────────────────────────────────────────────────────────────────────────────────
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : String(x))
const f3 = (x) => x.toFixed(3).replace('.', ',')
const f0 = (x) => Math.round(x).toLocaleString('pt-BR')
const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%'
const tabela = (cab, linhas) =>
  [`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`, ...linhas.map((l) => `| ${l.join(' | ')} |`)].join(
    '\n',
  )

const csv = [['secao', 'cenario', 'plano', 'perfil', 'patamar', 'metrica', 'valor', 'unidade']]
const reg = (secao, cenario, plano, perfil, pat, metrica, valor, unidade) =>
  csv.push([secao, cenario, plano, perfil, pat, metrica, typeof valor === 'number' ? valor.toFixed(6) : valor, unidade])

const md = []
md.push('<!-- GERADO por `node scripts/custo/modelo.mjs` — não editar à mão. -->')
md.push(
  `Câmbio R$ ${f2(P.cambio)} × (1 + IOF ${pct(P.iof)}) = R$ ${f2(P.cambio * (1 + P.iof))} por US$ pago no cartão.\n`,
)

/** A margem de UM assinante, sem o fixo, num ciclo e num perfil. */
function margemDoAssinante(ciclo, perfil, p, opcoes = {}) {
  const { receita, taxa } = ciclo ? porCiclo(ciclo, p) : porPagante(p)
  const v = variavelDoUsuario('premium', perfil, p, opcoes)
  const imp = receita * aliquotaSimples(0, p)
  return receita - taxa - imp - brl(v.sttUsd + v.mtUsd + v.tutorUsd + v.r2Usd + v.egressUsd + v.dbUsd, p)
}

// 1. Por usuário/mês
function tabelaPorUsuario(p, nome, opcoes = {}) {
  const linhas = []
  const aliq = aliquotaSimples(0, p) // 1ª faixa (planos.ts)
  const pag = porPagante(p)
  for (const pl of PLANOS) {
    for (const pf of PERFIS) {
      const v = variavelDoUsuario(pl, pf, p, opcoes)
      const preco = pagante(pl) ? pag.receita : 0
      const taxa = pagante(pl) ? pag.taxa : 0
      const imp = preco * aliq
      const iaBrl = brl(v.sttUsd + v.mtUsd + v.tutorUsd, p)
      const infraBrl = brl(v.r2Usd + v.egressUsd + v.dbUsd, p)
      const lfBrl = brl(v.lfUsdMarginal, p)
      const margem = preco - taxa - imp - iaBrl - infraBrl
      linhas.push([
        pl,
        pf,
        f2(v.horasFala),
        f0(v.msgs),
        f3(v.sttUsd),
        f3(v.mtUsd),
        f3(v.tutorUsd),
        f0(v.armazMb),
        f3(v.r2Usd + v.egressUsd + v.dbUsd),
        f2(iaBrl + infraBrl),
        f2(preco),
        f2(taxa),
        f2(imp),
        f2(lfBrl),
        f2(margem),
      ])
      for (const [k, val, un] of [
        ['horas_fala_nuvem', v.horasFala, 'h'],
        ['stt', v.sttUsd, 'USD'],
        ['traducao', v.mtUsd, 'USD'],
        ['tutor', v.tutorUsd, 'USD'],
        ['llm_pior_absoluto', v.llmPiorUsd, 'USD'],
        ['audio_retido', v.armazMb, 'MB'],
        ['r2_audio', v.r2Usd, 'USD'],
        ['fly_egress', v.egressUsd, 'USD'],
        ['banco', v.dbUsd, 'USD'],
        ['langfuse_unidades', v.lfUnidades, 'un'],
        ['langfuse_marginal', lfBrl, 'BRL'],
        ['receita_mes', preco, 'BRL'],
        ['taxa_pagamento', taxa, 'BRL'],
        ['imposto_1a_faixa', imp, 'BRL'],
        ['margem_sem_fixo', margem, 'BRL'],
      ])
        reg('por_usuario', nome, pl, pf, '', k, val, un)
    }
  }
  return tabela(
    [
      'plano',
      'perfil',
      'h fala nuvem',
      'msgs tutor',
      'STT US$',
      'tradução US$',
      'tutor US$',
      'áudio retido MB',
      'armaz+banda+banco US$',
      'variável R$',
      'receita/mês R$',
      'Asaas R$',
      `Simples ${pct(aliq)} R$`,
      'Langfuse marg. R$',
      'margem R$ (sem fixo)',
    ],
    linhas,
  )
}
md.push('## T1 — Por usuário/mês, HOJE (nuvem grátis desligada: sem alívio nem convidado na nuvem)\n')
md.push(
  `O Premium é o assinante MÉDIO do mix de ciclos (${pct(P.mixDoCiclo.mensal)} mensal, ${pct(P.mixDoCiclo.anual)} anual à vista, ${pct(P.mixDoCiclo.anual12x)} anual em 12x). O teste não tem receita. O teto do Premium é ${f0(tetoDeHoras('premium', P))} h (o mês de 40 h morde antes das 2 h/dia × 30); o do teste, ${f0(tetoDeHoras('teste', P))} h (14 × 2 h).\n`,
)
md.push(tabelaPorUsuario(P, 'base'))
{
  const v = variavelDoUsuario('premium', 'teto', P)
  md.push(`\nPior caso absoluto do LLM no teto do Premium (tudo saída): US$ ${f2(v.llmPiorUsd)} no mês.`)
}

// 1b. O Premium por ciclo
{
  const linhas = []
  for (const c of CICLOS) {
    const x = porCiclo(c, P)
    const imp = x.receita * aliquotaSimples(0, P)
    const tip = margemDoAssinante(c, 'tipico', P)
    const teto = margemDoAssinante(c, 'teto', P)
    linhas.push([c, f2(x.receita), f2(x.taxa), f2(imp), f2(tip), f2(teto)])
    reg('por_ciclo', 'base', 'premium', '', '', `receita_mes_${c}`, x.receita, 'BRL')
    reg('por_ciclo', 'base', 'premium', '', '', `taxa_mes_${c}`, x.taxa, 'BRL')
    reg('por_ciclo', 'base', 'premium', 'tipico', '', `margem_${c}`, tip, 'BRL')
    reg('por_ciclo', 'base', 'premium', 'teto', '', `margem_${c}`, teto, 'BRL')
  }
  md.push('\n## T1b — O Premium por ciclo (R$ por mês, sem o fixo)\n')
  md.push(
    tabela(
      ['ciclo', 'receita/mês', 'Asaas/mês', 'Simples/mês', 'margem típico (16 h)', 'margem no teto (40 h)'],
      linhas,
    ),
  )
  md.push(
    `\nO anual é R$ ${f2(P.preco.anual)} ÷ 12 = R$ ${f2(P.preco.anual / 12)} por mês: "equivale a 3 meses grátis" contra 12 × R$ ${f2(P.preco.mensal)} = R$ ${f2(12 * P.preco.mensal)}. O 12x paga R$ ${f2(P.asaas.parcelamento12xAno)} por ano ao Asaas (sondagem do sandbox).\n`,
  )
}

// 1c. O teste de 14 dias: o que cada teste custa, e quanto a conversão paga
{
  const linhas = []
  for (const pf of PERFIS) {
    const v = variavelDoUsuario('teste', pf, P)
    const custo = brl(v.sttUsd + v.mtUsd + v.tutorUsd + v.r2Usd + v.egressUsd + v.dbUsd, P)
    // Quantos meses de assinatura média pagam UM teste neste perfil (margem do assinante típico).
    const meses = custo / Math.max(0.01, margemDoAssinante(null, 'tipico', P))
    linhas.push([pf, f2(v.horasFala), f2(custo), f2(meses)])
    reg('teste', 'base', 'teste', pf, '', 'custo_do_teste', custo, 'BRL')
  }
  md.push('## T1c — O teste de 14 dias: custo por teste e quantos meses de assinatura o pagam\n')
  md.push(tabela(['perfil', 'h de nuvem nos 14 dias', 'custo do teste R$', 'meses de assinatura típica'], linhas))
  md.push(
    '\nConversão teste → assinatura não medida (HIPÓTESE): com o teste típico acima, cada ponto percentual de conversão paga o seu próprio teste em poucos meses; o pior caso é quem usa as 28 h e não assina.\n',
  )
}

md.push('## T2 — Por usuário/mês com a nuvem GRÁTIS ligada (alívio do Grátis + convidado)\n')
md.push(
  `O alívio conta a média do Grátis: ${pct(P.alivio.fracAparelhoFraco)} dos aparelhos são fracos (HIPÓTESE) e usam até ${P.alivio.horasMes} h, com teto de US$ ${f2(P.alivio.tetoUsd)} por conta. O convidado: ${P.convidadoNuvem.minutos} min e teto de US$ ${f2(P.convidadoNuvem.tetoUsd)}.\n`,
)
md.push(tabelaPorUsuario(P, 'nuvem_gratis', { nuvemGratisLigada: true }))

// 2. Patamares
function tabelaPatamares(p, nome, opcoes = {}) {
  const linhas = []
  const det = []
  for (const n of p.patamares) {
    const r = patamar(n, p, opcoes)
    linhas.push([
      f0(n),
      f0(r.usuarios.premium),
      f0(r.usuarios.teste),
      f2(r.receitaBruta),
      f2(r.fixo.brl),
      f2(brl(r.iaUsd, p)),
      f2(r.taxaPag),
      pct(r.aliq) + ' = ' + f2(r.imposto),
      f2(r.custoTotal),
      f2(r.resultado),
      r.receitaBruta ? pct(r.resultado / r.receitaBruta) : '—',
    ])
    det.push([f0(n), ...Object.entries(r.fixo.itens).map(([k, v]) => `${k} ${f2(v)}`)].join(' · '))
    reg('patamar', nome, '', '', n, 'receita_bruta', r.receitaBruta, 'BRL')
    reg('patamar', nome, '', '', n, 'fixo_infra', r.fixo.brl, 'BRL')
    for (const [k, v] of Object.entries(r.fixo.itens)) reg('patamar', nome, '', '', n, 'fixo_' + k, v, 'USD')
    reg('patamar', nome, '', '', n, 'ia_total', brl(r.iaUsd, p), 'BRL')
    for (const pl of PLANOS) reg('patamar', nome, pl, '', n, 'ia_plano', brl(r.porPlano[pl].iaUsd, p), 'BRL')
    reg('patamar', nome, '', '', n, 'taxa_pagamento', r.taxaPag, 'BRL')
    reg('patamar', nome, '', '', n, 'aliquota_simples', r.aliq, 'fracao')
    reg('patamar', nome, '', '', n, 'imposto', r.imposto, 'BRL')
    reg('patamar', nome, '', '', n, 'custo_total', r.custoTotal, 'BRL')
    reg('patamar', nome, '', '', n, 'resultado', r.resultado, 'BRL')
    reg('patamar', nome, '', '', n, 'langfuse_unidades', r.ag.lfUnidades, 'un')
    reg('patamar', nome, '', '', n, 'litestream_puts', r.fixo.putsLitestream, 'PUT')
    reg('patamar', nome, '', '', n, 'r2_gb', r.fixo.r2Gb, 'GB')
    reg('patamar', nome, '', '', n, 'demanda_stt_h', r.cap.demandaSttH, 'h')
    reg('patamar', nome, '', '', n, 'demanda_llm_req', r.cap.demandaLlmReq, 'req')
  }
  const eq = equilibrio(p, opcoes)
  reg('equilibrio', nome, '', '', '', 'cadastrados', eq ?? -1, 'usuarios')
  return {
    texto: tabela(
      [
        'cadastrados',
        'assinantes',
        'em teste',
        'receita R$',
        'fixo infra R$',
        'IA R$',
        'Asaas R$',
        'Simples',
        'custo total R$',
        'resultado R$',
        'margem',
      ],
      linhas,
    ),
    detalhe: det.map((d) => '- ' + d).join('\n'),
    eq,
  }
}
const base = tabelaPatamares(P, 'base')
md.push(
  `\n## T3 — Patamares (mix ${pct(P.mix.free)} Grátis / ${pct(P.mix.teste)} em teste / ${pct(P.mix.premium)} Premium; ${P.convidadosPorCadastrado} convidado por cadastrado; perfis ${pct(P.distPerfis.leve)} leve / ${pct(P.distPerfis.tipico)} típico / ${pct(P.distPerfis.teto)} teto)\n`,
)
md.push(base.texto)
md.push('\nFixo de infra por item (US$/mês):\n')
md.push(base.detalhe)
md.push(`\n**Ponto de equilíbrio (base):** ${base.eq} cadastrados.\n`)

// Capacidade Groq grátis
{
  const linhas = P.patamares.map((n) => {
    const r = patamar(n, P)
    return [
      f0(n),
      f0(r.cap.demandaSttH),
      f0(r.cap.sttHorasMes),
      f0(r.cap.demandaLlmReq),
      f0(r.cap.llmReqMes),
      r.cap.demandaSttH <= r.cap.sttHorasMes && r.cap.demandaLlmReq <= r.cap.llmReqMes ? 'cabe' : 'NÃO cabe',
    ]
  })
  md.push('## T4 — Demanda de nuvem × camada GRATUITA da Groq (restrição atual)\n')
  md.push(
    tabela(
      [
        'cadastrados',
        'h de fala STT/mês',
        'teto grátis STT h/mês',
        'req LLM/mês',
        'teto grátis req LLM/mês',
        'veredito',
      ],
      linhas,
    ),
  )
  const r1 = variavelDoUsuario('premium', 'tipico', P)
  md.push(
    `\nUm Premium típico pede ${f0(r1.horasFala * P.falasPorHora)} traduções/mês; o teto grátis de 1.000 req/dia (30.000/mês) atende ~${f0(30000 / (r1.horasFala * P.falasPorHora))} assinantes típicos no app inteiro.\n`,
  )
}

// 3. Sensibilidade
const sessentaHoras = {
  ...P,
  quotas: { ...P.quotas, premium: { ...P.quotas.premium, sttH: 60, tokens: 9_000_000 } },
  perfis: { ...P.perfis, premium: { ...P.perfis.premium, teto: { ...P.perfis.premium.teto, horasFala: 60 } } },
}
const cenarios = [
  ['base', P, {}],
  ['câmbio −20%', { ...P, cambio: P.cambio * 0.8 }, {}],
  ['câmbio +20%', { ...P, cambio: P.cambio * 1.2 }, {}],
  ['uso 2×', P, { fatorUso: 2 }],
  ['Anexo V (Fator R < 28%)', { ...P, anexo: 'V' }, {}],
  ['100% Pix (mensal e anual à vista)', { ...P, fracPix: 1 }, {}],
  [
    'mais anual (30% mensal, 40% à vista, 30% 12x)',
    { ...P, mixDoCiclo: { mensal: 0.3, anual: 0.4, anual12x: 0.3 } },
    {},
  ],
  ['teto de 60 h JÁ (antes do B7, pilha de hoje)', sessentaHoras, {}],
  ['o dobro de contas em teste (10%)', { ...P, mix: { free: 0.6, teste: 0.1, premium: 0.3 } }, {}],
  ['10% pagantes (85% Grátis, 5% teste)', { ...P, mix: { free: 0.85, teste: 0.05, premium: 0.1 } }, {}],
  ['Langfuse desligado', { ...P, langfuseLigado: false }, {}],
  ['Langfuse com amostragem 10%', { ...P, langfuseAmostragem: 0.1 }, {}],
  ['nuvem grátis ligada (alívio + convidado)', P, { nuvemGratisLigada: true }],
  ['pior combinado (câmbio +20%, uso 2×, Anexo V)', { ...P, cambio: P.cambio * 1.2, anexo: 'V' }, { fatorUso: 2 }],
]
{
  const linhas = []
  for (const [nome, p, op] of cenarios) {
    const rs = P.patamares.map((n) => patamar(n, p, op))
    const eq = equilibrio(p, op)
    linhas.push([nome, ...rs.map((r) => f2(r.resultado)), String(eq)])
    rs.forEach((r) => reg('sensibilidade', nome, '', '', r.n, 'resultado', r.resultado, 'BRL'))
    reg('sensibilidade', nome, '', '', '', 'equilibrio', eq ?? -1, 'usuarios')
    reg('sensibilidade', nome, 'premium', 'teto', '', 'margem_teto', margemDoAssinante(null, 'teto', p, op), 'BRL')
  }
  md.push('## T5 — Sensibilidade: resultado mensal (R$) por patamar e ponto de equilíbrio\n')
  md.push(tabela(['cenário', ...P.patamares.map((n) => `${f0(n)} cad.`), 'equilíbrio (cad.)'], linhas))
  md.push(
    `\nMargem do assinante médio NO TETO: R$ ${f2(margemDoAssinante(null, 'teto', P))} com 40 h; R$ ${f2(margemDoAssinante(null, 'teto', sessentaHoras))} com 60 h na pilha de hoje — é por isso que o teto só sobe depois do B7.\n`,
  )
}

// 4. A nuvem grátis: custo e o pool do dia do alívio
{
  const linhas = []
  const poolDia = P.alivio.fracNoOrcamento * P.alivio.orcamentoDiaUsd
  for (const n of P.patamares) {
    const com = patamar(n, P, { nuvemGratisLigada: true })
    const custo = brl(com.porPlano.convidado.iaUsd + com.porPlano.free.iaUsd, P)
    const demandaAlivioDia = com.porPlano.free.iaUsd / 30
    linhas.push([
      f0(n),
      f2(custo),
      f2(poolDia),
      f2(demandaAlivioDia),
      demandaAlivioDia <= poolDia ? 'cabe' : 'pool corta (segue no aparelho)',
    ])
    reg('nuvem_gratis', 'ligada', '', '', n, 'custo_ia_free_convidado', custo, 'BRL')
    reg('nuvem_gratis', 'ligada', '', '', n, 'pool_alivio_dia', poolDia, 'USD')
    reg('nuvem_gratis', 'ligada', '', '', n, 'demanda_alivio_dia', demandaAlivioDia, 'USD')
  }
  md.push('\n## T6 — A nuvem grátis ligada: custo mensal e o pool do dia do alívio\n')
  md.push(
    `Pool do alívio = ${pct(P.alivio.fracNoOrcamento)} × AI_BUDGET_USD_DAY (US$ ${f2(P.alivio.orcamentoDiaUsd)}) = US$ ${f2(poolDia)}/dia; os outros 80% ficam para quem paga. Suba o orçamento do dia junto com a receita.\n`,
  )
  md.push(
    tabela(
      ['cadastrados', 'IA Grátis+convidado R$/mês', 'pool do alívio US$/dia', 'demanda do alívio US$/dia', 'veredito'],
      linhas,
    ),
  )
}

// 5. Economias
{
  const e = variavelDoUsuario('premium', 'tipico', P)
  const mtShare = e.mtUsd / (e.sttUsd + e.mtUsd + e.tutorUsd)
  const fracEntradaMt = (350 * P.llm.entrada) / (350 * P.llm.entrada + 90 * P.llm.saida) // planos.ts
  const n1000 = patamar(1000, P)
  const lfBase = n1000.fixo.itens.langfuse
  const lfAmostra = patamar(1000, { ...P, langfuseAmostragem: 0.1 }).fixo.itens.langfuse
  const ls100 = patamar(100, P).fixo
  const ls100b = patamar(100, { ...P, litestreamIntervaloS: 10 }).fixo
  const taxaMensalAno = 12 * porCiclo('mensal', P).taxa
  const taxaAnualAno = 12 * porCiclo('anual', P).taxa
  const linhas = [
    [
      'Cache de tradução sem contexto para falas curtas',
      `MT = ${pct(mtShare)} da IA do Premium típico; cada 10 p.p. de acerto = ${pct(mtShare * 0.1)} da IA`,
      'a medir (taxa de repetição de falas curtas)',
    ],
    [
      'Prompt caching da Groq (automático, −50% na entrada em cache, mín. 128–1.024 tokens)',
      `entrada = ${pct(fracEntradaMt)} do custo por fala; se 60% da entrada for prefixo em cache: −${pct(fracEntradaMt * 0.6 * 0.5)} na tradução`,
      'a medir (`cached_tokens` na resposta; prefixo pode ser menor que o mínimo)',
    ],
    [
      'Cascata barata da Fase B (DeepInfra ~US$ 0,024/h de fala e tradução)',
      'o que deixa o teto do Premium subir de 40 h para 60 h sem prejuízo',
      'a medir no B5/B7 (bancada com IC pareado)',
    ],
    [
      'Amostrar Langfuse em 10% (erros 100%)',
      `1.000 cadastrados: US$ ${f2(lfBase)} → ${f2(lfAmostra)}/mês`,
      'calculado',
    ],
    [
      'Litestream sync-interval 1 s → 10 s',
      `100 cadastrados: classe A US$ ${f2(ls100.itens.r2_classe_a)} → ${f2(ls100b.itens.r2_classe_a)}/mês (perda máx. 10 s)`,
      'calculado',
    ],
    [
      'Anual à vista (1 cobrança Asaas em vez de 12)',
      `taxa do ano: mensal R$ ${f2(taxaMensalAno)}, anual à vista R$ ${f2(taxaAnualAno)}, 12x R$ ${f2(P.asaas.parcelamento12xAno)}`,
      'calculado (o 12x, da sondagem do sandbox)',
    ],
    [
      'Mover STT/tradução para o navegador (Moonshine en, opus-mt)',
      'até 100% da parte movida; custa WER 4,9%→13,5% (en) e COMET 0,917→0,847',
      'decisão de produto (bancada-2026-09.md)',
    ],
  ]
  md.push('\n## T7 — Economias propostas\n')
  md.push(tabela(['medida', 'ganho estimado', 'status'], linhas))
  linhas.forEach((l) => reg('economias', 'base', '', '', '', l[0], l[1], l[2]))
}

// Fly: aviso sobre o preço do lançamento
{
  const shared = flyMaquinaUsd('shared1gb', P)
  const perf = flyMaquinaUsd('perf1x2gb', P)
  md.push(
    `\nFly (01/10/2026, São Paulo): shared-cpu-1x 1 GB = US$ ${f2(shared)}/mês; performance-1x 2 GB = US$ ${f2(perf)}/mês. docs/LANCAMENTO.md usa US$ 5,70 (preço de Ashburn antigo, sem o multiplicador de GRU).`,
  )
  reg('premissa', 'base', '', '', '', 'fly_shared1gb_gru', shared, 'USD')
  reg('premissa', 'base', '', '', '', 'fly_perf1x2gb_gru', perf, 'USD')
}

mkdirSync(SAIDA, { recursive: true })
writeFileSync(
  join(SAIDA, 'custo-v2.csv'),
  csv
    .map((l) => l.map((c) => (/[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
    .join('\n') + '\n',
)
writeFileSync(join(SAIDA, 'custo-v2-tabelas.md'), md.join('\n') + '\n')
console.log(md.join('\n'))
console.log(`\n→ ${join(SAIDA, 'custo-v2.csv')} (${csv.length - 1} linhas)\n→ ${join(SAIDA, 'custo-v2-tabelas.md')}`)
