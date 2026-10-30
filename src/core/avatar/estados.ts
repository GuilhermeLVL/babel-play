/**
 * ESTADOS DO AVATAR: o que ele está fazendo (`estado`) e como está se sentindo (`emocao`).
 *
 * Os eventos vêm de quem usa o avatar (o `TtsEngine` e o intérprete, em marcos seguintes). A função é pura:
 * evento inválido para o estado atual NÃO muda nada (devolve o mesmo estado), nunca lança.
 */

export type EstadoDoAvatar = 'parado' | 'ouvindo' | 'pensando' | 'falando';
export const ESTADOS_DO_AVATAR: readonly EstadoDoAvatar[] = ['parado', 'ouvindo', 'pensando', 'falando'];

export type EmocaoDoAvatar = 'neutro' | 'feliz' | 'triste' | 'bravo' | 'surpreso' | 'relaxado';
export const EMOCOES_DO_AVATAR: readonly EmocaoDoAvatar[] = [
  'neutro',
  'feliz',
  'triste',
  'bravo',
  'surpreso',
  'relaxado',
];

export type EventoDoAvatar = 'ouvir' | 'pensar' | 'falar' | 'calar';

/** Para cada estado, o destino de cada evento aceito. O que não está na tabela é inválido. */
const TRANSICOES: Record<EstadoDoAvatar, Partial<Record<EventoDoAvatar, EstadoDoAvatar>>> = {
  parado: { ouvir: 'ouvindo', pensar: 'pensando', falar: 'falando' },
  ouvindo: { ouvir: 'ouvindo', pensar: 'pensando', falar: 'falando', calar: 'parado' },
  // Quem pensa pode ser interrompido por quem começa a falar (`ouvir`).
  pensando: { ouvir: 'ouvindo', pensar: 'pensando', falar: 'falando', calar: 'parado' },
  // Falar não vira "pensar" direto: antes termina (`calar`). `ouvir` é a interrupção da pessoa.
  falando: { ouvir: 'ouvindo', falar: 'falando', calar: 'parado' },
};

export const ehEstadoDoAvatar = (v: unknown): v is EstadoDoAvatar =>
  typeof v === 'string' && (ESTADOS_DO_AVATAR as readonly string[]).includes(v);

export const ehEmocaoDoAvatar = (v: unknown): v is EmocaoDoAvatar =>
  typeof v === 'string' && (EMOCOES_DO_AVATAR as readonly string[]).includes(v);

export const transicaoValida = (estado: EstadoDoAvatar, evento: EventoDoAvatar): boolean =>
  TRANSICOES[estado]?.[evento] !== undefined;

/** O próximo estado. Estado ou evento desconhecido (vindo de fora, sem tipo): `parado` / mesmo estado. */
export function estadoDoAvatar(estado: EstadoDoAvatar, evento: EventoDoAvatar): EstadoDoAvatar {
  if (!ehEstadoDoAvatar(estado)) return 'parado';
  return TRANSICOES[estado][evento] ?? estado;
}

/**
 * A emoção que vale: uma emoção desconhecida (ausente, texto estranho) é `neutro`. Quem não está falando nem
 * pensando volta ao `neutro`, para a cara não ficar presa numa emoção de uma fala que já acabou.
 */
export function emocaoEfetiva(estado: EstadoDoAvatar, pedida: unknown): EmocaoDoAvatar {
  if (!ehEmocaoDoAvatar(pedida)) return 'neutro';
  return estado === 'falando' || estado === 'pensando' ? pedida : pedida === 'relaxado' ? 'relaxado' : 'neutro';
}
