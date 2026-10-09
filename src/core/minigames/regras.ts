/**
 * OS NÍVEIS DE CADA JOGO (Fácil, Médio, Difícil) — porte da tabela `DIF` do protótipo
 * (`polimento-movimento-src/jogos4.js:30-46`, mais `jogos5.js:41`) e de `ajudasDe` (`jogos4.js:69-78`).
 *
 * O protótipo é a especificação: cada jogo muda UMA COISA SUA em cada nível (a primeira letra já vem,
 * três alternativas, a tradução à vista, as direções do caça-palavras, o limiar do Ditado), e não um
 * fator igual para todos. O Médio é a regra normal do jogo. O que vale para os 16 jogos com nível:
 *
 *   - Difícil: cada acerto vale 5 pontos a mais (`jogos4.js:121`).
 *   - Ajudas contadas: uma a mais no Fácil, uma a menos no Difícil, nunca menos que uma (`jogos4.js:72`).
 *   - "+10 s" (só nos jogos com relógio): 3, 2 ou 1 por rodada. "Ver resposta": 2, 1 ou 1.
 *
 * Cadavre e Karaokê não têm nível: são produção livre (`jogos4.js:194`).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * COMO CADA TABULEIRO LÊ O SEU NÍVEL
 *
 *     const nivel = useNivelDoJogo('termo');             // src/lib/jogos/nivelDoJogo.ts (lido UMA vez:
 *     const regras = regrasDoJogo('termo', nivel);       //  trocar o nível recomeça a rodada)
 *     const ajudas = ajudasDoNivel('termo', nivel);      // os botões do placar, na ordem do protótipo
 *
 * `regrasDoJogo` devolve o tipo do próprio jogo (`RegrasPorJogo['termo']`): o editor mostra os campos.
 *
 *   memory       `pares` (6/8/8) · `compararEmMs` (900/760/560, a espera antes de julgar o par) ·
 *                `fecharErradoEmMs` (1100/520/300) · `espiarMs` (2400/1700/1300). Espiar 3/2/1.
 *   wordsearch   `direcoes` ([linha, coluna]: só → e ↓ no Fácil; + ↘ no Médio; + ← e ↑ no Difícil) ·
 *                `pistaComInicial` (a pista ganha `<em class="pj-ini">X…</em>`). Radar 4/3/2.
 *   termo        `tentativas.umTabuleiro` (8/6/5) · `tentativas.doisTabuleiros` (9/7/6) ·
 *                `primeiraLetraDada` (a primeira letra já vem presa). Dica 3/2/1.
 *   scramble     `primeiraPalavraNoLugar` · `dizQuantasCertas` (falso no Difícil: aviso genérico e
 *                nenhum prefixo verde). Dica 4/3/2.
 *   blitz        `segundos` (90/60/45, da rodada) · `alternativas` (3/4/4) · `cortadas` (o "Cortar 2"
 *                corta 1/2/2). Cortar 3/2/1 e "+10 s".
 *   karuta       `cartas` (4/6/6 na mesa) · `segundos` (12/8/6 por carta). "+10 s".
 *   choseong     `primeiraVogalAberta` (só se a palavra tem mais de uma vogal) · `segundos` (23/15/11).
 *                Abrir uma vogal 3/2/1 e "+10 s".
 *   tenis        `segundos` (11/8/6, a bola) · `pisoDeSegundos` (6/4/3: a bola nunca é mais rápida que
 *                isso; o tempo é `max(piso, segundos − rali)`) · `primeiraLetraDada`. Primeira letra
 *                3/2/1 e "+10 s".
 *   koffer       `vidas` (4/3/2) · `aVistaMs` (3600/2700/1900, a mala aberta) · `etiquetasComTraducao`
 *                (falso no Difícil: só as da paleta perdem a tradução).
 *   bao          `errosPorPalavra` (4/3/2).
 *   vitendawili  `alternativas` (3/4/4) · `traducaoAVista` · `umaTentativa` (no Difícil o primeiro erro
 *                encerra o enigma).
 *   shiritori    `letraAVista` (a letra exigida nasce visível) · `segundos` (23/15/11) · `alternativas`
 *                (sempre 3). "+10 s".
 *   taboo        `proibidasLiberadas` (1 no Fácil: a primeira já vem solta) · `segundos` (45/30/23) ·
 *                `alternativas` (3/4/4). "+10 s".
 *   escuta       `alternativas` (3/4/4) · `ouvirDevagar` (falso no Difícil: o botão não existe).
 *   ditado       `limiar` (70/80/90 %) · `segundaChance` (Fácil e Médio). Dica 4/3/2.
 *   conectores   `limiar` (60/70/80) · `dizQuantos` (no Fácil a tela diz quantos procurar).
 *
 * OS PONTOS. O tabuleiro NÃO soma o bônus do Difícil: `report.score` continua sendo a pontuação de
 * base (a do servidor, do recorde e do ranking). Quem mostra os 5 a mais é a casca, no placar
 * (`HudDaRodada`) e na tela de fim, com `pontosComBonus`.
 *
 * AS AJUDAS. `ajudasDoNivel(jogo, nivel)` devolve as do jogo e, no fim, as duas gerais ("+10 s" e "Ver
 * resposta"). As gerais já têm botão, contagem e efeito em `casca/AjudasGerais.tsx`: o tabuleiro desenha
 * só as suas (`BotaoDeAjuda`, com `vezesDaAjuda` como contagem) e passa o relógio e a resposta.
 *
 * DOIS TEXTOS DO PROTÓTIPO DIZEM UM NÚMERO E O CÓDIGO DELE DÁ OUTRO (`fidelidade/jogos.md`, divergência
 * B): "22 segundos" no Choseong e no Shiritori são 23 (`Math.round(15 × 1,5)`), e "22 segundos por
 * carta" no Tabu são 23 (`Math.round(30 × 0,75)`). O texto fica como o dono escreveu; o número é o do
 * código, que é o que o protótipo faz.
 *
 * O nível NÃO entra na nota de revisão: errar a palavra no Difícil e errar no Fácil dizem a mesma coisa
 * sobre a memória. Ele só muda quanto o jogo aperta.
 *
 * Sem DOM e sem React (este diretório compila sem eles): quem guarda a escolha da pessoa é
 * `src/lib/jogos/nivelDoJogo.ts`.
 */
