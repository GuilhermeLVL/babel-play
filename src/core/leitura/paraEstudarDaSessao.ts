/**
 * "PARA ESTUDAR DESTA SESSÃO" (openspec `frases-i-mais-1`): do que a pessoa disse ou ouviu, o que vale estudar.
 *  - FRASES i+1 (Krashen; "sentence mining" do Refold, "1 desconhecida" do Migaku): a frase com EXATAMENTE UMA palavra
 *    desconhecida é o melhor cartão, porque o resto dela a pessoa já entende e a palavra nova vem com contexto;
 *  - PALAVRAS NOVAS, por frequência (Language Reactor, Trancy): a que mais aparece na sessão rende mais.
 *
 * A régua de "desconhecida" é a MESMA da cobertura (`coberturaDoTexto`): funcional do idioma, nome próprio e a palavra
 * (com a flexão) no conjunto `conhecidas` contam como sabidas. O mesmo portão de honestidade: idioma que não separa
 * palavras por espaço, e pouco texto, dão `null`. Roda no aparelho; puro (sem DOM, sem rede).
 */
import { nivelCefr } from '../learning/cefrWordlist';
import { baseLang } from '../texto/idioma';
import { ELISOES } from '../texto/segmentacao';
import { idiomaTemCobertura, LIMITE_DE_CARACTERES, PALAVRAS_MINIMAS_PARA_COBERTURA } from './coberturaDoConteudo';
import { funcionais } from './coberturaDoTexto';
import { chavesDeLema, dividirTexto } from './textoDaLeitura';

/** Frase curta demais ("Yes, sure.") não dá contexto; longa demais não vira cartão. */
export const PALAVRAS_MINIMAS_DA_FRASE = 4;
export const PALAVRAS_MAXIMAS_DA_FRASE = 22;
/** O tamanho que mais se parece com um bom cartão: entre as frases de uma palavra, vale a mais perto dele. */
const TAMANHO_IDEAL = 10;

