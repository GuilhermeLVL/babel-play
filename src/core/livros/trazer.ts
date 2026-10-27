/**
 * "TRAZER O SEU": regras PURAS (sem React, sem rede, sem DOM) de quem chega com um arquivo ou um link.
 *
 *  · o formato vem do CONTEÚDO (assinatura de bytes), nunca da extensão;
 *  · EPUB com proteção (DRM) é reconhecido e recusado com um motivo próprio, sem culpar a pessoa;
 *  · um link de livro só vale se for um ARQUIVO de um host que a CSP deixa o navegador baixar. A página de
 *    uma loja ou de um repositório não é arquivo, e a mensagem diz o que fazer.
 *
 * O Frasy NÃO ensina a remover DRM (LDA art. 107). Aqui só se reconhece e se recusa.
 */

export type FormatoTrazido = 'epub' | 'pdf' | 'txt';

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
  | 'invalido';

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

/** O formato pela assinatura: zip → EPUB (confirmado depois), `%PDF` → PDF, texto sem bytes de controle → TXT. */
export function formatoPeloConteudo(cabeca: Uint8Array): FormatoTrazido | null {
  if (!cabeca.length) return null;
  if (cabeca[0] === 0x50 && cabeca[1] === 0x4b && cabeca[2] === 0x03 && cabeca[3] === 0x04) return 'epub';
  if (cabeca[0] === 0x25 && cabeca[1] === 0x50 && cabeca[2] === 0x44 && cabeca[3] === 0x46) return 'pdf';
  /* HTML solto (a página de uma loja salva como arquivo) não é livro de texto. */
  const inicio = new TextDecoder('utf-8').decode(cabeca.slice(0, 64)).trimStart().toLowerCase();
  if (inicio.startsWith('<!doctype') || inicio.startsWith('<html')) return null;
  for (const b of cabeca.slice(0, 4096)) {
    /* Tab, LF, CR e ESC-livre: qualquer outro controle (NUL inclusive) é binário. */
    if (b < 9 || (b > 13 && b < 32)) return null;
  }
  return 'txt';
}

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

const EXTENSAO_DE_LIVRO = /\.(epub|pdf|txt)$/i;

export type MotivoDoLink = 'invalido' | 'pagina' | 'release' | 'host';

/** Forma plana (sem união): `motivo` nulo = o link vale e `url` e `formato` estão preenchidos. */
export interface LinkDeLivro {
  ok: boolean;
  url: string;
  formato: FormatoTrazido | null;
  motivo: MotivoDoLink | null;
}

const recusa = (motivo: MotivoDoLink): LinkDeLivro => ({ ok: false, url: '', formato: null, motivo });

/** Valida o que a pessoa colou. Nunca devolve uma URL fora de `HOSTS_DE_LIVRO_POR_LINK`. */
export function validarLinkDeLivro(bruto: string): LinkDeLivro {
  let u: URL;
  let caminho: string;
  try {
    u = new URL(bruto.trim());
    caminho = decodeURIComponent(u.pathname);
  } catch {
    return recusa('invalido');
  }
  if (u.protocol !== 'https:' || u.username || u.password) return recusa('invalido');
  const host = u.hostname.toLowerCase();

  if (host === 'github.com' || host === 'www.github.com') {
    if (/^\/[^/]+\/[^/]+\/releases\//.test(caminho)) return recusa('release');
    /* github.com/<u>/<r>/blob|raw/<ref>/<arquivo> é o mesmo arquivo do raw: reescreve para o host liberado. */
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(caminho);
    if (m && EXTENSAO_DE_LIVRO.test(caminho)) {
      return validarLinkDeLivro(
        `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3].split('/').map(encodeURIComponent).join('/')}`,
      );
    }
    return recusa('pagina');
  }
  if (!(HOSTS_DE_LIVRO_POR_LINK as readonly string[]).includes(host)) {
    /* Um endereço de arquivo de outro host: não dá para baixar aqui; o caminho é baixar e soltar. */
    return recusa(EXTENSAO_DE_LIVRO.test(caminho) ? 'host' : 'pagina');
  }
  const ext = EXTENSAO_DE_LIVRO.exec(caminho);
  if (!ext) return recusa('pagina');
  return { ok: true, url: u.toString(), formato: ext[1].toLowerCase() as FormatoTrazido, motivo: null };
}