import type { MinigameId } from './types';

export type NivelDoJogo = 'facil' | 'medio' | 'dificil';
export const NIVEIS_DO_JOGO: readonly NivelDoJogo[] = ['facil', 'medio', 'dificil'];

/** `nv(f, m, d)` de `jogos4.js:22-24`: o valor do nível. */
function nv<T>(nivel: NivelDoJogo, f: T, m: T, d: T): T {
  return nivel === 'facil' ? f : nivel === 'dificil' ? d : m;
}

/** `pjSeg(s)` de `jogos4.js:26-28`: metade a mais de tempo no Fácil, um quarto a menos no Difícil. */
export function segundosNoNivel(segundos: number, nivel: NivelDoJogo): number {
  return Math.round(segundos * nv(nivel, 1.5, 1, 0.75));
}

/** Quantos distratores `distr` sorteia (`jogos.js:82`): 3 alternativas no Fácil, 4 nos outros. */
const alternativas = (nivel: NivelDoJogo) => nv(nivel, 3, 4, 4);

/* ---- O que muda em cada jogo ----------------------------------------------------------------------- */

/** Uma direção do caça-palavras: quanto anda a linha e a coluna a cada letra. */
export type Direcao = readonly [linha: number, coluna: number];

export interface RegrasPorJogo {
  memory: { pares: number; compararEmMs: number; fecharErradoEmMs: number; espiarMs: number };
  wordsearch: { direcoes: readonly Direcao[]; pistaComInicial: boolean };
  termo: { tentativas: { umTabuleiro: number; doisTabuleiros: number }; primeiraLetraDada: boolean };
  scramble: { primeiraPalavraNoLugar: boolean; dizQuantasCertas: boolean };
  blitz: { segundos: number; alternativas: number; cortadas: number };
  karuta: { cartas: number; segundos: number };
  choseong: { primeiraVogalAberta: boolean; segundos: number };
  tenis: { segundos: number; pisoDeSegundos: number; primeiraLetraDada: boolean };
  koffer: { vidas: number; aVistaMs: number; etiquetasComTraducao: boolean };
  bao: { errosPorPalavra: number };
  vitendawili: { alternativas: number; traducaoAVista: boolean; umaTentativa: boolean };
  shiritori: { letraAVista: boolean; segundos: number; alternativas: number };
  taboo: { proibidasLiberadas: number; segundos: number; alternativas: number };
  escuta: { alternativas: number; ouvirDevagar: boolean };
  ditado: { limiar: number; segundaChance: boolean };
  conectores: { limiar: number; dizQuantos: boolean };
}

