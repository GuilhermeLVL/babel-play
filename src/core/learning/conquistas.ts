/**
 * CONQUISTAS — o catálogo e a avaliação, puros.
 *
 * Uma conquista é uma CONDIÇÃO sobre o que a pessoa já fez (métricas + recordes + coleção),
 * com um PROGRESSO legível (atual/meta) e uma RECOMPENSA fixa: Seeds, XP e, nas raras, um
 * cosmético EXCLUSIVO que a Loja não vende (tema Aurora, partícula Cometa, cursor Coroa, rastro
 * Arco-íris). O crédito das Seeds é lançado uma vez, idempotente (`conquista-<id>`), pelo
 * cliente (`lib/conquistas`) — este módulo só decide "está conquistada?" e "quanto falta?".
 *
 * Nada aqui toca storage: recebe um contexto, devolve estrutura. É o que permite testar cada
 * condição sem montar o app.
 */
import type { AppMetrics } from './contract';

export type RaridadeDaConquista = 'comum' | 'raro' | 'epico' | 'lendario';

/**
 * Ids dos cosméticos exclusivos: batem com o `id` dos itens `exclusivoDe` do catálogo — é assim
 * que `Conquistas.tsx` e `progressao.ts` acham a peça (`find((i) => i.id === cosmetico)`).
 *
 * A UNIÃO É FECHADA DE PROPÓSITO, e é ela que impede a promessa vazia: escrever aqui um id que o
 * catálogo não tem quebra a compilação, em vez de render um `find` que devolve `undefined` e uma
 * conquista que anuncia um prêmio inexistente. Alargá-la, portanto, é o ÚLTIMO passo — só depois
 * de o item existir no catálogo com um leitor que o desenhe.
 *
 * Os três novos (mudança gamificacao-sob-autoridade) fecham um buraco velho: das catorze
 * conquistas, dez pagavam só Seeds e XP, então o épico e o lendário do fim da lista rendiam o
 * mesmo TIPO de coisa que a primeira captura. Poliglota, Sem erro e Duelista passam a entregar
 * uma peça que a Loja não vende a preço nenhum — que é o que separa "conquista" de "meta".
 */
export type CosmeticoExclusivo =
  | 'tema-aurora' | 'part-cometa' | 'cur-coroa' | 'ras-arcoiris'
  | 'pack-astrologia' | 'cur-katana' | 'ras-matrix';

export interface ContextoDeConquistas {
  metricas: AppMetrics;
  nivel: number;
  /** Melhor combo por jogo (de `fetchRecordes`). */
  melhorComboPorJogo: Record<string, number>;
  /** Eventos raros vistos / existentes (colecionável de `lib/eventosDeJogo`). */
  eventosVistos: number;
  totalDeEventos: number;
  /** Idiomas distintos das sessões gravadas. */
  idiomas: number;
  /** Compras feitas na Loja (posse local). */
  compras: number;
}

export interface Conquista {
  id: string;
  nome: string;
  desc: string;
  raridade: RaridadeDaConquista;
  emoji: string;
  recompensa: { seeds: number; xp: number; cosmetico?: CosmeticoExclusivo };
  /** Progresso: `atual` sobe até `meta`; conquistada quando atual ≥ meta. */
  progresso: (ctx: ContextoDeConquistas) => { atual: number; meta: number };
}

const m = (ctx: ContextoDeConquistas) => ctx.metricas;

