import type { VocabCard } from '../../types';

/**
 * A RÉGUA — o que presta para virar exercício, e por quê não.
 *
 * O PROBLEMA QUE ELA RESOLVE. O vocabulário nasce de fala capturada, e fala capturada é suja: o
 * extrator de palavras-chave roda em cada enunciado e grava até seis cartões, com a tradução às
 * vezes vazia. O resultado chegou aos jogos: o Quarteto abriu pedindo para soletrar palavras cuja
 * "definição" era "Isso é", "rápida!!" e "T-Lisa". Um jogo assim não parece difícil, parece
 * quebrado — e o estrago é de credibilidade, não de mecânica.
 *
 * O CUSTO DOS DOIS ERROS É ASSIMÉTRICO, e é isso que calibra a régua. Descartar um item bom custa
 * UMA palavra, num baralho que tem centenas. Aceitar um item ruim estraga a rodada inteira de quem
 * está jogando. Logo, na dúvida, descarta.
 *
 * TODO DESCARTE DIZ POR QUÊ. `serve: false` sem motivo seria uma caixa-preta que some com o
 * material da pessoa sem explicação. Com o motivo, a tela de curadoria consegue agrupar, contar e
 * oferecer o conserto certo — "sem tradução" pede tradução, "idioma incerto" pede reetiquetagem.
 *
 * O QUE ESTA RÉGUA NÃO FAZ: julgar se a palavra é *útil* de aprender. Isso é nível (CEFR) e
 * agenda (FSRS), que já têm dono. Aqui só se decide se o item é **inteligível como exercício**.
 */

/** Por que um item não serve. O nome descreve o DEFEITO, para a tela poder oferecer o conserto. */
export type MotivoDescarte =
  /** Nem tradução nem frase de origem: não há pista honesta possível. */
  | 'sem-pista'
  /** Tem tradução, mas ela não define nada (fragmento de fala, interjeição, frase cortada). */
  | 'pista-ruim'
  /** A palavra é curta demais para ser exercício (1 caractere). */
  | 'palavra-curta'
  /** A palavra tem ruído de captura: dígitos, símbolos, letra repetida em excesso. */
  | 'palavra-ruido'
  /** A tradução é igual à palavra — não ensina nada, só confirma. */
  | 'traducao-igual'
  /** A palavra é gramatical (artigo, pronome, auxiliar): ruído, não vocabulário. */
  | 'gramatical'
  /** Já existe outro cartão com a mesma palavra no mesmo idioma. */
  | 'duplicada'
  /** Sem idioma marcado — não dá para saber em que rodada ele entra. */
  | 'idioma-incerto';

export interface Veredito {
  serve: boolean;
  motivo?: MotivoDescarte;
  /**
   * 0..1 — quão bom é o item, para ORDENAR os aprovados (não para aprovar).
   * Serve para o sorteio preferir o material melhor quando sobra escolha.
   */
  pontuacao: number;
}

const APROVADO = (pontuacao: number): Veredito => ({ serve: true, pontuacao });
const REPROVADO = (motivo: MotivoDescarte): Veredito => ({ serve: false, motivo, pontuacao: 0 });

/** Base ISO-639-1 de um BCP-47 ('pt-BR' → 'pt'). Duplicado de `lib/languages` de propósito:
 *  `core` é isomórfico e não pode depender de `lib`, que é código de aplicação. */
export function baseLangDe(code: string | undefined | null): string {
  return (code || '').toLowerCase().split('-')[0];
}

/* ─────────────────────────── PALAVRAS GRAMATICAIS ───────────────────────────
   Por IDIOMA, e não uma lista só. A lista única de `keywords.ts` mistura inglês e português, o
   que produz dois erros silenciosos: "a" (artigo em ambos) é filtrado nos dois, certo por
   acidente,, mas "no" (advérbio inglês / preposição portuguesa) e "é" derrubam palavras válidas
   do outro idioma.

   IDIOMA SEM LISTA NÃO FILTRA NADA. É deliberado: aplicar a régua inglesa ao francês reprovaria
   vocabulário legítimo, e um filtro que erra é pior que filtro nenhum, some com o material da
   pessoa sem ela saber por quê. */

