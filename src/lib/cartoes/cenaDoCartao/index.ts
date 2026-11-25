/**
 * A CENA DO CARTÃO — a porta única (openspec `cartao-com-captura-de-tela`, flag `cartao_com_cena`).
 *
 * UM quadro da tela compartilhada, que a pessoa viu, cobriu onde quis e mandou guardar, SÓ NESTE APARELHO (IndexedDB, teto
 * de 100 MB, expulsão do mais antigo). Este módulo não fala com a rede: não existe rota de servidor para imagem de cartão
 * (o teste `cena-do-cartao.test.ts` varre `server/routes`) e o adaptador "conta" do áudio não recebe este tipo.
 *
 * TRAVAS, na ordem:
 *  1. flag `cartao_com_cena` ligada (desligada de fábrica);
 *  2. fora do perfil protegido (`perfilProtegido()`: menor, 16-17 e idade não declarada ficam de fora na v1);
 *  3. gesto explícito: o botão tira o quadro, a folha mostra, e nada é gravado antes de "Guardar".
 *
 * DECISÃO ASSUMIDA (25/11, recomendação do dono, item 33): construir só para adulto e só local, depois do áudio.
 */
import { FLAG_CARTAO_COM_CENA } from '../../../core/planos';
import { flagLigada } from '../../flagsCache';
import { aoMudarIdentidade } from '../../identidade';
import { perfilProtegido } from '../../protecaoDoMenor';
import { criarArmazemDeAudioDoCartao } from '../audioDoCartao/armazem';

/** O teto por aparelho (100 MB): ~2.500 quadros de 40 KB. */
export const TETO_DAS_CENAS_BYTES = 100 * 1024 * 1024;
/** Um quadro de 480 px em WebP tem ~40 KB; acima disto não é uma cena desta tela. */
export const MAIOR_CENA_BYTES = 256 * 1024;

/** O armazém das cenas: o mesmo molde do áudio, outro banco, SÓ adaptador local. */
export const armazemDeCenas = (() => {
  let a: ReturnType<typeof criarArmazemDeAudioDoCartao> | null = null;
  return () => {
    if (!a) {
      const armazem = criarArmazemDeAudioDoCartao({
        banco: 'babel-cena-do-cartao',
        teto: TETO_DAS_CENAS_BYTES,
        maiorBytes: MAIOR_CENA_BYTES,
        tipoPadrao: 'image/webp',
      });
      a = armazem;
      /* Trocar de conta neste aparelho apaga tudo: a imagem de uma pessoa não espera a próxima conta. */
      if (typeof window !== 'undefined')
        aoMudarIdentidade((_depois, antes) => {
          if (antes !== 'carregando') void armazem.apagarTudo();
        });
    }
    return a;
  };
})();

/** A função existe para esta pessoa agora: flag ligada E fora do perfil protegido. Sem isso, nenhuma tela muda. */
export function cenaDoCartaoAtiva(): boolean {
  return flagLigada(FLAG_CARTAO_COM_CENA) && !perfilProtegido();
}

/** Guarda a cena (já coberta e codificada) no cartão. Devolve se guardou. Nunca lança. */
export async function guardarCenaDoCartao(cartaoId: string, imagem: Blob): Promise<boolean> {
  if (!cenaDoCartaoAtiva() || !cartaoId) return false;
  /* `durMs` não existe para imagem: o armazém compartilhado o guarda como 0. */
  return armazemDeCenas().gravar(cartaoId, { audio: imagem, durMs: 0 });
}

/** A cena do cartão, se houver (e a função estiver ativa para esta pessoa). */
export async function abrirCenaDoCartao(cartaoId: string): Promise<Blob | null> {
  if (!cartaoId || !cenaDoCartaoAtiva()) return null;
  return (await armazemDeCenas().abrir(cartaoId))?.audio ?? null;
}

/** "Remover a imagem" e excluir o cartão. Vale mesmo com a flag desligada depois (não deixa sobra). */
export async function apagarCenaDoCartao(cartaoId: string): Promise<void> {
  if (cartaoId) await armazemDeCenas().apagar(cartaoId);
}

/** Um retângulo a cobrir, em frações (0 a 1) do quadro: independe do tamanho do canvas. */
export interface Cobertura {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pinta cada cobertura de preto OPACO no canvas: o pixel coberto deixa de existir no arquivo que será codificado. */
export function cobrirNoCanvas(canvas: HTMLCanvasElement, coberturas: ReadonlyArray<Cobertura>): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !coberturas.length) return;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.globalAlpha = 1;
  for (const c of coberturas) {
    const x = Math.max(0, Math.min(1, c.x));
    const y = Math.max(0, Math.min(1, c.y));
    const w = Math.max(0, Math.min(1 - x, c.w));
    const h = Math.max(0, Math.min(1 - y, c.h));
    ctx.fillRect(
      Math.floor(x * canvas.width),
      Math.floor(y * canvas.height),
      Math.ceil(w * canvas.width),
      Math.ceil(h * canvas.height),
    );
  }
  ctx.restore();
}

/** Codifica o canvas em WebP q 0,6 (JPEG onde o navegador não tem WebP). `null` se nada saiu. */
export async function codificarCena(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const para = (tipo: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, 0.6));
  const webp = await para('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  return (await para('image/jpeg')) ?? webp;
}
