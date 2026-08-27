/**
 * EVENTOS DE JOGO — o inusitado, com regra.
 *
 * Dois tipos, ambos declarados AQUI (puro, rng injetado, testável) e encenados por
 * `executarEfeito` em `lib/juice.ts`:
 *
 *   RAROS: sorteados a cada ACERTO (nunca no erro — surpresa é prêmio). Probabilidades baixas de
 *   propósito: um pato de borracha atravessando a tela é ótimo UMA vez por sessão e irritante dez.
 *
 *   CONDICIONAIS: disparados por estado (combo, fever, recorde, rodada perfeita). São a escada de
 *   exagero: quanto mais raro o feito, maior a festa.
 *
 * Cada evento é uma COMPOSIÇÃO: rajadas de partículas (com onde nascem), som e efeito de tela.
 * A execução espalha as rajadas por pontos aleatórios da viewport — nada fica sempre no centro.
 */
import type { BurstKind } from './effects';
import type { SoundEvent } from './soundFx';

export interface EfeitoComposto {
  id: string;
  /** Nome mostrado no aviso/colecionável ("Você viu: Chuva de patos!"). */
  nome: string;
  /** Rajadas: cada uma nasce num ponto aleatório da tela (ou onde o próprio spec manda: chuva/travessia). */
  rajadas: Array<{ kind: BurstKind; vezes?: number }>;
  som?: SoundEvent;
  tela?: 'tremor' | 'zoom' | 'glitch' | 'flash';
  vibracao?: number[];
}

/** Eventos RAROS por acerto, com a probabilidade de cada um. A soma (~4,3%) é o teto por acerto. */
export const EVENTOS_RAROS: ReadonlyArray<{ prob: number; efeito: EfeitoComposto }> = [
  { prob: 0.02, efeito: { id: 'patos', nome: 'Chuva de patos', rajadas: [{ kind: 'patos' }], som: 'add' } },
  { prob: 0.01, efeito: { id: 'voleibol', nome: 'Bola em jogo', rajadas: [{ kind: 'voleibol' }], som: 'speak' } },
  { prob: 0.007, efeito: { id: 'coracoes', nome: 'Chuva de corações', rajadas: [{ kind: 'coracoes' }], som: 'combo' } },
  { prob: 0.004, efeito: { id: 'glitch', nome: 'Interferência', rajadas: [{ kind: 'fumaca', vezes: 2 }], som: 'error', tela: 'glitch' } },
  { prob: 0.002, efeito: { id: 'pizza', nome: 'Rodízio surpresa', rajadas: [{ kind: 'pizza' }], som: 'levelUp' } },
];

/**
 * Sorteia no máximo UM evento raro por acerto. `rng` vem de fora (Math.random em produção,
 * fixo nos testes). Devolve null na imensa maioria das vezes — e é isso que os mantém raros.
 */
export function sortearEventoRaro(rng: () => number): EfeitoComposto | null {
  const dado = rng();
  let acumulado = 0;
  for (const { prob, efeito } of EVENTOS_RAROS) {
    acumulado += prob;
    if (dado < acumulado) return efeito;
  }
  return null;
}

export interface ContextoDeJogada {
  /** Sequência de acertos DEPOIS desta jogada. */
  combo: number;
  fever: boolean;
  /** Este acerto bateu o recorde pessoal de pontos? */
  recorde?: boolean;
  /** A rodada terminou sem nenhum erro e sem dica? */
  perfeita?: boolean;
}

/** Eventos garantidos por estado. Podem acumular (combo 10 + fever, por exemplo). */
export function eventosCondicionais(ctx: ContextoDeJogada): EfeitoComposto[] {
  const lista: EfeitoComposto[] = [];
  if (ctx.combo === 10) {
    lista.push({ id: 'tempestade', nome: 'Tempestade de raios', rajadas: [{ kind: 'raios', vezes: 3 }], som: 'fever', tela: 'tremor', vibracao: [30] });
  }
  if (ctx.combo === 15) {
    lista.push({ id: 'sobrecarga', nome: 'Sobrecarga', rajadas: [{ kind: 'raios', vezes: 2 }, { kind: 'fumaca' }], tela: 'glitch', vibracao: [20, 40, 20] });
  }
  if (ctx.recorde) {
    lista.push({ id: 'fogos', nome: 'Fogos de artifício', rajadas: [{ kind: 'fogos', vezes: 4 }, { kind: 'trofeu' }], som: 'levelUp', tela: 'flash', vibracao: [40, 60, 40] });
  }
  if (ctx.perfeita) {
    lista.push({ id: 'perfeita', nome: 'Rodada impecável', rajadas: [{ kind: 'perfeito' }, { kind: 'coracoes' }], som: 'levelUp', tela: 'zoom' });
  }
  return lista;
}

/** Ids de todos os eventos existentes — o "colecionável" da antessala conta quantos já foram vistos. */
export function todosOsEventos(): string[] {
  const raros = EVENTOS_RAROS.map((e) => e.efeito.id);
  return [...raros, 'tempestade', 'sobrecarga', 'fogos', 'perfeita'];
}

const CHAVE_VISTOS = 'babel.eventos_vistos';

export function marcarEventoVisto(id: string): void {
  try {
    const atual = new Set<string>(JSON.parse(localStorage.getItem(CHAVE_VISTOS) || '[]'));
    atual.add(id);
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify([...atual]));
  } catch { /* sem storage */ }
}

export function eventosVistos(): string[] {
  try { return JSON.parse(localStorage.getItem(CHAVE_VISTOS) || '[]'); } catch { return []; }
}
