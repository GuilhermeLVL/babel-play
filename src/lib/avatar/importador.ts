/**
 * O IMPORTADOR NO NAVEGADOR ("traga o seu"): lê o arquivo da pessoa, valida (core + validador da Khronos num
 * Worker) e prepara (redução de textura para 1024 px por canvas). O arquivo NUNCA vai ao servidor: tudo acontece
 * aqui e, ao salvar, o modelo vai para o IndexedDB (`meuAvatar.ts`).
 *
 * A parte pura (leitura do GLB, tetos, cabeçalho de imagem, licença, ranking) mora em `core/avatar/importador/`.
 */
import { novoIdDoModelo } from '../../core/avatar/importador/identidade';
import {
  type GanchosDePreparo,
  prepararAvatar,
  recusarPorTamanho,
  type RelatorioDeImportacao,
  type ValidadorKhronos,
  validarAvatar,
} from '../../core/avatar/importador/validar';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { criarValidadorKhronos } from './validadorKhronos';

export interface OpcoesDeAnalise {
  /** Perfil protegido do app. O importador só é aberto para `false`, mas a regra de licença vale de qualquer jeito. */
  protegido: boolean;
  tier: TierDoAvatar;
  direitosConfirmados?: boolean;
  /** Para teste: substitui o validador da Khronos. */
  validador?: ValidadorKhronos | null;
}

export interface ResultadoDaAnalise {
  relatorio: RelatorioDeImportacao;
  /** O arquivo lido (para preparar depois). `null` quando foi recusado só pelo tamanho, sem ler. */
  bytes: Uint8Array | null;
}

export async function analisarArquivo(arquivo: Blob, op: OpcoesDeAnalise): Promise<ResultadoDaAnalise> {
  const grande = recusarPorTamanho(arquivo.size, op);
  if (grande) return { relatorio: grande, bytes: null };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const validador = op.validador === undefined ? criarValidadorKhronos() : op.validador;
  const relatorio = await validarAvatar(bytes, { ...op, validador });
  return { relatorio, bytes };
}

/** Reduz uma textura no canvas: JPEG continua JPEG; o resto vira PNG (o canvas do Safari não escreve WebP). */
export async function reduzirImagemNoCanvas(bytes: Uint8Array, mime: string, largura: number, altura: number) {
  const bmp = await createImageBitmap(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }));
  try {
    const c = document.createElement('canvas');
    c.width = largura;
    c.height = altura;
    const g = c.getContext('2d');
    if (!g) throw new Error('sem canvas');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, largura, altura);
    const saida = mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, saida, 0.9));
    if (!blob) throw new Error('canvas sem saída');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: saida };
  } finally {
    bmp.close();
  }
}

const GANCHOS: GanchosDePreparo = { reduzirImagem: reduzirImagemNoCanvas };

export interface Preparado {
  bytes: Uint8Array;
  relatorio: RelatorioDeImportacao;
  /** Id do modelo no IndexedDB (a receita aponta para ele). */
  id: string;
}

/** Depois do "pode usar": reduz as texturas grandes (se houver), revalida e devolve o arquivo final. */
export async function prepararParaUso(
  bytes: Uint8Array,
  relatorio: RelatorioDeImportacao,
  op: OpcoesDeAnalise,
  ganchos: GanchosDePreparo = GANCHOS,
): Promise<Preparado> {
  const validador = op.validador === undefined ? criarValidadorKhronos() : op.validador;
  const p = await prepararAvatar(bytes, relatorio, ganchos, { ...op, validador });
  return { bytes: p.bytes, relatorio: p.relatorio, id: novoIdDoModelo() };
}
