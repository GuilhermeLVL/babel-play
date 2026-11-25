/**
 * DA FALA AO CARTÃO (openspec `cartao-com-audio-do-trecho`, tarefa 2.3): quando a palavra é salva na captura, acha a fala
 * de onde a frase veio (a mais recente cujo texto bate) e guarda o clipe dela no cartão.
 *
 * O anel (`captura/audioDasFalas.ts`) só tem as falas recentes; palavra salva depois que a fala saiu do anel fica sem
 * clipe (o cartão segue pelo trecho da sessão, quando existe). Nunca lança nem atrasa o salvamento.
 */
import { pcmDaFala } from '../../captura/audioDasFalas';
import { audioDoCartaoAtivo, guardarClipeDoCartao } from './index';

const normal = (t: string): string => t.toLowerCase().replace(/\s+/g, ' ').trim();

/** A fala mais recente cujo texto contém a frase (ou é contida por ela). `null` = nenhuma. */
export function acharFalaDaFrase(
  frase: string,
  segmentos: ReadonlyArray<{ id: string; originalText: string }>,
): string | null {
  const alvo = normal(frase);
  if (alvo.length < 2) return null;
  for (let i = segmentos.length - 1; i >= 0; i--) {
    const t = normal(segmentos[i].originalText);
    if (t && (t.includes(alvo) || alvo.includes(t))) return segmentos[i].id;
  }
  return null;
}

/** Guarda o clipe da fala da frase no cartão recém-criado. Devolve se guardou. */
export async function guardarClipeDaFraseSalva(
  cartaoId: string,
  frase: string,
  segmentos: ReadonlyArray<{ id: string; originalText: string }>,
): Promise<boolean> {
  if (!audioDoCartaoAtivo()) return false;
  const id = acharFalaDaFrase(frase, segmentos);
  const fala = id ? pcmDaFala(id) : null;
  return fala ? guardarClipeDoCartao(cartaoId, fala.pcm, fala.sr) : false;
}