const GRAMATICAIS: Record<string, ReadonlySet<string>> = {
  en: new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while',
    'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'as', 'into',
    'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'this', 'that',
    'these', 'those', 'here', 'there', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'am', 'do', 'does', 'did', 'have', 'has', 'had', 'having', 'will',
    'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'not',
    'no', 'yes', 'so', 'than', 'too', 'very', 'just', 'now', 'also', 'only',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs',
    'what', 'which', 'who', 'whom', 'whose', 'how', 'why', 'where', 'all', 'any',
    'some', 'each', 'few', 'more', 'most', 'other', 'such', 'own', 'same',
    'okay', 'ok', 'yeah', 'well', 'gonna', 'wanna',
  ]),
  pt: new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'mas', 'se',
    'que', 'porque', 'quando', 'enquanto', 'de', 'do', 'da', 'dos', 'das', 'em',
    'no', 'na', 'nos', 'nas', 'por', 'para', 'pra', 'com', 'sem', 'sobre', 'como',
    'ao', 'aos', 'à', 'às', 'num', 'numa', 'pelo', 'pela', 'pelos', 'pelas',
    'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'isso',
    'isto', 'aquilo', 'aqui', 'ali', 'lá', 'é', 'são', 'foi', 'era', 'ser',
    'estar', 'está', 'estão', 'ter', 'tem', 'têm', 'tinha', 'haver', 'há',
    'vai', 'vou', 'vamos', 'não', 'sim', 'já', 'ainda', 'muito', 'mais', 'menos',
    'também', 'só', 'apenas', 'agora', 'eu', 'tu', 'ele', 'ela', 'nós', 'vós',
    'eles', 'elas', 'você', 'vocês', 'me', 'te', 'lhe', 'vos', 'meu',
    'minha', 'seu', 'sua', 'nosso', 'nossa', 'dele', 'dela', 'qual', 'quais',
    'quem', 'onde', 'todo', 'toda', 'todos', 'todas', 'algum', 'alguma', 'nada',
    'tudo', 'bem', 'então', 'assim', 'tá', 'né',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'si',
    'que', 'porque', 'cuando', 'de', 'del', 'en', 'por', 'para', 'con', 'sin',
    'sobre', 'como', 'al', 'este', 'esta', 'eso', 'esto', 'aquí', 'allí', 'es',
    'son', 'fue', 'era', 'ser', 'estar', 'está', 'están', 'tener', 'tiene', 'hay',
    'va', 'voy', 'vamos', 'no', 'sí', 'ya', 'muy', 'más', 'menos', 'también',
    'solo', 'ahora', 'yo', 'tú', 'él', 'ella', 'nosotros', 'ellos', 'ellas',
    'usted', 'me', 'te', 'le', 'nos', 'mi', 'su', 'nuestro', 'quién', 'dónde',
    'todo', 'toda', 'todos', 'todas', 'algo', 'nada', 'bien', 'entonces', 'así',
  ]),
};

/** A palavra é ruído gramatical no idioma dela? Idioma sem lista: sempre `false`. */
export function ehGramatical(palavra: string, lang: string): boolean {
  const lista = GRAMATICAIS[baseLangDe(lang)];
  if (!lista) return false;
  return lista.has((palavra ?? '').trim().toLowerCase());
}

/** Idiomas para os quais existe lista gramatical — a tela usa para avisar quando não filtra. */
export function idiomasComRegua(): string[] {
  return Object.keys(GRAMATICAIS);
}

/* ─────────────────────────── A PISTA ─────────────────────────── */

/**
 * A tradução serve de PISTA?
 *
 * Nasceu dentro do Termo (`pistaUtil`) e subiu para cá porque o defeito nunca foi do Termo: era do
 * funil que alimenta TODOS os jogos. Cada regra abaixo veio de um caso real que apareceu jogando.
 */
