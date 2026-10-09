/**
 * OS JOGOS NO META QUEST: como cada um é jogado no headset, em que ordem aparecem, e quais não abrem.
 *
 * O que o aparelho tem entra por parâmetro, para o teste não precisar de headset. As leituras de fora
 * são o padrão da voz (`VozParaOQuest`): quem não a informa recebe a do aparelho e a do site; e
 * `noHeadset()`, só para a frase não falar em headset no computador com o desenho novo. NÃO
 * decide se o jogo tem material: isso continua sendo de `@core/minigames/estadoDosJogos`, e a frase
 * do que falta continua sendo a de `Play.tsx`. Aqui só entra o que é do APARELHO.
 */
import type { EstadoDoJogo } from '../../../../core/minigames/estadoDosJogos';
import type { RodadaMontada } from '../../../../core/minigames/rodada';
import { type MinigameId, MINIGAMES } from '../../../../core/minigames/types';
import type { RecursosDoAparelho } from '../../../../lib/dispositivo/recursos';
import { noHeadset } from '../../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../../lib/i18n';
import { langLabelNaUI } from '../../../../lib/languages';
import { anima, polido, reduz } from '../../../../lib/polimento/base';
import { haVozPara } from '../../../../lib/voz/haVoz';
import { vozDoQuestAtiva } from '../../../../lib/voz/vozDoQuest';

/**
 * COMO A RESPOSTA ENTRA, conferido na tela de cada jogo (01/10/2026, revisto em 02/10 com o desenho
 * do headset por dentro dos dezoito):
 *  · `apontar`: tudo é botão. Memória, Duelo, Karuta, Tabu, Charada, Corrente e "Qual foi?" são
 *    alternativas; a Frase embaralhada, a Mala e o Bao são peças; o Caça-palavras é tocar na primeira
 *    e na última letra (no headset não há arrasto); o Choseong tem as vogais na tela; os conectores
 *    são palavras clicáveis. A Karuta declama a pista, e sem voz para o idioma dela a escreve.
 *  · `teclado-na-tela`: o Termo. É digitação do começo ao fim, mas o teclado é DO JOGO, com teclas de
 *    56 px ao lado do tabuleiro: joga-se só apontando, sem o teclado do sistema.
 *  · `teclado`: a pessoa ESCREVE num campo. Ditado e Tênis têm `<input>`, a Frase maluca tem
 *    `<textarea>`: o teclado do sistema sobe quando o campo ganha foco.
 *  · `fala`: o Karaokê dá nota com `SpeechRecognition` (`KaraokeGame.tsx`, `gravar`); o navegador do
 *    headset não o tem. Havendo som, o jogo abre SEM nota ("ouça, repita em voz alta e siga"), e o
 *    cartão avisa; só fica apagado quando não há som nenhum para repetir.
 * `Record` exaustivo: jogo novo não compila até dizer como se joga.
 */