export const CONQUISTAS: Conquista[] = [
  { id: 'primeira-captura', nome: 'Primeira captura', desc: 'Grave ou importe a sua primeira sessão.', raridade: 'comum', emoji: '🎙️',
    recompensa: { seeds: 25, xp: 30 }, progresso: (c) => ({ atual: m(c).sessions, meta: 1 }) },
  { id: 'ouvinte', nome: 'Ouvinte', desc: 'Some 60 minutos de sessão gravada.', raridade: 'raro', emoji: '🎧',
    recompensa: { seeds: 60, xp: 80, cosmetico: 'part-cometa' }, progresso: (c) => ({ atual: Math.floor(m(c).capturaMinutos ?? 0), meta: 60 }) },
  { id: 'caderno-cheio', nome: 'Caderno cheio', desc: 'Fiche 50 palavras no caderno.', raridade: 'comum', emoji: '📒',
    recompensa: { seeds: 40, xp: 50 }, progresso: (c) => ({ atual: m(c).deckSize, meta: 50 }) },
  { id: 'revisor', nome: 'Revisor', desc: 'Acerte 100 revisões.', raridade: 'raro', emoji: '🧠',
    recompensa: { seeds: 60, xp: 80 }, progresso: (c) => ({ atual: m(c).correctReviews, meta: 100 }) },
  { id: 'sem-erro', nome: 'Sem erro', desc: 'Feche uma rodada de jogo com 3 estrelas.', raridade: 'comum', emoji: '⭐',
    recompensa: { seeds: 20, xp: 30 }, progresso: (c) => ({ atual: m(c).rodadasPerfeitas ?? 0, meta: 1 }) },
  { id: 'perfeccionista', nome: 'Perfeccionista', desc: 'Dez rodadas com 3 estrelas.', raridade: 'epico', emoji: '👑',
    recompensa: { seeds: 80, xp: 120, cosmetico: 'cur-coroa' }, progresso: (c) => ({ atual: m(c).rodadasPerfeitas ?? 0, meta: 10 }) },
  { id: 'maratonista', nome: 'Maratonista', desc: 'Sete dias seguidos de presença.', raridade: 'raro', emoji: '🔥',
    recompensa: { seeds: 50, xp: 60 }, progresso: (c) => ({ atual: m(c).maiorSequenciaPresenca ?? 0, meta: 7 }) },
  { id: 'constante', nome: 'Constante', desc: 'Trinta dias seguidos de presença.', raridade: 'lendario', emoji: '🌌',
    recompensa: { seeds: 150, xp: 200, cosmetico: 'tema-aurora' }, progresso: (c) => ({ atual: m(c).maiorSequenciaPresenca ?? 0, meta: 30 }) },
  { id: 'colecionador', nome: 'Colecionador', desc: 'Veja todos os eventos raros dos jogos.', raridade: 'epico', emoji: '🌈',
    recompensa: { seeds: 100, xp: 120, cosmetico: 'ras-arcoiris' }, progresso: (c) => ({ atual: c.eventosVistos, meta: Math.max(1, c.totalDeEventos) }) },
  { id: 'poliglota', nome: 'Poliglota', desc: 'Grave sessões em dois idiomas diferentes.', raridade: 'raro', emoji: '🌍',
    recompensa: { seeds: 40, xp: 60, cosmetico: 'pack-astrologia' }, progresso: (c) => ({ atual: c.idiomas, meta: 2 }) },
  { id: 'duelista', nome: 'Duelista', desc: 'Combo ×15 no Duelo relâmpago.', raridade: 'epico', emoji: '⚡',
    recompensa: { seeds: 50, xp: 80, cosmetico: 'ras-matrix' }, progresso: (c) => ({ atual: c.melhorComboPorJogo['blitz'] ?? 0, meta: 15 }) },
  { id: 'cliente', nome: 'Cliente', desc: 'Faça a primeira compra na Loja.', raridade: 'comum', emoji: '🛍️',
    recompensa: { seeds: 15, xp: 20 }, progresso: (c) => ({ atual: c.compras, meta: 1 }) },
  { id: 'nivel-5', nome: 'Nível 5', desc: 'Chegue ao nível 5.', raridade: 'comum', emoji: '🎯',
    recompensa: { seeds: 50, xp: 0 }, progresso: (c) => ({ atual: c.nivel, meta: 5 }) },
  { id: 'nivel-10', nome: 'Nível 10', desc: 'Chegue ao nível 10.', raridade: 'epico', emoji: '🏆',
    recompensa: { seeds: 120, xp: 0, cosmetico: 'cur-katana' }, progresso: (c) => ({ atual: c.nivel, meta: 10 }) },
];

export interface ProgressoDeConquista {
  conquista: Conquista;
  atual: number;
  meta: number;
  pct: number;
  conquistada: boolean;
}

export function progressoDasConquistas(ctx: ContextoDeConquistas): ProgressoDeConquista[] {
  return CONQUISTAS.map((conquista) => {
    const { atual, meta } = conquista.progresso(ctx);
    const limitado = Math.max(0, Math.min(meta, atual));
    return { conquista, atual: limitado, meta, pct: meta > 0 ? Math.round((limitado / meta) * 100) : 0, conquistada: atual >= meta };
  });
}

/** As conquistas que ACABARAM de ser alcançadas: alcançadas agora e ainda não registradas. */
export function avaliarConquistas(ctx: ContextoDeConquistas, jaDesbloqueadas: ReadonlySet<string>): Conquista[] {
  return progressoDasConquistas(ctx)
    .filter((p) => p.conquistada && !jaDesbloqueadas.has(p.conquista.id))
    .map((p) => p.conquista);
}

/** A conquista que dá o cosmético, se houver — a Loja usa para o cadeado "Conquista: X". */
export function conquistaDoCosmetico(cosmetico: string): Conquista | undefined {
  return CONQUISTAS.find((c) => c.recompensa.cosmetico === cosmetico);
}
