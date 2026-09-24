/**
 * O TAMANHO DA CÉLULA DO TERMO — tirado das unidades de viewport, que mentem sob `zoom`.
 *
 * O DEFEITO QUE ISTO CONSERTA, medido no navegador (zoom 1.15, viewport 1920×893):
 *
 *     container da grade (max-w-6xl) ......... 1152 px
 *     célula que a fórmula CSS produzia ......   49,3 px
 *     4 tabuleiros de 6 letras + 3 folgas .... 1447 px  → estoura 1152 em 151 px
 *
 * Na tela isso é o Quarteto com os quatro tabuleiros COLADOS: as folgas (`gap-x-12`) são a
 * primeira coisa que o navegador come quando o conteúdo não cabe, e vinte e quatro quadrados em
 * fileira contínua não se leem como quatro palavras. Duas causas independentes, somadas:
 *
 *  1. O ORÇAMENTO VINHA DE `100vw`. A fórmula era `calc((100vw - 8rem) / 38)`, mas a grade é
 *     limitada por `max-w-6xl`. Numa tela de 1920 ela dimensionava a célula para 1920 e depois
 *     tentava caber em 1152. Quanto MAIOR o monitor, pior — o contrário do esperado.
 *
 *  2. `vw`/`vh` NÃO SOBREVIVEM AO `zoom`. O A± de acessibilidade põe `zoom` no `body`, e dentro
 *     de um elemento com zoom essas unidades continuam resolvendo contra a viewport SEM zoom —
 *     e o resultado é multiplicado pelo zoom depois, ficando 15% MAIOR que a viewport real a
 *     1,15. `rem` escala junto e não tem esse problema; o estrago vem de MISTURAR as duas
 *     famílias na mesma conta, que é o que `min(clamp(rem, vh, rem), calc(vw…))` fazia. É o
 *     mesmo tropeço que já tinha jogado o balão de idiomas para fora da tela (ver
 *     `lib/posicaoFlutuante`), agora em forma de layout.
 *
 * A saída é medir o container em vez de adivinhar a viewport: `clientWidth`/`offsetHeight` já
 * vêm no espaço de layout ZOOMADO, então a conta feita com eles é invariante ao zoom por
 * construção — não há fator a corrigir, e é por isso que isto é mais seguro que "dividir por 1,15"
 * em algum lugar.
 *
 * Puro de propósito: é a regra que precisa valer em toda combinação de tela e zoom, e testá-la
 * não deve exigir um navegador.
 */

/**
 * Abaixo disso a letra não é mais legível; acima, um tabuleiro só vira outdoor.
 *
 * O 22 não é arbitrário: é o que faz o Quarteto 2×2 de seis letras caber num celular comum
 * (390px, zoom 1 → 358px úteis — exige 22,5). Com 26 ele estouraria por 42px e rolaria de lado
 * no aparelho mais comum que existe.
 */
export const CELULA_MIN = 22;
/**
 * O piso da ALTURA — e ele é bem mais alto que o da largura, de propósito.
 *
 * As duas pressões têm saídas diferentes. Falta de LARGURA não tem saída boa: rolar de lado num
 * jogo de digitar é péssimo, então vale espremer até `CELULA_MIN`. Falta de ALTURA tem: a área do
 * tabuleiro rola, e a linha que está sendo digitada continua à vista.
 *
 * Sem este piso a conta ficava de cabeça para baixo em relação ao A±: mais zoom → menos altura
 * em px de layout → quadrado menor. Medido a 1,3 numa janela de 893px: a célula caiu de 66 para
 * 32, e 32 × 1,3 = 42 px na tela contra 66 no zoom 1. Ou seja, aumentar a fonte DIMINUÍA o jogo —
 * exatamente o contrário do que quem mexe no A± está pedindo.
 */
export const CELULA_CONFORTAVEL = 44;
export const CELULA_MAX = 72;
/** Folga entre quadrados da MESMA palavra (o `gap-1.5` do Tailwind). */
export const GAP_CELULA = 6;
/**
 * Folga ENTRE tabuleiros. Muito maior que a folga entre células de propósito: é ela que diz onde
 * uma palavra acaba e a outra começa, e a diferença entre as duas é a única pista visual disso.
 */
export const GAP_TABULEIRO = 28;

export interface EspacoDoTermo {
  /** Largura útil do container da grade, em px de LAYOUT (`clientWidth`). */
  largura: number;
  /** Altura disponível para a grade, em px de LAYOUT (já descontados cabeçalho e teclado). */
  altura: number;
  /** Quantos tabuleiros o degrau tem (1, 2 ou 4). */
  tabuleiros: number;
  /** Letras da palavra — todas do degrau têm o mesmo tamanho (ver `mesmoTamanho`). */
  colunas: number;
  /** Tentativas, isto é, linhas de cada tabuleiro. */
  linhas: number;
  /** Altura reservada acima de cada tabuleiro para a pista (e o contexto, quando houver). */
  cabecalho: number;
}

