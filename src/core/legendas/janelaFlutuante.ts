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

/** Lado mínimo do círculo do avatar na janela: abaixo disso o rosto some. */
const LADO_MINIMO_NA_JANELA = 96;

/**
 * O lado (px) do círculo do avatar na JANELA flutuante (Document PiP). Quanto maior, menos vazio sobra entre ele e a
 * legenda: AO LADO (janela larga), enche a altura da janela (menos o respiro) até ~28% da largura, no máximo 220;
 * EM CIMA (janela estreita), ~70% da largura e no máximo 55% da altura, para a legenda ainda caber embaixo.
 */
export function ladoDoAvatarNaJanela(tamanho: Tamanho, aoLado: boolean): number {
  const { largura, altura } = tamanho;
  if (aoLado) {
    const doAlto = altura > 0 ? altura - 16 : 160;
    return Math.max(72, Math.min(doAlto, Math.round(largura * 0.28), 220));
  }
  const doAlto = altura > 0 ? Math.floor(altura * 0.55) : 280;
  return Math.max(LADO_MINIMO_NA_JANELA, Math.min(Math.round(largura * 0.7), doAlto, 280));
}

/**
 * O lado (px) do círculo do avatar no QUADRO do PiP de vídeo (`dimensoes` = as do formato). A faixa e a legenda
 * (horizontais) enchem a altura menos o respiro; a conversa (vertical) usa 60% da largura, e o texto fica colado
 * embaixo do círculo (`desenharQuadro`). O `estudo` não tem avatar (0).
 */
export function ladoDoAvatarNoQuadro(formato: Formato, dimensoes: Tamanho): number {
  if (formato === 'estudo') return 0;
  if (formato === 'conversa') return Math.round(dimensoes.largura * 0.6);
  if (formato === 'faixa') return dimensoes.altura - 32;
  return Math.min(dimensoes.altura - 48, 300);
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

/** Os grafemas do texto (um emoji ou um caractere com acento é um só), sem depender de `Intl.Segmenter`. */
function grafemas(texto: string): string[] {
  const Seg = (
    Intl as unknown as {
      Segmenter?: new (
        l?: string,
        o?: { granularity: string },
      ) => { segment: (t: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(texto), (p) => p.segment);
  return Array.from(texto);
}

/**
 * Quebra o texto em linhas que cabem em `largura`, medindo com `medir` (o `measureText` do canvas, ou
 * um falso nos testes). Entre palavras, quebra no espaço; a "palavra" que não cabe sozinha numa linha
 * (chinês e japonês não têm espaço; uma URL longa) quebra por caractere. Devolve no máximo
 * `maxLinhas`; se sobrar texto, ficam as ÚLTIMAS linhas — numa legenda ao vivo, o fim da frase é o
 * que acabou de ser dito.
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
    if (medir(tentativa) <= largura) {
      atual = tentativa;
      continue;
    }
    if (medir(p) <= largura) {
      if (atual) linhas.push(atual);
      atual = p;
      continue;
    }
    /* Não cabe nem sozinha: caractere a caractere, continuando a linha que já estava aberta. */
    let pedaco = atual ? `${atual} ` : '';
    for (const g of grafemas(p)) {
      if (pedaco.trim() && medir(pedaco + g) > largura) {
        linhas.push(pedaco.trimEnd());
        pedaco = g;
      } else pedaco += g;
    }
    atual = pedaco;
  }
  if (atual) linhas.push(atual);
  return linhas.length > maxLinhas ? linhas.slice(linhas.length - maxLinhas) : linhas;
}
