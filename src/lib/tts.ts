/**
 * Síntese de voz (TTS) compartilhada. Usa a `speechSynthesis` nativa do navegador
 * (offline, grátis) — antes cada tela tinha seu próprio `speechSynthesis.speak`, e
 * o `speakWord` do LiveCapture fixava `lang='en-US'`. Centraliza a escolha de voz
 * por idioma (padrão do Reading.tsx) e deixa um SEAM para uma voz neural (nuvem)
 * ser plugada depois, atrás de consentimento — sem nada fabricado agora.
 */
import { play } from './soundFx';

export interface SpeakOptions {
  /** BCP-47 do texto (ex.: 'en-US'). Determina a voz e a pronúncia. */
  lang?: string;
  rate?: number;
  pitch?: number;
  /** Nome exato de uma voz instalada (sobrepõe a escolha automática). */
  voiceName?: string;
  /**
   * Ciclo de vida da fala. Quem oferece transporte (tocar/pausar) PRECISA disto: `speechSynthesis`
   * é global e não avisa ninguém quando a fala termina — sem estes callbacks o botão fica preso em
   * "pausar" depois que o áudio já acabou.
   */
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export interface TtsEngine {
  speak(text: string, opts?: SpeakOptions): void;
  cancel(): void;
  /**
   * Transporte. OPCIONAIS de propósito: o SEAM permite plugar um motor neural (nuvem) que talvez
   * não saiba pausar. Quem chama usa `pauseSpeech()`/`isSpeaking()`, que degradam sem quebrar.
   */
  pause?(): void;
  resume?(): void;
  isSpeaking?(): boolean;
  isPaused?(): boolean;
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// ───────── Guarda ANTI-ECO da captura ─────────
// O TTS sai pelos alto-falantes e a captura do SISTEMA (WASAPI/aba/loopback) o ouve de
// volta: clicar numa palavra para ouvir a pronúncia gerava uma "fala" nova, transcrita e
// traduzida — poluição em loop. Este relógio global diz "o app está falando agora (ou
// acabou de falar)" para o pipeline de captura DESCARTAR o próprio eco.
let ttsActiveCount = 0;
let ttsLastEndTs = 0;
function markTtsStart(): void { ttsActiveCount++; }
function markTtsEnd(): void { ttsActiveCount = Math.max(0, ttsActiveCount - 1); ttsLastEndTs = performance.now(); }

/**
 * true enquanto o TTS fala e por `tailMs` depois do fim (o eco chega com atraso de
 * buffer/decodificação). Consumido pelo LiveCapture para suprimir o próprio áudio.
 */
export function isTtsActive(tailMs = 800): boolean {
  if (ttsActiveCount > 0) return true;
  return ttsLastEndTs > 0 && performance.now() - ttsLastEndTs < tailMs;
}

// Cache de vozes: `getVoices()` costuma vir vazio no 1º acesso e popular via
// 'voiceschanged'. Usamos addEventListener (não onvoiceschanged=) para não
// clobber o handler que o Reading.tsx registra.
let voiceCache: SpeechSynthesisVoice[] = [];
function refreshVoices(): void {
  if (isTtsSupported()) voiceCache = window.speechSynthesis.getVoices();
}
if (isTtsSupported()) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!voiceCache.length) refreshVoices();
  return voiceCache;
}

/** Melhor voz instalada para um idioma; prefere vozes "Natural/Neural" quando há. */
export function pickVoice(lang: string, preferredName?: string): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (!voices.length) return null;
  if (preferredName) {
    const named = voices.find(v => v.name === preferredName);
    if (named) return named;
  }
  const want = (lang || '').toLowerCase();
  const base = want.split('-')[0];
  const inLang = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  return (
    // 1) região exata + neural   2) região exata   3) mesmo idioma + neural   4) mesmo idioma
    voices.find(v => inLang(v) === want && isNeuralVoice(v)) ||
    voices.find(v => inLang(v) === want) ||
    voices.find(v => inLang(v).startsWith(base) && isNeuralVoice(v)) ||
    voices.find(v => inLang(v).startsWith(base)) ||
    null
  );
}

// ─────────────────────── Catálogo de vozes (para os seletores) ───────────────────────

