/**
 * O TRAÇO DO DESENHO LIVRE — o modelo (vetorial) e o jeito de pintar cada tipo de caneta.
 *
 * Cada traço é guardado como PONTOS (não como pixels): é isso que permite desfazer por traço,
 * guardar pouco, refazer o desenho em outro tamanho de janela e tirar o PNG com fundo transparente.
 *
 * Os tipos de ponta:
 *   caneta       linha firme, largura constante;
 *   tinteiro     a largura varia com a pressão (caneta de tablet) ou, sem pressão, com a velocidade;
 *   pincel       borda macia e uma leve variação de largura, translúcido;
 *   marca-texto  largo e translúcido;
 *   borracha     apaga o que já foi pintado (destination-out).
 *
 * Todo traço é pintado primeiro numa CAMADA própria, opaca, e só depois a camada é colada no desenho
 * com a opacidade do traço. É o que impede o mesmo traço de escurecer onde ele cruza consigo mesmo.
 */

export type Ferramenta = 'caneta' | 'tinteiro' | 'pincel' | 'marca-texto' | 'borracha';

export const FERRAMENTAS: readonly Ferramenta[] = ['caneta', 'tinteiro', 'pincel', 'marca-texto', 'borracha'];

/** [x, y, fator de largura]. O fator é 1 nos tipos de largura constante. */
export type Ponto = [number, number, number];

export interface Traco {
  f: Ferramenta;
  /** `#rrggbb`. Ignorada pela borracha. */
  cor: string;
  /** Largura nominal em px (1–40). */
  w: number;
  /** Opacidade 0–1. */
  a: number;
  pts: Ponto[];
}

export const LARGURA_MIN = 1;
export const LARGURA_MAX = 40;

export const LARGURA_PADRAO: Record<Ferramenta, number> = {
  caneta: 3,
  tinteiro: 4,
  pincel: 12,
  'marca-texto': 16,
  borracha: 22,
};

/** Só o pincel e o marca-texto têm opacidade ajustável; os outros são sempre opacos. */
export const temOpacidade = (f: Ferramenta) => f === 'pincel' || f === 'marca-texto';

export const OPACIDADE_PADRAO = { pincel: 0.85, 'marca-texto': 0.4 } as const;

export const limitarLargura = (n: number) =>
  Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, Number.isFinite(n) ? Math.round(n) : LARGURA_PADRAO.caneta));

const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const arred = (n: number) => Math.round(n * 10) / 10;

/* ─────────────────────────── o fator de largura de cada ponto ─────────────────────────── */

export interface EntradaDoPonteiro {
  pressure?: number;
  pointerType?: string;
}

/**
 * Quanto a largura nominal vale neste ponto.
 *  · tinteiro com caneta de tablet: segue a pressão (0,35×–1,35×);
 *  · tinteiro com mouse ou dedo: quanto mais rápido, mais fino (0,35×–1,25×);
 *  · pincel: variação pequena (0,8×–1,05×), também pela velocidade;
 *  · os demais: sempre 1.
 * `anterior` suaviza: a largura não pula de um ponto para o outro.
 */
export function fatorDoPonto(
  f: Ferramenta,
  entrada: EntradaDoPonteiro,
  velocidade: number,
  anterior: number | undefined,
): number {
  let alvo: number;
  if (f === 'tinteiro') {
    const pressao = entrada.pressure;
    const comPressao = entrada.pointerType === 'pen' && typeof pressao === 'number' && pressao > 0;
    alvo = comPressao ? 0.35 + pressao : limitar(1.25 - velocidade * 0.55, 0.35, 1.25);
  } else if (f === 'pincel') {
    alvo = limitar(1.05 - velocidade * 0.12, 0.8, 1.05);
  } else return 1;
  const suave = anterior === undefined ? alvo : anterior * 0.6 + alvo * 0.4;
  return Math.round(suave * 100) / 100;
}

export const novoPonto = (x: number, y: number, fator = 1): Ponto => [arred(x), arred(y), fator];

/* ─────────────────────────────────── geometria ─────────────────────────────────── */

/** O retângulo que o traço ocupa (com a folga da largura e da sombra do pincel). */
export function limitesDoTraco(t: Traco): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of t.pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const folga = Math.ceil(t.w * 1.6) + 4;
  return {
    x0: Math.floor(x0 - folga),
    y0: Math.floor(y0 - folga),
    x1: Math.ceil(x1 + folga),
    y1: Math.ceil(y1 + folga),
  };
}

/** O fundo do desenho precisa cobrir todos os traços, mesmo os que passam do canvas atual. */
export function alturaQueCobre(tracos: readonly Traco[], alturaDaTela: number): number {
  let maior = alturaDaTela;
  for (const t of tracos) {
    if (t.pts.length === 0) continue;
    maior = Math.max(maior, limitesDoTraco(t).y1);
  }
  return Math.ceil(maior);
}

