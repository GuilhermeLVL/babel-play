/**
 * A BOCA DO AVATAR SEM VISEMAS REAIS: texto + idioma viram uma linha do tempo de vogais (A, E, I, O, U) e pausas
 * (F = boca fechada), por regras de grafema, e a linha é AMARRADA ao que o motor de voz de fato disse.
 *
 * Por que texto e não áudio: o `speechSynthesis` não entrega o áudio nem visemas. Sabemos o texto, a velocidade e,
 * às vezes, onde a voz está (`boundary` com `charIndex`). Então:
 *  1. `montarLinhaDaBoca` estima quando cada sílaba cai (plano B por relógio, sem nenhum evento);
 *  2. `ancorarLinha` re-amarra o resto da linha quando chega um evento real (`boundary`), sem confiar nele
 *     cegamente (o Chrome não dispara `boundary` com vozes de rede e pode disparar fora de ordem);
 *  3. `avancarAte(linha, tMs)` lê a pose da boca num instante, sem estado oculto (a linha é imutável e as
 *     funções são puras: o relógio é de quem chama).
 *
 * NUNCA se assume a unidade de `elapsedTime` do `boundary` (segundos no padrão, milissegundos em alguns
 * navegadores): o tempo vem do relógio de quem chama, medido em `start`/`boundary`/`end`.
 *
 * Limites assumidos (documentados, não escondidos): é uma ESTIMATIVA de ritmo (a mesma ordem das regras do
 * TalkingHead, ~80%); não reconhece a vogal que a voz realmente pronunciou, só a que o texto sugere.
 * Ponto de extensão: um perfil de `wlipsync` validado em pt-BR poderia substituir a vogal (não a abertura) em
 * `src/lib/avatar/fala.ts`; sem perfil validado, não é usado.
 *
 * Pureza: sem DOM, sem rede, sem React.
 */

export type Vogal = 'A' | 'E' | 'I' | 'O' | 'U' | 'F';
export const VOGAIS_DA_BOCA: readonly Vogal[] = ['A', 'E', 'I', 'O', 'U', 'F'];

/** Uma sílaba (ou uma pausa) da linha: cobre os caracteres UTF-16 `[c0, c1)` e o intervalo `[t0, t1)` em ms. */
export interface UnidadeDaBoca {
  readonly c0: number;
  readonly c1: number;
  readonly vogal: Vogal;
  /** Quanto a boca abre no pico (0..1). Pausa: 0. */
  readonly pico: number;
  /** Peso relativo da duração (o ritmo estimado). */
  readonly peso: number;
  readonly t0: number;
  readonly t1: number;
}

export interface LinhaDaBoca {
  readonly unidades: readonly UnidadeDaBoca[];
  /** Instante (ms desde o `start`) em que a fala acaba. */
  readonly duracaoMs: number;
  /** `true` quando a duração veio de fora (áudio com duração conhecida), não da estimativa. */
  readonly duracaoFixa: boolean;
  /** Ritmo atual: ms por unidade de peso (muda a cada âncora aceita). */
  readonly msPorPeso: number;
  readonly velocidade: number;
  /** Última âncora aceita (evento real). */
  readonly ancora: { readonly charIndex: number; readonly tMs: number } | null;
}

export interface PoseDaBoca {
  readonly vogal: Vogal;
  /** 0 (fechada) a 1 (aberta no máximo). */
  readonly abertura: number;
  /** `true` quando o instante passou do fim da linha. */
  readonly acabou: boolean;
}

export interface EntradaDaBoca {
  texto: string;
  /** BCP-47 ou código curto (`pt-BR`, `es`, `en-US`, `ar`...). */
  idioma: string;
  /** Duração real da fala quando conhecida (áudio já decodificado). */
  duracaoMs?: number;
  /** Velocidade da fala (`rate`); fora de 0,5–2,5 é limitada. */
  velocidade: number;
}

export const VELOCIDADE_MIN = 0.5;
export const VELOCIDADE_MAX = 2.5;
/** Teto de caracteres lidos: um texto maior que isto é cortado (a boca de 20 mil letras não vale o custo). */
export const TETO_DE_CARACTERES = 20_000;

/** Duração-base de uma sílaba a velocidade 1 (~5,3 sílabas/s, a fala corrente). */
const MS_POR_SILABA = 190;
const PAUSA_VIRGULA = 180;
const PAUSA_PONTO = 380;
const PAUSA_QUEBRA = 300;

/** Abertura de pico por vogal (A abre mais; I e U, menos). */
const PICO: Record<Vogal, number> = { A: 1, E: 0.7, O: 0.8, U: 0.45, I: 0.4, F: 0 };

