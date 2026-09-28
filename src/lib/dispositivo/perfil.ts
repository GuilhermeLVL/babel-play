/**
 * PERFIL DO DISPOSITIVO — o que ESTE aparelho aguenta, medido por capacidade.
 *
 * Por que não pelo User-Agent: o Meta Quest Browser, no modo padrão (desktop), anuncia
 * `X11; Linux x86_64; Quest 3` e ignora `<meta viewport>`, e a própria Meta manda não usar o UA para
 * detectar recurso (https://developers.meta.com/horizon/documentation/web/browser-specs/, 2026-07-21).
 * Uma regra "é celular?" por UA ou por `pointer: coarse` o trataria como desktop — e ofereceria o
 * áudio do sistema, que ali não existe (`getDisplayMedia` não existe no Chrome Android nem no Quest,
 * BCD). O UA só entra como PISTA quando revela `OculusBrowser`/`Quest`, e fica registrado nos motivos.
 *
 * Cinco perfis (matriz da pesquisa, `docs/pesquisa/2026-09-auditoria-seguranca-performance-dispositivos.md` §5):
 *
 *   quest            XR + sem getDisplayMedia + sem toque (ou UA OculusBrowser)
 *   celular-fraco    móvel sem adaptador WebGPU, ou `deviceMemory` ≤ 2 (iOS sem deviceMemory e sem
 *                    WebGPU conta como fraco até provar o contrário)
 *   celular-bom      móvel com adaptador WebGPU e `deviceMemory` ≥ 4 (ou ausente, iOS 26)
 *   desktop-sem-gpu  getDisplayMedia + mouse, sem adaptador WebGPU
 *   desktop-com-gpu  idem, com adaptador
 *
 * QUEM CONSOME:
 *   · `perfilDoDispositivo()` — a leitura síncrona (WebGPU pelo cache/presença da API);
 *   · `medirPerfilDoDispositivo()` — espera a resposta real do `requestAdapter()` (com prazo);
 *   · `reduzirEfeitos()` — O SINAL ÚNICO do "modo leve" para as telas e jogos (ver abaixo).
 */
import { temAdaptadorWebGpu, webGpuProvavel } from '../../gateway/adaptadorWebGpu';
import type { SondaDoAparelho } from './sonda';

export type TipoDeDispositivo = 'quest' | 'celular-fraco' | 'celular-bom' | 'desktop-sem-gpu' | 'desktop-com-gpu';

/** Os sinais crus, como o navegador os entrega. `null` = a API não existe neste navegador. */
export interface SinaisDoDispositivo {
  userAgent: string;
  /** `navigator.hardwareConcurrency` (no iOS vem limitado a 4 ou 8, contra fingerprinting). */
  nucleos: number | null;
  /** `navigator.deviceMemory` em GB (só Chromium; desde o 147 retorna 1, 2, 4 ou 8). */
  memoriaGb: number | null;
  /** `crossOriginIsolated`: sem ele não há SharedArrayBuffer, e o WASM roda em 1 thread. */
  isolado: boolean;
  /** `navigator.mediaDevices.getDisplayMedia` existe (captura de aba/tela com áudio). */
  capturaDeTela: boolean;
  /** `matchMedia('(pointer: coarse)')`. */
  ponteiroGrosso: boolean;
  /** `navigator.maxTouchPoints`. */
  toques: number;
  /** `navigator.xr` existe (WebXR). */
  temXr: boolean;
  /** `navigator.connection.saveData`. */
  economiaDeDados: boolean;
  /** `navigator.connection.effectiveType` ('slow-2g' | '2g' | '3g' | '4g'). */
  tipoDeRede: string | null;
  /** `prefers-reduced-motion: reduce`. */
  movimentoReduzido: boolean;
  /** `performance.memory.jsHeapSizeLimit` em MB (só Chromium; aproximado e não normativo). */
  memoriaDaAbaMb: number | null;
  /** Há ADAPTADOR WebGPU (não só `navigator.gpu`) — ver `adaptadorWebGpu.ts`. */
  webGpu: boolean;
}

