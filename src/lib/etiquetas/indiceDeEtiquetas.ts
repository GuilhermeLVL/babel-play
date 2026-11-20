/**
 * O ÍNDICE DAS ETIQUETAS, um por página — o caderno e as palavras vistas que a legenda consulta palavra a palavra.
 *
 * Um módulo com `useSyncExternalStore`, e não um estado por tela: a legenda da captura, a janela flutuante (que roda
 * no mesmo JavaScript, por portal) e a folha da frase pintam a MESMA palavra do mesmo jeito, e o caderno é lido uma
 * vez. O snapshot só troca de identidade quando algo chega: as linhas `memo` da legenda não re-renderizam com cada
 * parcial do reconhecimento.
 *
 *  - O CADERNO vem de `fetchDeck` (com ETag, deduplicado entre as telas). Ele também existe sem conta (o espelho
 *    local), então as tintas funcionam para o convidado. Relido quando a primeira tela volta a assinar e houve
 *    escrita desde a última leitura (`geracaoDeEscritas`).
 *  - AS VISTAS de cada idioma são pedidas uma vez, sob demanda (`pedirVistas`). Sem conta a rota responde 501 e o
 *    idioma fica sem índice (`null`): sem ponto "nova para você". Com índice, conta-se também quantas sessões a
 *    pessoa tem naquele idioma (o portão do histórico suficiente, `SESSOES_MINIMAS_PARA_NOVA`).
 *  - `marcarSalva`: a palavra fichada agora pinta antes de o caderno ser relido.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { Layout } from '../../core/legendas/janelaFlutuante';
import { baseLang } from '../../core/texto/idioma';
import { chaveDaPalavra } from '../../core/texto/palavra';
import {
  type EstadoNoCaderno,
  estadoNoCaderno,
  type Etiqueta,
  etiquetaDaChave,
  etiquetasNoLayout,
  type IndiceDoCaderno,
  montarIndiceDoCaderno,
  type VistasDoIdioma,
} from '../../core/vocabulario/etiquetas';
import { fetchDeck, fetchPalavrasVistas, fetchSessions, geracaoDeEscritas } from '../../data/api';
import type { VocabCard } from '../../types';
import { lerAjustesDoAssistente, useAjustesDoAssistente } from '../assistente/ajustesDoAssistente';
import { estadoDoCartao } from '../pelesDeCartao';

export interface SnapshotDasEtiquetas {
  /** `null` até o caderno chegar (nada é pintado). */
  caderno: IndiceDoCaderno | null;
  /** Por idioma-base: ausente = não pedido ou a caminho; `null` = sem índice (convidado, erro). */
  vistas: ReadonlyMap<string, VistasDoIdioma | null>;
}

const ESTADO_DO_CONTRATO: Record<ReturnType<typeof estadoDoCartao>, EstadoNoCaderno> = {
  nova: 'nova',
  aprendida: 'aprendendo',
  dominada: 'dominada',
};

/** O caderno no formato do índice: só o que está no baralho, com o estado da pele de cartão. */
export function cartoesParaOIndice(cartas: readonly VocabCard[], agora = Date.now()) {
  const saida: Array<{ palavra: string; lang?: string; estado: EstadoNoCaderno }> = [];
  for (const c of cartas) {
    if (!c.inDeck || !c.word) continue;
    saida.push({ palavra: c.word, lang: c.srcLang, estado: ESTADO_DO_CONTRATO[estadoDoCartao(c, agora)] });
  }
  return saida;
}

let snapshot: SnapshotDasEtiquetas = { caderno: null, vistas: new Map() };
const inscritos = new Set<() => void>();
/* As palavras fichadas nesta página que o caderno lido ainda não tem. */
const fichadas = new Map<string, { palavra: string; lang?: string }>();
let cartoesLidos: ReturnType<typeof cartoesParaOIndice> = [];
let geracaoDoCaderno = -1;
let cadernoEmVoo: Promise<void> | null = null;
const vistasPedidas = new Set<string>();
const vistasEmVoo = new Set<string>();
let sessoesPorIdioma: Promise<Map<string, number>> | null = null;

function publicar(patch: Partial<SnapshotDasEtiquetas>) {
  snapshot = { ...snapshot, ...patch };
  for (const f of inscritos) f();
}