/** Refaz os traços num desenho de outra largura: tudo (posição e grossura) na mesma proporção. */
export function reescalar(tracos: readonly Traco[], fator: number): Traco[] {
  if (fator === 1 || !Number.isFinite(fator) || fator <= 0) return [...tracos];
  return tracos.map((t) => ({
    ...t,
    w: Math.max(0.5, Math.round(t.w * fator * 10) / 10),
    pts: t.pts.map(([x, y, p]) => [arred(x * fator), arred(y * fator), p] as Ponto),
  }));
}

/* ─────────────────────────────────── pintura ─────────────────────────────────── */

export type Ctx2D = CanvasRenderingContext2D;
export type CriarCamada = (largura: number, altura: number) => HTMLCanvasElement;

export const criarCamadaPadrao: CriarCamada = (largura, altura) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, largura);
  c.height = Math.max(1, altura);
  return c;
};

const meio = (a: Ponto, b: Ponto): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function estilo(ctx: Ctx2D, t: Traco, largura: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const cor = t.f === 'borracha' ? '#000000' : t.cor;
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;
  if (t.f === 'pincel') {
    ctx.lineWidth = Math.max(0.5, largura * 0.55);
    ctx.shadowColor = cor;
    ctx.shadowBlur = largura * 0.35;
  } else {
    ctx.lineWidth = Math.max(0.5, largura);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
}

/** O ponto sozinho (toque sem arrastar): um disco. */
export function pintarPonto(ctx: Ctx2D, t: Traco): void {
  const p = t.pts[0];
  if (!p) return;
  ctx.save();
  estilo(ctx, t, t.w * p[2]);
  ctx.beginPath();
  ctx.arc(p[0], p[1], Math.max(0.5, ctx.lineWidth / 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * O trecho `i` do traço (1 ≤ i < n): uma curva que liga o meio do segmento anterior ao meio deste,
 * com o ponto anterior como controle — o que alisa as quinas dos pontos do mouse. `i === n` é o
 * último pedaço, reto, até o ponto final.
 */
export function pintarTrecho(ctx: Ctx2D, t: Traco, i: number): void {
  const n = t.pts.length;
  if (n < 2 || i < 1 || i > n) return;
  ctx.save();
  ctx.beginPath();
  if (i === n) {
    const ult = t.pts[n - 1]!;
    const [mx, my] = meio(t.pts[n - 2]!, ult);
    ctx.moveTo(mx, my);
    ctx.lineTo(ult[0], ult[1]);
    estilo(ctx, t, t.w * ult[2]);
  } else {
    const c = t.pts[i - 1]!;
    const prox = t.pts[i]!;
    const ini = i === 1 ? ([c[0], c[1]] as [number, number]) : meio(t.pts[i - 2]!, c);
    const fim = meio(c, prox);
    ctx.moveTo(ini[0], ini[1]);
    ctx.quadraticCurveTo(c[0], c[1], fim[0], fim[1]);
    estilo(ctx, t, t.w * ((c[2] + prox[2]) / 2));
  }
  ctx.stroke();
  ctx.restore();
}

/** Cola a camada pronta do traço no desenho, com a opacidade (ou apagando, se for a borracha). */
export function colarCamada(destino: Ctx2D, camada: CanvasImageSource, t: Traco, x = 0, y = 0): void {
  destino.save();
  destino.globalCompositeOperation = t.f === 'borracha' ? 'destination-out' : 'source-over';
  destino.globalAlpha = t.f === 'borracha' ? 1 : limitar(t.a, 0, 1);
  destino.drawImage(camada, x, y);
  destino.restore();
}

/** Pinta UM traço inteiro (usado para refazer o desenho): camada do tamanho do traço, depois colar. */
export function desenharTraco(destino: Ctx2D, t: Traco, criarCamada: CriarCamada = criarCamadaPadrao): void {
  if (t.pts.length === 0) return;
  const lim = limitesDoTraco(t);
  const camada = criarCamada(lim.x1 - lim.x0, lim.y1 - lim.y0);
  const cc = camada.getContext('2d');
  if (!cc) return;
  cc.translate(-lim.x0, -lim.y0);
  pintarPonto(cc, t);
  for (let i = 1; i <= t.pts.length; i++) pintarTrecho(cc, t, i);
  colarCamada(destino, camada, t, lim.x0, lim.y0);
}

/** Pinta todos os traços, na ordem, sobre o destino (que costuma estar transparente). */
export function desenharTudo(
  destino: Ctx2D,
  tracos: readonly Traco[],
  criarCamada: CriarCamada = criarCamadaPadrao,
): void {
  for (const t of tracos) desenharTraco(destino, t, criarCamada);
}
