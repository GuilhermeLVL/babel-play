import type { MinigameId } from './minigames/types';
import type { Raridade } from './tiposDaLoja';

/**
 * OS EFEITOS DE JOGO (recompensas v2, onda 3 — spec 5.2 item 2).
 *
 * Três tipos, cada um num momento da rodada:
 *   · ACERTO — a rajada (e o som) de cada item certo;
 *   · COMBO — o que acontece quando o multiplicador sobe de degrau;
 *   · FINALIZAÇÃO — a festa da rodada de três estrelas.
 *
 * DUAS ORIGENS, e a regra de onde valem muda com ela:
 *   · GENÉRICOS (6 acertos e 4 combos): Loja com Seeds, valem em todos os jogos. Sem nível: o nível
 *     da conta sobe rápido demais e abriria tudo antes das Seeds (docs/economia-v2.md);
 *   · DE MAESTRIA (1 acerto no nível 2 e 1 finalização no nível 4 de cada jogo): nunca à venda,
 *     valem no jogo de origem e, depois do nível 5 (Mestre) daquele jogo, em qualquer jogo.
 *
 * Este arquivo é o CATÁLOGO (o que existe, como se chama, de onde vem). O DESENHO de cada efeito
 * (forma, cor por token, quantidade, som) mora em `src/lib/comemoracao/efeitos.ts`, que conhece o
 * motor de partículas; `tests/efeitos-de-jogo.test.ts` cobra que todo id daqui tenha receita lá.
 *
 * Regra deste arquivo: TS puro — o servidor lê o catálogo para conferir preço e posse.
 */

export type TipoDeEfeito = 'efeito-acerto' | 'efeito-combo' | 'finalizacao';

export interface EfeitoDeJogo {
  /** Id do efeito — o `alvo` do item da loja e a chave da receita. */
  id: string;
  tipo: TipoDeEfeito;
  nome: string;
  desc: string;
  raridade: Raridade;
  /** Só os de maestria: o jogo de origem. */
  jogo?: MinigameId;
  /** Só os genéricos: o preço em Seeds (faixas calibradas: comum 350–450, raro 1000–1300). */
  precoSeeds?: number;
}

/** Os seis acertos genéricos — Loja com Seeds, valem em todos os jogos. */
export const ACERTOS_GENERICOS: readonly EfeitoDeJogo[] = [
  {
    id: 'acerto-pixel',
    tipo: 'efeito-acerto',
    nome: 'Acerto Pixel',
    desc: 'Quadradinhos verdes saltam de cada acerto.',
    raridade: 'comum',
    precoSeeds: 350,
  },
  {
    id: 'acerto-confete',
    tipo: 'efeito-acerto',
    nome: 'Acerto Confete',
    desc: 'Um punhado de papel picado na cor do tema.',
    raridade: 'comum',
    precoSeeds: 380,
  },
  {
    id: 'acerto-brasa',
    tipo: 'efeito-acerto',
    nome: 'Acerto Brasa',
    desc: 'Faíscas douradas que sobem e somem.',
    raridade: 'comum',
    precoSeeds: 400,
  },
  {
    id: 'acerto-vapor',
    tipo: 'efeito-acerto',
    nome: 'Acerto Vapor',
    desc: 'Uma nuvem leve que se desfaz no ar.',
    raridade: 'comum',
    precoSeeds: 420,
  },
  {
    id: 'acerto-coracao',
    tipo: 'efeito-acerto',
    nome: 'Acerto Coração',
    desc: 'Corações pequenos a cada palavra certa.',
    raridade: 'raro',
    precoSeeds: 1000,
  },
  {
    id: 'acerto-raio',
    tipo: 'efeito-acerto',
    nome: 'Acerto Raio',
    desc: 'Um estalo de raios dourados no ponto do acerto.',
    raridade: 'raro',
    precoSeeds: 1100,
  },
];

/** Os quatro combos genéricos — o degrau do multiplicador. */
export const COMBOS_GENERICOS: readonly EfeitoDeJogo[] = [
  {
    id: 'combo-brasa',
    tipo: 'efeito-combo',
    nome: 'Combo Brasa',
    desc: 'O multiplicador sobe numa labareda curta.',
    raridade: 'comum',
    precoSeeds: 360,
  },
  {
    id: 'combo-pixel',
    tipo: 'efeito-combo',
    nome: 'Combo Onda de Pixels',
    desc: 'Uma onda de pixels atravessa a tela a cada degrau.',
    raridade: 'comum',
    precoSeeds: 440,
  },
  {
    id: 'combo-trovao',
    tipo: 'efeito-combo',
    nome: 'Combo Trovão',
    desc: 'Raios nos quatro cantos quando o multiplicador sobe.',
    raridade: 'raro',
    precoSeeds: 1150,
  },
  {
    id: 'combo-confete',
    tipo: 'efeito-combo',
    nome: 'Combo Chuva de Confete',
    desc: 'Cada degrau solta uma chuva curta de confete.',
    raridade: 'raro',
    precoSeeds: 1190,
  },
];

