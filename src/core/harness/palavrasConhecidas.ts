/**
 * PALAVRAS QUE O ALUNO JÁ SABE — o predicado do degrau M0 do harness (`harness-adaptativo.md` §1.2).
 *
 * POR QUE EXISTE. O degrau mais barato da escada de tradução é NÃO traduzir: 3 mil famílias de
 * palavras cobrem ~95% da fala de TV (Webb & Rodgers), e quem já sabe todas as palavras de uma
 * frase não precisa de MT para ela. `routeMt` já tinha o degrau (`palavrasConhecidas?`), mas
 * ninguém sabia responder "ele sabe esta palavra?". Aqui a resposta vem de três fontes, da mais
 * forte à mais fraca:
 *
 *   1. O CADERNO dele — mas SALVAR NÃO É SABER. Só conta o cartão MADURO no SRS:
 *        · FSRS: fase `Review` (≥ 2 revisões com estabilidade, ver `fsrsStateOf` em
 *          `data/rotas/vocabulario.ts`) E estabilidade ≥ 7 dias — a memória aguenta uma semana
 *          sem revisão. `New`, `Learning` e `Relearning` (esqueceu e está reaprendendo) não contam;
 *        · Leitner legado (sem estabilidade gravada): caixa 3 em diante, ou seja, acertou duas vezes
 *          seguidas. A caixa 1 é onde toda carta nasce e para onde volta no erro;
 *        · cartão tirado das rodadas (`inDeck = false`) não conta — é a mesma régua de
 *          `palavrasAprendidas`.
 *   2. A LISTA DE FREQUÊNCIA do idioma (`public/trilha/{lang}.json`, por nível), só ABAIXO do nível
 *      do aluno. O nível é o que o chamador passar; sem passar, é ESTIMADO pelo próprio caderno com
 *      a régua da trilha (`nivelSugerido`: o primeiro nível ainda não 80% maduro). Quem começa fica
 *      no A1 e nada da trilha conta como sabido — errar para o lado de traduzir é o seguro.
 *   3. PALAVRAS FUNCIONAIS (artigo, pronome, preposição, auxiliar), por idioma. Sem elas, "The dog
 *      is in the kitchen" nunca seria "tudo conhecido": são as palavras mais frequentes e nenhuma
 *      lista de vocabulário as traz como cartão.
 *
 * NORMALIZAÇÃO PEQUENA E LOCAL, de propósito. Caixa, acento e pontuação saem por `chaveDaPalavra`;
 * a flexão, por um punhado de sufixos por idioma (`formasDaPalavra`: "cats" → "cat", "stopped" →
 * "stop"). Não é lematizador — "went" não vira "go" — e erra para o lado seguro: uma forma não
 * reconhecida é "palavra nova", e a frase é traduzida como antes. O dicionário vai ganhar formas →
 * lema de verdade (M1); quando existir, este normalizador troca por ele.
 *
 * Função pura, sem DOM nem rede: quem baixa caderno e trilha é o chamador.
 */
import type { CefrLevel } from '../learning/contract';
import { type DadoTrilha, NIVEIS_CEFR, nivelSugerido, progressoDaTrilha } from '../learning/trilha';
import { chaveDaPalavra } from '../texto/palavra';

/** O que o predicado lê de um cartão do caderno (um recorte de `VocabCard`). */
export interface CartaoParaConhecidas {
  word: string;
  /** Idioma da frente. Ausente em cartões antigos = entra (o caderno antigo é do idioma estudado). */
  srcLang?: string;
  inDeck?: boolean;
  fsrsState?: 'New' | 'Learning' | 'Review' | 'Relearning';
  fsrsStability?: number;
  stability?: number;
  leitnerBox?: number;
}

/** Estabilidade mínima (dias) para um cartão FSRS em `Review` contar como sabido. */
export const ESTABILIDADE_MADURA_DIAS = 7;
/** Caixa mínima do Leitner legado para contar como sabido (acertou duas vezes seguidas). */
export const CAIXA_MADURA_LEITNER = 3;

const idiomaBase = (l: string | undefined): string => (l ?? '').toLowerCase().split('-')[0];