/**
 * A voz é de alta qualidade? No Windows/Chrome as "Microsoft ... Natural" e as "Google ..." são
 * nitidamente melhores que as SAPI legadas — e a UI antiga as escondia. Heurística de NOME porque a
 * Web Speech API não expõe nenhum campo de qualidade.
 */
export function isNeuralVoice(v: SpeechSynthesisVoice): boolean {
  return /natural|neural|online|google|premium|enhanced/i.test(v.name);
}

export interface VoiceInfo {
  name: string;
  lang: string;
  /** ISO-639-1 ('pt', 'en'…). */
  base: string;
  /** Roda no dispositivo (offline). `false` = voz de rede (precisa de internet). */
  local: boolean;
  /** Provável voz de alta qualidade (Natural/Neural/Google). */
  neural: boolean;
}

function toInfo(v: SpeechSynthesisVoice): VoiceInfo {
  const lang = v.lang.replace('_', '-');
  return {
    name: v.name,
    lang,
    base: lang.toLowerCase().split('-')[0],
    local: v.localService,
    neural: isNeuralVoice(v),
  };
}

/**
 * TODAS as vozes instaladas, agrupadas por idioma (ISO-639-1) e ordenadas por qualidade provável.
 * Antes o seletor filtrava só `en`/`pt` e escondia dezenas de vozes que o usuário já tem no SO —
 * era a principal causa de "poucas vozes / voz ruim".
 */
export function voicesByLang(): Map<string, VoiceInfo[]> {
  const out = new Map<string, VoiceInfo[]>();
  for (const v of getVoices()) {
    const info = toInfo(v);
    const list = out.get(info.base) ?? [];
    list.push(info);
    out.set(info.base, list);
  }
  for (const list of out.values()) {
    // Neural primeiro; depois locais (offline); depois alfabética.
    list.sort((a, b) =>
      Number(b.neural) - Number(a.neural) ||
      Number(b.local) - Number(a.local) ||
      a.name.localeCompare(b.name));
  }
  return out;
}

/** Vozes de um idioma específico (aceita 'pt' ou 'pt-BR'), já ordenadas por qualidade. */
export function voicesFor(lang: string): VoiceInfo[] {
  const base = (lang || '').toLowerCase().split('-')[0];
  return voicesByLang().get(base) ?? [];
}

/** Idiomas (ISO-639-1) que realmente têm voz instalada NESTE computador. */
export function voiceLangs(): string[] {
  return [...voicesByLang().keys()].sort();
}

/** Existe alguma voz para este idioma? Usado para avisar antes de tentar narrar. */
export function hasVoiceFor(lang: string): boolean {
  return voicesFor(lang).length > 0;
}

// ─────────────────── Voz preferida POR IDIOMA (compartilhada por toda a app) ───────────────────

/**
 * O usuário escolhe a voz no narrador (Leitura). Essa escolha vale para a APP INTEIRA: clicar numa
 * palavra na Captura, na Análise, no Estudo ou nas Métricas deve pronunciar com a MESMA voz que ele
 * está ouvindo no narrador — e no idioma certo.
 *
 * A preferência é por IDIOMA (chave ISO-639-1), não global: uma voz só não serve, porque a app
 * alterna de idioma (original ↔ tradução, e o modo Auto muda de frase para frase).
 *
 * Antes isto vivia só no localStorage do Reading.tsx e as outras telas não enxergavam — cada uma
 * pronunciava com a voz padrão do SO. Agora mora aqui, e o `speak()` resolve sozinho.
 */
const VOICE_PREFS_KEY = 'babel_voice_prefs';

function readPrefs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(VOICE_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getVoicePrefs(): Record<string, string> {
  return readPrefs();
}

/** Voz preferida para um idioma (aceita 'pt' ou 'pt-BR'). */
export function getVoicePref(lang: string): string | undefined {
  return readPrefs()[(lang || '').toLowerCase().split('-')[0]];
}

/** Define a voz preferida de um idioma. `voiceName` vazio = volta ao automático. */
export function setVoicePref(lang: string, voiceName: string): void {
  const base = (lang || '').toLowerCase().split('-')[0];
  if (!base) return;
  const prefs = readPrefs();
  if (voiceName) prefs[base] = voiceName;
  else delete prefs[base];
  try {
    localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(prefs));
    // Barramento de reatividade (mesmo padrão do layoutStore) — as telas abertas se atualizam.
    window.dispatchEvent(new CustomEvent('babel_voice_prefs_changed', { detail: prefs }));
  } catch { /* storage cheio/bloqueado — a fala continua funcionando, só não persiste */ }
}