/** O acerto de cada jogo — maestria nível 2 (Prata). */
const ACERTO_DO_JOGO: Record<MinigameId, [nome: string, desc: string]> = {
  memory: ['Carta Virada', 'Confete verde no par que você achou.'],
  wordsearch: ['Letra Achada', 'Pixels no tom do tema saltam da palavra encontrada.'],
  blitz: ['Faísca do Duelo', 'Raios dourados a cada resposta certa.'],
  termo: ['Letra no Lugar', 'Pixels verdes na palavra acertada.'],
  scramble: ['Peça Encaixada', 'Confete dourado quando a frase se encaixa.'],
  karaoke: ['Nota Certa', 'Corações no tom do tema a cada fala certa.'],
  escuta: ['Ouvido Afiado', 'Um brilho verde redondo a cada fala reconhecida.'],
  ditado: ['Traço Firme', 'Fumaça leve no tom do tema a cada ditado certo.'],
  conectores: ['Elo Certo', 'Círculos dourados a cada conector achado.'],
  karuta: ['Carta Pega', 'Confete no tom do tema na carta certa.'],
  choseong: ['Sílaba Completa', 'Pixels dourados a cada palavra completada.'],
  tenis: ['Bola na Linha', 'Raios verdes a cada devolução certa.'],
  koffer: ['Mala Arrumada', 'Círculos no tom do tema a cada item lembrado.'],
  bao: ['Semente Plantada', 'Corações verdes a cada palavra montada.'],
  vitendawili: ['Charada Decifrada', 'Fumaça dourada a cada lacuna resolvida.'],
  shiritori: ['Elo da Corrente', 'Raios no tom do tema a cada palavra encadeada.'],
  cadavre: ['Frase Viva', 'Fumaça verde a cada frase aceita.'],
  taboo: ['Dica Limpa', 'Corações dourados a cada palavra adivinhada.'],
};

/** A finalização de cada jogo — maestria nível 4 (Platina). */
const FINALIZACAO_DO_JOGO: Record<MinigameId, [nome: string, desc: string]> = {
  memory: ['Cartas ao Vento', 'Confete verde lançado dos quatro cantos, como cartas jogadas ao alto.'],
  wordsearch: ['Grade Acesa', 'Pixels verdes explodem dos quatro cantos.'],
  blitz: ['Relâmpago Final', 'Raios dourados rasgam a tela dos cantos.'],
  termo: ['Letras em Chuva', 'Pixels no tom do tema caem como letras soltas.'],
  scramble: ['Frase Montada', 'Confete verde atravessa a tela de um lado ao outro.'],
  karaoke: ['Bis!', 'Uma chuva de corações no tom do tema.'],
  escuta: ['Eco Dourado', 'Um anel de luz dourada que se abre do centro.'],
  ditado: ['Ponto Final', 'Uma nuvem no tom do tema se espalha do centro.'],
  conectores: ['Elo Fechado', 'Círculos verdes cruzam a tela.'],
  karuta: ['Mesa Limpa', 'Confete dourado dos quatro cantos.'],
  choseong: ['Consoantes em Festa', 'Pixels dourados em leque, do centro.'],
  tenis: ['Match Point', 'Círculos dourados atravessam a quadra.'],
  koffer: ['Mala Aberta', 'Confete no tom do tema salta do centro.'],
  bao: ['Colheita', 'Uma chuva de círculos verdes, como sementes.'],
  vitendawili: ['Enigma Resolvido', 'Raios no tom do tema saem do centro.'],
  shiritori: ['Corrente Completa', 'Pixels no tom do tema atravessam a tela.'],
  cadavre: ['Frase Maluca', 'Corações dourados dos quatro cantos.'],
  taboo: ['Palavra Liberada', 'Fumaça verde sobe dos quatro cantos.'],
};

const JOGOS = Object.keys(FINALIZACAO_DO_JOGO) as MinigameId[];

/** Os 18 acertos de maestria: `acerto-<jogo>`, raros, sem preço. */
export const ACERTOS_DE_MAESTRIA: readonly EfeitoDeJogo[] = JOGOS.map((jogo) => ({
  id: `acerto-${jogo}`,
  tipo: 'efeito-acerto',
  nome: ACERTO_DO_JOGO[jogo][0],
  desc: ACERTO_DO_JOGO[jogo][1],
  raridade: 'raro',
  jogo,
}));

/** As 18 finalizações de maestria: `finalizacao-<jogo>`, épicas, sem preço. */
export const FINALIZACOES_DE_MAESTRIA: readonly EfeitoDeJogo[] = JOGOS.map((jogo) => ({
  id: `finalizacao-${jogo}`,
  tipo: 'finalizacao',
  nome: FINALIZACAO_DO_JOGO[jogo][0],
  desc: FINALIZACAO_DO_JOGO[jogo][1],
  raridade: 'epico',
  jogo,
}));

export const EFEITOS_DE_JOGO: readonly EfeitoDeJogo[] = [
  ...ACERTOS_GENERICOS,
  ...COMBOS_GENERICOS,
  ...ACERTOS_DE_MAESTRIA,
  ...FINALIZACOES_DE_MAESTRIA,
];

export function efeitoPorId(id: string): EfeitoDeJogo | undefined {
  return EFEITOS_DE_JOGO.find((e) => e.id === id);
}

/** O nível de maestria que libera um efeito do jogo de origem em QUALQUER jogo. */
export const NIVEL_QUE_LIBERA_EM_TODOS = 5;

/**
 * O efeito vale NESTE jogo? Genérico vale sempre; o de maestria vale no jogo de origem e, depois
 * do nível 5 daquele jogo, em qualquer um. `nivelDaOrigem` é o nível de maestria do jogo de ORIGEM
 * do efeito (não o do jogo atual). Sem jogo atual conhecido, só o genérico vale.
 */
export function efeitoValeNoJogo(
  efeito: Pick<EfeitoDeJogo, 'jogo'>,
  jogoAtual: MinigameId | null,
  nivelDaOrigem: number,
): boolean {
  if (!efeito.jogo) return true;
  if (nivelDaOrigem >= NIVEL_QUE_LIBERA_EM_TODOS) return true;
  return jogoAtual === efeito.jogo;
}
