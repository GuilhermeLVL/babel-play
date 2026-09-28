/**
 * SONDA DO APARELHO — o que este aparelho TEM, medido uma vez e guardado (harness adaptativo §2 e §7,
 * `openspec/audits/2026-09-28-eficiencia-ia/harness-adaptativo.md`).
 *
 * `perfil.ts` continua sendo a leitura barata e síncrona que classifica o aparelho em cinco perfis.
 * A sonda é o complemento CARO e assíncrono: perguntas que levam de dezenas de ms a segundos (o
 * adaptador WebGPU, `SpeechRecognition.available`, a presença da Translator API, a cota de disco, o
 * microbenchmark) e que não mudam de uma captura para outra. Então ela roda UMA vez e fica no
 * `localStorage` (`CHAVE_DA_SONDA`), e só é refeita quando:
 *   · a VERSÃO do app muda (um deploy pode mudar o que se pergunta ou como se lê);
 *   · a IMPRESSÃO do aparelho muda — hash dos sinais estáveis (UA, fornecedor/arquitetura do
 *     adaptador, `deviceMemory`, `hardwareConcurrency`): navegador atualizado, outra GPU, perfil
 *     do Chrome copiado para outra máquina;
 *   · passam 30 dias (o navegador ganha/perde recurso sem mudar de UA, ex.: pacote de idioma baixado).
 *
 * DETECÇÃO POR RECURSO, NUNCA POR UA — a mesma regra de `perfil.ts`. A única leitura de UA é a do
 * iOS (iPhone/iPad, e o iPad que se anuncia Mac com toque), que não tem API que o revele e importa
 * pelo teto de ~500 MB por aba do WebKit (web-llm#386).
 *
 * NUNCA LANÇA, NUNCA TRAVA: cada pergunta tem prazo (`comPrazo`); API ausente, que lança ou que
 * demora vira `null`. Rodar esta sonda na abertura do site estático é proibido (custo sem uso): ela
 * é agendada no ocioso a partir do início da captura (`agendarSondaDoAparelho`).
 *
 * MODELOS PROIBIDOS: um modelo que estourou a memória NESTE aparelho (OOM, `device.lost`) entra em
 * `modelosProibidos` por `proibirModelo(id, motivo)` e fica — atravessa a revalidação enquanto a
 * impressão for a mesma. Quem consulta é o roteador (`modeloProibido(id)`), numa tarefa futura.
 */
import { type InfoDoAdaptadorWebGpu, infoDoAdaptadorWebGpu } from '../../gateway/adaptadorWebGpu';
import { VERSAO_DO_APP } from '../versao';
import { medirBenchmark, type PontuacaoDoBenchmark } from './benchmark';

/** O estado que `SpeechRecognition.available` e `Translator.availability` devolvem. */
export type Disponibilidade = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/** Os sinais NOVOS da sonda (os antigos continuam em `SinaisDoDispositivo`, `perfil.ts`). */
export interface SinaisDaSonda {
  /** `shader-f16`, limites de buffer, fornecedor/arquitetura; `null` sem adaptador. */
  webGpu: InfoDoAdaptadorWebGpu | null;
  /** `SpeechRecognition.available({langs, processLocally: true})`: reconhecimento NO aparelho. `null` = sem a API/sem resposta. */
  sttNoAparelho: { ptBR: Disponibilidade | null; en: Disponibilidade | null };
  /**
   * A Translator API EXISTE (Chrome 138+, Edge 148+). Só a presença: o PAR não é perguntado aqui.
   * A sonda perguntava en↔pt fixo — errado para quem estuda espanhol ou japonês, e guardado por 30
   * dias enquanto o pacote é baixado no primeiro clique. A disponibilidade de cada par é consultada
   * sob demanda, para o par REAL da sessão, e lembrada na sessão (`ChromeTranslatorMt.preparar`).
   */
  tradutorNativo: boolean;
  /** `navigator.storage.estimate()` em MB: quanto cabe de modelo em cache. */
  armazenamento: { cotaMb: number; usoMb: number } | null;
  /** Rodando dentro da casca Capacitor (`Capacitor.isNativePlatform()`): há plugins nativos. */
  nativo: boolean;
  /** iPhone/iPad: teto de memória por aba do WebKit (~500 MB). */
  iOS: boolean;
  /** `navigator.getBattery` existe (só Chromium). Só a disponibilidade — o regulador lê o valor. */
  bateria: boolean;
  /** `PressureObserver` existe (Chromium desktop). Idem. */
  pressao: boolean;
}