export function pistaUtil(traducao: string): boolean {
  const t = (traducao ?? '').trim();
  if (t.length < 2 || t.length > 42) return false;   // fragmento longo não é definição
  if (/\d/.test(t)) return false;                    // número no meio é ruído da captura
  if (/[!?]/.test(t)) return false;                  // "rápida!!" é fala, não significado
  if (/\.\.\.|…/.test(t)) return false;              // reticências = frase cortada
  if (t.split(/\s+/).length > 5) return false;       // pista boa é curta
  /* Pronome/demonstrativo sozinho ("Isso é", "Tu") não define coisa nenhuma.
     `(?!\p{L})` e NÃO `\b`: o `\b` do JavaScript é definido por `[A-Za-z0-9_]`, então um acento
     conta como fronteira de palavra e `/^esta\b/` casava com **"estação"**. Medido: as pistas
     "estação" (de `station` e de `season`) eram reprovadas como pronome solto, e qualquer cartão
     capturado traduzido "estágio", "estância" ou "estado" caía no mesmo buraco, em silêncio. */
  if (/^(isso|isto|aquilo|esse|essa|este|esta|tu|eu|ele|ela|nós|voc[êe]|it|this|that)(?!\p{L})/iu.test(t)
      && t.split(/\s+/).length <= 2) return false;
  return true;
}

/**
 * Comparação para "estas duas strings são a mesma palavra": sem acento, sem caixa, sem pontuação.
 *
 * Nasceu para "a tradução é a própria palavra" e é EXPORTADA porque o construtor de rodadas precisa
 * da mesma régua para outra pergunta: "esta pista já está na rodada?". Duas normalizações
 * diferentes para a mesma comparação seria a receita de "Conta" e "conta" passarem por distintas.
 */
export function chaveComparavel(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento, já separadas pelo NFD
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/* ─────────────────────────── O VEREDITO ─────────────────────────── */

export interface OpcoesAvaliacao {
  /** Idioma da rodada. Vazio = não avalia idioma (compatibilidade com cartões antigos). */
  lang?: string;
  /** Exige idioma marcado no cartão. A tela de curadoria liga; o jogo, não. */
  exigirIdioma?: boolean;
}

/**
 * Este cartão pode virar item de exercício?
 *
 * A ORDEM DOS TESTES IMPORTA: do defeito mais grave e mais fácil de consertar para o mais sutil.
 * O motivo devolvido é o PRIMEIRO encontrado, porque é ele que a pessoa precisa consertar
 * primeiro — dizer "sem tradução" para uma palavra que também é um artigo não ajudaria.
 */
export function avaliarCartao(card: VocabCard, opts: OpcoesAvaliacao = {}): Veredito {
  const palavra = (card.word ?? '').trim();
  const traducao = (card.translation ?? '').trim();
  const frase = (card.sentence ?? '').trim();

  if (palavra.length < 2) return REPROVADO('palavra-curta');

  // Ruído de captura: dígito, símbolo no meio, ou a mesma letra três vezes seguidas ("aaah").
  if (/\d/.test(palavra)) return REPROVADO('palavra-ruido');
  if (/(\p{L})\1{2,}/u.test(palavra)) return REPROVADO('palavra-ruido');
  // Precisa ser majoritariamente letras: "T-Lisa" passa, ">>>" não.
  const letras = (palavra.match(/\p{L}/gu) ?? []).length;
  if (letras < palavra.length * 0.6) return REPROVADO('palavra-ruido');

  if (opts.exigirIdioma && !baseLangDe(card.srcLang)) return REPROVADO('idioma-incerto');

  if (ehGramatical(palavra, card.srcLang || opts.lang || '')) return REPROVADO('gramatical');

  // Sem tradução, a frase real ainda pode virar lacuna — mas sem nenhuma das duas não há pista.
  if (!traducao) return frase ? APROVADO(0.5) : REPROVADO('sem-pista');

  if (chaveComparavel(traducao) === chaveComparavel(palavra)) return REPROVADO('traducao-igual');
  if (!pistaUtil(traducao)) return REPROVADO('pista-ruim');

  /* PONTUAÇÃO — só ordena os aprovados. Uma pista curta e de uma palavra é a melhor: define sem
     contar a resposta. Ter frase de origem soma, porque permite o modo lacuna. */
  const palavrasNaPista = traducao.split(/\s+/).length;
  let p = 0.7;
  if (palavrasNaPista <= 2) p += 0.15;
  if (frase) p += 0.15;
  return APROVADO(Math.min(1, p));
}

/** A frase real serve de material (lacuna, embaralhada, karaokê)? */
export function avaliarFrase(
  texto: string,
  opts: { traducao?: string; minPalavras?: number; maxPalavras?: number } = {},
): Veredito {
  const t = (texto ?? '').trim();
  const min = opts.minPalavras ?? 3;
  const max = opts.maxPalavras ?? 24;
  if (!t) return REPROVADO('sem-pista');

  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length < min) return REPROVADO('palavra-curta');
  if (palavras.length > max) return REPROVADO('pista-ruim');
  // Fala cortada pelo reconhecedor: começa em minúscula E termina sem pontuação final.
  const comecaNoMeio = /^\p{Ll}/u.test(t);
  const terminaNoMeio = !/[.!?…]$/.test(t);
  if (comecaNoMeio && terminaNoMeio) return REPROVADO('pista-ruim');
  if (/\d/.test(t) && (t.match(/\d/g) ?? []).length > t.length * 0.15) return REPROVADO('palavra-ruido');

  let p = 0.6;
  if (opts.traducao && opts.traducao.trim()) p += 0.25;
  if (palavras.length >= 5 && palavras.length <= 14) p += 0.15;
  return APROVADO(Math.min(1, p));
}

