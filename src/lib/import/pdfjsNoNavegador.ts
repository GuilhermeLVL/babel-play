/**
 * O pdfjs no navegador: o módulo e o worker só são baixados quando um PDF chega (import dinâmico), e o
 * worker vai como arquivo próprio (`?url`), fora do bundle principal. Os testes injetam o build legacy.
 */
import type { PdfjsMinimo } from './extrairDocumento';

export async function carregarPdfjs(): Promise<PdfjsMinimo> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  return pdfjs as unknown as PdfjsMinimo;
}
