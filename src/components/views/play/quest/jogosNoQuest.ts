/**
 * OS JOGOS NO META QUEST: como cada um é jogado no headset, em que ordem aparecem, e quais não abrem.
 *
 * Função pura (o que o aparelho tem entra por parâmetro) para o teste não precisar de headset. NÃO
 * decide se o jogo tem material: isso continua sendo de `@core/minigames/estadoDosJogos`, e a frase
 * do que falta continua sendo a de `Play.tsx`. Aqui só entra o que é do APARELHO.
 */
import type { EstadoDoJogo } from '../../../../core/minigames/estadoDosJogos';
import type { RodadaMontada } from '../../../../core/minigames/rodada';
import { type MinigameId, MINIGAMES } from '../../../../core/minigames/types';
import type { RecursosDoAparelho } from '../../../../lib/dispositivo/recursos';
import { t } from '../../../../lib/i18n';

/**
 * COMO A RESPOSTA ENTRA, conferido na tela de cada jogo (01/10/2026):
 *  · `apontar`: tudo é botão. Memória, Duelo, Karuta, Tabu, Charada, Corrente e "Qual foi?" são
 *    alternativas; a Frase embaralhada, a Mala e o Bao são peças; o Caça-palavras aceita tocar na
 *    primeira e na última letra; o Choseong tem as vogais na tela; os conectores são palavras
 *    clicáveis. A Karuta declama a pista, e sem voz de leitura a escreve (`semVozParaAPista`).
 *  · `teclado`: a pessoa ESCREVE. Ditado e Tênis têm `<input>`, a Frase maluca tem `<textarea>`, e o
 *    Termo é digitar a palavra letra a letra (tem teclado na tela, mas é digitação do começo ao fim).
 *  · `fala`: o Karaokê dá nota com `SpeechRecognition` (`KaraokeGame.tsx`, `gravar`); sem ele o jogo
 *    abre, toca a fala e não avalia nada.
 * `Record` exaustivo: jogo novo não compila até dizer como se joga.
 */
const ENTRADA: Record<MinigameId, 'apontar' | 'teclado' | 'fala'> = {
  memory: 'apontar',
  wordsearch: 'apontar',
  blitz: 'apontar',
  termo: 'teclado',
  scramble: 'apontar',
  karaoke: 'fala',
  escuta: 'apontar',
  ditado: 'teclado',
  conectores: 'apontar',
  karuta: 'apontar',
  choseong: 'apontar',
  tenis: 'teclado',
  koffer: 'apontar',
  bao: 'apontar',
  vitendawili: 'apontar',
  shiritori: 'apontar',
  cadavre: 'teclado',
  taboo: 'apontar',
};

/** Os grupos, na ordem em que aparecem: o que funciona bem com o controle vem na frente. */
export type GrupoNoQuest = 'apontar' | 'audio' | 'teclado' | 'aparelho' | 'material';
const ORDEM_DOS_GRUPOS: GrupoNoQuest[] = ['apontar', 'audio', 'teclado', 'aparelho', 'material'];

export interface JogoParaOQuest {
  id: MinigameId;
  estado: EstadoDoJogo;
}

export interface TileDoQuest<J extends JogoParaOQuest> {
  jogo: J;
  grupo: GrupoNoQuest;
  /** A etiqueta: como se joga, ou o que o jogo pede e não há. */
  tag: string;
  /** Não abre aqui: o cartão aparece apagado e não é um alvo. */
  apagado: boolean;
  /** Substitui a descrição do jogo quando há algo mais útil a dizer (o motivo, ou "melhor no computador"). */
  nota?: string;
}

/**
 * O jogo, NESTE recorte, só toca com voz sintetizada? É o ramo "palavra falada" de `estadoDoJogo`:
 * escuta, ditado e karaokê sem fala gravada caem para `fonte: 'baralho'` e o som passa a ser o TTS
 * (`lib/tts.ts`). No Quest não há `speechSynthesis`, e o jogo abriria mudo.
 */
