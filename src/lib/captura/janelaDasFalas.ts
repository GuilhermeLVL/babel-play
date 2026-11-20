/**
 * QUAIS BLOCOS DA LEGENDA FICAM NO DOM — a janela que deixa a sessão de 2.000 falas leve como a de 50.
 *
 * O PROBLEMA (26/10/2026). Os blocos de 20 falas (`blocosDasFalas`) com `content-visibility: auto` tiraram do
 * cálculo de estilo e layout o que está fora da tela, mas cada linha continuava no DOM: 600 falas eram ~24 mil
 * elementos, e tudo o que percorre a árvore pagava por elas — a árvore de acessibilidade (um `ariaSnapshot` do
 * Playwright levava ~19 s com CPU 4×), a memória, o React reconciliando a lista, o leitor de tela.
 *
 * O CONSERTO. Só os blocos perto da área visível são montados; os outros viram um VÃO com a altura deles. A
 * janela é de BLOCOS, não de linhas: a fala nunca muda de bloco, então montar e desmontar um bloco nunca troca
 * a linha de pai, e o bloco é a peça que já tinha a altura medida. A conta aqui é pura (o componente mede e rola):
 *  - a altura de cada bloco é a última MEDIDA (ResizeObserver), ou uma ESTIMATIVA pela altura média de uma
 *    fala nos blocos medidos, enquanto ele nunca foi desenhado;
 *  - um bloco entra se cruza a área visível com uma FOLGA acima e abaixo (rolar um pouco nunca mostra vão);
 *  - alguns blocos ficam sempre (`fixos`): o último, que recebe as falas ao vivo; o da fala com foco; o da fala
 *    escolhida (o painel aberto) e o da que está tocando;
 *  - os blocos de fora, seguidos, viram UM vão, com a altura deles somada aos espaços entre eles. O espaço entre
 *    o vão e o vizinho é o mesmo `gap` da coluna, então a tela não se mexe quando um bloco vira vão.
 */

/** Abaixo disto a lista inteira fica no DOM: com poucos blocos a janela não paga o que custa. */
export const BLOCOS_SEM_JANELA = 4;

/** Altura de uma fala antes de qualquer medida (uma linha curta com a tradução, no tamanho de letra padrão). */
export const ALTURA_DA_FALA_ESTIMADA = 84;

export interface MedidaDoBloco {
  /** A altura do bloco desenhado (px). */
  altura: number;
  /** Quantas falas ele tinha quando foi medido. */
  falas: number;
}

/** A altura média de UMA fala nos blocos já medidos (sem os espaços entre as linhas). */
export function alturaMediaDaFala(medidas: Iterable<MedidaDoBloco>, espaco: number): number {
  let soma = 0;
  let falas = 0;
  for (const m of medidas) {
    if (m.falas <= 0 || m.altura <= 0) continue;
    soma += m.altura - (m.falas - 1) * espaco;
    falas += m.falas;
  }
  return falas > 0 ? soma / falas : ALTURA_DA_FALA_ESTIMADA;
}

/**
 * A altura que a janela usa para um bloco: a medida, se ele tinha as mesmas falas; proporcional, se o número
 * mudou depois (uma fala saiu ou entrou no meio); senão, a estimativa pela média.
 */
export function alturaDoBloco(
  medida: MedidaDoBloco | undefined,
  falas: number,
  porFala: number,
  espaco: number,
): number {
  if (falas <= 0) return 0;
  if (medida && medida.falas === falas) return medida.altura;
  if (medida && medida.falas > 0) return (medida.altura * falas) / medida.falas;
  return falas * porFala + (falas - 1) * espaco;
}

