/**
 * FONTES EXCLUSIVAS DE TEMA E DE SKIN, CARREGADAS SÓ QUANDO ESCOLHIDAS.
 *
 * As fontes vêm do próprio site (pacotes `@fontsource`, subsets latin e latin-ext; os `@font-face`
 * estão em `src/styles/fontes/`) — nada é pedido ao Google, que receberia o IP do visitante
 * (LGPD, ver docs/lgpd/operadores.md). As de BASE (Inter, Archivo, IBM Plex Mono, Silkscreen) ficam
 * em `fontes/base.css`, carregado no início. Aqui ficam as demais: o CSS de cada uma só é baixado
 * quando o tema (`data-theme`) ou a fonte (`data-fonte`) que a usa é aplicado — quem fica no tema
 * padrão não paga por Orbitron, Caveat etc. Enquanto a fonte não chega, a pilha `font-family` do
 * token cai na reserva (Archivo, Inter, Georgia, ...), com `font-display: swap`.
 */
type Pacote = 'geist' | 'merriweather' | 'jetbrains-mono' | 'orbitron' | 'rajdhani' | 'arredondada' | 'caveat';

const CARREGADORES: Record<Pacote, () => Promise<unknown>> = {
  geist: () => import('../styles/fontes/geist.css'),
  merriweather: () => import('../styles/fontes/merriweather.css'),
  'jetbrains-mono': () => import('../styles/fontes/jetbrains-mono.css'),
  orbitron: () => import('../styles/fontes/orbitron.css'),
  rajdhani: () => import('../styles/fontes/rajdhani.css'),
  arredondada: () => import('../styles/fontes/arredondada.css'),
  caveat: () => import('../styles/fontes/caveat.css'),
};

/** Tema (`data-theme`) → pacotes. Os de paleta sem fonte própria (babel, linear, ...) não entram. */
export const FONTES_POR_TEMA: Readonly<Record<string, readonly Pacote[]>> = {
  vercel: ['geist'],
  aurora: ['geist'],
  observatorio: ['geist'],
  radio: ['rajdhani'],
  papel: ['merriweather'],
  neon: ['orbitron'],
  jardim: ['arredondada'],
  agua: ['arredondada'],
};

/** Fonte (`data-fonte`) → pacotes. `padrao`, `pixel` e `display` usam só as de base. */
export const FONTES_POR_FONTE: Readonly<Record<string, readonly Pacote[]>> = {
  serif: ['merriweather'],
  mono: ['jetbrains-mono'],
  cyber: ['orbitron', 'rajdhani', 'geist'],
  rounded: ['arredondada'],
  handwriting: ['caveat'],
};

const pedidos = new Set<Pacote>();

function carregar(pacotes: readonly Pacote[] | undefined): void {
  for (const p of pacotes ?? []) {
    if (pedidos.has(p)) continue;
    pedidos.add(p);
    // Falha de rede não pode quebrar a tela: fica a fonte de reserva, e uma nova escolha tenta de novo.
    CARREGADORES[p]().catch(() => pedidos.delete(p));
  }
}

export function carregarFontesDoTema(tema: string): void {
  carregar(FONTES_POR_TEMA[tema]);
}

export function carregarFontesDaFonte(fonte: string): void {
  carregar(FONTES_POR_FONTE[fonte]);
}
