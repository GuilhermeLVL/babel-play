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
 *  - AS MARCADAS ("Já sei" e "Ignorar", sem cartão) são lidas junto com o caderno, uma vez por página, de todos os
 *    idiomas (`fetchPalavrasMarcadas`; sem conta, o espelho no aparelho). `marcarNoIndice`/`desmarcarNoIndice`
 *    aplicam na hora e desfazem se a gravação falhar.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { type Forca, forcaDoCartao } from '../../core/learning/forcaDoCartao';
import type { Layout } from '../../core/legendas/janelaFlutuante';
import { FLAG_FORCA_NA_LEGENDA } from '../../core/planos';
import { chaveAtiva, versaoAtivaDaChave } from '../../core/texto/chaveAtiva';
import { baseLang } from '../../core/texto/idioma';
import type { VersaoDaChaveDedup } from '../../core/texto/palavra';
import {
  type EstadoNoCaderno,
  estadoNoCaderno,
  type Etiqueta,
  etiquetaDaChave,
  etiquetasNoLayout,
  forcaNoCaderno,
  type IndiceDeForcas,
  type IndiceDoCaderno,
  montarIndiceDeForcas,
  montarIndiceDoCaderno,
  type VistasDoIdioma,
} from '../../core/vocabulario/etiquetas';
import {
  type EstadoDaMarcacao,
  type IndiceDeMarcadas,
  montarIndiceDeMarcadas,
  type PalavraMarcada,
} from '../../core/vocabulario/marcadas';
import {
  desfazerLotePalavras,
  desmarcarPalavra,
  fetchDeck,
  fetchPalavrasMarcadas,
  fetchPalavrasVistas,
  fetchSessions,
  geracaoDeEscritas,
  marcarLotePalavras,
  marcarPalavra,
  type ResultadoDoLote,
} from '../../data/api';
import type { VocabCard } from '../../types';
import { lerAjustesDoAssistente, useAjustesDoAssistente } from '../assistente/ajustesDoAssistente';
import { useFlag } from '../flags';
import { EVENTO_DAS_FLAGS } from '../flagsCache';
import { aoMudarIdentidade } from '../identidade';
import { estadoDoCartao } from '../pelesDeCartao';

export interface SnapshotDasEtiquetas {
  /** `null` até o caderno chegar (nada é pintado). */
  caderno: IndiceDoCaderno | null;
  /** A força 1 a 4 de cada palavra do caderno (flag `forca_na_legenda`); só é lida com a flag ligada. */
  forcas?: IndiceDeForcas | null;
  /** Por idioma-base: ausente = não pedido ou a caminho; `null` = sem índice (convidado, erro). */
  vistas: ReadonlyMap<string, VistasDoIdioma | null>;
  /** "Já sei" e "Ignorar" por idioma. `null` até a lista chegar (ou se ela falhou): nenhuma marcação vale. */
  marcadas: IndiceDeMarcadas | null;
  /** A mesma lista, crua (a tela de vocabulário lista e desmarca), da mais recente para a mais antiga. */
  listaDeMarcadas: readonly PalavraMarcada[];
}

const ESTADO_DO_CONTRATO: Record<ReturnType<typeof estadoDoCartao>, EstadoNoCaderno> = {
  nova: 'nova',
  aprendida: 'aprendendo',
  dominada: 'dominada',
};

/** O caderno no formato do índice: só o que está no baralho, com o estado da pele de cartão. */
export function cartoesParaOIndice(cartas: readonly VocabCard[], agora = Date.now()) {
  const saida: Array<{ palavra: string; lang?: string; estado: EstadoNoCaderno; forca: Forca }> = [];
  for (const c of cartas) {
    if (!c.inDeck || !c.word) continue;
    saida.push({
      palavra: c.word,
      lang: c.srcLang,
      estado: ESTADO_DO_CONTRATO[estadoDoCartao(c, agora)],
      forca: forcaDoCartao(c),
    });
  }
  return saida;
}

let snapshot: SnapshotDasEtiquetas = { caderno: null, vistas: new Map(), marcadas: null, listaDeMarcadas: [] };
const inscritos = new Set<() => void>();
/* As palavras fichadas nesta página que o caderno lido ainda não tem. */
const fichadas = new Map<string, { palavra: string; lang?: string }>();
let cartoesLidos: ReturnType<typeof cartoesParaOIndice> = [];
let geracaoDoCaderno = -1;
let cadernoEmVoo: Promise<void> | null = null;
const vistasPedidas = new Set<string>();
const vistasEmVoo = new Set<string>();
let sessoesPorIdioma: Promise<Map<string, number>> | null = null;
let marcadasEmVoo: Promise<void> | null = null;
let marcadasLidas = false;

