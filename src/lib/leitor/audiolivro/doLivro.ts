/**
 * ABRE O AUDIOLIVRO DE UM LIVRO DO CATÁLOGO (F2), já decidido pela porta (`../audiolivroDoLivro.ts`): ponteiro +
 * manifesto do CDN, a faixa que este navegador toca e o reprodutor. A voz do catálogo (`audio.voz`) tem de ser a do
 * manifesto. Sem faixa tocável (Safari sem Opus e sem AAC), `null`: a voz do aparelho lê.
 */
import { chaveDoCapitulo } from '../../../core/leitura/audiolivro';
import type { AudioDoCatalogo } from '../../../core/livros/tipos';
import { FLAG_AUDIOLIVROS } from '../../../core/planos';
import { flagLigada } from '../../flagsCache';
import type { AudioGravadoDoLivro } from '../narrador';
import { urlParaTocar } from './capituloOffline';
import { escolherFaixa } from './faixa';
import { carregarManifesto, carregarTempos, urlDoAudio } from './manifesto';
import { criarReprodutor } from './reprodutor';

export async function abrirAudiolivro(
  idDoCatalogo: string,
  audio: AudioDoCatalogo,
): Promise<AudioGravadoDoLivro | null> {
  const base = urlDoAudio();
  if (!base) return null;
  const carregado = await carregarManifesto(idDoCatalogo, audio.voz, { base });
  if (!carregado) return null;
  const { manifesto, versao } = carregado;
  const tocar = document.createElement('audio');
  const faixa = escolherFaixa(manifesto, (tipo) => tocar.canPlayType(tipo));
  if (!faixa) return null;
  const url = (nn: number, ext: 'opus' | 'json') => `${base}/${chaveDoCapitulo(manifesto, versao, nn, ext)}`;
  const reprodutor = criarReprodutor();
  /* O capítulo baixado no aparelho toca do Cache Storage (`blob:`), sem rede. */
  const carregar = reprodutor.carregar;
  reprodutor.carregar = async (u, tempos) => carregar(await urlParaTocar(u), tempos);
  return {
    manifesto,
    reprodutor,
    urlDoCapitulo: (nn) => (faixa.ext === 'opus' ? url(nn, 'opus') : url(nn, 'json').replace(/\.json$/, '.m4a')),
    tempos: async (nn) => {
      const cap = manifesto.capitulos.find((c) => c.nn === nn);
      return cap && cap.frases > 0 ? carregarTempos(url(nn, 'json'), cap.frases, { base }) : null;
    },
    flagLigada: () => flagLigada(FLAG_AUDIOLIVROS),
  };
}