/**
 * A MOLDURA DE CADA TABULEIRO — e por que ela entra na conta em vez de ficar no CSS.
 *
 * O cartão (borda + respiro) é o que remove a ambiguidade que a folga sozinha não remove: a
 * olho nu, 28px entre tabuleiros ainda pode ser lido como "espaço um pouco maior" em vez de
 * "outra palavra". Só que ele CUSTA largura — 18px por tabuleiro, 72px no Quarteto —, e pôr
 * esse custo no CSS enquanto a conta o ignora é exatamente como o defeito original nasceu.
 *
 * Por isso a função ESCOLHE a espessura e devolve: quem desenha aplica o número que quem calcula
 * usou, e as duas não têm como divergir. Num celular a moldura encolhe até a borda nua antes de
 * o jogo ter de rolar de lado — respiro é conforto, separação é requisito.
 */
export const MOLDURA_FOLGADA = 18; // borda de 1px + 8px de respiro, de cada lado
/**
 * A borda NUA, sem respiro. É o piso porque a separação é requisito e o respiro é conforto — e
 * porque é exatamente o que faz o Quarteto de seis letras caber num celular comum (390px → 358
 * úteis): com 4px de moldura a célula daria 21,8px e cairia abaixo do legível por dois décimos.
 */
export const MOLDURA_MINIMA = 2;

/**
 * A GEOMETRIA DO DESENHO — as folgas, a moldura e os limites que a conta usa.
 *
 * A conta e o desenho têm de falar das MESMAS folgas (é a lição da moldura, acima): se o CSS põe
 * 5px entre quadrados e a conta supõe 6, o Quarteto volta a estourar. Por isso a geometria é um
 * parâmetro, e quem desenha passa a do seu CSS. O padrão é a do tabuleiro antigo (Tailwind); a do
 * protótipo aprovado está em `GEOMETRIA_DO_PROTOTIPO`.
 */
export interface GeometriaDoTermo {
  /** Folga entre quadrados da mesma palavra. */
  gapCelula: number;
  /** Folga entre tabuleiros, por quantidade de tabuleiros no degrau. */
  gapTabuleiro: (tabuleiros: number) => number;
  /** Molduras a tentar, da mais confortável à mínima, por quantidade de tabuleiros. */
  molduras: (tabuleiros: number) => number[];
  /** Piso da altura (ver `CELULA_CONFORTAVEL`). */
  pisoAltura: number;
  /** Piso da largura (ver `CELULA_MIN`). */
  minimo: number;
  /** Teto do quadrado. */
  maximo: number;
}

export const GEOMETRIA_PADRAO: GeometriaDoTermo = {
  gapCelula: GAP_CELULA,
  gapTabuleiro: () => GAP_TABULEIRO,
  molduras: (n) => (n === 1 ? [0] : [MOLDURA_FOLGADA, MOLDURA_MINIMA]),
  pisoAltura: CELULA_CONFORTAVEL,
  minimo: CELULA_MIN,
  maximo: CELULA_MAX,
};

/**
 * A do protótipo aprovado (`ajustarTermo` e o CSS de `.tabs-termo` em
 * docs/prototipos/consistencia-telas.html): 5px entre quadrados; 18px entre tabuleiros (12px no
 * Quarteto); cada tabuleiro é um cartão `.tab-termo` com 10px de respiro e 1px de borda de cada
 * lado (22px), mesmo quando é um só; quadrado de até 56px. O piso da altura é 24px, e não 44:
 * o protótipo quer o teclado visível sem rolar, então a altura aperta o quadrado antes de a área
 * rolar. O piso da largura segue o do app (22px, o que faz o Quarteto 2×2 caber no celular).
 */
export const GEOMETRIA_DO_PROTOTIPO: GeometriaDoTermo = {
  gapCelula: 5,
  gapTabuleiro: (n) => (n === 4 ? 12 : 18),
  molduras: () => [22],
  pisoAltura: 24,
  minimo: CELULA_MIN,
  maximo: 56,
};

export interface LayoutDoTermo {
  /** Lado do quadrado, em px de layout. */
  celula: number;
  /** Tabuleiros por fileira. O Quarteto vira 2×2 quando 1×4 não cabe com dignidade. */
  porFileira: number;
  /** Padding+borda horizontais de cada tabuleiro. 0 quando há um só (não há o que separar). */
  moldura: number;
  /** `true` quando nem o melhor arranjo alcança `CELULA_MIN` — a grade vai precisar rolar. */
  apertado: boolean;
}

