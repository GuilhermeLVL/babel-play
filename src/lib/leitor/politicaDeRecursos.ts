/**
 * O QUE DO LIVRO PODE ENTRAR — negação por padrão (revisão de segurança de 26/10/2026). O conteúdo de um
 * livro nunca executa na origem do app; esta é a primeira barreira, antes do `sandbox` sem `allow-scripts`
 * dos iframes (`foliate/PATCHES.md`) e da limpeza do HTML (`limparHtml`).
 *
 *  · `tipoPermitido`: só (X)HTML, SVG, CSS, imagem, fonte e áudio. XML genérico, XSLT, JavaScript, SMIL,
 *    `application/octet-stream`, e qualquer coisa sem tipo, ficam fora;
 *  · `pareceMarcacao`: o conteúdo que FAREJA como marcação (`<html`, `<svg`, `<?xml`…) é limpo mesmo que o
 *    manifesto diga outro tipo — um "image/png" que na verdade é HTML não passa cru;
 *  · `linkExternoSeguro`: só `http:`/`https:` abrem, numa aba nova sem `opener` nem `referrer`.
 */

/** O tipo de mídia sem parâmetros, minúsculo (`"Text/HTML; charset=utf-8"` → `"text/html"`). */
export const normalizarTipo = (t: string | undefined | null) => (t ?? '').split(';')[0].trim().toLowerCase();

const MARCACAO = new Set(['application/xhtml+xml', 'text/html', 'image/svg+xml']);
const FONTES = new Set([
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-woff',
  'application/x-font-ttf',
  'application/x-font-otf',
  'application/x-font-opentype',
  'application/x-font-truetype',
  'application/vnd.ms-opentype',
  'application/font-sfnt',
  'application/x-font-ttf',
]);

/** O manifesto do livro pode carregar este tipo? */
export function tipoPermitido(tipo: string | undefined | null): boolean {
  const t = normalizarTipo(tipo);
  if (!t) return false;
  if (MARCACAO.has(t) || t === 'text/css') return true;
  if (t.startsWith('image/') || t.startsWith('audio/') || t.startsWith('font/')) return true;
  return FONTES.has(t);
}

/** O tipo é de marcação (o que vai para o `limparHtml`)? */
export const ehTipoDeMarcacao = (tipo: string | undefined | null) => MARCACAO.has(normalizarTipo(tipo));

/** O começo do conteúdo fareja como marcação? (BOM e espaço ignorados.) */
export function pareceMarcacao(inicio: string): boolean {
  return /^\uFEFF?\s*<(\?xml|!doctype|html|svg|xsl|body|head|script|iframe)\b/i.test(inicio);
}

/** O tipo para limpar um conteúdo que farejou como marcação. */
export function tipoDaMarcacao(inicio: string, declarado: string): string {
  if (ehTipoDeMarcacao(declarado)) return normalizarTipo(declarado);
  return /<svg\b/i.test(inicio) && !/<html\b/i.test(inicio) ? 'image/svg+xml' : 'text/html';
}

/** Só `http(s)` com host: o resto (`javascript:`, `data:`, `file:`, `blob:`, relativo) não abre. */
export function linkExternoSeguro(url: string): string | null {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u.href : null;
  } catch {
    return null;
  }
}