export type NivelDaPalavra = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
const ORDEM_DOS_NIVEIS: readonly NivelDaPalavra[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface PalavraNovaDaSessao {
  /** Como aparece na sessão (minúscula, sem a pontuação das bordas): o que o cartão guarda. */
  palavra: string;
  chave: string;
  /** Quantas vezes aparece na sessão. */
  vezes: number;
  /** O nível CEFR quando há lista para o idioma (hoje só inglês); senão `null`. */
  nivel: NivelDaPalavra | null;
  /** A frase onde aparece primeiro: o contexto do "Guardar" da lista. */
  frase: string;
  fala: number;
}

export interface FraseIMais1 {
  /** A frase como foi dita. */
  frase: string;
  /** Onde a palavra-alvo está na frase (`slice`), sem a pontuação colada. */
  destaque: { inicio: number; fim: number };
  palavra: string;
  chave: string;
  /** O índice da fala na lista recebida (leva o player até ela). */
  fala: number;
  vezes: number;
  nivel: NivelDaPalavra | null;
}

export interface ParaEstudarDaSessao {
  frases: FraseIMais1[];
  palavras: PalavraNovaDaSessao[];
}

const regexDeElisao = new Map<string, RegExp | null>();
/** A elisão (`l'`, `d'`) vira espaços do mesmo tamanho: "l'homme" passa a "homme" sem mexer nas posições. */
function semElisoes(texto: string, base: string): string {
  let re = regexDeElisao.get(base);
  if (re === undefined) {
    const lista = ELISOES[base];
    re = lista ? new RegExp(`(?<!\\p{L})(?:${[...lista].join('|')})['’ʼ](?=\\p{L})`, 'giu') : null;
    regexDeElisao.set(base, re);
  }
  return re ? texto.replace(re, (m) => ' '.repeat(m.length)) : texto;
}

function nivelDe(palavra: string, lang: string): NivelDaPalavra | null {
  for (const forma of [palavra, ...chavesDeLema(palavra, lang)]) {
    const n = nivelCefr(forma, lang).level;
    if (n) return n;
  }
  return null;
}
const posicaoDoNivel = (n: NivelDaPalavra | null) => (n ? ORDEM_DOS_NIVEIS.indexOf(n) : ORDEM_DOS_NIVEIS.length);

/** Onde a palavra mesmo está no token, sem a pontuação das bordas. */
function miolo(token: string): { inicio: number; fim: number } {
  const letra = /[\p{L}\p{N}]/u;
  const inicio = Math.max(0, token.search(letra));
  let fim = token.length;
  while (fim > inicio && !letra.test(token[fim - 1]!)) fim--;
  return { inicio, fim };
}

/**
 * Frases i+1 e palavras novas das `falas` (texto no idioma `lang`; as de outro idioma ficam fora, como na cobertura),
 * ou `null` quando o resultado não seria honesto. O índice da fala é o da lista recebida. Acima de `limite`
 * caracteres a conta para (as falas do começo): melhor um recorte que travar a tela.
 */
export function paraEstudarDaSessao(
  falas: ReadonlyArray<{ texto: string; lang?: string | null }>,
  lang: string,
  conhecidas: ReadonlySet<string>,
  limite = LIMITE_DE_CARACTERES,
): ParaEstudarDaSessao | null {
  if (!idiomaTemCobertura(lang)) return null;
  const base = baseLang(lang);
  const sabidas = funcionais(base);
  const dividas: Array<{ fala: number; texto: string; d: ReturnType<typeof dividirTexto> }> = [];
  /* Nome próprio com a sessão inteira: "Maria" no começo de uma fala é nome se aparece com maiúscula no meio de outra. */
  const nomes = new Set<string>();
  let caracteres = 0;
  for (let i = 0; i < falas.length; i++) {
    const f = falas[i]!;
    if (f.lang && baseLang(f.lang) !== base) continue;
    caracteres += f.texto.length;
    if (caracteres > limite) break;
    const d = dividirTexto(semElisoes(f.texto, base), base);
    for (const p of d.palavras) if (p.nomeProprio) nomes.add(p.chave);
    dividas.push({ fala: i, texto: f.texto, d });
  }
  const total = dividas.reduce((n, x) => n + x.d.palavras.length, 0);
  if (total < PALAVRAS_MINIMAS_PARA_COBERTURA) return null;

  const desconhecida = (p: { texto: string; chave: string; nomeProprio: boolean }) =>
    !(
      p.nomeProprio ||
      (nomes.has(p.chave) && /^[^\p{L}]*\p{Lu}/u.test(p.texto)) ||
      sabidas.has(p.chave) ||
      chavesDeLema(p.texto, base).some((c) => conhecidas.has(c))
    );

  const vezes = new Map<string, number>();
  const palavras = new Map<string, PalavraNovaDaSessao>();
  type Candidata = Omit<FraseIMais1, 'vezes' | 'nivel'> & { tamanho: number };
  const candidatas = new Map<string, Candidata>();
  const vistas = new Set<string>();

  for (const { fala, texto, d } of dividas) {
    const porFrase = new Map<number, typeof d.palavras>();
    for (const p of d.palavras) {
      const l = porFrase.get(p.frase);
      if (l) l.push(p);
      else porFrase.set(p.frase, [p]);
    }
    for (const [iFrase, ps] of porFrase) {
      const f = d.frases[iFrase]!;
      const original = texto.slice(f.inicio, f.fim);
      const novas = ps.filter(desconhecida);
      for (const p of novas) {
        vezes.set(p.chave, (vezes.get(p.chave) ?? 0) + 1);
        if (!palavras.has(p.chave)) {
          const m = miolo(p.texto);
          const forma = p.texto.slice(m.inicio, m.fim).toLocaleLowerCase(base);
          palavras.set(p.chave, {
            palavra: forma,
            chave: p.chave,
            vezes: 0,
            nivel: nivelDe(forma, base),
            frase: original,
            fala,
          });
        }
      }
      const chaves = new Set(novas.map((p) => p.chave));
      if (chaves.size !== 1 || ps.length < PALAVRAS_MINIMAS_DA_FRASE || ps.length > PALAVRAS_MAXIMAS_DA_FRASE) continue;
      if (vistas.has(original)) continue;
      vistas.add(original);
      const alvo = novas[0]!;
      const atual = candidatas.get(alvo.chave);
      if (atual && Math.abs(ps.length - TAMANHO_IDEAL) >= Math.abs(atual.tamanho - TAMANHO_IDEAL)) continue;
      const m = miolo(alvo.texto);
      candidatas.set(alvo.chave, {
        frase: original,
        destaque: { inicio: alvo.inicio - f.inicio + m.inicio, fim: alvo.inicio - f.inicio + m.fim },
        palavra: palavras.get(alvo.chave)!.palavra,
        chave: alvo.chave,
        fala,
        tamanho: ps.length,
      });
    }
  }

  const ordem = (
    a: { chave: string; nivel: NivelDaPalavra | null },
    b: { chave: string; nivel: NivelDaPalavra | null },
  ) =>
    (vezes.get(b.chave) ?? 0) - (vezes.get(a.chave) ?? 0) ||
    posicaoDoNivel(a.nivel) - posicaoDoNivel(b.nivel) ||
    a.chave.localeCompare(b.chave, base);

  const listaDePalavras = [...palavras.values()].map((p) => ({ ...p, vezes: vezes.get(p.chave) ?? 0 })).sort(ordem);
  const nivelPorChave = new Map(listaDePalavras.map((p) => [p.chave, p.nivel]));
  const frases = [...candidatas.values()]
    .map(
      ({ tamanho: _tamanho, ...c }): FraseIMais1 => ({
        ...c,
        vezes: vezes.get(c.chave) ?? 0,
        nivel: nivelPorChave.get(c.chave) ?? null,
      }),
    )
    .sort(ordem);
  return { frases, palavras: listaDePalavras };
}
