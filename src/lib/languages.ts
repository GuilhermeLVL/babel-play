/**
 * Lista única de idiomas usada pelos seletores (captura, configurações). `code` é
 * o BCP-47 (para a captura/Whisper e o TTS); `short` é o ISO-639-1 (para o MT).
 * Antes cada tela tinha sua própria lista hardcoded (LiveCapture com 3, Settings
 * com 7) — isto unifica.
 */
export interface Language {
  /** BCP-47, ex.: 'pt-BR' — usado por getUserMedia language hints e SpeechSynthesis. */
  code: string;
  /** ISO-639-1, ex.: 'pt' — usado pelo gateway de tradução (opus-mt/Chrome/MyMemory). */
  short: string;
  label: string;
}

/**
 * Idiomas suportados. Lista ampla de propósito: "nunca se sabe qual idioma o usuário vai ouvir ou
 * falar". Rótulo no idioma NATIVO (é assim que o falante reconhece o próprio idioma numa lista).
 *
 * Cobertura REAL por subsistema (não é uniforme — a UI avisa honestamente):
 *  - TTS (narrador/pronúncia): depende das vozes instaladas no SO do usuário. Use
 *    `voiceLangs()` de `tts.ts` para saber o que existe de fato NAQUELE computador.
 *  - STT (Whisper local): cobre praticamente todos estes.
 *  - MT (tradução): o opus-mt LOCAL só cobre Inglês↔Românicas (ver `mtIsLocal`). Os demais pares
 *    caem no Chrome Translator / provedor de nuvem — a UI mostra o aviso de "exige internet".
 */
export const LANGUAGES: Language[] = [
  { code: 'pt-BR', short: 'pt', label: 'Português (BR)' },
  { code: 'pt-PT', short: 'pt', label: 'Português (PT)' },
  { code: 'en-US', short: 'en', label: 'English (US)' },
  { code: 'en-GB', short: 'en', label: 'English (UK)' },
  { code: 'es-ES', short: 'es', label: 'Español' },
  { code: 'es-MX', short: 'es', label: 'Español (MX)' },
  { code: 'fr-FR', short: 'fr', label: 'Français' },
  { code: 'de-DE', short: 'de', label: 'Deutsch' },
  { code: 'it-IT', short: 'it', label: 'Italiano' },
  { code: 'nl-NL', short: 'nl', label: 'Nederlands' },
  { code: 'ru-RU', short: 'ru', label: 'Русский' },
  { code: 'pl-PL', short: 'pl', label: 'Polski' },
  { code: 'uk-UA', short: 'uk', label: 'Українська' },
  { code: 'tr-TR', short: 'tr', label: 'Türkçe' },
  { code: 'sv-SE', short: 'sv', label: 'Svenska' },
  { code: 'da-DK', short: 'da', label: 'Dansk' },
  { code: 'nb-NO', short: 'nb', label: 'Norsk' },
  { code: 'fi-FI', short: 'fi', label: 'Suomi' },
  { code: 'cs-CZ', short: 'cs', label: 'Čeština' },
  { code: 'el-GR', short: 'el', label: 'Ελληνικά' },
  { code: 'ro-RO', short: 'ro', label: 'Română' },
  { code: 'hu-HU', short: 'hu', label: 'Magyar' },
  { code: 'ja-JP', short: 'ja', label: '日本語' },
  { code: 'ko-KR', short: 'ko', label: '한국어' },
  { code: 'zh-CN', short: 'zh', label: '中文 (简体)' },
  { code: 'zh-TW', short: 'zh', label: '中文 (繁體)' },
  { code: 'hi-IN', short: 'hi', label: 'हिन्दी' },
  { code: 'ar-SA', short: 'ar', label: 'العربية' },
  { code: 'he-IL', short: 'he', label: 'עברית' },
  { code: 'id-ID', short: 'id', label: 'Bahasa Indonesia' },
  { code: 'vi-VN', short: 'vi', label: 'Tiếng Việt' },
  { code: 'th-TH', short: 'th', label: 'ไทย' },
];

/**
 * Nome do idioma EM PORTUGUÊS — existe SÓ para a busca do seletor. O rótulo exibido continua
 * no idioma nativo (é assim que o falante reconhece a própria língua numa lista), mas ninguém
 * aqui digita "日本語" para achar japonês: sem isto, buscar "japonês" ou "russo" não devolvia nada.
 */
const PT_NAMES: Record<string, string> = {
  pt: 'português brasil portugal', en: 'inglês ingles estados unidos reino unido', es: 'espanhol castelhano méxico',
  fr: 'francês frances', de: 'alemão alemao', it: 'italiano', nl: 'holandês holandes neerlandês',
  ru: 'russo', pl: 'polonês polones', uk: 'ucraniano', tr: 'turco', sv: 'sueco', da: 'dinamarquês dinamarques',
  nb: 'norueguês noruegues', fi: 'finlandês finlandes', cs: 'tcheco checo', el: 'grego', ro: 'romeno',
  hu: 'húngaro hungaro', ja: 'japonês japones', ko: 'coreano', zh: 'chinês chines mandarim',
  hi: 'híndi hindi indiano', ar: 'árabe arabe', he: 'hebraico', id: 'indonésio indonesio',
  vi: 'vietnamita', th: 'tailandês tailandes',
};

