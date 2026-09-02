import type { FiltroDaPratica, CefrLevel } from '@core';
import { FILTRO_PADRAO, fonteDominante } from '@core';
import { lerFonteGuardada, gravarFonteGuardada, type FonteGuardada } from './fonteDaPratica';
import { escolhaDaFonte } from '@core';

/**
 * A ÚLTIMA ESCOLHA DE FILTRO, LEMBRADA ENTRE VISITAS — o molde de `fonteDaPratica.ts`, adaptado
 * para o filtro facetado (ver `core/minigames/filtro.ts` para a semântica completa).
 *
 * MIGRAÇÃO ONE-SHOT. `fonteDaPratica.ts` já guardava a escolha antiga (`babel.fonte_da_pratica`).
 * Sem a chave NOVA, esta leitura reconstrói o filtro A PARTIR da legada — fielmente, não pelo que
 * "faria mais sentido" hoje. Em particular: `gravacoes/todas` e `dificeis` viram `['baralho']`
 * porque a aba "Minhas palavras" de hoje é `FonteId: 'baralho'` (o acervo `!daTrilha`, ver
 * `cartoesDaFonte`), e NÃO `['baralho','sessao']` — misturar as duas mudaria o que a pessoa via
 * ontem sem ela ter pedido nada.
 *
 * `gravarFiltro` escreve a chave nova E espelha a legada via `escolhaDaFonte(fonteDominante(f))`.
 * O espelho é ROLLBACK POR UM RELEASE: se este release tiver que voltar atrás, a versão anterior
 * do app volta a ler `babel.fonte_da_pratica` e encontra algo coerente, não uma chave vazia.
 */

const CHAVE = 'babel.filtro_da_pratica';
const NIVEIS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface FiltroPersistido {
  versao: 1;
  fontes: Array<'baralho' | 'sessao' | 'trilha'>;
  baralhos: string[];
  sessoes: string[];
  nivelTrilha?: CefrLevel;
  idiomas: string[];
  recorte: { dificeis?: boolean; nuncaVistas?: boolean; pedindoRevisao?: boolean; niveis?: CefrLevel[] };
  midia: { comTraducao?: boolean; comFrase?: boolean };
}

const FONTES_VALIDAS = new Set(['baralho', 'sessao', 'trilha']);

/** Constrói o filtro fiel ao comportamento de HOJE, a partir da escolha legada. */
function filtroDaLegada(f: FonteGuardada): FiltroDaPratica {
  if (f.origem === 'trilha') {
    return { ...FILTRO_PADRAO, fontes: ['trilha'], nivelTrilha: f.nivel };
  }
  if (f.origem === 'dificeis') {
    // 'dificeis' atravessa a partição baralho/trilha (ver `cartoesDaFonte`), mas o valor
    // histórico gravado em `exercise_results.origem` é 'dificeis' — por isso o recorte, e não a
    // fonte 'trilha', é quem carrega essa informação aqui.
    return { ...FILTRO_PADRAO, fontes: ['baralho'], recorte: { dificeis: true } };
  }
  if (f.escopo === 'uma' && f.sessionId) {
    return { ...FILTRO_PADRAO, fontes: ['sessao'], sessoes: [f.sessionId] };
  }
  // gravacoes/todas: a aba de hoje mostra o acervo geral (!daTrilha) — 'baralho' sozinho.
  return { ...FILTRO_PADRAO, fontes: ['baralho'] };
}

/**
 * Lê o filtro guardado, saneando contra o mundo real.
 *
 * `sessoesExistentes`/`decksExistentes` não são opcionais por preguiça de tipo: sem eles, uma
 * sessão ou um deck apagados ficariam presos na lista para sempre, e a rodada abriria vazia sem
 * explicar por quê — o mesmo cuidado que `lerFonteGuardada` já toma com `sessionId`.
 */
export function lerFiltroGuardado(sessoesExistentes: readonly string[], decksExistentes: readonly string[]): FiltroDaPratica {
  let cru: unknown;
  try {
    const texto = localStorage.getItem(CHAVE);
    if (!texto) {
      // Sem a chave nova: migração one-shot a partir da legada.
      return filtroDaLegada(lerFonteGuardada(sessoesExistentes));
    }
    cru = JSON.parse(texto);
  } catch {
    return FILTRO_PADRAO; // storage bloqueado ou JSON corrompido — o padrão sempre funciona
  }

  const o = (cru ?? {}) as Partial<FiltroPersistido>;

  const fontesCruas = Array.isArray(o.fontes) ? o.fontes : [];
  const fontes = fontesCruas.filter((x): x is 'baralho' | 'sessao' | 'trilha' => FONTES_VALIDAS.has(x));
  // Lista de fontes vazia (corrompida, ou toda saneada para fora) → FILTRO_PADRAO inteiro: uma
  // escolha sem nenhuma fonte não é "sem filtro", é uma rodada que não abre nada.
  if (fontes.length === 0) return FILTRO_PADRAO;

  const sessoes = (Array.isArray(o.sessoes) ? o.sessoes : []).filter((id) => sessoesExistentes.includes(id));
  const baralhos = (Array.isArray(o.baralhos) ? o.baralhos : []).filter((id) => decksExistentes.includes(id));
  const idiomas = Array.isArray(o.idiomas) ? o.idiomas.filter((x) => typeof x === 'string' && x) : [];
  const nivelTrilha = NIVEIS.includes(o.nivelTrilha as CefrLevel) ? (o.nivelTrilha as CefrLevel) : undefined;

  const niveisRecorte = Array.isArray(o.recorte?.niveis)
    ? o.recorte!.niveis!.filter((n): n is CefrLevel => NIVEIS.includes(n))
    : undefined;

  return {
    versao: 1,
    fontes,
    baralhos,
    sessoes,
    nivelTrilha,
    idiomas,
    recorte: {
      dificeis: !!o.recorte?.dificeis,
      nuncaVistas: !!o.recorte?.nuncaVistas,
      pedindoRevisao: !!o.recorte?.pedindoRevisao,
      niveis: niveisRecorte?.length ? niveisRecorte : undefined,
    },
    midia: {
      comTraducao: !!o.midia?.comTraducao,
      comFrase: !!o.midia?.comFrase,
    },
  };
}