/**
 * O maior quadrado que cabe num arranjo.
 *
 * AS DUAS DIMENSÕES NÃO TÊM O MESMO PESO, e tratar as duas como limite duro era o que quebrava
 * o celular: num aparelho comum, nove tentativas em duas fileiras de tabuleiro pedem quadrados de
 * 15px — e aí a ALTURA, não a largura, esmagava o jogo.
 *
 *  · A LARGURA É DURA. Estourar de lado é o defeito que se está consertando: o navegador come as
 *    folgas entre tabuleiros, e vinte e quatro quadrados viram uma fileira contínua.
 *  · A ALTURA É PREFERÊNCIA, com piso em `CELULA_CONFORTAVEL`. A área do tabuleiro rola — rolar
 *    na vertical é o gesto natural e não esconde nada, porque a linha sendo digitada fica à
 *    vista. Ela serve para a grade CRESCER num monitor grande (era o pedido de 2026-08-28), nunca
 *    para espremer o jogo quando alguém aumenta a fonte.
 */
function celulaDoArranjo(e: EspacoDoTermo, porFileira: number, moldura: number, g: GeometriaDoTermo): number {
  const fileiras = Math.ceil(e.tabuleiros / porFileira);
  const gapTab = g.gapTabuleiro(e.tabuleiros);

  const larguraUtil = e.largura - gapTab * (porFileira - 1) - moldura * porFileira;
  const porTabuleiro = larguraUtil / porFileira;
  const porLargura = (porTabuleiro - g.gapCelula * (e.colunas - 1)) / e.colunas;

  const alturaUtil = e.altura - (e.cabecalho + gapTab + moldura) * fileiras;
  const porAltura = (alturaUtil / fileiras - g.gapCelula * (e.linhas - 1)) / e.linhas;

  return Math.min(porLargura, Math.max(porAltura, g.pisoAltura), g.maximo);
}

/**
 * Escolhe arranjo e tamanho de célula para o espaço que existe.
 *
 * UMA FILEIRA SÓ É A PREFERÊNCIA, E O MOTIVO É DE MECÂNICA, NÃO DE ESTÉTICA. No Quarteto o
 * palpite é UM SÓ e vale para os quatro tabuleiros ao mesmo tempo: quem não vê metade das grades
 * está jogando com metade da informação. Empilhar 2×2 obriga a rolar entre as fileiras a cada
 * palpite, e é disso que o comentário original do componente avisava.
 *
 * Por isso o critério NÃO é "o maior quadrado": é "cabe em uma fileira com quadrado legível?".
 * Só quando 1×4 espremeria abaixo de `CELULA_MIN` — na prática, celular — o 2×2 entra, e aí
 * rolar entre fileiras é melhor que quadrados ilegíveis.
 */
export function layoutDoTermo(e: EspacoDoTermo, g: GeometriaDoTermo = GEOMETRIA_PADRAO): LayoutDoTermo {
  const arranjos = e.tabuleiros === 4 ? [4, 2] : [e.tabuleiros];
  // Um tabuleiro só não tem do que ser separado: na geometria padrão, cartão ali seria enfeite
  // cobrando largura. (No protótipo o tabuleiro único também é cartão, e a geometria dele diz isso.)
  const molduras = g.molduras(e.tabuleiros);

  /* Duas preferências em ordem, e a de FORA vale mais: primeiro tenta manter tudo numa fileira
     (mecânica), e só dentro dessa escolha tenta manter o respiro da moldura (conforto). Assim
     nenhuma tela grande perde o respiro à toa, e nenhum celular perde a fileira única por causa
     de 8px de padding. */
  let melhor = { celula: 0, porFileira: arranjos[0], moldura: molduras[0] };
  for (const porFileira of arranjos) {
    for (const moldura of molduras) {
      const celula = celulaDoArranjo(e, porFileira, moldura, g);
      if (celula > melhor.celula) melhor = { celula, porFileira, moldura };
      if (celula >= g.minimo) break;
    }
    if (melhor.celula >= g.minimo) break;
  }

  return {
    // O piso é chão, não teto: abaixo dele a grade rola, mas a letra continua legível. Deixar a
    // célula encolher sem limite entregaria quadrados de 8px, que não são jogo nenhum.
    celula: Math.max(g.minimo, Math.floor(melhor.celula)),
    porFileira: melhor.porFileira,
    moldura: melhor.moldura,
    apertado: melhor.celula < g.minimo,
  };
}

/** A largura que um tabuleiro ocupa com esta célula, moldura incluída. */
export function larguraDoTabuleiro(celula: number, colunas: number, moldura = 0, gapCelula = GAP_CELULA): number {
  return celula * colunas + gapCelula * (colunas - 1) + moldura;
}
