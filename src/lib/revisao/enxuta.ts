/**
 * A REVISÃO ENXUTA E AS PRÁTICAS — as contas do protótipo `cartoes-enxuto-src` (`cartoes2.js` e
 * `cartoes4.js`), função por função, com os mesmos números. Nada aqui toca em tela, rede ou relógio:
 * é o que os componentes de `views/revisao/` e os testes (`tests/revisaoEnxuta.test.ts`) usam.
 */
import { ERROS_DE_DIFICIL } from '../../core/learning/resumoDosCartoes';

/** `cxHash()` de `cartoes2.js:50`. */
export const hashDoTexto = (s: string): number => [...s].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 9973, 7);

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `ctAchar()` de `cartoes2.js:56-69`: onde a palavra está dentro da frase. Aceita flexão ("complain"
 * em "complaining") e palavra composta ("walk through"): devolve um trecho por parte achada.
 */
export function acharNaFrase(frase: string, palavra: string): Array<[number, number]> {
  const achados: Array<[number, number]> = [];
  let de = 0;
  for (const p of palavra.split(' ')) {
    if (!p) continue;
    const raiz = p.length > 4 ? p.slice(0, p.length - 2) : p;
    const m = new RegExp(`(^|[^\\p{L}])(${escRe(p)}[\\p{L}]*|${escRe(raiz)}[\\p{L}]*)`, 'iu').exec(frase.slice(de));
    if (!m) continue;
    const ini = de + m.index + m[1].length;
    achados.push([ini, ini + m[2].length]);
    de = ini + m[2].length;
  }
  return achados;
}

/** `ctAlvoNaFrase()` de `cartoes2.js:83-87`: a palavra como ela aparece na frase (com a flexão). */
export function alvoNaFrase(frase: string, palavra: string): string {
  const a = acharNaFrase(frase, palavra);
  return a.length ? frase.slice(a[0][0], a[a.length - 1][1]) : palavra;
}

export type PedacoDaFrase = { texto: string; tipo: 'texto' | 'marca' | 'vao' };

/**
 * `ctFrase()` de `cartoes2.js:70-82`, em pedaços (quem desenha é o componente): `marca` destaca a
 * palavra, `vao` troca do começo da primeira parte ao fim da última por uma lacuna.
 */
export function pedacosDaFrase(frase: string, palavra: string, modo: 'marca' | 'vao'): PedacoDaFrase[] {
  const a = acharNaFrase(frase, palavra);
  if (!a.length) return [{ texto: frase, tipo: 'texto' }];
  if (modo === 'vao')
    return [
      { texto: frase.slice(0, a[0][0]), tipo: 'texto' },
      { texto: frase.slice(a[0][0], a[a.length - 1][1]), tipo: 'vao' },
      { texto: frase.slice(a[a.length - 1][1]), tipo: 'texto' },
    ];
  const saida: PedacoDaFrase[] = [];
  let de = 0;
  for (const [i, j] of a) {
    if (i > de) saida.push({ texto: frase.slice(de, i), tipo: 'texto' });
    saida.push({ texto: frase.slice(i, j), tipo: 'marca' });
    de = j;
  }
  if (de < frase.length) saida.push({ texto: frase.slice(de), tipo: 'texto' });
  return saida;
}

/**
 * `cxPedeDizer()` de `cartoes2.js:206`: o convite "Diga em voz alta antes de virar" aparece em um de
 * cada três cartões (o ganho vem do contraste), só no formato Lembrar, com a preferência ligada e sem o
 * "Agora não" desta rodada.
 */
export function pedeDizer(
  idDoCartao: string,
  e: { ligado: boolean; semDizerNestaRodada: boolean; formatoLembrar: boolean },
): boolean {
  return e.ligado && !e.semDizerNestaRodada && e.formatoLembrar && hashDoTexto(idDoCartao) % 3 === 0;
}

/**
 * Quantos erros até o app avisar que a palavra não está entrando (`CT_AJ.dificil`, `cartoes.js:69`). É a
 * MESMA régua de "Difíceis" na tela Cartões e no catálogo de conteúdo: uma constante só.
 */
export const ERROS_ATE_O_AVISO = ERROS_DE_DIFICIL;

/** `ctDificil()` de `cartoes.js:151` (o app não tem etiquetas: vale só a conta de erros). */
export const palavraDificil = (lapsos: number | null | undefined): boolean => (lapsos ?? 0) >= ERROS_ATE_O_AVISO;