export interface PerfilDoDispositivo {
  tipo: TipoDeDispositivo;
  /** Ligar o modo leve (reduzir efeitos) automaticamente. */
  leve: boolean;
  /**
   * Pouca memória para modelos: carregar STT e tradutor UM DE CADA VEZ e liberar os workers ao sair
   * da captura. Vale para todo móvel e Quest: a aba do iOS pode morrer perto de 0,5–1,5 GB (WebKit,
   * web-llm#386; arXiv 2605.20706) e o Quest divide 4,4/5,75 GiB com o navegador inteiro.
   */
  poucaMemoria: boolean;
  /** Threads do WASM do ONNX Runtime: 1 sem isolamento; até 4 com isolamento. */
  threadsWasm: number;
  /** O Whisper small (589 MB, só tempo real com GPU) pode ser escolhido. Só desktop com GPU. */
  permiteSmall: boolean;
  /** O navegador oferece captura do áudio do sistema/aba (getDisplayMedia). */
  capturaDoSistema: boolean;
  /**
   * Pedir confirmação antes de baixar modelos acima deste total (MB). `null` = não pedir;
   * `0` = pedir sempre (economia de dados ligada ou rede abaixo de 4g).
   */
  confirmarDownloadAcimaDeMb: number | null;
  /** Alvo interativo mínimo (px CSS): 56 no Quest (Eyes Best Practices da Meta), 48 no resto. */
  alvoMinimoPx: 48 | 56;
  /** Por que este perfil — para o relatório/diagnóstico, nunca para decidir de novo. */
  motivos: string[];
  sinais: SinaisDoDispositivo;
}

/** A escolha manual de "Modo desempenho" em Ajustes — a MESMA chave que já existia. */
export const REDUZIR_EFEITOS_KEY = 'babel.performance_mode';
/** Evento disparado na janela quando a escolha manual muda (para hooks reagirem). */
export const EVENTO_REDUZIR_EFEITOS = 'babel:reduzir-efeitos';

type NavegadorSolto = {
  userAgent?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints?: number;
  xr?: unknown;
  connection?: { saveData?: boolean; effectiveType?: string };
  mediaDevices?: { getDisplayMedia?: unknown };
};

function consulta(q: string): boolean {
  try {
    const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
    return typeof mm === 'function' ? !!mm(q)?.matches : false;
  } catch {
    return false;
  }
}

/**
 * Lê os sinais do navegador atual. `webGpu` vem de fora: síncrono (`webGpuProvavel`) ou medido
 * (`temAdaptadorWebGpu`). Nunca lança — API ausente vira `null`/`false`.
 */
export function lerSinaisDoDispositivo(webGpu: boolean): SinaisDoDispositivo {
  const g = globalThis as { navigator?: NavegadorSolto; crossOriginIsolated?: boolean; performance?: unknown };
  const nav: NavegadorSolto = g.navigator ?? {};
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const memoriaDaAbaMb = (() => {
    try {
      const limite = (g.performance as { memory?: { jsHeapSizeLimit?: number } } | undefined)?.memory?.jsHeapSizeLimit;
      return num(limite) ? Math.round((limite as number) / 1048576) : null;
    } catch {
      return null;
    }
  })();
  return {
    userAgent: String(nav.userAgent ?? ''),
    nucleos: num(nav.hardwareConcurrency),
    memoriaGb: num(nav.deviceMemory),
    isolado: g.crossOriginIsolated === true,
    capturaDeTela: typeof nav.mediaDevices?.getDisplayMedia === 'function',
    ponteiroGrosso: consulta('(pointer: coarse)'),
    toques: num(nav.maxTouchPoints) ?? 0,
    temXr: nav.xr != null,
    economiaDeDados: nav.connection?.saveData === true,
    tipoDeRede: typeof nav.connection?.effectiveType === 'string' ? nav.connection.effectiveType : null,
    movimentoReduzido: consulta('(prefers-reduced-motion: reduce)'),
    memoriaDaAbaMb,
    webGpu,
  };
}