const ENTRADA: Record<MinigameId, 'apontar' | 'teclado-na-tela' | 'teclado' | 'fala'> = {
  memory: 'apontar',
  wordsearch: 'apontar',
  blitz: 'apontar',
  termo: 'teclado-na-tela',
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
 * A VOZ DE LEITURA PARA O IDIOMA DO BARALHO. O Quest não tem voz própria (`recursos.vozDeLeitura` é
 * falso ali), mas com a nuvem do site ligada há voz em alguns idiomas (`lib/voz/haVoz.ts`): o jogo que
 * depende de voz abre quando ela lê o idioma do baralho, e só fica apagado quando não lê.
 */
export interface VozParaOQuest {
  /**
   * O idioma do baralho em uso (`fonte.lang` de `Play.tsx`). Sem ele a pergunta vira "há alguma voz
   * aqui?", e quem confere o idioma é o próprio jogo, fala a fala (`minigames/noQuest.tsx`).
   */
  idioma?: string;
  /** "Há voz para este idioma, agora?" Padrão: `haVozPara`. Os testes passam a sua. */
  haVozPara?: (idioma: string) => boolean;
  /** "Há alguma voz de leitura, em qualquer idioma?" Padrão: a voz do site está ligada. */
  haAlgumaVoz?: () => boolean;
}

/**
 * O jogo, NESTE recorte, só toca com voz sintetizada? É o ramo "palavra falada" de `estadoDoJogo`:
 * escuta, ditado e karaokê sem fala gravada caem para `fonte: 'baralho'` e o som passa a ser a voz
 * de leitura (`lib/tts.ts`). Sem voz para o idioma do baralho, o jogo abriria mudo.
 */
const dependeDeVozSintetizada = (j: JogoParaOQuest): boolean =>
  !!MINIGAMES[j.id].aceitaPalavraFalada && (j.estado.motivo === 'sem-voz' || j.estado.fonte === 'baralho');

/**
 * A preferência de ordem do usuário (`lib/ordemDosJogos`): os fixados (a estrela) e a ordem que a
 * pessoa montou em "Favoritos e ordem".
 */
export interface OrdemParaOQuest {
  fixados?: readonly string[];
  ordem?: readonly string[];
}

/**
 * Cada jogo vira um cartão com etiqueta. A ORDEM É DO USUÁRIO: os favoritos que abrem vêm primeiro na
 * grade inteira (na ordem em que foram fixados), depois os jogos que a pessoa ordenou, na ordem dela.
 * O grupo ("o que se joga apontando vem na frente") só desempata o que a pessoa nunca ordenou, e por
 * último vale a ordem de entrada. O que não abre aqui fica sempre no fim: primeiro o que o aparelho
 * não atende, depois o que espera material.
 */
export function tilesDoQuest<J extends JogoParaOQuest>(
  jogos: readonly J[],
  recursos: Pick<RecursosDoAparelho, 'vozDeLeitura' | 'reconhecimentoDoNavegador' | 'tecladoFisico'>,
  /** O que falta a um jogo sem material, na frase que a tela de sempre já usa. */
  notaDoBloqueio: (jogo: J) => string,
  /** A voz de leitura para o idioma do baralho. Omitida: a do aparelho e a do site, sem idioma. */
  voz: VozParaOQuest = {},
  /** A preferência do usuário. Omitida: só os grupos e a ordem de entrada. */
  ordem: OrdemParaOQuest = {},
): TileDoQuest<J>[] {
  /* HÁ VOZ PARA O BARALHO? A do aparelho lê o que tiver instalado; a do site, os idiomas dela. */
  const haVoz =
    recursos.vozDeLeitura ||
    (voz.idioma ? (voz.haVozPara ?? haVozPara)(voz.idioma) : (voz.haAlgumaVoz ?? vozDoQuestAtiva)());
  const nomeDoIdioma = voz.idioma ? langLabelNaUI(voz.idioma) : '';
  const classificar = (jogo: J): TileDoQuest<J> => {
    const entrada = ENTRADA[jogo.id];
    /* O som deste jogo, neste recorte, viria só da voz de leitura, e não há voz para o idioma. */
    const semSom = dependeDeVozSintetizada(jogo) && (!haVoz || jogo.estado.motivo === 'sem-voz');
    /* KARAOKÊ sem reconhecimento de fala: sem som nenhum não há o que repetir, e o cartão fica apagado.
       Com som (o clipe da sessão ou a voz de leitura) ele ABRE, mais abaixo, no modo "ouça, repita em
       voz alta e siga" (`KaraokeGame.tsx`, `semNotaAqui`), com a etiqueta dizendo que não há nota. */
    if (entrada === 'fala' && semSom)
      return {
        jogo,
        grupo: 'aparelho',
        tag: t('Pede voz de leitura'),
        apagado: true,
        nota: nomeDoIdioma
          ? t('Sem gravação e sem voz de leitura em {idioma}, não há o que ouvir e repetir.', { idioma: nomeDoIdioma })
          : t('Sem gravação e sem voz de leitura, não há o que ouvir e repetir.'),
      };
    /* O material não fecha a rodada. "Sem voz" só chega aqui quando o gate de `estadoDoJogo` não
       conhece a alternativa escrita dos jogos (no Quest, `Play.tsx` diz a ele que ela existe). */
    if (!jogo.estado.ok)
      return jogo.estado.motivo === 'sem-voz'
        ? {
            jogo,
            grupo: 'aparelho',
            tag: t('Pede voz de leitura'),
            apagado: true,
            nota: nomeDoIdioma
              ? t(
                  'Sem gravação, quem fala é a voz de leitura, e aqui não há voz em {idioma}. Escolha uma gravação com áudio.',
                  { idioma: nomeDoIdioma },
                )
              : t(
                  'Sem gravação, quem fala é a voz de leitura, e este aparelho não tem. Escolha uma gravação com áudio.',
                ),
          }
        : { jogo, grupo: 'material', tag: t('Falta material'), apagado: true, nota: notaDoBloqueio(jogo) };
    if (entrada === 'fala' && !recursos.reconhecimentoDoNavegador)
      return {
        jogo,
        grupo: 'audio',
        tag: t('Sem nota de voz'),
        apagado: false,
        /* A frase é do aparelho: no computador com o desenho novo, quem não reconhece fala é o navegador. */
        nota: noHeadset()
          ? t('O headset não dá nota de pronúncia: ouça, repita em voz alta e siga.')
          : t('Este navegador não dá nota de pronúncia: ouça, repita em voz alta e siga.'),
      };
    /* ESCUTA E DITADO sem voz para o idioma: os dois jogos têm a alternativa escrita (o ramo `!temSom`
       mostra a tradução no lugar do som), então abrem, e o cartão diz como a pergunta vem. */
    if (semSom)
      return {
        jogo,
        grupo: entrada === 'teclado' && !recursos.tecladoFisico ? 'teclado' : 'audio',
        tag: t('Pela tradução'),
        apagado: false,
        nota: nomeDoIdioma
          ? t('Aqui não há voz em {idioma}: a pergunta vem escrita, pela tradução.', { idioma: nomeDoIdioma })
          : t('Este aparelho não tem voz de leitura: a pergunta vem escrita, pela tradução.'),
      };
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
    /* COMO SE JOGA, na palavra do aparelho. Com teclado físico (o computador com o desenho novo) o Termo
       é digitado como sempre, e o que no headset se aponta com o controle, ali se clica. */
    const tag = recursos.tecladoFisico
      ? entrada === 'apontar'
        ? t('Clicar')
        : t('Digitar')
      : entrada === 'teclado-na-tela'
        ? t('Teclado na tela')
        : entrada === 'teclado'
          ? t('Digitar')
          : t('Apontar');
    return { jogo, grupo: 'apontar', tag, apagado: false };
  };
  const fixados = ordem.fixados ?? [];
  const escolhida = ordem.ordem ?? [];
  /* A posição de cada cartão: quatro critérios, do que mais manda ao que só desempata. */
  const posicao = (tile: TileDoQuest<J>, entrada: number): [number, number, number, number] => {
    const grupo = ORDEM_DOS_GRUPOS.indexOf(tile.grupo);
    if (tile.apagado) return [2, grupo, entrada, 0];
    const fixado = fixados.indexOf(tile.jogo.id);
    if (fixado >= 0) return [0, fixado, grupo, entrada];
    const naOrdem = escolhida.indexOf(tile.jogo.id);
    return [1, naOrdem >= 0 ? naOrdem : escolhida.length, grupo, entrada];
  };
  return jogos
    .map((jogo, entrada) => {
      const tile = classificar(jogo);
      return { tile, posicao: posicao(tile, entrada) };
    })
    .sort((a, b) => {
      for (let i = 0; i < 4; i++) if (a.posicao[i] !== b.posicao[i]) return a.posicao[i] - b.posicao[i];
      return 0;
    })
    .map(({ tile }) => tile);
}

/**
 * Os jogos que o lobby do headset deixa ABRIR, neste recorte: é entre eles que a partida rápida
 * sorteia e que a sugestão do dia escolhe (um jogo apagado no lobby não pode ser o sorteado).
 */
export function jogosQueAbremNoQuest<J extends JogoParaOQuest>(
  jogos: readonly J[],
  recursos: Pick<RecursosDoAparelho, 'vozDeLeitura' | 'reconhecimentoDoNavegador' | 'tecladoFisico'>,
  voz: VozParaOQuest = {},
): Set<MinigameId> {
  return new Set(
    tilesDoQuest(jogos, recursos, () => '', voz)
      .filter((tile) => !tile.apagado)
      .map((tile) => tile.jogo.id),
  );
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

/* ---- Estados que se abrem na própria tela (`alternarEstado()` de `telas2.js:527-543`) ------------- */

/** A conta do protótipo para saber o que já estava na tela: o tamanho do texto e a etiqueta. */
const chaveDaFolha = (x: Element) => (x.textContent ?? '').length + x.tagName;

/**
 * A tela ANTES de um estado abrir no lugar ("Por que este?", a linha da trilha): o que
 * `entrarOQueAbriu` precisa para animar só o que é novo. `null` onde não há o que animar
 * (`telas2.js:532, 538`).
 */
export function fotoDaTela(): Set<string> | null {
  if (typeof document === 'undefined' || !polido() || reduz()) return null;
  const tela = document.querySelector('.px-tela');
  return tela ? new Set([...tela.querySelectorAll('*')].map(chaveDaFolha)) : null;
}

/**
 * Só o que é novo entra animado, o resto da tela não se mexe (`telas2.js:539-541`): as folhas novas,
 * até 24, descem 10 px saindo do desfoque, 420 ms, 22 ms uma da outra. Fechar não anima.
 */
export function entrarOQueAbriu(antes: Set<string> | null): void {
  const tela = typeof document === 'undefined' ? null : document.querySelector('.px-tela');
  if (!antes || !tela) return;
  [...tela.querySelectorAll('.q-palco *, .tela *')]
    .filter((x) => !antes.has(chaveDaFolha(x)) && !x.children.length)
    .slice(0, 24)
    .forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(-10px)', filter: 'blur(4px)' },
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
        ],
        { d: 420, atraso: i * 22 },
      ),
    );
}