/* ─────────────────────────── A TRIAGEM ─────────────────────────── */

export interface CartaoFora {
  card: VocabCard;
  motivo: MotivoDescarte;
}

export interface Triagem {
  /** Prontos para jogar, do melhor para o pior. */
  usaveis: VocabCard[];
  /** Separados, com o motivo — é o que a tela de curadoria mostra. */
  fora: CartaoFora[];
  /** Existem, prestam, mas são de outro idioma. NÃO é defeito: é só outra rodada. */
  outroIdioma: VocabCard[];
}

/**
 * Separa o baralho em três: o que joga agora, o que está com defeito, e o que é de outro idioma.
 *
 * A TERCEIRA PILHA existe porque misturar "está quebrado" com "não é desta rodada" seria mentir
 * para a pessoa — e ela iria "consertar" cartões que estão perfeitos.
 *
 * A DEDUPLICAÇÃO acontece aqui, e não no banco, porque é aqui que se sabe qual das cópias é a
 * melhor: mantém a de maior pontuação (a que tem tradução mais limpa e frase de origem).
 */
export function triarCartoes(cards: VocabCard[], opts: OpcoesAvaliacao = {}): Triagem {
  const alvo = baseLangDe(opts.lang);
  const usaveis: Array<{ card: VocabCard; pontuacao: number }> = [];
  const fora: CartaoFora[] = [];
  const outroIdioma: VocabCard[] = [];
  const vistas = new Map<string, number>(); // chave → índice em `usaveis`

  for (const card of cards ?? []) {
    const idiomaDoCartao = baseLangDe(card.srcLang);

    // Filtro de idioma ANTES da régua: um cartão francês perfeito não é defeito numa rodada de
    // inglês, e listá-lo como problema mandaria a pessoa consertar o que está certo.
    if (alvo && idiomaDoCartao && idiomaDoCartao !== alvo) { outroIdioma.push(card); continue; }

    /**
     * SEM IDIOMA MARCADO, COM ALVO DECLARADO: é DEFEITO, não "outra rodada".
     *
     * O `&& idiomaDoCartao` da linha acima fazia um cartão sem `srcLang` passar em QUALQUER
     * idioma — o mesmo cartão contava como português numa rodada de português e como inglês numa
     * de inglês. A rodada então recebia material que a pessoa não pediu, e o rótulo "você tem N do
     * português" ficava colado num número que nunca tinha sido filtrado.
     *
     * Vai para `fora`, e não para `outroIdioma`, porque o docblock de `Triagem` é explícito: a
     * terceira pilha é "não é desta rodada". Um cartão sem idioma não tem OUTRA rodada — ele não
     * entra em nenhuma até alguém marcar o idioma dele, e é a curadoria que oferece esse conserto.
     *
     * Isto só torna implícito, quando há alvo, o `exigirIdioma` que `avaliarCartao` já implementa.
     * Sem alvo (`lang: ''`) nada muda. Medido no baralho real antes de escrever: 3 cartões de
     * 2.147 (0,1%) — o risco de sumiço em massa foi verificado, não presumido.
     */
    if (alvo && !idiomaDoCartao) { fora.push({ card, motivo: 'idioma-incerto' }); continue; }

    const v = avaliarCartao(card, opts);
    if (!v.serve) { fora.push({ card, motivo: v.motivo! }); continue; }

    const chave = `${idiomaDoCartao}|${chaveComparavel(card.word)}`;
    const jaVista = vistas.get(chave);
    if (jaVista === undefined) {
      vistas.set(chave, usaveis.length);
      usaveis.push({ card, pontuacao: v.pontuacao });
      continue;
    }
    // Duplicata: fica a melhor das duas, a outra vai para a curadoria explicada.
    if (v.pontuacao > usaveis[jaVista].pontuacao) {
      fora.push({ card: usaveis[jaVista].card, motivo: 'duplicada' });
      usaveis[jaVista] = { card, pontuacao: v.pontuacao };
    } else {
      fora.push({ card, motivo: 'duplicada' });
    }
  }

  usaveis.sort((a, b) => b.pontuacao - a.pontuacao);
  return { usaveis: usaveis.map(u => u.card), fora, outroIdioma };
}