/** Escuta mudanças na preferência de voz. Devolve o unsubscribe. */
export function onVoicePrefsChange(cb: (prefs: Record<string, string>) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail ?? readPrefs());
  window.addEventListener('babel_voice_prefs_changed', handler);
  return () => window.removeEventListener('babel_voice_prefs_changed', handler);
}

class NativeTts implements TtsEngine {
  speak(text: string, opts: SpeakOptions = {}): void {
    if (!text || !text.trim() || !isTtsSupported()) return;
    const synth = window.speechSynthesis;
    synth.cancel(); // interrompe a fala anterior (não sobrepõe)
    // Quirk do Chrome: `cancel()` não limpa o flag `paused`. Se alguém pausou e depois pediu uma
    // fala nova, ela nasceria muda. Destrava a fila antes de enfileirar a próxima.
    if (synth.paused) synth.resume();
    const u = new SpeechSynthesisUtterance(text);
    const lang = opts.lang || 'en-US';
    u.lang = lang;
    if (opts.rate) u.rate = opts.rate;
    if (opts.pitch) u.pitch = opts.pitch;
    // Sem `voiceName` explícito, herda a voz que o usuário escolheu para ESTE idioma no narrador.
    // É isto que faz clicar numa palavra (em qualquer tela) soar com a mesma voz do narrador.
    const voice = pickVoice(lang, opts.voiceName ?? getVoicePref(lang));
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.onstart = () => { markTtsStart(); opts.onStart?.(); };
    u.onend = () => { markTtsEnd(); opts.onEnd?.(); };
    u.onerror = () => { markTtsEnd(); opts.onError?.(); };
    synth.speak(u);
  }
  cancel(): void {
    if (isTtsSupported()) window.speechSynthesis.cancel();
    // O Chrome nem sempre dispara onend após cancel() — zera o relógio anti-eco na mão.
    ttsActiveCount = 0;
    ttsLastEndTs = performance.now();
  }
  pause(): void {
    // Só faz sentido pausar o que está falando — pausar a fila vazia deixa o motor travado.
    if (isTtsSupported() && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
    }
  }
  resume(): void {
    if (isTtsSupported() && window.speechSynthesis.paused) window.speechSynthesis.resume();
  }
  isSpeaking(): boolean {
    return isTtsSupported() && window.speechSynthesis.speaking;
  }
  isPaused(): boolean {
    return isTtsSupported() && window.speechSynthesis.paused;
  }
}

export const nativeTts: TtsEngine = new NativeTts();

// SEAM: hoje o motor é o nativo; `setTtsEngine` permite trocar por um NeuralTts
// (nuvem) no futuro sem tocar em quem chama `speak()`.
let engine: TtsEngine = nativeTts;
export function setTtsEngine(e: TtsEngine): void {
  engine = e;
}

export function speak(text: string, opts?: SpeakOptions): void {
  /* Um blip curto ANTES da fala, para o usuario perceber que o pedido foi aceito — a sintese
     costuma levar alguns centenas de ms para comecar, e nesse silencio o clique parece perdido.
     Fica aqui, no unico ponto por onde toda fala passa, e nao nos ~12 botoes que a chamam. */
  play('speak');
  engine.speak(text, opts);
}
export function cancelSpeech(): void {
  engine.cancel();
}

/**
 * Transporte da fala. Se o motor ativo não implementar (SEAM), estas funções viram no-op e
 * `isSpeaking()/isPaused()` devolvem `false` — nunca um estado inventado.
 */
export function pauseSpeech(): void {
  engine.pause?.();
}
export function resumeSpeech(): void {
  engine.resume?.();
}
export function isSpeaking(): boolean {
  return engine.isSpeaking?.() ?? false;
}
export function isPaused(): boolean {
  return engine.isPaused?.() ?? false;
}