export const limitarVelocidade = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(VELOCIDADE_MAX, Math.max(VELOCIDADE_MIN, v)) : 1;

/* ─────────────────────────── a tabela grafema → vogal ─────────────────────────── */

const ACENTUADAS: Record<string, Vogal> = {
  á: 'A',
  à: 'A',
  â: 'A',
  ã: 'A',
  ä: 'A',
  å: 'A',
  é: 'E',
  è: 'E',
  ê: 'E',
  ë: 'E',
  í: 'I',
  ì: 'I',
  î: 'I',
  ï: 'I',
  ó: 'O',
  ò: 'O',
  ô: 'O',
  õ: 'O',
  ö: 'O',
  ú: 'U',
  ù: 'U',
  û: 'U',
  ü: 'U',
};
const SIMPLES: Record<string, Vogal> = { a: 'A', e: 'E', i: 'I', o: 'O', u: 'U', y: 'I' };

const vogalDeLetra = (c: string): Vogal | null => ACENTUADAS[c] ?? SIMPLES[c] ?? null;

/** Dígito → vogal de como se diz (pt: zero, um, dois, três, quatro, cinco, seis, sete, oito, nove). */
const DIGITO: Record<string, Vogal> = {
  '0': 'E',
  '1': 'U',
  '2': 'O',
  '3': 'E',
  '4': 'A',
  '5': 'I',
  '6': 'E',
  '7': 'E',
  '8': 'O',
  '9': 'O',
};

/** Letras longas de vogal da escrita árabe; o resto das letras é consoante. */
const ARABE_VOGAL: Record<string, Vogal> = { ا: 'A', و: 'U', ي: 'I', ى: 'A', آ: 'A' };
const CICLO_SEM_VOGAL: readonly Vogal[] = ['A', 'O', 'E', 'U', 'I'];

/** A vogal que domina um grupo de vogais consecutivas ("ão", "ei", "ea", "ou"). */
function vogalDoGrupo(grupo: string, lingua: string): Vogal {
  if (lingua === 'en') {
    if (/oo|ew|ue/.test(grupo)) return 'U';
    if (/ee|ea|ie/.test(grupo)) return 'I';
    if (/ou|ow/.test(grupo)) return 'A';
  }
  let fraca: Vogal | null = null;
  for (const ch of grupo) {
    const v = vogalDeLetra(ch);
    if (!v) continue;
    if (v === 'A' || v === 'E' || v === 'O') return v;
    fraca = v;
  }
  return fraca ?? 'A';
}

const linguaDe = (idioma: string): string => (idioma || '').toLowerCase().split(/[-_]/)[0] || 'pt';

const ehLetraLatina = (ch: string): boolean => /\p{Script=Latin}/u.test(ch);
const ehLetra = (ch: string): boolean => /\p{L}/u.test(ch);
const ehPictografico = (ch: string): boolean => /\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️/u.test(ch);
const ehSilabaPorLetra = (ch: string): boolean =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch);
const ehMarcaDeVogalArabe = (ch: string): boolean => /[ً-ٰٟ]/.test(ch);

interface Bruto {
  c0: number;
  c1: number;
  vogal: Vogal;
  peso: number;
}

/**
 * Passo 1: o texto em sílabas/pausas SEM tempo. Cada unidade cobre os caracteres desde o fim da anterior até o
 * seu fim, então uma palavra inteira (consoantes de ataque incluídas) pertence às suas sílabas, e o `charIndex`
 * de um `boundary` (início de palavra) cai na primeira sílaba dela. Os índices são UTF-16, como os do navegador.
 */
