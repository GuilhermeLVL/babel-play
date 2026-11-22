/**
 * CLIENTE MÍNIMO DO ANKICONNECT (versão 6) — roda SÓ no navegador.
 *
 * O AnkiConnect é um complemento do Anki do computador que abre uma API HTTP em `127.0.0.1:8765`. O servidor
 * do Frasy NUNCA fala com ele (não alcança a máquina da pessoa, e não deve): quem chama é a página, e nenhum
 * dado vai a terceiros. A CSP libera só essa origem em `connect-src` (`server/http/csp.ts`).
 *
 * O CORS é do complemento: ele só responde a páginas listadas em `webCorsOriginList`. Sem a origem do Frasy
 * na lista, o `fetch` falha igual a "Anki fechado" (`TypeError`); para separar os dois casos, uma sonda
 * `no-cors` (que não precisa de permissão) diz se há alguém escutando na porta.
 *
 * O corpo vai como texto simples (sem `Content-Type: application/json`) de propósito: é uma requisição
 * "simples" e dispensa o preflight, como a documentação do AnkiConnect e o Yomitan fazem.
 */
import {
  type CartaoParaAnki,
  type MapeamentoDeCampos,
  montarNotaParaAnki,
  type NotaParaAnki,
} from '../../core/anki/paraAnkiConnect';
import { t } from '../i18n';

export const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
export const VERSAO_DA_API = 6;
export const PRAZO_PADRAO_MS = 4000;
export const PRAZO_DO_LOTE_MS = 20_000;
export const TAMANHO_DO_LOTE = 50;
/** Teto de notas por envio (segurança contra um clique em milhares de cartões). */
export const TETO_DE_NOTAS_POR_ENVIO = 5000;
const TETO_DO_NOME = 200;

export type MotivoDeErroDoAnki =
  | 'anki-fechado'
  | 'origem-nao-liberada'
  | 'permissao-negada'
  | 'chave-obrigatoria'
  | 'chave-incorreta'
  | 'versao-antiga'
  | 'tempo-esgotado'
  | 'resposta-invalida'
  | 'entrada-invalida'
  | 'erro-do-anki';

/** A linha EXATA que a pessoa cola na configuração do AnkiConnect, com a origem atual do app. */
export function linhaDeConfiguracao(origem: string = origemAtual()): string {
  return `"webCorsOriginList": ["http://localhost", ${JSON.stringify(origem)}]`;
}

/** O trecho de `apiKey` que recomendamos junto do `webCorsOriginList` (a senha é da pessoa, não nossa). */
export const LINHA_DA_CHAVE = '"apiKey": "<uma senha sua>"';

/** O trecho completo da configuração do AnkiConnect: origem liberada + chave. */
export function trechoDeConfiguracao(origem: string = origemAtual()): string {
  return `{\n  ${linhaDeConfiguracao(origem)},\n  ${LINHA_DA_CHAVE}\n}`;
}

/**
 * A CHAVE DO ANKICONNECT, só em memória deste módulo: vai no campo `key` de cada chamada ao Anki local e em
 * lugar nenhum mais (nunca ao servidor do Frasy, a log, telemetria ou Sentry). Quem guarda entre aberturas é
 * `ankiConnectPrefs.ts` (sessionStorage por padrão).
 */
let chaveAtual = '';
export function definirChaveDoAnki(chave: string): void {
  chaveAtual = chave.trim().slice(0, 200);
}

function origemAtual(): string {
  try {
    return globalThis.location?.origin || 'https://frasy.com.br';
  } catch {
    return 'https://frasy.com.br';
  }
}

export class ErroDoAnkiConnect extends Error {
  readonly motivo: MotivoDeErroDoAnki;
  /** O que o próprio Anki disse (`error` da resposta), quando houve. */
  readonly detalhe?: string;
  constructor(motivo: MotivoDeErroDoAnki, mensagem: string, detalhe?: string) {
    super(mensagem);
    this.name = 'ErroDoAnkiConnect';
    this.motivo = motivo;
    this.detalhe = detalhe;
  }
}