function remontarCaderno() {
  publicar({
    caderno: montarIndiceDoCaderno([
      ...cartoesLidos,
      ...[...fichadas.values()].map((f) => ({ ...f, estado: 'nova' as const })),
    ]),
  });
}

/** Lê (ou relê) o caderno. Quem chama junto recebe a mesma leitura. */
export function carregarCaderno(): Promise<void> {
  if (cadernoEmVoo) return cadernoEmVoo;
  const geracao = geracaoDeEscritas();
  cadernoEmVoo = fetchDeck()
    .then((cartas) => {
      cartoesLidos = cartoesParaOIndice(cartas);
      geracaoDoCaderno = geracao;
      remontarCaderno();
    })
    .catch(() => {
      /* sem caderno: nada pintado (e a próxima tela tenta de novo) */
    })
    .finally(() => {
      cadernoEmVoo = null;
    });
  return cadernoEmVoo;
}

/** Quantas sessões com texto a pessoa tem em cada idioma-base (uma leitura da lista por página). */
function contarSessoes(): Promise<Map<string, number>> {
  sessoesPorIdioma ??= fetchSessions()
    .then((lista) => {
      const m = new Map<string, number>();
      for (const s of lista) {
        if (!s.idioma || !(s.wordCount > 0)) continue;
        const l = baseLang(s.idioma);
        m.set(l, (m.get(l) ?? 0) + 1);
      }
      return m;
    })
    .catch(() => new Map<string, number>());
  return sessoesPorIdioma;
}

/**
 * Pede o índice de palavras vistas de `lang`. Sem `renovar`, uma vez por idioma por página; com `renovar`, de novo
 * (o ETag faz a revalidação custar um 304 quando nada mudou).
 *
 * QUANDO SE PEDE, e só então: ao abrir a captura ou a sessão da Biblioteca (`useEtiquetador` montando), ao abrir a
 * janela flutuante e uma vez quando a captura termina (`renovarVistas`). NUNCA a cada fala: o ETag do índice muda a cada
 * lote de falas salvo e a lista pode passar de 200 KB. Durante a captura vale o índice da abertura — a palavra que
 * apareceu só nesta sessão ainda ganha o ponto, e está certo: ela é nova em relação ao passado da pessoa.
 */
export function pedirVistas(lang: string | undefined, o: { renovar?: boolean } = {}): void {
  const idioma = baseLang(lang);
  if (!idioma || vistasEmVoo.has(idioma) || (vistasPedidas.has(idioma) && !o.renovar)) return;
  vistasPedidas.add(idioma);
  vistasEmVoo.add(idioma);
  /* A contagem de sessões também envelhece (a captura que acabou é uma sessão a mais). */
  if (o.renovar) sessoesPorIdioma = null;
  void fetchPalavrasVistas(idioma).then(async (v) => {
    vistasEmVoo.delete(idioma);
    let doIdioma: VistasDoIdioma | null = null;
    if (v) {
      const sessoes = (await contarSessoes()).get(idioma) ?? 0;
      doIdioma = { chaves: new Set(v.chaves), truncado: v.truncado, sessoes };
    }
    const vistas = new Map(snapshot.vistas);
    vistas.set(idioma, doIdioma);
    publicar({ vistas });
  });
}

/** Renova o índice dos idiomas (a janela flutuante abriu, a captura terminou). */
export function renovarVistas(idiomas: ReadonlyArray<string | undefined>): void {
  const aj = lerAjustesDoAssistente();
  if (!aj.etiquetas || !aj.etiquetaNova) return;
  for (const l of idiomas) pedirVistas(l, { renovar: true });
}

/** A palavra acabou de ser fichada: pinta como salva já (o caderno relido confirma ou corrige). */
export function marcarSalva(palavra: string, lang?: string): void {
  const chave = chaveDaPalavra(palavra);
  if (!chave) return;
  const k = `${baseLang(lang)}|${chave}`;
  if (fichadas.has(k)) return;
  fichadas.set(k, { palavra, lang });
  remontarCaderno();
}

/** Para os testes: volta ao começo. */
export function esquecerIndiceDeEtiquetas(): void {
  snapshot = { caderno: null, vistas: new Map() };
  fichadas.clear();
  cartoesLidos = [];
  geracaoDoCaderno = -1;
  cadernoEmVoo = null;
  vistasPedidas.clear();
  vistasEmVoo.clear();
  sessoesPorIdioma = null;
}

