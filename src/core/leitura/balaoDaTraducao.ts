/**
 * ONDE FICA O BALÃO DA TRADUÇÃO (openspec `leitura-assistida`, fatia B): ancorado ao trecho, acima ou abaixo, na mesma
 * coluna, e NUNCA sobre o texto selecionado. Puro: recebe caixas em pixels da janela do app (já fora do iframe).
 */
export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Limites visíveis em que o balão pode ficar (o miolo do leitor, sem topo nem barra). */
export interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PosicaoDoBalao {
  x: number;
  y: number;
  largura: number;
  /** Altura máxima que cabe sem tocar o trecho; o conteúdo rola além disso. */
  alturaMax: number;
  lado: 'acima' | 'abaixo';
}

/** Vão entre o balão e o trecho. */
export const FOLGA_DO_BALAO = 8;
/** Largura de leitura confortável do balão. */
export const LARGURA_DO_BALAO = 360;

/**
 * A coluna do trecho: com duas colunas, a metade da área onde o centro do trecho cai; com uma, a área toda.
 * `colunas` vem do motor (1 ou 2).
 */
export function colunaDoTrecho(rect: Caixa, area: Area, colunas: 1 | 2): Area {
  if (colunas === 1) return area;
  const meio = (area.x0 + area.x1) / 2;
  const centro = rect.x + rect.w / 2;
  return centro < meio ? { ...area, x1: meio } : { ...area, x0: meio };
}

export function posicionarBalao(
  rect: Caixa,
  balao: { w: number; h: number },
  area: Area,
  coluna: Area = area,
  folga = FOLGA_DO_BALAO,
): PosicaoDoBalao {
  const largura = Math.max(120, Math.min(balao.w, LARGURA_DO_BALAO, coluna.x1 - coluna.x0 - 2 * folga));
  const centro = rect.x + rect.w / 2;
  const x = Math.round(Math.min(Math.max(centro - largura / 2, coluna.x0 + folga), coluna.x1 - folga - largura));

  const espacoAbaixo = area.y1 - (rect.y + rect.h) - folga;
  const espacoAcima = rect.y - area.y0 - folga;
  const cabeAbaixo = espacoAbaixo >= balao.h;
  const cabeAcima = espacoAcima >= balao.h;
  /* Prefere embaixo (a leitura desce); só sobe quando embaixo não cabe e em cima cabe, ou quando em cima sobra mais. */
  const abaixo = cabeAbaixo || (!cabeAcima && espacoAbaixo >= espacoAcima);
  const espaco = Math.max(0, abaixo ? espacoAbaixo : espacoAcima);
  const alturaMax = Math.floor(Math.min(balao.h, espaco));
  const y = abaixo ? rect.y + rect.h + folga : rect.y - folga - alturaMax;
  return { x, y: Math.round(y), largura: Math.round(largura), alturaMax, lado: abaixo ? 'abaixo' : 'acima' };
}

/** O balão e o trecho se sobrepõem? (o contrato testa que NUNCA.) */
export function sobrepoe(a: Caixa, b: Caixa): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
