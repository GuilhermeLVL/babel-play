import { avaliarFrase, chaveComparavel } from '../learning/quality';
import { dobrarTexto } from '../texto/palavra';
import { normalizarPalavra } from './wordsearch';

/**
 * OS TRÊS JOGOS DE ESCUTA E ESCRITA — o núcleo aproveitado dos exercícios antigos.
 *
 * DE ONDE ELES VÊM. O app tinha oito exercícios legados, 6.100 linhas, alcançáveis só por uma
 * sub-aba que exige gravação e que devolvia tela em branco sem nenhuma. Três deles tinham um
 * núcleo que vale — e que nenhum dos seis jogos atuais cobre:
 *
 *   · `CaptionSync`    → ouvir um trecho REAL e escolher a legenda certa. Escuta pura.
 *   · `WaveformDrill`  → ditado do áudio real, com nota por distância de edição.
 *   · `ContextMining`  → achar os conectores no texto real (marcadores de discurso).
 *
 * Os outros cinco não sobrevivem, e por motivos concretos: dois têm conteúdo FIXO EM INGLÊS
 * (exatamente o que este app promete não fazer), um é múltipla escolha (já é o Duelo), um é
 * conversa com IA (o iChat já cobre) e um é reescrita, que não vira jogo sem virar outro produto.
 *
 * ESTE MÓDULO É PURO: escolhe e avalia, não toca em áudio nem em DOM. É o que permite testar as
 * regras — que é onde os erros de verdade moram — sem navegador.
 *
 * A fala é descrita por ESTRUTURA e não importada de `lib/sentences`, seguindo o que o
 * `scramble.ts` já faz: `core` é isomórfico e não pode depender de código de aplicação.
 */

/** Uma fala com áudio: o mínimo que estes jogos precisam saber sobre ela. */
export interface FalaComAudio {
  id?: string;
  text: string;
  translation?: string;
  lang?: string;
  startMs: number;
  endMs: number;
}

/* ─────────────────────────── QUAL FOI? (escuta) ─────────────────────────── */

export interface RodadaEscuta {
  /** A fala certa. */
  correta: FalaComAudio;
  /** As opções mostradas, JÁ embaralhadas — a certa está entre elas. */
  opcoes: FalaComAudio[];
}

/**
 * Chave de deduplicação que funciona em QUALQUER escrita, não só A–Z.
 *
 * `normalizarPalavra` (de `wordsearch.ts`) descarta tudo que não é A–Z — em japonês, coreano,
 * árabe etc. o resultado é sempre `''`, e DUAS falas totalmente diferentes viram "iguais". O
 * filtro de duplicata então elimina TODAS as alternativas, sobrando só a resposta certa (o jogo
 * fica impossível de errar, e antes disso, impossível de montar — `opcoes.length < 2`).
 *
 * Aqui a chave não perde nenhuma escrita: minúsculas, espaços colapsados e sem os acentos que
 * `NFD` consegue separar (o que não separa — a maioria dos alfabetos não-latinos — permanece
 * intacto, que é exatamente o comportamento certo: caracteres diferentes continuam diferentes).
 * Local e não importado de `wordsearch.ts` de propósito: aquele módulo está mudando por outro
 * agente nesta mesma auditoria.
 */
const chaveDeTexto = (s: string) => dobrarTexto(s, { espacos: 'colapsar' });

function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Falas que servem para escutar: precisam de áudio com começo e fim, e de texto que preste. */
export function falasAudiveis(frases: FalaComAudio[]): FalaComAudio[] {
  return (frases ?? []).filter(f =>
    f.endMs > f.startMs &&
    f.endMs - f.startMs >= 700 &&   // trechos curtíssimos não dão o que ouvir
    avaliarFrase(f.text).serve,
  );
}

/**
 * Monta as rodadas de "Qual foi?".
 *
 * AS ALTERNATIVAS ERRADAS SÃO OUTRAS FALAS DA MESMA GRAVAÇÃO, e isso é o que torna o jogo difícil
 * no lugar certo: elas têm o mesmo assunto, o mesmo sotaque e o mesmo vocabulário, então não dá
 * para eliminar por eliminação — é preciso ouvir. Alternativa inventada denunciaria a certa.
 *
 * Preferimos alternativas de COMPRIMENTO PARECIDO: uma frase de três palavras ao lado de uma de
 * vinte se distingue pela duração do áudio, sem entender nada do que foi dito.
 */