/** O que fica no `localStorage`. `sinais: null` = só proibições gravadas, a sonda ainda não rodou. */
export interface RegistroDoAparelho {
  esquema: 1;
  versaoDoApp: string;
  impressao: string;
  medidaEm: number;
  sinais: SinaisDaSonda | null;
  benchmark: PontuacaoDoBenchmark | null;
  modelosProibidos: string[];
  motivosDaProibicao: Record<string, string>;
}

/** Uma sonda completa (com sinais). */
export type SondaDoAparelho = RegistroDoAparelho & { sinais: SinaisDaSonda };

export const CHAVE_DA_SONDA = 'babel.sondaDoAparelho';
export const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
/** Prazo de CADA pergunta da sonda (elas correm em paralelo). */
export const PRAZO_DA_PERGUNTA_MS = 1500;

/** O pedaço do `Storage` usado (injetável nos testes). */
export interface ArmazemSimples {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface DependenciasDaSonda {
  /** Onde procurar as APIs (padrão `globalThis`). */
  escopo?: unknown;
  /** Padrão `localStorage`; `null` = sem persistência. */
  armazem?: ArmazemSimples | null;
  agora?: () => number;
  versaoDoApp?: string;
  prazoMs?: number;
  infoDoAdaptador?: () => Promise<InfoDoAdaptadorWebGpu | null>;
  medirBenchmark?: (sinal?: AbortSignal) => Promise<PontuacaoDoBenchmark | null>;
}

const ESTADOS: readonly string[] = ['available', 'downloadable', 'downloading', 'unavailable'];

/**
 * Espera `f()` até `prazoMs`. Resolve `null` se lançar, rejeitar ou demorar — nunca propaga. É o
 * cinto de todas as APIs novas: `Translator.availability()` pode ficar pendente enquanto o Chrome
 * consulta o componente, e a sonda não pode segurar a captura por isso.
 */
export function comPrazo<T>(f: () => T | Promise<T>, prazoMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const relogio = setTimeout(() => resolve(null), prazoMs);
    Promise.resolve()
      .then(f)
      .then(
        (v) => resolve(v),
        () => resolve(null), // a API existe e recusou: para a sonda é o mesmo que não saber
      )
      .finally(() => clearTimeout(relogio));
  });
}

const disponibilidade = (v: unknown): Disponibilidade | null =>
  typeof v === 'string' && ESTADOS.includes(v) ? (v as Disponibilidade) : null;

type ComDisponivel = { available?: (o: { langs: string[]; processLocally: boolean }) => unknown };

/** `SpeechRecognition.available({langs:[lang], processLocally:true})` quando o método estático existe. */
export async function disponibilidadeDoSttNoAparelho(
  lang: string,
  escopo: unknown = globalThis,
  prazoMs = PRAZO_DA_PERGUNTA_MS,
): Promise<Disponibilidade | null> {
  const e = escopo as {
    SpeechRecognition?: ComDisponivel;
    webkitSpeechRecognition?: ComDisponivel;
    navigator?: { webdriver?: boolean };
  };
  /* NAVEGADOR SOB AUTOMAÇÃO NÃO PERGUNTA. No Chromium do Playwright (headless, sem o serviço de voz
     embutido) a chamada `available({processLocally})` DERRUBA a aba ("Page crashed" no e2e da
     captura, 28/09) — num Chrome 152 comum ela responde normalmente ("unavailable" sem o pacote).
     Com `webdriver` ligado não há usuário para ouvir: responder "sem resposta" é o mesmo que o
     Firefox, e a captura segue pelo caminho local de sempre. */
  if (e.navigator?.webdriver === true) return null;
  const SR = e.SpeechRecognition ?? e.webkitSpeechRecognition;
  if (typeof SR?.available !== 'function') return null;
  return disponibilidade(await comPrazo(() => SR.available!({ langs: [lang], processLocally: true }), prazoMs));
}