function publicar(patch: Partial<SnapshotDasEtiquetas>) {
  snapshot = { ...snapshot, ...patch };
  for (const f of inscritos) f();
}

/* A versão da chave com que os índices foram montados. A flag `chave_dedup_v2` pode chegar (ou mudar) depois do
   primeiro índice: aí as chaves antigas não casam mais com as palavras da tela. */
let versaoDoIndice: VersaoDaChaveDedup | null = null;

/** A flag mudou a versão da chave: remonta o caderno e as marcadas (estas relidas, porque as chaves do servidor mudaram). */
function aoMudarAFlagDaChave() {
  const v = versaoAtivaDaChave();
  if (versaoDoIndice === null || v === versaoDoIndice) return;
  if (cartoesLidos.length || fichadas.size) remontarCaderno();
  if (marcadasLidas) {
    publicarMarcadas();
    marcadasLidas = false;
    if (inscritos.size > 0) void carregarMarcadas();
  }
}
let ouvindoAFlagDaChave = false;
function ouvirAFlagDaChave() {
  if (ouvindoAFlagDaChave || typeof window === 'undefined') return;
  ouvindoAFlagDaChave = true;
  window.addEventListener(EVENTO_DAS_FLAGS, aoMudarAFlagDaChave);
}

function remontarCaderno() {
  versaoDoIndice = versaoAtivaDaChave();
  const todos = [
    ...cartoesLidos,
    ...[...fichadas.values()].map((f) => ({ ...f, estado: 'nova' as const, forca: 1 as Forca })),
  ];
  publicar({ caderno: montarIndiceDoCaderno(todos), forcas: montarIndiceDeForcas(todos) });
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

/*
 * AS MARCADAS, EM TRÊS CAMADAS:
 *  - `confirmadas`: o que o servidor (ou o espelho local) disse — a última leitura mais as gravações confirmadas;
 *  - `pendentes`: a INTENÇÃO local ainda não confirmada, por chave (`null` = desmarcar), com um número de ordem;
 *  - a lista publicada é `confirmadas` com `pendentes` por cima.
 * As gravações de uma MESMA chave vão em fila e só a última intenção é enviada (as do meio são puladas). Uma falha
 * desfaz só aquela chave, e só se ninguém pediu outra coisa para ela depois. A leitura que estava em voo não apaga
 * o que foi confirmado depois de ela começar (`confirmadaEm` × `inicioDaLeitura`). A troca de identidade
 * (`aoMudarIdentidade`) zera tudo e abre uma ÉPOCA nova: resposta da época anterior é descartada.
 */
const chaveDaMarcada = (lang: string, chave: string) => `${lang}|${chave}`;
let confirmadas = new Map<string, PalavraMarcada>();
const pendentes = new Map<string, { marcada: PalavraMarcada | null; ordem: number }>();
const confirmadaEm = new Map<string, number>();
const filas = new Map<string, Promise<unknown>>();
let ordemDasIntencoes = 0;
let relogioDeConfirmacao = 0;
let epoca = 0;

function publicarMarcadas() {
  versaoDoIndice = versaoAtivaDaChave();
  const porChave = new Map(confirmadas);
  for (const [k, p] of pendentes) {
    if (p.marcada) porChave.set(k, p.marcada);
    else porChave.delete(k);
  }
  const ordenada = [...porChave.values()].sort((a, b) => b.atualizadoEm - a.atualizadoEm);
  publicar({ marcadas: montarIndiceDeMarcadas(ordenada), listaDeMarcadas: ordenada });
}

/** Lê as marcações ("Já sei"/"Ignorar") de todos os idiomas. Quem chama junto recebe a mesma leitura. */
export function carregarMarcadas(): Promise<void> {
  if (marcadasEmVoo) return marcadasEmVoo;
  const minhaEpoca = epoca;
  const inicioDaLeitura = relogioDeConfirmacao;
  const voo: Promise<void> = fetchPalavrasMarcadas()
    .then((lista) => {
      if (!lista || minhaEpoca !== epoca) return;
      marcadasLidas = true;
      const lidas = new Map(lista.map((m) => [chaveDaMarcada(m.lang, m.chave), m] as const));
      /* O que foi confirmado DEPOIS de a leitura começar vale mais que ela. */
      for (const [k, quando] of confirmadaEm) {
        if (quando <= inicioDaLeitura) continue;
        const atual = confirmadas.get(k);
        if (atual) lidas.set(k, atual);
        else lidas.delete(k);
      }
      confirmadas = lidas;
      publicarMarcadas();
    })
    .finally(() => {
      if (marcadasEmVoo === voo) marcadasEmVoo = null;
    });
  marcadasEmVoo = voo;
  return voo;
}

/** Registra a intenção, pinta na hora e grava na fila da chave. `true` quando a intenção valeu (ou foi superada). */
function pedirMarcacao(idioma: string, chave: string, estado: EstadoDaMarcacao | null): Promise<boolean> {
  const k = chaveDaMarcada(idioma, chave);
  const ordem = ++ordemDasIntencoes;
  const minhaEpoca = epoca;
  const marcada = estado ? { lang: idioma, chave, estado, atualizadoEm: Date.now() } : null;
  pendentes.set(k, { marcada, ordem });
  publicarMarcadas();
  const ultimaDaChave = () => pendentes.get(k)?.ordem === ordem;
  const tarefa = (filas.get(k) ?? Promise.resolve()).then(async () => {
    /* Uma intenção mais nova da mesma chave já está na fila: esta não precisa ir à rede. */
    if (minhaEpoca !== epoca || !ultimaDaChave()) return true;
    const ok = marcada ? await marcarPalavra(idioma, chave, marcada.estado) : await desmarcarPalavra(idioma, chave);
    if (minhaEpoca !== epoca) return ok;
    if (ok) {
      if (marcada) confirmadas.set(k, marcada);
      else confirmadas.delete(k);
      confirmadaEm.set(k, ++relogioDeConfirmacao);
    }
    /* Falhou: só esta chave volta ao confirmado, e só se ninguém pediu outra coisa para ela no meio-tempo. */
    const eraAUltima = ultimaDaChave();
    if (eraAUltima) pendentes.delete(k);
    publicarMarcadas();
    return ok || !eraAUltima;
  });
  filas.set(k, tarefa);
  void tarefa.finally(() => {
    if (filas.get(k) === tarefa) filas.delete(k);
  });
  return tarefa;
}

/**
 * Marca a palavra como "Já sei" ou "Ignorar": pinta na hora e grava; se a gravação falhar, a chave volta ao que era
 * e a função devolve `false` (quem chama avisa). A chave e o idioma são os do núcleo (o servidor reduz de novo).
 */
export async function marcarNoIndice(palavra: string, lang: string | undefined, estado: EstadoDaMarcacao) {
  const chave = chaveAtiva(palavra, lang);
  const idioma = baseLang(lang);
  if (!chave || !idioma) return false;
  return pedirMarcacao(idioma, chave, estado);
}

/** Desfaz a marcação (o "Desfazer" do cartão e o "Desmarcar" da lista). Mesmo contrato de `marcarNoIndice`. */
export async function desmarcarNoIndice(chaveOuPalavra: string, lang: string | undefined) {
  const chave = chaveAtiva(chaveOuPalavra, lang);
  const idioma = baseLang(lang);
  if (!chave || !idioma) return false;
  return pedirMarcacao(idioma, chave, null);
}

/**
 * Marca VÁRIAS palavras como "Já sei" numa requisição só (o teste rápido de vocabulário) e publica o índice UMA vez.
 * Sem pintar antes: o servidor decide o que entra (cartão e "Ignorar" mandam), e só as chaves criadas vão ao índice.
 * `null` quando a gravação falhou ou a identidade mudou no meio (a resposta é da época anterior e é descartada).
 */
export async function marcarLoteNoIndice(
  lang: string | undefined,
  chaves: readonly string[],
): Promise<ResultadoDoLote | null> {
  const idioma = baseLang(lang);
  const reduzidas = [...new Set(chaves.map((c) => chaveAtiva(c, idioma)).filter(Boolean))];
  if (!idioma || !reduzidas.length) return null;
  const minhaEpoca = epoca;
  const r = await marcarLotePalavras(idioma, reduzidas);
  if (!r || minhaEpoca !== epoca) return null;
  const atualizadoEm = Date.now();
  for (const chave of r.criadas) {
    const k = chaveDaMarcada(idioma, chave);
    confirmadas.set(k, { lang: idioma, chave, estado: 'conhecida', atualizadoEm });
    confirmadaEm.set(k, ++relogioDeConfirmacao);
  }
  if (r.criadas.length) publicarMarcadas();
  return r;
}

/** Desfaz um lote ("Já sei" só): uma requisição e uma publicação. `true` quando o servidor confirmou. */
export async function desfazerLoteNoIndice(lang: string | undefined, chaves: readonly string[]): Promise<boolean> {
  const idioma = baseLang(lang);
  if (!idioma || !chaves.length) return false;
  const minhaEpoca = epoca;
  const removidas = await desfazerLotePalavras(idioma, chaves);
  if (!removidas || minhaEpoca !== epoca) return false;
  for (const chave of removidas) {
    const k = chaveDaMarcada(idioma, chave);
    confirmadas.delete(k);
    confirmadaEm.set(k, ++relogioDeConfirmacao);
  }
  if (removidas.length) publicarMarcadas();
  return true;
}

/** Esquece as marcadas (troca de identidade, testes): a próxima tela relê as da identidade nova. */
function esquecerMarcadas(): void {
  epoca++;
  confirmadas = new Map();
  pendentes.clear();
  confirmadaEm.clear();
  filas.clear();
  marcadasEmVoo = null;
  marcadasLidas = false;
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
  const chave = chaveAtiva(palavra, lang);
  if (!chave) return;
  const k = `${baseLang(lang)}|${chave}`;
  if (fichadas.has(k)) return;
  fichadas.set(k, { palavra, lang });
  remontarCaderno();
}

/** Para os testes: volta ao começo. */
export function esquecerIndiceDeEtiquetas(): void {
  snapshot = { caderno: null, forcas: null, vistas: new Map(), marcadas: null, listaDeMarcadas: [] };
  fichadas.clear();
  esquecerMarcadas();
  cartoesLidos = [];
  geracaoDoCaderno = -1;
  versaoDoIndice = null;
  cadernoEmVoo = null;
  vistasPedidas.clear();
  vistasEmVoo.clear();
  sessoesPorIdioma = null;
}

export function lerSnapshotDasEtiquetas(): SnapshotDasEtiquetas {
  return snapshot;
}

/* A pessoa entrou ou saiu da conta sem recarregar: as marcadas da identidade anterior não valem mais. */
let ouvindoIdentidade = false;
function ouvirIdentidade() {
  if (ouvindoIdentidade || typeof window === 'undefined') return;
  ouvindoIdentidade = true;
  aoMudarIdentidade(() => {
    esquecerMarcadas();
    publicar({ marcadas: null, listaDeMarcadas: [] });
    if (inscritos.size > 0) void carregarMarcadas();
  });
}

function assinar(f: () => void) {
  ouvirIdentidade();
  ouvirAFlagDaChave();
  const primeiro = inscritos.size === 0;
  inscritos.add(f);
  /* A primeira tela a assinar (de novo) relê o caderno se ele nunca foi lido ou se houve escrita desde então. */
  if (primeiro && geracaoDoCaderno !== geracaoDeEscritas()) void carregarCaderno();
  if (primeiro && !marcadasLidas) void carregarMarcadas();
  return () => {
    inscritos.delete(f);
  };
}

/** A palavra está no caderno (qualquer estado, inclusive a fichada agora)? Vale com as etiquetas desligadas. */
export function estaNoCaderno(s: SnapshotDasEtiquetas, palavra: string, lang: string | undefined): boolean {
  return !!estadoNoCaderno(s.caderno, chaveAtiva(palavra, lang), lang);
}

const VAZIO: SnapshotDasEtiquetas = { caderno: null, vistas: new Map(), marcadas: null, listaDeMarcadas: [] };

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
  /** A força 1 a 4 da palavra (só com a flag `forca_na_legenda` ligada; sem ela, sempre `undefined`). */
  forca(palavra: string, lang: string | undefined): Forca | undefined;
  /** O mesmo etiquetador sem o ponto "nova para você" (a Faixa). */
  semNova(): Etiquetador;
}