/**
 * Grava o filtro novo E espelha a legada — rollback por um release (ver docblock do arquivo).
 * Falha de storage é silenciosa de propósito: perder a memória não pode travar a prática.
 */
export function gravarFiltro(f: FiltroDaPratica): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(f));
  } catch { /* storage bloqueado */ }

  const escolha = escolhaDaFonte(fonteDominante(f));
  gravarFonteGuardada({ origem: escolha.origem, escopo: escolha.escopo, sessionId: escolha.sessionId, nivel: escolha.nivel });
}

/* ── O filtro na URL ─────────────────────────────────────────────────────
   `rotas.ts` transporta a query de `/jogar` como string OPACA (`EstadoDeRota.jogarQuery`); o
   formato mora aqui, ao lado da persistência, porque é a MESMA escolha serializada por outro
   canal — e a leitura passa pelo MESMO saneamento contra sessões/decks apagados. A URL fala a
   língua de quem a lê (`recorte=pedindo-revisao`, não `recorte[pedindoRevisao]=true`): a barra
   de endereço é interface, como as rotas da loja já estabeleceram. */

const RECORTE_NA_URL = [
  ['dificeis', 'dificeis'],
  ['nuncaVistas', 'nunca-vistas'],
  ['pedindoRevisao', 'pedindo-revisao'],
] as const;
const MIDIA_NA_URL = [
  ['comTraducao', 'traducao'],
  ['comFrase', 'frase'],
] as const;

/** Serializa para a query de `/jogar`. Vazio ('') quando o filtro é o padrão — URL limpa. */
export function queryDoFiltro(f: FiltroDaPratica): string {
  const q = new URLSearchParams();
  q.set('fonte', f.fontes.join(','));
  if (f.baralhos.length) q.set('baralho', f.baralhos.join(','));
  if (f.sessoes.length) q.set('sessao', f.sessoes.join(','));
  if (f.nivelTrilha) q.set('nivel', f.nivelTrilha);
  if (f.idiomas.length) q.set('idioma', f.idiomas.join(','));
  const recorte = RECORTE_NA_URL.filter(([campo]) => f.recorte[campo]).map(([, seg]) => seg);
  if (recorte.length) q.set('recorte', recorte.join(','));
  if (f.recorte.niveis?.length) q.set('niveis', f.recorte.niveis.join(','));
  const midia = MIDIA_NA_URL.filter(([campo]) => f.midia[campo]).map(([, seg]) => seg);
  if (midia.length) q.set('midia', midia.join(','));
  const texto = q.toString();
  // Padrão vira URL limpa. A comparação é sobre a SERIALIZAÇÃO (não sobre o objeto) de propósito:
  // o saneador da persistência materializa `false` explícitos que são semanticamente o padrão.
  return texto === QUERY_DO_PADRAO ? '' : texto;
}

const QUERY_DO_PADRAO = new URLSearchParams({ fonte: FILTRO_PADRAO.fontes.join(',') }).toString();

/**
 * Lê a query de `/jogar` de volta a um filtro. `null` quando a query não fala de filtro (sem o
 * parâmetro `fonte`) — o chamador cai na persistência local, não num padrão que apagaria a
 * escolha guardada. Valores desconhecidos são ignorados campo a campo, nunca derrubam o resto:
 * um link velho com um baralho apagado ainda deve abrir a rodada certa no que sobrou.
 */
export function filtroDaQuery(
  query: string,
  sessoesExistentes: readonly string[],
  decksExistentes: readonly string[],
): FiltroDaPratica | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(query);
  } catch {
    return null;
  }
  const fonteCrua = q.get('fonte');
  if (!fonteCrua) return null;

  const lista = (chave: string) => (q.get(chave) ?? '').split(',').filter(Boolean);
  const fontes = lista('fonte').filter((x): x is 'baralho' | 'sessao' | 'trilha' => FONTES_VALIDAS.has(x));
  if (fontes.length === 0) return null; // `?fonte=lixo` não é uma escolha — persistência decide

  const recorte = new Set(lista('recorte'));
  const midia = new Set(lista('midia'));
  const niveisRecorte = lista('niveis').filter((n): n is CefrLevel => NIVEIS.includes(n as CefrLevel));
  const nivelCru = q.get('nivel');

  return {
    versao: 1,
    fontes,
    baralhos: lista('baralho').filter((id) => decksExistentes.includes(id)),
    sessoes: lista('sessao').filter((id) => sessoesExistentes.includes(id)),
    nivelTrilha: NIVEIS.includes(nivelCru as CefrLevel) ? (nivelCru as CefrLevel) : undefined,
    idiomas: lista('idioma'),
    recorte: {
      dificeis: recorte.has('dificeis'),
      nuncaVistas: recorte.has('nunca-vistas'),
      pedindoRevisao: recorte.has('pedindo-revisao'),
      niveis: niveisRecorte.length ? niveisRecorte : undefined,
    },
    midia: {
      comTraducao: midia.has('traducao'),
      comFrase: midia.has('frase'),
    },
  };
}