export function buildRodadasEscuta(
  frases: FalaComAudio[],
  opts: { quantidade?: number; alternativas?: number; shuffle?: <T>(xs: T[]) => T[] } = {},
): RodadaEscuta[] {
  const shuffle = opts.shuffle ?? embaralhar;
  const quantidade = opts.quantidade ?? 6;
  const nAlt = opts.alternativas ?? 4;

  const uteis = falasAudiveis(frases);
  if (uteis.length < nAlt) return [];

  return shuffle(uteis).slice(0, quantidade).map(correta => {
    const tamanho = correta.text.split(/\s+/).length;
    const outras = uteis
      .filter(f => f.id !== correta.id && chaveDeTexto(f.text) !== chaveDeTexto(correta.text))
      .sort((a, b) =>
        Math.abs(a.text.split(/\s+/).length - tamanho) - Math.abs(b.text.split(/\s+/).length - tamanho));
    return { correta, opcoes: shuffle([correta, ...outras.slice(0, nAlt - 1)]) };
  }).filter(r => r.opcoes.length >= 2);
}

/* ─────────────────────────── DITADO ─────────────────────────── */

export interface RodadaDitado {
  fala: FalaComAudio;
  /** Quantas palavras tem a resposta — a primeira ajuda, e a mais barata. */
  palavras: number;
}

/**
 * Falas boas para ditado: nem tão curtas que sejam triviais, nem tão longas que virem prova de
 * memória em vez de escuta. Quatro a doze palavras é a janela onde se ouve e se escreve.
 */
export function buildRodadasDitado(
  frases: FalaComAudio[],
  opts: { quantidade?: number; shuffle?: <T>(xs: T[]) => T[] } = {},
): RodadaDitado[] {
  const shuffle = opts.shuffle ?? embaralhar;
  const uteis = falasAudiveis(frases).filter(f => {
    const n = f.text.split(/\s+/).filter(Boolean).length;
    return n >= 4 && n <= 12;
  });
  return shuffle(uteis).slice(0, opts.quantidade ?? 5).map(fala => ({
    fala,
    palavras: fala.text.split(/\s+/).filter(Boolean).length,
  }));
}

/**
 * Compara o que foi escrito com o que foi dito, PALAVRA A PALAVRA.
 *
 * Por que não distância de edição sobre a frase inteira, como fazia o exercício antigo: aquele
 * número diz "72% parecido" e não ensina nada. Palavra a palavra dá para MOSTRAR onde errou, que
 * é a informação que faz a pessoa melhorar na próxima.
 *
 * A comparação é normalizada (sem acento, sem pontuação, sem caixa) de propósito: o jogo é de
 * ESCUTA. Errar a vírgula não é erro de ouvido, e punir por isso ensinaria a coisa errada.
 */
export interface ResultadoDitado {
  /** Uma entrada por palavra ESPERADA, na ordem. */
  palavras: Array<{ esperada: string; escrita: string | null; certa: boolean }>;
  acertos: number;
  total: number;
  /** 0..100 */
  precisao: number;
}

export function conferirDitado(esperado: string, escrito: string): ResultadoDitado {
  const alvo = (esperado ?? '').split(/\s+/).filter(Boolean);
  const dito = (escrito ?? '').split(/\s+/).filter(Boolean);
  /* `normalizarPalavra` só mantém A–Z, então NÚMERO E SÍMBOLO viram string vazia — e duas vazias
     são iguais. Sem a saída abaixo, "2" casava com "5" e qualquer pontuação casava com qualquer
     outra: o jogo dava acerto onde a pessoa errou. Quando a normalização não sobra nada, compara
     o texto cru. */
  const chave = (s: string) => normalizarPalavra(s) || s.trim().toLowerCase();

  /* Alinhamento simples por posição, com uma janela de tolerância: se a pessoa pulou ou repetiu
     uma palavra, comparar rigidamente por índice marcaria TODO o resto como errado, e um erro
     no começo apagaria o mérito da frase inteira. A janela de ±2 reencontra o alinhamento. */
  const usadas = new Set<number>();
  const palavras: ResultadoDitado['palavras'] = alvo.map((esperada, i) => {
    const k = chave(esperada);
    for (let d = 0; d <= 2; d++) {
      for (const j of [i - d, i + d]) {
        if (j < 0 || j >= dito.length || usadas.has(j)) continue;
        if (chave(dito[j]) === k) { usadas.add(j); return { esperada, escrita: dito[j], certa: true }; }
      }
    }
    return { esperada, escrita: null, certa: false };
  });

  /* SEGUNDA PASSADA — só depois de saber quais palavras ditas já foram consumidas por outro
     alvo. Antes isto era feito na mesma passada, com `dito[i]`, e INVENTAVA um erro: quando a
     pessoa PULA uma palavra, a seguinte desliza para aquele índice, então a tela dizia "esperava
     'Brasil', ouvimos 'Os'", quando "Os" foi falado certo e casou com o próprio lugar logo
     depois. Trocar por engolir são correções diferentes: uma é repetir a palavra, a outra é
     lembrar de dizê-la. Sem substituta de verdade, `escrita` fica `null` e a tela diz "não
     ouvimos esta palavra". */
  for (let i = 0; i < palavras.length; i++) {
    if (palavras[i].certa) continue;
    for (let d = 0; d <= 2 && palavras[i].escrita === null; d++) {
      for (const j of [i - d, i + d]) {
        if (j < 0 || j >= dito.length || usadas.has(j)) continue;
        usadas.add(j);
        palavras[i].escrita = dito[j];
        break;
      }
    }
  }

  const acertos = palavras.filter(p => p.certa).length;
  return {
    palavras,
    acertos,
    total: alvo.length,
    precisao: alvo.length ? Math.round((acertos / alvo.length) * 100) : 0,
  };
}