async function estimativaDoArmazenamento(nav: NavegadorDaSonda, prazoMs: number) {
  const estimate = nav.storage?.estimate;
  if (typeof estimate !== 'function') return null;
  const r = await comPrazo(() => estimate.call(nav.storage), prazoMs);
  const mb = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v / 1048576) : null);
  const cotaMb = mb(r?.quota);
  const usoMb = mb(r?.usage);
  return cotaMb == null || usoMb == null ? null : { cotaMb, usoMb };
}

/** iPhone/iPod/iPad pelo UA, e o iPadOS que se anuncia `Macintosh` (só ele tem toque multiponto). */
export function ehIos(userAgent: string, toques: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && toques > 1);
}

/** Casca nativa Capacitor presente E rodando como app (no navegador o objeto pode existir e dizer `false`). */
export function temPonteNativa(escopo: unknown = globalThis): boolean {
  try {
    const cap = (escopo as { Capacitor?: { isNativePlatform?: () => unknown } }).Capacitor;
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform() === true;
  } catch {
    return false; // ponte quebrada conta como ausente: o caminho web continua valendo
  }
}

type NavegadorDaSonda = {
  userAgent?: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  maxTouchPoints?: number;
  storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> };
  getBattery?: unknown;
};

const navegadorDe = (escopo: unknown): NavegadorDaSonda => (escopo as { navigator?: NavegadorDaSonda }).navigator ?? {};

/** Os sinais ESTÁVEIS que identificam o aparelho — mudou um, a sonda é refeita. */
export interface SinaisDaImpressao {
  userAgent: string;
  fornecedor: string;
  arquitetura: string;
  memoriaGb: number | null;
  nucleos: number | null;
}

/** FNV-1a 32 bits em hex. Não é segredo nem identificador para fora — só "é o mesmo aparelho?". */
export function impressaoDoAparelho(s: SinaisDaImpressao): string {
  const texto = [s.userAgent, s.fornecedor, s.arquitetura, s.memoriaGb ?? '-', s.nucleos ?? '-'].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** A sonda guardada ainda vale? Pura. */
export function registroValido(
  reg: RegistroDoAparelho,
  c: { versaoDoApp: string; impressao: string; agora: number },
): boolean {
  const idade = c.agora - reg.medidaEm;
  return (
    reg.sinais != null &&
    reg.versaoDoApp === c.versaoDoApp &&
    reg.impressao === c.impressao &&
    idade >= 0 &&
    idade < TRINTA_DIAS_MS
  );
}

function armazemPadrao(): ArmazemSimples | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // acessar `localStorage` lança com cookies bloqueados (SecurityError): sem persistência
  }
}

/** Lê o registro guardado; forma inesperada, JSON quebrado ou armazém que lança → `null`. */
export function lerRegistro(armazem: ArmazemSimples | null): RegistroDoAparelho | null {
  if (!armazem) return null;
  try {
    const cru = armazem.getItem(CHAVE_DA_SONDA);
    if (!cru) return null;
    const r = JSON.parse(cru) as Partial<RegistroDoAparelho>;
    const ok =
      r?.esquema === 1 &&
      typeof r.versaoDoApp === 'string' &&
      typeof r.impressao === 'string' &&
      typeof r.medidaEm === 'number' &&
      Array.isArray(r.modelosProibidos) &&
      typeof r.motivosDaProibicao === 'object' &&
      r.motivosDaProibicao !== null;
    return ok ? (r as RegistroDoAparelho) : null;
  } catch (erro) {
    console.warn('[sonda] registro do aparelho ilegível; será medido de novo', erro);
    return null;
  }
}

function gravarRegistro(armazem: ArmazemSimples | null, reg: RegistroDoAparelho): void {
  if (!armazem) return;
  try {
    armazem.setItem(CHAVE_DA_SONDA, JSON.stringify(reg));
  } catch (erro) {
    console.warn('[sonda] não foi possível guardar a sonda (cota/bloqueio); vale só nesta página', erro);
  }
}