/** Remove acentos e caixa — "japones" precisa achar "japonês". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * O idioma casa com o termo buscado? Procura no rótulo nativo, no nome em português e nos
 * códigos ('ja', 'ja-JP') — tudo sem acento, para "portugues" achar "Português".
 */
export function langMatches(l: Language, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return (
    fold(l.label).includes(q) ||
    fold(PT_NAMES[l.short] ?? '').includes(q) ||
    l.code.toLowerCase().includes(q) ||
    l.short.includes(q)
  );
}

/** Primeiro código BCP-47 conhecido para um ISO-639-1 ('pt' → 'pt-BR'). Útil p/ TTS. */
export function toBcp47(short: string): string {
  const b = baseLang(short);
  return LANGUAGES.find(l => l.short === b)?.code ?? b;
}

/** Base ISO-639-1 de um código BCP-47 ('pt-BR' → 'pt'). */
export function baseLang(code: string): string {
  return (code || '').toLowerCase().split('-')[0];
}

/** Rótulo amigável de um código (aceita BCP-47 ou short); cai para o próprio código. */
export function langLabel(code: string): string {
  const b = baseLang(code);
  return (LANGUAGES.find(l => l.code === code) || LANGUAGES.find(l => l.short === b))?.label || code;
}

/** O idioma está na lista que a app oferece? Código fora daqui não tem rótulo nem cobertura conhecida. */
export function isKnownLang(code: string): boolean {
  const b = baseLang(code);
  return !!b && LANGUAGES.some(l => l.short === b);
}

/** Todos os ISO-639-1 distintos oferecidos ('pt', 'en', 'es'…). */
export function knownShorts(): string[] {
  return [...new Set(LANGUAGES.map(l => l.short))];
}

// Espelha o conjunto ROMANCE do opus-mt local (src/gateway/adapters/opusMtLocal.ts L24).
// Manter em sincronia: o tradutor on-device só cobre Romance↔Inglês.
const ROMANCE = new Set(['pt', 'es', 'fr', 'it', 'ro', 'ca', 'gl']);

/**
 * COBERTURA REAL DE TRADUÇÃO de um par. É a matriz que faltava: até aqui a app só sabia responder
 * "é local?" (e só a tela de Captura perguntava), então nas outras telas um par sem motor nenhum
 * simplesmente ficava em "traduzindo…" para sempre, indistinguível de lentidão.
 *
 *  • 'same'    — nada a traduzir (mesmo idioma).
 *  • 'local'   — opus-mt on-device. Só Inglês↔Românicas. Nem pt↔es é local.
 *  • 'online'  — depende de Chrome Translator (pacote baixado) ou MyMemory (cota diária). Funciona,
 *                mas exige internet e pode falhar — a UI precisa dizer isso ANTES de o usuário esperar.
 *  • 'unknown' — código ausente ou fora da lista: não prometemos nada.
 */
export type MtCoverage = 'same' | 'local' | 'online' | 'unknown';

export function mtCoverage(src: string, tgt: string): MtCoverage {
  const s = baseLang(src);
  const t = baseLang(tgt);
  if (!s || !t) return 'unknown';
  if (s === t) return 'same';
  if ((s === 'en' && ROMANCE.has(t)) || (ROMANCE.has(s) && t === 'en')) return 'local';
  if (!isKnownLang(s) || !isKnownLang(t)) return 'unknown';
  return 'online';
}

/**
 * O par dispensa internet? `true` para 'local' E para 'same' (mesmo idioma não precisa de motor
 * nenhum). Note que isto NÃO é "o par é local": era essa confusão que fazia `mtIsLocal('pt','pt')`
 * devolver `true` como se houvesse um modelo local envolvido. Para decidir por capacidade, use
 * `mtCoverage`; use este aqui só para o aviso de "exige internet".
 */
export function mtIsLocal(src: string, tgt: string): boolean {
  const c = mtCoverage(src, tgt);
  return c === 'local' || c === 'same';
}

/**
 * O nome do idioma EM PORTUGUÊS, para caber numa frase — "8 palavras do inglês".
 *
 * `langLabel` devolve o nome NATIVO de propósito, e essa decisão está certa onde ela nasceu: numa
 * lista de escolha, "Español" e "Русский" são como o falante reconhece o próprio idioma. Dentro de
 * uma frase em português o mesmo rótulo quebra — "do Español" já apareceu na antessala, e "do
 * Русский" apareceria em seguida.
 *
 * `Intl.DisplayNames` vem do próprio runtime: sem tabela de 32 nomes para manter em sincronia com
 * `LANGUAGES`, e correto para idiomas que ainda nem estão na lista. O `catch` cobre runtimes sem a
 * API (e o `?? label` cobre um código que ela não conheça), caindo no nome nativo — pior de ler,
 * nunca vazio.
 */
export function langLabelPt(code: string): string {
  const b = baseLang(code);
  try {
    const nome = new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(b);
    // A API devolve o próprio código quando não conhece o idioma; aí o nome nativo informa mais.
    if (nome && nome.toLowerCase() !== b) return nome.toLowerCase();
  } catch { /* runtime sem Intl.DisplayNames */ }
  return langLabel(code);
}