/** Os 16 jogos com nível (`DIF`). */
export type JogoComNivel = keyof RegrasPorJogo;

type Linha<J extends JogoComNivel> = {
  /** O texto de `DIF`: `[no Fácil, no Difícil]`. É o que a explicação mostra na tela 3. */
  texto: readonly [facil: string, dificil: string];
  /** O que o código do protótipo muda, por nível. */
  regras: (nivel: NivelDoJogo) => RegrasPorJogo[J];
};

const HORIZONTAL_E_VERTICAL: readonly Direcao[] = [
  [0, 1],
  [1, 0],
];

const DIF: { [J in JogoComNivel]: Linha<J> } = {
  /* `jogos5.js:41, 50, 73, 93, 105` */
  memory: {
    texto: ['6 pares, cartas abertas por mais tempo e 3 espiadas', 'As cartas fecham rápido e só há 1 espiada'],
    regras: (n) => ({
      pares: nv(n, 6, 8, 8),
      compararEmMs: nv(n, 900, 760, 560),
      fecharErradoEmMs: nv(n, 1100, 520, 300),
      espiarMs: nv(n, 2400, 1700, 1300),
    }),
  },
  /* `jogos4.js:32`; `jogos.js:547, 563` */
  wordsearch: {
    texto: [
      'Só na horizontal e na vertical, e a pista mostra a primeira letra',
      'Palavras também de trás para a frente',
    ],
    regras: (n) => ({
      direcoes: nv<readonly Direcao[]>(
        n,
        HORIZONTAL_E_VERTICAL,
        [...HORIZONTAL_E_VERTICAL, [1, 1]],
        [...HORIZONTAL_E_VERTICAL, [1, 1], [0, -1], [-1, 0]],
      ),
      pistaComInicial: n === 'facil',
    }),
  },
  /* `jogos4.js:31, 290, 294` */
  termo: {
    texto: ['8 tentativas e a primeira letra já vem', '5 tentativas'],
    regras: (n) => ({
      tentativas: { umTabuleiro: nv(n, 8, 6, 5), doisTabuleiros: nv(n, 9, 7, 6) },
      primeiraLetraDada: n === 'facil',
    }),
  },
  /* `jogos4.js:33, 446, 491, 495` */
  scramble: {
    texto: ['A primeira palavra já vem no lugar', 'Não diz quantas palavras estão certas'],
    regras: (n) => ({ primeiraPalavraNoLugar: n === 'facil', dizQuantasCertas: n !== 'dificil' }),
  },
  /* `jogos4.js:34`; `jogos.js:737, 775, 787` */
  blitz: {
    texto: ['90 segundos e 3 alternativas', '45 segundos'],
    regras: (n) => ({ segundos: nv(n, 90, 60, 45), alternativas: alternativas(n), cortadas: nv(n, 1, 2, 2) }),
  },
  /* `jogos4.js:35`; `jogos2.js:20, 31` */
  karuta: {
    texto: ['4 cartas na mesa e 12 segundos por carta', '6 segundos por carta'],
    regras: (n) => ({ cartas: nv(n, 4, 6, 6), segundos: nv(n, 12, 8, 6) }),
  },
  /* `jogos4.js:36, 535-538, 543` */
  choseong: {
    texto: ['A primeira vogal já vem aberta; 22 segundos', '11 segundos por palavra'],
    regras: (n) => ({ primeiraVogalAberta: n === 'facil', segundos: segundosNoNivel(15, n) }),
  },
  /* `jogos4.js:37`; `jogos3.js:29, 78, 86` */
  tenis: {
    texto: ['Bola lenta (11 s) e a primeira letra já vem', 'Bola rápida (6 s)'],
    regras: (n) => {
      const segundos = nv(n, 11, 8, 6);
      return { segundos, pisoDeSegundos: Math.ceil(segundos / 2), primeiraLetraDada: n === 'facil' };
    },
  },
  /* `jogos4.js:38`; `jogos3.js:185, 194, 253` */
  koffer: {
    texto: ['4 vidas e mais tempo para olhar a mala', '2 vidas, menos tempo e etiquetas sem tradução'],
    regras: (n) => ({
      vidas: nv(n, 4, 3, 2),
      aVistaMs: nv(n, 3600, 2700, 1900),
      etiquetasComTraducao: n !== 'dificil',
    }),
  },
  /* `jogos4.js:39`; `jogos2.js:361` */
  bao: {
    texto: ['4 erros por palavra', '2 erros por palavra'],
    regras: (n) => ({ errosPorPalavra: nv(n, 4, 3, 2) }),
  },
  /* `jogos4.js:40`; `jogos2.js:392, 400-406` */
  vitendawili: {
    texto: ['3 alternativas e a tradução da frase', 'Uma tentativa só por enigma'],
    regras: (n) => ({ alternativas: alternativas(n), traducaoAVista: n === 'facil', umaTentativa: n === 'dificil' }),
  },
  /* `jogos4.js:41`; `jogos2.js:447, 450` */
  shiritori: {
    texto: ['A letra exigida já aparece; 22 segundos', '11 segundos por elo'],
    regras: (n) => ({ letraAVista: n === 'facil', segundos: segundosNoNivel(15, n), alternativas: 3 }),
  },
  /* `jogos4.js:42`; `jogos2.js:545-550` */
  taboo: {
    texto: ['Uma palavra proibida a menos; 45 segundos', '22 segundos por carta'],
    regras: (n) => ({
      proibidasLiberadas: n === 'facil' ? 1 : 0,
      segundos: segundosNoNivel(30, n),
      alternativas: alternativas(n),
    }),
  },
  /* `jogos4.js:43`; `jogos2.js:664-665` */
  escuta: {
    texto: ['3 alternativas', 'Sem o botão de ouvir devagar'],
    regras: (n) => ({ alternativas: alternativas(n), ouvirDevagar: n !== 'dificil' }),
  },
  /* `jogos4.js:44`; `jogos2.js:720-721` */
  ditado: {
    texto: ['Vale com 70% e há segunda chance', 'Precisa de 90%, sem segunda chance'],
    regras: (n) => ({ limiar: nv(n, 70, 80, 90), segundaChance: n !== 'dificil' }),
  },
  /* `jogos4.js:45`; `jogos2.js:782, 807` */
  conectores: {
    texto: ['A tela diz quantos conectores procurar', 'Precisa de 80 pontos de precisão'],
    regras: (n) => ({ limiar: nv(n, 60, 70, 80), dizQuantos: n === 'facil' }),
  },
};

