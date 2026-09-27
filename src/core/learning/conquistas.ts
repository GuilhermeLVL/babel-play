/**
 * CONQUISTAS — o catálogo e a avaliação, puros.
 *
 * Uma conquista é uma CONDIÇÃO sobre o que a pessoa já fez (métricas + recordes + coleção),
 * com um PROGRESSO legível (atual/meta) e uma RECOMPENSA fixa: Seeds, XP e, nas raras, um
 * cosmético EXCLUSIVO que a Loja não vende (tema Aurora, partícula Cometa, rastros e, no ouro,
 * uma moldura ou um título). O crédito das Seeds é lançado uma vez, idempotente (`conquista-<id>`), pelo
 * cliente (`lib/conquistas`) — este módulo só decide "está conquistada?" e "quanto falta?".
 *
 * Nada aqui toca storage: recebe um contexto, devolve estrutura. É o que permite testar cada
 * condição sem montar o app.
 */
import type { NivelDeMaestria } from '../maestria';
import type { MinigameId } from '../minigames/types';
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
 *
 * RECOMPENSAS v2 (27/09): `cur-coroa` (Perfeccionista), `pack-astrologia` (Poliglota) e
 * `cur-katana` (Nível 10) saíram com o corte de cursores e packs de emoji. As três conquistas
 * continuam pagando Seeds e XP. Na onda 5 a peça rara passou a ser do degrau OURO de cada série:
 * uma moldura ou um título (`core/catalogoConquistas.ts`).
 */
export type CosmeticoExclusivo =
  | 'tema-aurora'
  | 'part-cometa'
  | 'ras-arcoiris'
  | 'ras-matrix'
  /* As molduras e os títulos do OURO (recompensas v2, onda 5) — `core/catalogoConquistas.ts`. */
  | 'moldura-conquista-biblioteca'
  | 'titulo-conquista-memoria'
  | 'moldura-conquista-antena'
  | 'titulo-conquista-ouvido'
  | 'titulo-conquista-impecavel'
  | 'moldura-conquista-arcade'
  | 'titulo-conquista-inabalavel'
  | 'moldura-conquista-calendario'
  | 'titulo-conquista-veterano';

/** Os quatro pilares da grade (spec 9). A ordem é a da tela. */
export type PilarDeConquista = 'vocabulario' | 'escuta' | 'jogos' | 'constancia';
export const PILARES_DE_CONQUISTA: ReadonlyArray<{ id: PilarDeConquista; nome: string }> = [
  { id: 'vocabulario', nome: 'Vocabulário' },
  { id: 'escuta', nome: 'Escuta' },
  { id: 'jogos', nome: 'Jogos' },
  { id: 'constancia', nome: 'Constância' },
];

/** Degrau da série (100/500/2.000 palavras…). Ausente = conquista avulsa. */
export type NivelDaConquista = 'bronze' | 'prata' | 'ouro';

/**
 * O NOME DO ÍCONE LUCIDE de cada conquista. O core não importa `lucide-react` (fronteira do núcleo
 * isomórfico); o nome vive aqui e `components/iconesDaConquista.ts` o traduz para o componente —
 * um `Record<IconeDaConquista, LucideIcon>` que não compila se um nome ficar sem ícone.
 */
export type IconeDaConquista =
  | 'BookmarkPlus'
  | 'BookOpen'
  | 'Library'
  | 'Landmark'
  | 'Lightbulb'
  | 'Brain'
  | 'BrainCircuit'
  | 'Shield'
  | 'Crosshair'
  | 'Mic'
  | 'Headphones'
  | 'Radio'
  | 'RadioTower'
  | 'Pickaxe'
  | 'Globe'
  | 'Languages'
  | 'Ear'
  | 'AudioLines'
  | 'Music'
  | 'Star'
  | 'Crown'
  | 'Gem'
  | 'Medal'
  | 'Compass'
  | 'Shapes'
  | 'Joystick'
  | 'GraduationCap'
  | 'Zap'
  | 'Rocket'
  | 'Rainbow'
  | 'CalendarPlus'
  | 'CalendarDays'
  | 'Flame'
  | 'Mountain'
  | 'Repeat'
  | 'CalendarCheck'
  | 'Target'
  | 'Trophy'
  | 'ChevronsUp'
  | 'ShoppingBag';

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
  /**
   * Nível de maestria por jogo (recompensas v2). No servidor e no espelho sai de `maestriaPorJogo`
   * sobre as linhas gravadas; no navegador, dos níveis que o servidor já creditou. Ausente = zero.
   */
  maestria?: Partial<Record<MinigameId, NivelDeMaestria>>;
}

