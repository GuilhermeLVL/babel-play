import { baseLang } from './languages';

/**
 * Idioma → país da bandeira exibida ao lado dele. Bandeira é um ATALHO VISUAL, não uma
 * afirmação política: um idioma não pertence a um país (o espanhol tem 20+), então para
 * códigos curtos ('es') usamos o país da variante que a nossa lista de idiomas oferece
 * primeiro ('es-ES' → ES). Códigos BCP-47 completos ('pt-BR') usam a região deles.
 *
 * SVG em vez de emoji por um motivo concreto: o Windows NÃO renderiza emojis de bandeira
 * (viram as letras "BR"/"US" soltas) — e a nossa base é Windows.
 */
const SHORT_TO_COUNTRY: Record<string, string> = {
  pt: 'BR', en: 'US', es: 'ES', fr: 'FR', de: 'DE', it: 'IT', nl: 'NL',
  ru: 'RU', pl: 'PL', uk: 'UA', tr: 'TR', sv: 'SE', da: 'DK', nb: 'NO',
  no: 'NO', fi: 'FI', cs: 'CZ', el: 'GR', ro: 'RO', hu: 'HU', ja: 'JP',
  ko: 'KR', zh: 'CN', hi: 'IN', ar: 'SA', he: 'IL', id: 'ID', vi: 'VN', th: 'TH',
};

/**
 * ISO-3166 do país da bandeira para um código de idioma (BCP-47 ou curto).
 * '' quando não conhecemos — quem chama mostra o fallback textual, nunca inventa bandeira.
 */
export function langCountry(code: string): string {
  const c = (code || '').trim();
  if (!c) return '';
  const region = c.split('-')[1]?.toUpperCase();
  // Região explícita vence (pt-PT → PT, en-GB → GB, es-MX → MX, zh-TW → TW).
  if (region && region.length === 2 && /^[A-Z]{2}$/.test(region)) return region;
  return SHORT_TO_COUNTRY[baseLang(c)] ?? '';
}

/** Rótulo curto do chip de idioma ('pt-BR' → 'PT', 'en' → 'EN'). */
export function langShortLabel(code: string): string {
  return baseLang(code).toUpperCase().slice(0, 2) || '?';
}
