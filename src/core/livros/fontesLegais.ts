/**
 * O GUIA "ONDE ACHAR LIVROS LEGAIS": a lista curada das fontes que o Frasy indica (pesquisa de 27/10/2026,
 * `docs/pesquisa/2026-10-27-livros-fontes-externas.md`).
 *
 *  · VERDE: domínio público ou licença aberta, de forma geral;
 *  · AMARELO: pode ter obra que é de domínio público em outro país e AINDA NÃO no Brasil (70 anos depois
 *    da morte do autor, LDA art. 41; a tradução tem direito próprio, art. 14): vem com a ressalva.
 *
 * Só entram sites de bibliotecas e projetos de livros livres. Nenhum site que distribua cópias sem
 * autorização, nenhuma ferramenta de remover proteção. O teste de `tests/livros-trazer.test.ts` varre esta lista.
 * Os links não levam parâmetro de rastreio.
 */

export interface FonteLegal {
  id: string;
  nome: string;
  /** A semáforo da pesquisa. */
  grupo: 'verde' | 'amarelo';
  /** Idiomas principais, rótulo curto. */
  idiomas: string;
  /** A página certa para achar e baixar. */
  url: string;
}

export const FONTES_LEGAIS: readonly FonteLegal[] = [
  {
    id: 'gutenberg',
    nome: 'Project Gutenberg',
    grupo: 'verde',
    idiomas: 'EN, PT, ES e outros',
    url: 'https://www.gutenberg.org/ebooks/',
  },
  {
    id: 'standard-ebooks',
    nome: 'Standard Ebooks',
    grupo: 'verde',
    idiomas: 'EN',
    url: 'https://standardebooks.org/ebooks',
  },
  {
    id: 'wikisource',
    nome: 'Wikisource',
    grupo: 'verde',
    idiomas: 'PT, EN, ES e muitos outros',
    url: 'https://wikisource.org/wiki/Main_Page',
  },
  {
    id: 'wikibooks',
    nome: 'Wikibooks',
    grupo: 'verde',
    idiomas: 'PT, EN, ES e outros',
    url: 'https://www.wikibooks.org/',
  },
  {
    id: 'internet-archive',
    nome: 'Internet Archive',
    grupo: 'verde',
    idiomas: 'vários',
    url: 'https://archive.org/details/texts',
  },
  {
    id: 'open-library',
    nome: 'Open Library',
    grupo: 'verde',
    idiomas: 'vários',
    url: 'https://openlibrary.org/',
  },
  {
    id: 'librivox',
    nome: 'LibriVox',
    grupo: 'verde',
    idiomas: 'EN, PT, ES e outros',
    url: 'https://librivox.org/',
  },
  {
    id: 'dominio-publico-mec',
    nome: 'Domínio Público (MEC)',
    grupo: 'amarelo',
    idiomas: 'PT',
    url: 'https://www.dominiopublico.gov.br/',
  },
  {
    id: 'bndigital',
    nome: 'Biblioteca Nacional Digital',
    grupo: 'amarelo',
    idiomas: 'PT',
    url: 'https://bndigital.bn.gov.br/',
  },
  {
    id: 'hathitrust',
    nome: 'HathiTrust',
    grupo: 'amarelo',
    idiomas: 'vários',
    url: 'https://www.hathitrust.org/',
  },
  {
    id: 'biblioteca-digital-mundial',
    nome: 'Biblioteca Digital Mundial',
    grupo: 'amarelo',
    idiomas: 'vários',
    url: 'https://www.loc.gov/collections/world-digital-library/',
  },
  {
    id: 'feedbooks',
    nome: 'Feedbooks',
    grupo: 'amarelo',
    idiomas: 'EN, FR e outros',
    url: 'https://www.feedbooks.com/publicdomain',
  },
  {
    id: 'manybooks',
    nome: 'ManyBooks',
    grupo: 'amarelo',
    idiomas: 'EN e outros',
    url: 'https://manybooks.net/',
  },
  {
    id: 'faded-page',
    nome: 'Faded Page',
    grupo: 'amarelo',
    idiomas: 'EN',
    url: 'https://www.fadedpage.com/',
  },
];

/** Os hosts permitidos nos links do guia (o teste reprova qualquer outro). */
export const HOSTS_DO_GUIA = [
  'www.gutenberg.org',
  'standardebooks.org',
  'wikisource.org',
  'www.wikibooks.org',
  'archive.org',
  'openlibrary.org',
  'librivox.org',
  'www.dominiopublico.gov.br',
  'bndigital.bn.gov.br',
  'www.hathitrust.org',
  'www.loc.gov',
  'www.feedbooks.com',
  'manybooks.net',
  'www.fadedpage.com',
] as const;