function dividir(texto: string, idioma: string): Bruto[] {
  const lingua = linguaDe(idioma);
  const linguaDoTexto = lingua;
  const texto2 = texto.length > TETO_DE_CARACTERES ? texto.slice(0, TETO_DE_CARACTERES) : texto;
  const saida: Bruto[] = [];
  let inicio = 0; // início da unidade em formação
  let offset = 0; // posição UTF-16 do caractere atual
  let grupo = ''; // vogais latinas consecutivas
  let grupoFim = 0;
  let semVogal = 0; // letras de escrita sem vogal (árabe, hebraico...) acumuladas
  let ciclo = 0;

  const fecharGrupo = () => {
    if (!grupo) return;
    saida.push({ c0: inicio, c1: grupoFim, vogal: vogalDoGrupo(grupo, lingua), peso: 1 });
    inicio = grupoFim;
    grupo = '';
  };
  /** Fecha o grupo de vogais; "e" mudo no fim de palavra inglesa depois de consoante ("make") vira parte da sílaba anterior. */
  const fecharComRegraDoE = (fimDePalavra: boolean) => {
    const ult = saida[saida.length - 1];
    if (
      linguaDoTexto === 'en' &&
      fimDePalavra &&
      grupo === 'e' &&
      ult &&
      ult.vogal !== 'F' &&
      grupoFim - 1 > ult.c1 &&
      /^\p{L}*$/u.test(texto2.slice(ult.c1, grupoFim - 1))
    ) {
      ult.c1 = grupoFim;
      inicio = grupoFim;
      grupo = '';
    } else fecharGrupo();
  };
  const fecharSemVogal = (ate: number) => {
    if (semVogal === 0) return;
    saida.push({ c0: inicio, c1: ate, vogal: CICLO_SEM_VOGAL[ciclo++ % CICLO_SEM_VOGAL.length], peso: 1 });
    inicio = ate;
    semVogal = 0;
  };
  const pausa = (ate: number, ms: number) => {
    fecharGrupo();
    fecharSemVogal(offset);
    saida.push({ c0: inicio, c1: ate, vogal: 'F', peso: ms / MS_POR_SILABA });
    inicio = ate;
  };

  const chars = Array.from(texto2);
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const prox = offset + ch.length;
    const minuscula = ch.toLowerCase();
    const vogal = ehLetraLatina(ch) ? vogalDeLetra(minuscula) : null;

    // "qu"/"gu" antes de e/i: o u é mudo (português e espanhol).
    const mudo =
      vogal === 'U' && lingua !== 'en' && /[qg]/i.test(chars[i - 1] ?? '') && /[eéêiíy]/i.test(chars[i + 1] ?? '');

    if (vogal && !mudo) {
      if (!grupo) fecharSemVogal(offset);
      grupo += minuscula;
      grupoFim = prox;
    } else {
      if (grupo) fecharComRegraDoE(!ehLetra(ch));
      if (ehPictografico(ch)) {
        // emoji: não se fala; fica dentro da unidade seguinte sem somar tempo
      } else if (DIGITO[ch]) {
        fecharSemVogal(offset);
        saida.push({ c0: inicio, c1: prox, vogal: DIGITO[ch], peso: 1.15 });
        inicio = prox;
      } else if (ARABE_VOGAL[ch]) {
        fecharSemVogal(offset);
        saida.push({ c0: inicio, c1: prox, vogal: ARABE_VOGAL[ch], peso: 1 });
        inicio = prox;
      } else if (ehMarcaDeVogalArabe(ch)) {
        // sinal de vogal curta: sem peso próprio
      } else if (ehLetra(ch) && ehSilabaPorLetra(ch)) {
        fecharSemVogal(offset);
        saida.push({ c0: inicio, c1: prox, vogal: CICLO_SEM_VOGAL[ciclo++ % CICLO_SEM_VOGAL.length], peso: 1 });
        inicio = prox;
      } else if (ehLetra(ch) && !ehLetraLatina(ch)) {
        // escrita sem vogal (árabe, hebraico, tailandês...): uma sílaba estimada a cada 2 letras
        semVogal += 1;
        if (semVogal >= 2) fecharSemVogal(prox);
      } else if (/[,;:،؛、]/.test(ch)) {
        pausa(prox, PAUSA_VIRGULA);
      } else if (/[.!?…؟。]/.test(ch)) {
        // "?!" ou "..." seguidos contam uma pausa só
        if (!/[.!?…؟。]/.test(chars[i + 1] ?? '')) pausa(prox, PAUSA_PONTO);
      } else if (ch === '\n') {
        pausa(prox, PAUSA_QUEBRA);
      }
      // espaço, aspas, hífen, consoantes latinas: sem tempo (entram no intervalo da próxima unidade)
    }
    offset = prox;
  }
  if (grupo) fecharComRegraDoE(true);
  fecharSemVogal(offset);
  return saida;
}

/** Passo 2: dá tempo às unidades a partir dos pesos. */
function cronometrar(brutos: readonly Bruto[], msPorPeso: number, t0 = 0): UnidadeDaBoca[] {
  let t = t0;
  return brutos.map((b) => {
    const dur = b.peso * msPorPeso;
    const u: UnidadeDaBoca = {
      c0: b.c0,
      c1: b.c1,
      vogal: b.vogal,
      pico: PICO[b.vogal],
      peso: b.peso,
      t0: t,
      t1: t + dur,
    };
    t += dur;
    return u;
  });
}

