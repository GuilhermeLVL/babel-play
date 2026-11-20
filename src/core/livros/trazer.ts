/**
 * "TRAZER O SEU": regras PURAS (sem React, sem rede, sem DOM) de quem chega com um arquivo ou um link.
 *
 *  · o formato vem do CONTEÚDO (assinatura de bytes), nunca da extensão (`formatos.ts`);
 *  · EPUB com proteção (DRM) é reconhecido e recusado com um motivo próprio, sem culpar a pessoa;
 *  · um link de livro só vale se for um ARQUIVO de um host que a CSP deixa o navegador baixar. A página de
 *    uma loja ou de um repositório não é arquivo, e a mensagem diz o que fazer.
 *
 * O Frasy NÃO ensina a remover DRM (LDA art. 107). Aqui só se reconhece e se recusa.
 */

/** Por que um arquivo ou link não virou livro. As frases ficam na tela (`t()`), não aqui. */
export type MotivoDoErro =
  | 'drm'
  | 'pdf-imagem'
  | 'grande'
  | 'corrompido'
  | 'formato'
  | 'vazio'
  | 'rede'
  | 'pagina'
  | 'release'
  | 'host'
  | 'invalido'
  | 'senha';

export class ErroDoLivro extends Error {
  constructor(
    readonly motivo: MotivoDoErro,
    detalhe = '',
  ) {
    super(detalhe || motivo);
    this.name = 'ErroDoLivro';
  }
}

/** O teto de um arquivo trazido pelo link (o mesmo de `MAX_BYTES_DO_LIVRO`). */
export const TETO_DO_LINK_EM_BYTES = 150 * 1024 * 1024;

/** As cifras que NÃO são proteção: a ofuscação de fontes do EPUB (IDPF e Adobe). */
const OFUSCACAO_DE_FONTE = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#rc'];

/**
 * O EPUB tem proteção (DRM)? Sim se há `rights.xml` (Adobe ADEPT) ou `sinf.xml` (FairPlay), ou se o
 * `encryption.xml` declara qualquer cifra que não seja a ofuscação de fontes (aes128-cbc do ADEPT, por exemplo).
 */
export function epubTemDrm(nomes: readonly string[], encryptionXml: string | null): boolean {
  const baixos = nomes.map((n) => n.toLowerCase());
  if (baixos.includes('meta-inf/rights.xml') || baixos.includes('meta-inf/sinf.xml')) return true;
  if (!encryptionXml) return false;
  const algoritmos = [...encryptionXml.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].toLowerCase());
  if (/adept|adobe\.com\/adept/i.test(encryptionXml)) return true;
  return algoritmos.some((a) => !OFUSCACAO_DE_FONTE.includes(a));
}

/* ── Link de livro ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Os hosts de onde o navegador pode baixar um livro (têm de estar também em `connect-src`, em
 * `server/http/csp.ts`): só `raw.githubusercontent.com`, conferido com `access-control-allow-origin: *`.
 * Release do GitHub NÃO entra: `github.com/.../releases/download` responde 302 sem CORS.
 */
export const HOSTS_DE_LIVRO_POR_LINK = ['raw.githubusercontent.com'] as const;
