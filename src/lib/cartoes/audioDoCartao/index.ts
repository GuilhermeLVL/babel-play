/**
 * O ÁUDIO DO CARTÃO — a porta única (openspec `cartao-com-audio-do-trecho`, flag `cartao_com_audio`).
 *
 * Tudo atrás da flag (desligada de fábrica) e da escolha da pessoa ("Áudio dos cartões": só neste aparelho, ou
 * não guardar). O destino é SÓ O APARELHO (`armazem.ts`); nada sobe ao servidor nem a provedor de IA.
 *
 * DECISÃO ASSUMIDA (25/11, recomendações do dono): o padrão é "Só neste aparelho" para todos; "Na minha conta" (R2) e a
 * rota do servidor não entram nesta entrega (retenção zero no servidor; ver tasks.md, seção 3).
 */
import { FLAG_CARTAO_COM_AUDIO } from '../../../core/planos';
import { flagLigada } from '../../flagsCache';
import { armazemDeAudioDoCartao } from './armazem';
import { codificarClipe } from './codificar';
import { recortarClipe } from './recorte';

export type DestinoDoAudio = 'aparelho' | 'nao';

const CHAVE = 'cartoes.audioDoCartao';

export function lerDestinoDoAudio(): DestinoDoAudio {
  try {
    return localStorage.getItem(CHAVE) === 'nao' ? 'nao' : 'aparelho';
  } catch {
    return 'aparelho';
  }
}

export function gravarDestinoDoAudio(d: DestinoDoAudio): void {
  try {
    localStorage.setItem(CHAVE, d);
  } catch {
    /* sem localStorage a escolha vale até recarregar */
  }
}

/** A flag está ligada E a pessoa não escolheu "Não guardar". Sem isso, nenhuma tela muda. */
export function audioDoCartaoAtivo(): boolean {
  return flagLigada(FLAG_CARTAO_COM_AUDIO) && lerDestinoDoAudio() === 'aparelho';
}

/**
 * Corta, codifica e guarda o clipe do cartão. Devolve se guardou (falso: flag desligada, fala curta demais, sem IndexedDB).
 * Nunca lança: o cartão vale sem clipe.
 */
export async function guardarClipeDoCartao(cartaoId: string, pcm: Float32Array, sr: number): Promise<boolean> {
  if (!audioDoCartaoAtivo()) return false;
  try {
    const corte = recortarClipe(pcm, sr);
    if (!corte) return false;
    return await armazemDeAudioDoCartao().gravar(cartaoId, await codificarClipe(corte));
  } catch {
    return false;
  }
}

/** O áudio do cartão, se houver (e a flag estiver ligada). */
export async function abrirClipeDoCartao(cartaoId: string): Promise<Blob | null> {
  if (!cartaoId || !audioDoCartaoAtivo()) return null;
  return (await armazemDeAudioDoCartao().abrir(cartaoId))?.audio ?? null;
}

/** Excluir o cartão exclui o clipe. Vale mesmo com a flag desligada depois (não deixa sobra). */
export async function apagarClipeDoCartao(cartaoId: string): Promise<void> {
  if (cartaoId) await armazemDeAudioDoCartao().apagar(cartaoId);
}