/** A classificação pura: sinais → perfil. Testável sem navegador. */
export function classificarDispositivo(s: SinaisDoDispositivo): PerfilDoDispositivo {
  const motivos: string[] = [];
  const uaQuest = /OculusBrowser|\bQuest\b/i.test(s.userAgent);
  // Headset: tem WebXR, NÃO tem captura de tela e não tem tela de toque. Celular Android também tem
  // `navigator.xr`, mas tem toque; desktop tem getDisplayMedia.
  const capacidadeDeQuest = s.temXr && !s.capturaDeTela && s.toques === 0 && !s.ponteiroGrosso;
  const ehQuest = uaQuest || capacidadeDeQuest;
  if (uaQuest) motivos.push('UA revela OculusBrowser/Quest');
  if (capacidadeDeQuest) motivos.push('WebXR sem getDisplayMedia e sem toque');

  const movel = !ehQuest && (!s.capturaDeTela || (s.ponteiroGrosso && s.toques > 0));
  if (!s.capturaDeTela) motivos.push('sem getDisplayMedia');
  if (s.ponteiroGrosso && s.toques > 0) motivos.push(`toque (${s.toques} pontos, ponteiro grosso)`);
  motivos.push(s.webGpu ? 'adaptador WebGPU' : 'sem adaptador WebGPU');
  if (s.memoriaGb != null) motivos.push(`deviceMemory ${s.memoriaGb} GB`);
  if (!s.isolado) motivos.push('sem crossOriginIsolated (WASM em 1 thread)');

  let tipo: TipoDeDispositivo;
  if (ehQuest) tipo = 'quest';
  else if (movel) {
    const memoriaOk = s.memoriaGb == null || s.memoriaGb >= 4;
    tipo = s.webGpu && memoriaOk ? 'celular-bom' : 'celular-fraco';
  } else tipo = s.webGpu ? 'desktop-com-gpu' : 'desktop-sem-gpu';

  const desktopModesto = tipo === 'desktop-sem-gpu' && ((s.nucleos ?? 4) <= 2 || (s.memoriaGb ?? 8) <= 2);
  const leve = tipo === 'quest' || tipo === 'celular-fraco' || desktopModesto;
  const abaPequena = s.memoriaDaAbaMb != null && s.memoriaDaAbaMb < 1024;
  if (abaPequena) motivos.push(`heap da aba ${s.memoriaDaAbaMb} MB`);
  const poucaMemoria =
    tipo === 'quest' || tipo.startsWith('celular') || (s.memoriaGb != null && s.memoriaGb <= 2) || abaPequena;

  /* Teto 4 em todo perfil — o mesmo padrão que o worker já usava (`min(núcleos, 4)`). Um teto de 2 no
     celular fraco foi testado e não se sustentou: no Pixel 7 emulado o Whisper base q8 deu RTF 1,04
     com 2 threads e 1,28 com 4 (máquina compartilhada, diferença dentro do ruído) — sem evidência
     para mudar o padrão (auditoria de dispositivos, 2026-09-26). */
  const threadsWasm = s.isolado ? Math.max(1, Math.min(s.nucleos ?? 4, 4)) : 1;

  const redeLenta = s.tipoDeRede != null && s.tipoDeRede !== '4g';
  if (s.economiaDeDados) motivos.push('economia de dados ligada');
  if (redeLenta) motivos.push(`rede ${s.tipoDeRede}`);
  const confirmarDownloadAcimaDeMb =
    s.economiaDeDados || redeLenta ? 0 : tipo === 'quest' || tipo.startsWith('celular') ? 100 : null;

  return {
    tipo,
    leve,
    poucaMemoria,
    threadsWasm,
    permiteSmall: tipo === 'desktop-com-gpu',
    capturaDoSistema: s.capturaDeTela,
    confirmarDownloadAcimaDeMb,
    alvoMinimoPx: tipo === 'quest' ? 56 : 48,
    motivos,
    sinais: s,
  };
}