/* ---- Ondas (`cartoes4.js:15-38`) --------------------------------------------------------------- */

/** Quantas barras tem uma onda (`CX_N`). */
export const BARRAS_DA_ONDA = 44;

/** `cxPicos()` de `cartoes4.js:17-27`: a onda DESENHADA de uma frase (não é o áudio dela). */
export function picosDaFrase(texto: string, n = BARRAS_DA_ONDA): number[] {
  let s = hashDoTexto(texto) + 11;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const sil = Math.max(3, Math.round(texto.split(/\s+/).length * 1.5));
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const env = Math.sin(Math.PI * Math.min(1, t * 1.06)) ** 0.6;
    const syl = 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * sil));
    return Math.max(0.08, Math.min(1, env * syl * (0.5 + r() * 0.65)));
  });
}

/** `cxReamostrar()` de `cartoes4.js:30-38`: os picos medidos no microfone, em `n` barras de 0,08 a 1. */
export function reamostrar(picos: readonly number[], n = BARRAS_DA_ONDA): number[] {
  if (!picos.length) return Array<number>(n).fill(0.08);
  const max = Math.max(0.25, ...picos);
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i / n) * picos.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * picos.length));
    return Math.max(0.08, Math.min(1, Math.max(...picos.slice(a, b)) / max));
  });
}

/** A duração da varredura da fala original (`durO`, `cartoes4.js:69`). */
export const duracaoDaOriginal = (frase: string): number => Math.min(3600, Math.max(1300, frase.length * 62));

/** As 30 barras da cena de áudio (`cxCena`, `cartoes2.js:178-181`): `[x, y, altura]` no quadro 320×180. */
export function barrasDaCena(frase: string): Array<[number, number, number]> {
  const sem = hashDoTexto(frase);
  return Array.from({ length: 30 }, (_, i) => {
    const h = 10 + ((sem * (i + 3) * 17) % 43) * (0.45 + 0.55 * Math.sin((i / 29) * Math.PI));
    return [24 + i * 9.2, 86 - h / 2, h];
  });
}

/* ---- As práticas (`cartoes4.js:489-549`) ------------------------------------------------------- */