const somaDosPesos = (b: readonly { peso: number }[]): number => b.reduce((s, u) => s + u.peso, 0);

export function montarLinhaDaBoca(entrada: EntradaDaBoca): LinhaDaBoca {
  const velocidade = limitarVelocidade(entrada.velocidade);
  const brutos = dividir(typeof entrada.texto === 'string' ? entrada.texto : '', entrada.idioma);
  const pesoTotal = somaDosPesos(brutos);
  const fixa =
    typeof entrada.duracaoMs === 'number' &&
    Number.isFinite(entrada.duracaoMs) &&
    entrada.duracaoMs > 0 &&
    pesoTotal > 0;
  const msPorPeso = fixa ? (entrada.duracaoMs as number) / pesoTotal : MS_POR_SILABA / velocidade;
  const unidades = cronometrar(brutos, msPorPeso);
  return {
    unidades,
    duracaoMs: unidades.length ? unidades[unidades.length - 1].t1 : 0,
    duracaoFixa: fixa,
    msPorPeso,
    velocidade,
    ancora: null,
  };
}

/* ─────────────────────────── sincronização com eventos reais ─────────────────────────── */

const FATOR_MIN = 0.5;
const FATOR_MAX = 2;

/**
 * Um evento real disse "a voz está em `charIndex` agora (`tMs` desde o `start`)". Devolve uma linha NOVA em que
 * a unidade daquele caractere começa em `tMs` e o resto é re-esticado:
 *  · duração conhecida: o resto se encaixa no que falta até o fim;
 *  · senão: o ritmo OBSERVADO (tempo real / tempo estimado até aqui) é aplicado ao resto.
 * O fator é limitado a [0,5; 2] para um `boundary` ruim não entortar a fala. Evento fora de ordem (índice ou
 * tempo para trás da âncora anterior), valor inválido ou `charIndex` além do texto: ignorado (a mesma linha).
 */
export function ancorarLinha(linha: LinhaDaBoca, charIndex: number, tMs: number): LinhaDaBoca {
  if (!Number.isFinite(charIndex) || !Number.isFinite(tMs) || charIndex < 0 || tMs < 0) return linha;
  const un = linha.unidades;
  if (un.length === 0) return linha;
  if (linha.ancora && (charIndex < linha.ancora.charIndex || tMs < linha.ancora.tMs)) return linha;
  const k = un.findIndex((u) => u.c1 > charIndex);
  if (k < 0) return linha; // além do texto

  const estimadoAteK = un[k].t0;
  const resto = un.slice(k);
  const pesoResto = somaDosPesos(resto);
  if (pesoResto <= 0) return linha;

  let msPorPesoResto: number;
  if (linha.duracaoFixa) {
    msPorPesoResto = Math.max(0, linha.duracaoMs - tMs) / pesoResto;
  } else {
    const fator = estimadoAteK > 0 ? Math.min(FATOR_MAX, Math.max(FATOR_MIN, tMs / estimadoAteK)) : 1;
    msPorPesoResto = linha.msPorPeso * fator;
  }
  if (!Number.isFinite(msPorPesoResto) || msPorPesoResto < 0) return linha;

  // O que veio antes é reescalado para terminar exatamente em tMs; o resto recomeça dali.
  const escalaAntes = estimadoAteK > 0 ? tMs / estimadoAteK : 0;
  const antes = un.slice(0, k).map((u) => ({ ...u, t0: u.t0 * escalaAntes, t1: u.t1 * escalaAntes }));
  const depois = cronometrar(resto, msPorPesoResto, tMs);
  const unidades = [...antes, ...depois];
  return {
    ...linha,
    unidades,
    duracaoMs: unidades[unidades.length - 1].t1,
    msPorPeso: msPorPesoResto,
    ancora: { charIndex, tMs },
  };
}

/** `end` real: a fala acabou em `tMs`. O que sobrar da linha depois dele é cortado. */
export function encerrarLinha(linha: LinhaDaBoca, tMs: number): LinhaDaBoca {
  if (!Number.isFinite(tMs) || tMs < 0) return linha;
  const unidades = linha.unidades.filter((u) => u.t0 < tMs).map((u) => (u.t1 > tMs ? { ...u, t1: tMs } : u));
  return { ...linha, unidades, duracaoMs: tMs };
}

const FECHADA: PoseDaBoca = { vogal: 'F', abertura: 0, acabou: false };

/**
 * A pose da boca em `tMs` desde o `start`. Pura: o mesmo `(linha, tMs)` dá sempre a mesma pose. Dentro de uma
 * sílaba a abertura sobe e desce (piso de 35% do pico enquanto a sílaba dura); pausa e fora da linha: fechada.
 */