export interface Conquista {
  id: string;
  nome: string;
  desc: string;
  pilar: PilarDeConquista;
  raridade: RaridadeDaConquista;
  icone: IconeDaConquista;
  nivel?: NivelDaConquista;
  /** Secreta: a grade mostra só a `dica` até ser feita. No máximo três. */
  secreta?: boolean;
  dica?: string;
  recompensa: { seeds: number; xp: number; cosmetico?: CosmeticoExclusivo };
  /** Progresso: `atual` sobe até `meta`; conquistada quando atual ≥ meta. */
  progresso: (ctx: ContextoDeConquistas) => { atual: number; meta: number };
}

const m = (ctx: ContextoDeConquistas) => ctx.metricas;
const JOGOS_DE_ESCUTA: readonly MinigameId[] = ['escuta', 'ditado', 'karaoke'];
/** Quantos jogos têm maestria ≥ `nivel` (só entre `jogos`, quando dado). */
function jogosNoNivel(c: ContextoDeConquistas, nivel: number, jogos?: readonly MinigameId[]): number {
  return Object.entries(c.maestria ?? {}).filter(
    ([j, n]) => (!jogos || jogos.includes(j as MinigameId)) && (n ?? 0) >= nivel,
  ).length;
}
/** Pré-requisitos simultâneos: `atual` = quantos valem. */
const requisitos = (...rs: boolean[]) => ({ atual: rs.filter(Boolean).length, meta: rs.length });

/**
 * AS 40 CONQUISTAS (recompensas v2, onda 5 — spec 9). Regras que a lista cumpre, e que
 * `tests/conquistas-v2.test.ts` trava:
 *
 *  · TUDO CONFERÍVEL: cada condição lê só o que o servidor mede (métricas, nível, recordes, compras,
 *    maestria das linhas gravadas). O Colecionador é a exceção de régua (`progressoNoServidor`).
 *  · NADA POR TEMPO: nenhuma lê minutos de sessão, de fala, de escuta ou presença (Decreto 12.880,
 *    art. 9º). O Ouvinte trocou os 60 minutos gravados por 5 sessões.
 *  · OS 14 IDS ANTIGOS FICAM, com a mesma recompensa: quem já tinha continua tendo.
 *  · OURO dá moldura ou título que a Loja não vende (`core/catalogoConquistas.ts`).
 *  · As Seeds saem uma vez só por conquista: o total está em `docs/economia-v2.md`.
 */