/** A mensagem acionável de cada motivo, no idioma da interface. */
export function mensagemDoErro(motivo: MotivoDeErroDoAnki, origem: string = origemAtual()): string {
  switch (motivo) {
    case 'anki-fechado':
      return t(
        'Não achei o Anki. Abra o Anki no computador e confira se o complemento AnkiConnect está instalado (código 2055492159).',
      );
    case 'origem-nao-liberada':
      return t(
        'O Anki está aberto, mas não deixou o Frasy falar com ele. No Anki, abra Ferramentas > Complementos > AnkiConnect > Config e deixe assim, com uma senha sua em “apiKey”: {trecho}. Depois reinicie o Anki.',
        { trecho: trechoDeConfiguracao(origem) },
      );
    case 'permissao-negada':
      return t('O Anki recusou o acesso do Frasy. Tente de novo e escolha “Sim” na janela que o Anki abrir.');
    case 'chave-obrigatoria':
      return t(
        'O seu AnkiConnect pede uma chave (“apiKey”). Digite a chave no campo “Chave do AnkiConnect” e tente de novo.',
      );
    case 'chave-incorreta':
      return t(
        'O Anki não aceitou a chave. Confira se ela é igual ao valor de “apiKey” na configuração do AnkiConnect (Ferramentas > Complementos > AnkiConnect > Config) e tente de novo.',
      );
    case 'versao-antiga':
      return t('O AnkiConnect está desatualizado. No Anki, abra Ferramentas > Complementos e atualize o AnkiConnect.');
    case 'tempo-esgotado':
      return t('O Anki demorou demais para responder. Veja se não há uma janela aberta nele e tente de novo.');
    case 'resposta-invalida':
      return t('O Anki respondeu algo que o Frasy não entendeu. Atualize o AnkiConnect e tente de novo.');
    case 'entrada-invalida':
      return t('Há algo errado com o que seria enviado. Confira o baralho, o modelo e os campos.');
    default:
      return t('O Anki recusou o pedido.');
  }
}

function erro(motivo: MotivoDeErroDoAnki, detalhe?: string, origem?: string): ErroDoAnkiConnect {
  return new ErroDoAnkiConnect(motivo, mensagemDoErro(motivo, origem), detalhe);
}

interface OpcoesDaChamada {
  prazoMs?: number;
  sinal?: AbortSignal;
}

/** Sem resposta: o Anki está fechado ou a origem não foi liberada? A sonda `no-cors` decide. */
async function explicarFalhaDeRede(prazoMs: number): Promise<ErroDoAnkiConnect> {
  try {
    await fetch(ANKI_CONNECT_URL, { mode: 'no-cors', signal: AbortSignal.timeout(prazoMs) });
    return erro('origem-nao-liberada');
  } catch {
    return erro('anki-fechado');
  }
}

/** Uma chamada crua à API. Devolve `result` ou lança `ErroDoAnkiConnect`. */
async function chamar<T>(action: string, params?: Record<string, unknown>, o: OpcoesDaChamada = {}): Promise<T> {
  const prazo = o.prazoMs ?? PRAZO_PADRAO_MS;
  const sinais = [AbortSignal.timeout(prazo), ...(o.sinal ? [o.sinal] : [])];
  let resposta: Response;
  try {
    resposta = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action,
        version: VERSAO_DA_API,
        ...(chaveAtual ? { key: chaveAtual } : {}),
        ...(params ? { params } : {}),
      }),
      signal: AbortSignal.any(sinais),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (e) {
    if (o.sinal?.aborted) throw e;
    if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') throw erro('tempo-esgotado');
    throw await explicarFalhaDeRede(PRAZO_PADRAO_MS);
  }
  if (!resposta.ok) throw erro('resposta-invalida', `HTTP ${resposta.status}`);
  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    throw erro('resposta-invalida');
  }
  if (!corpo || typeof corpo !== 'object' || !('result' in corpo) || !('error' in corpo)) {
    throw erro('resposta-invalida');
  }
  const { result, error } = corpo as { result: unknown; error: unknown };
  if (error !== null && error !== undefined) {
    const texto = String(error);
    if (/valid api key|api key/i.test(texto)) throw erro(chaveAtual ? 'chave-incorreta' : 'chave-obrigatoria', texto);
    if (/permission|denied|forbidden/i.test(texto)) throw erro('permissao-negada', texto);
    throw new ErroDoAnkiConnect('erro-do-anki', t('O Anki recusou o pedido: {motivo}', { motivo: texto }), texto);
  }
  return result as T;
}

export interface ConexaoComOAnki {
  versao: number;
}

/**
 * Testa a conexão. O `requestPermission` é a única ação que um site ainda não autorizado pode chamar: na
 * primeira vez o PRÓPRIO Anki abre a janela de permissão. Só depois pede a `version`.
 */
export async function testarConexao(o: OpcoesDaChamada = {}): Promise<ConexaoComOAnki> {
  // A janela de permissão espera uma pessoa: prazo bem maior que o das outras chamadas.
  const permissao = await chamar<{ permission?: string; requireApiKey?: boolean; version?: number }>(
    'requestPermission',
    undefined,
    { ...o, prazoMs: o.prazoMs ?? 60_000 },
  );
  if (!permissao || typeof permissao !== 'object') throw erro('resposta-invalida');
  if (permissao.permission !== 'granted') throw erro('permissao-negada');
  if (permissao.requireApiKey && !chaveAtual) throw erro('chave-obrigatoria');
  const versao = await chamar<number>('version', undefined, o);
  if (typeof versao !== 'number') throw erro('resposta-invalida');
  if (versao < VERSAO_DA_API) throw erro('versao-antiga', String(versao));
  return { versao };
}

function listaDeTextos(v: unknown): string[] {
  if (!Array.isArray(v)) throw erro('resposta-invalida');
  return v.filter((x): x is string => typeof x === 'string');
}