export const JOGOS_COM_NIVEL = Object.keys(DIF) as JogoComNivel[];

/** O jogo tem níveis no protótipo (`DIF[id]`): 16 dos 18. */
export function temNivel(jogo: MinigameId | string): jogo is JogoComNivel {
  return Object.prototype.hasOwnProperty.call(DIF, jogo);
}

/** O que o nível muda NESTE jogo, com o tipo do próprio jogo. */
export function regrasDoJogo<J extends JogoComNivel>(jogo: J, nivel: NivelDoJogo): RegrasPorJogo[J] {
  return DIF[jogo].regras(nivel);
}

/** O que a explicação diz de cada nível (`jogos4.js:191`). `null` nos jogos sem nível. */
export function textoDoNivel(jogo: MinigameId, nivel: NivelDoJogo): string | null {
  if (!temNivel(jogo)) return null;
  const [facil, dificil] = DIF[jogo].texto;
  return nv(nivel, facil, 'A regra normal do jogo', `${dificil}. Cada acerto vale 5 pontos a mais`);
}

/* ---- Pontos ---------------------------------------------------------------------------------------- */

/** No Difícil cada acerto vale 5 pontos a mais, inclusive o acerto com dica (`jogos4.js:117-122`). */
export const BONUS_DO_DIFICIL = 5;

