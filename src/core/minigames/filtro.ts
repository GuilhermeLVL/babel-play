/**
 * O FILTRO FACETADO — o núcleo do que vai substituir três linhas de controle que se atropelam
 * ("Praticar jogando": aba exclusiva + chip de baralho + idioma).
 *
 * SEMÂNTICA ÚNICA, e é o contrato deste arquivo inteiro: **união DENTRO de cada faceta,
 * interseção ENTRE facetas.** Marcar 'baralho' e 'sessao' em `fontes` pega cartões de QUALQUER
 * uma das duas (união); marcar `recorte.nuncaVistas` E `recorte.pedindoRevisao` ao mesmo tempo
 * não devolve nada, porque as duas são mutuamente exclusivas e a interseção as anula — e isso é
 * CORRETO, não um bug: são perguntas contraditórias sobre o mesmo cartão.
 *
 * POR QUE ISTO NÃO EXISTIA. `source.ts` já resolve "de onde vêm os itens" com `FonteId`, mas só
 * permite escolher UMA fonte, exclusiva. A tela de hoje empilha três controles que competem pelo
 * mesmo espaço (aba de fonte, chip de baralho Anki, seletor de idioma) e cada um zera os outros
 * em silêncio. O filtro facetado troca "escolha um" por "marque o que quiser, cada faceta some
 * as suas opções e todas as facetas se cruzam".
 *
 * ESTE ARQUIVO É SÓ O NÚCLEO (tipos, predicado puro, adaptadores). A UI vem noutra onda — nada
 * aqui pode quebrar os chamadores atuais de `source.ts` ou `composicao.ts`.
 */
import type { CefrLevel } from '../learning/contract';
import { baseLangDe } from '../learning/quality';
import type { FonteDeItens } from './source';

/** A escolha de prática inteira, persistível e serializável (ver `lib/filtroDaPratica.ts`). */
export interface FiltroDaPratica {
  versao: 1;
  /** UNIÃO entre membros. 'baralho' = acervo geral (o que não é trilha), como em `source.ts`. */
  fontes: Array<'baralho' | 'sessao' | 'trilha'>;
  /** Recorta DENTRO de 'baralho': ids de deck Anki. Vazio = acervo geral inteiro. */
  baralhos: string[];
  /** Recorta DENTRO de 'sessao': ids de gravação. Vazio = todas. */
  sessoes: string[];
  nivelTrilha?: CefrLevel;
  /** Bases ISO. A UI imporá ≤1 nesta etapa (rodada monoidioma é decisão do dono); o TIPO já é lista. */
  idiomas: string[];
  /** Cada flag INTERSECTA. `niveis` é união interna. */
  recorte: { dificeis?: boolean; nuncaVistas?: boolean; pedindoRevisao?: boolean; niveis?: CefrLevel[] };
  /** comAudio/comImagem virão com a onda de mídia — NÃO os inclua na v1. */
  midia: { comTraducao?: boolean; comFrase?: boolean };
}

/** Equivale à aba "As minhas palavras/todas" de hoje: acervo geral + sessão, sem recorte nenhum. */
export const FILTRO_PADRAO: FiltroDaPratica = {
  versao: 1,
  fontes: ['baralho', 'sessao'],
  baralhos: [],
  sessoes: [],
  idiomas: [],
  recorte: {},
  midia: {},
};

/**
 * A forma ESTRUTURAL de um cartão para efeito de filtro — sem importar `VocabCard` de
 * `src/types`, que é fronteira de outro dono. `baralhosAnki` é o campo NOVO (outro agente está
 * adicionando ao payload); aqui ele é só tipo, tratado como possivelmente ausente — é essa
 * ausência que decide `filtroAplicavel`.
 */
export interface CartaoFiltravel {
  daTrilha?: boolean;
  daAnki?: boolean;
  sourceSessionId?: string;
  /** ids dos decks Anki de onde o cartão veio. Payload antigo não tem — ver `filtroAplicavel`. */
  baralhosAnki?: string[];
  srcLang?: string;
  cefrLevel?: string;
  translation?: string;
  sentence?: string;
  fsrsDueAt?: number | null;
}

/** Extras que o predicado não consegue tirar do cartão sozinho. */
export interface ExtrasDoFiltro {
  /** O ranking de palavras difíceis NUNCA persiste (regra de `source.ts`, `FonteDeItens.cardIds`
   *  linhas 33-39) — é injetado na hora do uso, a cada chamada. */
  rankingDificeis?: ReadonlySet<string>;
  agora?: number;
  /** Necessário só quando `recorte.dificeis` está ligado — sem ele a checagem falha (conservador:
   *  não dá para afirmar que o cartão está no ranking sem saber o id dele). */
  idDoCartao?: string;
}

/**
 * O PREDICADO PURO — é o MESMO predicado que espelha o SQL escrito por outro agente no servidor
 * (o teste de paridade entre os dois vem depois, noutra tarefa). União dentro de cada faceta,
 * interseção entre elas.
 */
export function passaNoFiltro(c: CartaoFiltravel, f: FiltroDaPratica, extras?: ExtrasDoFiltro): boolean {
  if (!passaFontes(c, f)) return false;
  if (!passaIdiomas(c, f)) return false;
  if (!passaRecorte(c, f, extras)) return false;
  if (!passaMidia(c, f)) return false;
  return true;
}

/** fontes: vazio = sem filtro (nenhuma faceta ligada não pode significar "nada passa" — as
 *  demais facetas seguem o mesmo padrão: array vazio é ausência de restrição). */