function criarEtiquetador(
  s: SnapshotDasEtiquetas,
  nova: boolean,
  langDaPessoa: string | undefined,
  porForca = false,
): Etiquetador {
  const etiqueta = (palavra: string, lang: string | undefined, comNova: boolean) =>
    etiquetaDaChave(chaveAtiva(palavra, lang), lang, s.caderno, {
      nova: comNova,
      langDaPessoa,
      vistas: s.vistas.get(baseLang(lang)),
      marcadas: s.marcadas,
      /* Flag `forca_na_legenda` desligada: sem força, a etiqueta é a da régua de três estados de hoje. */
      forcas: porForca ? s.forcas : null,
    });
  let sem: Etiquetador | null = null;
  const e: Etiquetador = {
    etiqueta: (palavra, lang) => etiqueta(palavra, lang, nova),
    salva: (palavra, lang) => estaNoCaderno(s, palavra, lang),
    forca: (palavra, lang) => (porForca ? forcaNoCaderno(s.forcas, chaveAtiva(palavra, lang), lang) : undefined),
    semNova: () => {
      if (!nova) return e;
      sem ??= criarEtiquetador(s, false, langDaPessoa, porForca);
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
  const porForca = useFlag(FLAG_FORCA_NA_LEGENDA);
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
    () => (aj.etiquetas ? criarEtiquetador(s, nova, o.langDaPessoa, porForca) : null),
    [aj.etiquetas, s, nova, o.langDaPessoa, porForca],
  );
}