/* ─────────────────────────── CAÇA-CONECTORES ─────────────────────────── */

/**
 * Os marcadores de discurso, por idioma.
 *
 * São as palavras que AMARRAM as ideias — e é justamente o que separa quem entende palavras de
 * quem entende o texto. Alguém pode conhecer todo o vocabulário de uma frase e ainda perder o
 * sentido por não notar um "however" ou um "no entanto".
 *
 * Idioma sem lista simplesmente não oferece o jogo, em vez de oferecer uma lista inglesa
 * aplicada ao francês — a mesma regra da régua de qualidade.
 */
const CONECTORES: Record<string, ReadonlySet<string>> = {
  en: new Set([
    'however', 'although', 'though', 'therefore', 'because', 'since', 'while', 'whereas',
    'moreover', 'furthermore', 'nevertheless', 'nonetheless', 'besides', 'instead',
    'otherwise', 'meanwhile', 'consequently', 'thus', 'hence', 'unless', 'until',
    'despite', 'whether', 'actually', 'basically', 'anyway', 'finally', 'first',
    'then', 'also', 'but', 'so', 'and', 'or', 'if',
  ]),
  pt: new Set([
    'porém', 'contudo', 'todavia', 'entretanto', 'embora', 'apesar', 'portanto',
    'porque', 'pois', 'enquanto', 'além', 'ademais', 'inclusive', 'aliás',
    'entanto', 'contrário', 'assim', 'logo', 'então', 'ainda', 'mas',
    'contanto', 'caso', 'salvo', 'exceto', 'primeiro', 'finalmente', 'depois',
    'antes', 'também', 'ou', 'se', 'como', 'quando',
  ]),
  /* O espanhol tinha 'sin', 'embargo', 'por' e 'tanto': metades soltas de "sin embargo" e "por
     tanto". O casamento é por TOKEN, então o jogo mandava marcar a preposição "sin" de "café sin
     azúcar" como marcador de discurso. Saíram, e entraram quatro que valem sozinhas. Medido nas
     frases da trilha espanhola: 11,3% delas tinham conector antes, 6,4% agora — a queda é toda
     de falso positivo, e 6,4% fica na faixa do inglês (4,4%) e do italiano (6,0%). */
  es: new Set([
    'aunque', 'porque', 'pues', 'mientras', 'además', 'asimismo', 'incluso',
    'entonces', 'luego', 'así', 'igualmente', 'obstante', 'pero', 'sino',
    'aún', 'todavía', 'salvo', 'excepto',
    'primero', 'finalmente', 'después', 'antes', 'también', 'cuando', 'si',
  ]),
  /* Os quatro idiomas com trilha publicada e alfabeto latino. A régua é a mesma do espanhol
     acima: só entra token que é conector SOZINHO. Por isso 'd'abord' e 'parce' entram (nunca
     aparecem fora da locução, então não há falso positivo) e nada de 'no obstante' partido.

     DUAS AUSÊNCIAS QUE NÃO SE LEEM NA LISTA, e ambas vêm da chave: `chaveComparavel` tira o
     acento dos DOIS lados, então o 'e' italiano casaria com 'è' ("é") — medido, 831 dos 947
     casamentos eram a cópula, não a conjunção — e o 'ou' francês casaria com 'où' ("onde"),
     31 de 46. Ficam de fora; 'ed' e 'et' cobrem o que sobra sem colidir.

     Medido nas frases das trilhas: 11,0% (de), 8,5% (fr), 6,0% (it), 11,0% (nl) têm conector. */
  de: new Set([
    'aber', 'jedoch', 'allerdings', 'trotzdem', 'dennoch', 'obwohl', 'obgleich',
    'weil', 'denn', 'deshalb', 'deswegen', 'daher', 'darum', 'also', 'außerdem',
    'zudem', 'stattdessen', 'sonst', 'folglich', 'somit', 'falls', 'solange',
    'während', 'zwar', 'schließlich', 'zuerst', 'zunächst', 'danach', 'dann',
    'auch', 'und', 'oder', 'wenn',
  ]),
  fr: new Set([
    'cependant', 'pourtant', 'néanmoins', 'toutefois', 'quoique', 'malgré',
    'donc', 'ainsi', 'alors', 'parce', 'car', 'puisque', 'lorsque', 'tandis',
    'ensuite', 'enfin', "d'abord", 'puis', 'également', 'aussi', 'sinon',
    'autrement', 'finalement', 'premièrement',
    'mais', 'et', 'si', 'comme', 'quand', 'après', 'avant',
  ]),
  it: new Set([
    'però', 'tuttavia', 'comunque', 'invece', 'anzi', 'benché', 'sebbene',
    'nonostante', 'malgrado', 'poiché', 'perché', 'siccome', 'dunque', 'quindi',
    'pertanto', 'perciò', 'allora', 'inoltre', 'altrimenti', 'mentre', 'finché',
    'purché', 'insomma', 'cioè', 'infine', 'prima', 'dopo', 'poi', 'anche',
    'oppure', 'ma', 'ed', 'o', 'se',
  ]),
  nl: new Set([
    'echter', 'maar', 'toch', 'hoewel', 'ofschoon', 'ondanks', 'omdat', 'want',
    'doordat', 'daarom', 'dus', 'daardoor', 'bovendien', 'tevens', 'daarentegen',
    'integendeel', 'anders', 'ondertussen', 'terwijl', 'tenzij', 'zodat',
    'indien', 'tenslotte', 'uiteindelijk', 'vervolgens', 'trouwens', 'namelijk',
    'immers', 'als', 'en', 'of', 'ook', 'dan', 'eerst',
  ]),
};

