/**
 * AS CURVAS E A FÍSICA DO MOVIMENTO DA INTERFACE — a parte que é só conta, sem tela.
 *
 * Vem do protótipo de polimento (`docs/prototipos/polimento-movimento.html`, aprovado pelo dono em
 * 07/10/2026). Três ideias, as mesmas dos painéis do iOS:
 *
 *   1. MOLA DE VERDADE. Uma curva `cubic-bezier` não passa do ponto e volta mais de uma vez; uma mola
 *      passa. `curvaDeMola` devolve a resposta de um sistema subamortecido como `linear(...)`, que o
 *      CSS e o WAAPI aceitam. As duas que o app usa estão prontas em `MOLA` e `MOLA_SUAVE`.
 *   2. O GESTO CONTINUA. Quando o dedo solta um painel, ele não volta para onde o dedo parou: vai
 *      para onde o gesto IA (`projetar`), como a rolagem.
 *   3. A BORDA CEDE. Arrastar além do limite não trava: resiste cada vez mais (`elastico`).
 */

/** Entradas e saídas: começa rápido e pousa devagar. É a curva de quase tudo. */
export const SAIDA = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** O que se desloca na tela de um lugar a outro: acelera e freia. */
export const VAI_E_VEM = 'cubic-bezier(0.77, 0, 0.175, 1)';
/** Painéis que sobem de baixo (a curva das folhas do iOS). */
export const GAVETA = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * A resposta ao degrau de uma mola subamortecida, amostrada em `pontos` passos, como `linear(...)`.
 * `amortecimento` é a razão de amortecimento: 1 pousa sem passar do ponto; quanto menor, mais quica.
 * O tempo é normalizado: a curva sempre termina em 1, e a duração é a de quem a usa.
 */
export function curvaDeMola(amortecimento: number, pontos = 24): string {
  const z = Math.min(0.99, Math.max(0.05, amortecimento));
  /* 6,9 = -ln(0,001): em t = 1 a envoltória já caiu a um milésimo, então a mola "acabou". */
  const decaimento = 6.9;
  const frequencia = (decaimento / z) * Math.sqrt(1 - z * z);
  const amostras: number[] = [];
  for (let i = 0; i <= pontos; i++) {
    const t = i / pontos;
    const valor =
      i === pontos
        ? 1
        : 1 -
          Math.exp(-decaimento * t) * (Math.cos(frequencia * t) + (decaimento / frequencia) * Math.sin(frequencia * t));
    amostras.push(Number(valor.toFixed(3)));
  }
  return `linear(${amostras.join(', ')})`;
}

/** Quica uma vez à vista (passa ~16% do ponto): comemoração, selo de combo, o que foi arremessado. */
export const MOLA = curvaDeMola(0.5);
/** Passa só ~4% do ponto: painéis, a pílula das abas, cartas que pousam. */
export const MOLA_SUAVE = curvaDeMola(0.72);

/**
 * Para onde um gesto IA quando o dedo soltou: a distância que ele ainda percorreria desacelerando
 * como a rolagem. `velocidade` em px/s; 0,998 é a desaceleração da rolagem do sistema.
 */
export function projetar(velocidade: number, desaceleracao = 0.998): number {
  return ((velocidade / 1000) * desaceleracao) / (1 - desaceleracao);
}

/**
 * Quanto um elemento anda quando é puxado `excesso` px além do limite: cada vez menos, sem nunca
 * travar. `dimensao` é o tamanho de referência (a altura do painel, por exemplo).
 */
export function elastico(excesso: number, dimensao = 120, constante = 0.55): number {
  return (excesso * dimensao * constante) / (dimensao + constante * Math.abs(excesso));
}

/** A velocidade (px/s) de um gesto a partir das últimas amostras `[posição, instante em ms]`. */
export function velocidadeDoGesto(amostras: ReadonlyArray<readonly [number, number]>): number {
  if (amostras.length < 2) return 0;
  const [p0, t0] = amostras[0];
  const [p1, t1] = amostras[amostras.length - 1];
  const dt = t1 - t0;
  return dt > 0 ? ((p1 - p0) / dt) * 1000 : 0;
}