export const CONQUISTAS: Conquista[] = [
  /* ── VOCABULÁRIO ── */
  { id: 'primeira-palavra', nome: 'Primeira palavra', desc: 'Fiche a primeira palavra no caderno.', pilar: 'vocabulario', raridade: 'comum', icone: 'BookmarkPlus',
    recompensa: { seeds: 10, xp: 15 }, progresso: (c) => ({ atual: m(c).deckSize, meta: 1 }) },
  { id: 'caderno-cheio', nome: 'Caderno cheio', desc: 'Fiche 50 palavras no caderno.', pilar: 'vocabulario', raridade: 'comum', icone: 'BookOpen', nivel: 'bronze',
    recompensa: { seeds: 40, xp: 50 }, progresso: (c) => ({ atual: m(c).deckSize, meta: 50 }) },
  { id: 'caderno-300', nome: 'Estante', desc: 'Fiche 300 palavras no caderno.', pilar: 'vocabulario', raridade: 'raro', icone: 'Library', nivel: 'prata',
    recompensa: { seeds: 80, xp: 120 }, progresso: (c) => ({ atual: m(c).deckSize, meta: 300 }) },
  { id: 'caderno-1000', nome: 'Biblioteca', desc: 'Fiche 1.000 palavras no caderno.', pilar: 'vocabulario', raridade: 'epico', icone: 'Landmark', nivel: 'ouro',
    recompensa: { seeds: 150, xp: 200, cosmetico: 'moldura-conquista-biblioteca' }, progresso: (c) => ({ atual: m(c).deckSize, meta: 1000 }) },
  { id: 'primeira-lembranca', nome: 'Primeira lembrança', desc: 'Acerte a primeira revisão.', pilar: 'vocabulario', raridade: 'comum', icone: 'Lightbulb',
    recompensa: { seeds: 10, xp: 15 }, progresso: (c) => ({ atual: m(c).correctReviews, meta: 1 }) },
  { id: 'revisor', nome: 'Revisor', desc: 'Acerte 100 revisões.', pilar: 'vocabulario', raridade: 'raro', icone: 'Brain', nivel: 'bronze',
    recompensa: { seeds: 60, xp: 80 }, progresso: (c) => ({ atual: m(c).correctReviews, meta: 100 }) },
  { id: 'revisor-500', nome: 'Memória viva', desc: 'Acerte 500 revisões.', pilar: 'vocabulario', raridade: 'epico', icone: 'BrainCircuit', nivel: 'prata',
    recompensa: { seeds: 100, xp: 150 }, progresso: (c) => ({ atual: m(c).correctReviews, meta: 500 }) },
  { id: 'revisor-2000', nome: 'Memória de ferro', desc: 'Acerte 2.000 revisões.', pilar: 'vocabulario', raridade: 'lendario', icone: 'Shield', nivel: 'ouro',
    recompensa: { seeds: 150, xp: 250, cosmetico: 'titulo-conquista-memoria' }, progresso: (c) => ({ atual: m(c).correctReviews, meta: 2000 }) },
  { id: 'mira-fina', nome: 'Mira fina', desc: 'Faça 200 revisões com 95% de acerto ou mais.', pilar: 'vocabulario', raridade: 'epico', icone: 'Crosshair',
    secreta: true, dica: 'Quantidade não é tudo.',
    recompensa: { seeds: 80, xp: 120 }, /* Acerto medido por CONTAGEM (revisões certas ÷ feitas), e não por `accuracy`: o espelho sem conta
       soma itens de jogo na `accuracy`, e as duas pontas precisam decidir igual. */
    progresso: (c) => requisitos(m(c).reviews >= 200, m(c).reviews > 0 && m(c).correctReviews >= 0.95 * m(c).reviews) },

  /* ── ESCUTA ── */
  { id: 'primeira-captura', nome: 'Primeira captura', desc: 'Grave ou importe a sua primeira sessão.', pilar: 'escuta', raridade: 'comum', icone: 'Mic',
    recompensa: { seeds: 25, xp: 30 }, progresso: (c) => ({ atual: m(c).sessions, meta: 1 }) },
  { id: 'ouvinte', nome: 'Ouvinte', desc: 'Grave ou importe 5 sessões.', pilar: 'escuta', raridade: 'raro', icone: 'Headphones', nivel: 'bronze',
    recompensa: { seeds: 60, xp: 80, cosmetico: 'part-cometa' }, progresso: (c) => ({ atual: m(c).sessions, meta: 5 }) },
  { id: 'capturas-25', nome: 'Frequentador', desc: 'Grave ou importe 25 sessões.', pilar: 'escuta', raridade: 'raro', icone: 'Radio', nivel: 'prata',
    recompensa: { seeds: 80, xp: 120 }, progresso: (c) => ({ atual: m(c).sessions, meta: 25 }) },
  { id: 'capturas-100', nome: 'Antena ligada', desc: 'Grave ou importe 100 sessões.', pilar: 'escuta', raridade: 'epico', icone: 'RadioTower', nivel: 'ouro',
    recompensa: { seeds: 150, xp: 200, cosmetico: 'moldura-conquista-antena' }, progresso: (c) => ({ atual: m(c).sessions, meta: 100 }) },
  { id: 'garimpeiro', nome: 'Garimpeiro', desc: 'Salve 50 palavras novas de sessões gravadas.', pilar: 'escuta', raridade: 'raro', icone: 'Pickaxe',
    recompensa: { seeds: 50, xp: 60 }, progresso: (c) => ({ atual: m(c).palavrasSalvasPremiadas ?? 0, meta: 50 }) },
  { id: 'poliglota', nome: 'Poliglota', desc: 'Grave sessões em dois idiomas diferentes.', pilar: 'escuta', raridade: 'raro', icone: 'Globe',
    recompensa: { seeds: 40, xp: 60 }, progresso: (c) => ({ atual: c.idiomas, meta: 2 }) },
  { id: 'trilingue', nome: 'Trilíngue', desc: 'Grave sessões em três idiomas diferentes.', pilar: 'escuta', raridade: 'epico', icone: 'Languages',
    recompensa: { seeds: 80, xp: 120 }, progresso: (c) => ({ atual: c.idiomas, meta: 3 }) },
  { id: 'ouvido-afiado', nome: 'Ouvido afiado', desc: 'Chegue ao Bronze de maestria em Qual foi?, Ditado ou Karaokê.', pilar: 'escuta', raridade: 'comum', icone: 'Ear', nivel: 'bronze',
    recompensa: { seeds: 30, xp: 40 }, progresso: (c) => ({ atual: Math.min(1, jogosNoNivel(c, 1, JOGOS_DE_ESCUTA)), meta: 1 }) },
  { id: 'ouvido-treinado', nome: 'Ouvido treinado', desc: 'Chegue à Prata de maestria nos três jogos de escuta.', pilar: 'escuta', raridade: 'raro', icone: 'AudioLines', nivel: 'prata',
    recompensa: { seeds: 80, xp: 120 }, progresso: (c) => ({ atual: jogosNoNivel(c, 2, JOGOS_DE_ESCUTA), meta: 3 }) },
  { id: 'ouvido-absoluto', nome: 'Ouvido absoluto', desc: 'Chegue ao Ouro de maestria nos três jogos de escuta.', pilar: 'escuta', raridade: 'lendario', icone: 'Music', nivel: 'ouro',
    recompensa: { seeds: 150, xp: 250, cosmetico: 'titulo-conquista-ouvido' }, progresso: (c) => ({ atual: jogosNoNivel(c, 3, JOGOS_DE_ESCUTA), meta: 3 }) },

  /* ── JOGOS ── */
  { id: 'sem-erro', nome: 'Sem erro', desc: 'Feche uma rodada de jogo com 3 estrelas.', pilar: 'jogos', raridade: 'comum', icone: 'Star', nivel: 'bronze',
    recompensa: { seeds: 20, xp: 30 }, progresso: (c) => ({ atual: m(c).rodadasPerfeitas ?? 0, meta: 1 }) },
  { id: 'perfeccionista', nome: 'Perfeccionista', desc: 'Dez rodadas com 3 estrelas.', pilar: 'jogos', raridade: 'epico', icone: 'Crown', nivel: 'prata',
    recompensa: { seeds: 80, xp: 120 }, progresso: (c) => ({ atual: m(c).rodadasPerfeitas ?? 0, meta: 10 }) },
  { id: 'impecavel', nome: 'Impecável', desc: 'Cinquenta rodadas com 3 estrelas.', pilar: 'jogos', raridade: 'lendario', icone: 'Gem', nivel: 'ouro',
    recompensa: { seeds: 150, xp: 250, cosmetico: 'titulo-conquista-impecavel' }, progresso: (c) => ({ atual: m(c).rodadasPerfeitas ?? 0, meta: 50 }) },
  { id: 'primeiro-bronze', nome: 'Primeira medalha', desc: 'Chegue ao Bronze de maestria em um jogo.', pilar: 'jogos', raridade: 'comum', icone: 'Medal',
    recompensa: { seeds: 20, xp: 30 }, progresso: (c) => ({ atual: Math.min(1, jogosNoNivel(c, 1)), meta: 1 }) },
  { id: 'explorador', nome: 'Explorador', desc: 'Chegue ao Bronze de maestria em 4 jogos.', pilar: 'jogos', raridade: 'raro', icone: 'Compass', nivel: 'bronze',
    recompensa: { seeds: 40, xp: 60 }, progresso: (c) => ({ atual: jogosNoNivel(c, 1), meta: 4 }) },
  { id: 'versatil', nome: 'Versátil', desc: 'Chegue ao Bronze de maestria em 8 jogos.', pilar: 'jogos', raridade: 'epico', icone: 'Shapes', nivel: 'prata',
    recompensa: { seeds: 80, xp: 120 }, progresso: (c) => ({ atual: jogosNoNivel(c, 1), meta: 8 }) },
  { id: 'arcade', nome: 'Fliperama', desc: 'Chegue ao Bronze de maestria em 12 jogos.', pilar: 'jogos', raridade: 'epico', icone: 'Joystick', nivel: 'ouro',
    recompensa: { seeds: 150, xp: 250, cosmetico: 'moldura-conquista-arcade' }, progresso: (c) => ({ atual: jogosNoNivel(c, 1), meta: 12 }) },
  { id: 'mestre-de-um', nome: 'Mestre', desc: 'Chegue ao nível Mestre de maestria em um jogo.', pilar: 'jogos', raridade: 'epico', icone: 'GraduationCap',
    recompensa: { seeds: 120, xp: 200 }, progresso: (c) => ({ atual: Math.min(1, jogosNoNivel(c, 5)), meta: 1 }) },
  { id: 'duelista', nome: 'Duelista', desc: 'Combo ×15 no Duelo relâmpago.', pilar: 'jogos', raridade: 'epico', icone: 'Zap',
    recompensa: { seeds: 50, xp: 80, cosmetico: 'ras-matrix' }, progresso: (c) => ({ atual: c.melhorComboPorJogo['blitz'] ?? 0, meta: 15 }) },
  { id: 'imparavel', nome: 'Imparável', desc: 'Combo ×20 no Duelo relâmpago.', pilar: 'jogos', raridade: 'epico', icone: 'Rocket',
    secreta: true, dica: 'O Duelo não acaba no ×15.',
    recompensa: { seeds: 60, xp: 100 }, progresso: (c) => ({ atual: c.melhorComboPorJogo['blitz'] ?? 0, meta: 20 }) },
  { id: 'colecionador', nome: 'Colecionador', desc: 'Veja todos os eventos raros dos jogos.', pilar: 'jogos', raridade: 'epico', icone: 'Rainbow',
    recompensa: { seeds: 100, xp: 120, cosmetico: 'ras-arcoiris' }, progresso: (c) => ({ atual: c.eventosVistos, meta: Math.max(1, c.totalDeEventos) }) },

  /* ── CONSTÂNCIA ── (dia de prática = revisão, rodada ou palavra salva; abrir o app não conta) */
  { id: 'tres-dias', nome: 'Três dias', desc: 'Pratique três dias seguidos.', pilar: 'constancia', raridade: 'comum', icone: 'CalendarPlus',
    recompensa: { seeds: 15, xp: 20 }, progresso: (c) => ({ atual: m(c).maiorSequenciaPresenca ?? 0, meta: 3 }) },
  { id: 'maratonista', nome: 'Maratonista', desc: 'Sete dias seguidos de prática.', pilar: 'constancia', raridade: 'raro', icone: 'CalendarDays', nivel: 'bronze',
    recompensa: { seeds: 50, xp: 60 }, progresso: (c) => ({ atual: m(c).maiorSequenciaPresenca ?? 0, meta: 7 }) },
  { id: 'constante', nome: 'Constante', desc: 'Trinta dias seguidos de prática.', pilar: 'constancia', raridade: 'lendario', icone: 'Flame', nivel: 'prata',
    recompensa: { seeds: 150, xp: 200, cosmetico: 'tema-aurora' }, progresso: (c) => ({ atual: m(c).maiorSequenciaPresenca ?? 0, meta: 30 }) },
  { id: 'inabalavel', nome: 'Inabalável', desc: 'Cem dias seguidos de prática.', pilar: 'constancia', raridade: 'lendario', icone: 'Mountain', nivel: 'ouro',
    secreta: true, dica: 'Depois dos trinta, continue.',
    recompensa: { seeds: 200, xp: 300, cosmetico: 'titulo-conquista-inabalavel' }, progresso: (c) => ({ atual: m(c).maiorSequenciaPresenca ?? 0, meta: 100 }) },
  { id: 'ritmo', nome: 'Ritmo', desc: 'Complete 4 semanas de prática (marcos de 7 dias seguidos).', pilar: 'constancia', raridade: 'raro', icone: 'Repeat', nivel: 'prata',
    recompensa: { seeds: 60, xp: 80 }, progresso: (c) => ({ atual: m(c).sequencias7 ?? 0, meta: 4 }) },
  { id: 'habito', nome: 'Hábito', desc: 'Complete 12 semanas de prática (marcos de 7 dias seguidos).', pilar: 'constancia', raridade: 'epico', icone: 'CalendarCheck', nivel: 'ouro',
    recompensa: { seeds: 150, xp: 200, cosmetico: 'moldura-conquista-calendario' }, progresso: (c) => ({ atual: m(c).sequencias7 ?? 0, meta: 12 }) },
  { id: 'nivel-5', nome: 'Nível 5', desc: 'Chegue ao nível 5.', pilar: 'constancia', raridade: 'comum', icone: 'Target', nivel: 'bronze',
    recompensa: { seeds: 50, xp: 0 }, progresso: (c) => ({ atual: c.nivel, meta: 5 }) },
  { id: 'nivel-10', nome: 'Nível 10', desc: 'Chegue ao nível 10.', pilar: 'constancia', raridade: 'epico', icone: 'Trophy', nivel: 'prata',
    recompensa: { seeds: 120, xp: 0 }, progresso: (c) => ({ atual: c.nivel, meta: 10 }) },
  { id: 'nivel-25', nome: 'Nível 25', desc: 'Chegue ao nível 25.', pilar: 'constancia', raridade: 'lendario', icone: 'ChevronsUp', nivel: 'ouro',
    recompensa: { seeds: 200, xp: 0, cosmetico: 'titulo-conquista-veterano' }, progresso: (c) => ({ atual: c.nivel, meta: 25 }) },
  { id: 'cliente', nome: 'Cliente', desc: 'Faça a primeira compra na Loja.', pilar: 'constancia', raridade: 'comum', icone: 'ShoppingBag',
    recompensa: { seeds: 15, xp: 20 }, progresso: (c) => ({ atual: c.compras, meta: 1 }) },
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