/**
 * Contagem por motivo — o número que a tela de curadoria mostra em cada grupo.
 *
 * Pede só `{ motivo }` porque as duas fontes de descarte têm formatos diferentes: a triagem local
 * carrega o cartão inteiro (`CartaoFora`), e o servidor devolve só a palavra e o motivo. Exigir o
 * cartão obrigaria uma das duas a fabricar um objeto falso para poder contar.
 */
export function contarPorMotivo(fora: Array<{ motivo: MotivoDescarte }>): Record<MotivoDescarte, number> {
  const zero = {
    'sem-pista': 0, 'pista-ruim': 0, 'palavra-curta': 0, 'palavra-ruido': 0,
    'traducao-igual': 0, 'gramatical': 0, 'duplicada': 0, 'idioma-incerto': 0,
  } as Record<MotivoDescarte, number>;
  for (const f of fora) if (f.motivo in zero) zero[f.motivo]++;
  return zero;
}

/**
 * O descarte resumido em UMA LINHA: "3 sem tradução, 2 repetidas".
 *
 * POR QUE ISTO EXISTE. A captura gravava até seis palavras por fala e anunciava o total TENTADO
 * ("Sessão salva com 30 cards"), não o gravado. Depois que a régua entrou, o número da tela
 * continuou o mesmo e virou mentira: o servidor guardava 12 e a tela dizia 30. Contar sem dizer
 * o motivo seria só a metade do conserto — "pulei 18" faz a pessoa achar que perdeu algo, quando
 * na maioria das vezes eram repetidas que ela já tem.
 *
 * Devolve string vazia quando não pulou nada, para a tela poder concatenar sem checar.
 */
export function resumoDosPulados(pulados: Array<{ motivo: string }>): string {
  const contagem = contarPorMotivo(pulados as Array<{ motivo: MotivoDescarte }>);
  const partes = (Object.entries(contagem) as Array<[MotivoDescarte, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])   // o motivo mais comum primeiro: é o que vale agir sobre
    .map(([motivo, n]) => `${n} ${PLURAL_MOTIVO[motivo]}`);
  return partes.join(', ');
}

/**
 * O motivo no PLURAL e curto, para caber numa contagem.
 *
 * É o terceiro rótulo do mesmo conceito, e de propósito — cada um serve a um contexto que os
 * outros não servem: `ROTULO_MOTIVO` explica e ensina a consertar (tela de curadoria),
 * `motivoLegivel` responde "por que nada aconteceu?" no singular (clique numa palavra), e este
 * conta. Reusar `motivoLegivel` aqui produziria "2 já está no seu baralho".
 */