/** Os pontos que a tela mostra: os de base mais o bônus do Difícil por acerto. */
export function pontosComBonus(jogo: MinigameId, nivel: NivelDoJogo, pontos: number, acertos: number): number {
  return temNivel(jogo) && nivel === 'dificil' ? pontos + BONUS_DO_DIFICIL * Math.max(0, acertos) : pontos;
}

/* ---- Ajudas (`ajudasDe`, `jogos4.js:69-78`) --------------------------------------------------------- */

/** O ícone de cada ajuda, pelo nome do lucide que o protótipo usa. */
export type IconeDaAjuda = 'eye' | 'radar' | 'lightbulb' | 'volume-2' | 'scissors' | 'timer';

export interface AjudaDoJogo {
  /** `data-ajuda` do botão. */
  chave: string;
  icone: IconeDaAjuda;
  rotulo: string;
  /** Quantas vezes por rodada; `Infinity` quando não há limite (o botão não mostra número). */
  vezes: number;
  /** Conta como dica: zera o combo, e o acerto seguinte vale só o mínimo. */
  custa: boolean;
}

type AjudaDeBase = readonly [chave: string, icone: IconeDaAjuda, rotulo: string, vezes: number, custa?: boolean];

/** As ajudas próprias de cada jogo, com a quantidade do Médio (o `ajudas` de cada `JOGOS[id]`). */
const AJUDAS_DE_BASE: Partial<Record<MinigameId, readonly AjudaDeBase[]>> = {
  memory: [['espiar', 'eye', 'Espiar', 2, true]] /* `jogos5.js:47` */,
  wordsearch: [['radar', 'radar', 'Radar', 3]] /* `jogos.js:537` */,
  termo: [
    ['letra', 'lightbulb', 'Dica', 2, true],
    ['ouvir', 'volume-2', 'Ouvir', Infinity],
  ] /* `jogos.js:403` */,
  scramble: [
    ['dica', 'lightbulb', 'Dica', 3, true],
    ['ouvir', 'volume-2', 'Ouvir', Infinity],
  ] /* `jogos.js:643` */,
  blitz: [['cortar', 'scissors', 'Cortar 2', 2, true]] /* `jogos.js:727` */,
  karuta: [['ouvir', 'volume-2', 'Ouvir de novo', Infinity]] /* `jogos2.js:16` */,
  choseong: [['vogal', 'lightbulb', 'Abrir uma vogal', 2, true]] /* `jogos2.js:66` */,
  tenis: [['letra', 'lightbulb', 'Primeira letra', 2, true]] /* `jogos2.js:148` */,
  koffer: [['espiar', 'eye', 'Espiar', Infinity, true]] /* `jogos2.js:224` */,
  bao: [['dica', 'lightbulb', 'Dica', Infinity, true]] /* `jogos2.js:289` */,
  vitendawili: [['ouvir', 'volume-2', 'Ouvir', Infinity]] /* `jogos2.js:381` */,
  shiritori: [['letra', 'lightbulb', 'Ver a letra', Infinity]] /* `jogos2.js:433` */,
  taboo: [['liberar', 'lightbulb', 'Liberar 1', Infinity, true]] /* `jogos2.js:529` */,
  ditado: [['palavra', 'lightbulb', 'Dica', 3, true]] /* `jogos2.js:695` */,
};

/** Os jogos com relógio, que ganham o "+10 s" (`jogos4.js:67`). O Duelo entra. */
const COM_TEMPO: ReadonlySet<MinigameId> = new Set(['blitz', 'karuta', 'choseong', 'tenis', 'shiritori', 'taboo']);
/** Onde "Ver resposta" não existe (`jogos4.js:68`, `jogos5.js:43`). */
const SEM_RESPOSTA: ReadonlySet<MinigameId> = new Set(['cadavre', 'karaoke', 'koffer', 'memory']);

/** Quanto o "+10 s" devolve ao relógio (`jogos4.js:161`). */
export const SEGUNDOS_A_MAIS = 10;