/** Perfil agora, sem esperar: WebGPU pelo que já se sabe (ou pela presença da API). */
export function perfilDoDispositivo(): PerfilDoDispositivo {
  return classificarDispositivo(lerSinaisDoDispositivo(webGpuProvavel()));
}

/** Perfil com a resposta REAL do `requestAdapter()` (com prazo; ver `adaptadorWebGpu.ts`). */
export async function medirPerfilDoDispositivo(): Promise<PerfilDoDispositivo> {
  return classificarDispositivo(lerSinaisDoDispositivo(await temAdaptadorWebGpu()));
}

function lerEscolhaManual(): boolean | null {
  try {
    const v = localStorage.getItem(REDUZIR_EFEITOS_KEY);
    return v === 'true' ? true : v === 'false' ? false : null;
  } catch {
    return null;
  }
}

/** A pessoa já escolheu o modo leve à mão (Ajustes → Modo desempenho)? */
export function temEscolhaManualDeEfeitos(): boolean {
  return lerEscolhaManual() !== null;
}

/**
 * O modo leve AUTOMÁTICO depois da resposta real do `requestAdapter()`: a leitura síncrona conta a API
 * WebGPU como GPU, e um celular sem adaptador só se revela fraco aqui (medido no Pixel 7 emulado: o
 * tipo virava `celular-fraco` e o modo leve ficava desligado). `null` quando há escolha manual.
 */
export async function reduzirEfeitosMedido(): Promise<boolean | null> {
  const p = await medirPerfilDoDispositivo();
  return temEscolhaManualDeEfeitos() ? null : reduzirEfeitos(p.sinais);
}

/** O modo leve ligaria SOZINHO neste aparelho (sem a escolha manual)? */
export function reduzirEfeitosAutomatico(sinais?: SinaisDoDispositivo): boolean {
  const s = sinais ?? lerSinaisDoDispositivo(webGpuProvavel());
  return classificarDispositivo(s).leve || s.movimentoReduzido;
}

/**
 * O SINAL ÚNICO DO "MODO LEVE" — para telas e jogos desligarem partículas, blur, transparências
 * pesadas, animações contínuas e o que mais custe pintura.
 *
 *   1. A escolha manual em Ajustes → "Modo desempenho" (`babel.performance_mode`) vence sempre.
 *   2. Sem escolha: liga no Quest (fill-rate, diretriz da Meta), no celular fraco, no desktop de
 *      2 núcleos/2 GB e com `prefers-reduced-motion: reduce`.
 *
 * Síncrona e barata (lê localStorage e matchMedia): pode ser chamada no render. Quem precisa
 * reagir a mudanças ouve `EVENTO_REDUZIR_EFEITOS` na janela (disparado pelo interruptor de Ajustes).
 */
export function reduzirEfeitos(sinais?: SinaisDoDispositivo): boolean {
  const manual = lerEscolhaManual();
  if (manual !== null) return manual;
  return reduzirEfeitosAutomatico(sinais);
}

/** Grava a escolha manual e avisa quem escuta. `null` apaga (volta ao automático). */
export function definirReduzirEfeitos(valor: boolean | null): void {
  try {
    if (valor === null) localStorage.removeItem(REDUZIR_EFEITOS_KEY);
    else localStorage.setItem(REDUZIR_EFEITOS_KEY, String(valor));
  } catch {
    /* sem armazenamento: vale só nesta página */
  }
  try {
    globalThis.dispatchEvent?.(new CustomEvent(EVENTO_REDUZIR_EFEITOS, { detail: reduzirEfeitos() }));
  } catch {
    /* sem janela (teste/worker) */
  }
}