export function avancarAte(linha: LinhaDaBoca, tMs: number): PoseDaBoca {
  const un = linha.unidades;
  if (un.length === 0) return { ...FECHADA, acabou: true };
  if (!Number.isFinite(tMs) || tMs < 0) return FECHADA;
  if (tMs >= linha.duracaoMs) return { ...FECHADA, acabou: true };
  let lo = 0;
  let hi = un.length - 1;
  while (lo < hi) {
    const meio = (lo + hi + 1) >> 1;
    if (un[meio].t0 <= tMs) lo = meio;
    else hi = meio - 1;
  }
  const u = un[lo];
  if (u.vogal === 'F' || tMs >= u.t1) return FECHADA;
  const dur = u.t1 - u.t0;
  const frac = dur > 0 ? (tMs - u.t0) / dur : 0;
  const envelope = 0.35 + 0.65 * Math.sin(Math.PI * frac);
  return { vogal: u.vogal, abertura: Math.min(1, Math.max(0, u.pico * envelope)), acabou: false };
}

/* ─────────────────────────── suavização ─────────────────────────── */

/** Constantes de tempo (ms) de ataque (abrir) e soltura (fechar) da boca. */
export const ATAQUE_MS = 45;
export const SOLTURA_MS = 90;

/**
 * Suavização exponencial assimétrica: `atual` anda até `alvo` em `dtMs`. Abre depressa (ataque) e fecha mais
 * devagar (soltura). `dtMs` inválido ou <= 0: não mexe. Constante <= 0: salta ao alvo.
 */
export function suavizar(
  atual: number,
  alvo: number,
  dtMs: number,
  ataqueMs = ATAQUE_MS,
  solturaMs = SOLTURA_MS,
): number {
  if (!Number.isFinite(atual)) atual = 0;
  if (!Number.isFinite(alvo)) return atual;
  if (!Number.isFinite(dtMs) || dtMs <= 0) return atual;
  const tau = alvo > atual ? ataqueMs : solturaMs;
  if (tau <= 0) return alvo;
  return atual + (alvo - atual) * (1 - Math.exp(-dtMs / tau));
}

/* ─────────────────────────── amplitude (voz em áudio) ─────────────────────────── */

/** RMS (0..1) de amostras de domínio do tempo do `AnalyserNode.getByteTimeDomainData` (silêncio = 128). */
export function rmsDeBytes(amostras: ArrayLike<number>): number {
  const n = amostras.length;
  if (n === 0) return 0;
  let soma = 0;
  for (let i = 0; i < n; i += 1) {
    const v = (amostras[i] - 128) / 128;
    soma += v * v;
  }
  return Math.sqrt(soma / n);
}

/** Piso: abaixo disto a boca fica fechada (ruído de fundo e dither). */
export const PISO_DE_AMPLITUDE = 0.02;

/** RMS → abertura (0..1): zona morta no piso e curva suave, saturando perto de 0,25 de RMS (fala em volume normal). */
export function aberturaDaAmplitude(rms: number): number {
  if (!Number.isFinite(rms) || rms <= PISO_DE_AMPLITUDE) return 0;
  const x = Math.min(1, (rms - PISO_DE_AMPLITUDE) / 0.23);
  return Math.pow(x, 0.7);
}

/* ─────────────────────────── saída para o VRM ─────────────────────────── */

/** Nomes das expressões de vogal predefinidas do VRM 1.0. */
export type ExpressaoDeVogal = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';
export const EXPRESSOES_DE_VOGAL: readonly ExpressaoDeVogal[] = ['aa', 'ih', 'ou', 'ee', 'oh'];
const EXPRESSAO_DA_VOGAL: Record<Exclude<Vogal, 'F'>, ExpressaoDeVogal> = {
  A: 'aa',
  E: 'ee',
  I: 'ih',
  O: 'oh',
  U: 'ou',
};

/** Pesos 0..1 das cinco expressões de vogal para uma pose. `simples`: só `aa` (boca de tier fraco). */
export function pesosDaBoca(pose: PoseDaBoca, simples = false): Record<ExpressaoDeVogal, number> {
  const pesos: Record<ExpressaoDeVogal, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  const a = Math.min(1, Math.max(0, Number.isFinite(pose.abertura) ? pose.abertura : 0));
  if (pose.vogal === 'F' || a === 0) return pesos;
  if (simples) pesos.aa = a * 0.9;
  else pesos[EXPRESSAO_DA_VOGAL[pose.vogal]] = a;
  return pesos;
}