const dependeDeVozSintetizada = (j: JogoParaOQuest): boolean =>
  !!MINIGAMES[j.id].aceitaPalavraFalada && (j.estado.motivo === 'sem-voz' || j.estado.fonte === 'baralho');

/**
 * Cada jogo vira um cartão com etiqueta, e a lista sai ordenada por grupo. Dentro do grupo vale a
 * ordem de entrada, que é a do usuário (`lib/ordemDosJogos`).
 */
export function tilesDoQuest<J extends JogoParaOQuest>(
  jogos: readonly J[],
  recursos: Pick<RecursosDoAparelho, 'vozDeLeitura' | 'reconhecimentoDoNavegador' | 'tecladoFisico'>,
  /** O que falta a um jogo sem material, na frase que a tela de sempre já usa. */
  notaDoBloqueio: (jogo: J) => string,
): TileDoQuest<J>[] {
  const classificar = (jogo: J): TileDoQuest<J> => {
    const entrada = ENTRADA[jogo.id];
    if (entrada === 'fala' && !recursos.reconhecimentoDoNavegador)
      return {
        jogo,
        grupo: 'aparelho',
        tag: t('Pede nota de voz'),
        apagado: true,
        nota: t('O headset não avalia a pronúncia.'),
      };
    if (dependeDeVozSintetizada(jogo) && (!recursos.vozDeLeitura || jogo.estado.motivo === 'sem-voz'))
      return {
        jogo,
        grupo: 'aparelho',
        tag: t('Pede voz de leitura'),
        apagado: true,
        nota: t('Sem gravação, quem fala é a voz de leitura, e este aparelho não tem. Escolha uma gravação com áudio.'),
      };
    if (!jogo.estado.ok)
      return { jogo, grupo: 'material', tag: t('Falta material'), apagado: true, nota: notaDoBloqueio(jogo) };
    if (entrada === 'teclado' && !recursos.tecladoFisico)
      return {
        jogo,
        grupo: 'teclado',
        tag: t('Pede teclado'),
        apagado: false,
        nota: t('Melhor no computador ou no celular.'),
      };
    if (MINIGAMES[jogo.id].modalidade === 'frase-audio')
      return {
        jogo,
        grupo: 'audio',
        // Sem gravação o som é a voz de leitura do aparelho, e a etiqueta não promete "áudio da sessão".
        tag: dependeDeVozSintetizada(jogo) ? t('Voz de leitura') : t('Áudio da sessão'),
        apagado: false,
      };
    return { jogo, grupo: 'apontar', tag: entrada === 'teclado' ? t('Digitar') : t('Apontar'), apagado: false };
  };
  const tiles = jogos.map(classificar);
  return ORDEM_DOS_GRUPOS.flatMap((grupo) => tiles.filter((tile) => tile.grupo === grupo));
}

/** No headset a Memória joga com no máximo 6 pares: doze cartas grandes numa grade 4 × 3, sem rolar. */
export const PARES_DA_MEMORIA_NO_QUEST = 6;

/**
 * A rodada já montada, ajustada ao headset. Só a Memória muda: os pares que passam de seis saem do
 * material E da prévia, para a antessala continuar mostrando exatamente o que vai ser jogado.
 */
export function rodadaParaOQuest(montada: RodadaMontada): RodadaMontada {
  const { material } = montada;
  if (material.tipo !== 'itens' || material.jogo !== 'memory') return montada;
  if (material.itens.length <= PARES_DA_MEMORIA_NO_QUEST) return montada;
  const itens = material.itens.slice(0, PARES_DA_MEMORIA_NO_QUEST);
  const ficam = new Set(itens.map((i) => i.answer));
  return { ...montada, previa: montada.previa.filter((p) => ficam.has(p.ref)), material: { ...material, itens } };
}