const PLURAL_MOTIVO: Record<MotivoDescarte, string> = {
  'sem-pista': 'sem tradução',
  'pista-ruim': 'com tradução que não explica',
  'palavra-curta': 'curtas demais',
  'palavra-ruido': 'com ruído da captura',
  'traducao-igual': 'com tradução igual à palavra',
  'gramatical': 'gramaticais',
  'duplicada': 'repetidas',
  'idioma-incerto': 'sem idioma',
};

/**
 * O motivo em uma frase, para o aviso de "não guardei esta palavra".
 *
 * Existe separado do `ROTULO_MOTIVO` porque o contexto é outro: lá a pessoa está numa tela de
 * curadoria olhando uma lista; aqui ela acabou de clicar numa palavra e precisa entender, numa
 * linha, por que nada aconteceu. Aceita `string` porque o motivo chega do servidor como texto.
 */
export function motivoLegivel(motivo: string): string {
  const conhecido = ROTULO_MOTIVO[motivo as MotivoDescarte];
  if (!conhecido) return 'não entrou no baralho';
  if (motivo === 'duplicada') return 'já está no seu baralho';
  return conhecido.titulo.toLowerCase();
}

/** Texto curto de cada motivo, na voz do produto (a tela não deve inventar o seu). */
export const ROTULO_MOTIVO: Record<MotivoDescarte, { titulo: string; conserto: string }> = {
  'sem-pista': { titulo: 'Sem tradução nem frase', conserto: 'Escreva a tradução para ela poder virar pergunta.' },
  'pista-ruim': { titulo: 'A tradução não explica', conserto: 'Troque por uma definição curta, hoje é um pedaço de fala.' },
  'palavra-curta': { titulo: 'Curta demais', conserto: 'Uma letra só não dá exercício.' },
  'palavra-ruido': { titulo: 'Ruído da captura', conserto: 'Veio com número ou símbolo, corrija ou arquive.' },
  'traducao-igual': { titulo: 'Tradução igual à palavra', conserto: 'Assim ela não ensina nada; traduza de verdade.' },
  'gramatical': { titulo: 'Palavra gramatical', conserto: 'Artigo, pronome ou auxiliar, é ruído, não vocabulário.' },
  'duplicada': { titulo: 'Repetida', conserto: 'Já existe outra igual; mantivemos a mais completa.' },
  'idioma-incerto': { titulo: 'Sem idioma marcado', conserto: 'Sem idioma ela não entra em rodada nenhuma.' },
};

/**
 * OS USÁVEIS DIVIDIDOS PELO TIPO DE PISTA — a diferença entre "existe" e "joga onde".
 *
 * O DEFEITO QUE ISTO TORNA VISÍVEL. A régua aprova, com confiança 0,5, o cartão que não tem
 * tradução mas tem frase: a frase vira lacuna e o **duelo relâmpago** joga com ela
 * (`MINIGAMES.blitz.requiresTranslation === false`). Está certo — endurecer a régua apagaria o
 * material do único jogo que sobrevive num baralho recém-capturado.
 *
 * Só que a tela dizia "923 prontas" e a Memória abria com 5. Os outros oito jogos precisam de
 * tradução de verdade: a Memória por `requiresTranslation`, o caça-palavras porque recusa a pista
 * em lacuna, o Termo porque `pistaUtil('')` é falso. Medido no baralho real: 1.200 de 2.147
 * cartões (56%) não têm tradução nenhuma.
 *
 * O erro nunca foi a régua — era o RÓTULO, que somava duas populações diferentes num número só e
 * deixava a queda de 923 para 5 parecendo defeito. Com esta separação a tela pode dizer a verdade
 * inteira: "993 no idioma · 323 com tradução · 670 só com frase".
 */
export function pistasDaTriagem(t: Triagem): { comTraducao: VocabCard[]; soComFrase: VocabCard[] } {
  const comTraducao: VocabCard[] = [];
  const soComFrase: VocabCard[] = [];
  for (const c of t.usaveis) {
    // A mesma pergunta que `avaliarCartao` faz para decidir entre pista real e lacuna.
    if (pistaUtil(c.translation ?? '')) comTraducao.push(c);
    else soComFrase.push(c);
  }
  return { comTraducao, soComFrase };
}