export function lerSnapshotDasEtiquetas(): SnapshotDasEtiquetas {
  return snapshot;
}

function assinar(f: () => void) {
  const primeiro = inscritos.size === 0;
  inscritos.add(f);
  /* A primeira tela a assinar (de novo) relê o caderno se ele nunca foi lido ou se houve escrita desde então. */
  if (primeiro && geracaoDoCaderno !== geracaoDeEscritas()) void carregarCaderno();
  return () => {
    inscritos.delete(f);
  };
}

/** A palavra está no caderno (qualquer estado, inclusive a fichada agora)? Vale com as etiquetas desligadas. */
export function estaNoCaderno(s: SnapshotDasEtiquetas, palavra: string, lang: string | undefined): boolean {
  return !!estadoNoCaderno(s.caderno, chaveDaPalavra(palavra), lang);
}

const VAZIO: SnapshotDasEtiquetas = { caderno: null, vistas: new Map() };

export function useSnapshotDasEtiquetas(): SnapshotDasEtiquetas {
  return useSyncExternalStore(assinar, lerSnapshotDasEtiquetas, () => VAZIO);
}

/**
 * QUEM PINTA. Uma identidade por snapshot e ajustes: as linhas `memo` recebem o mesmo objeto enquanto nada muda.
 */
export interface Etiquetador {
  /** A etiqueta da palavra numa linha de `lang`. */
  etiqueta(palavra: string, lang: string | undefined): Etiqueta | undefined;
  /** A palavra está no caderno (qualquer estado)? */
  salva(palavra: string, lang: string | undefined): boolean;
  /** O mesmo etiquetador sem o ponto "nova para você" (a Faixa). */
  semNova(): Etiquetador;
}

function criarEtiquetador(s: SnapshotDasEtiquetas, nova: boolean, langDaPessoa: string | undefined): Etiquetador {
  const etiqueta = (palavra: string, lang: string | undefined, comNova: boolean) =>
    etiquetaDaChave(chaveDaPalavra(palavra), lang, s.caderno, {
      nova: comNova,
      langDaPessoa,
      vistas: s.vistas.get(baseLang(lang)),
    });
  let sem: Etiquetador | null = null;
  const e: Etiquetador = {
    etiqueta: (palavra, lang) => etiqueta(palavra, lang, nova),
    salva: (palavra, lang) => estaNoCaderno(s, palavra, lang),
    semNova: () => {
      if (!nova) return e;
      sem ??= criarEtiquetador(s, false, langDaPessoa);
      return sem;
    },
  };
  return e;
}

/**
 * O etiquetador da tela: `null` com "Etiquetas de palavras" desligado. `idiomas` são os idiomas das linhas que a tela
 * mostra (as vistas de cada um são pedidas); `layout` = o da janela flutuante (a Faixa perde o ponto).
 */
export function useEtiquetador(o: {
  langDaPessoa: string | undefined;
  idiomas: ReadonlyArray<string | undefined>;
  layout?: Layout;
}): Etiquetador | null {
  const aj = useAjustesDoAssistente();
  const s = useSnapshotDasEtiquetas();
  const nova = aj.etiquetaNova && etiquetasNoLayout(o.layout).nova;
  /* No idioma da pessoa nada é "novo para você": as vistas dele não são pedidas. */
  const daPessoa = baseLang(o.langDaPessoa);
  const chaveDosIdiomas = [...new Set(o.idiomas.map(baseLang).filter((l) => l && l !== daPessoa))].sort().join(',');
  /* A tela abriu (ou trocou de idioma): o índice é renovado UMA vez. As falas que chegam não mexem nele. */
  useEffect(() => {
    if (!aj.etiquetas || !aj.etiquetaNova) return;
    for (const l of chaveDosIdiomas.split(',')) if (l) pedirVistas(l, { renovar: true });
  }, [aj.etiquetas, aj.etiquetaNova, chaveDosIdiomas]);
  return useMemo(
    () => (aj.etiquetas ? criarEtiquetador(s, nova, o.langDaPessoa) : null),
    [aj.etiquetas, s, nova, o.langDaPessoa],
  );
}