/**
 * Os sinais da SONDA (`sonda.ts`) que viajam com a rota. Todos OPCIONAIS: sem sonda guardada a rota
 * é a de sempre. O `sttRouter` lê `adaptadorReal`, `shaderF16`, `gpuCaiu` e as pontuações para mandar
 * o Whisper à GPU no Quest/celular (`usarGpuNoAparelho`) e para a troca de backend do regulador.
 */
export interface CamposDaSondaNaRota {
  shaderF16?: boolean;
  /** Houve adaptador na sonda e ele não é o de reserva (software). */
  adaptadorReal?: boolean;
  /** Algum modelo foi vetado aqui por `device-lost`: a GPU deste aparelho já caiu. */
  gpuCaiu?: boolean;
  limites?: { maxStorageBufferBindingSize: number; maxBufferSize: number } | null;
  nativo?: boolean;
  sttNoAparelho?: SondaDoAparelho['sinais']['sttNoAparelho'];
  tradutorNativo?: SondaDoAparelho['sinais']['tradutorNativo'];
  iOS?: boolean;
  pontuacaoWasm?: number | null;
  pontuacaoWebgpu?: number | null;
}

/**
 * O pedaço do perfil que o roteador de STT usa (`DispositivoDaRota` em `gateway/sttRouter.ts`,
 * estrutural para não criar ciclo de import). A `sonda` é a guardada (`sondaGuardada()`); o
 * import dela aqui é SÓ de tipo — o código da sonda fica fora do chunk inicial.
 */
export function dispositivoDaRota(
  p: PerfilDoDispositivo,
  sonda?: SondaDoAparelho | null,
): {
  tipo: TipoDeDispositivo;
  permiteSmall: boolean;
  economiaDeDados: boolean;
} & CamposDaSondaNaRota {
  const base = { tipo: p.tipo, permiteSmall: p.permiteSmall, economiaDeDados: p.sinais.economiaDeDados };
  if (!sonda) return base;
  const s = sonda.sinais;
  return {
    ...base,
    shaderF16: s.webGpu?.shaderF16 ?? false,
    limites: s.webGpu?.limites ?? null,
    nativo: s.nativo,
    sttNoAparelho: s.sttNoAparelho,
    tradutorNativo: s.tradutorNativo,
    iOS: s.iOS,
    pontuacaoWasm: sonda.benchmark?.pontuacaoWasm ?? null,
    pontuacaoWebgpu: sonda.benchmark?.pontuacaoWebgpu ?? null,
    adaptadorReal: !!s.webGpu && s.webGpu.reserva !== true,
    gpuCaiu: Object.values(sonda.motivosDaProibicao ?? {}).includes('device-lost'),
  };
}

/**
 * Marca `<html data-dispositivo="quest|celular-…|desktop-…" data-modo-leve="true|false">` antes do
 * primeiro render. O CSS de `styles/dispositivo.css` (alvos de 48/56 px, texto maior no Quest) e o
 * agente de telas leem daqui. Leitura síncrona: o Quest e o celular se reconhecem sem a GPU.
 */
export function marcarDispositivoNoDocumento(raiz?: { dataset: DOMStringMap }): PerfilDoDispositivo {
  const p = perfilDoDispositivo();
  const el = raiz ?? (typeof document !== 'undefined' ? document.documentElement : undefined);
  if (el) {
    el.dataset.dispositivo = p.tipo;
    el.dataset.modoLeve = String(reduzirEfeitos(p.sinais));
    /* A leitura síncrona conta a API WebGPU como GPU; quando o `requestAdapter()` responder (a mesma
       pergunta em cache, sem custo extra), o TIPO é corrigido (ex.: celular sem adaptador → fraco).
       O modo leve não muda aqui: depois do primeiro render quem manda nele é o interruptor de Ajustes. */
    void temAdaptadorWebGpu().then(() => {
      el.dataset.dispositivo = perfilDoDispositivo().tipo;
    });
  }
  return p;
}