/** `cxEmbaralhar()` de `cartoes4.js:41-50`: embaralha com semente (o desenho não muda entre visitas). */
export function embaralharComSemente<T>(lista: readonly T[], semente: string | number): T[] {
  const l = lista.slice();
  let s = hashDoTexto(String(semente)) * 2654435761 + 97;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

/** `cxLimpa()` de `cartoes4.js:522`: minúsculas, sem acento e sem pontuação, um espaço só. */
export const limparResposta = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** `cxDist()` de `cartoes4.js:523-528`: a distância de edição. */
export function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** `cxPerto()` de `cartoes4.js:530`: 2 = igual, 1 = quase (um deslize de digitação), 0 = outra coisa. */
export const perto = (dita: string, certa: string): 0 | 1 | 2 =>
  dita === certa ? 2 : certa.length > 3 && distancia(dita, certa) <= (certa.length > 7 ? 2 : 1) ? 1 : 0;

export type MarcaDaPalavra = 'ok' | 'quase' | 'falta';
export interface ResultadoDoDitado {
  /** Uma marca por palavra da frase certa. */
  marcas: MarcaDaPalavra[];
  /** A frase certa, palavra por palavra, como se escreve. */
  exibe: string[];
  veredito: 'certo' | 'parcial' | 'errado';
  quase: boolean;
  pegouAPalavra: boolean;
  /** Conta como lembrada: certo, ou parcial com a palavra do cartão. */
  lembrou: boolean;
}

/** `cxConferirDitado()` de `cartoes4.js:531-549`. */
export function conferirDitadoDaFrase(texto: string, frase: string, palavra: string): ResultadoDoDitado {
  const alvo = limparResposta(frase).split(' ');
  const dita = limparResposta(texto).split(' ').filter(Boolean);
  const exibe = frase.replace(/[“”"]/g, '').split(/\s+/);
  let j = 0;
  const marcas = alvo.map<MarcaDaPalavra>((w) => {
    for (let x = j; x < Math.min(dita.length, j + 3); x++) {
      const q = perto(dita[x], w);
      if (q) {
        j = x + 1;
        return q === 2 ? 'ok' : 'quase';
      }
    }
    return 'falta';
  });
  const partes = limparResposta(alvoNaFrase(frase, palavra)).split(' ');
  const pegouAPalavra = partes.every((p) => alvo.some((w, i) => w === p && marcas[i] !== 'falta'));
  const nota = marcas.filter((m) => m !== 'falta').length / alvo.length;
  const quase = marcas.includes('quase');
  const veredito = nota >= 0.85 && pegouAPalavra ? 'certo' : nota >= 0.5 ? 'parcial' : 'errado';
  return {
    marcas,
    exibe,
    veredito,
    quase,
    pegouAPalavra,
    lembrou: veredito === 'certo' || (veredito === 'parcial' && pegouAPalavra),
  };
}

/** `cxVerificar()` de `cartoes4.js:879-882`, para "Completar": 2 certo, 1 quase, 0 errado. */
export function conferirLacuna(texto: string, frase: string, palavra: string): 0 | 1 | 2 {
  const dita = limparResposta(texto);
  if (!dita) return 0;
  const naFrase = perto(dita, limparResposta(alvoNaFrase(frase, palavra)));
  const exata = perto(dita, limparResposta(palavra)) === 2 ? 2 : 0;
  return Math.max(naFrase, exata) as 0 | 1 | 2;
}

export type TipoDePratica = 'falar' | 'ditado' | 'completar' | 'jogo';

/** Quantos cartões cada prática leva (`CX_PR`, `cartoes4.js:399-402`). */
export const CARTOES_POR_PRATICA: Record<TipoDePratica, number> = { falar: 3, ditado: 3, completar: 4, jogo: 4 };

/** O que a escolha dos cartões de uma prática precisa saber de cada cartão. */
export interface CartaoParaPratica {
  id: string;
  palavra: string;
  frase: string;
}

/**
 * `cxItens()` de `cartoes4.js:490-507`, com uma diferença pedida pelo dono: a prática roda SÓ sobre o
 * recorte recebido. O protótipo completava com o resto da fila quando o recorte era pequeno; aqui um
 * cartão de fora do recorte nunca recebe nota por uma prática que a pessoa não pediu para ele.
 *
 *  · duas palavras nascidas da mesma fala: a frase entra uma vez só;
 *  · Falar e Ouvir e escrever: as frases mais curtas primeiro (o ditado, até 48 letras);
 *  · Completar: só frase em que a lacuna não é o começo (a palavra depois da 5ª letra).
 */
export function itensDaPratica<T extends CartaoParaPratica>(tipo: TipoDePratica, recorte: readonly T[]): T[] {
  const comFrase = recorte.filter((c, i, l) => c.frase.trim() && l.findIndex((x) => x.id === c.id) === i);
  const semFraseRepetida = (l: T[]) => l.filter((c, i) => l.findIndex((x) => x.frase === c.frase) === i);
  const curtas = (l: T[]) => l.slice().sort((a, b) => a.frase.length - b.frase.length);
  const n = CARTOES_POR_PRATICA[tipo];
  if (tipo === 'falar') return semFraseRepetida(curtas(comFrase)).slice(0, n);
  if (tipo === 'ditado') return semFraseRepetida(curtas(comFrase).filter((c) => c.frase.length <= 48)).slice(0, n);
  if (tipo === 'completar')
    return semFraseRepetida(comFrase.filter((c) => (acharNaFrase(c.frase, c.palavra)[0]?.[0] ?? 0) > 5)).slice(0, n);
  return recorte.filter((c, i, l) => l.findIndex((x) => x.id === c.id) === i).slice(0, n);
}

/** `ctDiff()` de `cartoes2.js:259-269`: a resposta comparada com a certa, letra a letra. */
export function diferencaLetraALetra(
  dita: string,
  certa: string,
): Array<{ letra: string; tipo: 'igual' | 'sobra' | 'falta' }> {
  const a = dita.trim().toLowerCase();
  const b = certa.toLowerCase();
  const saida: Array<{ letra: string; tipo: 'igual' | 'sobra' | 'falta' }> = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) saida.push({ letra: b[i], tipo: 'igual' });
    else if (b[i] == null) saida.push({ letra: a[i], tipo: 'sobra' });
    else saida.push({ letra: b[i] === ' ' ? '␣' : b[i], tipo: 'falta' });
  }
  return saida;
}

/** "0:42", o relógio da sessão (`ctTempoDaSessao`, `cartoes2.js:136-139`). */
export const relogio = (seg: number): string => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

/** "00:38", o tempo da fala dentro da sessão. */
export function tempoDaFala(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
