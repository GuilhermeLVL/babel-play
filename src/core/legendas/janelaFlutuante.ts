/**
 * A JANELA FLUTUANTE DA LEGENDA, em regra pura: que formato sugerir, de que tamanho abrir, que layout
 * cabe no tamanho que a janela tem DE VERDADE, quantas falas à vista e com que letra.
 *
 * Os quatro FORMATOS são o pedido de quem usa (cada um com o seu tamanho de abertura):
 *  - `faixa`: jogo ou app em tela cheia. Larga e baixa, uma fala só, letra grande;
 *  - `legenda`: vídeo e série. A legenda clássica, uma ou duas falas;
 *  - `conversa`: reunião, aula, conversa. Alta e estreita, com histórico e quem falou;
 *  - `estudo`: a fala com o cartão da palavra aberto ao lado, para estudar com calma.
 *
 * O formato escolhido é o ponto de partida; quem manda no LAYOUT é o tamanho real da janela. Se a
 * pessoa achatar uma janela de conversa, ela vira faixa; se esticar uma faixa, ela vira legenda.
 *
 * Sem DOM e sem React (`src/core`): a janela do navegador, o canvas do PiP de vídeo e os testes leem
 * daqui as mesmas respostas.
 */

export type Formato = 'faixa' | 'legenda' | 'conversa' | 'estudo';
export type Layout = Formato;

export const FORMATOS: readonly Formato[] = ['faixa', 'legenda', 'conversa', 'estudo'];

export interface Tamanho {
  largura: number;
  altura: number;
}

/** O tamanho com que cada formato abre na primeira vez (depois, vale o último que a pessoa deixou). */
export const TAMANHO_DO_FORMATO: Readonly<Record<Formato, Tamanho>> = {
  faixa: { largura: 720, altura: 110 },
  legenda: { largura: 600, altura: 170 },
  conversa: { largura: 400, altura: 460 },
  estudo: { largura: 440, altura: 380 },
};

/** Abaixo desta altura não cabe mais que uma fala: qualquer formato vira faixa. */
const ALTURA_DA_FAIXA = 150;
/** A partir desta altura (e em pé), cabe o histórico da conversa. */
const ALTURA_DA_CONVERSA = 300;
/** O cartão do estudo precisa disto de altura para não cobrir a fala. */
const ALTURA_DO_ESTUDO = 260;

const LIMITES = { min: { largura: 160, altura: 80 }, max: { largura: 2400, altura: 1600 } } as const;

/**
 * O layout que cabe no tamanho real da janela, partindo do formato escolhido.
 * `tamanho` nulo (fora da janela flutuante, ou sem medida ainda): o layout é o próprio formato.
 */
export function layoutPorTamanho(formato: Formato, tamanho: Tamanho | null): Layout {
  if (!tamanho || tamanho.largura <= 0 || tamanho.altura <= 0) return formato;
  const { largura, altura } = tamanho;
  if (altura < ALTURA_DA_FAIXA) return 'faixa';
  if (formato === 'estudo') return altura >= ALTURA_DO_ESTUDO ? 'estudo' : 'legenda';
  const emPe = altura >= largura * 0.75;
  if (altura >= ALTURA_DA_CONVERSA && emPe) return 'conversa';
  if (formato === 'conversa' && altura >= ALTURA_DO_ESTUDO) return 'conversa';
  return 'legenda';
}

/**
 * Quantas falas ficam à vista. Faixa e estudo: uma (a da vez). Legenda: até duas, se a altura deixa,
 * respeitando a preferência da pessoa. Conversa: o que a altura comporta (é ali que o histórico
 * importa). Sem medida, vale a preferência (o painel dentro do app, os testes).
 */
