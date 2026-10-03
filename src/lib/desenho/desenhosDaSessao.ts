/**
 * OS DESENHOS DE UMA SESSÃO — o contrato entre o desenho livre da Leitura (quem grava) e a exportação
 * da sessão (quem lê, para pôr os rabiscos no PDF e no Markdown).
 *
 * ESTE ARQUIVO É O CONTRATO. A frente do desenho o preenche (persistência por sessão, no navegador);
 * a frente da exportação só chama `desenhosDaSessao`. Não mude a assinatura sem avisar as duas.
 */
import { armazemDeDesenhos, salvarPendentes } from './persistencia';
import { gerarPngDoQuadro } from './png';

/** Uma página/tela de desenho, já como imagem: o fundo é transparente e o traço tem as cores escolhidas. */
export interface DesenhoDaSessao {
  /** Como a exportação chama esta imagem ("Desenho da leitura", "Desenho 2"…). */
  rotulo: string;
  /** `data:image/png;base64,…` */
  png: string;
  /** Largura e altura em pixels do PNG, para a exportação calcular a proporção. */
  largura: number;
  altura: number;
}

/** O nome de cada quadro: o primeiro é "Desenho da leitura", os seguintes "Desenho 2", "Desenho 3"… */
export const rotuloDoQuadro = (indice: number): string =>
  indice === 0 ? 'Desenho da leitura' : `Desenho ${indice + 1}`;

/** Lê o tamanho de um PNG pelo cabeçalho (IHDR), sem precisar de canvas. */
function tamanhoDoPng(png: string): { largura: number; altura: number } | null {
  try {
    const b64 = png.slice(png.indexOf(',') + 1);
    const bin = atob(b64.slice(0, 48));
    const u32 = (o: number) =>
      ((bin.charCodeAt(o) << 24) |
        (bin.charCodeAt(o + 1) << 16) |
        (bin.charCodeAt(o + 2) << 8) |
        bin.charCodeAt(o + 3)) >>>
      0;
    const largura = u32(16);
    const altura = u32(20);
    return largura > 0 && altura > 0 ? { largura, altura } : null;
  } catch {
    return null;
  }
}

/** Os desenhos guardados desta sessão, na ordem em que foram feitos. Vazio se não há nenhum. */
export async function desenhosDaSessao(sessionId: string): Promise<DesenhoDaSessao[]> {
  try {
    // O traço recente ainda pode estar esperando o salvamento: salva antes de ler.
    await salvarPendentes(sessionId);
    const guardado = await armazemDeDesenhos().ler(sessionId);
    if (!guardado) return [];
    const saida: DesenhoDaSessao[] = [];
    guardado.quadros.forEach((q, i) => {
      if (!q.tracos?.length) return;
      if (q.png) {
        const tam = tamanhoDoPng(q.png) ?? { largura: q.largura, altura: q.altura };
        saida.push({ rotulo: rotuloDoQuadro(i), png: q.png, ...tam });
        return;
      }
      const feito = gerarPngDoQuadro(q);
      if (feito) saida.push({ rotulo: rotuloDoQuadro(i), ...feito });
    });
    return saida;
  } catch {
    return [];
  }
}
