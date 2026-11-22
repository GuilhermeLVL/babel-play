/**
 * ESCUTA GUIADA — a ordem de ouvir e ler, frase a frase, na tela de uma sessão gravada.
 *
 * Nos níveis iniciais (A1–A2) o que funciona é trabalhar uma frase por vez, ouvindo e lendo em
 * alternância; do B1 em diante a pessoa já tem recursos para ouvir direto e abrir a transcrição só por
 * curiosidade. Por isso há três modos:
 *
 *  - `ouvir-primeiro`: ouvir com o texto oculto → ler (texto à mostra) → ouvir de novo com o texto → próxima frase;
 *  - `ler-primeiro`: ler → ouvir → próxima frase;
 *  - `livre`: o comportamento de sempre (nenhum passo, texto sempre visível).
 *
 * Lógica pura: sem React, sem DOM, sem relógio. NADA aqui mede ou premia tempo (Decreto 12.880, art. 9º):
 * quem decide quando passar é a pessoa, no próprio ritmo, e nenhum passo concede ponto, sequência ou prêmio.
 */
import type { CefrLevel } from './contract';

export type ModoDeEscuta = 'livre' | 'ouvir-primeiro' | 'ler-primeiro';

export const MODOS_DE_ESCUTA: readonly ModoDeEscuta[] = ['livre', 'ouvir-primeiro', 'ler-primeiro'];

export type EtapaDeEscuta = 'ouvir-sem-texto' | 'ler' | 'ouvir-com-texto';

const ETAPAS: Record<ModoDeEscuta, readonly EtapaDeEscuta[]> = {
  livre: [],
  'ouvir-primeiro': ['ouvir-sem-texto', 'ler', 'ouvir-com-texto'],
  'ler-primeiro': ['ler', 'ouvir-com-texto'],
};

export interface EstadoDeEscuta {
  modo: ModoDeEscuta;
  /** Índice da frase em foco. */
  frase: number;
  /** Posição dentro das etapas do modo (sempre 0 em `livre`). */
  passo: number;
}

export function ehModoDeEscuta(v: unknown): v is ModoDeEscuta {
  return typeof v === 'string' && (MODOS_DE_ESCUTA as readonly string[]).includes(v);
}

export function iniciarEscuta(modo: ModoDeEscuta, frase = 0): EstadoDeEscuta {
  return { modo, frase: Math.max(0, frase), passo: 0 };
}

/** A etapa em que a frase está; `null` em `livre`. */
export function etapaAtual(e: EstadoDeEscuta): EtapaDeEscuta | null {
  return ETAPAS[e.modo][e.passo] ?? null;
}

/** O texto da frase em foco aparece? Só fica oculto na etapa de ouvir sem texto. */
export function textoVisivel(e: EstadoDeEscuta): boolean {
  return etapaAtual(e) !== 'ouvir-sem-texto';
}

/** Trocar de frase (por qualquer meio) recomeça os passos dela. Mesma frase: nada muda. */
export function irParaFrase(e: EstadoDeEscuta, frase: number): EstadoDeEscuta {
  return frase === e.frase ? e : { ...e, frase, passo: 0 };
}

/** Trocar o modo recomeça os passos da frase em foco. */
export function trocarModo(e: EstadoDeEscuta, modo: ModoDeEscuta): EstadoDeEscuta {
  return modo === e.modo ? e : { modo, frase: e.frase, passo: 0 };
}

/** Pular direto para o texto (o toque em "Texto oculto"): vai à etapa de ler, se o modo tiver uma. */
export function revelarTexto(e: EstadoDeEscuta): EstadoDeEscuta {
  const i = ETAPAS[e.modo].indexOf('ler');
  return i < 0 || e.passo > i ? e : { ...e, passo: i };
}

export interface ResultadoDoPasso {
  estado: EstadoDeEscuta;
  /** O último passo da última frase foi concluído: não há para onde avançar. */
  terminou: boolean;
}

/**
 * "Próximo passo": anda uma etapa; na última etapa, passa à frase seguinte (de volta à primeira etapa).
 * Em `livre` não há passos: só avança de frase. Na última frase, a última etapa devolve `terminou`.
 */
export function proximoPasso(e: EstadoDeEscuta, totalDeFrases: number): ResultadoDoPasso {
  const etapas = ETAPAS[e.modo];
  if (e.passo < etapas.length - 1) return { estado: { ...e, passo: e.passo + 1 }, terminou: false };
  if (e.frase >= totalDeFrases - 1) return { estado: e, terminou: true };
  return { estado: { ...e, frase: e.frase + 1, passo: 0 }, terminou: false };
}

/** A sugestão de modo pelo nível CEFR estimado: A1–A2 e sem nível → ouvir antes de ler; B1 em diante → livre. */
export function modoSugerido(nivel: CefrLevel | null | undefined): ModoDeEscuta {
  if (!nivel || nivel === 'A1' || nivel === 'A2') return 'ouvir-primeiro';
  return 'livre';
}