export async function listarBaralhos(o?: OpcoesDaChamada): Promise<string[]> {
  return listaDeTextos(await chamar<unknown>('deckNames', undefined, o)).sort((a, b) => a.localeCompare(b));
}

export async function listarModelos(o?: OpcoesDaChamada): Promise<string[]> {
  return listaDeTextos(await chamar<unknown>('modelNames', undefined, o)).sort((a, b) => a.localeCompare(b));
}

function nomeValido(nome: string, rotulo: string): string {
  const n = typeof nome === 'string' ? nome.trim() : '';
  // eslint-disable-next-line no-control-regex
  if (!n || n.length > TETO_DO_NOME || /[\u0000-\u001f]/.test(n)) throw erro('entrada-invalida', rotulo);
  return n;
}

export async function camposDoModelo(modelo: string, o?: OpcoesDaChamada): Promise<string[]> {
  return listaDeTextos(await chamar<unknown>('modelFieldNames', { modelName: nomeValido(modelo, 'modelo') }, o));
}

/** Cria o baralho (ou confirma que já existe: o `createDeck` do AnkiConnect é idempotente). */
export async function criarBaralho(nome: string, o?: OpcoesDaChamada): Promise<void> {
  await chamar<unknown>('createDeck', { deck: nomeValido(nome, 'baralho') }, o);
}

/** Pergunta ao Anki quais notas ele aceitaria (duplicata no baralho dá `false`). */
export async function podeAdicionar(notas: NotaParaAnki[], o?: OpcoesDaChamada): Promise<boolean[]> {
  const r = await chamar<unknown>('canAddNotes', { notes: notas }, { prazoMs: PRAZO_DO_LOTE_MS, ...o });
  if (!Array.isArray(r) || r.length !== notas.length) throw erro('resposta-invalida');
  return r.map((x) => x === true);
}

/** Adiciona um lote. `null` no resultado = o Anki recusou aquela nota (duplicata ou campo inválido). */
export async function adicionarNotas(notas: NotaParaAnki[], o?: OpcoesDaChamada): Promise<Array<number | null>> {
  const r = await chamar<unknown>('addNotes', { notes: notas }, { prazoMs: PRAZO_DO_LOTE_MS, ...o });
  if (!Array.isArray(r) || r.length !== notas.length) throw erro('resposta-invalida');
  return r.map((x) => (typeof x === 'number' ? x : null));
}

export interface ResumoDoEnvio {
  adicionados: number;
  duplicados: number;
  /** Recusadas pelo Anki, ou que não viraram nota (sem palavra, sem lacuna para o cloze). */
  erros: number;
}

export interface AlvoDoEnvio {
  baralho: string;
  modelo: string;
  mapeamento: MapeamentoDeCampos;
}

/**
 * Envia os cartões em lotes: monta a nota, pergunta ao Anki o que ele aceita (as duplicatas saem aqui), e
 * adiciona o resto. Uma falha de conexão no meio PARA e relança (o que já foi vai constar no `aoProgredir`).
 */
export async function enviarCartoes(
  cartoes: CartaoParaAnki[],
  alvo: AlvoDoEnvio,
  opcoes: { aoProgredir?: (feitos: number, total: number, parcial: ResumoDoEnvio) => void; sinal?: AbortSignal } = {},
): Promise<ResumoDoEnvio> {
  if (cartoes.length > TETO_DE_NOTAS_POR_ENVIO) throw erro('entrada-invalida', 'teto');
  const baralho = nomeValido(alvo.baralho, 'baralho');
  const modelo = nomeValido(alvo.modelo, 'modelo');
  const resumo: ResumoDoEnvio = { adicionados: 0, duplicados: 0, erros: 0 };
  const chamada = { sinal: opcoes.sinal };
  await criarBaralho(baralho, chamada);
  for (let i = 0; i < cartoes.length; i += TAMANHO_DO_LOTE) {
    if (opcoes.sinal?.aborted) break;
    const lote = cartoes.slice(i, i + TAMANHO_DO_LOTE);
    const notas: NotaParaAnki[] = [];
    for (const c of lote) {
      const r = montarNotaParaAnki(c, { deckName: baralho, modelName: modelo, mapeamento: alvo.mapeamento });
      if (r.ok) notas.push(r.nota);
      else resumo.erros++;
    }
    if (notas.length) {
      const aceitas = await podeAdicionar(notas, chamada);
      const novas = notas.filter((_n, k) => aceitas[k]);
      resumo.duplicados += notas.length - novas.length;
      if (novas.length) {
        const ids = await adicionarNotas(novas, chamada);
        for (const id of ids) {
          if (id === null) resumo.erros++;
          else resumo.adicionados++;
        }
      }
    }
    opcoes.aoProgredir?.(Math.min(i + lote.length, cartoes.length), cartoes.length, { ...resumo });
  }
  return resumo;
}