function resolverDependencias(dep: DependenciasDaSonda) {
  return {
    escopo: dep.escopo ?? globalThis,
    armazem: dep.armazem === undefined ? armazemPadrao() : dep.armazem,
    agora: dep.agora ?? Date.now,
    versaoDoApp: dep.versaoDoApp ?? VERSAO_DO_APP,
    prazoMs: dep.prazoMs ?? PRAZO_DA_PERGUNTA_MS,
    infoDoAdaptador: dep.infoDoAdaptador ?? (() => infoDoAdaptadorWebGpu()),
    medirBenchmark: dep.medirBenchmark ?? ((sinal?: AbortSignal) => medirBenchmark({ sinal })),
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

async function impressaoAtual(
  escopo: unknown,
  infoDoAdaptador: () => Promise<InfoDoAdaptadorWebGpu | null>,
): Promise<{ impressao: string; gpu: InfoDoAdaptadorWebGpu | null }> {
  const nav = navegadorDe(escopo);
  const gpu = await infoDoAdaptador().catch(() => null);
  const impressao = impressaoDoAparelho({
    userAgent: String(nav.userAgent ?? ''),
    fornecedor: gpu?.fornecedor ?? '',
    arquitetura: gpu?.arquitetura ?? '',
    memoriaGb: num(nav.deviceMemory),
    nucleos: num(nav.hardwareConcurrency),
  });
  return { impressao, gpu };
}

/** Mede tudo AGORA (sem ler nem gravar). As perguntas correm em paralelo, cada uma com prazo. */
export async function sondarAparelho(dep: DependenciasDaSonda = {}): Promise<SondaDoAparelho> {
  const d = resolverDependencias(dep);
  const nav = navegadorDe(d.escopo);
  const [{ impressao, gpu }, ptBR, en, armazenamento] = await Promise.all([
    impressaoAtual(d.escopo, d.infoDoAdaptador),
    disponibilidadeDoSttNoAparelho('pt-BR', d.escopo, d.prazoMs),
    disponibilidadeDoSttNoAparelho('en-US', d.escopo, d.prazoMs),
    estimativaDoArmazenamento(nav, d.prazoMs),
  ]);
  const tradutor = (d.escopo as { Translator?: { availability?: unknown } }).Translator;
  return {
    esquema: 1,
    versaoDoApp: d.versaoDoApp,
    impressao,
    medidaEm: d.agora(),
    sinais: {
      webGpu: gpu,
      sttNoAparelho: { ptBR, en },
      tradutorNativo: typeof tradutor?.availability === 'function',
      armazenamento,
      nativo: temPonteNativa(d.escopo),
      iOS: ehIos(String(nav.userAgent ?? ''), num(nav.maxTouchPoints) ?? 0),
      bateria: typeof nav.getBattery === 'function',
      pressao: typeof d.escopo === 'object' && d.escopo !== null && 'PressureObserver' in d.escopo,
    },
    benchmark: null,
    modelosProibidos: [],
    motivosDaProibicao: {},
  };
}

/**
 * A sonda deste aparelho: a guardada se ainda vale; senão mede, herda do registro anterior do MESMO
 * aparelho as proibições e o benchmark (que tem revalidação própria) e grava.
 */
export async function obterSondaDoAparelho(dep: DependenciasDaSonda = {}): Promise<SondaDoAparelho> {
  const d = resolverDependencias(dep);
  const guardado = lerRegistro(d.armazem);
  if (guardado) {
    const { impressao } = await impressaoAtual(d.escopo, d.infoDoAdaptador);
    if (registroValido(guardado, { versaoDoApp: d.versaoDoApp, impressao, agora: d.agora() }))
      return guardado as SondaDoAparelho;
  }
  const nova = await sondarAparelho(dep);
  const mesmoAparelho = guardado?.impressao === nova.impressao;
  const sonda: SondaDoAparelho = mesmoAparelho
    ? {
        ...nova,
        benchmark: guardado.benchmark ?? null,
        modelosProibidos: guardado.modelosProibidos,
        motivosDaProibicao: guardado.motivosDaProibicao,
      }
    : nova;
  gravarRegistro(d.armazem, sonda);
  return sonda;
}

/**
 * Marca um modelo como proibido NESTE aparelho (OOM, `device.lost`, travamento medido). Grava mesmo
 * sem sonda completa: o registro nasce só com as proibições e `medidaEm: 0` (a próxima leitura mede).
 */
export async function proibirModelo(id: string, motivo: string, dep: DependenciasDaSonda = {}): Promise<void> {
  const d = resolverDependencias(dep);
  const { impressao } = await impressaoAtual(d.escopo, d.infoDoAdaptador);
  const guardado = lerRegistro(d.armazem);
  const base: RegistroDoAparelho =
    guardado?.impressao === impressao
      ? guardado
      : {
          esquema: 1,
          versaoDoApp: d.versaoDoApp,
          impressao,
          medidaEm: 0,
          sinais: null,
          benchmark: null,
          modelosProibidos: [],
          motivosDaProibicao: {},
        };
  gravarRegistro(d.armazem, {
    ...base,
    modelosProibidos: base.modelosProibidos.includes(id) ? base.modelosProibidos : [...base.modelosProibidos, id],
    motivosDaProibicao: { ...base.motivosDaProibicao, [id]: motivo },
  });
}

/** O modelo foi proibido NESTE aparelho (mesma impressão)? */
export async function modeloProibido(id: string, dep: DependenciasDaSonda = {}): Promise<boolean> {
  const d = resolverDependencias(dep);
  const guardado = lerRegistro(d.armazem);
  if (!guardado?.modelosProibidos.includes(id)) return false;
  const { impressao } = await impressaoAtual(d.escopo, d.infoDoAdaptador);
  return guardado.impressao === impressao;
}

/** O benchmark guardado ainda vale (30 dias, relógio que não voltou)? Pura. */
export function benchmarkValido(b: PontuacaoDoBenchmark | null, agora: number): boolean {
  if (!b) return false;
  const idade = agora - b.medidoEm;
  return idade >= 0 && idade < TRINTA_DIAS_MS;
}

/**
 * A sonda + o benchmark se faltar, gravados. O benchmark roda só quando o guardado venceu, e pode
 * ser cancelado pelo `sinal` (a captura precisa da GPU inteira para o modelo).
 */
export async function sondarEMedir(dep: DependenciasDaSonda = {}, sinal?: AbortSignal): Promise<SondaDoAparelho> {
  const d = resolverDependencias(dep);
  const sonda = await obterSondaDoAparelho(dep);
  if (benchmarkValido(sonda.benchmark, d.agora()) || sinal?.aborted) return sonda;
  const benchmark = await d.medirBenchmark(sinal).catch((erro: unknown) => {
    console.warn('[sonda] benchmark falhou; o aparelho fica sem pontuação até a próxima', erro);
    return null;
  });
  if (!benchmark) return sonda;
  /* Relê antes de gravar: uma proibição pode ter chegado enquanto o benchmark rodava. */
  const atual = lerRegistro(d.armazem);
  const comBench: SondaDoAparelho = {
    ...sonda,
    modelosProibidos: atual?.impressao === sonda.impressao ? atual.modelosProibidos : sonda.modelosProibidos,
    motivosDaProibicao: atual?.impressao === sonda.impressao ? atual.motivosDaProibicao : sonda.motivosDaProibicao,
    benchmark,
  };
  gravarRegistro(d.armazem, comBench);
  return comBench;
}

let emAndamento: Promise<SondaDoAparelho | null> | null = null;

/**
 * Agenda a sonda (e o benchmark, se faltar) para o OCIOSO — `requestIdleCallback` com teto de 5 s,
 * ou um temporizador onde ele não existe (Safari). Uma execução por página; as chamadas seguintes
 * recebem a mesma promessa. Nunca rejeita. Chamada do início da captura (`pipelineDeFala.ts`), por
 * `import()` — nunca na abertura do site.
 */
export function agendarSondaDoAparelho(sinal?: AbortSignal): Promise<SondaDoAparelho | null> {
  if (emAndamento) return emAndamento;
  emAndamento = new Promise<void>((resolve) => {
    const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => unknown };
    if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(() => resolve(), { timeout: 5000 });
    else setTimeout(resolve, 1000);
  })
    .then(() => sondarEMedir({}, sinal))
    .catch((erro: unknown) => {
      console.warn('[sonda] a sonda do aparelho falhou; o roteamento segue sem ela', erro);
      return null;
    });
  return emAndamento;
}

/** A sonda guardada, sem medir nada (para a rota da captura não esperar pela sonda). */
export async function sondaGuardada(dep: DependenciasDaSonda = {}): Promise<SondaDoAparelho | null> {
  const d = resolverDependencias(dep);
  const guardado = lerRegistro(d.armazem);
  if (!guardado) return null;
  const { impressao } = await impressaoAtual(d.escopo, d.infoDoAdaptador);
  return registroValido(guardado, { versaoDoApp: d.versaoDoApp, impressao, agora: d.agora() })
    ? (guardado as SondaDoAparelho)
    : null;
}