/** O cartão está MADURO no SRS (e não só salvo)? Ver o cabeçalho para a régua. */
export function cartaoMaduro(c: Omit<CartaoParaConhecidas, 'word'>): boolean {
  if (c.inDeck === false) return false;
  const estabilidade = c.fsrsStability || c.stability || 0;
  if (estabilidade > 0) return c.fsrsState === 'Review' && estabilidade >= ESTABILIDADE_MADURA_DIAS;
  // Sem estabilidade = nunca passou pelo FSRS: só o Leitner legado responde.
  return (c.leitnerBox ?? 0) >= CAIXA_MADURA_LEITNER;
}

/**
 * PALAVRAS FUNCIONAIS por idioma base — artigos, pronomes, preposições, conjunções e auxiliares.
 * Curtas de propósito: só o que é gramática, nunca conteúdo (nada de "casa", "bom", "fazer").
 * Idioma fora da lista = nenhuma; o caderno e a trilha continuam valendo.
 */
export const PALAVRAS_FUNCIONAIS: Readonly<Record<string, readonly string[]>> = {
  en: (
    'a an the this that these those i you he she it we they me him her us them my your his its our their ' +
    'mine yours is am are was were be been being do does did have has had will would can could shall should ' +
    "may might must i'm you're he's she's it's we're they're i've you've we've they've i'll you'll he'll " +
    "she'll we'll they'll i'd you'd he'd she'd we'd they'd don't doesn't didn't isn't aren't wasn't weren't " +
    "haven't hasn't hadn't won't wouldn't can't cannot couldn't shouldn't that's there's what's let's " +
    'of to in on at by for with from about as into over under up down out off and or but if so not no yes ' +
    'than then there here what who whom which when where why how all some any'
  ).split(' '),
  pt: (
    'o a os as um uma uns umas de do da dos das em no na nos nas num numa por pelo pela pelos pelas para pra ' +
    'com sem e ou mas que se nao sim eu tu ele ela nos vos eles elas voce voces me te lhe lhes meu minha teu ' +
    'tua seu sua nosso nossa isso isto aquilo esse essa este esta aquele aquela e sou es somos sao era foi ' +
    'ser estar estou esta estamos estao tem ter tenho temos vai vou ja muito mais'
  ).split(' '),
  es: (
    'el la los las un una unos unas lo de del al en a por para con sin y o pero que si no yo tu el ella ' +
    'nosotros vosotros ellos ellas usted ustedes me te se le les nos mi tu su mis tus sus este esta esto ese ' +
    'esa eso es soy eres somos son era fue ser estar estoy esta estamos estan hay he ha han tengo tiene muy mas'
  ).split(' '),
  fr: (
    'le la les l un une des du de d au aux en a dans par pour avec sans sur sous et ou mais que qu si ne pas ' +
    'je j tu il elle on nous vous ils elles me m te t se s lui leur mon ma mes ton ta tes son sa ses ce c cette ' +
    'ces est suis es sommes etes sont etait ete etre ai as avons avez ont avoir y tres plus'
  ).split(' '),
  de: (
    'der die das den dem des ein eine einen einem einer eines und oder aber wenn dass nicht kein keine ja nein ' +
    'ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihnen mein dein sein unser euer ist bin bist ' +
    'sind seid war waren sein habe hast hat haben habt hatte wird werden kann konnen muss will soll in im an am ' +
    'auf aus bei mit nach von vom zu zum zur fur uber unter um sehr'
  ).split(' '),
  it: (
    'il lo la i gli le un uno una di del della dei delle a al alla ai da dal in nel nella con per su tra fra e ' +
    'o ma che se non si io tu lui lei noi voi loro mi ti ci vi gli mio mia tuo tua suo sua questo questa quello ' +
    'quella e sono sei siamo siete era essere ho hai ha abbiamo hanno avere molto piu'
  ).split(' '),
};

/** Sufixos de flexão por idioma: `[sufixo, reposição]`, na ordem em que se tenta. */
const SUFIXOS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  en: [
    ['ies', 'y'],
    ['ied', 'y'],
    ['ing', ''],
    ['ing', 'e'],
    ['ed', ''],
    ['ed', 'e'],
    ['es', ''],
    ['s', ''],
  ],
  pt: [
    ['oes', 'ao'],
    ['aes', 'ao'],
    ['es', ''],
    ['s', ''],
  ],
  es: [
    ['es', ''],
    ['s', ''],
  ],
  fr: [
    ['aux', 'al'],
    ['s', ''],
    ['x', ''],
  ],
  de: [
    ['en', ''],
    ['er', ''],
    ['e', ''],
    ['n', ''],
    ['s', ''],
  ],
  it: [
    ['i', 'o'],
    ['e', 'a'],
  ],
};

