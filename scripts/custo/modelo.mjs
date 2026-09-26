#!/usr/bin/env node
/**
 * MODELO DE CUSTO DO BABEL PLAY — Fase 3 da auditoria de prontidão (25/09/2026).
 *
 * Node puro, sem dependências. Rodar da raiz do repositório:
 *
 *   node scripts/custo/modelo.mjs
 *
 * Gera `openspec/audits/2026-09-25-prontidao/fase3-custo.csv` (formato longo, uma linha por número) e
 * `fase3-custo-tabelas.md` (as tabelas que o relatório `fase3-custo.md` cita), e imprime as tabelas.
 *
 * REGRA DAS PREMISSAS: cada número abaixo tem a fonte no comentário — arquivo:linha do repositório, número
 * medido, ou URL de preço com a data de consulta (25/09/2026). O que não tem fonte está marcado
 * `HIPÓTESE` (decisão de produto ou uso ainda não medido: o app não tem usuário) e entra na sensibilidade.
 * Para trocar o mix de planos, mexa em `P.mix`; para trocar o câmbio, `P.cambio`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAIDA = join(RAIZ, 'openspec', 'audits', '2026-09-25-prontidao')

// ───────────────────────────────────────────────────────────────────────────────────────────────
// PREMISSAS
// ───────────────────────────────────────────────────────────────────────────────────────────────
const P = {
  // ── Câmbio e IOF ──
  /** PTAX venda de 25/09/2026 = 5,1991 (Banco Central, API Olinda PTAX CotacaoDolarPeriodo, consultada
   *  25/09/2026; faixa do mês 5,0856–5,1991). `src/core/planos.ts:26` planeja com 5,60 — cabe no +20%. */
  cambio: 5.1991,
  /** IOF de 3,5% em compra internacional com cartão (Decreto 12.499/2025; pwc.com.br "IOF - Alterações -
   *  Decreto Federal nº 12.499/2025", consultado 25/09/2026). Todos os provedores cobram em US$ no cartão. */
  iof: 0.035,

  // ── Preços dos planos (src/core/planos.ts:94,103) ──
  preco: { essencial: 19.9, pro: 39.9 },
  quotas: {
    // src/core/planos.ts:90,99,106
    free: { sttH: 0, tokens: 0, armazMb: 500 },
    essencial: { sttH: 15, tokens: 3_000_000, armazMb: 1_000 },
    pro: { sttH: 20, tokens: 5_000_000, armazMb: 5_000 },
  },

  // ── IA: preços (US$) ──
  /** whisper-large-v3-turbo US$ 0,04/h, mínimo de 10 s por requisição (console.groq.com/docs/speech-to-text,
   *  consultado 25/09/2026; igual a server/lib/orcamentoDeIa.ts:44,55). */
  sttUsdHora: 0.04,
  /** Faturado/real = 1,08 com VAD de 800 ms (docs/auditoria/eval/bancada-2026-09.md:62, MEDIDO). */
  sttFatorFaturado: 1.08,
  /** gpt-oss-120b na Groq: US$ 0,15 entrada, 0,075 entrada em cache, 0,60 saída por 1M
   *  (console.groq.com/docs/model/openai/gpt-oss-120b, consultado 25/09/2026; orcamentoDeIa.ts:42). */
  llm: { entrada: 0.15, entradaCache: 0.075, saida: 0.6 },
  /** Tradução com raciocínio "low": US$ 0,036 por hora de fala (bancada-2026-09.md:77, MEDIDO). */
  mtUsdHoraFala: 0.036,
  /** Fração de ENTRADA no pior caso "típico" do teto de tokens (planos.ts:36: 80% entrada). */
  fracEntradaTeto: 0.8,
  /** Tutor: ~1.500 tokens por mensagem — NÃO MEDIDO (estimativa herdada; o pior caso por pergunta é
   *  ~3.300 entrada + 900 saída ≈ US$ 0,001, server/ai/funcoesDeIa.ts:16-21). Divisão entrada/saída
   *  HIPÓTESE 1.200/300. */
  tutorTokens: { entrada: 1_200, saida: 300 },
  /** Falas por hora de fala: 3.600 s ÷ 6 s (planos.ts:38). Cada fala = 1 STT + 1 tradução. */
  falasPorHora: 600,
  chamadasPorFala: 2,

  // ── Groq camada gratuita (é o que existe hoje: bancada-2026-09.md:130; upgrade indisponível) ──
  /** console.groq.com/docs/rate-limits, consultado 25/09/2026: whisper turbo ASD 28.800 s/dia de áudio,
   *  RPD 2.000; gpt-oss-120b RPD 1.000, TPD 200.000. Para o app INTEIRO (limite por organização). */
  groqGratis: { sttSegDia: 28_800, sttReqDia: 2_000, llmReqDia: 1_000, llmTokDia: 200_000 },

  // ── Armazenamento ──
  /** Opus 24 kbps ≈ 11 MB por hora gravada (fase2-escala.md:130; bancada-2026-09.md:57). */
  audioMbPorHora: 11,
  /** Retenção de 90 dias (server/lib/config.ts:831) → em regime, ficam ~3 meses de gravação. */
  mesesRetidos: 90 / 30,
  /** Cloudflare R2: US$ 0,015/GB-mês; classe A US$ 4,50/M; classe B US$ 0,36/M; grátis 10 GB,
   *  1M A, 10M B; egress US$ 0 (developers.cloudflare.com/r2/pricing, consultado 25/09/2026). */
  r2: { gbMes: 0.015, classeAporM: 4.5, classeBporM: 0.36, gratisGb: 10, gratisA: 1e6, gratisB: 10e6 },
  /** Pesos dos modelos no bucket público — A MEDIR (docs/LANCAMENTO.md:30 dá 5–15 GB para tudo). */
  modelosGb: 3,
  /** Snapshot diário da aplicação guardado 30 dias (docs/LANCAMENTO.md, bucket de backups) — razão de
   *  compressão gzip do SQLite HIPÓTESE 0,3. */
  backupDias: 30,
  backupRazaoGzip: 0.3,
  /** Litestream empurra o WAL a cada 1 s por padrão (litestream.io/reference/config, consultado
   *  25/09/2026; litestream.yml:15 "perda máxima de ~1 s"). Um PUT (classe A) por intervalo com escrita. */
  litestreamIntervaloS: 1,
  /** Escritas/s no PICO = 0,076 × cadastrados (fase2-escala.md:80). Média do dia = pico × 0,25 — HIPÓTESE. */
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
   *  amostragem (server/lib/langfuse.ts:24-26). `langfuseLigado` porque o projeto ainda não existe
   *  (memória do projeto: "Langfuse aguarda projeto babel-play"). */
  langfuse: { gratis: 50_000, core: 29, coreIncl: 100_000, por100k: 8, unidadesPorChamada: 2 },
  langfuseLigado: true,
  langfuseAmostragem: 1.0, // 1 = tudo, como o código está hoje
  /** Domínio .com.br R$ 40/ano (docs/LANCAMENTO.md:34). UptimeRobot Free US$ 0 (LANCAMENTO.md:33). */
  dominioBrlMes: 40 / 12,

  // ── Pagamento (asaas.com/precos-e-taxas e blog.asaas.com/taxas-asaas, consultados 25/09/2026) ──
  /** Pix R$ 0,99 nos 3 primeiros meses e R$ 1,99 depois; cartão à vista R$ 0,49 + 2,99% (1,99% promo).
   *  Usamos o preço CHEIO (depois da promoção). Obs.: planos.ts:26 usa R$ 1,09 = cartão cheio no Essencial. */
  asaas: { pix: 1.99, cartaoFixo: 0.49, cartaoPct: 0.0299 },
  /** Fração dos assinantes que paga por Pix — HIPÓTESE. */
  fracPix: 0.5,

  // ── Impostos (Simples Nacional; LC 123/2006) ──
  /** planos.ts:26 usa "Simples (~6%)" = 1ª faixa do Anexo III (exige Fator R ≥ 28%). Tabelas de 2026:
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
  /** leve ≈ 10% do teto de horas, típico ≈ 40%, teto = 100% da cota. horasGravadas = horas de sessão
   *  com áudio guardado. dbMb: 3,9 MB é o usuário PESADO medido (fase2-escala.md:80); o resto é hipótese.
   *  egressMb: resposta de API pelo Fly — A MEDIR (`/api/vocab` com 3.000 cartões = 2,3 MB, fase2:36). */
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
    essencial: {
      leve: { horasFala: 1.5, msgs: 20, horasGravadas: 1.5, dbMb: 0.5, egressMb: 30 },
      tipico: { horasFala: 6, msgs: 100, horasGravadas: 6, dbMb: 1.5, egressMb: 100 },
      teto: { horasFala: 15, msgs: 0, horasGravadas: 15, dbMb: 3.9, egressMb: 300, tokensNoTeto: true },
    },
    pro: {
      leve: { horasFala: 2, msgs: 30, horasGravadas: 2, dbMb: 0.5, egressMb: 30 },
      tipico: { horasFala: 8, msgs: 150, horasGravadas: 8, dbMb: 1.5, egressMb: 100 },
      teto: { horasFala: 20, msgs: 0, horasGravadas: 20, dbMb: 3.9, egressMb: 300, tokensNoTeto: true },
    },
  },

  // ── PROPOSTA: cota de nuvem para convidado e free (hoje 0: sttProxy.ts:116, mtProxy.ts:122, tutor.ts:102) ──
  proposta: {
    convidado: { minutosNuvem: 10, msgsTutor: 5, tetoUsdUsuario: 0.02 },
    free: { minutosNuvem: 30, msgsTutor: 20, tetoUsdUsuario: 0.05 },
    /** Quanto da cota cada perfil usa. */
    usoDaCota: { leve: 0.3, tipico: 1, teto: 1 },
    /** Pool global/dia de free+convidado = max(piso, fração da receita líquida do mês ÷ 30). */
    poolPisoUsdDia: 0.5,
    poolFracReceita: 0.05,
  },

  // ── Patamares ──
  patamares: [10, 100, 1_000, 10_000],
  /** Mix de planos entre os CADASTRADOS — HIPÓTESE, troque aqui. */
  mix: { free: 0.7, essencial: 0.2, pro: 0.1 },
  /** Convidados (sem conta) ativos por cadastrado — HIPÓTESE. */
  convidadosPorCadastrado: 1.0,
  /** Distribuição de perfis dentro de cada plano — HIPÓTESE. */
  distPerfis: { leve: 0.5, tipico: 0.4, teto: 0.1 },

  /** Infra fixa por patamar (fase2-escala.md:84-87 e ADR 0006). */
  infra: {
    10: { maquina: 'shared1gb', n: 1, volumeGb: 3, postgres: null, litestream: true },
    100: { maquina: 'shared1gb', n: 1, volumeGb: 3, postgres: null, litestream: true },
    // fase2:86 → CPU dedicada; ADR 0006:24-26 → 1.000 ativos é gatilho da migração ao Postgres do Supabase.
    1000: { maquina: 'perf1x2gb', n: 1, volumeGb: 10, postgres: 'small', litestream: false },
    // fase2:87 → 2,7 núcleos; a 60% de CPU (gatilho do ADR 0006:25) = ceil(2,7/0,6) = 5 máquinas.
    // Postgres Large (dedicado) para ~760 escritas/s: tamanho A MEDIR (carga no Postgres não medida).
    10000: { maquina: 'perf1x2gb', n: 5, volumeGb: 5, postgres: 'large', litestream: false },
  },
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CÁLCULO
// ───────────────────────────────────────────────────────────────────────────────────────────────
const PLANOS = ['convidado', 'free', 'essencial', 'pro']
const PERFIS = ['leve', 'tipico', 'teto']
const pagante = (pl) => pl === 'essencial' || pl === 'pro'

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

