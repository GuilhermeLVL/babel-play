/**
 * A IMAGEM DE CAPA que a pessoa traz ou troca (spec `docs/specs/2026-10-28-livros-capas.md`): as regras puras.
 * Quem lê os bytes, decodifica e desenha é `lib/livros/capasLocais.ts`; aqui só decide o que vale.
 *
 * O tipo vem dos PRIMEIROS BYTES, nunca do nome nem do `type` informado pelo navegador: SVG (que pode levar
 * script) e qualquer formato fora da lista são recusados antes de decodificar.
 */

export const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type TipoDeImagem = (typeof TIPOS_DE_IMAGEM)[number];

/** O arquivo de origem não passa disto (a capa guardada tem ~30 KB; a origem é só matéria-prima). */
export const TETO_DA_IMAGEM_DE_ORIGEM = 10 * 1024 * 1024;
/** Imagem com mais pixels que isto não é decodificada (uma bomba de descompressão cabe em 10 MB). */
export const TETO_DE_PIXELS = 50_000_000;
export const CAPA_LARGURA = 300;
export const CAPA_ALTURA = 450;
/** A capa reduzida não passa disto; se passar, a qualidade cai. */
export const TETO_DA_CAPA_REDUZIDA = 120 * 1024;

/** O teto das capas guardadas no aparelho: quantidade e bytes. Passou, sai a usada há mais tempo. */
export const TETO_DAS_CAPAS = { quantidade: 200, bytes: 20 * 1024 * 1024 } as const;

/** Lê o tipo pela assinatura. `null` = não é uma das quatro (SVG, AVIF, HEIC, PDF, texto…). */
export function tipoPelosBytes(b: Uint8Array): TipoDeImagem | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export type MotivoDaRecusaDaImagem = 'vazia' | 'grande' | 'tipo' | 'pixels' | 'ilegivel';

export type ValidacaoDaImagem =
  | { ok: true; tipo: TipoDeImagem }
  | { ok: false; motivo: Exclude<MotivoDaRecusaDaImagem, 'pixels' | 'ilegivel'> };

/** Confere tamanho e assinatura do arquivo escolhido (antes de qualquer decodificação). */
export function validarImagemDeOrigem(tamanho: number, primeirosBytes: Uint8Array): ValidacaoDaImagem {
  if (!tamanho) return { ok: false, motivo: 'vazia' };
  if (tamanho > TETO_DA_IMAGEM_DE_ORIGEM) return { ok: false, motivo: 'grande' };
  const tipo = tipoPelosBytes(primeirosBytes);
  return tipo ? { ok: true, tipo } : { ok: false, motivo: 'tipo' };
}

export type ModoDoAjuste = 'preencher' | 'inteira';

export interface PlanoDeDesenho {
  /** O recorte na imagem de origem. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Onde cai na capa de 300 x 450. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Como a imagem vira 2:3. `preencher` recorta o centro (a capa fica cheia); `inteira` mostra a imagem toda,
 * centralizada, sobre o fundo que quem desenha escolher (sobram faixas).
 */
export function planoDeDesenho(
  largura: number,
  altura: number,
  modo: ModoDoAjuste = 'preencher',
  saida: { largura: number; altura: number } = { largura: CAPA_LARGURA, altura: CAPA_ALTURA },
): PlanoDeDesenho {
  const alvo = saida.largura / saida.altura;
  const aspecto = largura / altura;
  if (modo === 'preencher') {
    const sw = aspecto > alvo ? altura * alvo : largura;
    const sh = aspecto > alvo ? altura : largura / alvo;
    return {
      sx: (largura - sw) / 2,
      sy: (altura - sh) / 2,
      sw,
      sh,
      dx: 0,
      dy: 0,
      dw: saida.largura,
      dh: saida.altura,
    };
  }
  const dw = aspecto > alvo ? saida.largura : saida.altura * aspecto;
  const dh = aspecto > alvo ? saida.largura / aspecto : saida.altura;
  return {
    sx: 0,
    sy: 0,
    sw: largura,
    sh: altura,
    dx: (saida.largura - dw) / 2,
    dy: (saida.altura - dh) / 2,
    dw,
    dh,
  };
}

export interface MetaDeCapa {
  id: string;
  tamanho: number;
  usadoEm: number;
}

/** Quem sai para a nova capa caber: do usado há mais tempo para o mais recente, até voltar abaixo dos tetos. */
export function capasQueSaem(
  guardadas: readonly MetaDeCapa[],
  nova: MetaDeCapa,
  teto: { quantidade: number; bytes: number } = TETO_DAS_CAPAS,
): string[] {
  const restantes = guardadas.filter((g) => g.id !== nova.id).sort((a, b) => a.usadoEm - b.usadoEm);
  let total = restantes.reduce((s, g) => s + g.tamanho, 0) + nova.tamanho;
  let quantidade = restantes.length + 1;
  const saem: string[] = [];
  for (const g of restantes) {
    if (quantidade <= teto.quantidade && total <= teto.bytes) break;
    saem.push(g.id);
    total -= g.tamanho;
    quantidade--;
  }
  return saem;
}