/** `conta` de `jogos4.js:72`: uma a mais no Fácil, uma a menos no Difícil, nunca zero; sem limite fica sem. */
const contar = (vezes: number, nivel: NivelDoJogo) =>
  Number.isFinite(vezes) ? Math.max(1, vezes + nv(nivel, 1, 0, -1)) : vezes;

/** O jogo tem o "+10 s"? */
export const jogoTemTempoAMais = (jogo: MinigameId): boolean => COM_TEMPO.has(jogo);
/** O jogo tem o "Ver resposta"? */
export const jogoTemVerResposta = (jogo: MinigameId): boolean => !SEM_RESPOSTA.has(jogo);

/** As ajudas do jogo no nível, na ordem do placar: as próprias, depois "+10 s" e "Ver resposta". */
export function ajudasDoNivel(jogo: MinigameId, nivel: NivelDoJogo): AjudaDoJogo[] {
  const proprias = (AJUDAS_DE_BASE[jogo] ?? []).map(
    ([chave, icone, rotulo, vezes, custa]): AjudaDoJogo => ({
      chave,
      icone,
      rotulo,
      vezes: contar(vezes, nivel),
      custa: !!custa,
    }),
  );
  const gerais: AjudaDoJogo[] = [];
  if (jogoTemTempoAMais(jogo))
    gerais.push({ chave: 'tempo', icone: 'timer', rotulo: '+10 s', vezes: nv(nivel, 3, 2, 1), custa: false });
  if (jogoTemVerResposta(jogo))
    gerais.push({ chave: 'resposta', icone: 'eye', rotulo: 'Ver resposta', vezes: nv(nivel, 2, 1, 1), custa: true });
  return [...proprias, ...gerais];
}

/** Quantas vezes a ajuda `chave` vale no nível. 0 se o jogo não tem essa ajuda; `Infinity` sem limite. */
export function vezesDaAjuda(jogo: MinigameId, chave: string, nivel: NivelDoJogo): number {
  return ajudasDoNivel(jogo, nivel).find((a) => a.chave === chave)?.vezes ?? 0;
}

/**
 * O nome de antes de `vezesDaAjuda`, que os tabuleiros ainda importam. Os números são os mesmos de
 * sempre nas ajudas que já existiam; o que o protótipo acrescenta é o "+10 s" do Duelo.
 */
export const ajudasDoJogo = vezesDaAjuda;

/* ---- A sugestão do fim da rodada (`pjFim`, `jogos4.js:138-153`) ------------------------------------- */

/**
 * O nível que a tela de fim oferece, ou `null`. Desce um degrau quem acertou menos da metade das
 * tentativas (e não está no Fácil); senão sobe um degrau quem acertou alguma e não errou nenhuma (e não
 * está no Difícil). Descer tem precedência (`jogos4.js:148`). Só nos jogos com nível.
 */
export function nivelSugerido(
  jogo: MinigameId,
  nivel: NivelDoJogo,
  acertos: number,
  erros: number,
): NivelDoJogo | null {
  if (!temNivel(jogo)) return null;
  const tentativas = acertos + erros;
  if (tentativas && acertos / tentativas < 0.5 && nivel !== 'facil') return nivel === 'dificil' ? 'medio' : 'facil';
  if (acertos && !erros && nivel !== 'dificil') return nivel === 'facil' ? 'medio' : 'dificil';
  return null;
}

/**
 * OS JOGOS EM QUE A PAUSA OFERECE A TROCA DE NÍVEL (`casca/SeletorDeNivel`). É a lista dos dez jogos que
 * tinham relógio, vidas ou ajuda contada antes da tabela acima; o seletor da pausa continua perguntando
 * por ela. O selo do cabeçalho e a explicação perguntam por `temNivel`.
 */
const COM_NIVEL_NA_PAUSA: ReadonlySet<MinigameId> = new Set([
  'memory',
  'wordsearch',
  'blitz',
  'karuta',
  'choseong',
  'tenis',
  'shiritori',
  'taboo',
  'koffer',
  'bao',
]);

export function jogoTemNiveis(jogo: MinigameId): boolean {
  return COM_NIVEL_NA_PAUSA.has(jogo);
}