function passaFontes(c: CartaoFiltravel, f: FiltroDaPratica): boolean {
  if (f.fontes.length === 0) return true;
  return f.fontes.some((fonte) => {
    if (fonte === 'trilha') return c.daTrilha === true;
    if (fonte === 'sessao') {
      if (!c.sourceSessionId) return false;
      return f.sessoes.length === 0 || f.sessoes.includes(c.sourceSessionId);
    }
    // 'baralho'
    if (f.baralhos.length > 0) return (c.baralhosAnki ?? []).some((id) => f.baralhos.includes(id));
    return !c.daTrilha;
  });
}

function passaIdiomas(c: CartaoFiltravel, f: FiltroDaPratica): boolean {
  if (f.idiomas.length === 0) return true;
  return f.idiomas.includes(baseLangDe(c.srcLang));
}

function passaRecorte(c: CartaoFiltravel, f: FiltroDaPratica, extras?: ExtrasDoFiltro): boolean {
  const r = f.recorte;
  if (r.dificeis) {
    const id = extras?.idDoCartao;
    if (!id || !extras?.rankingDificeis?.has(id)) return false;
  }
  if (r.nuncaVistas && c.fsrsDueAt != null) return false;
  if (r.pedindoRevisao) {
    const agora = extras?.agora ?? Date.now();
    if (c.fsrsDueAt == null || c.fsrsDueAt > agora) return false;
  }
  if (r.niveis?.length) {
    if (!c.cefrLevel || !r.niveis.includes(c.cefrLevel as CefrLevel)) return false;
  }
  return true;
}

function passaMidia(c: CartaoFiltravel, f: FiltroDaPratica): boolean {
  if (f.midia.comTraducao && !(c.translation ?? '').trim()) return false;
  if (f.midia.comFrase && !(c.sentence ?? '').trim()) return false;
  return true;
}

/**
 * O RECORTE DE BARALHO SE APLICOU DE VERDADE, OU FOI IGNORADO EM SILÊNCIO?
 *
 * `baralhos.length > 0` sobre um conjunto vindo de um payload ANTIGO (sem `baralhosAnki`) faria
 * `passaFontes` reprovar todo cartão de baralho — a rodada esvaziaria sem explicação. Esta função
 * é o que permite à UI dizer "não deu para aplicar o recorte" em vez de jogar com tudo em
 * silêncio (ou de mostrar uma rodada vazia sem causa).
 */
export function filtroAplicavel(cards: CartaoFiltravel[], f: FiltroDaPratica): { aplicavel: boolean; motivo?: string } {
  if (f.baralhos.length > 0 && cards.length > 0 && cards.every((c) => c.baralhosAnki === undefined)) {
    return { aplicavel: false, motivo: 'os cartões deste acervo ainda não trazem a origem por baralho' };
  }
  return { aplicavel: true };
}

/**
 * ADAPTADOR DE COMPATIBILIDADE — a ponte com tudo que já existe.
 *
 * `FonteId` é INTOCÁVEL: `exercise_results.origem` deriva dele, e renomear orfanaria histórico.
 * `fonteDominante` reduz um filtro (que pode combinar facetas) à fonte exclusiva mais fiel —
 * usada só onde o resto do app ainda fala a linguagem antiga (registro de proveniência, telas
 * não migradas). NÃO é lossless por construção: um filtro multi-faceta não cabe numa `FonteId`
 * só, e é exatamente por isso que multi-fonte cai em 'baralho' (o mais genérico).
 */
export function fonteDominante(f: FiltroDaPratica): FonteDeItens {
  const lang = f.idiomas[0] ?? '';

  if (f.fontes.length === 1) {
    const unica = f.fontes[0];
    if (unica === 'trilha') return { id: 'trilha', lang, nivel: f.nivelTrilha };
    if (unica === 'sessao') return { id: 'sessao', lang, sessionId: f.sessoes[0] };
    // unica === 'baralho'
    const soRecorteEDificeis = f.recorte.dificeis
      && !f.recorte.nuncaVistas && !f.recorte.pedindoRevisao && !f.recorte.niveis?.length;
    if (soRecorteEDificeis) return { id: 'dificeis', lang };
    return { id: 'baralho', lang };
  }

  // Multi-fonte: sem casa exclusiva que preserve as duas — 'baralho' é o mais genérico das três.
  return { id: 'baralho', lang };
}

/**
 * A IDA: de uma `FonteDeItens` de hoje para o filtro equivalente.
 *
 * `baralhoAnki` só importa quando `fonte.id === 'baralho'` — é o chip de deck que a tela de hoje
 * mostra ao lado da aba "Minhas palavras", e que `FonteDeItens` não representa (por isso o
 * round-trip com deck fixado não é identidade byte a byte: `FonteId` não tem onde guardar o
 * deck. Ver `fonteDominante`).
 */
export function filtroDaFonte(fonte: FonteDeItens, baralhoAnki?: { id: string } | null): FiltroDaPratica {
  const idiomas = fonte.lang ? [fonte.lang] : [];

  if (fonte.id === 'trilha') {
    return { ...FILTRO_PADRAO, fontes: ['trilha'], nivelTrilha: fonte.nivel, idiomas };
  }
  if (fonte.id === 'sessao') {
    return { ...FILTRO_PADRAO, fontes: ['sessao'], sessoes: fonte.sessionId ? [fonte.sessionId] : [], idiomas };
  }
  if (fonte.id === 'dificeis') {
    return { ...FILTRO_PADRAO, fontes: ['baralho'], idiomas, recorte: { dificeis: true } };
  }
  // fonte.id === 'baralho'
  return { ...FILTRO_PADRAO, fontes: ['baralho'], idiomas, baralhos: baralhoAnki ? [baralhoAnki.id] : [] };
}
