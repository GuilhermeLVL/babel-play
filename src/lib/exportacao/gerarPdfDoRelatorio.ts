/**
 * `gerarPdfDoRelatorio(modelo)` — a interface do PDF.
 *
 * Implementação atual: ROTA DE IMPRESSÃO. A página imprimível entra num iframe invisível e o
 * navegador abre a impressão; "Salvar como PDF" gera o arquivo, com as fontes do sistema (árabe e
 * CJK incluídos). Quando o aparelho não imprime (headset), baixa a própria página `.html`, que abre
 * e imprime em qualquer computador. Trocar por uma biblioteca de PDF depois é mudar só este arquivo.
 */
import type { ModeloDoRelatorio } from './modeloDoRelatorio';
import { paraHtmlImprimivel } from './paraHtmlImprimivel';

export type ViaDoPdf = 'impressao' | 'html';

export async function gerarPdfDoRelatorio(
  modelo: ModeloDoRelatorio,
  baixarHtml: (html: string, nome: string) => void,
): Promise<ViaDoPdf> {
  const html = paraHtmlImprimivel(modelo);
  if (typeof window === 'undefined' || typeof window.print !== 'function') {
    baixarHtml(html, `${modelo.nomeDoArquivo}.html`);
    return 'html';
  }
  const quadro = document.createElement('iframe');
  quadro.setAttribute('aria-hidden', 'true');
  quadro.setAttribute('data-exportacao-pdf', '');
  quadro.style.cssText =
    'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none';
  quadro.srcdoc = html;
  const pronto = new Promise<void>((ok) => {
    quadro.onload = () => ok();
  });
  document.body.appendChild(quadro);
  await pronto;
  const jan = quadro.contentWindow;
  if (!jan) {
    quadro.remove();
    baixarHtml(html, `${modelo.nomeDoArquivo}.html`);
    return 'html';
  }
  /* As imagens (desenhos) precisam estar decodificadas, ou saem em branco. */
  await Promise.all([...jan.document.images].map((i) => i.decode().catch(() => undefined)));
  const limpar = () => window.setTimeout(() => quadro.remove(), 500);
  jan.addEventListener('afterprint', limpar, { once: true });
  try {
    jan.focus();
    jan.print();
  } catch {
    quadro.remove();
    baixarHtml(html, `${modelo.nomeDoArquivo}.html`);
    return 'html';
  }
  /* Rede de segurança: alguns navegadores não disparam `afterprint` no iframe. */
  window.setTimeout(() => quadro.isConnected && quadro.remove(), 120_000);
  return 'impressao';
}