/** Menor raiz que um corte de sufixo pode deixar: abaixo disso, "is" viraria "i". */
const RAIZ_MINIMA = 3;

/**
 * As formas candidatas de uma palavra, a própria chave primeiro. Só a PERGUNTA é expandida — o
 * conjunto guarda as chaves como vieram do caderno e da lista.
 */
export function formasDaPalavra(palavra: string, idioma: string): string[] {
  const chave = chaveDaPalavra(palavra);
  if (!chave) return [];
  const formas = [chave];
  for (const [suf, rep] of SUFIXOS[idiomaBase(idioma)] ?? []) {
    if (!chave.endsWith(suf)) continue;
    const raiz = chave.slice(0, -suf.length);
    if (raiz.length < RAIZ_MINIMA) continue;
    formas.push(raiz + rep);
    // "stopped"/"stopping" → "stopp" → "stop": consoante dobrada antes do sufixo (inglês).
    if (rep === '' && idiomaBase(idioma) === 'en' && /([b-df-hj-np-tv-z])\1$/.test(raiz)) formas.push(raiz.slice(0, -1));
  }
  return formas;
}

/**
 * O NÍVEL ESTIMADO pelo caderno: a régua da trilha (`nivelSugerido`) sobre as palavras MADURAS.
 * Ele diz em que nível o aluno está; os níveis ANTES dele são os que ele já sabe.
 */
export function nivelEstimadoDoAluno(trilha: Pick<DadoTrilha, 'niveis'>, maduras: ReadonlySet<string>): CefrLevel {
  return nivelSugerido(progressoDaTrilha(trilha as DadoTrilha, maduras));
}

export interface EntradaDasConhecidas {
  /** Idioma das palavras (BCP-47 ou base) — o da fala que vai ser julgada. */
  idioma: string;
  cartoes?: readonly CartaoParaConhecidas[];
  trilha?: Pick<DadoTrilha, 'niveis'> | null;
  /**
   * Nível do aluno: os níveis da trilha ANTES dele contam como sabidos. `undefined` = estimar pelo
   * caderno; `null` = não usar a trilha.
   */
  nivel?: CefrLevel | null;
}

export interface PalavrasConhecidas {
  idioma: string;
  /** O nível que valeu (explícito ou estimado); `null` sem trilha. */
  nivel: CefrLevel | null;
  /** Quantas chaves o conjunto tem (diagnóstico; sem texto). */
  tamanho: number;
  /** O aluno já sabe esta palavra? Pronto para `routeMt({ palavrasConhecidas })`. */
  conhece: (palavra: string) => boolean;
}

export function criarPalavrasConhecidas(e: EntradaDasConhecidas): PalavrasConhecidas {
  const idioma = idiomaBase(e.idioma);
  const sabidas = new Set<string>();
  for (const p of PALAVRAS_FUNCIONAIS[idioma] ?? []) sabidas.add(chaveDaPalavra(p));

  const maduras = new Set<string>();
  for (const c of e.cartoes ?? []) {
    if (c.srcLang && idiomaBase(c.srcLang) !== idioma) continue;
    if (!cartaoMaduro(c)) continue;
    const k = chaveDaPalavra(c.word);
    if (k) maduras.add(k);
  }
  for (const k of maduras) sabidas.add(k);

  let nivel: CefrLevel | null = null;
  if (e.trilha && e.nivel !== null) {
    nivel = e.nivel ?? nivelEstimadoDoAluno(e.trilha, maduras);
    for (const n of NIVEIS_CEFR.slice(0, NIVEIS_CEFR.indexOf(nivel))) {
      for (const [palavra] of e.trilha.niveis[n] ?? []) {
        const k = chaveDaPalavra(palavra);
        if (k) sabidas.add(k);
      }
    }
  }

  const conhece = (palavra: string): boolean => formasDaPalavra(palavra, idioma).some((f) => sabidas.has(f));
  return { idioma, nivel, tamanho: sabidas.size, conhece };
}