export interface RodadaConectores {
  fala: FalaComAudio;
  /** Índices (na divisão por espaço) das palavras que SÃO conectores. */
  alvos: number[];
  /** Todas as palavras da fala, na ordem em que aparecem. */
  tokens: string[];
}

/** O idioma tem lista de conectores? A tela usa para não oferecer um jogo impossível. */
export function temConectores(lang: string): boolean {
  return !!CONECTORES[(lang || '').toLowerCase().split('-')[0]];
}

export function buildRodadasConectores(
  frases: FalaComAudio[],
  opts: { lang: string; quantidade?: number; shuffle?: <T>(xs: T[]) => T[] } = { lang: '' },
): RodadaConectores[] {
  const bruta = CONECTORES[(opts.lang || '').toLowerCase().split('-')[0]];
  if (!bruta) return [];
  // Os dois lados pela MESMA chave: a lista guarda "porém" e o token normalizava para "porem".
  const lista = new Set(Array.from(bruta, (c) => chaveComparavel(c)));
  const shuffle = opts.shuffle ?? embaralhar;

  const candidatas = (frases ?? [])
    .filter(f => avaliarFrase(f.text).serve)
    .map(fala => {
      const tokens = fala.text.split(/\s+/).filter(Boolean);
      const alvos = tokens
        .map((t, i) => (lista.has(chaveComparavel(t)) ? i : -1))
        .filter(i => i >= 0);
      return { fala, tokens, alvos };
    })
    // Frase sem conector nenhum não é rodada: seria uma tela onde a resposta é "não clicar".
    .filter(r => r.alvos.length > 0 && r.tokens.length >= 5);

  return shuffle(candidatas).slice(0, opts.quantidade ?? 5);
}

/**
 * Nota do caça-conectores: F1 entre o que foi marcado e o que era conector.
 *
 * F1 e não "quantos acertou", porque o jogo tem DOIS jeitos de errar e eles precisam pesar: deixar
 * conector passar (perde recall) e marcar palavra que não é (perde precisão). Contar só acertos
 * premiaria quem clica em tudo.
 */
export function notaConectores(marcados: number[], alvos: number[]): { f1: number; certos: number; falsos: number; perdidos: number } {
  const m = new Set(marcados);
  const a = new Set(alvos);
  const certos = [...m].filter(i => a.has(i)).length;
  const falsos = [...m].filter(i => !a.has(i)).length;
  const perdidos = [...a].filter(i => !m.has(i)).length;
  const precisao = m.size ? certos / m.size : 0;
  const recall = a.size ? certos / a.size : 0;
  const f1 = precisao + recall ? (2 * precisao * recall) / (precisao + recall) : 0;
  return { f1: Math.round(f1 * 100), certos, falsos, perdidos };
}