export function falasAVista(layout: Layout, tamanho: Tamanho | null, preferidas: number): number {
  const pref = Math.max(1, Math.round(preferidas));
  if (!tamanho || tamanho.altura <= 0) return layout === 'faixa' || layout === 'estudo' ? 1 : pref;
  if (layout === 'faixa' || layout === 'estudo') return 1;
  if (layout === 'legenda') return Math.min(pref, tamanho.altura >= 220 ? 2 : 1);
  return Math.max(2, Math.min(6, Math.floor((tamanho.altura - 40) / 96)));
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * O tamanho da letra (px) da fala, acompanhando a largura da janela, vezes a escala da pessoa
 * (`escala` = 1 é 100%). A faixa e a legenda crescem mais: são lidas de longe, por cima do jogo.
 */
export function tamanhoDaLetra(layout: Layout, largura: number, escala = 1): number {
  const l = largura > 0 ? largura : TAMANHO_DO_FORMATO[layout].largura;
  const base =
    layout === 'faixa'
      ? limitar(l / 30, 17, 30)
      : layout === 'legenda'
        ? limitar(l / 26, 16, 32)
        : layout === 'conversa'
          ? limitar(l / 26, 14, 20)
          : limitar(l / 26, 15, 22);
  return Math.round(base * limitar(escala, 0.5, 2));
}

/** O que o app sabe da captura na hora de abrir a janela. */
export interface ContextoDaCaptura {
  /** O modo intérprete (duas pessoas conversando) está aberto. */
  interprete: boolean;
  /** `media` = só o som do computador; `conversation` = som + microfone; `mic` = só o microfone. */
  cenario: 'media' | 'conversation' | 'mic';
  /** O que foi compartilhado, quando se sabe: uma aba, uma janela ou a tela inteira. */
  superficie?: 'browser' | 'window' | 'monitor' | null;
}

/**
 * O formato sugerido pelo que o app já sabe. Sempre trocável com um toque na janela.
 *  - intérprete, reunião (som + microfone) ou só o microfone (aula, conversa ao vivo) → conversa;
 *  - som de uma ABA (o vídeo no navegador) → legenda;
 *  - som da tela inteira ou de uma janela (o jogo, o app em tela cheia) → faixa;
 *  - sem saber de onde vem o som → legenda, o meio-termo.
 */
export function formatoSugerido(c: ContextoDaCaptura): Formato {
  if (c.interprete || c.cenario === 'conversation' || c.cenario === 'mic') return 'conversa';
  if (c.superficie === 'monitor' || c.superficie === 'window') return 'faixa';
  return 'legenda';
}

/** Os tamanhos guardados por formato: só o que tem forma de tamanho, dentro de limites sensatos. */
export function normalizarTamanhos(bruto: unknown): Partial<Record<Formato, Tamanho>> {
  const o = bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {};
  const saida: Partial<Record<Formato, Tamanho>> = {};
  for (const f of FORMATOS) {
    const t = o[f] as Partial<Tamanho> | undefined;
    if (!t || typeof t !== 'object') continue;
    const { largura, altura } = t;
    if (typeof largura !== 'number' || typeof altura !== 'number') continue;
    if (!Number.isFinite(largura) || !Number.isFinite(altura)) continue;
    saida[f] = {
      largura: Math.round(limitar(largura, LIMITES.min.largura, LIMITES.max.largura)),
      altura: Math.round(limitar(altura, LIMITES.min.altura, LIMITES.max.altura)),
    };
  }
  return saida;
}

/** O tamanho com que o formato abre: o último que a pessoa deixou, ou o de fábrica. */
export function tamanhoParaAbrir(formato: Formato, guardados: Partial<Record<Formato, Tamanho>>): Tamanho {
  return guardados[formato] ?? TAMANHO_DO_FORMATO[formato];
}

/**
 * Quebra o texto em linhas que cabem em `largura`, medindo com `medir` (o `measureText` do canvas, ou
 * um falso nos testes). Palavra maior que a linha vai sozinha (o canvas corta, não trava). Devolve no
 * máximo `maxLinhas`; se sobrar texto, ficam as ÚLTIMAS linhas — numa legenda ao vivo, o fim da frase
 * é o que acabou de ser dito.
 */
export function quebrarLinhas(
  texto: string,
  largura: number,
  medir: (s: string) => number,
  maxLinhas = Infinity,
): string[] {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (!atual || medir(tentativa) <= largura) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length > maxLinhas ? linhas.slice(linhas.length - maxLinhas) : linhas;
}