function taxaPagamentoBrl(preco, p) {
  return p.fracPix * p.asaas.pix + (1 - p.fracPix) * (p.asaas.cartaoFixo + p.asaas.cartaoPct * preco)
}

/**
 * Custo VARIÁVEL de um usuário num mês (US$), por componente, e as unidades físicas que o patamar soma.
 * `propostaLigada` dá ao convidado/free a cota de nuvem proposta.
 */
function variavelDoUsuario(plano, perfil, p, { propostaLigada = false, fatorUso = 1 } = {}) {
  const base = p.perfis[plano][perfil]
  const q = p.quotas[plano]
  let horasFala = base.horasFala * fatorUso
  let msgs = base.msgs * fatorUso
  if (q) horasFala = Math.min(horasFala, q.sttH || 0)
  if (propostaLigada && (plano === 'convidado' || plano === 'free')) {
    const c = p.proposta[plano]
    const uso = p.proposta.usoDaCota[perfil]
    horasFala = (c.minutosNuvem / 60) * uso
    msgs = c.msgsTutor * uso
  }
  const sttUsd = horasFala * p.sttFatorFaturado * p.sttUsdHora
  let mtUsd = horasFala * p.mtUsdHoraFala
  let tutorUsd = (msgs * (p.tutorTokens.entrada * p.llm.entrada + p.tutorTokens.saida * p.llm.saida)) / 1e6
  if (base.tokensNoTeto) {
    // Teto: o pool de tokens inteiro gasto, 80% entrada / 20% saída (planos.ts:36). Tutor divide o pool.
    const tok = q.tokens
    mtUsd = (tok * (p.fracEntradaTeto * p.llm.entrada + (1 - p.fracEntradaTeto) * p.llm.saida)) / 1e6
    tutorUsd = 0
  }
  let llmPiorUsd = mtUsd + tutorUsd
  if (base.tokensNoTeto) llmPiorUsd = (q.tokens * p.llm.saida) / 1e6 // pior absoluto: tudo saída (planos.ts:35)
  // Com proposta, o teto de US$ por usuário corta a nuvem do convidado/free.
  const iaUsd = sttUsd + mtUsd + tutorUsd
  if (propostaLigada && (plano === 'convidado' || plano === 'free')) {
    const teto = p.proposta[plano].tetoUsdUsuario
    if (iaUsd > teto) {
      const k = teto / iaUsd
      return finalizar(sttUsd * k, mtUsd * k, tutorUsd * k)
    }
  }
  return finalizar(sttUsd, mtUsd, tutorUsd)

  function finalizar(stt, mt, tutor) {
    const horasGrav = Math.min(base.horasGravadas * fatorUso, 1e6)
    let armazMb = horasGrav * p.audioMbPorHora * p.mesesRetidos
    if (q) armazMb = Math.min(armazMb, q.armazMb)
    const dbMb = Math.min(base.dbMb * fatorUso, 3.9 * fatorUso)
    const r2Usd = (armazMb / 1000) * p.r2.gbMes // marginal (sem franquia; a franquia entra no patamar)
    const egressUsd = ((base.egressMb * fatorUso) / 1000) * p.flyEgressGb
    const dbUsd = (dbMb / 1000) * p.flyVolumeGb
    const chamadas = horasFala * p.falasPorHora * p.chamadasPorFala + msgs
    const lfUnidades = p.langfuseLigado ? chamadas * p.langfuse.unidadesPorChamada * p.langfuseAmostragem : 0
    const lfUsdMarginal = (lfUnidades / 100_000) * p.langfuse.por100k
    return {
      horasFala,
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
    essencial: n * p.mix.essencial,
    pro: n * p.mix.pro,
  }
  const ag = {
    armazMb: 0,
    dbMb: 0,
    egressMb: 0,
    lfUnidades: 0,
    horasGravadas: 0,
    horasFalaNuvem: 0,
    chamadasLlm: 0,
    tokensLlm: 0,
  }
  const porPlano = {}
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
      receitaBruta += usuarios[pl] * p.preco[pl]
      taxaPag += usuarios[pl] * taxaPagamentoBrl(p.preco[pl], p)
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

// 1. Por usuário/mês
function tabelaPorUsuario(p, nome, opcoes = {}) {
  const linhas = []
  const aliq = aliquotaSimples(0, p) // 1ª faixa (planos.ts:26)
  for (const pl of PLANOS) {
    for (const pf of PERFIS) {
      const v = variavelDoUsuario(pl, pf, p, opcoes)
      const preco = pagante(pl) ? p.preco[pl] : 0
      const taxa = pagante(pl) ? taxaPagamentoBrl(preco, p) : 0
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
      'Asaas R$',
      `Simples ${pct(aliq)} R$`,
      'Langfuse marg. R$',
      'margem R$ (sem fixo)',
    ],
    linhas,
  )
}
md.push('## T1 — Por usuário/mês, HOJE (convidado e free sem nuvem)\n')
md.push(tabelaPorUsuario(P, 'base'))
md.push(
  '\nPior caso absoluto do LLM no teto (tudo saída, planos.ts:35): Essencial US$ ' +
    f2(variavelDoUsuario('essencial', 'teto', P).llmPiorUsd) +
    ', Pro US$ ' +
    f2(variavelDoUsuario('pro', 'teto', P).llmPiorUsd) +
    '.',
)
const margemPiorAbs = (pl, comLangfuse) => {
  const v = variavelDoUsuario(pl, 'teto', P)
  const preco = P.preco[pl]
  return (
    preco -
    taxaPagamentoBrl(preco, P) -
    preco * aliquotaSimples(0, P) -
    brl(v.sttUsd + v.llmPiorUsd + v.r2Usd + v.egressUsd + v.dbUsd, P) -
    (comLangfuse ? brl(v.lfUsdMarginal, P) : 0)
  )
}
for (const pl of ['essencial', 'pro']) {
  reg('por_usuario', 'pior_absoluto', pl, 'teto', '', 'margem_sem_langfuse', margemPiorAbs(pl, false), 'BRL')
  reg('por_usuario', 'pior_absoluto', pl, 'teto', '', 'margem_com_langfuse', margemPiorAbs(pl, true), 'BRL')
}
md.push(
  `Margem no pior absoluto (sem fixo): Essencial R$ ${f2(margemPiorAbs('essencial', false))} sem Langfuse e R$ ${f2(margemPiorAbs('essencial', true))} com Langfuse sem amostragem; Pro R$ ${f2(margemPiorAbs('pro', false))} e R$ ${f2(margemPiorAbs('pro', true))}.\n`,
)
md.push('## T2 — Por usuário/mês com a PROPOSTA de cota de nuvem para convidado e free\n')
md.push(tabelaPorUsuario(P, 'proposta', { propostaLigada: true }))

// 2. Patamares
function tabelaPatamares(p, nome, opcoes = {}) {
  const linhas = []
  const det = []
  for (const n of p.patamares) {
    const r = patamar(n, p, opcoes)
    linhas.push([
      f0(n),
      f0(r.usuarios.essencial + r.usuarios.pro),
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
        'pagantes',
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
  `\n## T3 — Patamares (mix ${pct(P.mix.free)} free / ${pct(P.mix.essencial)} Essencial / ${pct(P.mix.pro)} Pro; ${P.convidadosPorCadastrado} convidado por cadastrado; perfis ${pct(P.distPerfis.leve)} leve / ${pct(P.distPerfis.tipico)} típico / ${pct(P.distPerfis.teto)} teto)\n`,
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
  const r1 = variavelDoUsuario('essencial', 'tipico', P)
  md.push(
    `\nUm Essencial típico pede ${f0(r1.horasFala * P.falasPorHora)} traduções/mês; o teto grátis de 1.000 req/dia (30.000/mês) atende ~${f0(30000 / (r1.horasFala * P.falasPorHora))} assinantes típicos no app inteiro.\n`,
  )
}

// 3. Sensibilidade
const cenarios = [
  ['base', P, {}],
  ['câmbio −20%', { ...P, cambio: P.cambio * 0.8 }, {}],
  ['câmbio +20%', { ...P, cambio: P.cambio * 1.2 }, {}],
  ['uso 2×', P, { fatorUso: 2 }],
  ['Anexo V (Fator R < 28%)', { ...P, anexo: 'V' }, {}],
  ['100% Pix', { ...P, fracPix: 1 }, {}],
  ['Langfuse desligado', { ...P, langfuseLigado: false }, {}],
  ['Langfuse com amostragem 10%', { ...P, langfuseAmostragem: 0.1 }, {}],
  ['proposta free/convidado ligada', P, { propostaLigada: true }],
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
    const ess = variavelDoUsuario('essencial', 'teto', p, op)
    reg('sensibilidade', nome, 'essencial', 'teto', '', 'ia_brl', brl(ess.sttUsd + ess.mtUsd, p), 'BRL')
  }
  md.push('## T5 — Sensibilidade: resultado mensal (R$) por patamar e ponto de equilíbrio\n')
  md.push(tabela(['cenário', ...P.patamares.map((n) => `${f0(n)} cad.`), 'equilíbrio (cad.)'], linhas))
}

// 4. Proposta free/convidado: custo e pool global
{
  const linhas = []
  for (const n of P.patamares) {
    const sem = patamar(n, P)
    const com = patamar(n, P, { propostaLigada: true })
    const custoProposta = brl(com.porPlano.convidado.iaUsd + com.porPlano.free.iaUsd, P)
    const liquido = sem.receitaBruta - sem.taxaPag - sem.imposto
    const poolDia = Math.max(
      P.proposta.poolPisoUsdDia,
      (P.proposta.poolFracReceita * liquido) / (P.cambio * (1 + P.iof)) / 30,
    )
    const demandaDia = (com.porPlano.convidado.iaUsd + com.porPlano.free.iaUsd) / 30
    linhas.push([
      f0(n),
      f2(custoProposta),
      f2(poolDia),
      f2(demandaDia),
      demandaDia <= poolDia ? 'cabe' : 'pool corta (fila local)',
    ])
    reg('proposta', 'proposta', '', '', n, 'custo_ia_free_convidado', custoProposta, 'BRL')
    reg('proposta', 'proposta', '', '', n, 'pool_global_dia', poolDia, 'USD')
    reg('proposta', 'proposta', '', '', n, 'demanda_dia', demandaDia, 'USD')
  }
  md.push('\n## T6 — Proposta de nuvem para free/convidado: custo mensal e pool global por dia\n')
  md.push(
    tabela(
      ['cadastrados', 'IA free+convidado R$/mês', 'pool global US$/dia', 'demanda média US$/dia', 'veredito'],
      linhas,
    ),
  )
}

// 5. Economias
{
  const e = variavelDoUsuario('essencial', 'tipico', P)
  const mtShare = e.mtUsd / (e.sttUsd + e.mtUsd + e.tutorUsd)
  const fracEntradaMt = (350 * P.llm.entrada) / (350 * P.llm.entrada + 90 * P.llm.saida) // planos.ts:27
  const n1000 = patamar(1000, P)
  const lfBase = n1000.fixo.itens.langfuse
  const lfAmostra = patamar(1000, { ...P, langfuseAmostragem: 0.1 }).fixo.itens.langfuse
  const ls100 = patamar(100, P).fixo
  const ls100b = patamar(100, { ...P, litestreamIntervaloS: 10 }).fixo
  const linhas = [
    [
      'Cache de tradução sem contexto para falas curtas',
      `MT = ${pct(mtShare)} da IA do Essencial típico; cada 10 p.p. de acerto = ${pct(mtShare * 0.1)} da IA`,
      'a medir (taxa de repetição de falas curtas)',
    ],
    [
      'Cache por hash de áudio',
      'fala ao vivo nunca repete; só retranscrição/importação',
      'a medir (importações repetidas)',
    ],
    [
      'Prompt caching da Groq (automático, −50% na entrada em cache, mín. 128–1.024 tokens)',
      `entrada = ${pct(fracEntradaMt)} do custo por fala; se 60% da entrada for prefixo em cache: −${pct(fracEntradaMt * 0.6 * 0.5)} na tradução`,
      'a medir (`cached_tokens` na resposta; prefixo pode ser menor que o mínimo)',
    ],
    [
      'gpt-oss-20b para frases curtas',
      'US$ 0,018/h vs 0,036/h (−50%), mas −0,033 COMET no gold (bancada:79,87)',
      'a medir (qualidade só em frases curtas)',
    ],
    [
      'Provedor ZDR mais barato na OpenRouter (gpt-oss-120b US$ 0,03/0,17 + 5,5% de taxa)',
      'até −72% na tradução e tutor',
      'a medir (qualidade/quantização não medidas na bancada)',
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
      'Plano anual (1 cobrança Asaas em vez de 12)',
      `Essencial: R$ ${f2(taxaPagamentoBrl(19.9, P) * 11)} a menos por ano em taxa fixa+Pix (aprox.)`,
      'calculado (preço anual é decisão do dono)',
    ],
    [
      'Mover STT/tradução para o navegador (Moonshine en, opus-mt)',
      'até 100% da parte movida; custa WER 4,9%→13,5% (en) e COMET 0,917→0,847',
      'decisão de produto (bancada:44-46,77-81)',
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
    `\nFly (01/10/2026, São Paulo): shared-cpu-1x 1 GB = US$ ${f2(shared)}/mês; performance-1x 2 GB = US$ ${f2(perf)}/mês. docs/LANCAMENTO.md:25 usa US$ 5,70 (preço de Ashburn antigo, sem o multiplicador de GRU).`,
  )
  reg('premissa', 'base', '', '', '', 'fly_shared1gb_gru', shared, 'USD')
  reg('premissa', 'base', '', '', '', 'fly_perf1x2gb_gru', perf, 'USD')
}

mkdirSync(SAIDA, { recursive: true })
writeFileSync(
  join(SAIDA, 'fase3-custo.csv'),
  csv
    .map((l) => l.map((c) => (/[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
    .join('\n') + '\n',
)
writeFileSync(join(SAIDA, 'fase3-custo-tabelas.md'), md.join('\n') + '\n')
console.log(md.join('\n'))
console.log(
  `\n→ ${join(SAIDA, 'fase3-custo.csv')} (${csv.length - 1} linhas)\n→ ${join(SAIDA, 'fase3-custo-tabelas.md')}`,
)
