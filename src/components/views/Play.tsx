import {
  acumular,
  agruparFases,
  agruparJogos,
  cartoesDaFonte,
  cartoesDaTrilha,
  cartoesDoFiltro,
  type CefrLevel,
  chaveDaPalavra,
  chaveDaPalavra as chaveDaPalavraCore,
  comoDesbloquear,
  CONFIANCA_CURADA,
  type ContextoDeDesbloqueio,
  type DadoTrilha,
  type Desbloqueio,
  diagnosticoTermo,
  escolhaDaFonte,
  type EscolhaDaPratica,
  estadoDeCadaJogo,
  type EstadoDoItem,
  estadoDoItem,
  type EstadoSequencia,
  estimativaDeMinutos,
  etapaAtual,
  etapasDoNivel,
  faixaAuto,
  fonteDaEscolha,
  type FonteDeItens,
  type FonteId,
  fontesDisponiveis,
  frasesDaTrilha,
  frasesDoAcervo,
  gradeFor,
  idiomasDisponiveis,
  isDueNow,
  type ItemCru,
  type ItemDaAntessala,
  MAPA_REVELA_ALVO,
  marcarPromovidas,
  mesmaCorrente,
  mesmaFonte,
  type MinigameId,
  type MinigameItem,
  MINIGAMES,
  niveisEmJogo,
  type OrigemDaPratica,
  pistasDaTriagem,
  pontosDeMaestria,
  pontuarRodada,
  previaSegura,
  progressoDasEtapas,
  progressoDaTrilha,
  repetidosDaUltima,
  resumir,
  type ResumoDaSequencia,
  resumoDosPulados,
  type RodadaConectores,
  type RodadaDitado,
  type RodadaEscuta,
  type RodadaFrase,
  rodadaRendeBau,
  type RodadaTermo,
  rotuloDaFonte,
  rotuloDeDuracao,
  type RoundReport,
  SEEDS_DO_DROP,
  SESSAO_DA_TRILHA,
  type Triagem,
  xpFromRound,
} from '@core';
import { idiomaDominanteDosCartoes } from '@core/texto/idioma';
import {
  BarChart2,
  BookOpen,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  CircleHelp,
  CirclePlay,
  Filter,
  Flame,
  Gamepad2,
  Globe,
  GraduationCap,
  Headphones,
  Languages,
  Layers,
  ListChecks,
  Lock,
  Map as MapIcon,
  Mic,
  Package,
  PackageOpen,
  Pin,
  Play as IconePlay,
  Puzzle,
  Quote,
  Search,
  Shuffle,
  Sparkle,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy as TrophyIcon,
  Upload,
  Zap,
} from 'lucide-react';
import React, { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { escalaDe } from '../../core/learning/cefrWordlist';
import { rotuloDaEtapa } from '../../core/learning/trilha';
import { type EstrategiaDaUI } from '../../core/minigames/composicao';
import {
  aceitaFiltroDeDificuldade,
  type CartaoParaCompor,
  compor,
  type Composicao,
  contagemDaFonte,
  faixaDe as faixaDeScore,
  type FaixaDificuldade,
  filtroParaComposicao,
  recortarPelaComposicao,
} from '../../core/minigames/composicao';
import { filtroDaFonte, type FiltroDaPratica, fonteDominante, passaNoFiltro } from '../../core/minigames/filtro';
import { type MaterialDaRodada, montarRodada as montarRodadaPura } from '../../core/minigames/rodada';
import {
  type AppMetrics,
  bulkAddCards,
  creditarSeeds,
  fetchDeck,
  fetchExerciseResults,
  fetchHistoricoDeItens,
  fetchRecordes,
  fetchSessions,
  fetchSessionTranscript,
  fetchSettings,
  gastarSeedsEx,
  type HistoricoDeItem,
  reviewCard,
  salvarRodada,
} from '../../data/api';
import { listarBaralhosAnki } from '../../data/apiAnki';
import { carregarTrilha, indiceDaTrilha, precarregarNiveis, trilhaEmCache } from '../../data/trilha/carregar';
import { useAudioDaSessao } from '../../lib/audioDaSessao';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../lib/dispositivo/recursos';
import { noHeadset, useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { type DetalheDoDrop, EVENTO_DROP_GANHO } from '../../lib/filaDeRecompensas';
import { filtroDaQuery, gravarFiltro, lerFiltroGuardado, queryDoFiltro } from '../../lib/filtroDaPratica';
import { temFonteGuardada } from '../../lib/fonteDaPratica';
import { numero, t, tp } from '../../lib/i18n';
import {
  buscarComposicaoPeloFunil,
  chaveDaMemoriaCurta,
  gravarDetalhesDoBaralho,
  gravarPularAntessala,
  LIMITE_DA_COMPOSICAO,
  pularAntessala,
  verDetalhesDoBaralho,
} from '../../lib/jogos/estadoDaPratica';
import { langConfigFrom, saveLangConfig } from '../../lib/langConfig';
import { baseLang, langLabelNaUI } from '../../lib/languages';
import { lazyComRecarga } from '../../lib/lazyComRecarga';
import { pontosPorJogo, sincronizarMaestria } from '../../lib/maestria';
import {
  lerPrecisoes,
  registrarPrecisao,
  registrarVistas,
  vistasRecentes as vistasGuardadas,
} from '../../lib/memoriaLocal';
import { dispararOferta } from '../../lib/ofertas/eventos';
import {
  alternarFixado,
  aplicarOrdem,
  gravarOrdem,
  lerOrdem,
  mover,
  ORDEM_VAZIA,
  type OrdemDosJogos,
} from '../../lib/ordemDosJogos';
import { contarPassada } from '../../lib/passadasDoPipeline';
import { estadoDoCartao } from '../../lib/pelesDeCartao';
import { sairDaTelaDoJogar, type TelaDoJogar } from '../../lib/polimento/jogos';
import { type AgeProfileType, coreOnly } from '../../lib/profile';
import type { DerivedProgress } from '../../lib/progress';
import { consumirQueryDoBoot, lerUrlAtual, publicarQueryDoJogar } from '../../lib/rotas';
import { type PracticeSeed, type Sentence, toSentences } from '../../lib/sentences';
import { play } from '../../lib/soundFx';
import { T } from '../../lib/T';
import { aoMudarVozes, hasVoiceFor, isTtsSupported, vozesCarregadas } from '../../lib/tts';
import { aparelhoTemVoz, haVozPara } from '../../lib/voz/haVoz';
import type { Recording, VocabCard } from '../../types';
import { LangFlag } from '../LangFlag';
import { familiaDoJogo, FAMILIAS, tomDoJogo } from '../minigames/ArteDosJogos';
import { unidadeDaRodada } from '../minigames/casca/regras';
import { TabelaDaCobertura } from '../minigames/CoberturaDosIdiomas';
import type { FalaKaraoke } from '../minigames/KaraokeGame';
import { jaFezTour, marcarTourFeito, PASSOS_DOS_JOGOS } from '../minigames/passosDosJogos';
import { jogosSeguintes } from '../minigames/polimento/textos';
import type { ItemDaRodada } from '../minigames/ResultadoDaRodada';
import SalaDeEscolha from '../minigames/SalaDeEscolha';
import SeletorDeConteudo from '../minigames/SeletorDeConteudo';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, Tela as MolduraDaTela, TituloDeSecao } from '../ui';

/**
 * A tela de baralhos Anki SOB DEMANDA (Fase 4 da prontidão). Ela só aparece quando a pessoa abre
 * "Trazer baralho"/"Meus baralhos", e o import estático a baixava junto com o `/jogar` inteiro:
 * ~38 KB gzip que o Lighthouse mobile listava como JS não usado na carga da tela de jogos.
 * `lazyComRecarga`, como as outras telas, para sobreviver a um deploy.
 */
const BaralhoAnki = lazyComRecarga(() => import('./BaralhoAnki'));
/* Telas que só abrem por clique (o mapa, a curadoria, os recordes): fora do chunk do
   lobby, pelo mesmo motivo — e do mesmo jeito, `lazyComRecarga` dentro de um `Suspense`. */
const MapaDoConteudo = lazyComRecarga(() => import('./MapaDoConteudo'));
const CuradoriaBaralho = lazyComRecarga(() => import('./CuradoriaBaralho'));
const Recordes = lazyComRecarga(() => import('./play/Recordes'));
import PainelTrilha from './PainelTrilha';
import { IconePixel } from './play/IconesPixel';
import { descricaoDoJogo, JOGOS, type JogoUI, tituloDoJogo } from './play/jogos';
import {
  AntessalaDaRodada,
  CascaDaRodada,
  ComoSeJoga,
  ConectoresGame,
  DitadoGame,
  EscutaGame,
  KaraokeGame,
  precarregarJogo,
  ResultadoDaRodada,
  ScrambleGame,
  TermoGame,
  TourGuiado,
} from './play/jogosSobDemanda';
import {
  type JogoParaOQuest,
  jogosQueAbremNoQuest,
  rodadaParaOQuest,
  type TileDoQuest,
  tilesDoQuest,
} from './play/quest/jogosNoQuest';
import LobbyDoQuest from './play/quest/LobbyDoQuest';
import { TELA_DO_JOGO } from './play/telaDoJogo';

/**
 * JOGAR — a porta de entrada para praticar.
 *
 * POR QUE ESTA TELA EXISTE. Chegar a um exercício custava ~4 cliques e duas esperas de rede,
 * passando por uma tela que não é sobre exercícios; e os exercícios moram numa sub-aba da
 * Análise, que EXIGE uma sessão gravada — sem nenhuma, `Analysis` fazia `return null` e a
 * pessoa via uma tela em branco, sem explicação. Aqui são dois cliques, e o que a tela precisa
 * é o BARALHO (global), não uma sessão.
 *
 * A regra de honestidade vale igual: sem palavras salvas, a tela DIZ o que falta e quantas —
 * não inventa palavras de exemplo nem mostra um jogo que falha ao clicar.
 */

interface PlayProps {
  onChangeView: (view: string, data?: any) => void;
  ageProfile: AgeProfileType;
  progress: DerivedProgress;
  metrics: AppMetrics | null;
  /**
   * Sessão de onde jogar, quando se chega aqui pela Análise. Opcional de propósito: "Jogar"
   * continua sendo uma tela GLOBAL — a sessão é um filtro, não a casa dela. (Ver `types.ts:80-84`:
   * morar sob a Análise faria a tela exigir uma gravação e voltar a abrir em branco sem nenhuma.)
   */
  recording?: Recording | null;
  /**
   * "Praticar ISTO agora" — o trecho ou a palavra que a pessoa escolheu em outra tela (menu de
   * contexto da transcrição, painel de vocabulário) junto com o jogo que ela pediu.
   *
   * Existe porque os exercícios legados saíram e as portas de entrada deles não podiam sumir
   * junto: "praticar shadowing neste trecho" virou "Karaokê com esta fala". Sem esta prop o
   * atalho abriria o lobby genérico, e escolher uma frase específica não teria efeito nenhum —
   * botão que parece função e não é.
   */
  seed?: PracticeSeed | null;
  /**
   * Esta tela está DENTRO de outra (a aba "Jogos" da sessão), não é a view de primeiro nível.
   *
   * Muda três coisas, todas porque o dono do layout passa a ser o container da aba: o lobby
   * abre mão do seu próprio scroller e do seu padding (senão vira rolagem dentro de rolagem e
   * padding dobrado), o `<h1>` some (a sessão já tem o dela logo acima, e duas na mesma página
   * quebram a navegação por cabeçalho do leitor de tela) e a faixa de progresso do PERFIL some
   * — ela fala de nível/streak/seeds, e a aba fala de UMA sessão.
   */
  embutido?: boolean;
  /** O som do app (App.tsx): o interruptor "Sons" da pausa liga e desliga o mesmo som. */
  soundEnabled?: boolean;
  toggleSound?: () => void;
  /**
   * Embutido: quantos jogos ficaram prontos com o material desta sessão — o número da aba "Jogos"
   * (`Abas(... n)` do protótipo). Vem DAQUI, e não de uma conta paralela na sessão, para a aba e a
   * grade nunca discordarem.
   */
  aoContarProntos?: (n: number) => void;
  /**
   * DESENHO NOVO, embutido: no lugar do lobby, a sessão desenha os ladrilhos DELA (os quatro do
   * protótipo, `telas3.js:74-82`, em `analise/quest/JogosDaSessao`). Recebe os cartões como o lobby
   * do desenho novo os classifica (`tilesDoQuest`: etiqueta, apagado, o que falta), ou `null` enquanto
   * o baralho carrega, e a função que abre a rodada pelo caminho de sempre (`pedirParaJogar`).
   */
  ladrilhos?: (
    tiles: readonly TileDoQuest<JogoParaOQuest>[] | null,
    aoJogar: (id: MinigameId) => void,
  ) => React.ReactNode;
}

/**
 * AS TRÊS FONTES, COMO A TELA AS OFERECE.
 *
 * `OrigemDaPratica` é o vocabulário da TELA; `FonteId` é o do dado (e não pode ser renomeado, ver
 * `core/minigames/source.ts` — `exercise_results.origem` é derivado dele). "Minhas gravações"
 * cobre dois `FonteId` porque a diferença entre "todas" e "uma" é escopo, não matéria.
 *
 * Os três perfis não são tradução, são públicos diferentes — mesma regra de `play/jogos.tsx`.
 */
const ABAS_DE_FONTE: Array<{
  origem: OrigemDaPratica;
  fontes: FonteId[];
  icone: React.ReactNode;
  rotulo: Record<AgeProfileType, string>;
  dica: string;
  semMaterial: string;
}> = [
  {
    origem: 'trilha',
    fontes: ['trilha'],
    icone: <GraduationCap className="w-4 h-4" aria-hidden />,
    rotulo: { kids: 'Trilha', pro: 'Trilha', senior: 'Curso de palavras' },
    dica: 'Uma lista curada, do básico ao avançado, com etapa e fim.',
    semMaterial: 'Ainda não existe trilha neste idioma.',
  },
  {
    origem: 'gravacoes',
    fontes: ['baralho', 'sessao'],
    icone: <Mic className="w-4 h-4" aria-hidden />,
    rotulo: { kids: 'O que eu gravei', pro: 'Minhas gravações', senior: 'As minhas palavras' },
    dica: 'As palavras que você fichou do que ouviu. Revisão, não curso.',
    semMaterial: 'Você ainda não salvou palavras de nenhuma gravação.',
  },
  {
    origem: 'dificeis',
    fontes: ['dificeis'],
    icone: <Flame className="w-4 h-4" aria-hidden />,
    rotulo: { kids: 'As que eu erro', pro: 'Difíceis', senior: 'As que mais escapam' },
    dica: 'As que você mais erra, primeiro. A fila encolhe quando você acerta.',
    semMaterial: 'Revise mais um pouco — ainda não há material para uma rodada.',
  },
];

/**
 * OS NOVE JOGOS CULTURAIS SAIRAM DA GRADE (auditoria de 2026-09-07, achado A02).
 *
 * `JogoAtivo`, `JogoCulturalMeta` e `JOGOS_CULTURAIS` viviam aqui: um registro paralelo de jogos,
 * fora de `MinigameId` e de `MINIGAMES`. A consequencia nao era organizacional, era uma afirmacao
 * falsa na tela — cada card anunciava "100% Funcional" e a rodada nao passava por `montarRodada`,
 * o `RoundReport` era descartado por um `onFinish` sem argumentos, e o banco real nao tinha uma
 * unica rodada registrada dos nove. Seis deles nem usavam o acervo da pessoa.
 *
 * Os componentes continuam no repositorio, em `src/components/minigames/culturais/`, com o
 * contrato de volta escrito em `openspec/changes/jogos-culturais-dentro-do-sistema/`: um jogo so
 * volta a grade quando tem def em `MINIGAMES`, nasce em `montarRodada` e termina em `aoTerminar`.
 */

/* A HABILIDADE É A FAMÍLIA DO JOGO — a mesma que pinta o ponto da carta (`tomDoJogo`). Antes os
   nove culturais caíam todos em "Sintaxe & frases", e o filtro "Vocabulário" escondia o Bao e o
   Tabu, que são de palavra. */
const habilidadeDoJogoClassico = (id: MinigameId): 'vocab' | 'escuta_fala' | 'frase_gramatica' => {
  const f = familiaDoJogo(id);
  if (f === 'palavra') return 'vocab';
  if (f === 'frase') return 'frase_gramatica';
  return 'escuta_fala';
};

/** A aba "Clássicos" do protótipo: os nove jogos de base (os outros nove são os culturais). */
const CLASSICOS: ReadonlySet<MinigameId> = new Set<MinigameId>([
  'memory',
  'wordsearch',
  'termo',
  'scramble',
  'ditado',
  'escuta',
  'karaoke',
  'conectores',
  'blitz',
]);

/**
 * Uma rodada JÁ MONTADA, esperando a pessoa decidir. É o que a antessala mostra.
 *
 * `previa` e `aplicar` descrevem a MESMA rodada: a lista é o que vai cair, não uma amostra
 * parecida. Sortear de novo na hora de jogar tornaria a antessala uma promessa falsa.
 */
interface RodadaPronta {
  jogo: MinigameId;
  previa: ItemDaAntessala[];
  aplicar: () => void;
}

export default function Play({
  onChangeView,
  ageProfile,
  progress,
  metrics,
  recording,
  seed,
  embutido,
  soundEnabled,
  toggleSound,
  aoContarProntos,
  ladrilhos,
}: PlayProps) {
  const [deck, setDeck] = useState<VocabCard[] | null>(null);
  /* Preferência de ordem/fixados, lida do `localStorage` na montagem. `lerOrdem` já é defensiva:
     um storage corrompido devolve a ordem padrão em vez de derrubar a grade. */
  const [ordem, setOrdem] = useState<OrdemDosJogos>(ORDEM_VAZIA);
  /**
   * O QUE ACABOU DE CAIR — a memória curta que quebra o "fico preso nas mesmas questões".
   *
   * NÃO É OPCIONAL, e a medição é o motivo. Consertar a prioridade de vencidos em `buildItems`
   * (que estava dissolvida por um `shuffle` no lugar errado) melhorou o Termo de 7 para 25
   * palavras distintas em 5 rodadas — mas PIOROU a Memória de 37 para 8, porque com os vencidos
   * sempre na frente ela passou a tirar os mesmos 8 de um punhado de vencidos. Com esta lista
   * alimentando o `evitar`, a Memória vai a 40 de 40. As duas coisas são uma feature só.
   *
   * Vive em memória e morre ao recarregar, de propósito: é sobre a SESSÃO DE USO, não sobre o
   * histórico. Entre dias, quem manda é o agendador — e deve mandar mesmo.
   */
  const [vistasRecentes, setVistasRecentes] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setOrdem(lerOrdem());
  }, []);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * A FONTE desta rodada: de onde vêm as palavras e em que idioma.
   *
   * Era isto que faltava e que causava a queixa de "mistura tudo": a tela pegava o baralho inteiro
   * e a sessão mais recente, sem escolha nenhuma. Medido neste baralho: 1.166 palavras em
   * português e 337 em inglês sorteadas juntas na mesma rodada.
   */
  /**
   * A INVERSÃO DA VERDADE (onda facetada): o estado agora é o FILTRO; `fonte` e `setFonte` viram
   * derivado e shim. Por quê assim, e não o contrário: as facetas (multi-fonte, recorte, mídia)
   * não são expressáveis em `FonteDeItens`, então `fonte` não pode continuar sendo o estado — mas
   * os DOZE escritores e as dezenas de leitores de `fonte` espalhados por este arquivo continuam
   * corretos lendo o derivado e escrevendo pelo shim, que traduz via os adaptadores testados
   * (`filtroDaFonte`/`fonteDominante`, round-trip provado no core). Trocar cada leitor num passe
   * só seria a classe de refatoração que quebra em silêncio.
   *
   * Efeito colateral DESEJADO do shim: escrever uma fonte que não é 'baralho' DERRUBA o recorte de
   * baralho — era o defeito "chip aceso e inerte" da auditoria (D2), que existia porque aba e chip
   * eram estados que não se conheciam. Agora são o mesmo objeto; a incoerência ficou inexprimível.
   */
  const [filtro, setFiltro] = useState<FiltroDaPratica>(() => filtroDaFonte({ id: 'baralho', lang: '' }, null));
  /* A gaveta do seletor nasce FECHADA: quem chega quer jogar, não configurar. Ela é a resposta
     ao «Trocar», e o resumo acima dela já diz o que está valendo sem precisar abrir nada. */
  const [seletorAberto, setSeletorAberto] = useState(false);
  /* META QUEST com as telas novas ligadas: o lobby vira a grade de `play/quest/LobbyDoQuest` e a
     Memória joga com menos pares. "Tela de sempre" devolve o lobby do computador só nesta visita. */
  const questNovo = useQuestNovo();
  /* O DESENHO também liga no computador (02/10/2026). O que é LIMITE DO APARELHO (a Memória com menos
     pares, o jogo de ouvir que abre pela tradução por falta de voz) pergunta por aqui. */
  const noHeadsetNovo = questNovo && noHeadset();
  const [lobbyCompletoNoQuest, setLobbyCompletoNoQuest] = useState(false);
  /** "O que cada idioma tem", dentro da gaveta: a tabela abre e fecha no próprio botão. */
  const [verCobertura, setVerCobertura] = useState(false);
  const fonte = useMemo<FonteDeItens>(() => ({ ...fonteDominante(filtro), lang: filtro.idiomas[0] ?? '' }), [filtro]);
  const setFonte = useCallback((upd: FonteDeItens | ((f: FonteDeItens) => FonteDeItens)) => {
    setFiltro((prev) => {
      const atual: FonteDeItens = { ...fonteDominante(prev), lang: prev.idiomas[0] ?? '' };
      const nova = typeof upd === 'function' ? upd(atual) : upd;
      if (mesmaFonte(atual, nova)) {
        if (baseLang(atual.lang) === baseLang(nova.lang)) return prev; // aborto barato preservado
        // SÓ o idioma mudou (ex.: o carregador de settings entregando `praticaLang`): trocar
        // idioma é ajustar UMA faceta, não recomeçar a escolha — reconstruir aqui apagava o
        // recorte que a URL ou a persistência tinham acabado de restaurar.
        return { ...prev, idiomas: nova.lang ? [nova.lang] : [] };
      }
      return filtroDaFonte(nova, nova.id === 'baralho' && prev.baralhos[0] ? { id: prev.baralhos[0] } : null);
    });
  }, []);

  /**
   * O RANKING DE DIFÍCEIS, injetado VIVO na fonte (progresso-de-idioma 2.3). O estado `fonte`
   * guarda só `{id:'dificeis', lang}`; os ids vêm do servidor a cada render — congelá-los no
   * estado (ou no localStorage) faria a rodada praticar a foto do dia da escolha, e "difícil"
   * é exatamente o que muda conforme se pratica.
   */
  const rankingDeDificeis = useMemo(() => (metrics?.palavrasDificeis ?? []).map((p) => p.cardId), [metrics]);

  /* O ranking como CONJUNTO — o formato que `passaNoFiltro` consome no complemento do recorte.
     Derivado do mesmo memo acima; nunca persiste (regra de `source.ts`: difícil é o que muda). */
  const conjuntoDeDificeis = useMemo(() => new Set(rankingDeDificeis), [rankingDeDificeis]);
  const fonteComRanking = useMemo<FonteDeItens>(
    () => (fonte.id === 'dificeis' ? { ...fonte, cardIds: rankingDeDificeis } : fonte),
    [fonte, rankingDeDificeis],
  );

  /**
   * A SALA DE ESCOLHA — aberta UMA VEZ POR ENTRADA na tela, e é só isso que este estado faz.
   *
   * Funciona porque `App.tsx` renderiza `{activeView === 'play' && <Play/>}` **sem `key` e sem
   * keep-alive**: o componente desmonta ao sair da view e remonta ao entrar. Rodada, mapa,
   * curadoria e antessala são *early returns* do mesmo componente montado — nenhum deles remonta
   * nada, então voltar de uma partida não reabre a sala.
   *
   * DELIBERADAMENTE NÃO É UM `useEffect`. Um efeito com `[]` faria o mesmo hoje e é justamente
   * assim que isto volta a piscar quando alguém acrescentar uma dependência sem perceber.
   *
   * FRAGILIDADE DECLARADA: pôr `key` no `<Play>` ou passar a manter a view montada em segundo
   * plano reabriria a sala a cada troca de aba. Se isso for feito, este estado precisa mudar junto.
   */
  /**
   * A SALA ABRE PARA QUEM AINDA NÃO ESCOLHEU — e só para essa pessoa.
   *
   * Ela abria a CADA entrada, para todo mundo. Somada à prévia da rodada (ligada por padrão) e ao
   * modal de recompensa, davam três telas cheias entre abrir "Jogar" e ver o primeiro item: quem
   * tinha 30 segundos livres gastava os 30 decidindo, fechando e confirmando, e saía sem jogar.
   *
   * Quem já decidiu entra direto na grade, e a porta de volta continua onde estava: o botão de
   * idioma/ajustes ao lado das abas. Quem NUNCA decidiu ainda ganha a sala — é a única vez em que
   * ela responde uma pergunta que a pessoa de fato tem.
   *
   * Depende da restauração da fonte guardada funcionar para quem não tem gravações (ver
   * `sessoesCarregadas`): sem aquele conserto, entrar direto no lobby cairia na fonte ERRADA, e
   * sem a sala para denunciar a troca.
   */
  const [salaAberta, setSalaAberta] = useState(() => !embutido && !temFonteGuardada());
  /* Números do baralho (contagens, mapa, recorte, revisão) COLAPSADOS por padrão: quem chega quer
     jogar, não auditar o acervo, pedido do dono (2026-08-26). A escolha persiste no navegador. */
  const [verRecordes, setVerRecordes] = useState(false);
  /* O MAPA DE RECORDES POR JOGO saiu em 08/09. Ele existia "para o selo das cartas", e o selo
     nunca foi desenhado: o estado era escrito e nunca lido. O custo não era só a memória — o
     efeito ia à rede a cada toque no painel de recordes para jogar a resposta fora. Quem mostra
     recorde hoje é a tela de Recordes, que busca os seus. */
  const [detalhes, setDetalhes] = useState<boolean>(verDetalhesDoBaralho);
  /** Um só ponto de escrita: estado e persistência mudam juntos ou não mudam. */
  const alternarDetalhes = () =>
    setDetalhes((v) => {
      gravarDetalhesDoBaralho(!v);
      return !v;
    });
  const [curando, setCurando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [categoriaAtiva, setCategoriaAtiva] = useState<'todos' | 'classicos' | 'favoritos'>('todos');
  const [buscaJogos, setBuscaJogos] = useState('');
  const [filtroHabilidade, setFiltroHabilidade] = useState<'todas' | 'vocab' | 'escuta_fala' | 'frase_gramatica'>(
    'todas',
  );
  const [vendoBaralhos, setVendoBaralhos] = useState(false);
  /** O jogo que "Jogar com este baralho" pediu, esperando o recorte novo chegar (ver o efeito). */
  const [jogoPendente, setJogoPendente] = useState<{ jogo: MinigameId; baralho: string } | null>(null);
  /** O filtro para o qual a composição em mãos foi pedida. */
  const filtroDaComposicao = useRef<unknown>(null);
  /**
   * O BARALHO ESCOLHIDO como recorte da rodada — "hoje só o japonês".
   *
   * Guardado aqui, e não em `FonteDeItens`, porque não é uma quinta fonte: é um recorte DENTRO de
   * `'baralho'`, que o servidor já sabe aplicar pela ocorrência (`origin_kind='anki'` +
   * `origin_ref`). Uma fonte nova obrigaria a mexer em `fontesDisponiveis`, `rotuloDaFonte`,
   * `OrigemDoItem` e `exercise_results.origem` — que deriva de `FonteId` e por isso não pode ser
   * renomeado — sem entregar nada que o `ref` não entregue.
   */
  const [decksAnki, setDecksAnki] = useState<Array<{ id: string; nome: string; lang: string | null }>>([]);
  const [decksCarregados, setDecksCarregados] = useState(false);
  const recarregarBaralhosAnki = useCallback(async () => {
    try {
      const lista = await listarBaralhosAnki();
      setDecksAnki(lista.map((d) => ({ id: d.id, nome: d.nome, lang: d.idiomaOrigem ?? null })));
      // Baralho escolhido que sumiu (purgado noutra aba) não pode continuar recortando a rodada.
      setFiltro((prev) => {
        const vivos = prev.baralhos.filter((id) => lista.some((d) => d.id === id));
        return vivos.length === prev.baralhos.length ? prev : { ...prev, baralhos: vivos };
      });
    } catch {
      /* sem baralhos: a porta só não aparece */
    } finally {
      setDecksCarregados(true);
    }
  }, []);
  useEffect(() => {
    void recarregarBaralhosAnki();
  }, [recarregarBaralhosAnki]);
  /** Derivado do filtro — o "chip" é só a cara do primeiro baralho do recorte. */
  const baralhoAnki = useMemo<{ id: string; nome: string } | null>(() => {
    const id = filtro.baralhos[0];
    if (!id) return null;
    return { id, nome: decksAnki.find((d) => d.id === id)?.nome ?? 'Baralho' };
  }, [filtro.baralhos, decksAnki]);
  const setBaralhoAnki = useCallback((v: { id: string; nome: string } | null) => {
    setFiltro((prev) =>
      v
        ? {
            ...prev,
            fontes: prev.fontes.includes('baralho') ? prev.fontes : [...prev.fontes, 'baralho'],
            baralhos: [v.id],
          }
        : { ...prev, baralhos: [] },
    );
  }, []);
  /** Idioma da pessoa — é o destino da tradução das palavras da trilha. */
  const [idiomaNativo, setIdiomaNativo] = useState('pt');
  /**
   * Jogos de FRASE (embaralhada, karaokê) não vivem do baralho: precisam das falas reais de uma
   * sessão, com áudio e marcações de tempo. Carregamos a gravação mais recente que tenha isso —
   * sem ela, esses dois aparecem bloqueados com o motivo, nunca quebrados.
   */
  const [frases, setFrases] = useState<Sentence[]>([]);
  /* O CAMINHO da API para o áudio da sessão. É a IDENTIDADE ("esta gravação tem som") e continua
     alimentando o gate; o que vai para o `<audio src>` dos jogos é a URL de blob, resolvida abaixo
     por `useAudioDaSessao`, a rota exige Bearer e `<audio src>` não manda cabeçalho nenhum. */
  const [audioSessao, setAudioSessao] = useState<string>('');
  const [idDoAudio, setIdDoAudio] = useState<string | null>(null);
  /**
   * QUAL gravação está alimentando os jogos de frase — e a lista para trocar.
   *
   * A tela escolhia sozinha (`sessoes.find(s => s.audioUrl) ?? sessoes[0]`) e não contava a
   * ninguém: o rótulo dizia só "Só desta sessão", nunca QUAL. Você jogava sempre a mesma gravação
   * sem saber, e sem ter como pedir outra.
   */
  const [sessoes, setSessoes] = useState<Array<{ id: string; title: string; audioUrl?: string }>>([]);
  /**
   * A BUSCA DAS GRAVAÇÕES JÁ TERMINOU? Não é o mesmo que "tem gravação".
   *
   * A restauração da fonte guardada esperava `sessoes.length` para validar o id de "uma gravação".
   * Quem não tem NENHUMA gravação nunca satisfazia essa condição, e a fonte guardada (uma trilha,
   * por exemplo) morria em silêncio: a pessoa escolhia "Trilha B1", voltava depois e caía em
   * "Minhas palavras" sem nada na tela explicando a troca.
   *
   * Com este sinalizador a espera é pela RESPOSTA, não pelo conteúdo dela — inclusive quando a
   * resposta é "nenhuma" ou quando a busca falha (aí também não virão gravações para validar).
   */
  const [sessoesCarregadas, setSessoesCarregadas] = useState(false);
  const [sessaoEmUso, setSessaoEmUso] = useState<{ id: string; title: string } | null>(null);
  /** Título da sessão vinda por prop, lido pelo efeito de busca sem virar dependência dele. */
  const tituloRef = useRef<string | undefined>(recording?.title);

  const [vendoMapa, setVendoMapa] = useState(false);
  /** Modo ORGANIZAR: revela as setas e o alfinete de cada carta. Ver o botão que o liga. */
  const [modoOrganizar, setModoOrganizar] = useState(false);
  /* `sessaoEscolhida` saiu com a lista de gravações inalcançável que a escrevia: nenhum lugar do
     arquivo chamava `setSessaoEscolhida`, então o ref era sempre `null` e o ramo "escolha manual"
     do efeito abaixo nunca rodava. Trocar de gravação é trabalho da Sala de Escolha (`sessionId`
     na fonte), e é lá que ele continua. */
  /** Rodada em curso (itens já sorteados) e o resultado a revelar na raspadinha. */
  const [rodada, setRodada] = useState<{ jogo: MinigameId; itens: MinigameItem[] } | null>(null);
  const [rodadaTermo, setRodadaTermo] = useState<RodadaTermo[] | null>(null);
  const [rodadaFrase, setRodadaFrase] = useState<RodadaFrase[] | null>(null);
  const [rodadaKaraoke, setRodadaKaraoke] = useState<FalaKaraoke[] | null>(null);
  const [rodadaEscuta, setRodadaEscuta] = useState<RodadaEscuta[] | null>(null);
  const [rodadaDitado, setRodadaDitado] = useState<RodadaDitado[] | null>(null);
  const [rodadaConectores, setRodadaConectores] = useState<RodadaConectores[] | null>(null);
  const [resultado, setResultado] = useState<RoundReport | null>(null);
  /** "Recomeçar" e toda rodada nova remontam a casca e o jogo (chave nova). */
  const [chaveDaRodada, setChaveDaRodada] = useState(0);
  /** Quantos itens tinha a rodada que acabou: o placar continua na tela de fim do desenho novo. */
  const [totalDoFim, setTotalDoFim] = useState(0);
  /**
   * DESENHO NOVO: as telas de dentro do Jogar (lobby, antessala, rodada, fim) SAEM com a animação de
   * saída de tela do protótipo antes de trocar (`prototipo.js:233-252`, em `lib/polimento/jogos.ts`).
   * Embutido na Análise o jogo abre por cima, num portal: lá não há tela a sair.
   */
  const trocarTela = (de: TelaDoJogar, para: TelaDoJogar, trocar: () => void) =>
    questNovo && !embutido ? sairDaTelaDoJogar(de, para, trocar) : trocar();
  /* v3 — RODADA EM CURSO marca o body (`data-jogo-ativo`): o modal de recompensa (App) espera
     `babel:rodada-fechou` em vez de cobrir a partida. Fechar a rodada dispara o evento. */
  const emRodada =
    !resultado &&
    !!(rodada || rodadaTermo || rodadaFrase || rodadaKaraoke || rodadaEscuta || rodadaDitado || rodadaConectores);
  useEffect(() => {
    if (emRodada) document.body.setAttribute('data-jogo-ativo', '1');
    else {
      const estava = document.body.hasAttribute('data-jogo-ativo');
      document.body.removeAttribute('data-jogo-ativo');
      if (estava) window.dispatchEvent(new Event('babel:rodada-fechou'));
    }
    return () => {
      document.body.removeAttribute('data-jogo-ativo');
    };
  }, [emRodada]);
  /* FIM DA SESSÃO DE ESTUDO (Fase 8): a oferta de fim de sessão vem quando a pessoa SAI do Jogar
     depois de ter fechado ao menos uma rodada — nunca no meio de uma rodada nem por cima do resumo
     dela. O host ainda aplica flag, frequência e o teto da sessão. */
  const rodadasFechadas = useRef(0);
  useEffect(() => {
    if (resultado) rodadasFechadas.current += 1;
  }, [resultado]);
  useEffect(
    () => () => {
      if (rodadasFechadas.current > 0) dispararOferta('fim_de_sessao', { origem: 'jogo' });
    },
    [],
  );
  /* Z1 — FILTRO DE DIFICULDADE. Vale para os 4 jogos de modalidade `palavra`; os 5 de frase
     jogam sobre falas, que não têm dificuldade por palavra (ver `composicao.ts`). */
  const [faixas, setFaixas] = useState<FaixaDificuldade[]>([]);
  /* SELEÇÃO v2: 'auto' é o padrão — a faixa vem da precisão recente do jogo (`faixaAuto`), com
     o motivo dito na antessala. Escolher um chip de nível tira do automático. */
  const [estrategia, setEstrategia] = useState<EstrategiaDaUI>('auto');
  const [composicao, setComposicao] = useState<Composicao | null>(null);

  /**
   * TOUR em curso: o jogo já está na tela e o tour aponta os elementos DELE, um por vez.
   *
   * A primeira versão disto era um diálogo com cinco blocos de texto antes da partida. Estava
   * correta e era inútil — ninguém lê parede de texto para começar a jogar, pula, e segue sem
   * saber que existe um radar ou um "ouvir devagar". Informação que não chega é o mesmo que
   * informação que não existe.
   */
  const [tourDe, setTourDe] = useState<MinigameId | null>(null);
  /** Ficha de referência (o "?"), que continua existindo para quem QUER ler os detalhes. */
  const [explicando, setExplicando] = useState<MinigameId | null>(null);
  /** A rodada montada esperando decisão. `null` = ninguém pediu para jogar. */
  const [antessala, setAntessala] = useState<RodadaPronta | null>(null);
  /* Quem abre a antessala vai jogar: baixa o tabuleiro enquanto lê a prévia (`jogosSobDemanda.ts`). */
  const jogoDaAntessala = antessala?.jogo;
  useEffect(() => {
    if (jogoDaAntessala) precarregarJogo(jogoDaAntessala);
  }, [jogoDaAntessala]);
  /**
   * "Começar direto, sem a prévia" — inicializado do `localStorage` NA PRIMEIRA RENDERIZAÇÃO.
   *
   * Era `useState(false)` mais um efeito que corrigia depois (o antigo `:887`). Funcionava por
   * acidente de tempo — ninguém clica antes do primeiro efeito — mas deixava o componente com dois
   * estados possíveis para a mesma preferência durante um render. Com o inicializador preguiçoso o
   * estado nasce certo e o efeito deixa de ser necessário.
   */
  const [pularSempre, setPularSempre] = useState(pularAntessala);

  /** Um só ponto de escrita: estado e persistência mudam juntos ou não mudam. */
  const mudarPularSempre = (v: boolean) => {
    setPularSempre(v);
    gravarPularAntessala(v);
  };
  /**
   * A CORRENTE DE RODADAS. `null` = ninguém emendou nada ainda.
   *
   * Não entra na cascata de telas: quem já ocupa a posição do fim de rodada é a raspadinha, e ela
   * passou a ser a tela de continuação. Isto aqui é só o que sobrevive ENTRE uma rodada e a
   * seguinte — placar, combo vivo e, principalmente, o que já caiu (ver `vistosNaSequencia`).
   */
  const [sequencia, setSequencia] = useState<EstadoSequencia | null>(null);
  /** O placar da corrente que ACABOU de encerrar, para o lobby dizer o que foi conquistado. */
  const [ultimaCorrente, setUltimaCorrente] = useState<ResumoDaSequencia | null>(null);
  /**
   * Encerra a corrente GUARDANDO o placar — usado por toda saída (fim da rodada, X do jogo).
   *
   * Lê `sequencia` do render em vez de usar o updater funcional de propósito: `setState` dentro de
   * um updater é efeito colateral, e o React o executa duas vezes em desenvolvimento (StrictMode).
   * É o mesmo tropeço que o overlay já teve com a persistência.
   */
  const encerrarCorrente = () => {
    setUltimaCorrente(resumir(sequencia));
    setSequencia(null);
  };
  /** Acabou o material elegível para emendar: a raspadinha esconde o "mais uma" em vez de mentir. */
  const [semMaterial, setSemMaterial] = useState(false);
  /**
   * O melhor placar já feito em cada jogo NESTA fonte. Chave = `exerciseKind`.
   *
   * `score` era gravado por rodada desde a migração 0001 e NUNCA lido de volta — este é o
   * caminho de leitura que faltava. Fica por fonte porque bater recorde no A1 da trilha e no
   * baralho inteiro não são a mesma proeza.
   */
  const [recordes, setRecordes] = useState<Map<string, number>>(new Map());
  const recordeDoJogo = (jogo: MinigameId) => recordes.get(jogo) ?? null;
  /**
   * MAESTRIA POR JOGO (recompensas v2, onda 3): os pontos do SERVIDOR por jogo (`null` sem a flag
   * ou sem resposta — a barra some) e, da rodada que acabou de fechar, os pontos de antes e o que
   * ela somou. `sincronizarMaestria` também pede os créditos `maestria:` que faltam.
   */
  const [maestria, setMaestria] = useState<ReadonlyMap<MinigameId, number> | null>(null);
  const [maestriaDaRodada, setMaestriaDaRodada] = useState<{ pontosAntes: number; ganho: number } | null>(null);
  /** A gravação da rodada que acabou de fechar: com `falhou`, o fim diz que nada foi creditado. */
  const [gravacaoDaRodada, setGravacaoDaRodada] = useState<'pendente' | 'ok' | 'falhou'>('pendente');
  useEffect(() => {
    let vivo = true;
    void sincronizarMaestria().then((jogos) => {
      if (vivo && jogos) setMaestria(pontosPorJogo(jogos));
    });
    return () => {
      vivo = false;
    };
  }, []);
  /**
   * Seeds gastas NESTA visita, ainda não refletidas em `progress` (que vem do App e só muda
   * quando as métricas são recarregadas). O servidor continua sendo a autoridade — isto só evita
   * que o saldo na tela minta entre o clique e a próxima leitura.
   */
  const [gastasLocais, setGastasLocais] = useState(0);
  const [gastando, setGastando] = useState(false);
  const saldoSeeds = Math.max(0, progress.seeds - gastasLocais);
  /** Como cada item foi das outras vezes. Chave = `item_ref`. */
  const [historico, setHistorico] = useState<Map<string, HistoricoDeItem>>(new Map());
  /** Os itens da última rodada de cada jogo nesta fonte — é o que "repetir" remonta. */
  const [ultimaRodada, setUltimaRodada] = useState<Map<string, string[]>>(new Map());
  /** As linhas cruas desta fonte — a antessala agrupa em FASES (estrelas + rejogar). */
  const [linhasDaFonte, setLinhasDaFonte] = useState<Parameters<typeof agruparFases>[0]>([]);
  /**
   * DESDE QUANDO existe registro do que caiu. `null` = nunca houve rodada gravada.
   *
   * O mapa precisa dizer isso: até a migração 0001 as rodadas eram gravadas sem identidade de
   * item, então tudo que foi jogado antes é invisível. Sem o aviso, o mapa diria "nunca caiu"
   * para palavras que a pessoa já jogou — e um percurso que mente é pior que percurso nenhum.
   */
  const [historicoDesde, setHistoricoDesde] = useState<number | null>(null);
  /* Tempos por item já respondidos NESTA fonte. Só insumo: a decisão de haver estimativa ou não é
     de `@core/minigames/duracao`, que cala abaixo de 20 amostras. */
  const [temposMedidos, setTemposMedidos] = useState<number[]>([]);

  /**
   * APLICAR o material escolhido: qual `setState` recebe o quê, e nada mais.
   *
   * É a outra metade da divisão que `@core/minigames/rodada` estabelece — o núcleo ESCOLHE, a
   * tela APLICA. O `switch` é exaustivo de propósito: um jogo novo que acrescente um rótulo a
   * `MaterialDaRodada` e esqueça desta tabela não compila.
   */
  const aplicarMaterial = (m: MaterialDaRodada) => {
    switch (m.tipo) {
      case 'termo':
        setRodadaTermo(m.rodadas);
        return;
      case 'frase':
        setRodadaFrase(m.rodadas);
        return;
      case 'escuta':
        setRodadaEscuta(m.rodadas);
        return;
      case 'ditado':
        setRodadaDitado(m.rodadas);
        return;
      case 'conectores':
        setRodadaConectores(m.rodadas);
        return;
      case 'karaoke':
        setRodadaKaraoke(m.falas);
        return;
      case 'itens':
        setRodada({ jogo: m.jogo, itens: m.itens });
        return;
    }
  };

  /**
   * MONTAR ≠ COMEÇAR — e essa separação é a antessala inteira.
   *
   * Antes, clicar num jogo montava a rodada e caía direto nela: não havia instante nenhum em que
   * o conteúdo existisse e a pessoa pudesse olhar. Daí as três queixas serem a mesma — "não sei o
   * que vem", "quero repetir esta", "quero pular esta" só têm resposta se a rodada existir ANTES
   * de começar.
   *
   * OS OITO RAMOS MUDARAM DE CASA. A regra de escolha — qual ramo, quais itens, em que ordem, com
   * que prévia — mora agora em `@core/minigames/rodada`, como função PURA que recebe tudo por
   * parâmetro. Aqui sobra o que de fato é da tela: LER o estado do componente, chamá-la, e
   * transformar o material devolvido no `aplicar` que a antessala já esperava. Enquanto ela foi
   * uma closure sobre quinze valores deste arquivo, a regra mais cara da tela era a única sem
   * teste possível — ver `tests/rodadaMontagem.test.ts`, que fixa a saída dos oito ramos.
   *
   * Devolve `null` quando não dá para montar (faltam itens). O `aplicar` é um fecho que guarda a
   * rodada JÁ MONTADA: assim a antessala mostra EXATAMENTE o que vai ser jogado, e não uma amostra
   * parecida — sortear de novo na hora de jogar seria mentir na cara da pessoa.
   *
   * `apenas` restringe o material de partida a um conjunto de `item_ref`. É como "repetir a
   * última" funciona: não pela semente (o baralho e o relógio mudam entre partidas, então a mesma
   * semente daria outra rodada), mas pelos itens que ficaram gravados.
   */
  const montarRodada = (
    jogo: MinigameId,
    semente?: PracticeSeed | null,
    apenas?: ReadonlySet<string>,
    evitarTambem?: ReadonlySet<string>,
  ): RodadaPronta | null => {
    const montada = montarRodadaPura({
      jogo,
      agora: Date.now(),
      jogaveis,
      fonte,
      etapaDaTrilha,
      memoria: historico,
      estrategia,
      faixas,
      cortes: composicao?.cortes,
      /* Injetada, e não lida lá dentro: `decisaoAuto` consulta as precisões no `localStorage` e o
         `ref` da faixa vigente — dois estados de navegador, que não atravessam a fronteira do
         núcleo. Passar a DECISÃO em vez do estado preserva a chamada preguiçosa (ela só acontece
         nos ramos que a usam) sem trazer o storage junto. */
      decisaoAuto,
      vistasRecentes,
      frasesGravadas: frases,
      frasesDaTrilha: frasesTrilha,
      frasesDoAcervo: frasesDoAcervoAtual,
      comTrilha,
      temVoz: temVozOuEscrita,
      /* A tela conhece a URL do blob; o núcleo só precisa saber SE há áudio. */
      temAudio: !!audioParaJogos,
      porPalavra,
      origemDaPalavra,
      tituloDaSessao: sessaoEmUso?.title,
      semente,
      apenas,
      evitarTambem,
    });
    if (!montada) return null;
    /* No headset a Memória fica em 6 pares (grade 4 × 3 sem rolar); a prévia encolhe junto. No computador
       com o desenho novo valem os pares de sempre (a mesa vira 4 × 4, `styles/questJogar.css`). */
    const { jogo: jogoMontado, previa, material } = noHeadsetNovo ? rodadaParaOQuest(montada) : montada;
    return { jogo: jogoMontado, previa, aplicar: () => aplicarMaterial(material) };
  };

  /**
   * Clicou no jogo: monta e ABRE A ANTESSALA — ou começa direto, se a pessoa desligou.
   *
   * O tour da primeira vez só entra quando a partida começa de fato: disparado aqui, ele
   * apontaria para elementos do jogo que ainda não estão na tela.
   */
  const pedirParaJogar = (carta: Pick<JogoUI, 'id'>, forcarAntessala = false, de: TelaDoJogar = 'jogar') => {
    const pronta = montarRodada(carta.id);
    /**
     * CLIQUE MORTO NUNCA MAIS.
     *
     * `montarRodada` devolve `null` quando o material não dá para a rodada, e este `return` era
     * SILENCIOSO: a carta aparecia liberada, o clique não fazia absolutamente nada, e não havia
     * erro em lugar nenhum. Foi assim que o Termo passou meses inacessível — o gate liberava com 3
     * palavras e o montador exigia 7.
     *
     * O gate e o montador agora concordam (ver `rodadasDaEscada` em `@core/minigames/termo`), então
     * esta linha vira rede de segurança e não fluxo normal. Mas ela precisa EXISTIR: o baralho pode
     * mudar entre o cálculo da carta e o clique, e "não aconteceu nada" é a pior resposta possível.
     */
    if (!pronta) {
      toast.error('Não deu para montar esta rodada agora, o material mudou desde que a carta foi calculada.');
      return;
    }
    /* Voltar ao lobby e clicar de novo é corrente NOVA. Sem isto, sair no meio e reentrar mais
       tarde continuaria somando num placar que a pessoa já considera encerrado. */
    const direto = pularSempre && !forcarAntessala;
    trocarTela(de, direto ? 'partida' : 'antessala', () => {
      setSequencia(null);
      if (direto) comecar(pronta);
      else setAntessala(pronta);
    });
    /* A FONTE DA VERDADE É O ESTADO, não o `localStorage`.
       Antes esta linha lia `pularAntessala()` direto do storage enquanto o checkbox espelhava
       `pularSempre`, dois leitores da mesma preferência, que discordavam por um render sempre que
       ela mudava. Agora o storage é só persistência; quem decide é o estado (`direto`, acima). */
  };

  const comecar = (pronta: RodadaPronta) => {
    /* No desenho novo a primeira partida abre a explicação em três telas, na casca da rodada. */
    if (!questNovo && !jaFezTour(pronta.jogo)) setTourDe(pronta.jogo);
    setResultado(null);
    setAntessala(null);
    setSemMaterial(false);
    setUltimaCorrente(null); // começou outra: a pílula da anterior sai da tela
    /* Rodada nova, casca nova: no desenho novo a casca da rodada anterior continua montada na tela de
       fim, e sem a chave nova a contagem e a explicação não recomeçariam. */
    setChaveDaRodada((k) => k + 1);
    pronta.aplicar();
  };

  /* ───────────── A CORRENTE: as três saídas do fim de rodada ─────────────
     Nenhuma delas é código novo de verdade, são as MESMAS chamadas que a antessala já fazia
     ("trocar por outras" e "repetir a última"), agora alcançáveis do outro lado da partida. */

  /**
   * MAIS UMA, com palavras novas. Evita tudo o que já caiu na corrente inteira — e é por isso que
   * `vistosNaSequencia` não tem teto: com o teto de 60 da memória curta, uma corrente longa
   * voltaria a sortear a mesma palavra e o agendador a revisaria de novo, mexendo na estabilidade
   * de um cartão que não foi realmente revisto.
   */
  const continuarSequencia = () => {
    if (!resultado) return;
    const evitar = new Set<string>(sequencia?.vistosNaSequencia ?? []);
    const pronta = montarRodada(resultado.gameId, null, undefined, evitar);
    if (!pronta) {
      setSemMaterial(true);
      return;
    }
    comecar(pronta);
  };

  /**
   * ESTAS MESMAS de novo. Remonta pelos `item_ref` do relatório que acabou de chegar — e NÃO por
   * `ultimaRodada`, que só é recarregada por um efeito assíncrono e pode estar uma rodada
   * atrasada no instante em que a raspadinha aparece. É a mesma correção de corrida que a
   * antessala não tem.
   */
  const refsDoResultado = resultado ? resultado.items.map((o) => o.itemRef).filter((r): r is string => !!r) : [];
  const repetirSequencia = () => {
    if (!resultado || !refsDoResultado.length) return;
    const pronta = montarRodada(resultado.gameId, null, new Set(refsDoResultado));
    if (pronta) comecar(pronta);
  };

  const sairDaSequencia = () => {
    setResultado(null);
    encerrarCorrente();
    setSemMaterial(false);
  };

  /**
   * "JOGAR DE NOVO" da tela de fim do desenho novo (`data-acao="recomecar"`, `jogos.js:318, 369`): outra
   * rodada deste jogo. Palavras novas enquanto houver; acabou o material, as mesmas; e se nem isso der,
   * a pessoa fica sabendo em vez de o botão não fazer nada.
   */
  const jogarDeNovo = () => {
    if (!resultado) return;
    const nova =
      montarRodada(resultado.gameId, null, undefined, new Set<string>(sequencia?.vistosNaSequencia ?? [])) ??
      (refsDoResultado.length ? montarRodada(resultado.gameId, null, new Set(refsDoResultado)) : null);
    if (nova) comecar(nova);
    else toast.warn(t('Acabaram as palavras elegíveis desta fonte por agora. Volte aos jogos para trocar de fonte.'));
  };

  /**
   * O SINK DAS SEEDS — "trocar mantendo o combo".
   *
   * A mecânica: `continuarSequencia` já dá palavras novas, mas o combo só sobrevive se a rodada
   * anterior tiver terminado em acerto. Aqui a pessoa PAGA para atravessar um lote que não quer
   * (difícil demais, ou repetido) sem perder o ×N que levou várias rodadas para construir. É a
   * decisão que dá tensão à moeda — guardar ou gastar — em vez de um cosmético.
   *
   * A COBRANÇA VEM ANTES DA ENTREGA, e o `spendId` é gerado UMA vez por clique: o botão vive numa
   * tela onde se clica rápido, e sem idempotência o duplo-clique cobraria duas vezes. Se o débito
   * falhar (rede, saldo), nada é entregue — degradar em silêncio aqui seria dar o item de graça.
   */
  const CUSTO_PULAR = 40; // economia v2: subiu com a Loja (≈ metade de um dia ativo)
  const pularVez = async () => {
    if (!resultado || !sequencia || saldoSeeds < CUSTO_PULAR || gastando) return;
    setGastando(true);
    try {
      const spendId = `pular-${resultado.gameId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { resultado: r, erro } = await gastarSeedsEx({
        spendId,
        amount: CUSTO_PULAR,
        reason: 'pular-rodada',
        ref: resultado.gameId,
      });
      if (!r) {
        /* O MOTIVO, quando o servidor manda um (achado A30). "Não consegui gastar as seeds agora"
           era a mesma frase para rede fora, saldo insuficiente e preço divergente — e no caso do
           saldo o servidor diz exatamente quantas faltam. */
        const falta = erro?.code === 'saldo_insuficiente' ? Number(erro.detalhes?.falta ?? 0) : 0;
        toast.error(
          falta > 0
            ? t('Faltam {n} seeds para pular esta rodada. Nada foi cobrado.', { n: numero(falta) })
            : t('Não consegui gastar as seeds agora, nada foi cobrado.'),
        );
        return;
      }
      /* O servidor é a autoridade sobre o saldo, mas `progress` só se atualiza quando as métricas
         forem recarregadas pelo App. Este desconto local existe para o número na tela não mentir
         no instante seguinte ao clique, e para não deixar gastar duas vezes o que já não há. */
      setGastasLocais((g) => g + CUSTO_PULAR);
    } finally {
      setGastando(false);
    }
    const evitar = new Set<string>(sequencia.vistosNaSequencia);
    const pronta = montarRodada(resultado.gameId, null, undefined, evitar);
    if (!pronta) {
      setSemMaterial(true);
      return;
    }
    /* O COMBO SOBREVIVE: `comecar` não mexe em `sequencia`, e `sequenciaAtual` é o que a próxima
       rodada herda como `sequenciaInicial`. Era exatamente isto que foi comprado. */
    comecar(pronta);
  };

  /**
   * FIM DA RODADA — onde o jogo vira memória de verdade.
   *
   * A REGRA ANTI-DUPLA-CONTAGEM: cada item gera **ou** uma revisão no agendador **ou** um
   * resultado contável, nunca os dois. Um item com cartão vira `reviewCard` (que já entra no XP
   * do perfil via `review_logs`) e grava `kind: 'srs'` só como telemetria; um item sem cartão —
   * vindo de fala, sem lastro no baralho — grava `kind: 'drill'`, que é o que o cálculo de XP
   * conta. Sem esse discriminador, jogar inflaria o XP duas vezes e a curva de nível viraria ruído.
   */
  const aoTerminar = async (report: RoundReport) => {
    setResultado(report);
    setTotalDoFim(
      rodada?.itens.length ??
        rodadaTermo?.length ??
        rodadaFrase?.length ??
        rodadaKaraoke?.length ??
        rodadaEscuta?.length ??
        rodadaDitado?.length ??
        rodadaConectores?.length ??
        report.items.length,
    );
    setGravacaoDaRodada('pendente');
    setRodada(null);
    setRodadaTermo(null);
    setRodadaFrase(null);
    setRodadaKaraoke(null);
    setRodadaEscuta(null);
    setRodadaDitado(null);
    setRodadaConectores(null);
    const def = MINIGAMES[report.gameId];
    /* Alimenta a memória curta com o que acabou de cair. O teto existe para a lista não virar o
       baralho inteiro numa maratona, aí ela deixaria de despriorizar coisa nenhuma. */
    /* SELEÇÃO v2: a memória curta agora PERSISTE por origem (sobrevive ao F5, teto 200), e a
       precisão desta rodada alimenta o modo Auto deste jogo. */
    {
      const origemDaRodada = chaveDaMemoriaCurta(fonte, baralhoAnki);
      const refs = report.items.map((o) => o.itemRef).filter((r): r is string => !!r);
      registrarVistas(origemDaRodada, refs);
      setVistasRecentes(vistasGuardadas(origemDaRodada));
      const total = report.items.length;
      const certos = report.items.filter((o) => o.correct && !o.revealed).length;
      if (total > 0) registrarPrecisao(report.gameId, (certos / total) * 100);
    }
    /**
     * A RODADA PASSA A TER NOME E OS ITENS, IDENTIDADE.
     *
     * Antes, cada item virava uma linha com `{kind, exerciseKind, correct, score}` e nada mais —
     * oito itens de uma partida davam oito linhas mutuamente indistinguíveis, gravadas em
     * `Promise.all` (colidem no mesmo milissegundo, então nem a ordem salvava). Era impossível
     * dizer quais palavras apareceram numa rodada passada, e é isso que impedia o app de mostrar
     * o que vem, de repetir uma rodada e de evitar repetição.
     *
     * `attempts`, `ms` e `hinted` o `ItemOutcome` já media e o POST jogava fora.
     */
    const roundId = `${report.gameId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const origem =
      fonte.id === 'sessao'
        ? `sessao:${fonte.sessionId ?? ''}`
        : fonte.id === 'trilha'
          ? `trilha:${fonte.nivel ?? ''}`
          : fonte.id === 'dificeis'
            ? 'dificeis'
            : 'baralho';

    /**
     * A CORRENTE SOMA ESTA RODADA.
     *
     * O combo entra herdado (`sequenciaInicial`) e sai atualizado — é o que faz emendar valer mais
     * do que jogar as mesmas rodadas soltas. `acumular` decide sozinho se continua ou recomeça:
     * jogo diferente ou fonte diferente zeram o placar, e é esse guard que impede uma corrente de
     * trilha de continuar contando numa corrente de sessão.
     *
     * `report.score` foi calculado pelo jogo SEM saber da corrente; o número que a tela e o
     * recorde usam é este, que sabe.
     */
    const herdado = mesmaCorrente(sequencia, report.gameId, origem) ? sequencia!.sequenciaAtual : 0;
    const pontos = pontuarRodada(report.gameId, report.items, { sequenciaInicial: herdado });
    const corrente = acumular(sequencia, report, pontos, origem, xpFromRound(report));
    setSequencia(corrente);
    /* O GANHO DE MAESTRIA desta rodada, com a MESMA conta que o servidor refaz sobre as linhas que
       vão ser gravadas logo abaixo: acertos (`correct: 1`), itens e o combo gravado como
       `melhorSequencia`. Antes do primeiro `await`, para chegar junto com o resultado na tela. */
    setMaestriaDaRodada(
      maestria
        ? {
            pontosAntes: maestria.get(report.gameId) ?? 0,
            ganho: pontosDeMaestria({
              acertos: report.items.filter((o) => o.correct).length,
              total: report.items.length,
              comboMaximo: pontos.melhorSequencia,
            }),
          }
        : null,
    );
    /* O RESUMO NÃO É LIGADO AQUI — e era esse o defeito.
       `resultado` e `verResumo` viravam verdadeiros no MESMO render, e a cascata testa
       `resultado && verResumo` ANTES de `resultado`: o resumo assumia a posição da raspadinha, e
       ela nunca aparecia. O comentário do próprio ramo já dizia "passo 2, DEPOIS da raspadinha".
       Agora a raspadinha vem primeiro (é o único clímax de recompensa do app) e o resumo é uma
       porta dela, oferecida só quando houve erro — ver `onVerErros`. */
    /* Uma falha por ITEM, avisada UMA vez por RODADA. Vinte avisos iguais numa rodada de duelo
       relâmpago seriam ruído; um aviso com a causa é o que faz a próxima falha ser notada em vez
       de sumir como esta sumiu por anos. */
    /* UMA REQUISIÇÃO POR RODADA (F3), não uma por item.
       `sessionId` amarra o resultado à gravação quando se joga a partir dela. E `cardId` agora
       viaja junto: `itemRef` guarda a PALAVRA, e por isso só 14,9% dos resultados no banco real
       eram correlacionáveis a um cartão, nenhum por id. Sem a referência, desempenho não
       realimenta a dificuldade. */
    const daSessao = fonte.id === 'sessao' ? fonte.sessionId : undefined;
    const itens = report.items.map((o) => ({
      cardId: o.cardId ?? undefined,
      itemRef: o.itemRef,
      correct: o.correct ? 1 : 0,
      attempts: o.attempts,
      ms: o.ms,
      hinted: o.hinted ? 1 : 0,
      kind: o.cardId && def.writesSrs ? 'srs' : 'drill',
    }));

    // O FSRS continua item a item: é ele que reagenda cada cartão, e a nota depende do item.
    const falhas: string[] = [];
    /* A RESPOSTA DO `reviewCard` É O CARTÃO ATUALIZADO — e ela era jogada fora.
       Guardá-la é o que permite não rebaixar o baralho inteiro no fim da rodada (ver o final
       desta função). O servidor já devolve a linha completa, com procedência. */
    const atualizados: VocabCard[] = [];
    /** Cartas CRIADAS pela promoção da trilha, que também precisam entrar no baralho local. */
    const promovidos: VocabCard[] = [];
    for (const o of report.items) {
      if (!o.cardId || !def.writesSrs) continue;
      try {
        atualizados.push(await reviewCard(o.cardId, gradeFor(report.gameId, o)));
      } catch (e) {
        falhas.push(`srs ${o.itemRef}: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
      }
    }

    const gravacao = await salvarRodada({
      melhorSequencia: pontos.melhorSequencia,
      duracaoMs: Number.isFinite(report.durationMs)
        ? Math.min(86_400_000, Math.max(0, Math.round(report.durationMs)))
        : undefined,
      roundId,
      exerciseKind: report.gameId,
      origem,
      sessionId: daSessao,
      score: report.score,
      itens,
    });
    if (!gravacao.ok) falhas.push(`${gravacao.status ?? 'rede'}: ${gravacao.motivo}`);
    /* EXIBIDO = CREDITADO: sem a rodada gravada o servidor não creditou Seeds, XP, maestria nem
       baú — o fim da rodada troca o prêmio por "nada foi creditado". */
    setGravacaoDaRodada(gravacao.ok ? 'ok' : 'falhou');
    /* ECONOMIA v2: a rodada gravada muda Seeds/XP (acertos, rodada perfeita) e pode fechar uma
       conquista. O App recarrega as métricas ao ouvir isto — antes só recarregava quando a lista
       de sessões mudava, e o saldo ficava uma rodada atrás. */
    if (gravacao.ok) window.dispatchEvent(new CustomEvent('babel:metricas-mudaram'));
    /* MAESTRIA: com a rodada gravada, relê os pontos do servidor e pede o crédito dos níveis novos. */
    if (gravacao.ok) {
      void sincronizarMaestria().then((jogos) => {
        if (jogos) setMaestria(pontosPorJogo(jogos));
      });
    }

    /* O BAU DA RODADA. Pedido so depois de a rodada existir no servidor: e a pre-condicao que a
       rota confere (`rodada_inexistente`). Quem sorteia e o servidor; aqui so se anuncia. Falha
       fica em silencio de proposito — perder o bau nao pode custar a rodada. */
    /* O BAÚ EXIGE DUAS ESTRELAS (`rodadaRendeBau`, a mesma régua que o servidor confere nas linhas
       gravadas): rodada abaixo disso nem pede — o servidor recusaria com `rodada_sem_bau`. */
    if (gravacao.ok && rodadaRendeBau(itens).rende) {
      void creditarSeeds({ creditoId: `drop:${roundId}` }).then((r) => {
        if (!r || r.jaExistia) return;
        /* `item: null` = coleção completa: nada a sortear. Antes isto sumia em silêncio; agora
           vai com `itemId: null`, e o App avisa (uma vez por sessão) em vez de calar. */
        /* `seedsCreditadas` e o TOTAL acumulado da conta, nao o que ESTE credito valeu — a tela
           anunciava "+2049 Seeds" pelo bau. Quanto o bau paga e regra, e a regra mora no core. */
        window.dispatchEvent(
          new CustomEvent<DetalheDoDrop>(EVENTO_DROP_GANHO, {
            /* BAÚ v2: o servidor diz quanto ESTE baú pagou (peça: SEEDS_DO_DROP; repetido: 15/40),
               as chances e quantos faltam para o raro garantido; o teto do dia vem em `semBau`. */
            detail: {
              roundId,
              itemId: r.item ?? null,
              seeds: r.seeds ?? (r.item ? SEEDS_DO_DROP : 0),
              repetido: r.repetido,
              raridade: r.raridade,
              chances: r.chances,
              proximoRaroGarantidoEm: r.proximoRaroGarantidoEm,
              semBau: r.semBau,
              limite: r.limite,
            },
          }),
        );
      });
    }

    if (falhas.length) {
      /* ANTES ISTO ERA SÓ UM console.warn: a rodada sumia e o usuário nunca sabia. Um erro que o
         usuário não vê é um erro que ninguém corrige. */
      console.warn(`[jogos] rodada ${roundId} não foi gravada por inteiro. Causa: ${falhas[0]}`);
      toast.error(
        gravacao.ok
          ? 'Não consegui salvar esta rodada. O placar vale, mas o histórico não foi gravado.'
          : 'Não foi possível salvar esta rodada — nada foi creditado. O placar vale.',
      );
    }
    /**
     * A TRILHA GUARDA O QUE VOCÊ ERROU — e só isso.
     *
     * Os cartões da trilha nascem em memória, sem `id`, então não existem no banco e não têm
     * agendamento. Guardar TODOS os que aparecem numa rodada encheria "Minhas palavras" com 827
     * palavras do A1 e afogaria o que a pessoa capturou de verdade; não guardar nenhum jogaria
     * fora justamente a informação que a revisão espaçada existe para usar. O erro é o sinal:
     * a palavra que escapou é a que precisa voltar.
     *
     * Roda DEPOIS de a rodada terminar e sem travar a tela — se a rede falhar, perde-se uma
     * promoção, não a partida.
     */
    /* F26 — A GLOSA É DE UM PAR, e promover ignorando isso corrompe o banco. A trilha do inglês
       traz tradução PORTUGUESA embutida; para quem estuda com nativo espanhol, gravá-la como
       `tgtLang: 'es'` produz um cartão que afirma ser espanhol e é português. O índice diz para
       quais nativos existe glosa; fora deles a rodada joga, mas não promove. */
    const paresDaTrilha = entradaDaTrilha?.glosas ?? [];
    const glosaDoNativo = paresDaTrilha.includes(baseLang(idiomaNativo));

    if (fonte.id === 'trilha' && fonte.nivel && glosaDoNativo) {
      /* `Set` na itemRef: um jogo pode apresentar a MESMA palavra mais de uma vez na rodada (o
         Duelo sorteia distratores do próprio lote), e sem isto o lote sairia com a palavra
         repetida. O servidor deduplica e não criaria linha dupla, mas mandar duas é pedir para
         ele recusar uma e contar como "pulada", um número errado por culpa nossa. */
      const vistas = new Set<string>();
      const errados = report.items.filter((o) => {
        if (o.correct || o.cardId || !o.itemRef) return false;
        const k = o.itemRef.toLowerCase();
        if (vistas.has(k)) return false;
        /* E ESTE `Set` atravessa a corrente. O de cima só deduplica DENTRO de uma rodada; numa
           sequência encadeada, errar a mesma palavra em duas rodadas seguidas, antes de o
           `fetchDeck` lá embaixo voltar do servidor, criaria a mesma carta duas vezes, porque a
           segunda ainda veria `!c.id`. */
        if (corrente.jaPromovidas.has(k)) return false;
        vistas.add(k);
        return true;
      });
      /* F26: `fonte.nivel` só é CEFR quando a trilha do idioma foi medida por linguista. Numa
         trilha por frequência os mesmos seis rótulos são faixas de corpus, e gravá-los como CEFR
         curado com confiança 1 plantaria um dado falso no banco. */
      const curado = escalaDe(fonte.lang) === 'cefr';
      const novos = errados
        .map((o) => porPalavra.get((o.itemRef ?? '').toLowerCase()))
        .filter((c): c is VocabCard => !!c && !c.id)
        // Sem glosa do par não há pista: o cartão jogaria, mas nasceria mudo no baralho.
        .filter((c) => !!c.translation?.trim())
        .map((c) => ({
          word: c.word,
          back: c.translation,
          srcLang: c.srcLang,
          tgtLang: idiomaNativo,
          sessionId: SESSAO_DA_TRILHA(fonte.lang),
          cefrLevel: curado ? fonte.nivel : null,
          cefrConfidence: curado ? CONFIANCA_CURADA : 0,
        }));
      if (novos.length) {
        try {
          const criados = await bulkAddCards(novos);
          promovidos.push(...criados.cards);
          setSequencia((s) =>
            s
              ? marcarPromovidas(
                  s,
                  novos.map((n) => n.word.toLowerCase()),
                )
              : s,
          );
        } catch {
          /* a promoção é um bônus, não a partida */
        }
      }
    }

    /**
     * O BARALHO SE ATUALIZA COM O QUE VOLTOU, e não baixando tudo de novo.
     *
     * Aqui havia `setDeck(await fetchDeck())` — o baralho INTEIRO, a cada rodada. Medido na
     * auditoria de 2026-09-07 (seção 5): `GET /api/vocab` são 2,27 MB (189 KB gzip) e 152 ms
     * neste acervo de 2.818 cartões. Uma sequência de dez rodadas baixava 22 MB para atualizar a
     * data de revisão de algumas dezenas de cartas.
     *
     * As cartas que mudaram já vieram na resposta de cada `reviewCard` e do `bulkAddCards` — o
     * servidor devolve a linha atualizada, e essa resposta estava sendo descartada. O que sobra é
     * costurar: substituir as tocadas, acrescentar as novas.
     */
    if (atualizados.length || promovidos.length) {
      setDeck((anterior) => {
        /* `anterior!`: aqui já houve uma rodada, então o baralho carregou. A afirmação mantém o
           comportamento de hoje — com `deck` nulo isto estoura, e trocar por `?? []` apagaria o
           baralho inteiro em vez de estourar. */
        const porId = new Map(anterior!.map((c) => [c.id, c]));
        for (const c of [...atualizados, ...promovidos]) porId.set(c.id, c);
        return [...porId.values()].filter((c) => c.inDeck);
      });
    }
  };

  /**
   * BARALHO E IDIOMA CHEGAM JUNTOS — as duas buscas em paralelo, um commit só.
   *
   * ERA UMA CORRENTE: `await fetchDeck()` → `setDeck` → `await fetchLangConfig()` (que por dentro
   * já é um `fetchSettings`) → `await fetchSettings()` de novo → `setFonte({ lang })`. Como o
   * baralho chegava PRIMEIRO e o idioma DEPOIS, o pipeline desta tela rodava duas vezes por carga,
   * e a primeira com `lang: ''` — isto é, sem filtro de idioma, triando e medindo o baralho
   * inteiro. MEDIDO neste banco (contador de `lib/passadasDoPipeline`, 3 execuções, build de
   * produção, CPU 4x): a passada jogada fora triava 2.157 cartões e rodava o gate dos nove jogos
   * sobre 2.066 — para ser substituída ~1 s depois pela passada certa, com 1.142.
   *
   * O CUSTO NÃO ERA SÓ DE CPU: ela ia à tela. Amostrando o DOM a cada 50 ms, havia uma janela de
   * ~280 ms em que a pessoa lia "2.066 palavras", "91 ficaram de fora" e "Ainda não há palavras no
   * seu caderno" no seletor de idioma — números do baralho misturado, que depois trocavam para
   * 1.142 e 22. Não era só trabalho desperdiçado, era número errado exibido.
   *
   * UM `fetchSettings` SÓ, e não dois: `langConfigFrom` extrai a configuração de um `AppSettings`
   * já carregado, e existe exatamente para isso. Além de poupar uma ida à rede, o idioma que se
   * estuda e a preferência `praticaLang` passam a vir do MESMO retrato — lidos em duas requisições,
   * podiam divergir se a gravação acontecesse entre elas.
   *
   * FALHA DE UM NÃO DERRUBA O OUTRO: cada busca tem o seu `catch`, como antes. Sem preferência, o
   * idioma cai no padrão de `langConfigFrom` — o mesmo comportamento de antes, porque
   * `fetchSettings` já engolia o erro e devolvia `null`.
   */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const [baralho, ajustes] = await Promise.all([
        fetchDeck()
          .then((cards) => ({ cards, erro: null as string | null }))
          .catch((e: unknown) => ({ cards: null, erro: (e as Error).message })),
        fetchSettings().catch(() => null),
      ]);
      if (cancelado) return;

      let ui: Record<string, unknown>;
      try {
        ui = ajustes?.ui ? (JSON.parse(ajustes.ui) as Record<string, unknown>) : {};
      } catch {
        ui = {};
      }
      const cfg = langConfigFrom(ui, ajustes?.targetLanguage);
      /* UMA FONTE PARA O ALVO. Havia `ui.praticaLang` aqui, gravado por esta tela, ao lado de
         `settings.targetLanguage`, gravado por Ajustes — dois campos respondendo "que idioma você
         estuda", e no banco real eles divergiam ('pt-BR' contra 'en'). Quem trocasse o idioma aqui
         não via a troca em Ajustes, e vice-versa. Agora esta tela lê e escreve o mesmo campo que
         todas as outras (auditoria de 2026-09-07, achado A38). */
      const lang = baseLang(cfg.studying);

      /* React 19 agrupa estes `setState` num render só (batching automático também fora de
         eventos), e é disso que depende o ganho: separados, voltariam a ser duas passadas. */
      if (baralho.cards) setDeck(baralho.cards.filter((c) => c.inDeck));
      else setErro(baralho.erro);
      setFonte((f) => (f.lang === lang ? f : { ...f, lang }));
      setIdiomaNativo(baseLang(cfg.mine));
    })();
    return () => {
      cancelado = true;
    };
    // setFonte é useCallback estável; entra na lista só para o linter dizer a verdade.
  }, [setFonte]);

  /**
   * "Tentar de novo" (o aviso do lobby do headset quando o baralho não carregou): só o baralho, que é o
   * que falhou. Sem erro e sem baralho a tela volta à espera, e sai dela com a resposta.
   */
  const recarregarBaralho = async () => {
    setErro(null);
    try {
      setDeck((await fetchDeck()).filter((c) => c.inDeck));
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  /**
   * A FONTE VOLTA COMO ESTAVA — uma vez só, e nunca dentro de uma sessão.
   *
   * Espera as gravações carregarem porque a escolha "uma gravação" guarda um id, e esse id precisa
   * ser conferido contra o que ainda existe: apagada noutro dispositivo, ela restauraria uma fonte
   * vazia sem dizer por quê. `lerFonteGuardada` faz essa validação e cai para "todas".
   *
   * EMBUTIDO NÃO RESTAURA NADA. Ali a fonte É a gravação aberta; trazer de volta "trilha B1"
   * sequestraria a aba de jogos da sessão para outro material.
   *
   * O `ref` garante uma vez só: sem ele, cada recarga da lista de gravações desfaria a escolha que
   * a pessoa acabou de fazer na sala.
   */
  const fonteRestaurada = React.useRef(false);
  useEffect(() => {
    /* Espera TAMBÉM os baralhos: o filtro guardado pode recortar por deck, e restaurar antes da
       lista chegar apagaria o recorte no saneamento (deck "inexistente" só porque ainda não veio). */
    if (embutido || fonteRestaurada.current || !sessoesCarregadas || !decksCarregados) return;
    fonteRestaurada.current = true;
    /* A URL VENCE A MEMÓRIA: um link compartilhado com `?fonte=…` é uma escolha EXPLÍCITA de quem
       o abriu agora; a chave local é a escolha de ontem. Sem query de filtro na barra (o caso
       normal), `filtroDaQuery` devolve null e a persistência decide como sempre. */
    /* A query viva na barra vence; sem ela, vale a capturada no BOOT do módulo — a dança de
       inicialização do App (efeito "navegação → URL" rodando uma vez com a view antiga) reescreve
       a barra antes de este componente montar, e o caminho volta na passada seguinte mas a query
       não. Consumo único: um link vale para ESTA abertura, não para toda troca de aba futura. */
    const daUrl = filtroDaQuery(
      lerUrlAtual().jogarQuery ?? consumirQueryDoBoot(),
      sessoes.map((s) => s.id),
      decksAnki.map((d) => d.id),
    );
    const guardado =
      daUrl ??
      lerFiltroGuardado(
        sessoes.map((s) => s.id),
        decksAnki.map((d) => d.id),
      );
    /* RESTAURAR O MESMO FILTRO NÃO É MUDAR DE FILTRO: devolver `prev` aborta a atualização e poupa
       uma passada inteira do pipeline (triagem, composição, gate) — a mesma economia que a
       restauração de fonte já tinha, mantida aqui. O idioma NÃO vem do guardado: chega pelo
       carregador de settings (preferência de perfil, atravessa dispositivos) e o merge preserva o
       que já estiver no estado. */
    setFiltro((prev) => {
      // Idioma explícito na URL também vence; o guardado local nunca vence o de settings (perfil).
      const idiomas = daUrl?.idiomas.length ? daUrl.idiomas : prev.idiomas.length ? prev.idiomas : guardado.idiomas;
      const restaurado = { ...guardado, idiomas };
      return JSON.stringify(restaurado) === JSON.stringify(prev) ? prev : restaurado;
    });
  }, [embutido, sessoes, sessoesCarregadas, decksCarregados, decksAnki]);

  /* FONTE 'dificeis' SEM MATERIAL degrada para o baralho — o ranking guardado ontem pode ter
     esvaziado hoje (revisar bem TIRA palavra do ranking, que é o objetivo). Só age com as
     métricas carregadas: antes disso, ranking vazio significa "ainda não sei". */
  useEffect(() => {
    if (!metrics || fonte.id !== 'dificeis' || rankingDeDificeis.length >= 4) return;
    setFonte((f) => ({ id: 'baralho', lang: f.lang }));
  }, [metrics, fonte.id, rankingDeDificeis.length, setFonte]);

  /**
   * Falas para os jogos de frase. Quando se chega por uma sessão, são as DAQUELA sessão; senão, a
   * gravação mais recente com áudio. Falha aqui não impede os jogos de baralho: são independentes.
   */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const lista = await fetchSessions();
        if (cancelado) return;
        setSessoes(lista.map((x) => ({ id: x.id, title: x.title, audioUrl: x.audioUrl ?? undefined })));
        setSessoesCarregadas(true);

        /* A gravação de onde se veio vence o palpite do código — e o palpite continua sendo dito
           na tela, nunca silencioso. O ramo de "escolha manual" saiu junto com a lista de
           gravações inalcançável: quem escolhe a gravação hoje é a Sala, por `fonte.sessionId`. */
        const escolhida = recording?.id ? lista.find((x) => x.id === recording.id) : undefined;
        const alvo = escolhida ?? (recording?.id ? undefined : (lista.find((x) => x.audioUrl) ?? lista[0]));
        const alvoId = alvo?.id ?? recording?.id ?? '';
        const alvoAudio = alvo?.audioUrl ?? recording?.audioUrl ?? '';
        if (!alvoId) return;

        const { utterances } = await fetchSessionTranscript(alvoId);
        if (cancelado) return;
        setFrases(toSentences(utterances));
        setAudioSessao(alvoAudio);
        setIdDoAudio(alvoAudio ? alvoId : null);
        setSessaoEmUso({ id: alvoId, title: alvo?.title ?? tituloRef.current ?? 'sessão' });
      } catch {
        /* Sem sessão os jogos de frase ficam bloqueados com o motivo. E a busca terminou:
           quem espera por ela (a restauração da fonte) não pode ficar esperando para sempre. */
        if (!cancelado) setSessoesCarregadas(true);
      }
    })();
    return () => {
      cancelado = true;
    };
    /* `recording?.title` é lido por REF de propósito, e não como dependência: ele só serve de
       fallback para quando a sessão não aparece na lista, e colocá-lo aqui faria uma simples
       RENOMEAÇÃO refazer a busca do transcrito na rede. A atualização do rótulo é o efeito abaixo. */
  }, [recording?.id, recording?.audioUrl]);

  /** Espelho do título para o efeito acima poder lê-lo sem depender dele. */
  useEffect(() => {
    tituloRef.current = recording?.title;
  }, [recording?.title]);

  /**
   * RENOMEAR A SESSÃO ATUALIZA O RÓTULO — sem ir à rede.
   *
   * `sessaoEmUso.title` era gravado uma vez, dentro do efeito que busca o transcrito. Como aquele
   * efeito não reage ao título, renomear a sessão na Análise deixava o nome ANTIGO aqui, e o
   * `alvo.title` que o alimentou veio de uma busca feita antes da renomeação. Dois nomes para a
   * mesma sessão, e o errado é o que aparece na tela de Jogar.
   */
  useEffect(() => {
    const t = recording?.title;
    if (!recording?.id || !t) return;
    setSessaoEmUso((s) => (s && s.id === recording.id && s.title !== t ? { ...s, title: t } : s));
  }, [recording?.id, recording?.title]);

  // Chegar pela Análise já entra no modo sessão — senão o botão "Jogar com esta sessão" mentiria.
  // Já estando nessa sessão, o estado fica como está: um objeto novo com os mesmos valores custa
  // uma passada inteira do pipeline (ver `mesmaFonte`).
  useEffect(() => {
    if (recording?.id) {
      setFonte((f) =>
        f.id === 'sessao' && f.sessionId === recording.id ? f : { ...f, id: 'sessao', sessionId: recording.id },
      );
    }
  }, [recording?.id, setFonte]);

  /**
   * A SESSÃO JOGA NO IDIOMA DELA (auditoria 2026-09-26, idioma da sessão).
   *
   * Dentro de uma gravação, o idioma da rodada era o que a pessoa ESTUDA (`cfg.studying`), e a
   * triagem jogava para "outro idioma" tudo que não fosse ele: a sessão em português, com os cartões
   * agora etiquetados em português, abriria sem jogo nenhum. O idioma vem dos CARTÕES que saíram da
   * sessão (o que ela entregou) e, sem eles, do idioma gravado na sessão.
   */
  useEffect(() => {
    if (!recording?.id || deck === null) return;
    const daSessao =
      idiomaDominanteDosCartoes(deck.filter((c) => c.sourceSessionId === recording.id)) ||
      baseLang(recording.idioma ?? '');
    if (daSessao) setFonte((f) => (baseLang(f.lang) === daSessao ? f : { ...f, lang: daSessao }));
  }, [recording?.id, recording?.idioma, deck, setFonte]);

  /** A `origem` como ela é gravada em `exercise_results` — precisa casar com o que o fim de
   *  rodada escreve, senão o histórico da fonte errada apareceria na antessala. */
  const origemAtual =
    fonte.id === 'sessao'
      ? `sessao:${fonte.sessionId ?? ''}`
      : fonte.id === 'trilha'
        ? `trilha:${fonte.nivel ?? ''}`
        : fonte.id === 'dificeis'
          ? 'dificeis'
          : 'baralho';

  /**
   * O PERCURSO desta fonte: como cada item foi, e o que caiu na última rodada de cada jogo.
   *
   * Recarrega quando a fonte muda e quando uma rodada termina (`resultado`) — sem o segundo, a
   * antessala seguinte mostraria "nunca viu" para o que você acabou de jogar.
   */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      /* Os recordes entram NESTE efeito, e não num novo: ele já é disparado por `[origemAtual,
         resultado]`, exatamente quando a fonte muda e quando uma rodada pôde ter batido um
         recorde. Um efeito próprio duplicaria a lógica de quando recarregar. */
      const [hist, linhas, recs] = await Promise.all([
        fetchHistoricoDeItens({ origem: origemAtual }),
        fetchExerciseResults(undefined, { origem: origemAtual }),
        fetchRecordes({ origem: origemAtual }),
      ]);
      if (cancelado) return;
      setHistorico(new Map(hist.map((h) => [h.itemRef, h])));
      setRecordes(new Map(recs.map((r) => [r.exerciseKind, r.melhorPontos])));

      /* Os tempos MEDIDOS por item, para a antessala poder dizer "leva uns 4 minutos" sem chutar.
         `ms` é gravado desde a migração 0001 e nunca tinha sido lido de volta. Quem decide se há
         amostra suficiente é `@core/minigames/duracao`, aqui só se junta o que existe. */
      setTemposMedidos(linhas.map((l) => l.ms).filter((ms): ms is number => typeof ms === 'number'));

      /* A última rodada de CADA jogo nesta fonte. As linhas vêm mais recentes primeiro, então a
         primeira `roundId` que aparece para um jogo é a mais nova, e só ela interessa. */
      const porJogo = new Map<string, string[]>();
      const rodadaEscolhida = new Map<string, string>();
      for (const l of linhas) {
        const jogo = l.exerciseKind,
          rid = l.roundId,
          ref = l.itemRef;
        if (!jogo || !rid || !ref || l.origem !== origemAtual) continue;
        if (!rodadaEscolhida.has(jogo)) rodadaEscolhida.set(jogo, rid);
        if (rodadaEscolhida.get(jogo) !== rid) continue;
        const lista = porJogo.get(jogo) ?? [];
        if (!lista.includes(ref)) lista.push(ref);
        porJogo.set(jogo, lista);
      }
      setUltimaRodada(porJogo);
      setLinhasDaFonte(linhas);

      const comIdentidade = linhas.filter((l) => l.roundId && typeof l.createdAt === 'number');
      setHistoricoDesde(comIdentidade.length ? Math.min(...comIdentidade.map((l) => l.createdAt as number)) : null);
    })();
    return () => {
      cancelado = true;
    };
  }, [origemAtual, resultado]);

  /* Trocar de fonte é começar outro assunto — a memória curta da fonte anterior não se aplica.
     A corrente cai junto, e pela mesma razão: um placar de trilha continuando numa corrente de
     sessão gravaria o recorde na `origem` errada. (`acumular` já tem o guard como cinto; isto é a
     suspensória, para o placar sumir da tela no instante da troca, e não só na rodada seguinte.) */
  useEffect(() => {
    /* Trocar de BARALHO também é trocar de assunto (auditoria S6): sem o `baralhoAnki` na chave e
       na dependência, a troca não zerava as vistas nem a corrente — o placar de um baralho
       continuava numa rodada do outro. */
    const origemDaFonte = chaveDaMemoriaCurta(fonte, baralhoAnki);
    setVistasRecentes(vistasGuardadas(origemDaFonte));
    setSequencia(null);
  }, [fonte, baralhoAnki]);

  const trocarIdioma = (lang: string) => {
    setFonte((f) => ({ ...f, lang }));
    // Trocar o idioma da prática É trocar o idioma que se estuda — mesmo campo, uma escrita só.
    void saveLangConfig({ studying: lang }).catch(() => {
      /* preferência é conveniência */
    });
  };

  /**
   * A escolha da sala vira fonte — e fica GUARDADA.
   *
   * Duas persistências distintas de propósito: o idioma é preferência de perfil e vai para o
   * servidor (`settings.targetLanguage`, atravessa dispositivos); a fonte é contexto de trabalho
   * local e vai para o `localStorage`. Antes, NADA da fonte sobrevivia a um F5 — quem escolhia
   * "Trilha B1" voltava para "Minhas palavras" sem aviso.
   */
  const aplicarEscolha = (escolha: EscolhaDaPratica) => {
    if (baseLang(escolha.lang) !== baseLang(fonte.lang)) trocarIdioma(escolha.lang);
    /* A TRILHA NÃO ATRAVESSA IDIOMA. Sair do inglês com a fonte trilha marcada deixava a tela
       anunciando "Curso de palavras · japonês · 0 palavras", sem jogo nenhum e sem dizer por quê.
       A Sala já caía para as gravações nesse caso; a gaveta e o recorte por baralho, não. */
    const semTrilha = escolha.origem === 'trilha' && !indiceDaTrilha()[baseLang(escolha.lang)];
    setFonte(fonteDaEscolha(semTrilha ? { ...escolha, origem: 'gravacoes', nivel: undefined } : escolha));
    // A persistência mudou de lugar: um efeito grava o FILTRO inteiro a cada mudança (e espelha a
    // chave legada) — antes, só a escolha da Sala sobrevivia ao F5; o recorte por baralho evaporava.
  };

  /* GRAVAR SÓ DEPOIS DE RESTAURAR: sem a guarda, o primeiro render (filtro padrão) sobrescreveria
     o que a pessoa tinha guardado antes de a restauração rodar. Embutido não persiste nada — ali a
     fonte É a gravação aberta, não uma escolha do usuário. */
  useEffect(() => {
    if (embutido || !fonteRestaurada.current) return;
    gravarFiltro(filtro);
    // A barra de endereço é o TERCEIRO espelho da mesma escolha (estado → storage → URL): a tela
    // vira compartilhável por link, e o helper limpa a query quando o filtro volta ao padrão.
    publicarQueryDoJogar(queryDoFiltro(filtro));
  }, [filtro, embutido]);

  /**
   * A TRIAGEM — calculada uma vez e usada por todos: pelas cartas, pelo início da rodada e pela
   * curadoria. Antes cada jogo refazia o seu próprio filtro, que foi como o idioma acabou
   * divergindo entre telas neste projeto (ver o cabeçalho de `lib/langConfig.ts`).
   */
  /* A TRIAGEM DE QUALIDADE continua local (é régua de conteúdo, não seleção), mas QUEM ESCOLHE
     as palavras passou a ser o servidor, ver `composicao.ts`. O filtro de dificuldade em JS
     sobre o deck inteiro deixou de existir. */
  const triagem: Triagem = useMemo(() => {
    /* Instrumento, não lógica — ver `lib/passadasDoPipeline`. Desligado, custa uma leitura de
         propriedade; ligado, é o que prova quantas vezes o baralho inteiro é triado por carga. */
    contarPassada('triagem', { cartoes: (deck ?? []).length, fonte: fonte.id, lang: fonte.lang });
    // Fonte única mantém a partição exclusiva de sempre (byte a byte). Com mais de uma, quem
    // parte o acervo é o predicado, que sabe somar.
    return filtro.fontes.length > 1
      ? cartoesDoFiltro(deck ?? [], filtro, { rankingDificeis: conjuntoDeDificeis, agora: Date.now() })
      : cartoesDaFonte(deck ?? [], fonteComRanking);
  }, [deck, fonteComRanking, fonte.id, fonte.lang, filtro, conjuntoDeDificeis]);

  /* COMPOSIÇÃO SERVIDA. Re-pede quando muda fonte, faixa ou estratégia. Falha de rede cai para
     composição local com a origem marcada, a app é local-first e rodada vazia não é opção. */
  useEffect(() => {
    /* NADA DE COMPOR ANTES DO BARALHO CHEGAR. Na montagem, `deck` é null e `fonte.lang` é '' — e
       o carregador resolve os dois no MESMO commit (batching do React 19, ver o handler). Compor
       aqui disparava uma requisição com idioma vazio, e idioma vazio DESLIGA o filtro no servidor:
       durante a janela até a resposta certa chegar, `composicao` segurava um pool multi-idioma —
       a mesma brecha (E4.4) em que o Duelo entrega a resposta pelo idioma do distrator. Auditoria
       S13. De quebra, poupa uma requisição inútil por visita à tela. */
    if (deck == null) return;
    let vivo = true;
    contarPassada('composicao', { cartoes: deck.length, fonte: fonte.id, lang: fonte.lang });
    const paraCompor: CartaoParaCompor[] = (deck ?? []).map((c) => ({
      id: c.id,
      word: c.word,
      back: c.translation ?? null,
      sentence: c.sentence ?? null,
      srcLang: c.srcLang ?? null,
      tgtLang: c.tgtLang ?? null,
      clozePrompt: (c as { clozePrompt?: string | null }).clozePrompt ?? null,
      clozeAnswer: (c as { clozeAnswer?: string | null }).clozeAnswer ?? null,
      cefrLevel: (c as { cefrLevel?: string | null }).cefrLevel ?? null,
      /* Sem `cast`: o tipo do cartão descreve estes campos desde que `rowToVocabCard` parou de
         descartá-los (achado A19). O `cast` aqui era o sintoma de um contrato incompleto. */
      cefrSource: c.cefrSource ?? null,
      occurrences: c.occurrences ?? null,
      difficultyScore: c.difficultyScore ?? null,
      dueAt: (c as { dueAt?: number | null; due?: number | null }).dueAt ?? (c as { due?: number | null }).due ?? null,
    }));
    void compor(
      {
        jogo: 'memory', // o pool é o mesmo para os jogos de palavra; o jogo só define o recorte final
        /* A fonte legada CONTINUA no pedido — é a proveniência e o caminho dos servidores antigos —
         mas quem FILTRA agora é o `filtro` facetado abaixo: um objeto só, o mesmo dos dois lados
         (a paridade SQL × predicado é travada por teste de integração). */
        fonte: {
          id: fonte.id === 'sessao' ? 'sessao' : fonte.id === 'trilha' ? 'trilha' : 'baralho',
          ref:
            fonte.id === 'sessao'
              ? fonte.sessionId
              : fonte.id === 'trilha'
                ? baseLang(fonte.lang)
                : baralhoAnki
                  ? `anki:${baralhoAnki.id}`
                  : null,
          lang: baseLang(fonte.lang),
        },
        filtro: filtroParaComposicao(filtro, filtro.recorte.dificeis ? rankingDeDificeis : undefined),
        dificuldade: faixas.length ? faixas : undefined,
        // 'auto' é decisão do cliente (por jogo); ao servidor vai o equilibrado.
        estrategia: estrategia === 'auto' ? 'equilibrado' : estrategia,
        limite: LIMITE_DA_COMPOSICAO,
      },
      paraCompor,
      buscarComposicaoPeloFunil,
    ).then((c) => {
      if (!vivo) return;
      filtroDaComposicao.current = filtro;
      setComposicao(c);
    });
    return () => {
      vivo = false;
    };
  }, [deck, fonte, filtro, faixas, estrategia, baralhoAnki, rankingDeDificeis]);

  /* A trilha carrega sob demanda, já unida às glosas do par praticado→nativo. O ÍNDICE responde
     pelas contagens (existe? quantas?) sem baixar nada — é ele que impede a aba de sumir e o
     número de piscar zero enquanto o dado vem. */
  const entradaDaTrilha = useMemo(() => indiceDaTrilha()[baseLang(fonte.lang)] ?? null, [fonte.lang]);
  const [trilha, setTrilha] = useState<DadoTrilha | null>(() => trilhaEmCache(fonte.lang, idiomaNativo));
  const [carregandoTrilha, setCarregandoTrilha] = useState(false);
  useEffect(() => {
    if (!entradaDaTrilha) {
      setTrilha(null);
      return;
    }
    void precarregarNiveis(fonte.lang);
    const emCache = trilhaEmCache(fonte.lang, idiomaNativo);
    if (emCache) {
      setTrilha(emCache);
      return;
    }
    let vivo = true;
    setCarregandoTrilha(true);
    carregarTrilha(fonte.lang, idiomaNativo)
      .then((d) => {
        if (vivo) setTrilha(d);
      })
      .finally(() => {
        if (vivo) setCarregandoTrilha(false);
      });
    return () => {
      vivo = false;
    };
  }, [fonte.lang, idiomaNativo, entradaDaTrilha]);

  /* SELEÇÃO v2 — as frases da trilha (Tatoeba) no formato que os jogos de frase consomem. */
  /**
   * SEM NÍVEL ESCOLHIDO, A TRILHA JOGA COM TODOS — que é o que a Sala já promete por escrito
   * ("Sem escolher, a trilha joga com todos os níveis de uma vez").
   *
   * Antes, `fonte.nivel` vazio devolvia lista vazia aqui e `triagem.usaveis` no `jogaveis` logo
   * abaixo. Para quem nunca jogou a trilha, `triagem.usaveis` é ZERO (nenhuma palavra dela foi
   * promovida ao baralho ainda): a tela anunciava 2.784 palavras, o rodapé da Sala confirmava, e
   * a rodada não montava. Escolher um nível "consertava" — o que fazia o defeito parecer preferência.
   */
  const niveisDaRodada = useMemo<CefrLevel[]>(
    () => (filtro.fontes.includes('trilha') && trilha ? niveisEmJogo(trilha, filtro.nivelTrilha) : []),
    [filtro.fontes, filtro.nivelTrilha, trilha],
  );

  const frasesTrilha = useMemo<Sentence[]>(
    () => (trilha ? niveisDaRodada.flatMap((n) => frasesDaTrilha(trilha, n) as unknown as Sentence[]) : []),
    [niveisDaRodada, trilha],
  );

  /* A ETAPA ATUAL da trilha: primeira não feita (≥80% das palavras já no caderno). Recorta a
     rodada em `montarRodada`; `acertos` vem do histórico (a coluna "acertou" nunca era passada). */
  const etapaDaTrilha = useMemo(() => {
    if (fonte.id !== 'trilha' || !trilha || !fonte.nivel) return null;
    const etapas = etapasDoNivel(trilha, fonte.nivel);
    const jaTem = new Set((deck ?? []).filter((c) => c.daTrilha).map((c) => chaveDaPalavraCore(c.word)));
    const acertos = new Set(
      [...historico.values()].filter((h) => h.ultimoAcerto).map((h) => chaveDaPalavraCore(h.itemRef)),
    );
    return etapaAtual(progressoDasEtapas(etapas, jaTem, acertos));
  }, [fonte.id, fonte.nivel, trilha, deck, historico]);

  /** Decisão do modo Auto para um jogo: precisões recentes (localStorage) → faixa + motivo. */
  const decisaoAuto = (jogo: MinigameId) =>
    faixaAuto({ ultimasPrecisoes: lerPrecisoes(jogo), faixaAtual: faixaAutoAtualRef.current[jogo] ?? null });
  const faixaAutoAtualRef = useRef<Partial<Record<MinigameId, FaixaDificuldade>>>({});

  /**
   * O QUE A SALA DE ESCOLHA PRECISA SABER.
   *
   * Os idiomas vêm com a contagem do que é JOGÁVEL, não do que está guardado — é a correção de
   * `idiomasDisponiveis`, que prometia isso no docblock e contava cartão bruto. Sem ela, dava para
   * escolher um idioma com centenas de cartões e cair numa tela sem jogo, porque nenhum tinha
   * tradução.
   */
  /* FORA DO CAMINHO DA PRIMEIRA PINTURA. `idiomasDisponiveis` roda `triarCartoes` sobre o baralho
     INTEIRO, particionado por idioma, medido, é a conta mais cara desta tela (achado F0-02), e
     ela acontecia no mesmo render em que o baralho chega, junto da triagem e do gate dos nove
     jogos. Diferido, o baralho pinta primeiro e a contagem dos idiomas entra no render seguinte;
     é a mesma lista, um quadro depois. */
  const deckParaIdiomas = useDeferredValue(deck);
  const idiomasDoBaralho = useMemo(() => idiomasDisponiveis(deckParaIdiomas ?? []), [deckParaIdiomas]);

  /**
   * QUAIS FONTES ESTA TELA PODE OFERECER — derivado, não repetido.
   *
   * `fontesDisponiveis` existia, estava testada em `escopoDaFonte.test.ts` e **nunca foi chamada**.
   * A regra que ela declara ("embutido → só a sessão") vivia reimplementada em três condicionais
   * espalhadas por este arquivo, que não sabiam uma da outra: o `!embutido` da faixa, o
   * `(recording || sessaoEmUso) &&` do botão de sessão e o `trilha &&` do botão de trilha.
   *
   * Agora é uma pergunta só, e a garantia "a sala não aparece dentro de uma sessão" passa a ter
   * teste — o que já existia e não cobria nada.
   */
  /* Gravação só aparece no idioma que ela de fato produziu. O idioma vem das PALAVRAS que
     saíram dela, não do campo declarado na captura: é o que a sessão entregou, não o que foi
     configurado. Sem isto, as 4 gravações apareciam em todos os idiomas, inclusive nos que nunca
     foram falados ali. */
  const sessoesDoIdioma = useMemo(() => {
    const base = baseLang(fonte.lang);
    if (!base) return sessoes;
    const comMaterial = new Set(
      (deck ?? [])
        .filter((c) => c.sourceSessionId && baseLang(c.srcLang ?? '') === base)
        .map((c) => c.sourceSessionId as string),
    );
    return sessoes.filter((s) => comMaterial.has(s.id));
  }, [sessoes, deck, fonte.lang]);

  const fontesOferecidas = useMemo(
    () =>
      fontesDisponiveis({
        embutido: !!embutido,
        temSessao: !!(recording || sessaoEmUso),
        temTrilha: !!entradaDaTrilha,
        sessoesDisponiveis: sessoes.length,
        // 4 é o menor `minItems` dos jogos: com menos que isso a fonte abriria só telas trancadas.
        temDificeis: rankingDeDificeis.length >= 4,
      }),
    [embutido, recording, sessaoEmUso, entradaDaTrilha, sessoes.length, rankingDeDificeis.length],
  );

  /** A fonte vigente no vocabulário DA TELA — é por ele que as abas comparam e trocam. */
  const escolhaAtual = useMemo(() => escolhaDaFonte(fonte), [fonte]);

  /** Quantas palavras a trilha do idioma atual tem, no recorte vigente (nível ou todos). */
  const totalDaTrilhaAtual = useMemo(() => {
    if (!entradaDaTrilha) return 0;
    const niveis = fonte.nivel ? [fonte.nivel] : Object.keys(entradaDaTrilha.porNivel);
    return niveis.reduce((n, nv) => n + (entradaDaTrilha.porNivel[nv] ?? 0), 0);
  }, [entradaDaTrilha, fonte.nivel]);

  /**
   * O TAMANHO DE CADA ABA É DELA, não da fonte selecionada.
   *
   * `triagem` é o recorte da fonte VIGENTE: com a trilha aberta, ela conta palavras da trilha, e
   * usá-la para o número da aba "minhas gravações" fazia a contagem sumir sempre que a pessoa
   * estava em outra aba. Uma aba que muda de tamanho conforme a aba vizinha está aberta ensina
   * a coisa errada sobre o próprio acervo.
   */
  const palavrasDasGravacoes = useMemo(
    () => cartoesDaFonte(deck ?? [], { id: 'baralho', lang: fonte.lang }).usaveis.length,
    [deck, fonte.lang],
  );

  /**
   * O QUE A FAIXA DE CONTEXTO DIZ — diferente por fonte, porque as fontes são diferentes.
   *
   * A trilha é um CURSO: tem etapa atual, o trecho que vem e quanto falta do nível. As gravações
   * não têm fim nem etapa — o valor delas é reconhecer o que você mesmo ouviu. As difíceis são uma
   * fila que ENCOLHE quando você acerta. Mostrar "N palavras" para as três esconderia justamente a
   * diferença que a pessoa precisa entender para escolher.
   */

  /**
   * A trilha de UM idioma qualquer — não a do idioma vigente.
   *
   * A sala consulta pelo idioma que está selecionado NELA, antes de aplicar. Uma versão que
   * respondesse pelo `fonte.lang` atual faria a Trilha recusar o idioma que a pessoa acabou de
   * escolher, com uma frase citando o idioma anterior.
   *
   * Hoje só existe `data/trilha/en.json`; o dia em que houver outro, esta é a única função a mudar.
   */
  /* Só contagens — vem do índice, sem baixar o dado. É o que a Sala e o seletor precisam. */
  const prefetchTrilha = React.useCallback(
    (lang: string) => {
      void precarregarNiveis(lang);
      void carregarTrilha(lang, idiomaNativo);
    },
    [idiomaNativo],
  );

  const trilhaDe = React.useCallback((lang: string) => {
    const e = indiceDaTrilha()[baseLang(lang)];
    const vazia = {
      niveis: [] as CefrLevel[],
      total: 0,
      porNivel: {} as Partial<Record<CefrLevel, number>>,
      escala: null,
    };
    if (!e) return vazia;
    const niveis = (Object.keys(e.porNivel) as CefrLevel[]).filter((n) => (e.porNivel[n] ?? 0) > 0);
    return { niveis, total: e.total, porNivel: e.porNivel as Partial<Record<CefrLevel, number>>, escala: e.escala };
  }, []);

  /**
   * A TRILHA JOGA DIRETO DO DADO EMBUTIDO — sem baixar, sem rede, sem espera.
   *
   * Antes, cada palavra da trilha precisava ser TRADUZIDA pela rede e GRAVADA no banco antes de
   * poder aparecer numa rodada: 8 traduções em série por clique, 116 cliques para completar o A1,
   * falhas silenciosas, e traduções ruins ("cook" virou "cozinheiro de bordo" no banco real).
   * Agora `en.json` já traz a tradução, e `cartoesDaTrilha` monta os cartões em memória.
   *
   * O CARTÃO DO BANCO GANHA DO EMBUTIDO quando existe. É o que preserva o agendamento: uma
   * palavra que a pessoa já errou e que voltou para a revisão espaçada tem estado real, e trocá-lo
   * por um cartão novo em folha apagaria esse progresso a cada rodada.
   */
  const comTrilha = filtro.fontes.includes('trilha');
  const jogaveis = useMemo(() => {
    if (comTrilha) {
      if (!trilha || !niveisDaRodada.length) return triagem.usaveis;
      const doBanco = new Map(triagem.usaveis.map((c) => [chaveDaPalavra(c.word), c]));
      /* `niveisDaRodada` é o nível escolhido, ou TODOS quando não há escolha — ver `niveisEmJogo`.
         O cartão do BANCO vence o embutido: quem já fichou a palavra carrega o histórico dela. */
      const embutidos = niveisDaRodada
        .flatMap((n) => cartoesDaTrilha(trilha, n))
        .filter((c) => !doBanco.has(chaveDaPalavra(c.word))) as unknown as VocabCard[];
      return [...triagem.usaveis, ...embutidos];
    }

    /**
     * A COMPOSIÇÃO ORDENA E PRIORIZA; ELA NÃO SUBSTITUI A TRIAGEM.
     *
     * O que havia aqui era um bypass: quando o servidor respondia, `triagem.usaveis` era
     * DESCARTADA e os 200 cartões servidos iam crus para os jogos — sem filtro de idioma e sem a
     * régua de qualidade. Medido no baralho real: praticando português, dos 200 servidos só 5
     * tinham tradução, embora o baralho tivesse 323 palavras portuguesas jogáveis. Era a causa dos
     * "jogos cinza": o material chegava aos nove jogos já sem serventia.
     *
     * `recortarPelaComposicao` mantém a ordem do servidor e garante a invariante que o contrato de
     * `estadoDeCadaJogo` sempre exigiu ("já triadas e recortadas pela fonte"): tudo o que sai daqui
     * está em `triagem.usaveis`.
     */
    /* Com filtro de FAIXA ligado, a forma antiga `{completar:false}` continua: a faixa não é
       faceta do filtro (é recorte de dificuldade do servidor) e completar encheria a rodada com
       cartões fora dela. Sem faixa, a forma nova `{filtro}` assume: SEMPRE completa, mas o
       complemento só admite quem passa no MESMO predicado que o servidor aplicou — o antigo
       booleano confundia "não completar" com "não filtrar" e foi como o recorte por baralho capou
       rodadas em abas onde nem agia (auditoria, defeito 3). */
    return faixas.length
      ? recortarPelaComposicao(triagem.usaveis, composicao, { completar: false })
      : recortarPelaComposicao(triagem.usaveis, composicao, {
          filtro,
          extras: { rankingDificeis: conjuntoDeDificeis, agora: Date.now() },
        });
    /* `niveisDaRodada` no lugar de `fonte.nivel`: é ele que decide quais listas entram, e sem
       nível escolhido ele vale TODAS. Deixá-lo fora daqui congelaria a rodada nos níveis da
       primeira renderização — o mesmo tipo de dependência esquecida que já mordeu este arquivo. */
    /* `filtro` e o conjunto de difíceis entraram no corpo (o complemento do recorte passa pelo
       predicado) e por isso entram AQUI: dependência esquecida congelaria o recorte na primeira
       renderização — a mesma armadilha que o comentário acima já registra para `niveisDaRodada`. */
  }, [triagem.usaveis, comTrilha, niveisDaRodada, trilha, composicao, faixas.length, filtro, conjuntoDeDificeis]);

  const frasesDoIdioma = useMemo<Sentence[]>(
    () => frases.filter((f) => !fonte.lang || !f.lang || baseLang(f.lang) === baseLang(fonte.lang)),
    [frases, fonte.lang],
  );

  const frasesDoAcervoAtual = useMemo<Sentence[]>(
    () => frasesDoAcervo(jogaveis, fonte.lang) as unknown as Sentence[],
    [jogaveis, fonte.lang],
  );

  /**
   * O ACERVO DA FONTE — sem teto. É o conjunto inteiro que a fonte atual oferece.
   *
   * `jogaveis` (acima) é o RECORTE que vai virar rodada: quando o servidor compõe, ele vem
   * capado em `limite: 200`. Os dois responderiam a perguntas diferentes, mas a tela usava
   * `jogaveis` para as duas — e passava a dizer "200 prontas" num baralho de 1.902.
   */
  const acervoDaFonte = useMemo(() => {
    /* Mesmo recorte de `jogaveis`, pelo mesmo motivo: sem nível escolhido a trilha vale INTEIRA.
       Aqui o defeito era ainda mais visível, porque é este acervo que produz o "N disponíveis"
       de cada carta — a tela dizia zero sobre uma trilha de 2.784 palavras. */
    if (!comTrilha || !trilha || !niveisDaRodada.length) {
      /* FORA DA TRILHA, o acervo exibido passa pelo MESMO filtro da rodada (auditoria S9): com o
         recorte de baralho ligado, o painel "Seu baralho" dizia o acervo INTEIRO enquanto o gate
         contava o recortado — dois números discordando na mesma tela. A trilha fica fora do
         predicado porque seus itens embutidos são pseudo-cartões sem `daTrilha`/`dueAtMs`, e o
         filtro os comeria por engano. */
      return triagem.usaveis.filter((c) =>
        passaNoFiltro(c, filtro, { rankingDificeis: conjuntoDeDificeis, agora: Date.now() }),
      );
    }
    const doBanco = new Map(triagem.usaveis.map((c) => [chaveDaPalavra(c.word), c]));
    const embutidos = niveisDaRodada
      .flatMap((n) => cartoesDaTrilha(trilha, n))
      .filter((c) => !doBanco.has(chaveDaPalavra(c.word))) as unknown as VocabCard[];
    return [...triagem.usaveis, ...embutidos];
  }, [triagem.usaveis, comTrilha, niveisDaRodada, trilha, filtro, conjuntoDeDificeis]);

  /* Contagens das pílulas de recorte, medidas na base SEM os recortes ligados (o padrão facetado:
     cada faceta mostra o que ELA renderia, não o que sobra depois dela mesma). `dueAtMs` é o cru
     do banco — a string de exibição não serve de régua. */
  const contagemRecortes = useMemo(() => {
    const agora = Date.now();
    // Padrão facetado: cada pílula conta o que ELA renderia, sem se descontar.
    const semRecorte = { ...filtro, recorte: {} };
    const semMidia = { ...filtro, midia: {} };
    const soTraducao = { ...semMidia, midia: { comTraducao: true } };
    const soFrase = { ...semMidia, midia: { comFrase: true } };
    const extras = { rankingDificeis: conjuntoDeDificeis, agora };
    let pedindo = 0,
      nunca = 0,
      traducao = 0,
      frase = 0;
    for (const c of triagem.usaveis) {
      if (passaNoFiltro(c, semRecorte, extras)) {
        const d = (c as { dueAtMs?: number | null }).dueAtMs ?? null;
        if (d == null) nunca++;
        else if (d <= agora) pedindo++;
      }
      if (passaNoFiltro(c, soTraducao, extras)) traducao++;
      if (passaNoFiltro(c, soFrase, extras)) frase++;
    }
    return { pedindo, nunca, traducao, frase };
  }, [triagem.usaveis, filtro, conjuntoDeDificeis]);

  /* As duas populações dentro de `usaveis`: a que serve aos jogos de par e a que só serve ao
     duelo. Separar é o que permite a faixa de status dizer a verdade inteira. */
  /* Sobre o ACERVO EXIBIDO (já recortado pelo filtro — S9), não sobre a triagem crua: senão o
     painel diria "599 no idioma · 847 com tradução", dois escopos na mesma linha. */
  const pistas = useMemo(() => pistasDaTriagem({ ...triagem, usaveis: acervoDaFonte }), [triagem, acervoDaFonte]);

  /* SELEÇÃO v2: os itens do acervo marcados como difíceis para você (≥ LEECH_APOS erros seguidos).
     Ficam fora da rotação comum e voltam na rodada de resgate da antessala. */
  const leechesDoAcervo = useMemo(
    () => acervoDaFonte.filter((c) => estadoDoItem(historico.get(c.word)).tag === 'leech').map((c) => c.word),
    [acervoDaFonte, historico],
  );

  /* Quantas do acervo NUNCA apareceram numa rodada. Sai do histórico que já está em memória —
     é o número que faz o card do mapa valer o clique, em vez de repetir o total. */
  const nuncaCairam = useMemo(
    () => acervoDaFonte.reduce((n, c) => n + (historico.has(c.word) ? 0 : 1), 0),
    [acervoDaFonte, historico],
  );

  /** Os números que vão para a tela. `total` responde "quantas eu tenho"; `naRodada`, "quantas agora". */
  const contagem = useMemo(() => contagemDaFonte(composicao, acervoDaFonte.length), [composicao, acervoDaFonte.length]);

  /* Quantos itens existem por faixa NO RECORTE ATUAL — é o que permite desabilitar um chip com o
     MOTIVO ("só 2 difíceis; o jogo precisa de 4") em vez de deixar o usuário clicar e falhar. */
  const contagemPorFaixa = useMemo(() => {
    const conta = { facil: 0, medio: 0, dificil: 0 };
    for (const c of triagem.usaveis) {
      const f = faixaDeScore(c.difficultyScore ?? null);
      if (f) conta[f] += 1;
    }
    return conta;
  }, [triagem.usaveis]);

  /**
   * Índice palavra → cartão. Nasceu dentro do promotor da trilha, montado a cada fim de rodada;
   * agora serve também a prévia, que precisa do nível CEFR sem que ele viaje no `MinigameItem`
   * (lá é contrato de JOGO, e o nível não muda como nenhum dos nove joga).
   *
   * A chave continua sendo `toLowerCase()`, e não `chaveComparavel`: o promotor sempre usou esta,
   * e trocá-la aqui mudaria silenciosamente QUAIS palavras erradas viram cartão — outra mudança,
   * noutra entrega.
   */
  const porPalavra = useMemo(
    () => new Map<string, VocabCard>(jogaveis.map((c) => [c.word.toLowerCase(), c])),
    [jogaveis],
  );

  /**
   * DE ONDE CADA PALAVRA VEIO — o dado que o servidor já mandava e que esta tela jogava fora.
   *
   * `GET /api/vocab/para-jogo` devolve `proveniencia` por item (origem, referência, nível, faixa,
   * ocorrências, por que foi selecionado) desde que existe. `jogaveis` (acima) usava só o `cardId`
   * para remapear ao cartão do deck e DESCARTAVA o resto — então a antessala não tinha como dizer
   * "8 palavras suas, do inglês", que é a primeira coisa que o mockup do redesenho mostra.
   *
   * Custo: um `useMemo`, zero ida à rede. A chave é a mesma de `porPalavra` (`toLowerCase`), para
   * os dois índices concordarem sobre o que é a mesma palavra.
   */
  const proveniencias = useMemo(() => {
    const mapa = new Map<string, { origem: 'baralho' | 'sessao' | 'trilha'; porQue?: string }>();
    for (const item of composicao?.itens ?? []) {
      const p = item.proveniencia;
      if (!p) continue;
      const registro = { origem: p.origem, porQue: p.porQueSelecionado };
      if (item.cardId) mapa.set(item.cardId, registro);
      if (item.word) mapa.set(item.word.toLowerCase(), registro);
    }
    return mapa;
  }, [composicao]);

  /**
   * A origem de UMA palavra, com um palpite honesto quando o servidor não compôs.
   *
   * Sem `composicao` (seleção montada no dispositivo, offline), a proveniência por item não existe
   * — mas a FONTE escolhida é conhecida e vale para a rodada inteira. Usá-la é preciso o bastante
   * para a linha que a tela escreve, e não inventa nada: numa rodada da trilha, toda palavra é da
   * trilha.
   */
  const origemDaPalavra = React.useCallback(
    (palavra: string, cardId?: string): 'baralho' | 'sessao' | 'trilha' => {
      const achado = (cardId && proveniencias.get(cardId)) || proveniencias.get(palavra.toLowerCase());
      // 'dificeis' não é procedência DE ITEM: a palavra difícil veio do baralho — o ranking só
      // escolheu a rodada. Por item, o palpite honesto é o baralho.
      return achado?.origem ?? (fonte.id === 'dificeis' ? 'baralho' : fonte.id);
    },
    [proveniencias, fonte.id],
  );

  /**
   * "PRATICAR ISTO" chegando de outra tela: abre o jogo pedido, já no trecho escolhido.
   *
   * Mora DEPOIS da triagem porque depende dela: disparar antes de o material carregar cairia no
   * `return` silencioso de `iniciar` (mínimo de itens não atingido) e o atalho pareceria quebrado
   * — o mesmo tipo de clique-que-não-faz-nada que estamos tirando do app. `sementeUsadaRef`
   * garante UMA tentativa por semente: sem ele, sair da rodada reabriria o jogo em laço.
   */
  const sementeUsadaRef = React.useRef<string | null>(null);
  useEffect(() => {
    const jogo = seed?.exercise;
    if (!jogo || !(jogo in MINIGAMES)) return; // 'review'/'active_production' moram no Estudo
    const marca = `${jogo}|${seed?.word ?? ''}|${seed?.text ?? ''}`;
    if (sementeUsadaRef.current === marca) return;
    if (!deck || (!jogaveis.length && !frases.length)) return; // ainda carregando
    sementeUsadaRef.current = marca;
    /* "Praticar isto" vindo de outra tela é um começo, não a continuação de nada — mesmo que a
       corrente anterior fosse do mesmo jogo. */
    setSequencia(null);
    const pronta = montarRodada(jogo as MinigameId, seed);
    if (pronta) comecar(pronta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, deck, frases.length, jogaveis.length]);
  /**
   * HÁ VOZ **NESTE IDIOMA**? É o que decide se a trilha tem jogo de escuta.
   *
   * A pergunta era só "o navegador tem `speechSynthesis`?" — e a resposta é sim em praticamente
   * todo lugar. Só que ter o motor não é ter a VOZ: um Chrome no Linux sem pacote de francês
   * abria Ditado, Qual foi? e Karaokê da trilha francesa e não falava nada. A função que sabe
   * responder (`hasVoiceFor`) já existia e nunca tinha sido chamada.
   *
   * NA DÚVIDA, LIBERA. `getVoices()` volta vazio no primeiro acesso e só popula no evento
   * `voiceschanged`; enquanto a lista não chegou, "não achei voz" significa "ainda não sei", e
   * bloquear por informação ausente daria um jogo trancado por engano — pior que o defeito
   * original. Por isso o `!vozesCarregadas()` no meio da conta, e o efeito que refaz a pergunta
   * quando a lista chega.
   */
  const [temVoz, setTemVoz] = useState(() => (aparelhoTemVoz() ? isTtsSupported() : haVozPara(fonte.lang)));
  useEffect(() => {
    /* Estado e não `useMemo`: a lista de vozes é mutável e vive FORA do React. Um memo com um
       contador de dependência fingiria uma relação que não existe (e o lint acusa, com razão);
       aqui a resposta é recalculada nos dois momentos em que ela pode mudar — quando o idioma
       da prática muda, e quando o navegador finalmente entrega as vozes. */
    /* No aparelho SEM voz própria (o Quest: a API existe, sem voz nenhuma) quem responde é a voz do
       site, por idioma (`lib/voz/haVoz.ts`). Sem isto a lista vazia valia como "ainda não sei", e os
       jogos de ouvir abriam mudos. */
    const avaliar = () =>
      setTemVoz(
        aparelhoTemVoz() ? isTtsSupported() && (!vozesCarregadas() || hasVoiceFor(fonte.lang)) : haVozPara(fonte.lang),
      );
    avaliar();
    return aoMudarVozes(avaliar);
  }, [fonte.lang]);
  /**
   * META QUEST: sem voz para o idioma, os jogos de ouvir NÃO ficam mudos, eles mudam de forma. Escuta e
   * Ditado mostram a tradução no lugar do som (o ramo `!temSom` de cada um) e o Karaokê diz o que fazer.
   * Por isso, no headset, o gate e o montador da rodada recebem "há como apresentar a palavra": quem
   * decide o que abre e com que etiqueta é o lobby do headset (`jogosNoQuest.ts`), que apaga só o que de
   * fato não dá para jogar. Fora do headset a pergunta continua sendo "há voz?", como sempre.
   */
  /* É DO APARELHO (`noHeadset`), não do desenho: no computador com o desenho novo a voz é a do navegador,
     e sem voz no idioma o jogo de ouvir fica preso com o motivo, como na tela de sempre (aberto, tocaria
     mudo: lá os jogos não trocam o som pela tradução). */
  const temVozOuEscrita = noHeadsetNovo || temVoz;

  /**
   * O áudio da gravação, baixado COM AUTENTICAÇÃO.
   *
   * Os três jogos de escuta usam `<audio src>`, que não manda cabeçalho — com login ligado eles
   * recebiam 401 e ficavam mudos. `useAudioDaSessao` faz o download por `apiFetch` e devolve uma
   * URL de blob, que além de funcionar permite buscar por tempo localmente: para o Karaokê e o
   * Qual foi?, que recortam trechos, o salto deixa de ser uma requisição parcial por vez.
   */
  const audioBaixado = useAudioDaSessao(idDoAudio, !!audioSessao);
  const audioParaJogos = audioBaixado.url ?? '';

  /** As palavras vencidas AGORA — a antessala marca essas, e é a informação que faz a pessoa
   *  entender por que aquela palavra voltou. */
  const vencidosAgora = useMemo(
    () => new Set(jogaveis.filter((c) => isDueNow(c, 'fsrs')).map((c) => c.word)),
    [jogaveis],
  );

  /**
   * Estado REAL de cada jogo: o que dá para jogar agora e o que falta para o resto.
   *
   * A REGRA mora em `@core/minigames/estadoDosJogos` — 55 linhas que já mentiram em produção (os
   * jogos de frase anunciando falas na trilha) e que não tinham como ser testadas presas dentro
   * deste componente. Aqui sobra só a costura: estado por id + a apresentação da carta.
   *
   * `fonte.id` É dependência: sem ela, trocar de fonte não recalculava o gate — que é exatamente
   * como os jogos de frase passaram a mentir na trilha.
   */
  const estados = useMemo(() => {
    contarPassada('gate', { cartas: jogaveis.length, falas: frasesDoIdioma.length, fonte: fonte.id, lang: fonte.lang });
    const porId = estadoDeCadaJogo({
      cartas: jogaveis,
      frases: frasesDoIdioma.length ? frasesDoIdioma : frasesDoAcervoAtual,
      frasesDaTrilha: comTrilha ? frasesTrilha : undefined,
      temAudio: !!audioSessao,
      audioPronto: !!audioParaJogos,
      temVoz: temVozOuEscrita,
      fonteId: fonte.id,
      lang: fonte.lang,
    });
    return JOGOS.map((j) => ({ ...j, estado: porId[j.id] }));
  }, [
    jogaveis,
    frasesDoIdioma,
    frasesDoAcervoAtual,
    frasesTrilha,
    comTrilha,
    audioSessao,
    audioParaJogos,
    fonte.lang,
    fonte.id,
    temVozOuEscrita,
  ]);

  /**
   * O QUE A CARTA BLOQUEADA PRECISA SABER PARA OFERECER UMA SAÍDA.
   *
   * A carta já dizia a causa com número honesto e não oferecia alavanca nenhuma — nove cartas
   * cinza e nenhum botão. A regra de qual saída cabe mora em `@core/minigames/desbloqueio`; aqui
   * fica só a MEDIÇÃO do contexto, que depende de dados desta tela.
   *
   * `naOutraFonte` é medido de verdade, e não presumido: da trilha, contamos as gravações; das
   * gravações, o tamanho da trilha do idioma. **Zero quando embutido** — dentro de uma sessão a
   * fonte é fixa por decisão de produto, e um botão "jogar com a trilha" ali seria um botão que
   * troca a tela por baixo de quem escolheu aquela sessão.
   */
  const contextoDoDesbloqueio = useMemo((): ContextoDeDesbloqueio => {
    const atual = baseLang(fonte.lang);
    const naOutraFonte = embutido
      ? 0
      : fonte.id === 'trilha'
        ? cartoesDaFonte(deck ?? [], { id: 'baralho', lang: fonte.lang }).usaveis.length
        : trilhaDe(fonte.lang).total;
    return {
      fonteId: fonte.id,
      outrosIdiomas: idiomasDoBaralho.filter((i) => i.lang !== atual),
      naOutraFonte,
      descartados: triagem.fora.length,
      gravacoes: embutido ? 0 : sessoes.length,
      nomeDoIdioma: langLabelNaUI,
    };
  }, [deck, fonte, embutido, idiomasDoBaralho, triagem.fora.length, sessoes.length, trilhaDe]);

  /** A porta escolhida vira navegação. Cada ação leva ao lugar que RESOLVE aquela causa. */
  const abrirPorta = (d: Desbloqueio) => {
    const base = escolhaDaFonte(fonte);
    if (d.acao === 'trocar-idioma' && d.lang) {
      aplicarEscolha({ ...base, lang: d.lang });
      return;
    }
    /* Aplica direto, sem reabrir a sala: a queixa era ATRITO, e mandar de volta para o menu quem
       acabou de ler "jogue em inglês" é pedir a mesma decisão duas vezes. A mudança é visível na
       hora, a faixa "Praticando" e a grade inteira se refazem. */
    if (d.acao === 'trocar-fonte' && d.paraFonte) {
      aplicarEscolha({ ...base, origem: d.paraFonte, escopo: 'todas', sessionId: undefined });
      return;
    }
    if (d.acao === 'revisar-descartes') {
      setCurando(true);
      return;
    }
    // Escolher gravação é exatamente a linha "QUAIS" da sala — aqui reabrir é o caminho certo.
    if (d.acao === 'escolher-gravacao') {
      setSalaAberta(true);
      return;
    }
    onChangeView('capture');
  };

  /**
   * A ORDEM É DO USUÁRIO. Saiu daqui a revelação progressiva, que escondia cinco dos nove jogos
   * atrás de um "Ver todos" em Kids e Sênior: ela existia para domar escolha demais, mas o preço
   * era esconder metade do app de quem menos sabe procurar. Agora todos aparecem, e quem organiza
   * é quem joga — fixando os favoritos no topo e movendo o resto.
   */
  // Genérico anotado: dentro de `.tsx` a inferência do `T` a partir do callback falha e o
  // parâmetro cai para `unknown`.
  const ordenados = useMemo(
    () => aplicarOrdem<(typeof estados)[number]>(estados, ordem, (j) => j.id),
    [estados, ordem],
  );
  /* A GRADE MOSTRA TODOS OS JOGOS. A paginação saiu junto com o paginador: `POR_PAGINA` era 9 e
     existem exatamente 9 jogos, então a segunda página nunca chegou a existir — eram 25 linhas de
     JSX inertes mais três derivações para uma navegação que nenhum usuário viu. Quando o décimo
     jogo aparecer, a grade cresce; se um dia precisar paginar de novo, o corte volta aqui. */
  const idsVisiveis = ordenados.map((j) => j.id);

  const mexerNaOrdem = (nova: OrdemDosJogos) => {
    setOrdem(nova);
    gravarOrdem(nova);
  };

  /* O ESCOPO DO BANNER era o pior contador da tela (auditoria, defeito 2): `metrics.dueToday` é
     GLOBAL da conta — sem idioma, sem aba, sem recorte — e ficava ao lado de números de escopo
     estrito, sem aviso ("1041 pedindo revisão" sobre um recorte de 847). `vencidosAgora` já
     existia e é a verdade CERTA: os vencidos DENTRO do que a rodada pode usar — o mesmo conjunto
     de todos os outros números da tela, e o mesmo que o botão do banner de fato joga. */
  const tamanhoDoBaralho = deck?.length ?? 0;
  const menorMinimo = Math.min(...JOGOS.map((j) => MINIGAMES[j.id].minItems));

  /**
   * O QUE A TELA PROPÕE, e como os nove jogos se dividem (redesenho aprovado em 02/09).
   *
   * A REGRA MORA NO NÚCLEO (`@core/minigames/painelDaPratica`) porque a frase da ficha é a primeira
   * coisa que se lê aqui: se ela mentir — como mentia ao propor "revisar 2.225" sobre um baralho
   * recém-importado que ninguém tinha visto — o resto da tela perde credibilidade junto. Lá dá
   * para travar cada caso com teste; aqui dentro, não daria.
   *
   * A ORDEM DOS PRONTOS CONTINUA SENDO A DO USUÁRIO. `agruparJogos` também sabe ordenar por
   * rendimento, e essa ordem é usada só nos BLOQUEADOS (mais perto de abrir primeiro): quem fixou
   * o Termo no topo fez um trabalho que o redesenho não tem o direito de desfazer. O que muda é
   * a separação — jogável e bloqueado deixam de disputar a mesma grade.
   */
  const jogosProntos = useMemo(() => ordenados.filter((j) => j.estado.ok), [ordenados]);
  const jogosPresos = useMemo(() => {
    /* Enquanto a trilha carrega, nenhum jogo é declarado bloqueado: o acervo ainda não chegou, e
       "faltam N palavras" seria mentira, não só feiura. */
    if (carregandoTrilha) return [];
    const porId = new Map(ordenados.map((j) => [j.id, j]));
    return agruparJogos(estados.map((j) => j.estado))
      .presos.map((p) => ({ ...p, ui: porId.get(p.estado.id)! }))
      .filter((p) => p.ui);
  }, [estados, ordenados, carregandoTrilha]);
  /* UMA lista, dois grupos. A grade continua sendo um `<ul>` só — o cabeçalho do segundo grupo
     entra como item na fronteira — porque a carta tem 240 linhas de regras (portas de desbloqueio,
     modo organizar, recordes, tour) e duplicá-la para ter duas grades seria criar dois lugares
     onde a mesma carta pode divergir. */
  const listaDeJogos = useMemo(() => [...jogosProntos, ...jogosPresos.map((p) => p.ui)], [jogosProntos, jogosPresos]);

  /* O número da aba "Jogos" da sessão só sai quando o baralho chegou: antes disso "0 prontos"
     seria um número falso. */
  useEffect(() => {
    if (!embutido || deck === null || carregandoTrilha) return;
    aoContarProntos?.(jogosProntos.length);
  }, [embutido, deck, carregandoTrilha, jogosProntos.length, aoContarProntos]);

  /**
   * "JOGAR COM ESTE BARALHO" ABRE O JOGO (protótipo: `data-jogo="memory"`). O recorte pelo baralho
   * recém-trazido muda o filtro, e a rodada só pode ser montada DEPOIS que a composição do servidor
   * responder para esse filtro — montar antes sortearia do acervo de antes do recorte. Por isso o
   * pedido espera aqui até `filtroDaComposicao` ser o filtro vigente.
   */
  useEffect(() => {
    if (!jogoPendente || importando || vendoBaralhos) return;
    if (filtroDaComposicao.current !== filtro || !filtro.baralhos.includes(jogoPendente.baralho)) return;
    setJogoPendente(null);
    const alvo =
      listaDeJogos.find((j) => j.id === jogoPendente.jogo && j.estado.ok) ?? listaDeJogos.find((j) => j.estado.ok);
    if (!alvo) {
      toast.warn(t('Nenhum jogo abre só com este baralho ainda. Os jogos dizem o que falta.'));
      return;
    }
    pedirParaJogar(alvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jogoPendente, importando, vendoBaralhos, composicao, filtro, listaDeJogos]);

  /**
   * META QUEST: os jogos que o lobby do headset deixa abrir (`jogosNoQuest.ts`). A partida rápida e a
   * sugestão do dia escolhem só entre eles: `estado.ok` fala do MATERIAL, e sortear um jogo que o lobby
   * mostra apagado (o Karaokê sem som nenhum, por exemplo) abriria uma rodada que não se joga ali.
   * `null` fora do headset: lá vale só o material, como sempre.
   */
  const abremNoHeadset = useMemo(
    () =>
      questNovo
        ? jogosQueAbremNoQuest(listaDeJogos, recursosDoAparelho(perfilDoDispositivo()), {
            idioma: fonte.lang || undefined,
          })
        : null,
    /* `temVoz` muda quando a lista de vozes chega: é o sinal para refazer a pergunta. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questNovo, listaDeJogos, fonte.lang, temVoz],
  );

  const partidaRapida = useCallback(() => {
    play('select');

    /* SORTEIO SO ENTRE JOGOS QUE REGISTRAM. Os nove culturais entravam aqui, entao metade das
       partidas rapidas caia numa rodada que nao gravava nada — e a pessoa que apertou "Partida
       Rapida" duas vezes seguidas podia jogar dez minutos sem um item no historico. */
    const liberados = listaDeJogos.filter((j) => j.estado.ok && (!abremNoHeadset || abremNoHeadset.has(j.id)));
    if (liberados.length === 0) {
      toast.warn(t('Nenhum jogo disponível no momento'));
      return;
    }

    const escolhido = liberados[Math.floor(Math.random() * liberados.length)];
    toast.ok(`${t('Partida rápida:')} ${tituloDoJogo(escolhido, ageProfile)}!`);
    pedirParaJogar(escolhido);
    /* `pedirParaJogar` fica de fora: é uma função comum, recriada a cada render, e incluí-la faria
       este `useCallback` devolver uma referência nova sempre — ou seja, desligaria a memorização
       que é a razão de ele existir. Ela é chamada no momento do clique e lê o estado daquele
       momento; não há captura antiga a corrigir. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaDeJogos, ageProfile, abremNoHeadset]);

  const buscaNormalizada = buscaJogos.trim().toLowerCase();

  /* ── A SUGESTÃO PARA HOJE ──
     Um jogo pronto, na ordem de rendimento de `agruparJogos`, e "Outra sugestão" gira entre eles. */
  const [indiceDaSugestao, setIndiceDaSugestao] = useState(0);
  const [porQueAberto, setPorQueAberto] = useState(false);
  const nomeCurtoDaFonte = baralhoAnki
    ? baralhoAnki.nome
    : (() => {
        const r = ABAS_DE_FONTE.find((a) => a.origem === escolhaAtual.origem)?.rotulo[ageProfile];
        return r ? t(r) : '';
      })();
  const sugestao = useMemo(() => {
    const prontosPorRendimento = agruparJogos(listaDeJogos.map((j) => j.estado)).prontos.filter(
      (p) => !abremNoHeadset || abremNoHeadset.has(p.id),
    );
    if (!prontosPorRendimento.length) return null;
    const alvo = prontosPorRendimento[indiceDaSugestao % prontosPorRendimento.length];
    const jogo = listaDeJogos.find((j) => j.id === alvo.id);
    if (!jogo) return null;
    const vencidos = vencidosAgora.size;
    const nunca = contagemRecortes.nunca;
    const titulo =
      vencidos > 0
        ? tp(vencidos, 'Revisar {n} palavra que voltou a vencer', 'Revisar {n} palavras que voltaram a vencer')
        : nunca > 0
          ? tp(nunca, 'Aprender {n} palavra nova', 'Aprender {n} palavras novas')
          : tp(acervoDaFonte.length, 'Praticar {n} palavra', 'Praticar {n} palavras');
    const porque: [typeof Target, string][] = [
      vencidos > 0
        ? [
            Target,
            t('{n} palavras voltaram a vencer hoje: revisar agora rende mais do que aprender novas.', { n: vencidos }),
          ]
        : [Sparkles, t('Nada está pedindo revisão agora, então vale avançar em material novo.')],
      [
        Timer,
        t('{jogo} é o que mais palavras cobre por rodada com este material.', { jogo: tituloDoJogo(jogo, ageProfile) }),
      ],
      [BookOpen, t('Vem de {fonte}. Troque em Fonte.', { fonte: nomeCurtoDaFonte })],
      [Brain, t('O que você acertar aqui conta na sua revisão.')],
    ];
    return { jogo, titulo, porque };
  }, [
    listaDeJogos,
    indiceDaSugestao,
    vencidosAgora,
    contagemRecortes,
    acervoDaFonte.length,
    ageProfile,
    nomeCurtoDaFonte,
    abremNoHeadset,
  ]);

  const jogosClassicosFiltrados = useMemo(() => {
    return listaDeJogos.filter((j) => {
      if (categoriaAtiva === 'favoritos' && !ordem.fixados.includes(j.id)) return false;
      if (categoriaAtiva === 'classicos' && !CLASSICOS.has(j.id)) return false;
      if (filtroHabilidade !== 'todas' && habilidadeDoJogoClassico(j.id) !== filtroHabilidade) return false;
      if (buscaNormalizada) {
        const titulo = tituloDoJogo(j, ageProfile).toLowerCase();
        const desc = descricaoDoJogo(j, ageProfile, fonte.id === 'trilha').toLowerCase();
        if (!titulo.includes(buscaNormalizada) && !desc.includes(buscaNormalizada)) return false;
      }
      return true;
    });
  }, [listaDeJogos, categoriaAtiva, ordem.fixados, filtroHabilidade, buscaNormalizada, ageProfile, fonte.id]);

  /**
   * O TOUR vive ao lado da tela do jogo, não no lugar dela: ele precisa apontar para os elementos
   * REAIS, com o conteúdo real da pessoa. Por isso cada rodada é envolvida por este ajudante em
   * vez de um `return` direto.
   */
  /**
   * A CASCA COMUM DA RODADA (`T.jogo` do protótipo): cabeçalho, pausa com confirmação de saída,
   * contagem 3-2-1 e o palco onde o tabuleiro do jogo mora — a mesma para todos os jogos.
   * "Recomeçar" remonta a casca e o jogo (chave nova) com os MESMOS itens. No Termo o P é letra,
   * então só o Esc pausa.
   */
  const naCasca = (
    tela: React.ReactNode,
    jogo: MinigameId,
    total: number,
    sair: () => void,
    /** DESENHO NOVO: a rodada acabou e o palco mostra a tela de fim; "Recomeçar" vira "jogar de novo". */
    fim?: { jogarDeNovo: () => void },
  ) => {
    const j = JOGOS.find((x) => x.id === jogo);
    const unidade = unidadeDaRodada(jogo);
    return (
      <CascaDaRodada
        key={chaveDaRodada}
        jogo={jogo}
        titulo={j ? tituloDoJogo(j, ageProfile) : jogo}
        total={total}
        unidade={unidade}
        ageProfile={ageProfile}
        onRecomecar={fim ? fim.jogarDeNovo : () => setChaveDaRodada((k) => k + 1)}
        onSair={sair}
        acabou={!!fim}
        /* No Rali do desenho novo a letra vale mesmo com o campo sem foco: lá o P também é letra. */
        pausaComP={jogo !== 'termo' && !(questNovo && jogo === 'tenis')}
        som={soundEnabled !== undefined && toggleSound ? { ligado: soundEnabled, alternar: toggleSound } : undefined}
      >
        {tela}
      </CascaDaRodada>
    );
  };
  const comTour = (tela: React.ReactNode, jogo: MinigameId) =>
    telaCheia(
      tela,
      tourDe === jogo ? (
        <TourGuiado
          passos={PASSOS_DOS_JOGOS[jogo]}
          titulo={((j) => (j ? tituloDoJogo(j, ageProfile) : ''))(JOGOS.find((j) => j.id === jogo))}
          onFim={() => {
            marcarTourFeito(jogo);
            setTourDe(null);
          }}
        />
      ) : null,
    );

  /**
   * A PARTIDA SAI DA ABA quando esta tela está embutida.
   *
   * Dois motivos, ambos concretos. (1) Todo componente de jogo tem raiz `flex-1 flex flex-col` e
   * conta com um pai flex-column de altura REAL; o container da aba dá altura de conteúdo, então
   * o `flex-1` resolveria para quase nada e a partida colapsaria. (2) O comentário logo abaixo já
   * diz que jogo não divide atenção — dentro da aba, o cabeçalho da sessão e a barra de abas
   * continuariam visíveis e clicáveis, dando para trocar de aba no meio de uma rodada.
   *
   * PRECISA DE PORTAL, e isto foi MEDIDO, não previsto: só `fixed inset-0` não basta. O invólucro
   * da aba na Análise tem `animate-in slide-in-from-bottom-2`, e a animação deixa um
   * `transform: matrix(1,0,0,1,0,0)` — uma transformada IDENTIDADE, que não move nada e mesmo
   * assim cria bloco de contenção para descendentes `fixed`. Resultado medido no navegador: a
   * camada saía 1823×0 em vez de 1920×893, porque passava a se medir por uma div de altura zero.
   * É o mesmo defeito dos popups recortados (ver `lib/posicaoFlutuante.ts`) e a saída é a mesma:
   * renderizar no `body`, fora do alcance de qualquer ancestral.
   *
   * O TOUR VAI JUNTO, mas como IRMÃO da camada, nunca dentro dela: `z-[35]` cria contexto de
   * empilhamento, e o `z-[95]` do tour lá dentro viraria "95 dentro de 35" — seria coberto em vez
   * de cobrir. E ele precisa do mesmo portal, senão herda o mesmo bloco de contenção.
   *
   * `z-[35]` é medido: o mais alto da navegação é a barra do celular (`shell/MobileNav.tsx:25`,
   * `z-30`), renderizada DEPOIS do `<main>`, então empatar em 30 a deixaria por cima. O teto vem
   * das camadas que devem continuar pintando SOBRE a partida — `ParticleCanvas` (`z-[38]`, o
   * confete), `FloatingScoreLayer` (`z-40`, o "+10"), `ComoSeJoga` (`z-[90]`) e `TourGuiado`
   * (`z-[95]`).
   */
  const telaCheia = (n: React.ReactNode, aoLado: React.ReactNode = null) => {
    if (!embutido)
      return (
        <>
          <Suspense fallback={null}>{n}</Suspense>
          <Suspense fallback={null}>{aoLado}</Suspense>
        </>
      );
    return createPortal(
      <>
        <div className="fixed inset-0 z-[35] flex flex-col bg-canvas">
          <Suspense fallback={null}>{n}</Suspense>
        </div>
        <Suspense fallback={null}>{aoLado}</Suspense>
      </>,
      document.body,
    );
  };

  /**
   * A FONTE (faixa escura + gaveta "O que você vai praticar"). Uma função e não um trecho do lobby
   * porque o Mapa abre a MESMA gaveta por cima dele (`soGaveta`): duas cópias divergiriam.
   */
  const fonteIncluiAnki = filtro.baralhos.length > 0 || (filtro.fontes.includes('baralho') && decksAnki.length > 0);
  const seletorDaFonte = (soGaveta = false) => (
    <SeletorDeConteudo
      soGaveta={soGaveta}
      total={acervoDaFonte.length}
      /* O nome curto da ABA, não o título longo do painel de contexto: a linha precisa caber
       ao lado do total e do idioma, e "Revisão do que você ouviu" empurrava o resto. */
      nomeDaFonte={
        filtro.fontes.length > 1
          ? t('{n} fontes', { n: filtro.fontes.length })
          : baralhoAnki
            ? baralhoAnki.nome
            : (() => {
                const r = ABAS_DE_FONTE.find((a) => a.origem === escolhaAtual.origem)?.rotulo[ageProfile];
                return r ? t(r) : '';
              })()
      }
      idioma={fonte.lang ? langLabelNaUI(fonte.lang) : undefined}
      aberta={seletorAberto}
      aoAlternar={() => setSeletorAberto((v) => !v)}
      aoLimpar={() => {
        setFiltro((prev) => ({ ...prev, baralhos: [], recorte: {}, midia: {} }));
      }}
      avisoDeVazio={
        acervoDaFonte.length === 0 &&
        (filtro.recorte.pedindoRevisao ||
          filtro.recorte.nuncaVistas ||
          filtro.midia.comTraducao ||
          filtro.midia.comFrase ||
          filtro.baralhos.length > 0)
          ? t('nenhum item passa; desligue um recorte')
          : undefined
      }
      acoesBarra={
        <>
          <button
            type="button"
            className="btn btn-outline peq"
            onClick={() => setVerRecordes(true)}
            aria-haspopup="dialog"
          >
            <TrophyIcon aria-hidden /> {t('Recordes')}
          </button>
          <button type="button" className="btn btn-outline peq" onClick={() => setVendoMapa(true)}>
            <MapIcon aria-hidden /> {t('Mapa')}
          </button>
          {/* Curadoria só quando a fonte inclui o Anki (protótipo: `E.fonte.origens.includes('anki')`):
              é o baralho de fora que traz o que curar. Com zero, a tela diz "Nada para revisar". */}
          {fonteIncluiAnki && (
            <button
              type="button"
              className="btn btn-outline peq"
              onClick={() => setCurando(true)}
              title={resumoDosPulados(triagem.fora) || t('Ver itens fora do recorte')}
            >
              <ListChecks aria-hidden /> {t('Curadoria')} <span className="n">{triagem.fora.length}</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline peq icone"
            onClick={alternarDetalhes}
            aria-pressed={detalhes}
            aria-label={t('Diagnóstico do material')}
            title={t('Diagnóstico do material')}
          >
            <BarChart2 aria-hidden />
          </button>
        </>
      }
      acoes={
        /* O cartão "Trazer ou gerenciar" do protótipo: sair para o Anki fecha a gaveta
           antes (`fecharGaveta()`), senão ela reabriria ao voltar. */
        <>
          {/* Edição estática: o Anki é lido e guardado no SERVIDOR (`/api/import/anki`, baralhos) —
              sem ele, os dois botões levariam a uma tela que só falha. */}
          {!edicaoEstatica() && (
            <>
              <button
                type="button"
                className="btn btn-outline peq"
                onClick={() => {
                  setSeletorAberto(false);
                  setVendoMapa(false);
                  setImportando(true);
                }}
              >
                <Upload aria-hidden /> {ageProfile === 'kids' ? t('Palavras de fora') : t('Trazer do Anki')}
              </button>
              <button
                type="button"
                className="btn btn-outline peq"
                onClick={() => {
                  setSeletorAberto(false);
                  setVendoMapa(false);
                  setVendoBaralhos(true);
                }}
              >
                <Layers aria-hidden /> {t('Gerenciar baralhos')}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-outline peq"
            aria-expanded={verCobertura}
            onClick={() => setVerCobertura((v) => !v)}
          >
            <Globe aria-hidden /> {t('O que cada idioma tem')}
          </button>
          {/* META QUEST: a sala "O que você vai praticar" continua a um toque, para quem quer um
              idioma que o baralho ainda não tem (na tela de sempre ela só abre na primeira visita). */}
          {questNovo && fontesOferecidas.length > 1 && (
            <button
              type="button"
              className="btn btn-outline peq"
              onClick={() => {
                setSeletorAberto(false);
                setVendoMapa(false);
                setSalaAberta(true);
              }}
            >
              <Languages aria-hidden /> {t('Praticar outro idioma')}
            </button>
          )}
        </>
      }
      /* O app oferece 28 idiomas e não entrega 28 experiências iguais: a tabela diz o que
         cada um tem antes de a pessoa escolher. */
      detalheDasAcoes={verCobertura ? <TabelaDaCobertura baralho={idiomasDoBaralho} /> : undefined}
      facetas={[
        {
          /* IDIOMA É A PRIMEIRA FACETA porque manda em todas as outras: trocar de idioma
           troca o acervo inteiro, e as contagens abaixo passam a falar de outro material.
           Ele morava atrás de um botão que abria um modal — a decisão mais determinante
           da tela era a mais escondida. A lista completa continua na Sala, para quem
           estuda um idioma que ainda não tem palavra nenhuma. */
          id: 'idioma',
          rotulo: t('Idioma'),
          exclusiva: true,
          valor: fonte.lang ? [baseLang(fonte.lang)] : [],
          aoTrocar: (lang) => {
            /* Baralho de OUTRO idioma não sobrevive à troca: ficaria marcado recortando
             para zero, e o motivo não estaria em lugar nenhum da tela. */
            setFiltro((prev) => ({
              ...prev,
              baralhos: prev.baralhos.filter((id) => {
                const d = decksAnki.find((x) => x.id === id);
                return !d?.lang || baseLang(d.lang) === baseLang(lang);
              }),
            }));
            aplicarEscolha({ ...escolhaAtual, lang });
          },
          opcoes: idiomasDoBaralho.map((i) => ({
            id: i.lang,
            rotulo: langLabelNaUI(i.lang),
            contagem: i.jogaveis,
            icone: <LangFlag code={i.lang} className="w-4 h-3" />,
            motivoBloqueio: i.jogaveis === 0 ? t('nenhuma palavra pronta para jogar neste idioma ainda') : undefined,
          })),
        },
        {
          id: 'fonte',
          rotulo: t('De onde vêm'),
          ajuda: t('Marque quantas quiser: elas se somam na rodada.'),
          valor: filtro.fontes.map((f) => (f === 'trilha' ? 'trilha' : 'gravacoes')),
          aoTrocar: (origem) => {
            const alvo = origem === 'trilha' ? ('trilha' as const) : ('baralho' as const);
            setFiltro((prev) => {
              const tinha = prev.fontes.includes(alvo);
              const fontes = tinha ? prev.fontes.filter((f) => f !== alvo) : [...prev.fontes, alvo];
              // Nenhuma fonte marcada não é "tudo", é uma rodada que não abre.
              return fontes.length ? { ...prev, fontes } : prev;
            });
          },
          /* A fonte sem material continua VISÍVEL, travada e com o porquê — some da tela
           era pior: "As que mais escapam" desaparecia sem explicação assim que a pessoa
           revisava bem, que é justamente quando ela merece saber por que sumiu. */
          opcoes: ABAS_DE_FONTE.filter((aba) => aba.origem !== 'dificeis')
            .sort((a, b) => Number(a.origem === 'trilha') - Number(b.origem === 'trilha'))
            .map((aba) => {
              const contagem =
                aba.origem === 'trilha'
                  ? totalDaTrilhaAtual
                  : aba.origem === 'dificeis'
                    ? rankingDeDificeis.length
                    : palavrasDasGravacoes;
              const oferecida = aba.fontes.some((f) => fontesOferecidas.includes(f));
              return {
                id: aba.origem,
                rotulo: t(aba.rotulo[ageProfile]),
                contagem,
                icone:
                  aba.origem === 'trilha' ? (
                    <GraduationCap className="w-3.5 h-3.5" aria-hidden />
                  ) : aba.origem === 'dificeis' ? (
                    <Flame className="w-3.5 h-3.5" aria-hidden />
                  ) : (
                    <Mic className="w-3.5 h-3.5" aria-hidden />
                  ),
                motivoBloqueio: oferecida ? undefined : t(aba.semMaterial),
              };
            }),
        },
        {
          /* A VISÃO DA TRILHA, que não existia. Com o Curso escolhido a gaveta mostrava
           UMA faceta e mais nada — a pessoa via "2.784 palavras" sem saber que elas estão
           organizadas em níveis, nem em qual delas está. O nível já era escolhível, mas só
           dentro do modal; aqui ele fica ao lado da fonte que o governa, com o tamanho de
           cada etapa à vista. "Todos os níveis" é a ausência de recorte, e por isso vem
           primeiro: é o estado em que a trilha nasce. */
          id: 'nivel',
          rotulo: trilha?.escala === 'frequencia' ? t('Faixa do curso') : t('Nível do curso'),
          ajuda:
            trilha?.escala === 'frequencia'
              ? t('Por frequência de uso: a faixa 1 traz as mais comuns.')
              : t('Cada etapa tem o seu vocabulário.'),
          exclusiva: true,
          valor: [fonte.nivel ?? 'todos'],
          aoTrocar: (n) => aplicarEscolha({ ...escolhaAtual, nivel: n === 'todos' ? undefined : (n as CefrLevel) }),
          opcoes:
            fonte.id !== 'trilha' || !trilha
              ? []
              : [
                  {
                    id: 'todos',
                    rotulo: trilha.escala === 'frequencia' ? t('Todas as faixas') : t('Todos os níveis'),
                    contagem: trilhaDe(fonte.lang).total,
                    icone: <BookOpen className="w-3.5 h-3.5" aria-hidden />,
                  },
                  ...trilhaDe(fonte.lang).niveis.map((n) => ({
                    id: n,
                    rotulo: rotuloDaEtapa(n, trilha.escala),
                    contagem: trilha.niveis[n]?.length ?? 0,
                  })),
                ],
        },
        {
          /* A Sala existia para escolher UMA gravação, e cobrava a volta inteira por isso:
           ela repetia idioma, fonte e nível, que já vivem aqui. Como faceta, a escolha
           fica ao lado das outras e a Sala deixa de ser caminho obrigatório. */
          id: 'gravacao',
          rotulo: t('Quais gravações'),
          ajuda: t('Nenhuma marcada = todas.'),
          valor: filtro.sessoes,
          aoTrocar: (id) =>
            setFiltro((prev) => ({
              ...prev,
              sessoes: prev.sessoes.includes(id) ? [] : [id],
              fontes: prev.sessoes.includes(id) ? prev.fontes : ['sessao'],
            })),
          opcoes:
            fonte.id === 'trilha' || sessoesDoIdioma.length < 2
              ? []
              : sessoesDoIdioma.map((s) => ({
                  id: s.id,
                  rotulo: s.title || t('gravação sem título'),
                })),
        },
        {
          id: 'baralho',
          rotulo: t('Quais baralhos'),
          ajuda: t('Nenhum marcado = todos.'),
          valor: filtro.baralhos,
          aoTrocar: (id) =>
            setBaralhoAnki(filtro.baralhos.includes(id) ? null : (decksAnki.find((d) => d.id === id) ?? null)),
          /* SÓ OS BARALHOS DO IDIOMA ESCOLHIDO. Oferecer um baralho japonês com inglês
           selecionado produzia "0 palavras · nenhum item passa" — a tela convidava a uma
           escolha que ela mesma anulava. O idioma do baralho vem do import. */
          opcoes:
            fonte.id === 'trilha'
              ? []
              : decksAnki
                  .filter((d) => !fonte.lang || !d.lang || baseLang(d.lang) === baseLang(fonte.lang))
                  .map((d) => ({
                    id: d.id,
                    icone: <Package className="w-3.5 h-3.5" aria-hidden />,
                    /* O NOME DO BARALHO COMO SE LÊ, não como o Anki o guarda. Dois problemas reais
             do acervo do dono: o `::` da hierarquia do Anki ("4000 Essential English
             Words::1.Book") é sintaxe de arquivo, não nome; e importar o mesmo arquivo
             duas vezes produzia DOIS chips com texto idêntico, impossíveis de distinguir.
             O sufixo só aparece quando há de fato colisão — numerar um baralho único seria
             ruído. */
                    rotulo: (() => {
                      const legivel = d.nome.split('::').filter(Boolean).join(' › ');
                      const homonimos = decksAnki.filter((o) => o.nome === d.nome);
                      return homonimos.length > 1
                        ? t('{nome} ({i} de {n})', {
                            nome: legivel,
                            i: homonimos.indexOf(d) + 1,
                            n: homonimos.length,
                          })
                        : legivel;
                    })(),
                  })),
        },
        {
          id: 'recorte',
          rotulo: t('Recorte'),
          valor: [
            ...(filtro.recorte.dificeis ? ['dificeis'] : []),
            ...(filtro.recorte.pedindoRevisao ? ['pedindoRevisao'] : []),
            ...(filtro.recorte.nuncaVistas ? ['nuncaVistas'] : []),
            ...(filtro.midia.comTraducao ? ['comTraducao'] : []),
            ...(filtro.midia.comFrase ? ['comFrase'] : []),
          ],
          aoTrocar: (id) =>
            setFiltro((prev) =>
              id === 'comTraducao' || id === 'comFrase'
                ? { ...prev, midia: { ...prev.midia, [id]: !prev.midia[id] } }
                : {
                    ...prev,
                    recorte: {
                      ...prev.recorte,
                      [id]: !prev.recorte[id as 'pedindoRevisao' | 'nuncaVistas' | 'dificeis'],
                    },
                  },
            ),
          opcoes:
            fonte.id === 'trilha'
              ? []
              : [
                  {
                    id: 'dificeis',
                    rotulo: t('As que mais escapam'),
                    contagem: rankingDeDificeis.length,
                    icone: <Flame className="w-3.5 h-3.5" aria-hidden />,
                    motivoBloqueio:
                      rankingDeDificeis.length < 4
                        ? t('revise mais um pouco — ainda não há material para uma rodada')
                        : undefined,
                  },
                  {
                    id: 'pedindoRevisao',
                    rotulo: t('Pedindo revisão'),
                    contagem: contagemRecortes.pedindo,
                    icone: <Target aria-hidden />,
                    motivoBloqueio: contagemRecortes.pedindo === 0 ? t('nada vencido neste acervo agora') : undefined,
                  },
                  {
                    id: 'nuncaVistas',
                    rotulo: t('Nunca vistas'),
                    contagem: contagemRecortes.nunca,
                    icone: <Sparkle aria-hidden />,
                    motivoBloqueio:
                      contagemRecortes.nunca === 0 ? t('tudo aqui já foi visto ao menos uma vez') : undefined,
                  },
                  {
                    id: 'comTraducao',
                    rotulo: t('Com tradução'),
                    contagem: contagemRecortes.traducao,
                    icone: <Languages className="w-3.5 h-3.5" aria-hidden />,
                    motivoBloqueio:
                      contagemRecortes.traducao === 0
                        ? t('nenhum item deste acervo tem tradução utilizável')
                        : undefined,
                  },
                  {
                    id: 'comFrase',
                    rotulo: t('Com frase'),
                    contagem: contagemRecortes.frase,
                    icone: <Quote aria-hidden />,
                    motivoBloqueio:
                      contagemRecortes.frase === 0 ? t('nenhum item deste acervo tem frase de exemplo') : undefined,
                  },
                ],
        },
      ]}
    />
  );

  /* A ANTESSALA ocupa a tela como uma rodada ocupa: é a mesma decisão de "não dividir atenção", e
     de quebra herda o `telaCheia` que resolve o `transform` do invólucro da aba. */
  if (antessala) {
    const jogoUI = JOGOS.find((j) => j.id === antessala.jogo);
    const refsAnteriores = ultimaRodada.get(antessala.jogo) ?? [];
    return telaCheia(
      <AntessalaDaRodada
        gameId={antessala.jogo}
        titulo={jogoUI ? tituloDoJogo(jogoUI, ageProfile) : ''}
        nivelGeral={progress.available ? progress.level : undefined}
        maestria={maestria ? { pontos: maestria.get(antessala.jogo) ?? 0 } : null}
        /* Z1 — CHIPS DE DIFICULDADE. Só aparecem onde significam algo: os 5 jogos de frase jogam
           sobre falas, que não têm dificuldade por palavra. Chip inerte ensina que a tela mente. */
        filtroDificuldade={
          aceitaFiltroDeDificuldade(antessala.jogo)
            ? {
                faixas,
                estrategia,
                aoTrocarFaixa: (f: FaixaDificuldade) => {
                  setFaixas((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));
                  if (estrategia === 'auto') setEstrategia('equilibrado'); // chip manual assume o controle
                  setAntessala(null); // o recorte mudou: a prévia atual não vale mais
                },
                aoTrocarEstrategia: (e: EstrategiaDaUI) => {
                  setEstrategia(e);
                  if (e === 'auto') setFaixas([]);
                  setAntessala(null);
                },
                disponivelPorFaixa: contagemPorFaixa,
                minimoDoJogo: MINIGAMES[antessala.jogo]?.minItems ?? 3,
                origemDaComposicao: composicao?.origemDaComposicao ?? 'fallback-local',
              }
            : null
        }
        itens={antessala.previa}
        historico={historico}
        vencidos={vencidosAgora}
        /* Medido contra os `item_ref` GRAVADOS da última rodada deste jogo — os mesmos que o
           "Repetir a última" usa. É o que a lista de palavras fazia mal e agora vem em número. */
        repetidos={repetidosDaUltima(antessala.previa, new Set(refsAnteriores))}
        ageProfile={ageProfile}
        /* O recorte que a pessoa escolheu no lobby seguia até aqui e sumia da tela. `rotuloDaFonte`
           já era calculado neste componente para o lobby, bastava repassar. */
        fonte={{ rotulo: rotuloDaFonte(fonte, sessaoEmUso?.title), idioma: langLabelNaUI(fonte.lang) }}
        duracao={rotuloDeDuracao(estimativaDeMinutos(antessala.previa.length, temposMedidos))}
        /* O MAPA DE FASES: as rodadas passadas deste jogo nesta fonte, com estrelas e rejogar.
           `historico.size` é o nº de itens distintos já jogados — o numerador do % de vocabulário. */
        fases={agruparFases(linhasDaFonte, antessala.jogo)}
        /**
         * A AMOSTRA QUE A TABELA MOSTRA NO HOVER — pela MESMA cerca da prévia.
         *
         * `previaSegura` decide, por jogo, o que pode ir à tela: no Termo e no Caça-palavras a
         * palavra É a resposta e o que sai é a PISTA. Reimplementar a regra aqui seria criar a
         * segunda verdade que os oito ramos de `montarRodada` já criaram uma vez, e que custou o
         * Termo imprimindo a palavra que ia pedir para soletrar.
         *
         * Recortada em quatro de propósito: a linha responde "o que caiu aqui?", não "liste a
         * rodada". O `+N` diz que há mais sem precisar mostrá-los.
         */
        amostraDaFase={(refs) => {
          const crus: ItemCru[] = refs.map((ref) => ({
            ref,
            alvo: ref,
            pista: porPalavra.get(ref.toLowerCase())?.translation ?? undefined,
          }));
          const seguros = previaSegura(antessala.jogo, crus);
          return { textos: seguros.slice(0, 4).map((i) => i.titulo), total: seguros.length };
        }}
        onJogarFase={(refs) => {
          const r = montarRodada(antessala.jogo, null, new Set(refs));
          /* CLIQUE MORTO NUNCA MAIS — a mesma regra de `pedirParaJogar`. Este `if` era mudo, e foi
             assim que a régua de letras derrubando uma fase antiga virou "o botão não faz nada".
             O material pode ter sumido de verdade (palavra removida do baralho), e aí a pessoa
             precisa saber disso em vez de clicar de novo. */
          if (r) setAntessala(r);
          else toast.error('Não deu para remontar esta fase: as palavras dela não estão mais no material desta fonte.');
        }}
        acervoTotal={acervoDaFonte.length}
        itensJogados={historico.size}
        /* SELEÇÃO v2 — o "por que estas?", o Auto com motivo, a etapa, os leeches e o resgate. */
        estados={
          new Map<string, EstadoDoItem>(antessala.previa.map((i) => [i.ref, estadoDoItem(historico.get(i.ref))]))
        }
        leeches={leechesDoAcervo}
        onResgate={
          leechesDoAcervo.length
            ? () => {
                // Só as difíceis + 2 firmes/aprendendo para dar respiro; sem cronômetro de combo aqui.
                const firmes = acervoDaFonte
                  .filter((c) => {
                    const t = estadoDoItem(historico.get(c.word)).tag;
                    return t === 'firme' || t === 'aprendendo';
                  })
                  .slice(0, 2)
                  .map((c) => c.word);
                const r = montarRodada(antessala.jogo, null, new Set([...leechesDoAcervo, ...firmes]));
                if (r) setAntessala(r);
                else toast.warn('Este jogo precisa de mais itens para a rodada de resgate. Tente outro jogo.');
              }
            : null
        }
        auto={
          estrategia === 'auto' && aceitaFiltroDeDificuldade(antessala.jogo)
            ? (() => {
                const d = decisaoAuto(antessala.jogo);
                faixaAutoAtualRef.current[antessala.jogo] = d.faixa;
                return { faixa: d.faixa, motivo: d.motivo };
              })()
            : null
        }
        diagnosticoTermo={antessala.jogo === 'termo' ? diagnosticoTermo(acervoDaFonte) : null}
        etapa={fonte.id === 'trilha' && etapaDaTrilha ? etapaDaTrilha.nome : null}
        onJogar={() => trocarTela('antessala', 'partida', () => comecar(antessala))}
        onTrocar={() => {
          const naTela = new Set<string>(antessala.previa.map((i) => i.ref));
          const nova = montarRodada(antessala.jogo, null, undefined, naTela);
          if (nova) setAntessala(nova);
        }}
        onRepetir={
          refsAnteriores.length
            ? () => {
                const r = montarRodada(antessala.jogo, null, new Set(refsAnteriores));
                if (r) setAntessala(r);
              }
            : null
        }
        onSair={() => trocarTela('antessala', 'jogar', () => setAntessala(null))}
        onComoSeJoga={() => setExplicando(antessala.jogo)}
        pularSempre={pularSempre}
        onMudarPularSempre={mudarPularSempre}
      />,
      /* "Como se joga" abre POR CIMA da antessala (é `fixed inset-0 z-[90]`), como o diálogo do
         protótipo: fechar devolve à mesma prévia, e "Jogar" começa ESTA rodada, não uma nova. */
      explicando === antessala.jogo && jogoUI ? (
        <ComoSeJoga
          jogo={antessala.jogo}
          titulo={tituloDoJogo(jogoUI, ageProfile)}
          ageProfile={ageProfile}
          onJogar={() => {
            setExplicando(null);
            comecar(antessala);
          }}
          onFechar={() => setExplicando(null)}
        />
      ) : null,
    );
  }

  /**
   * SAIR NO MEIO encerra a corrente.
   *
   * Sem confirmação: pedir "tem certeza?" é justamente o atrito que esta entrega existe para
   * tirar. E a rodada parcial continua sendo perdida — nenhum dos nove jogos expõe relatório
   * parcial, e mudar isso são nove componentes noutra entrega. O que o placar tinha somado até
   * aqui aparece uma última vez na pílula do lobby, para o número não ser apagado em silêncio.
   */
  const sairDaRodada = (limpar: () => void) => () =>
    trocarTela('partida', 'jogar', () => {
      limpar();
      encerrarCorrente();
    });

  // Rodada em curso ou recompensa a revelar ocupam a tela inteira — jogo não divide atenção.
  if (rodadaTermo) {
    return comTour(
      naCasca(
        <TermoGame
          rodadas={rodadaTermo}
          ageProfile={ageProfile}
          onFinish={aoTerminar}
          onExit={sairDaRodada(() => setRodadaTermo(null))}
        />,
        'termo',
        rodadaTermo.length,
        sairDaRodada(() => setRodadaTermo(null)),
      ),
      'termo',
    );
  }
  if (rodadaFrase) {
    return comTour(
      naCasca(
        <ScrambleGame
          rodadas={rodadaFrase}
          ageProfile={ageProfile}
          onFinish={aoTerminar}
          onExit={sairDaRodada(() => setRodadaFrase(null))}
        />,
        'scramble',
        rodadaFrase.length,
        sairDaRodada(() => setRodadaFrase(null)),
      ),
      'scramble',
    );
  }
  if (rodadaEscuta) {
    return comTour(
      naCasca(
        <EscutaGame
          rodadas={rodadaEscuta}
          audioUrl={audioParaJogos}
          ageProfile={ageProfile}
          onFinish={aoTerminar}
          onExit={sairDaRodada(() => setRodadaEscuta(null))}
        />,
        'escuta',
        rodadaEscuta.length,
        sairDaRodada(() => setRodadaEscuta(null)),
      ),
      'escuta',
    );
  }
  if (rodadaDitado) {
    return comTour(
      naCasca(
        <DitadoGame
          rodadas={rodadaDitado}
          audioUrl={audioParaJogos}
          ageProfile={ageProfile}
          onFinish={aoTerminar}
          onExit={sairDaRodada(() => setRodadaDitado(null))}
        />,
        'ditado',
        rodadaDitado.length,
        sairDaRodada(() => setRodadaDitado(null)),
      ),
      'ditado',
    );
  }
  if (rodadaConectores) {
    return comTour(
      naCasca(
        <ConectoresGame
          rodadas={rodadaConectores}
          ageProfile={ageProfile}
          onFinish={aoTerminar}
          onExit={sairDaRodada(() => setRodadaConectores(null))}
        />,
        'conectores',
        rodadaConectores.length,
        sairDaRodada(() => setRodadaConectores(null)),
      ),
      'conectores',
    );
  }
  if (rodadaKaraoke) {
    return comTour(
      naCasca(
        <KaraokeGame
          falas={rodadaKaraoke}
          audioUrl={audioParaJogos}
          ageProfile={ageProfile}
          onFinish={aoTerminar}
          onExit={sairDaRodada(() => setRodadaKaraoke(null))}
        />,
        'karaoke',
        rodadaKaraoke.length,
        sairDaRodada(() => setRodadaKaraoke(null)),
      ),
      'karaoke',
    );
  }
  if (rodada) {
    const cartoesDoBaralho = new Map((deck ?? []).map((c) => [c.id, c]));
    const comuns = {
      items: rodada.itens,
      ageProfile,
      onFinish: aoTerminar,
      onExit: sairDaRodada(() => setRodada(null)),
      /* A pele de cartão nos jogos que desenham cartão (Memória): o estado sai do cartão real. */
      estadoDoCartao: (cardId: string) => {
        const c = cartoesDoBaralho.get(cardId);
        return c ? estadoDoCartao(c) : null;
      },
    };
    const Tela = TELA_DO_JOGO[rodada.jogo];
    if (Tela)
      return comTour(naCasca(<Tela {...comuns} />, rodada.jogo, rodada.itens.length, comuns.onExit), rodada.jogo);
  }
  /* O FIM DA RODADA (`T.resultado` do protótipo): estrelas, raspadinha e o que escapou num cartão
     só. Era a raspadinha e, atrás de um botão, o resumo dos erros noutra tela; o resumo agora abre
     logo abaixo, na mesma. Quais palavras você errou era gravado (uma linha por item em
     `exercise_results`) e nunca mostrado — continua aqui, com tradução e nível do baralho. */
  if (resultado) {
    const porRef = new Map((deck ?? []).map((c) => [String(c.word).toLowerCase(), c]));
    /* "Próximo jogo" (`jogos.js:308`): o seguinte na ordem do protótipo que dá para abrir agora. */
    const proximoJogo =
      jogosSeguintes(resultado.gameId).find((id) => {
        const j = listaDeJogos.find((x) => x.id === id);
        return !!j?.estado.ok && (!abremNoHeadset || abremNoHeadset.has(id));
      }) ?? null;
    const itensResumo: ItemDaRodada[] = resultado.items.map((o) => {
      const c = porRef.get(String(o.itemRef).toLowerCase());
      return {
        itemRef: o.itemRef,
        cardId: o.cardId ?? null,
        correct: !!o.correct,
        attempts: o.attempts ?? 1,
        hinted: !!o.hinted,
        back: (c as { translation?: string | null } | undefined)?.translation ?? null,
        cefrLevel: (c as { cefrLevel?: string | null } | undefined)?.cefrLevel ?? null,
        cefrSource: c?.cefrSource ?? null,
        occurrences: (c as { occurrences?: number | null } | undefined)?.occurrences ?? null,
      };
    });
    const telaDoFim = (
      <ResultadoDaRodada
        report={resultado}
        jogo={((j) => (j ? tituloDoJogo(j, ageProfile) : resultado.gameId))(
          JOGOS.find((j) => j.id === resultado.gameId),
        )}
        ageProfile={ageProfile}
        sequencia={resumir(sequencia)}
        recorde={recordeDoJogo(resultado.gameId)}
        itens={itensResumo}
        progress={progress}
        onContinuar={continuarSequencia}
        /* Sem `item_ref` gravado não há como remontar — e botão inerte ensina que a tela quebrou. */
        onRepetir={refsDoResultado.length ? repetirSequencia : null}
        onRefazerErradas={(erradas) => {
          /* Mesmo recorte de `refsDoResultado` lá em cima: item sem `itemRef` não identifica nada
             e, dentro de `montarRodada`, só seria comparado com `has(<string>)` — nunca casaria. */
          const refs = new Set(erradas.map((e) => e.itemRef).filter((r): r is string => !!r));
          /* "Refazer só as erradas" prioriza os refs que falharam; o construtor completa com o
             mesmo recorte quando não houver itens suficientes (o jogo tem mínimo). */
          const nova = montarRodada(resultado.gameId, null, undefined, refs);
          if (nova) setAntessala(nova);
          else continuarSequencia();
        }}
        onDone={questNovo ? () => trocarTela('partida', 'jogar', sairDaSequencia) : sairDaSequencia}
        semMaterial={semMaterial}
        onPularVez={saldoSeeds >= CUSTO_PULAR && !gastando ? pularVez : null}
        custoPular={CUSTO_PULAR}
        saldoSeeds={saldoSeeds}
        onVerProgressao={() => onChangeView('loja', { aba: 'progressao' })}
        maestria={maestriaDaRodada}
        gravacao={gravacaoDaRodada}
        total={totalDoFim}
        proximo={proximoJogo}
        onProximo={(id) => pedirParaJogar({ id }, false, 'partida')}
        onJogarDeNovo={jogarDeNovo}
      />
    );
    /* DESENHO NOVO: a tela de fim mora DENTRO do palco, com o cabeçalho e o placar da rodada ainda na
       tela, como o `pjFim` do protótipo (`jogos.js:296-328`). A casca é a MESMA da rodada (mesma chave,
       mesmo lugar na árvore): ela não remonta, e por isso a tela não "entra" de novo. */
    if (questNovo)
      return comTour(
        naCasca(
          <Suspense fallback={null}>{telaDoFim}</Suspense>,
          resultado.gameId,
          totalDoFim,
          () => trocarTela('partida', 'jogar', sairDaSequencia),
          { jogarDeNovo },
        ),
        resultado.gameId,
      );
    return telaCheia(telaDoFim);
  }
  /* "Como se joga" (o "?" da carta) abre POR CIMA do lobby, como o `dialogoComo()` do protótipo:
     é um `<dialog>` modal, que vive na camada do topo e não precisa de portal nem de tela própria. */
  const fichaDoComo = explicando
    ? (() => {
        const carta = JOGOS.find((j) => j.id === explicando)!;
        return (
          <ComoSeJoga
            jogo={explicando}
            titulo={tituloDoJogo(carta, ageProfile)}
            ageProfile={ageProfile}
            onJogar={() => {
              setExplicando(null);
              pedirParaJogar({ id: explicando });
            }}
            onFechar={() => setExplicando(null)}
          />
        );
      })()
    : null;
  /* A TELA DO ANKI É UMA SÓ (protótipo `T.anki`): Trazer, Levar embora e Gerenciar são abas dela.
     "Gerenciar baralhos" (gaveta Fonte) abre a mesma tela já na aba Gerenciar. */
  if (importando || vendoBaralhos) {
    const sair = () => {
      setImportando(false);
      setVendoBaralhos(false);
    };
    const relerDeck = async () => {
      void recarregarBaralhosAnki();
      try {
        setDeck((await fetchDeck()).filter((c) => c.inDeck));
      } catch {
        /* mantém */
      }
    };
    return telaCheia(
      <Suspense fallback={null}>
        <BaralhoAnki
          deck={deck ?? []}
          idioma={fonte.lang}
          idiomaNativo={idiomaNativo}
          ageProfile={ageProfile}
          abaInicial={vendoBaralhos ? 'baralhos' : 'trazer'}
          onVoltar={sair}
          onImportou={relerDeck}
          onMudouBaralhos={relerDeck}
          /* Depois de ativar: recorta pelo baralho recém-trazido e ABRE o jogo (ver `jogoPendente`). */
          onJogarCom={(id, nome) => {
            setBaralhoAnki({ id, nome });
            setJogoPendente({ jogo: 'memory', baralho: id });
            sair();
          }}
          /* O IDIOMA VEM JUNTO. Recortar por um baralho de japonês sem sair do inglês deixava a
           gaveta — que lista baralhos do idioma vigente — sem o chip do baralho recortado. */
          onJogarSoCom={(id, nome, lang) => {
            setBaralhoAnki({ id, nome });
            if (lang && baseLang(lang) !== baseLang(fonte.lang)) trocarIdioma(lang);
            sair();
            toast.ok(t('Jogando só com este baralho'));
          }}
        />
      </Suspense>,
    );
  }
  if (vendoMapa) {
    /* Os itens do mapa saem da MESMA fonte que alimenta a rodada — se saíssem de outro lugar, o
       mapa e o jogo falariam de conjuntos diferentes, que é exatamente o defeito que a barra da
       trilha tinha ("22% do A1" enquanto a rodada entregava 28 cartas).

       O MAPA MOSTRA A PALAVRA, e a antessala não: `MAPA_REVELA_ALVO` (em `revelavel.ts`) é a
       exceção declarada à regra anti-spoiler, com o porquê escrito lá. Em resumo: o mapa é
       retrospectivo e somente-leitura, sobre o acervo inteiro, uma lista de "7 letras · nunca
       caiu" repetida quatrocentas vezes não responderia nada. */
    void MAPA_REVELA_ALVO;
    /* O MAPA VÊ O ACERVO INTEIRO, não o recorte da rodada.
       A intenção original ("mapa e jogo falam do mesmo conjunto") continua valendo: o conjunto é
       a FONTE. O teto de 200 é artefato da composição, não propriedade da fonte, e vazava para
       cá, fazendo o mapa anunciar "200 itens no conjunto" e "2% deste conjunto já apareceu"
       sobre um baralho de 1.902. Um resumo de cobertura calculado sobre 10% do acervo é pior
       que nenhum: o usuário decide o que estudar com base nele. */
    const doBaralho = acervoDaFonte.map((c) => {
      const h = historico.get(c.word);
      return {
        ref: c.word,
        titulo: c.word,
        pista: c.translation,
        vencido: vencidosAgora.has(c.word),
        vezes: h?.vezes ?? 0,
        erros: h?.erros ?? 0,
        ultimoAcerto: h?.ultimoAcerto ?? true,
      };
    });
    const dasFalas = frases.map((f) => {
      const h = historico.get(f.id);
      return {
        ref: f.id,
        titulo: f.text,
        pista: f.translation,
        vencido: false,
        vezes: h?.vezes ?? 0,
        erros: h?.erros ?? 0,
        ultimoAcerto: h?.ultimoAcerto ?? true,
      };
    });
    return telaCheia(
      <>
        <MapaDoConteudo
          titulo={rotuloDaFonte(fonte, sessaoEmUso?.title)}
          /* Na sessão o material É a fala; nas outras fontes é a palavra. Misturar os dois daria
           uma lista que não corresponde a rodada nenhuma. */
          itens={fonte.id === 'sessao' ? dasFalas : doBaralho}
          ageProfile={ageProfile}
          onVoltar={() => setVendoMapa(false)}
          niveis={
            fonte.id === 'trilha' && trilha
              ? progressoDaTrilha(
                  trilha,
                  new Set(doBaralho.filter((i) => i.vezes > 0).map((i) => chaveDaPalavra(i.ref))),
                ).map((p) => ({ nivel: p.nivel, total: p.total, jaCairam: p.jaTem, pct: p.pct }))
              : undefined
          }
          nivelAtivo={fonte.nivel}
          onEscolherNivel={
            fonte.id === 'trilha' ? (n) => setFonte((f) => ({ ...f, nivel: n as CefrLevel })) : undefined
          }
          historicoDesde={historicoDesde}
          onTrocarFonte={() => setSeletorAberto(true)}
        />
        {seletorAberto && seletorDaFonte(true)}
      </>,
    );
  }
  if (curando) {
    return telaCheia(
      <CuradoriaBaralho
        triagem={triagem}
        idioma={fonte.lang}
        ageProfile={ageProfile}
        onVoltar={() => setCurando(false)}
        onMudou={async () => {
          try {
            setDeck((await fetchDeck()).filter((c) => c.inDeck));
          } catch {
            /* mantém */
          }
        }}
      />,
    );
  }

  /**
   * A SALA DE ESCOLHA, montada FORA da cascata de early returns.
   *
   * Se ela dependesse do baralho carregado, a tela abriria em esqueleto e a sala apareceria depois
   * — um salto visual logo na entrada, que é o oposto do que ela existe para resolver. As
   * contagens que ainda não chegaram aparecem como zero e se preenchem sozinhas; o `Segmentado`
   * já mostra o motivo quando uma opção está sem material.
   *
   * NÃO MONTA quando `fontesDisponiveis` devolve uma fonte só — que é exatamente o caso do modo
   * embutido (dentro de uma sessão, a fonte É aquela sessão). A garantia passa a ser DERIVADA da
   * mesma função que o resto da tela consulta, em vez de repetida num `!embutido` solto.
   */
  const sala =
    salaAberta && fontesOferecidas.length > 1 ? (
      <SalaDeEscolha
        escolhaAtual={escolhaDaFonte(fonte)}
        idiomas={idiomasDoBaralho}
        gravacoes={sessoes}
        trilhaDe={trilhaDe}
        prefetchTrilha={prefetchTrilha}
        dificeis={rankingDeDificeis.length}
        ageProfile={ageProfile}
        aoFechar={() => setSalaAberta(false)}
        aoConfirmar={(escolha) => {
          setSalaAberta(false);
          aplicarEscolha(escolha);
        }}
      />
    ) : null;

  if (deck === null && !erro) {
    if (embutido && ladrilhos) return <>{ladrilhos(null, () => {})}</>;
    /* META QUEST: a espera tem a forma do que vai chegar (o cabeçalho, as abas e a grade de cartões). */
    if (questNovo && !embutido && !lobbyCompletoNoQuest) {
      return (
        <>
          {sala}
          <div className="q-palco qj quest-jogar" aria-busy="true" data-testid="lobby-do-quest-carregando">
            <div className="q-cab">
              <div>
                <p className="q-sobre">{t('Carregando o seu material')}</p>
                <h1>{t('Jogar')}</h1>
              </div>
            </div>
            <div className="q-esqueleto qj-esqueleto-abas" aria-hidden />
            <div className="q-grade g4" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="q-esqueleto qj-esqueleto-jogo" />
              ))}
            </div>
          </div>
        </>
      );
    }
    const esqueleto = (
      <>
        {sala}
        <div className="h-24 rounded-2xl bg-surface border border-border-subtle animate-pulse mb-6" aria-hidden />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-surface border border-border-subtle animate-pulse"
              aria-hidden
            />
          ))}
        </div>
      </>
    );
    /* Fora da sessão, a espera usa a MESMA moldura da tela pronta (`Tela`: `.rolagem` > `.tela.larga`).
       Com um `p-6` próprio ela nascia inset 24 px e, ao chegar o baralho, a tela saltava para a margem
       dela: CLS de 0,16 no celular. */
    return embutido ? <div>{esqueleto}</div> : <MolduraDaTela largura="larga">{esqueleto}</MolduraDaTela>;
  }

  /* Os dois grupos do protótipo, já filtrados por aba, habilidade e busca. */
  const prontosFiltrados = jogosClassicosFiltrados.filter((j) => j.estado.ok);
  const filtrado = buscaJogos.trim() !== '' || filtroHabilidade !== 'todas' || categoriaAtiva !== 'todos';
  const presosFiltrados = jogosClassicosFiltrados.filter((j) => !j.estado.ok);
  /* Na sessão, só os TRÊS mais perto de abrir (protótipo, `abaJogosSessao`: `.slice(0,3)`); a
     ordem já é "o que falta menos primeiro" (`agruparJogos`). */
  const presosVisiveis = embutido ? presosFiltrados.slice(0, 3) : presosFiltrados;
  /* "Com mais uma palavra desta sessão, estes abrem." — dito com o número REAL quando os três
     esperam palavras; se algum espera outra coisa (falas, áudio), a frase não promete palavra. */
  const descDosPresosDaSessao = (() => {
    const soPalavras = presosVisiveis.every((j) => j.estado.fonte === 'baralho' && !j.estado.motivo);
    const falta = Math.max(0, ...presosVisiveis.map((j) => j.estado.faltam));
    if (!soPalavras || falta < 1) return t('Com mais material desta sessão, estes abrem. Cada um diz o que falta.');
    return falta === 1
      ? t('Com mais uma palavra desta sessão, estes abrem.')
      : t('Com mais {n} palavras desta sessão, estes abrem.', { n: falta });
  })();

  /* A CARTA DO JOGO — marcação do protótipo aprovado (`cardJogo`): arte em pixel na grade com o
     ponto da família, estrela (fixar no topo) e "como se joga"; título, descrição e o pé com
     "Jogar" e a conta desta rodada. Presa, a carta é tracejada e o pé diz o que falta. */
  /* O PÉ DA CARTA: a conta da rodada quando o jogo abre, ou o que falta quando não abre. Fora de
     `cartaDoJogo` porque o lobby do Quest diz o mesmo motivo com as mesmas palavras. */
  const notaDoJogo = (j: (typeof jogosClassicosFiltrados)[number]) => {
    const liberado = j.estado.ok;
    const unidade = (n: number) => (j.estado.fonte === 'falas' ? tp(n, 'fala', 'falas') : tp(n, 'palavra', 'palavras'));
    return (() => {
      if (liberado) {
        const total = ('pool' in j.estado ? j.estado.pool : undefined) ?? j.estado.disponiveis;
        const naRodada = j.estado.tamanhoDaRodada;
        const conta =
          naRodada < total
            ? t('{n} nesta rodada · {total} disponíveis', { n: naRodada, total })
            : t('{n} {unidade} nesta rodada', { n: naRodada, unidade: unidade(naRodada) });
        const rec = recordeDoJogo(j.id) ?? 0;
        return rec > 0 ? `${conta} · ${t('recorde {n}', { n: rec })}` : conta;
      }
      const motivo = 'motivo' in j.estado ? j.estado.motivo : undefined;
      /* Só o Caça-conectores cai aqui: a Frase embaralhada JOGA com as frases da trilha, então
         "a trilha tem palavras soltas" era falso. O que falta é conector (4,5% das frases). */
      if (motivo === 'trilha-sem-frase')
        return ageProfile === 'kids'
          ? t('as frases da trilha quase não têm conector')
          : t('as frases da trilha quase nunca têm conector; escolha uma gravação');
      if (motivo === 'sem-voz')
        return t('este navegador não tem voz em {idioma}', { idioma: langLabelNaUI(fonte.lang) });
      if (motivo === 'escrita-sem-separacao')
        return ageProfile === 'kids'
          ? t('em {idioma} as palavras ficam juntinhas, sem espaço', { idioma: langLabelNaUI(fonte.lang) })
          : t('este jogo separa as palavras da frase, e {idioma} não marca onde cada uma começa', {
              idioma: langLabelNaUI(fonte.lang),
            });
      if (motivo === 'audio-carregando') return t('baixando o áudio da gravação…');
      if (j.estado.fonte === 'falas' && j.estado.disponiveis === 0) return t('precisa de uma gravação com legenda');
      const precisa = MINIGAMES[j.id].minItems;
      const falta = tp(j.estado.faltam, 'falta {n} {unidade}', 'faltam {n} {unidade}', {
        unidade: unidade(j.estado.faltam),
      });
      return ageProfile === 'kids'
        ? t('{falta} para abrir', { falta })
        : t('{falta} · precisa de {precisa}', { falta, precisa });
    })();
  };
  const cartaDoJogo = (j: (typeof jogosClassicosFiltrados)[number]) => {
    const liberado = j.estado.ok;
    const fixado = ordem.fixados.includes(j.id);
    const titulo = tituloDoJogo(j, ageProfile);
    const jogar = () => {
      play('select');
      pedirParaJogar(j);
    };
    const porta = liberado ? null : comoDesbloquear(j.estado, contextoDoDesbloqueio);
    const nota = notaDoJogo(j);
    return (
      <article
        key={j.chave}
        className={`cartao jogo ${liberado ? 'clicavel' : 'tracejado'}`}
        onClick={liberado ? jogar : undefined}
      >
        <div className="arte">
          <span className="cat" style={{ background: tomDoJogo(j.id) }} aria-hidden />
          <IconePixel id={j.id} />
          <button
            type="button"
            className="fav"
            aria-pressed={fixado}
            aria-label={`${fixado ? t('Tirar dos favoritos') : t('Favoritar')}: ${titulo}`}
            onClick={(e) => {
              e.stopPropagation();
              mexerNaOrdem(alternarFixado(ordem, j.id));
            }}
          >
            <Star aria-hidden style={fixado ? { fill: 'var(--warn)', color: 'var(--warn)' } : undefined} />
          </button>
          <button
            type="button"
            className="como"
            aria-label={`${t('Como se joga')}: ${titulo}`}
            onClick={(e) => {
              e.stopPropagation();
              setExplicando(j.id);
            }}
          >
            <CircleHelp aria-hidden />
          </button>
        </div>
        <div className="corpo">
          <h3>
            {!liberado && <Lock aria-hidden />}
            {/* O título é o botão da carta (nome acessível = nome do jogo); sem mudar o desenho. */}
            <button
              type="button"
              disabled={!liberado}
              onClick={(e) => {
                e.stopPropagation();
                jogar();
              }}
              style={{
                border: 0,
                background: 'none',
                padding: 0,
                textAlign: 'left',
                cursor: liberado ? 'pointer' : 'default',
              }}
            >
              {titulo}
            </button>
          </h3>
          <p>{descricaoDoJogo(j, ageProfile, fonte.id === 'trilha')}</p>
          {modoOrganizar && (
            <div className="linha" style={{ gap: 4, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
              {[
                { Icone: ChevronLeft, dir: -1 as const, rot: t('Mover para a esquerda') },
                { Icone: ChevronRight, dir: 1 as const, rot: t('Mover para a direita') },
              ].map(({ Icone, dir, rot }) => (
                <button
                  key={dir}
                  type="button"
                  className="btn btn-outline peq icone"
                  onClick={() => mexerNaOrdem(mover(ordem, idsVisiveis, j.id, dir))}
                  aria-label={`${rot}: ${titulo}`}
                  title={rot}
                >
                  <Icone aria-hidden />
                </button>
              ))}
            </div>
          )}
          <div className="pe">
            {liberado ? (
              <button
                type="button"
                className="btn btn-solid peq"
                aria-label={`${t('Jogar')}: ${titulo}`}
                onClick={(e) => {
                  e.stopPropagation();
                  jogar();
                }}
              >
                <IconePlay aria-hidden /> {t('Jogar')}
              </button>
            ) : porta ? (
              <button type="button" className="btn btn-outline peq" onClick={() => abrirPorta(porta)}>
                {porta.rotulo} <ChevronRight aria-hidden />
              </button>
            ) : null}
            <span className="nota">{nota}</span>
          </div>
        </div>
      </article>
    );
  };

  /* META QUEST (maquete de 01/10/2026, tela 5; completa na segunda rodada): a grade de cartões grandes
     no lugar do lobby, com TODAS as funções dele. O estado é o deste componente (a aba, a busca, a
     habilidade, a ordem, a prévia, a sugestão, o diagnóstico); `LobbyDoQuest` só apresenta. O chip da
     fonte abre a mesma gaveta de sempre, e "Tela de sempre" (em Opções) devolve o lobby do computador
     nesta visita. Dentro de uma sessão (`embutido`) nada muda. */
  if (embutido && ladrilhos)
    return (
      <>
        {ladrilhos(
          carregandoTrilha
            ? null
            : tilesDoQuest(listaDeJogos, recursosDoAparelho(perfilDoDispositivo()), notaDoJogo, {
                idioma: fonte.lang || undefined,
              }),
          (id) => {
            play('select');
            pedirParaJogar({ id });
          },
        )}
      </>
    );
  if (questNovo && !embutido && !lobbyCompletoNoQuest) {
    const semAcervo = tamanhoDoBaralho < menorMinimo && fonte.id !== 'trilha';
    return (
      <>
        {sala}
        {fichaDoComo}
        {verRecordes && (
          <Suspense fallback={null}>
            <Recordes ageProfile={ageProfile} onFechar={() => setVerRecordes(false)} />
          </Suspense>
        )}
        {/* A fonte: a mesma gaveta de sempre (as seis facetas e "Trazer ou gerenciar"), sem a faixa. */}
        {seletorAberto && seletorDaFonte(true)}
        <LobbyDoQuest
          jogos={jogosClassicosFiltrados}
          ageProfile={ageProfile}
          naTrilha={fonte.id === 'trilha'}
          palavras={acervoDaFonte.length}
          fonte={[fonte.lang ? langLabelNaUI(fonte.lang) : '', nomeCurtoDaFonte].filter(Boolean).join(' · ')}
          notaDoBloqueio={notaDoJogo}
          /* A voz de leitura é conferida no idioma do baralho (`jogosNoQuest`, `VozParaOQuest`). */
          voz={{ idioma: fonte.lang || undefined }}
          aoJogar={(j) => {
            play('select');
            pedirParaJogar(j);
          }}
          aoTrocarFonte={fontesOferecidas.length > 1 ? () => setSeletorAberto(true) : undefined}
          aoVerTelaCompleta={() => setLobbyCompletoNoQuest(true)}
          aoPartidaRapida={partidaRapida}
          categoria={categoriaAtiva}
          aoTrocarCategoria={(id) => {
            setCategoriaAtiva(id);
            play('select');
          }}
          contagens={{
            todos: listaDeJogos.length,
            classicos: listaDeJogos.filter((j) => CLASSICOS.has(j.id)).length,
            favoritos: ordem.fixados.length,
          }}
          busca={buscaJogos}
          aoBuscar={setBuscaJogos}
          habilidade={filtroHabilidade}
          aoTrocarHabilidade={(id) => {
            setFiltroHabilidade(id);
            play('select');
          }}
          aoLimparFiltros={() => {
            setBuscaJogos('');
            setFiltroHabilidade('todas');
            setCategoriaAtiva('todos');
          }}
          favoritos={ordem.fixados}
          aoFavoritar={(j) => mexerNaOrdem(alternarFixado(ordem, j.id))}
          aoComoSeJoga={(j) => setExplicando(j.id)}
          previa={!pularSempre}
          aoTrocarPrevia={(ligada) => mudarPularSempre(!ligada)}
          ordem={ordenados}
          ordemEscolhida={ordem.ordem}
          /* A seta troca com o vizinho que o PAINEL mostra (a ordem da grade do headset). */
          aoMover={(j, direcao, visiveis) => mexerNaOrdem(mover(ordem, visiveis, j.id, direcao))}
          sugestao={semAcervo ? null : sugestao}
          aoOutraSugestao={() => setIndiceDaSugestao((n) => n + 1)}
          aoVerRecordes={() => setVerRecordes(true)}
          aoVerMapa={() => setVendoMapa(true)}
          curadoria={fonteIncluiAnki ? { n: triagem.fora.length, aoAbrir: () => setCurando(true) } : undefined}
          diagnostico={{
            ligado: detalhes,
            aoTrocar: alternarDetalhes,
            /* As explicações são as do `title` da tela de sempre: no headset não há hover, ficam escritas. */
            itens: [
              {
                icone: Check,
                texto: t('{n} no idioma', { n: numero(contagem.total) }),
                explicacao: t('{n} palavras do idioma escolhido passaram na régua de qualidade.', {
                  n: contagem.total,
                }),
              },
              {
                icone: Languages,
                texto: t('{n} com tradução', { n: numero(pistas.comTraducao.length) }),
                explicacao: t('Jogos de par precisam de tradução.'),
              },
              {
                icone: Quote,
                texto: t('{n} só com frase', { n: numero(pistas.soComFrase.length) }),
                explicacao: t('Sem tradução, mas com frase real.'),
              },
              ...(coreOnly(ageProfile)
                ? []
                : [
                    {
                      icone: Globe,
                      texto: t('{n} em outro idioma', { n: numero(triagem.outroIdioma.length) }),
                      explicacao: t('Existem e prestam, mas são de outro idioma'),
                    },
                  ]),
              {
                icone: Filter,
                texto: t('{n} fora do recorte', { n: numero(triagem.fora.length) }),
                explicacao: resumoDosPulados(triagem.fora) || undefined,
              },
              { icone: CircleDashed, texto: t('{n} nunca caíram', { n: numero(nuncaCairam) }) },
            ],
          }}
          portaDoJogo={(j) => {
            const porta = comoDesbloquear(j.estado, contextoDoDesbloqueio);
            return porta ? { rotulo: porta.rotulo, aoAbrir: () => abrirPorta(porta) } : null;
          }}
          correnteEncerrada={ultimaCorrente}
          trilha={
            fonte.id === 'trilha' && trilha ? (
              <PainelTrilha
                dado={trilha}
                deck={deck ?? []}
                ageProfile={ageProfile}
                nivel={fonte.nivel}
                onEscolherNivel={(n: CefrLevel) => setFonte((f) => ({ ...f, nivel: n }))}
                nativo={idiomaNativo}
                paresDeGlosa={entradaDaTrilha?.glosas ?? []}
              />
            ) : undefined
          }
          aviso={(() => {
            const capturar = {
              rotulo: ageProfile === 'kids' ? t('Gravar alguma coisa') : t('Capturar uma sessão'),
              aoAgir: () => onChangeView('capture'),
            };
            /* O baralho não carregou: o motivo, e as duas saídas (tentar de novo ou ir capturar). */
            if (erro)
              return {
                texto: t('Não consegui carregar o seu baralho: {erro}', { erro }),
                acoes: [{ rotulo: t('Tentar de novo'), aoAgir: () => void recarregarBaralho() }, capturar],
              };
            if (!semAcervo) return undefined;
            /* Acervo pequeno demais: quanto há e quanto falta, como na tela de sempre, e capturar. Havendo
               outra fonte pronta (a trilha do idioma), escolher o que praticar vem na frente. */
            return {
              texto:
                fontesOferecidas.length > 1
                  ? t('Você ainda não tem palavras suas para jogar. Dá para jogar com as da trilha.')
                  : tamanhoDoBaralho === 0
                    ? t('Você ainda não salvou palavras')
                    : t('Faltam {n} palavras', { n: menorMinimo - tamanhoDoBaralho }),
              detalhe: t(
                'Os jogos usam as palavras que você guarda das suas gravações, nada de lista pronta. Você tem {tem} e precisa de {precisa} para a primeira rodada.',
                { tem: tamanhoDoBaralho, precisa: menorMinimo },
              ),
              acoes:
                fontesOferecidas.length > 1
                  ? [{ rotulo: t('Escolher o que praticar'), aoAgir: () => setSalaAberta(true) }, capturar]
                  : [capturar],
            };
          })()}
        />
      </>
    );
  }

  /* `pb-28`: o botão flutuante do tutor fica no canto inferior direito, fixo, e cobria a última
     carta da grade, medido. A folga devolve a carta ao alcance do clique.

     Embutido, nada disso é nosso: o container da aba já rola e já tem padding, e repetir os dois
     aqui daria scroller dentro de scroller (duas barras, roda do mouse presa na de dentro) e
     padding somado nas bordas. Sobra só a transição de entrada. */
  return (
    <div className={embutido ? 'animate-in fade-in duration-200' : 'rolagem flex-1'}>
      {/* LARGURA MÁXIMA. Sem ela, num monitor de 1920 a faixa de revisão esticava por 1.829px e
          a arte de cada carta ia a 263px de altura, grande e grosseira, porque os desenhos são
          feitos de poucas formas. Limitar o conteúdo resolve os dois de uma vez, e de quebra o
          texto para de atravessar a tela inteira, que já é ruim de ler por si só. */}
      {sala}
      {fichaDoComo}
      {/* Moldura do protótipo: `.tela.larga` (1152 px, respiro 40/40/120). Embutida numa sessão, a
          tela já tem moldura e fica só a largura. */}
      <div className={embutido ? 'max-w-6xl mx-auto' : 'tela larga entra'}>
        {/* Embutido não tem cabeçalho próprio: a tela da sessão já traz um `<h1>` logo acima, e um
          segundo `<h1>` na mesma página quebra a navegação por cabeçalho do leitor de tela, a
          pessoa passa a ter dois "títulos da página" e nenhum diz onde ela está. */}
        {!embutido && (
          /* Cabeçalho no molde do protótipo aprovado (23/09/2026): rótulo, título, apoio, a ação
             primária à direita e as abas embaixo. O cartão de nível/XP/Seeds que ficava aqui saiu:
             ele já está no Início, e aqui disputava a atenção com "Partida rápida". */
          <CabecalhoDeTela
            icone={Gamepad2}
            sobrancelha={t('Rodadas curtas')}
            titulo={
              ageProfile === 'kids'
                ? t('Jogar & Praticar')
                : ageProfile === 'senior'
                  ? t('Praticar jogando')
                  : t('Jogar')
            }
            sub={
              ageProfile === 'senior'
                ? t('Jogos curtos com as palavras que você já salvou. Cada acerto conta para a sua memória.')
                : t('Rodadas curtas e dinâmicas com as suas palavras. O que você acerta aqui conta na revisão.')
            }
            className="mb-5"
            acoes={
              <>
                {/* META QUEST: quem pediu a "Tela de sempre" em Opções volta à tela do headset por aqui. */}
                {questNovo && lobbyCompletoNoQuest && (
                  <button type="button" className="btn btn-outline" onClick={() => setLobbyCompletoNoQuest(false)}>
                    <ChevronLeft aria-hidden /> {noHeadset() ? t('Tela do headset') : t('Tela nova')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={partidaRapida}
                  className="btn btn-solid"
                  title={t('Sorteia um jogo aleatório dentre os disponíveis e inicia imediatamente')}
                >
                  <Zap aria-hidden /> {t('Partida rápida')}
                </button>
              </>
            }
            abas={
              tamanhoDoBaralho < menorMinimo && fonte.id !== 'trilha' ? undefined : (
                <Abas
                  rotuloDoGrupo={t('Categorias de jogos')}
                  ativo={categoriaAtiva}
                  aoTrocar={(id) => {
                    setCategoriaAtiva(id as typeof categoriaAtiva);
                    play('select');
                  }}
                  itens={[
                    { id: 'todos', rotulo: t('Todos'), icone: <Sparkles aria-hidden />, contagem: listaDeJogos.length },
                    {
                      id: 'classicos',
                      rotulo: t('Clássicos'),
                      icone: <Zap aria-hidden />,
                      contagem: listaDeJogos.filter((j) => CLASSICOS.has(j.id)).length,
                    },
                    {
                      id: 'favoritos',
                      rotulo: t('Favoritos'),
                      icone: <Star aria-hidden />,
                      contagem: ordem.fixados.length,
                    },
                  ]}
                />
              )
            }
          />
        )}

        {/* A CORRENTE QUE ACABOU DE ENCERRAR.
          Sair no meio de uma rodada perde a rodada parcial (nenhum dos nove jogos expõe relatório
          parcial). O que já estava somado, porém, foi conquistado, apagá-lo sem dizer nada é o
          tipo de silêncio que faz a pessoa achar que o app perdeu o progresso dela. */}
        {ultimaCorrente && ultimaCorrente.rodadas > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] animate-in fade-in">
            <span className="kpi-pill">
              <T
                txt="sequência encerrada · <b>{rodadas}</b> rodadas · <b>{pontos}</b> pontos"
                val={{ rodadas: ultimaCorrente.rodadas, pontos: ultimaCorrente.pontos }}
              />
            </span>
            <span className="text-ink-faint">{t('{n}% de acerto no conjunto', { n: ultimaCorrente.precisao })}</span>
          </div>
        )}

        {/* ─── A FONTE DA RODADA ───
          De onde vêm as palavras e em que idioma. É a peça que faltava: sem ela, uma rodada de
          "inglês" sorteava entre as 1.166 palavras em português e as 337 em inglês do mesmo
          baralho, a queixa de "mistura tudo" era literal. */}
        {/* ════════════════════════════════════════════════════════════════════════
          F6, CONFIGURAR e AGIR deixaram de dividir a mesma régua.

          Antes, uma única linha horizontal misturava três naturezas sem nada distingui-las:
            CONFIGURAR  idioma · "Minhas palavras" · nome da sessão · "Trilha"
            STATUS      "200 prontas" · "988 em outro idioma"
            AGIR        "19 para revisar" (abre tela cheia) · "mapa do conteúdo" (idem)
          "988 em outro idioma" não era clicável e "19 para revisar" era, ambos texto cinza de
          12px na mesma linha, distinguidos só por um sublinhado.

          Agora: configuração RECOLHIDA (o caso comum não mexe nela), status numa faixa própria e
          não-clicável, e as ações como links explícitos, fora da linha de números.
          ════════════════════════════════════════════════════════════════════════ */}
        {/* A ALTURA DO RECIBO FICA RESERVADA. `fontesOferecidas` depende de `sessoes`, que vem de
          `fetchSessions`: o botão nascia DEPOIS da primeira pintura e empurrava a faixa de status
          e a grade de nove cartas para baixo (parte do CLS 0,364 medido no achado F0-02). O valor
          é a altura de repouso do botão: p-3 + uma linha de texto + a borda do `card-panel`. */}
        {/* A FAIXA DE AÇÕES SAIU DAQUI. Anki, Baralhos e o seletor de idioma flutuavam à direita,
          acima do seletor, como três botões sem rótulo de grupo: pareciam navegação da tela e
          eram, na verdade, parte de UMA decisão — de onde vem o que eu jogo. Foram para o rodapé
          da gaveta, atrás da separação "trazer ou gerenciar", junto das facetas que governam.
          Com isso a tela perde a terceira linha de controle: sobra o resumo e a gaveta. */}

        {/* ── O SELETOR DE CONTEÚDO: três linhas de controle viraram uma (redesenho de 02/09) ───
          Abas de fonte, chips de baralho e a faixa de recorte eram três controles que não se
          conheciam — e o inventário do código contou 53 controles e 64 contadores nesta tela.
          Aqui a escolha inteira é UMA linha de resumo com um «Trocar» que abre a gaveta. A linha
          é também o resumo-verdade: o painel de números, o mapa e as cartas derivam do MESMO
          conjunto (S9), então os números não têm como discordar de novo.

          A faceta "de onde vêm" segue EXCLUSIVA nesta etapa (ver `exclusiva` em
          `SeletorDeConteudo`): somar fontes é mudança de comportamento da rodada e entra com a
          distribuição por cota, não de carona no redesenho visual. */}
        {!embutido && fontesOferecidas.length > 1 && <div className="mb-4">{seletorDaFonte()}</div>}

        {verRecordes && (
          <Suspense fallback={null}>
            <Recordes ageProfile={ageProfile} onFechar={() => setVerRecordes(false)} />
          </Suspense>
        )}

        {/* ── DIAGNÓSTICO TÉCNICO EXPANSÍVEL (ativado pelo botão de gráfico da barra de acervo) ── */}
        {detalhes && (
          <div className="diag entra" role="status" aria-label={t('Diagnóstico do material')}>
            <span title={t('{n} palavras do idioma escolhido passaram na régua de qualidade.', { n: contagem.total })}>
              <Check aria-hidden />
              {t('{n} no idioma', { n: numero(contagem.total) })}
            </span>
            <span title={t('Jogos de par precisam de tradução.')}>
              <Languages aria-hidden />
              {t('{n} com tradução', { n: numero(pistas.comTraducao.length) })}
            </span>
            <span title={t('Sem tradução, mas com frase real.')}>
              <Quote aria-hidden />
              {t('{n} só com frase', { n: numero(pistas.soComFrase.length) })}
            </span>
            {!coreOnly(ageProfile) && (
              <span title={t('Existem e prestam, mas são de outro idioma')}>
                <Globe aria-hidden />
                {t('{n} em outro idioma', { n: numero(triagem.outroIdioma.length) })}
              </span>
            )}
            <span>
              <Filter aria-hidden />
              {t('{n} fora do recorte', { n: numero(triagem.fora.length) })}
            </span>
            <span>
              <CircleDashed aria-hidden />
              {t('{n} nunca caíram', { n: numero(nuncaCairam) })}
            </span>
          </div>
        )}

        {fonte.id === 'trilha' && trilha && (
          <PainelTrilha
            dado={trilha}
            deck={deck ?? []}
            ageProfile={ageProfile}
            nivel={fonte.nivel}
            onEscolherNivel={(n: CefrLevel) => setFonte((f) => ({ ...f, nivel: n }))}
            nativo={idiomaNativo}
            paresDeGlosa={entradaDaTrilha?.glosas ?? []}
          />
        )}

        {tamanhoDoBaralho < menorMinimo && fonte.id !== 'trilha' ? (
          <section className="card-panel bg-surface p-8 text-center flex flex-col items-center gap-4">
            <span className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center">
              <Mic className="w-7 h-7 text-accent" aria-hidden />
            </span>
            <div>
              <p className="font-display font-extrabold text-[17px] text-ink">
                {tamanhoDoBaralho === 0
                  ? t('Você ainda não salvou palavras')
                  : t('Faltam {n} palavras', { n: menorMinimo - tamanhoDoBaralho })}
              </p>
              <p className="text-[13px] text-ink-muted mt-1.5 max-w-[46ch]">
                <T
                  txt="Os jogos usam as palavras que você guarda das suas gravações, nada de lista pronta. Você tem <b>{tem}</b> e precisa de <b>{precisa}</b> para a primeira rodada."
                  val={{ tem: tamanhoDoBaralho, precisa: menorMinimo }}
                />
              </p>
            </div>
            <button
              onClick={() => onChangeView('capture')}
              className="py-2.5 px-5 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn transition-all cursor-pointer"
            >
              {ageProfile === 'kids' ? t('Gravar alguma coisa') : t('Capturar uma sessão')}
            </button>
          </section>
        ) : (
          <>
            {/* ── SUGESTÃO PARA HOJE (protótipo aprovado, `cartaoRecomendacao`) ──
                Os números são os DESTE recorte: vencidos que a rodada pode usar, nunca vistas, ou o
                acervo — nunca o "dueToday" global da conta (defeito 2 da auditoria). */}
            {!embutido && sugestao && (
              <section className="cartao reco entra" aria-labelledby="reco-t">
                <div className="reco-arte" aria-hidden>
                  <IconePixel id={sugestao.jogo.id} />
                </div>
                <div className="reco-texto">
                  <span className="sobrancelha">
                    <Sparkles aria-hidden />
                    <span>{t('Sugestão para hoje')}</span>
                  </span>
                  <h2 id="reco-t">{sugestao.titulo}</h2>
                  <p className="mut">
                    {t('Com')} <b style={{ color: 'var(--ink)' }}>{tituloDoJogo(sugestao.jogo, ageProfile)}</b> ·{' '}
                    {t('rodada curta')} · {nomeCurtoDaFonte}
                  </p>
                  {porQueAberto && (
                    <ul className="porque entra">
                      {sugestao.porque.map(([Icone, texto]) => (
                        <li key={texto}>
                          <Icone aria-hidden />
                          <span>{texto}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="reco-acoes">
                  <button type="button" className="btn btn-solid" onClick={() => pedirParaJogar(sugestao.jogo)}>
                    <IconePlay aria-hidden /> {t('Começar')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline peq"
                    onClick={() => setIndiceDaSugestao((n) => n + 1)}
                  >
                    <Shuffle aria-hidden /> {t('Outra sugestão')}
                  </button>
                  <button
                    type="button"
                    className="link"
                    aria-expanded={porQueAberto}
                    onClick={() => setPorQueAberto((v) => !v)}
                  >
                    <CircleHelp aria-hidden /> {porQueAberto ? t('Esconder o porquê') : t('Por que este?')}
                  </button>
                </div>
              </section>
            )}

            {/* ── BUSCA, HABILIDADES E OPÇÕES (marcação do protótipo) ──
                Dentro de uma sessão não há filtro: o protótipo mostra só os jogos desta gravação. */}
            {!embutido && (
              <div className="entre" style={{ marginTop: 18 }}>
                <div className="linha" style={{ gap: 8, flexWrap: 'wrap', flex: 1 }}>
                  <label className="busca" style={{ maxWidth: 280 }}>
                    <Search aria-hidden />
                    <span className="sr">{t('Buscar jogo')}</span>
                    <input
                      className="campo"
                      value={buscaJogos}
                      onChange={(e) => setBuscaJogos(e.target.value)}
                      placeholder={t('Buscar por nome ou mecânica')}
                    />
                  </label>
                  <div className="chips" role="group" aria-label={t('Filtrar por habilidade')}>
                    {[
                      { id: 'todas' as const, label: t('Todas'), Icone: null },
                      { id: 'vocab' as const, label: t('Vocabulário'), Icone: BookOpen },
                      { id: 'escuta_fala' as const, label: t('Escuta & fala'), Icone: Headphones },
                      { id: 'frase_gramatica' as const, label: t('Sintaxe & frases'), Icone: Puzzle },
                    ].map(({ id, label, Icone }) => (
                      <button
                        key={id}
                        type="button"
                        className="pill"
                        aria-pressed={filtroHabilidade === id}
                        onClick={() => {
                          setFiltroHabilidade(id);
                          play('select');
                        }}
                      >
                        {Icone && <Icone aria-hidden />}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="check">
                  <input type="checkbox" checked={!pularSempre} onChange={(e) => mudarPularSempre(!e.target.checked)} />{' '}
                  {ageProfile === 'kids' ? t('Ver antes de jogar') : t('Prévia antes de começar')}
                </label>
              </div>
            )}

            {/* `#grade-de-jogos` envolve os dois grupos: é a âncora da grade para a trilha e os testes. */}
            <div id="grade-de-jogos">
              {/* ── PRONTOS PARA JOGAR ── */}
              <section className="secao" style={{ marginTop: 28 }}>
                <TituloDeSecao
                  icone={embutido ? Gamepad2 : CirclePlay}
                  titulo={embutido ? t('Jogos com esta sessão') : t('Prontos para jogar')}
                  desc={
                    embutido
                      ? t('Só as palavras e falas desta gravação. A tela Jogar usa o baralho inteiro.')
                      : t('Estes rodam com as {n} palavras de {fonte}.', {
                          n: numero(acervoDaFonte.length),
                          fonte: nomeCurtoDaFonte,
                        })
                  }
                  direita={
                    embutido ? undefined : (
                      <div className="linha" style={{ gap: 16 }}>
                        {/* Reordenar e fixar cartas é do app (o protótipo não desenha): um link discreto. */}
                        <button
                          type="button"
                          className="link"
                          onClick={() => setModoOrganizar((v) => !v)}
                          aria-pressed={modoOrganizar}
                          title={t('Mudar a ordem das cartas e fixar as favoritas no topo')}
                        >
                          <Pin aria-hidden /> {modoOrganizar ? t('Pronto') : t('Organizar')}
                        </button>
                        <div className="legenda-cat" aria-label={t('A cor diz o que o jogo treina')}>
                          {FAMILIAS.map((f) => (
                            <span key={f.rotulo}>
                              <i style={{ background: f.tom }} />
                              {f.rotulo}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  }
                />
                <div role="tabpanel" id={`painel-${categoriaAtiva}`} aria-labelledby={`aba-${categoriaAtiva}`}>
                  {prontosFiltrados.length ? (
                    <div className="gauto">{prontosFiltrados.map(cartaDoJogo)}</div>
                  ) : (
                    <div className="cartao">
                      <div className="vazio">
                        <IconeEmBloco icone={Search} />
                        <h3>
                          {filtrado
                            ? t('Nenhum jogo pronto com esse filtro')
                            : t('Nenhum jogo abre só com este material ainda')}
                        </h3>
                        <p>
                          {filtrado
                            ? t('Troque o filtro ou busque por outra mecânica.')
                            : t('Os jogos abaixo dizem o que falta para abrir.')}
                        </p>
                        {filtrado && (
                          <button
                            type="button"
                            className="btn btn-outline peq"
                            onClick={() => {
                              setBuscaJogos('');
                              setFiltroHabilidade('todas');
                              setCategoriaAtiva('todos');
                            }}
                          >
                            {t('Limpar filtros e busca')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ── PRECISAM DE OUTRO MATERIAL ── */}
              {presosFiltrados.length > 0 && (
                <section className="secao">
                  <TituloDeSecao
                    icone={PackageOpen}
                    titulo={embutido ? t('Pedem mais material') : t('Precisam de outro material')}
                    desc={
                      embutido
                        ? descDosPresosDaSessao
                        : t('Não estão quebrados: pedem algo que este recorte não tem. Cada um diz o que falta.')
                    }
                  />
                  <div className="gauto">{presosVisiveis.map(cartaDoJogo)}</div>
                </section>
              )}
            </div>
          </>
        )}

        {erro && (
          <p className="mt-4 text-[12px] text-warn-ink">{t('Não consegui carregar o seu baralho: {erro}', { erro })}</p>
        )}
      </div>

      {/* O progresso mora no CABEÇALHO (ver acima): uma linha, ao lado do título, onde o olho
          passa antes de jogar, e não empurra a primeira carta. Fora quando embutido: nível,
          streak e seeds são do PERFIL; a aba da sessão fala de UMA sessão. */}
    </div>
  );
}