export interface VistaDaLista {
  /** A altura de cada bloco, na ordem da lista. */
  alturas: readonly number[];
  /** O `gap` da coluna (px). */
  espaco: number;
  /**
   * Onde começa a área visível, medida do topo do primeiro bloco (px). `null`: no fim da lista (acompanhando
   * ao vivo) — a janela é a do fim mesmo antes de a rolagem chegar lá.
   */
  topo: number | null;
  /** A altura da área visível (px). */
  visivel: number;
  /** Quanto além da área visível, acima e abaixo, ainda se monta (px). */
  folga: number;
  /** Índices dos blocos que ficam montados de qualquer jeito. */
  fixos?: Iterable<number>;
}

export type PedacoDaJanela = { tipo: 'bloco'; i: number } | { tipo: 'vao'; de: number; ate: number; altura: number };

/** A altura total dos blocos com os espaços entre eles. */
export function alturaTotal(alturas: readonly number[], espaco: number): number {
  let total = 0;
  for (const h of alturas) total += h;
  return total + Math.max(0, alturas.length - 1) * espaco;
}

/** Os índices dos blocos que entram na janela, em ordem. */
export function blocosNaJanela(v: VistaDaLista): number[] {
  const n = v.alturas.length;
  if (n <= BLOCOS_SEM_JANELA) return Array.from({ length: n }, (_, i) => i);
  const topo = v.topo ?? Math.max(0, alturaTotal(v.alturas, v.espaco) - v.visivel);
  const de = topo - v.folga;
  const ate = topo + v.visivel + v.folga;
  const dentro = new Set<number>([n - 1]);
  for (const i of v.fixos ?? []) if (i >= 0 && i < n) dentro.add(i);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = v.alturas[i];
    if (y < ate && y + h > de) dentro.add(i);
    y += h + v.espaco;
  }
  return [...dentro].sort((a, b) => a - b);
}

/** A lista como ela vai para a tela: os blocos montados e, no lugar de cada sequência dos outros, um vão. */
export function janelaDasFalas(v: VistaDaLista): PedacoDaJanela[] {
  const montados = blocosNaJanela(v);
  const pedacos: PedacoDaJanela[] = [];
  let proximo = 0;
  const vao = (de: number, ate: number) => {
    if (ate < de) return;
    let altura = (ate - de) * v.espaco;
    for (let i = de; i <= ate; i++) altura += v.alturas[i];
    pedacos.push({ tipo: 'vao', de, ate, altura });
  };
  for (const i of montados) {
    vao(proximo, i - 1);
    pedacos.push({ tipo: 'bloco', i });
    proximo = i + 1;
  }
  vao(proximo, v.alturas.length - 1);
  return pedacos;
}

/**
 * Quanto rolar quando um bloco muda de altura, nos navegadores sem `overflow-anchor` (o Chrome e o Firefox
 * ancoram a rolagem sozinhos). Se o bloco estava INTEIRO acima da área visível, tudo o que a pessoa lê desceu
 * a diferença: a rolagem desce junto. Se ele está à vista ou abaixo, nada muda no que ela lê.
 */
export function ajusteDaRolagem(topoDoBloco: number, alturaAntes: number, alturaDepois: number, topo: number): number {
  return topoDoBloco + alturaAntes <= topo ? alturaDepois - alturaAntes : 0;
}

/** Onde cada bloco começa, medido do topo do primeiro (px), com os espaços entre eles. */
export function toposDosBlocos(alturas: readonly number[], espaco: number): number[] {
  const topos: number[] = [];
  let y = 0;
  for (const h of alturas) {
    topos.push(y);
    y += h + espaco;
  }
  return topos;
}

/**
 * A ÂNCORA da leitura, nos navegadores sem `overflow-anchor`: o primeiro bloco montado que ainda aparece na área
 * visível (o fim dele passa de `topo`). Entre um desenho e o seguinte, o quanto o começo dele andou (um vão acima
 * reestimado, outro tamanho de letra, outra largura) é o quanto a rolagem anda junto. `-1`: nenhum.
 */
export function ancoraDaLeitura(
  montados: readonly number[],
  topos: readonly number[],
  alturas: readonly number[],
  topo: number,
): number {
  for (const i of montados) if (topos[i] + alturas[i] > topo) return i;
  return -1;
}
