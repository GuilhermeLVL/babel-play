/* Tipos (à mão, só o que o Frasy usa) do `view.js` vendorizado do foliate-js. Ver ORIGEM.txt. */

export interface ItemDoSumario {
  label: string;
  href: string;
  subitems?: ItemDoSumario[] | null;
}

export interface SecaoDoLivro {
  id: string | number;
  load(): Promise<string> | string;
  unload?(): void;
  createDocument?(): Promise<Document> | Document;
  resolveHref?(href: string): string;
  size: number;
  linear?: string;
  cfi?: string;
}

export interface LivroDoFoliate {
  metadata?: { title?: unknown; author?: unknown; language?: unknown };
  toc?: ItemDoSumario[];
  sections: SecaoDoLivro[];
  dir?: string;
  rendition?: { layout?: string };
  transformTarget?: EventTarget;
  resolveHref?(href: string): unknown;
  splitTOCHref?(href: string): unknown;
  getTOCFragment?(doc: Document, id: unknown): Node;
  isExternal?(uri: string): boolean;
  getCover?(): Promise<Blob | null>;
  destroy?(): void;
  /** Só no PDF (adaptação do Frasy): a amostra das primeiras páginas para o aviso. */
  amostraDeTexto?(): Promise<Array<{ largura: number; itens: Array<{ x: number; largura: number; texto: string }> }>>;
}

export interface Localizacao {
  fraction: number;
  cfi: string;
  range?: Range;
  section?: { current: number; total: number };
  location?: { current: number; next: number; total: number };
  tocItem?: { label?: string; href?: string; id?: number } | null;
  pageItem?: { label?: string } | null;
}

export interface Resolvido {
  index: number;
  anchor?: (doc: Document) => Range | Element;
}

export interface Renderizador extends HTMLElement {
  setStyles?(css: string): void;
  getContents(): Array<{ doc: Document; index: number; overlayer?: unknown }>;
  next(): Promise<void>;
  prev(): Promise<void>;
  goTo(r: Resolvido): Promise<void>;
  scrollToAnchor?(range: Range, select?: boolean): void;
  destroy?(): void;
}

export declare class View extends HTMLElement {
  book: LivroDoFoliate;
  renderer: Renderizador;
  lastLocation: Localizacao | null;
  isFixedLayout: boolean;
  open(book: File | Blob | LivroDoFoliate): Promise<void>;
  close(): void;
  init(opts: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
  goTo(target: string | number): Promise<Resolvido | undefined>;
  goToFraction(f: number): Promise<void>;
  goLeft(): Promise<void>;
  goRight(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  getCFI(index: number, range?: Range): string;
  resolveNavigation(target: string | number): Resolvido | undefined;
  addAnnotation(a: { value: string; [k: string]: unknown }, remove?: boolean): Promise<{ index: number; label: string } | undefined>;
  deleteAnnotation(a: { value: string }): Promise<unknown>;
  search(opts: { query: string; index?: number; matchCase?: boolean; matchDiacritics?: boolean; matchWholeWords?: boolean }): AsyncGenerator<
    | 'done'
    | { progress: number }
    | { label: string; subitems: Array<{ cfi: string; excerpt: { pre: string; match: string; post: string } }> }
  >;
  clearSearch(): void;
  deselect(): void;
  getSectionFractions(): number[];
}

export declare const makeBook: (file: File | Blob) => Promise<LivroDoFoliate>;
export declare class ResponseError extends Error {}
export declare class NotFoundError extends Error {}
export declare class UnsupportedTypeError extends Error {}
