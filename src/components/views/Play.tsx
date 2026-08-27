import React, { useEffect, useMemo, useState, useRef, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Play as IconePlay, Check, Timer, Mic, ChevronRight, ChevronLeft, Pin, ListChecks, Map as MapIcon, Sprout, Flame, Lock, HelpCircle, Package, Trophy, SlidersHorizontal as SlidersIcon, Trophy as TrophyIcon } from 'lucide-react';
import { apiFetch, fetchDeck, reviewCard, salvarRodada, fetchSessions, fetchSessionTranscript, patchUiSettings, fetchSettings, bulkAddCards, fetchHistoricoDeItens, fetchExerciseResults, fetchRecordes, gastarSeeds, type AppMetrics, type HistoricoDeItem } from '../../data/api';
import { toSentences, type Sentence, type PracticeSeed } from '../../lib/sentences';
import type { VocabCard, Recording } from '../../types';
import { coreOnly, type AgeProfileType } from '../../lib/profile';
import type { DerivedProgress } from '../../lib/progress';
import {
  buildItems, gradeFor, MINIGAMES, rodadasDaEscada,
  buildScrambleRounds, cartoesDaFonte, priorizar, cartoesDaTrilha, chaveDaPalavra, rotuloDaFonte,
  podeTrocarDeGravacao, fontesDisponiveis, idiomasDisponiveis, fonteDaEscolha, escolhaDaFonte, mesmaFonte,
  progressoDaTrilha,
  SESSAO_DA_TRILHA, CONFIANCA_CURADA,
  buildRodadasEscuta, buildRodadasDitado, buildRodadasConectores, isDueNow,
  estadoDeCadaJogo, comoDesbloquear, type ContextoDeDesbloqueio, type Desbloqueio,
  estimativaDeMinutos, rotuloDeDuracao, pistasDaTriagem, resumoDosPulados,
  previaSegura, repetidosDaUltima, MAPA_REVELA_ALVO,
  pontuarRodada, xpFromRound, acumular, mesmaCorrente, marcarPromovidas, resumir,
  type RodadaEscuta, type RodadaDitado, type RodadaConectores,
  type MinigameId, type MinigameItem, type RoundReport, type RodadaTermo, type RodadaFrase,
  type FonteDeItens, type Triagem, type DadoTrilha, type CefrLevel,
  type ItemCru, type ItemDaAntessala, type EstadoSequencia, type ResumoDaSequencia,
  type EscolhaDaPratica,
} from '@core';
import { baseLang, langLabelPt } from '../../lib/languages';
import { langConfigFrom } from '../../lib/langConfig';
import { gravarFonteGuardada, lerFonteGuardada } from '../../lib/fonteDaPratica';
import { contarPassada } from '../../lib/passadasDoPipeline';
import SalaDeEscolha from '../minigames/SalaDeEscolha';
import { isTtsSupported } from '../../lib/tts';
import { useAudioDaSessao } from '../../lib/audioDaSessao';
import CuradoriaBaralho from './CuradoriaBaralho';
import MapaDoConteudo from './MapaDoConteudo';
import ArteDoJogo from '../minigames/ArteDosJogos';
import Recordes from './play/Recordes';
import { JOGOS, type JogoUI } from './play/jogos';
import PainelTrilha from './PainelTrilha';
import BaralhoAnki from './BaralhoAnki';
import trilhaEn from '../../data/trilha/en.json';
import ComoSeJoga from '../minigames/ComoSeJoga';
import AntessalaDaRodada from '../minigames/AntessalaDaRodada';
import { toast } from '../Toast';
import TourGuiado from '../minigames/TourGuiado';
import { PASSOS_DOS_JOGOS, jaFezTour, marcarTourFeito } from '../minigames/passosDosJogos';
import { aplicarOrdem, mover, alternarFixado, lerOrdem, gravarOrdem, ORDEM_VAZIA, type OrdemDosJogos } from '../../lib/ordemDosJogos';
import MemoryGame from '../minigames/MemoryGame';
import TermoGame from '../minigames/TermoGame';
import ScrambleGame from '../minigames/ScrambleGame';
import KaraokeGame, { type FalaKaraoke } from '../minigames/KaraokeGame';
import WordSearchGame from '../minigames/WordSearchGame';
import BlitzGame from '../minigames/BlitzGame';
import ScratchReward from '../minigames/ScratchReward';
import ResumoDaRodada, { type ItemDaRodada } from '../minigames/ResumoDaRodada';
import {
  compor, aceitaFiltroDeDificuldade, faixaDe as faixaDeScore, contagemDaFonte, recortarPelaComposicao,
  type FaixaDificuldade, type EstrategiaDeDistribuicao,
  type Composicao, type CartaoParaCompor,
} from '../../core/minigames/composicao';
import EscutaGame from '../minigames/EscutaGame';
import DitadoGame from '../minigames/DitadoGame';
import ConectoresGame from '../minigames/ConectoresGame';

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
}

/**
 * QUANTOS JOGOS POR PÁGINA.
 *
 * Nove — que hoje é exatamente o número de jogos, então cabe tudo numa página só e o paginador
 * nem aparece. Ele existe para quando a lista crescer: é o que substitui o "Ver todos", sem
 * esconder nada de ninguém enquanto não houver o que esconder.
 */
const POR_PAGINA = 9;

/**
 * Quantos cartões o servidor PRIORIZA por rodada.
 *
 * Não é o tamanho do pool — o pool é o acervo inteiro (`recortarPelaComposicao` completa por trás).
 * Este número é só até onde vale a pena o servidor ordenar por vencimento e estratégia; o resto
 * entra na ordem da triagem. Cortar o pool aqui foi o que fez a Memória ver 5 palavras de 323.
 */
const LIMITE_DA_COMPOSICAO = 200;

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

/* Quem já sabe o que quer não deve pagar um clique por rodada. Fica no `localStorage`, no
   precedente de `minigames/passosDosJogos.ts`, e a antessala continua alcançável pelo ícone de
   lista na carta, senão desligar seria um caminho sem volta. */
const CHAVE_PULAR = 'babel.pular_antessala';
const pularAntessala = (): boolean => {
  try { return localStorage.getItem(CHAVE_PULAR) === '1'; } catch { return false; }
};
const gravarPularAntessala = (v: boolean): void => {
  try { localStorage.setItem(CHAVE_PULAR, v ? '1' : '0'); } catch { /* storage bloqueado */ }
};

/**
 * TRANSPORTE da composição pelo FUNIL. O default do núcleo resolve `globalThis.fetch` — sem
 * Bearer e, sem conta, direto ao servidor real: foi assim que o lobby mostrou "600 no idioma"
 * (os cartões do banco do servidor) ao lado de um baralho vazio (o do navegador). Pelo `apiFetch`,
 * sem conta a rota responde 501 e `compor` cai no fallback local — o mesmo baralho, um número só.
 */
const buscarComposicaoPeloFunil = async (caminho: string): Promise<unknown> => {
  const res = await apiFetch(caminho, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
};

export default function Play({ onChangeView, ageProfile, progress, metrics, recording, seed, embutido }: PlayProps) {
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
  const [pagina, setPagina] = useState(0);
  useEffect(() => { setOrdem(lerOrdem()); }, []);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * A FONTE desta rodada: de onde vêm as palavras e em que idioma.
   *
   * Era isto que faltava e que causava a queixa de "mistura tudo": a tela pegava o baralho inteiro
   * e a sessão mais recente, sem escolha nenhuma. Medido neste baralho: 1.166 palavras em
   * português e 337 em inglês sorteadas juntas na mesma rodada.
   */
  const [fonte, setFonte] = useState<FonteDeItens>({ id: 'baralho', lang: '' });

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
  const [salaAberta, setSalaAberta] = useState(!embutido);
  /* Números do baralho (contagens, mapa, recorte, revisão) COLAPSADOS por padrão: quem chega quer
     jogar, não auditar o acervo, pedido do dono (2026-08-26). A escolha persiste no navegador. */
  const [verRecordes, setVerRecordes] = useState(false);
  /* Recorde por jogo, para o selo das cartas. Relê ao abrir o painel de recordes e na montagem
     (o selo da carta pode ficar uma rodada atrás; o painel é sempre atual). */
  const [recordesMapa, setRecordesMapa] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    void fetchRecordes().then((rs) => setRecordesMapa(new Map(rs.map((r) => [r.exerciseKind, r.melhorPontos]))));
  }, [verRecordes]);
  const [detalhes, setDetalhes] = useState<boolean>(() => { try { return localStorage.getItem('babel.play.detalhes') === '1'; } catch { return false; } });
  const alternarDetalhes = () => setDetalhes((v) => { try { localStorage.setItem('babel.play.detalhes', v ? '0' : '1'); } catch { /* sem storage */ } return !v; });
  const [curando, setCurando] = useState(false);
  const [importando, setImportando] = useState(false);
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
  const [sessaoEmUso, setSessaoEmUso] = useState<{ id: string; title: string } | null>(null);
  /** Título da sessão vinda por prop, lido pelo efeito de busca sem virar dependência dele. */
  const tituloRef = useRef<string | undefined>(recording?.title);
  const [escolhendoSessao, setEscolhendoSessao] = useState(false);
  const [vendoMapa, setVendoMapa] = useState(false);
  const [sessaoEscolhida, setSessaoEscolhida] = useState<string | null>(null);
  const sessaoEscolhidaRef = React.useRef<string | null>(null);
  sessaoEscolhidaRef.current = sessaoEscolhida;
  /** Rodada em curso (itens já sorteados) e o resultado a revelar na raspadinha. */
  const [rodada, setRodada] = useState<{ jogo: MinigameId; itens: MinigameItem[] } | null>(null);
  const [rodadaTermo, setRodadaTermo] = useState<RodadaTermo[] | null>(null);
  const [rodadaFrase, setRodadaFrase] = useState<RodadaFrase[] | null>(null);
  const [rodadaKaraoke, setRodadaKaraoke] = useState<FalaKaraoke[] | null>(null);
  const [rodadaEscuta, setRodadaEscuta] = useState<RodadaEscuta[] | null>(null);
  const [rodadaDitado, setRodadaDitado] = useState<RodadaDitado[] | null>(null);
  const [rodadaConectores, setRodadaConectores] = useState<RodadaConectores[] | null>(null);
  const [resultado, setResultado] = useState<RoundReport | null>(null);
  /* Z1 — FILTRO DE DIFICULDADE. Vale para os 4 jogos de modalidade `palavra`; os 5 de frase
     jogam sobre falas, que não têm dificuldade por palavra (ver `composicao.ts`). */
  const [faixas, setFaixas] = useState<FaixaDificuldade[]>([]);
  const [estrategia, setEstrategia] = useState<EstrategiaDeDistribuicao>('equilibrado');
  const [composicao, setComposicao] = useState<Composicao | null>(null);

  /** F6: passo 2 (resumo com os erros) antes de voltar. Ligado ao fim de cada rodada. */
  const [verResumo, setVerResumo] = useState(false);
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
  const mudarPularSempre = (v: boolean) => { setPularSempre(v); gravarPularAntessala(v); };
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
   * MONTAR ≠ COMEÇAR — e essa separação é a antessala inteira.
   *
   * Antes, clicar num jogo montava a rodada e caía direto nela: não havia instante nenhum em que
   * o conteúdo existisse e a pessoa pudesse olhar. Daí as três queixas serem a mesma — "não sei o
   * que vem", "quero repetir esta", "quero pular esta" só têm resposta se a rodada existir ANTES
   * de começar.
   *
   * Devolve `null` quando não dá para montar (faltam itens). O `aplicar` é um fecho que guarda a
   * rodada já montada: assim a antessala mostra EXATAMENTE o que vai ser jogado, e não uma amostra
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
    const trecho = semente?.word || semente?.text;
    const cartas = apenas?.size ? jogaveis.filter(c => apenas.has(c.word)) : jogaveis;
    const falas = apenas?.size ? frases.filter(f => apenas.has(f.id)) : frases;
    /* Repetir NÃO deve evitar o que acabou de cair — é justamente isso que se está pedindo.
       Já o "trocar por outras" precisa evitar TAMBÉM o que está na tela agora: quem clica ali está
       dizendo "essas não". Medido antes deste ajuste: trocar devolvia 4 dos 12 itens de volta. */
    const evitar = apenas?.size
      ? undefined
      : evitarTambem?.size
        ? new Set([...vistasRecentes, ...evitarTambem])
        : vistasRecentes;

    /**
     * O FUNIL ÚNICO DA PRÉVIA.
     *
     * Antes, cada um dos oito ramos abaixo montava a sua `previa` na mão — e os oito escreviam a
     * RESPOSTA no título (`titulo: x.palavra`, `titulo: i.answer`, `titulo: x.fala.text`…). Oito
     * lugares para lembrar de uma regra é zero lugares: o Termo imprimia a palavra que ia pedir
     * para soletrar letra a letra, e o Ditado, a frase que ia pedir para transcrever.
     *
     * Agora cada ramo só entrega o material CRU e `previaSegura` decide o que vai à tela, pela
     * tabela `REVELAVEL` (ver `core/minigames/revelavel.ts`). Um ramo novo não consegue vazar
     * sem passar por aqui, e um jogo novo não compila sem declarar o que revela.
     */
    /* A procedência PADRÃO é preenchida aqui, no ponto por onde os oito ramos passam — e não em
       cada um deles. Os cinco jogos de frase tiram material de falas, não de cartões: para eles
       não há proveniência por item, mas a fonte da rodada é conhecida e vale para todos. Um ramo
       que já sabe a origem (os de baralho, via `nivelDe`) mantém a sua. */
    const pronta = (crus: ItemCru[], aplicar: () => void): RodadaPronta => ({
      jogo,
      previa: previaSegura(jogo, crus.map(c => ({
        ...c,
        origem: c.origem ?? fonte.id,
        origemRotulo: c.origemRotulo ?? sessaoEmUso?.title,
        idioma: c.idioma ?? fonte.lang,
      }))),
      aplicar,
    });
    /**
     * Os dados de APRESENTAÇÃO de uma palavra: nível e procedência.
     *
     * Nenhum dos dois viaja no `MinigameItem`, e não devem — lá é contrato de JOGO, e nem o nível
     * nem a origem mudam como qualquer um dos nove joga. Vêm daqui, do mesmo índice do baralho que
     * a promoção da trilha já usa, e seguem para `previaSegura`, que decide o que a tela vê.
     *
     * O rótulo da gravação entra CRU de propósito: quem o cerca é `previaSegura`, num lugar só. Se
     * a filtragem fosse feita aqui, cada ramo de `montarRodada` teria de lembrar dela — que é
     * exatamente o arranjo que deixou os oito ramos vazarem a resposta da primeira vez.
     */
    const nivelDe = (palavra: string) => {
      const c = porPalavra.get((palavra || '').toLowerCase());
      return {
        cefr: c?.cefrLevel,
        cefrConfianca: c?.cefrConfidence,
        origem: origemDaPalavra(palavra, c?.id),
        origemRotulo: sessaoEmUso?.title,
        idioma: c?.srcLang || fonte.lang,
      };
    };

    /**
     * `evitar` PARA OS JOGOS DE FALA — que não o recebiam.
     *
     * Só `buildItems` (memória/caça-palavras/duelo) e `buildTermoRounds` aceitam `evitar`. Os cinco
     * jogos de frase nunca souberam o que já tinha caído, e um deles é pior: `buildScrambleRounds`
     * faz `.filter().slice(0, quantidade)` SEM embaralhar — devolvia a MESMA rodada para sempre,
     * então "mais uma" na Frase embaralhada era literalmente a rodada anterior de novo. Medido no
     * navegador ao emendar uma corrente.
     *
     * A despriorização é feita aqui, na lista de falas, com a mesma semântica de `evitar` no core:
     * o que já caiu vai para o FIM da fila, não é excluído. Assim uma fonte com três falas continua
     * jogável em vez de virar beco sem saída.
     */
    const falasNaOrdem = (() => {
      if (!evitar?.size) return falas;
      const frescas: typeof falas = [];
      const vistas: typeof falas = [];
      for (const f of falas) (evitar.has(f.id) ? vistas : frescas).push(f);
      return [...frescas, ...vistas];
    })();

    if (jogo === 'termo') {
      /* A escada gasta 1+2+4 = 7 palavras, e todas precisam ter o MESMO comprimento: o palpite é
         um só para todos os tabuleiros de um degrau.

         O tamanho da rodada é decidido por `rodadasDaEscada`, no core, e não aqui. O comentário
         que existia neste lugar afirmava que "com menos de 7, `planoDaEscada` encurta a escada em
         vez de recusar o jogo", era falso, e foi essa premissa que deixou o Termo inacessível:
         com `mesmoTamanho`, pedir 7 e ter 5 devolvia lista VAZIA, nunca uma escada curta. */
      const r = rodadasDaEscada(cartas, { evitar });
      if (!r.length) return null;
      return pronta(
        r.map(x => ({ ref: x.palavra, alvo: x.palavra, pista: x.pista, ...nivelDe(x.palavra) })),
        () => setRodadaTermo(r),
      );
    }
    if (jogo === 'scramble') {
      const r = buildScrambleRounds(falasNaOrdem, { quantidade: MINIGAMES.scramble.maxItems });
      if (r.length < MINIGAMES.scramble.minItems) return null;
      return pronta(
        r.map(x => ({ ref: x.sentenceId ?? '', alvo: x.correta.join(' '), pista: x.traducao })),
        () => setRodadaFrase(r),
      );
    }
    /**
     * NA TRILHA, os três jogos de escuta saem de PALAVRAS faladas por voz sintetizada.
     *
     * `FalaComAudio` pede `startMs`/`endMs`; aqui eles vão ZERADOS de propósito, e é isso que o
     * `falante` lê como "não há clipe a recortar, fale o texto". Marcar um intervalo falso faria
     * o jogo tentar recortar um áudio que não existe.
     *
     * O exercício muda de natureza e continua legítimo: Ditado = ouça e escreva a palavra;
     * Qual foi? = ouça e escolha entre palavras parecidas (par mínimo); Karaokê = repita a palavra.
     */
    if (fonte.id === 'trilha' && MINIGAMES[jogo].aceitaPalavraFalada) {
      const def = MINIGAMES[jogo];
      const sorteadas = priorizar<VocabCard>(cartas, trecho, c => c.word).slice(0, def.maxItems);
      if (sorteadas.length < def.minItems || !temVoz) return null;
      const comoFala = sorteadas.map(c => ({ id: c.id || c.word, text: c.word, translation: c.translation, lang: c.srcLang || fonte.lang, startMs: 0, endMs: 0 }));
      const crus: ItemCru[] = sorteadas.map(c => ({
        ref: c.word, alvo: c.word, pista: c.translation, ...nivelDe(c.word),
      }));

      if (jogo === 'ditado') {
        return pronta(crus, () => setRodadaDitado(comoFala.map(f => ({ fala: f, palavras: 1 }))));
      }
      if (jogo === 'escuta') {
        /* As alternativas erradas são as OUTRAS palavras da mesma leva — é o que transforma isto
           num exercício de par mínimo em vez de adivinhação. */
        return pronta(crus, () => setRodadaEscuta(comoFala.map((f, i) => ({
          correta: f,
          opcoes: [f, ...comoFala.filter((_, k) => k !== i).slice(0, 3)].sort(() => Math.random() - 0.5),
        }))));
      }
      return pronta(crus, () => setRodadaKaraoke(
        comoFala.map(f => ({ id: f.id, texto: f.text, traducao: f.translation, lang: f.lang, startMs: 0, endMs: 0 })),
      ));
    }

    if (jogo === 'escuta') {
      const r = priorizar(buildRodadasEscuta(falasNaOrdem, { quantidade: MINIGAMES.escuta.maxItems }), trecho, x => x.correta.text);
      if (r.length < MINIGAMES.escuta.minItems || !audioParaJogos) return null;
      return pronta(
        r.map(x => ({ ref: x.correta.id ?? '', alvo: x.correta.text, pista: x.correta.translation })),
        () => setRodadaEscuta(r),
      );
    }
    if (jogo === 'ditado') {
      const r = priorizar(buildRodadasDitado(falasNaOrdem, { quantidade: MINIGAMES.ditado.maxItems }), trecho, x => x.fala.text);
      if (r.length < MINIGAMES.ditado.minItems || !audioParaJogos) return null;
      return pronta(
        r.map(x => ({ ref: x.fala.id ?? '', alvo: x.fala.text, pista: x.fala.translation })),
        () => setRodadaDitado(r),
      );
    }
    if (jogo === 'conectores') {
      const r = priorizar(buildRodadasConectores(falasNaOrdem, { lang: fonte.lang, quantidade: MINIGAMES.conectores.maxItems }), trecho, x => x.fala.text);
      if (r.length < MINIGAMES.conectores.minItems) return null;
      return pronta(
        r.map(x => ({ ref: x.fala.id ?? '', alvo: x.fala.text, pista: x.fala.translation })),
        () => setRodadaConectores(r),
      );
    }
    if (jogo === 'karaoke') {
      const lista: FalaKaraoke[] = priorizar<Sentence>(
        falasNaOrdem.filter(f => f.endMs > f.startMs && !!f.text.trim()),
        trecho, f => f.text,
      )
        .slice(0, MINIGAMES.karaoke.maxItems)
        .map(f => ({ id: f.id, texto: f.text, traducao: f.translation, lang: f.lang || '', startMs: f.startMs, endMs: f.endMs }));
      if (lista.length < MINIGAMES.karaoke.minItems || !audioParaJogos) return null;
      return pronta(
        lista.map(f => ({ ref: f.id ?? '', alvo: f.texto, pista: f.traducao })),
        () => setRodadaKaraoke(lista),
      );
    }
    const itens = priorizar(buildItems(jogo, cartas, { evitar }), trecho, x => x.answer);
    if (itens.length < MINIGAMES[jogo].minItems) return null;
    return pronta(
      itens.map(i => ({ ref: i.answer, alvo: i.answer, pista: i.prompt, ...nivelDe(i.answer) })),
      () => setRodada({ jogo, itens }),
    );
  };

  /**
   * Clicou no jogo: monta e ABRE A ANTESSALA — ou começa direto, se a pessoa desligou.
   *
   * O tour da primeira vez só entra quando a partida começa de fato: disparado aqui, ele
   * apontaria para elementos do jogo que ainda não estão na tela.
   */
  const pedirParaJogar = (carta: Pick<JogoUI, 'id'>, forcarAntessala = false) => {
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
    setSequencia(null);
    /* A FONTE DA VERDADE É O ESTADO, não o `localStorage`.
       Antes esta linha lia `pularAntessala()` direto do storage enquanto o checkbox espelhava
       `pularSempre`, dois leitores da mesma preferência, que discordavam por um render sempre que
       ela mudava. Agora o storage é só persistência; quem decide é o estado. */
    if (pularSempre && !forcarAntessala) { comecar(pronta); return; }
    setAntessala(pronta);
  };

  const comecar = (pronta: RodadaPronta) => {
    if (!jaFezTour(pronta.jogo)) setTourDe(pronta.jogo);
    setResultado(null);
    setAntessala(null);
    setSemMaterial(false);
    setUltimaCorrente(null);   // começou outra: a pílula da anterior sai da tela
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
    if (!pronta) { setSemMaterial(true); return; }
    comecar(pronta);
  };

  /**
   * ESTAS MESMAS de novo. Remonta pelos `item_ref` do relatório que acabou de chegar — e NÃO por
   * `ultimaRodada`, que só é recarregada por um efeito assíncrono e pode estar uma rodada
   * atrasada no instante em que a raspadinha aparece. É a mesma correção de corrida que a
   * antessala não tem.
   */
  const refsDoResultado = resultado
    ? resultado.items.map(o => o.itemRef).filter((r): r is string => !!r)
    : [];
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
  const CUSTO_PULAR = 25;
  const pularVez = async () => {
    if (!resultado || !sequencia || saldoSeeds < CUSTO_PULAR || gastando) return;
    setGastando(true);
    try {
      const spendId = `pular-${resultado.gameId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const r = await gastarSeeds({ spendId, amount: CUSTO_PULAR, reason: 'pular-rodada', ref: resultado.gameId });
      if (!r) { toast.error('Não consegui gastar as seeds agora, nada foi cobrado.'); return; }
      /* O servidor é a autoridade sobre o saldo, mas `progress` só se atualiza quando as métricas
         forem recarregadas pelo App. Este desconto local existe para o número na tela não mentir
         no instante seguinte ao clique, e para não deixar gastar duas vezes o que já não há. */
      setGastasLocais(g => g + CUSTO_PULAR);
    } finally {
      setGastando(false);
    }
    const evitar = new Set<string>(sequencia.vistosNaSequencia);
    const pronta = montarRodada(resultado.gameId, null, undefined, evitar);
    if (!pronta) { setSemMaterial(true); return; }
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
    setVistasRecentes(anterior => {
      const nova = new Set(anterior);
      for (const o of report.items) if (o.itemRef) nova.add(o.itemRef);
      const TETO = 60;
      return nova.size <= TETO ? nova : new Set([...nova].slice(-TETO));
    });
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
    const origem = fonte.id === 'sessao' ? `sessao:${fonte.sessionId ?? ''}`
      : fonte.id === 'trilha' ? `trilha:${fonte.nivel ?? ''}`
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
    setVerResumo(true);   // F6: mostra o resumo com os erros depois da raspadinha
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
    for (const o of report.items) {
      if (!o.cardId || !def.writesSrs) continue;
      try { await reviewCard(o.cardId, gradeFor(report.gameId, o)); }
      catch (e) { falhas.push(`srs ${o.itemRef}: ${String((e as Error)?.message ?? e).slice(0, 80)}`); }
    }

    const gravacao = await salvarRodada({
      melhorSequencia: pontos.melhorSequencia,
      roundId, exerciseKind: report.gameId, origem, sessionId: daSessao, score: report.score, itens,
    });
    if (!gravacao.ok) falhas.push(`${gravacao.status ?? 'rede'}: ${gravacao.motivo}`);

    if (falhas.length) {
      /* ANTES ISTO ERA SÓ UM console.warn: a rodada sumia e o usuário nunca sabia. Um erro que o
         usuário não vê é um erro que ninguém corrige. */
      console.warn(`[jogos] rodada ${roundId} não foi gravada por inteiro. Causa: ${falhas[0]}`);
      toast.error('Não consegui salvar esta rodada. O placar vale, mas o histórico não foi gravado.');
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
    if (fonte.id === 'trilha' && fonte.nivel) {
      /* `Set` na itemRef: um jogo pode apresentar a MESMA palavra mais de uma vez na rodada (o
         Duelo sorteia distratores do próprio lote), e sem isto o lote sairia com a palavra
         repetida. O servidor deduplica e não criaria linha dupla, mas mandar duas é pedir para
         ele recusar uma e contar como "pulada", um número errado por culpa nossa. */
      const vistas = new Set<string>();
      const errados = report.items.filter(o => {
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
      const novos = errados
        .map(o => porPalavra.get((o.itemRef ?? '').toLowerCase()))
        .filter((c): c is VocabCard => !!c && !c.id)
        .map(c => ({
          word: c.word,
          back: c.translation,
          srcLang: c.srcLang,
          tgtLang: idiomaNativo,
          sessionId: SESSAO_DA_TRILHA(fonte.lang),
          cefrLevel: fonte.nivel,
          cefrConfidence: CONFIANCA_CURADA,
        }));
      if (novos.length) {
        try {
          await bulkAddCards(novos);
          setSequencia(s => (s ? marcarPromovidas(s, novos.map(n => n.word.toLowerCase())) : s));
        } catch { /* a promoção é um bônus, não a partida */ }
      }
    }

    // O baralho mudou (datas de revisão novas) — recarrega para o próximo jogo já usar o estado real.
    try { setDeck((await fetchDeck()).filter(c => c.inDeck)); } catch { /* mantém o anterior */ }
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
        fetchDeck().then(cards => ({ cards, erro: null as string | null }))
          .catch((e: unknown) => ({ cards: null, erro: (e as Error).message })),
        fetchSettings().catch(() => null),
      ]);
      if (cancelado) return;

      let ui: Record<string, unknown> = {};
      try { ui = ajustes?.ui ? JSON.parse(ajustes.ui) as Record<string, unknown> : {}; } catch { ui = {}; }
      const cfg = langConfigFrom(ui, ajustes?.targetLanguage);
      const escolhido = typeof ui.praticaLang === 'string' ? ui.praticaLang : '';
      const lang = escolhido || baseLang(cfg.studying);

      /* React 19 agrupa estes `setState` num render só (batching automático também fora de
         eventos), e é disso que depende o ganho: separados, voltariam a ser duas passadas. */
      if (baralho.cards) setDeck(baralho.cards.filter(c => c.inDeck)); else setErro(baralho.erro);
      setFonte(f => (f.lang === lang ? f : { ...f, lang }));
      setIdiomaNativo(baseLang(cfg.mine));
    })();
    return () => { cancelado = true; };
  }, []);

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
    if (embutido || fonteRestaurada.current || !sessoes.length) return;
    fonteRestaurada.current = true;
    const guardada = lerFonteGuardada(sessoes.map(s => s.id));
    /* RESTAURAR A MESMA FONTE NÃO É MUDAR DE FONTE. No caso comum — quem nunca escolheu nada, ou
       escolheu "todas as minhas gravações", o que vem do `localStorage` é exatamente o que já
       está no estado, e o objeto novo fazia o React refazer triagem, composição e gate por nada
       (medido: uma passada inteira do pipeline). Devolver `f` faz o React abortar a atualização. */
    setFonte(f => {
      const restaurada = fonteDaEscolha({ ...guardada, lang: f.lang });
      return mesmaFonte(f, restaurada) ? f : restaurada;
    });
  }, [embutido, sessoes]);

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
        setSessoes(lista.map(x => ({ id: x.id, title: x.title, audioUrl: x.audioUrl ?? undefined })));

        /* A escolha MANUAL vence; depois a gravação de onde se veio; e só então o palpite do
           código. Antes só existia o palpite, e ele era silencioso. */
        const escolhida = sessaoEscolhidaRef.current
          ? lista.find(x => x.id === sessaoEscolhidaRef.current)
          : recording?.id ? lista.find(x => x.id === recording.id) : undefined;
        const alvo = escolhida ?? (recording?.id ? undefined : lista.find(x => x.audioUrl) ?? lista[0]);
        const alvoId = alvo?.id ?? recording?.id ?? '';
        const alvoAudio = alvo?.audioUrl ?? recording?.audioUrl ?? '';
        if (!alvoId) return;

        const { utterances } = await fetchSessionTranscript(alvoId);
        if (cancelado) return;
        setFrases(toSentences(utterances));
        setAudioSessao(alvoAudio);
        setIdDoAudio(alvoAudio ? alvoId : null);
        setSessaoEmUso({ id: alvoId, title: alvo?.title ?? tituloRef.current ?? 'sessão' });
      } catch { /* sem sessão: os jogos de frase ficam bloqueados com o motivo */ }
    })();
    return () => { cancelado = true; };
    /* `recording?.title` é lido por REF de propósito, e não como dependência: ele só serve de
       fallback para quando a sessão não aparece na lista, e colocá-lo aqui faria uma simples
       RENOMEAÇÃO refazer a busca do transcrito na rede. A atualização do rótulo é o efeito abaixo. */
  }, [recording?.id, recording?.audioUrl, sessaoEscolhida]);

  /** Espelho do título para o efeito acima poder lê-lo sem depender dele. */
  useEffect(() => { tituloRef.current = recording?.title; }, [recording?.title]);

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
    setSessaoEmUso(s => (s && s.id === recording.id && s.title !== t ? { ...s, title: t } : s));
  }, [recording?.id, recording?.title]);

  // Chegar pela Análise já entra no modo sessão — senão o botão "Jogar com esta sessão" mentiria.
  // Já estando nessa sessão, o estado fica como está: um objeto novo com os mesmos valores custa
  // uma passada inteira do pipeline (ver `mesmaFonte`).
  useEffect(() => {
    if (recording?.id) {
      setFonte(f => (f.id === 'sessao' && f.sessionId === recording.id ? f : { ...f, id: 'sessao', sessionId: recording.id }));
    }
  }, [recording?.id]);

  /** A `origem` como ela é gravada em `exercise_results` — precisa casar com o que o fim de
   *  rodada escreve, senão o histórico da fonte errada apareceria na antessala. */
  const origemAtual = fonte.id === 'sessao' ? `sessao:${fonte.sessionId ?? ''}`
    : fonte.id === 'trilha' ? `trilha:${fonte.nivel ?? ''}`
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
      setHistorico(new Map(hist.map(h => [h.itemRef, h])));
      setRecordes(new Map(recs.map(r => [r.exerciseKind, r.melhorPontos])));

      /* Os tempos MEDIDOS por item, para a antessala poder dizer "leva uns 4 minutos" sem chutar.
         `ms` é gravado desde a migração 0001 e nunca tinha sido lido de volta. Quem decide se há
         amostra suficiente é `@core/minigames/duracao`, aqui só se junta o que existe. */
      setTemposMedidos(linhas.map(l => l.ms).filter((ms): ms is number => typeof ms === 'number'));

      /* A última rodada de CADA jogo nesta fonte. As linhas vêm mais recentes primeiro, então a
         primeira `roundId` que aparece para um jogo é a mais nova, e só ela interessa. */
      const porJogo = new Map<string, string[]>();
      const rodadaEscolhida = new Map<string, string>();
      for (const l of linhas) {
        const jogo = l.exerciseKind, rid = l.roundId, ref = l.itemRef;
        if (!jogo || !rid || !ref || l.origem !== origemAtual) continue;
        if (!rodadaEscolhida.has(jogo)) rodadaEscolhida.set(jogo, rid);
        if (rodadaEscolhida.get(jogo) !== rid) continue;
        const lista = porJogo.get(jogo) ?? [];
        if (!lista.includes(ref)) lista.push(ref);
        porJogo.set(jogo, lista);
      }
      setUltimaRodada(porJogo);

      const comIdentidade = linhas.filter(l => l.roundId && typeof l.createdAt === 'number');
      setHistoricoDesde(comIdentidade.length ? Math.min(...comIdentidade.map(l => l.createdAt as number)) : null);
    })();
    return () => { cancelado = true; };
  }, [origemAtual, resultado]);


  /* Trocar de fonte é começar outro assunto — a memória curta da fonte anterior não se aplica.
     A corrente cai junto, e pela mesma razão: um placar de trilha continuando numa corrente de
     sessão gravaria o recorde na `origem` errada. (`acumular` já tem o guard como cinto; isto é a
     suspensória, para o placar sumir da tela no instante da troca, e não só na rodada seguinte.) */
  useEffect(() => {
    setVistasRecentes(new Set());
    setSequencia(null);
  }, [fonte.id, fonte.sessionId, fonte.nivel, fonte.lang]);

  const trocarIdioma = (lang: string) => {
    setFonte(f => ({ ...f, lang }));
    void patchUiSettings({ praticaLang: lang }).catch(() => { /* preferência é conveniência */ });
  };

  /**
   * A escolha da sala vira fonte — e fica GUARDADA.
   *
   * Duas persistências distintas de propósito: o idioma é preferência de perfil e vai para o
   * servidor (`settings.ui.praticaLang`, atravessa dispositivos); a fonte é contexto de trabalho
   * local e vai para o `localStorage`. Antes, NADA da fonte sobrevivia a um F5 — quem escolhia
   * "Trilha B1" voltava para "Minhas palavras" sem aviso.
   */
  const aplicarEscolha = (escolha: EscolhaDaPratica) => {
    if (baseLang(escolha.lang) !== baseLang(fonte.lang)) trocarIdioma(escolha.lang);
    setFonte(fonteDaEscolha(escolha));
    gravarFonteGuardada({
      origem: escolha.origem, escopo: escolha.escopo,
      sessionId: escolha.sessionId, nivel: escolha.nivel,
    });
  };

  /**
   * A TRIAGEM — calculada uma vez e usada por todos: pelas cartas, pelo início da rodada e pela
   * curadoria. Antes cada jogo refazia o seu próprio filtro, que foi como o idioma acabou
   * divergindo entre telas neste projeto (ver o cabeçalho de `lib/langConfig.ts`).
   */
  /* A TRIAGEM DE QUALIDADE continua local (é régua de conteúdo, não seleção), mas QUEM ESCOLHE
     as palavras passou a ser o servidor, ver `composicao.ts`. O filtro de dificuldade em JS
     sobre o deck inteiro deixou de existir. */
  const triagem: Triagem = useMemo(
    () => {
      /* Instrumento, não lógica — ver `lib/passadasDoPipeline`. Desligado, custa uma leitura de
         propriedade; ligado, é o que prova quantas vezes o baralho inteiro é triado por carga. */
      contarPassada('triagem', { cartoes: (deck ?? []).length, fonte: fonte.id, lang: fonte.lang });
      return cartoesDaFonte(deck ?? [], fonte);
    },
    [deck, fonte],
  );

  /* COMPOSIÇÃO SERVIDA. Re-pede quando muda fonte, faixa ou estratégia. Falha de rede cai para
     composição local com a origem marcada, a app é local-first e rodada vazia não é opção. */
  useEffect(() => {
    let vivo = true;
    contarPassada('composicao', { cartoes: (deck ?? []).length, fonte: fonte.id, lang: fonte.lang });
    const paraCompor: CartaoParaCompor[] = (deck ?? []).map((c) => ({
      id: c.id, word: c.word, back: c.translation ?? null, sentence: c.sentence ?? null,
      srcLang: c.srcLang ?? null, tgtLang: c.tgtLang ?? null,
      clozePrompt: (c as { clozePrompt?: string | null }).clozePrompt ?? null,
      clozeAnswer: (c as { clozeAnswer?: string | null }).clozeAnswer ?? null,
      cefrLevel: (c as { cefrLevel?: string | null }).cefrLevel ?? null,
      cefrSource: (c as { cefrSource?: string | null }).cefrSource ?? null,
      occurrences: (c as { occurrences?: number | null }).occurrences ?? null,
      difficultyScore: (c as { difficultyScore?: number | null }).difficultyScore ?? null,
      dueAt: (c as { dueAt?: number | null; due?: number | null }).dueAt ?? (c as { due?: number | null }).due ?? null,
    }));
    void compor({
      jogo: 'memory',   // o pool é o mesmo para os jogos de palavra; o jogo só define o recorte final
      fonte: { id: fonte.id === 'sessao' ? 'sessao' : fonte.id === 'trilha' ? 'trilha' : 'baralho',
               ref: fonte.id === 'sessao' ? fonte.sessionId : fonte.id === 'trilha' ? baseLang(fonte.lang) : null,
               /* O idioma agora VIAJA no pedido. Sem ele o servidor gastava os 200 slots com
                  cartões de qualquer idioma e o seletor do lobby não tinha efeito nenhum. */
               lang: baseLang(fonte.lang) },
      dificuldade: faixas.length ? faixas : undefined,
      estrategia,
      limite: LIMITE_DA_COMPOSICAO,
    }, paraCompor, buscarComposicaoPeloFunil).then((c) => { if (vivo) setComposicao(c); });
    return () => { vivo = false; };
  }, [deck, fonte, faixas, estrategia]);

  /**
   * A lista curada do idioma escolhido. Hoje só existe inglês (`data/trilha/en.json`); outros
   * idiomas simplesmente não oferecem a aba, em vez de oferecerem uma trilha vazia.
   */
  const trilha: DadoTrilha | null = useMemo(
    () => (baseLang(fonte.lang) === 'en' ? (trilhaEn as DadoTrilha) : null),
    [fonte.lang],
  );

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
  const fontesOferecidas = useMemo(
    () => fontesDisponiveis({
      embutido: !!embutido,
      temSessao: !!(recording || sessaoEmUso),
      temTrilha: !!trilha,
      sessoesDisponiveis: sessoes.length,
    }),
    [embutido, recording, sessaoEmUso, trilha, sessoes.length],
  );

  /**
   * A trilha de UM idioma qualquer — não a do idioma vigente.
   *
   * A sala consulta pelo idioma que está selecionado NELA, antes de aplicar. Uma versão que
   * respondesse pelo `fonte.lang` atual faria a Trilha recusar o idioma que a pessoa acabou de
   * escolher, com uma frase citando o idioma anterior.
   *
   * Hoje só existe `data/trilha/en.json`; o dia em que houver outro, esta é a única função a mudar.
   */
  const trilhaDe = React.useCallback((lang: string) => {
    const dado = baseLang(lang) === 'en' ? (trilhaEn as DadoTrilha) : null;
    if (!dado) return { niveis: [] as CefrLevel[], total: 0 };
    return {
      niveis: (Object.keys(dado.niveis) as CefrLevel[]).filter(n => (dado.niveis[n] ?? []).length > 0),
      total: Object.values(dado.niveis).reduce((n, lista) => n + (lista?.length ?? 0), 0),
    };
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
  const jogaveis = useMemo(() => {
    if (fonte.id === 'trilha') {
      if (!trilha || !fonte.nivel) return triagem.usaveis;
      const doBanco = new Map(triagem.usaveis.map(c => [chaveDaPalavra(c.word), c]));
      const embutidos = cartoesDaTrilha(trilha, fonte.nivel)
        .filter(c => !doBanco.has(chaveDaPalavra(c.word))) as unknown as VocabCard[];
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
    return recortarPelaComposicao(triagem.usaveis, composicao, {
      /* Com filtro de faixa ligado, NÃO completar: encher a rodada com cartões fora da faixa
         apagaria em silêncio o recorte que a pessoa acabou de escolher nos chips. */
      completar: !faixas.length,
    });
  }, [triagem.usaveis, fonte.id, fonte.nivel, trilha, composicao, faixas.length]);

  /**
   * O ACERVO DA FONTE — sem teto. É o conjunto inteiro que a fonte atual oferece.
   *
   * `jogaveis` (acima) é o RECORTE que vai virar rodada: quando o servidor compõe, ele vem
   * capado em `limite: 200`. Os dois responderiam a perguntas diferentes, mas a tela usava
   * `jogaveis` para as duas — e passava a dizer "200 prontas" num baralho de 1.902.
   */
  const acervoDaFonte = useMemo(() => {
    if (fonte.id !== 'trilha' || !trilha || !fonte.nivel) return triagem.usaveis;
    const doBanco = new Map(triagem.usaveis.map(c => [chaveDaPalavra(c.word), c]));
    const embutidos = cartoesDaTrilha(trilha, fonte.nivel)
      .filter(c => !doBanco.has(chaveDaPalavra(c.word))) as unknown as VocabCard[];
    return [...triagem.usaveis, ...embutidos];
  }, [triagem.usaveis, fonte.id, fonte.nivel, trilha]);

  /* As duas populações dentro de `usaveis`: a que serve aos jogos de par e a que só serve ao
     duelo. Separar é o que permite a faixa de status dizer a verdade inteira. */
  const pistas = useMemo(() => pistasDaTriagem(triagem), [triagem]);

  /* Quantas do acervo NUNCA apareceram numa rodada. Sai do histórico que já está em memória —
     é o número que faz o card do mapa valer o clique, em vez de repetir o total. */
  const nuncaCairam = useMemo(
    () => acervoDaFonte.reduce((n, c) => n + (historico.has(c.word) ? 0 : 1), 0),
    [acervoDaFonte, historico],
  );

  /** Os números que vão para a tela. `total` responde "quantas eu tenho"; `naRodada`, "quantas agora". */
  const contagem = useMemo(
    () => contagemDaFonte(composicao, acervoDaFonte.length),
    [composicao, acervoDaFonte.length],
  );

  /* Quantos itens existem por faixa NO RECORTE ATUAL — é o que permite desabilitar um chip com o
     MOTIVO ("só 2 difíceis; o jogo precisa de 4") em vez de deixar o usuário clicar e falhar. */
  const contagemPorFaixa = useMemo(() => {
    const conta = { facil: 0, medio: 0, dificil: 0 };
    for (const c of triagem.usaveis) {
      const f = faixaDeScore((c as { difficultyScore?: number | null }).difficultyScore ?? null);
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
    () => new Map<string, VocabCard>(jogaveis.map(c => [c.word.toLowerCase(), c])),
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
      return achado?.origem ?? fonte.id;
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
    if (!jogo || !(jogo in MINIGAMES)) return;   // 'review'/'active_production' moram no Estudo
    const marca = `${jogo}|${seed?.word ?? ''}|${seed?.text ?? ''}`;
    if (sementeUsadaRef.current === marca) return;
    if (!deck || (!jogaveis.length && !frases.length)) return;   // ainda carregando
    sementeUsadaRef.current = marca;
    /* "Praticar isto" vindo de outra tela é um começo, não a continuação de nada — mesmo que a
       corrente anterior fosse do mesmo jogo. */
    setSequencia(null);
    const pronta = montarRodada(jogo as MinigameId, seed);
    if (pronta) comecar(pronta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, deck, frases.length, jogaveis.length]);
  /* Há voz sintetizada neste navegador? É o que decide se a trilha tem jogo de escuta. Medido uma
     vez: `speechSynthesis` não muda de existência no meio da sessão. */
  const temVoz = useMemo(() => isTtsSupported(), []);

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
    () => new Set(jogaveis.filter(c => isDueNow(c, 'fsrs')).map(c => c.word)),
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
    contarPassada('gate', { cartas: jogaveis.length, falas: frases.length, fonte: fonte.id, lang: fonte.lang });
    const porId = estadoDeCadaJogo({
      cartas: jogaveis,
      frases,
      temAudio: !!audioSessao,
      audioPronto: !!audioParaJogos,
      temVoz,
      fonteId: fonte.id,
      lang: fonte.lang,
    });
    return JOGOS.map(j => ({ ...j, estado: porId[j.id] }));
  }, [jogaveis, frases, audioSessao, audioParaJogos, fonte.lang, fonte.id, temVoz]);

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
    const naOutraFonte = embutido ? 0
      : fonte.id === 'trilha' ? cartoesDaFonte(deck ?? [], { id: 'baralho', lang: fonte.lang }).usaveis.length
        : trilhaDe(fonte.lang).total;
    return {
      fonteId: fonte.id,
      outrosIdiomas: idiomasDoBaralho.filter(i => i.lang !== atual),
      naOutraFonte,
      descartados: triagem.fora.length,
      gravacoes: embutido ? 0 : sessoes.length,
      nomeDoIdioma: langLabelPt,
    };
  }, [deck, fonte, embutido, idiomasDoBaralho, triagem.fora.length, sessoes.length, trilhaDe]);

  /** A porta escolhida vira navegação. Cada ação leva ao lugar que RESOLVE aquela causa. */
  const abrirPorta = (d: Desbloqueio) => {
    const base = escolhaDaFonte(fonte);
    if (d.acao === 'trocar-idioma' && d.lang) { aplicarEscolha({ ...base, lang: d.lang }); return; }
    /* Aplica direto, sem reabrir a sala: a queixa era ATRITO, e mandar de volta para o menu quem
       acabou de ler "jogue em inglês" é pedir a mesma decisão duas vezes. A mudança é visível na
       hora, a faixa "Praticando" e a grade inteira se refazem. */
    if (d.acao === 'trocar-fonte' && d.paraFonte) {
      aplicarEscolha({ ...base, origem: d.paraFonte, escopo: 'todas', sessionId: undefined });
      return;
    }
    if (d.acao === 'revisar-descartes') { setCurando(true); return; }
    // Escolher gravação é exatamente a linha "QUAIS" da sala — aqui reabrir é o caminho certo.
    if (d.acao === 'escolher-gravacao') { setSalaAberta(true); return; }
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
    () => aplicarOrdem<typeof estados[number]>(estados, ordem, j => j.id),
    [estados, ordem],
  );
  const paginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
  /* A página só existe enquanto houver conteúdo nela: fixar ou desafixar não muda o total, mas
     um jogo novo pode. Sem este clamp, ficar na página 2 e a lista encolher daria grade vazia. */
  const paginaAtual = Math.min(pagina, paginas - 1);
  const visiveis = ordenados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
  const idsVisiveis = visiveis.map(j => j.id);

  const mexerNaOrdem = (nova: OrdemDosJogos) => { setOrdem(nova); gravarOrdem(nova); };

  const vencidos = metrics?.dueToday ?? 0;
  const tamanhoDoBaralho = deck?.length ?? 0;
  const menorMinimo = Math.min(...JOGOS.map(j => MINIGAMES[j.id].minItems));

  /**
   * O jogo do card "sua próxima rodada": o primeiro JOGÁVEL na ordem do usuário.
   *
   * `tamanhoDaRodada` é o que a rodada REALMENTE terá: o teto do jogo, ou o acervo quando ele é
   * menor. `disponiveis` já vem capado em `maxItems` para os jogos de baralho, mas os de frase não
   * têm esse teto aplicado — sem o `min` o card prometeria 40 falas numa rodada de 6.
   */
  const proximaRodada = useMemo(() => {
    const j = ordenados.find(x => x.estado?.ok);
    if (!j) return null;
    return { ...j, tamanhoDaRodada: j.estado.tamanhoDaRodada };
  }, [ordenados]);

  /**
   * O TOUR vive ao lado da tela do jogo, não no lugar dela: ele precisa apontar para os elementos
   * REAIS, com o conteúdo real da pessoa. Por isso cada rodada é envolvida por este ajudante em
   * vez de um `return` direto.
   */
  const comTour = (tela: React.ReactNode, jogo: MinigameId) => telaCheia(
    tela,
    tourDe === jogo ? (
      <TourGuiado
        passos={PASSOS_DOS_JOGOS[jogo]}
        titulo={JOGOS.find(j => j.id === jogo)?.titulo[ageProfile] ?? ''}
        onFim={() => { marcarTourFeito(jogo); setTourDe(null); }}
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
    if (!embutido) return <>{n}{aoLado}</>;
    return createPortal(
      <>
        <div className="fixed inset-0 z-[35] flex flex-col bg-canvas">{n}</div>
        {aoLado}
      </>,
      document.body,
    );
  };

  /* A ANTESSALA ocupa a tela como uma rodada ocupa: é a mesma decisão de "não dividir atenção", e
     de quebra herda o `telaCheia` que resolve o `transform` do invólucro da aba. */
  if (antessala) {
    const jogoUI = JOGOS.find(j => j.id === antessala.jogo);
    const refsAnteriores = ultimaRodada.get(antessala.jogo) ?? [];
    return telaCheia(
      <AntessalaDaRodada
        gameId={antessala.jogo}
        titulo={jogoUI?.titulo[ageProfile] ?? ''}
        /* Z1 — CHIPS DE DIFICULDADE. Só aparecem onde significam algo: os 5 jogos de frase jogam
           sobre falas, que não têm dificuldade por palavra. Chip inerte ensina que a tela mente. */
        filtroDificuldade={aceitaFiltroDeDificuldade(antessala.jogo) ? {
          faixas,
          estrategia,
          aoTrocarFaixa: (f: FaixaDificuldade) => {
            setFaixas((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));
            setAntessala(null);   // o recorte mudou: a prévia atual não vale mais
          },
          aoTrocarEstrategia: (e: EstrategiaDeDistribuicao) => { setEstrategia(e); setAntessala(null); },
          disponivelPorFaixa: contagemPorFaixa,
          minimoDoJogo: MINIGAMES[antessala.jogo]?.minItems ?? 3,
          origemDaComposicao: composicao?.origemDaComposicao ?? 'fallback-local',
        } : null}
        itens={antessala.previa}
        historico={historico}
        vencidos={vencidosAgora}
        /* Medido contra os `item_ref` GRAVADOS da última rodada deste jogo — os mesmos que o
           "Repetir a última" usa. É o que a lista de palavras fazia mal e agora vem em número. */
        repetidos={repetidosDaUltima(antessala.previa, new Set(refsAnteriores))}
        ageProfile={ageProfile}
        /* O recorte que a pessoa escolheu no lobby seguia até aqui e sumia da tela. `rotuloDaFonte`
           já era calculado neste componente para o lobby, bastava repassar. */
        fonte={{ rotulo: rotuloDaFonte(fonte, sessaoEmUso?.title), idioma: langLabelPt(fonte.lang) }}
        duracao={rotuloDeDuracao(estimativaDeMinutos(antessala.previa.length, temposMedidos))}
        onJogar={() => comecar(antessala)}
        onTrocar={() => {
          const naTela = new Set<string>(antessala.previa.map(i => i.ref));
          const nova = montarRodada(antessala.jogo, null, undefined, naTela);
          if (nova) setAntessala(nova);
        }}
        onRepetir={refsAnteriores.length
          ? () => { const r = montarRodada(antessala.jogo, null, new Set(refsAnteriores)); if (r) setAntessala(r); }
          : null}
        onSair={() => setAntessala(null)}
        pularSempre={pularSempre}
        onMudarPularSempre={mudarPularSempre}
      />,
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
  const sairDaRodada = (limpar: () => void) => () => { limpar(); encerrarCorrente(); };

  // Rodada em curso ou recompensa a revelar ocupam a tela inteira — jogo não divide atenção.
  if (rodadaTermo) {
    return comTour(<TermoGame rodadas={rodadaTermo} ageProfile={ageProfile} onFinish={aoTerminar} onExit={sairDaRodada(() => setRodadaTermo(null))} />, 'termo');
  }
  if (rodadaFrase) {
    return comTour(<ScrambleGame rodadas={rodadaFrase} ageProfile={ageProfile} onFinish={aoTerminar} onExit={sairDaRodada(() => setRodadaFrase(null))} />, 'scramble');
  }
  if (rodadaEscuta) {
    return comTour(<EscutaGame rodadas={rodadaEscuta} audioUrl={audioParaJogos} ageProfile={ageProfile} onFinish={aoTerminar} onExit={sairDaRodada(() => setRodadaEscuta(null))} />, 'escuta');
  }
  if (rodadaDitado) {
    return comTour(<DitadoGame rodadas={rodadaDitado} audioUrl={audioParaJogos} ageProfile={ageProfile} onFinish={aoTerminar} onExit={sairDaRodada(() => setRodadaDitado(null))} />, 'ditado');
  }
  if (rodadaConectores) {
    return comTour(<ConectoresGame rodadas={rodadaConectores} ageProfile={ageProfile} onFinish={aoTerminar} onExit={sairDaRodada(() => setRodadaConectores(null))} />, 'conectores');
  }
  if (rodadaKaraoke) {
    return comTour(<KaraokeGame falas={rodadaKaraoke} audioUrl={audioParaJogos} ageProfile={ageProfile} onFinish={aoTerminar} onExit={sairDaRodada(() => setRodadaKaraoke(null))} />, 'karaoke');
  }
  if (rodada) {
    const comuns = { items: rodada.itens, ageProfile, onFinish: aoTerminar, onExit: sairDaRodada(() => setRodada(null)) };
    if (rodada.jogo === 'memory') return comTour(<MemoryGame {...comuns} />, 'memory');
    if (rodada.jogo === 'wordsearch') return comTour(<WordSearchGame {...comuns} />, 'wordsearch');
    if (rodada.jogo === 'blitz') return comTour(<BlitzGame {...comuns} />, 'blitz');
  }
  /* F6 — PASSO 2, depois da raspadinha.
     A raspadinha funciona como recompensa e continua onde estava; o defeito era ser o FIM DA
     LINHA. Quais palavras você errou era gravado (uma linha por item em `exercise_results`) e
     nunca mostrado. */
  if (resultado && verResumo) {
    const porRef = new Map((deck ?? []).map((c) => [String(c.word).toLowerCase(), c]));
    const itensResumo: ItemDaRodada[] = resultado.items.map((o) => {
      const c = porRef.get(String(o.itemRef).toLowerCase());
      return {
        itemRef: o.itemRef, cardId: o.cardId ?? null, correct: !!o.correct, attempts: o.attempts ?? 1,
        hinted: !!o.hinted, back: (c as { translation?: string | null } | undefined)?.translation ?? null,
        cefrLevel: (c as { cefrLevel?: string | null } | undefined)?.cefrLevel ?? null,
        cefrSource: (c as { cefrSource?: string | null } | undefined)?.cefrSource ?? null,
        occurrences: (c as { occurrences?: number | null } | undefined)?.occurrences ?? null,
      };
    });
    const acertos = itensResumo.filter((i) => i.correct).length;
    return telaCheia(
      <ResumoDaRodada
        jogo={JOGOS.find((j) => j.id === resultado.gameId)?.titulo[ageProfile] ?? resultado.gameId}
        fonte={rotuloDaFonte(fonte, sessaoEmUso?.title)}
        itens={itensResumo}
        tempoMs={resultado.items.reduce((a, o) => a + (o.ms ?? 0), 0)}
        xp={xpFromRound(resultado)}
        combo={sequencia?.rodadas ?? undefined}
        anterior={null}
        /* Só com desempenho bom: botão que falha ao ser clicado é pior que botão ausente. */
        podeSubirDificuldade={acertos / Math.max(itensResumo.length, 1) >= 0.8}
        aoRefazerErradas={(erradas) => {
          setVerResumo(false);
          const refs = new Set(erradas.map((e) => e.itemRef));
          /* "Refazer só as erradas" prioriza os refs que falharam; o construtor completa com o
             mesmo recorte quando não houver itens suficientes (o jogo tem mínimo). */
          const nova = montarRodada(resultado.gameId, null, undefined, refs);
          if (nova) setAntessala(nova); else continuarSequencia();
        }}
        aoSubirDificuldade={() => { setVerResumo(false); continuarSequencia(); }}
        aoMaisUma={() => { setVerResumo(false); continuarSequencia(); }}
        aoVoltar={() => { setVerResumo(false); sairDaSequencia(); }}
      />,
      'resumo',
    );
  }

  if (resultado) {
    /* A raspadinha é a tela de CONTINUAÇÃO — não ganhou posição nova na cascata porque já
       ocupava esta, e já passa pelo `telaCheia` que resolve o portal no modo embutido. */
    return telaCheia(
      <ScratchReward
        report={resultado}
        ageProfile={ageProfile}
        sequencia={resumir(sequencia)}
        recorde={recordeDoJogo(resultado.gameId)}
        onContinuar={continuarSequencia}
        /* Sem `item_ref` gravado não há como remontar — e botão inerte ensina que a tela quebrou. */
        onRepetir={refsDoResultado.length ? repetirSequencia : null}
        onDone={sairDaSequencia}
        semMaterial={semMaterial}
        onPularVez={saldoSeeds >= CUSTO_PULAR && !gastando ? pularVez : null}
        custoPular={CUSTO_PULAR}
        saldoSeeds={saldoSeeds}
      />,
    );
  }
  /* Sem a camada `z-[35]`: `ComoSeJoga` já é `fixed inset-0 z-[90]`. Mas PRECISA do portal —
     `fixed` sozinho não escapa do `transform` que o invólucro da aba deixa (ver `telaCheia`), e
     sem ele a ficha abriria medida por uma div de altura zero. */
  if (explicando) {
    const carta = JOGOS.find(j => j.id === explicando)!;
    const ficha = (
      <ComoSeJoga
        jogo={explicando}
        titulo={carta.titulo[ageProfile]}
        ageProfile={ageProfile}
        onJogar={() => { setExplicando(null); pedirParaJogar({ id: explicando }); }}
        onFechar={() => setExplicando(null)}
      />
    );
    return embutido ? createPortal(ficha, document.body) : ficha;
  }
  if (importando) {
    return telaCheia(
      <BaralhoAnki
        deck={deck ?? []}
        idioma={fonte.lang}
        idiomaNativo={idiomaNativo}
        ageProfile={ageProfile}
        onVoltar={() => setImportando(false)}
        onImportou={async () => { try { setDeck((await fetchDeck()).filter(c => c.inDeck)); } catch { /* mantém */ } }}
      />
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
    const doBaralho = acervoDaFonte.map(c => {
      const h = historico.get(c.word);
      return {
        ref: c.word, titulo: c.word, pista: c.translation,
        vencido: vencidosAgora.has(c.word),
        vezes: h?.vezes ?? 0, erros: h?.erros ?? 0, ultimoAcerto: h?.ultimoAcerto ?? true,
      };
    });
    const dasFalas = frases.map(f => {
      const h = historico.get(f.id);
      return {
        ref: f.id, titulo: f.text, pista: f.translation,
        vencido: false,
        vezes: h?.vezes ?? 0, erros: h?.erros ?? 0, ultimoAcerto: h?.ultimoAcerto ?? true,
      };
    });
    return telaCheia(
      <MapaDoConteudo
        titulo={rotuloDaFonte(fonte, sessaoEmUso?.title)}
        /* Na sessão o material É a fala; nas outras fontes é a palavra. Misturar os dois daria
           uma lista que não corresponde a rodada nenhuma. */
        itens={fonte.id === 'sessao' ? dasFalas : doBaralho}
        ageProfile={ageProfile}
        onVoltar={() => setVendoMapa(false)}
        niveis={fonte.id === 'trilha' && trilha
          ? progressoDaTrilha(trilha, new Set(doBaralho.filter(i => i.vezes > 0).map(i => chaveDaPalavra(i.ref))))
              .map(p => ({ nivel: p.nivel, total: p.total, jaCairam: p.jaTem, pct: p.pct }))
          : undefined}
        nivelAtivo={fonte.nivel}
        onEscolherNivel={fonte.id === 'trilha' ? (n) => setFonte(f => ({ ...f, nivel: n as CefrLevel })) : undefined}
        historicoDesde={historicoDesde}
      />,
    );
  }
  if (curando) {
    return telaCheia(
      <CuradoriaBaralho
        triagem={triagem}
        idioma={fonte.lang}
        ageProfile={ageProfile}
        onVoltar={() => setCurando(false)}
        onMudou={async () => { try { setDeck((await fetchDeck()).filter(c => c.inDeck)); } catch { /* mantém */ } }}
      />
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
  const sala = salaAberta && fontesOferecidas.length > 1 ? (
    <SalaDeEscolha
      escolhaAtual={escolhaDaFonte(fonte)}
      idiomas={idiomasDoBaralho}
      gravacoes={sessoes}
      trilhaDe={trilhaDe}
      ageProfile={ageProfile}
      aoFechar={() => setSalaAberta(false)}
      aoConfirmar={(escolha) => {
        setSalaAberta(false);
        aplicarEscolha(escolha);
      }}
    />
  ) : null;

  if (deck === null && !erro) {
    return (
      <div className={embutido ? '' : 'flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10'}>
        {sala}
        <div className="h-24 rounded-2xl bg-surface border border-border-subtle animate-pulse mb-6" aria-hidden />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-surface border border-border-subtle animate-pulse" aria-hidden />)}
        </div>
      </div>
    );
  }

  /* `pb-28`: o botão flutuante do tutor fica no canto inferior direito, fixo, e cobria a última
     carta da grade, medido. A folga devolve a carta ao alcance do clique.

     Embutido, nada disso é nosso: o container da aba já rola e já tem padding, e repetir os dois
     aqui daria scroller dentro de scroller (duas barras, roda do mouse presa na de dentro) e
     padding somado nas bordas. Sobra só a transição de entrada. */
  return (
    <div className={embutido ? 'animate-in fade-in duration-200' : 'flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 pb-28 animate-in fade-in duration-200'}>
      {/* LARGURA MÁXIMA. Sem ela, num monitor de 1920 a faixa de revisão esticava por 1.829px e
          a arte de cada carta ia a 263px de altura, grande e grosseira, porque os desenhos são
          feitos de poucas formas. Limitar o conteúdo resolve os dois de uma vez, e de quebra o
          texto para de atravessar a tela inteira, que já é ruim de ler por si só. */}
      {sala}
      <div className="max-w-6xl mx-auto">
      {/* Embutido não tem cabeçalho próprio: a tela da sessão já traz um `<h1>` logo acima, e um
          segundo `<h1>` na mesma página quebra a navegação por cabeçalho do leitor de tela, a
          pessoa passa a ter dois "títulos da página" e nenhum diz onde ela está. */}
      {!embutido && (
        <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-display font-black text-2xl text-ink tracking-tight">
              {ageProfile === 'kids' ? 'Jogar' : ageProfile === 'senior' ? 'Praticar jogando' : 'Jogar'}
            </h1>
            <p className="text-[13px] text-ink-muted mt-1 max-w-[70ch]">
              {ageProfile === 'senior'
                ? 'Jogos curtos com as palavras que você já salvou. Cada acerto conta para a sua memória.'
                : 'Rodadas curtas com as SUAS palavras. O que você acerta aqui conta na revisão.'}
            </p>
          </div>
          {/* PROGRESSO no cabeçalho, compacto: nível com a barra até o próximo, ofensiva e seeds.
              Mesma fonte do Início (`deriveProgress(metrics)`), e cada número explica no `title`
              de onde saiu, XP vem de sessões, palavras e revisões medidas; seeds são ganhas menos
              gastas. Sem métrica, esqueleto: nunca um zero que parece dado. */}
          {progress.available ? (
            <section
              aria-label="Seu progresso"
              className="card-panel bg-surface px-4 py-2.5 flex items-center gap-5 shrink-0 self-start sm:self-auto"
            >
              <div
                className="min-w-[8.5rem]"
                title={`${progress.xp} XP no total, ${metrics ? `${metrics.sessions} ${metrics.sessions === 1 ? 'sessão' : 'sessões'}, ${metrics.wordsCaptured} palavras capturadas, ${metrics.reviews} revisões, ${metrics.drillItems ?? 0} itens de jogo` : 'calculado das suas métricas'}. Faltam ${progress.xpForLevel - progress.xpIntoLevel} XP para o próximo.`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label-mono">{ageProfile === 'senior' ? 'Etapa' : 'Nível'} {progress.level}</span>
                  <span className="text-[11px] text-ink-muted tabular-nums">{progress.xpIntoLevel}/{progress.xpForLevel} XP</span>
                </div>
                <div className="h-1.5 bg-canvas rounded-full mt-1.5 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.levelPct} aria-label={`Progresso para ${ageProfile === 'senior' ? 'etapa' : 'nível'} ${progress.level + 1}`}>
                  <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${progress.levelPct}%` }} />
                </div>
              </div>
              <span
                className="flex items-center gap-1.5 text-[13px] font-bold text-ink"
                title={progress.practicedToday ? `Você revisou hoje: ${progress.streakDays} ${progress.streakDays === 1 ? 'dia seguido' : 'dias seguidos'}.` : 'Dias seguidos com revisão. Uma revisão hoje mantém a ofensiva.'}
              >
                <Flame className={`w-4 h-4 ${progress.practicedToday ? 'text-warn-ink' : 'text-ink-faint'}`} aria-hidden /> {progress.streakDays}
                <span className="text-ink-muted font-medium">{progress.streakDays === 1 ? 'dia' : 'dias'}</span>
              </span>
              <span
                className="flex items-center gap-1.5 text-[13px] font-bold text-ink"
                title={`Saldo: ${progress.seedsGanhas} ganhas (1 por palavra capturada, 4 por revisão certa) − ${metrics?.seedsGastas ?? 0} gastas.`}
              >
                <Sprout className="w-4 h-4 text-good-ink" aria-hidden /> {progress.seeds}
                <span className="text-ink-muted font-medium">seeds</span>
              </span>
            </section>
          ) : (
            <div className="card-panel bg-surface px-4 py-2.5 h-[54px] w-[22rem] max-w-full animate-pulse shrink-0" aria-hidden />
          )}
        </header>
      )}

      {/* A CORRENTE QUE ACABOU DE ENCERRAR.
          Sair no meio de uma rodada perde a rodada parcial (nenhum dos nove jogos expõe relatório
          parcial). O que já estava somado, porém, foi conquistado, apagá-lo sem dizer nada é o
          tipo de silêncio que faz a pessoa achar que o app perdeu o progresso dela. */}
      {ultimaCorrente && ultimaCorrente.rodadas > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] animate-in fade-in">
          <span className="kpi-pill">
            sequência encerrada · <b>{ultimaCorrente.rodadas}</b> rodadas · <b>{ultimaCorrente.pontos}</b> pontos
          </span>
          <span className="text-ink-faint">{ultimaCorrente.precisao}% de acerto no conjunto</span>
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
      {!embutido && (
        <div className="mb-4 min-h-[46px]">
      {fontesOferecidas.length > 1 && (
        /* ── O QUE ESTÁ VALENDO, E COMO TROCAR ──────────────────────────────────────────────
           Aqui havia um `<details>` recolhido cujo resumo era "Praticar · Minhas palavras ·
           ajustar" em texto pequeno. Ninguém abria, e quem abria encontrava um seletor de
           idioma, três botões de fonte e um chevron que revelava uma lista de gravações
           renderizada FORA do próprio `<details>`, que continuava na tela depois de fechá-lo.

           Agora a escolha é feita na sala, e o que fica aqui é o RECIBO dela: o que está valendo,
           e um clique para rever. Um botão só, com alvo de toque de verdade. */
        <button
          onClick={() => setSalaAberta(true)}
          className="w-full card-panel bg-surface p-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-left hover:border-accent transition-colors cursor-pointer"
        >
          <span className="label-mono">Praticando</span>
          <span className="text-[13px] font-bold text-ink">{rotuloDaFonte(fonte, sessaoEmUso?.title)}</span>
          {fonte.lang && <span className="text-[12.5px] text-ink-muted">· {langLabelPt(fonte.lang)}</span>}
          <span className="ml-auto flex items-center gap-1.5 text-[12.5px] font-bold text-accent-ink">
            <SlidersIcon className="w-3.5 h-3.5" aria-hidden /> trocar
          </span>
        </button>
      )}
        </div>
      )}

      {verRecordes && <Recordes ageProfile={ageProfile} onFechar={() => setVerRecordes(false)} />}
      {/* ── STATUS ── Só números, na MESMA base do baralho, e nada aqui é clicável.
          Ficavam na mesma linha das ações, em texto cinza idêntico: "988 em outro idioma" (que
          não faz nada) ao lado de "19 para revisar" (que abre uma tela cheia), distinguidos
          apenas por um sublinhado. */}
      {/* O NÚMERO ÚNICO SOMAVA DUAS POPULAÇÕES DIFERENTES, e era isso que fazia a queda parecer
          defeito. "921 prontas" contava junto o cartão com tradução e o cartão que só tem frase,
          medido no baralho real, 56% do acervo não tem tradução nenhuma. Os oito jogos de par
          precisam de tradução; só o duelo relâmpago joga com a lacuna da frase. Daí a Memória
          abrir com 8 de 246 e não de 921, e daí a conta parecer errada quando era só incompleta. */}
      {/* `min-h`: os números chegam em duas levas (a triagem local e depois a composição servida) e
          cada leva acrescenta um pedaço nesta linha, que, embrulhada em 412px, ganhava mais uma
          linha e empurrava a grade inteira. 84px são as três linhas que o estado cheio ocupa nesse
          viewport (medido). A partir de `sm` tudo cabe numa linha só e não há o que reservar. */}
      <div className="mb-2 flex items-center gap-4">
      <button
        type="button"
        onClick={alternarDetalhes}
        aria-expanded={detalhes}
        className="flex items-center gap-1.5 text-[12px] font-bold text-ink-muted hover:text-ink transition-colors cursor-pointer min-h-[24px]"
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${detalhes ? 'rotate-90' : ''}`} aria-hidden />
        {detalhes ? 'Esconder os números do baralho' : `Ver os números do baralho (${contagem.total} palavras)`}
      </button>
      <button
        type="button"
        onClick={() => setVerRecordes(true)}
        className="flex items-center gap-1.5 text-[12px] font-bold text-warn-ink hover:text-warn transition-colors cursor-pointer min-h-[24px]"
      >
        <TrophyIcon className="w-3.5 h-3.5" aria-hidden /> Recordes e ranking
      </button>
      </div>
      <section aria-label="Seu baralho" className={`card-panel bg-surface px-3 py-2.5 mb-2 min-h-[84px] sm:min-h-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted ${detalhes ? '' : 'hidden'}`}>
        <span className="label-mono">Seu baralho</span>
        <span className="font-bold text-good-ink" title={`${contagem.total} palavras do idioma escolhido passaram na régua de qualidade.`}>
          {contagem.total} no idioma
        </span>
        <span title="Jogos de par (memória, caça-palavras, soletrar) precisam de tradução de verdade.">
          · {pistas.comTraducao.length} com tradução
        </span>
        {pistas.soComFrase.length > 0 && (
          <span title="Sem tradução, mas com frase real, o duelo relâmpago joga com a lacuna.">
            · {pistas.soComFrase.length} só com frase
          </span>
        )}
        {!coreOnly(ageProfile) && triagem.outroIdioma.length > 0 && (
          <span title="Existem e prestam, mas são de outro idioma">
            · {triagem.outroIdioma.length} em outro idioma
          </span>
        )}
        {triagem.fora.length > 0 && <span>· {triagem.fora.length} fora do recorte</span>}
      </section>

      {/* ── AGIR ── Dois CARDS, e não dois links de texto.
          Eram `<button>` com sublinhado pontilhado, do mesmo tamanho e cor da linha de números
          logo acima, passavam batido, embora sejam as duas respostas para "por que tão pouco?".
          Ficam colados nos números que provocam a pergunta, e cada um traz o SEU número: um total
          sem conteúdo não convence ninguém a clicar. */}
      <section aria-label="Explorar o baralho" className={`grid gap-3 sm:grid-cols-2 mb-4 ${detalhes ? '' : 'hidden'}`}>
        {/* Os dois cards têm a MESMA altura reservada porque o texto de cada um muda de número de
            linhas quando as contagens chegam, e eles ficam logo acima da grade de nove jogos, que
            era o que descia. 100px é a altura do estado mais alto em 412px (medido). */}
        <button
          onClick={() => setVendoMapa(true)}
          className="card-panel bg-surface p-4 min-h-[100px] sm:min-h-0 text-left hover:border-accent transition-colors cursor-pointer flex items-start gap-3"
        >
          <span className="w-9 h-9 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0" aria-hidden>
            <MapIcon className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-bold text-[13.5px] text-ink">Mapa do conteúdo</span>
            <span className="block text-[12px] text-ink-muted leading-snug">
              {acervoDaFonte.length.toLocaleString('pt-BR')} {fonte.id === 'sessao' ? 'falas' : 'palavras'}
              {nuncaCairam > 0 && <> · <b className="text-ink">{nuncaCairam.toLocaleString('pt-BR')}</b> nunca caíram</>}
            </span>
          </span>
        </button>

        {/* Com zero, o card FICA — neutro e não-clicável. Zero é boa notícia e vale ser dita uma
            vez; sumir deixaria a pessoa sem saber que a régua existe e aprovou tudo. */}
        {triagem.fora.length > 0 ? (
          <button
            onClick={() => setCurando(true)}
            className="card-panel bg-surface p-4 min-h-[100px] sm:min-h-0 text-left hover:border-warn transition-colors cursor-pointer flex items-start gap-3"
          >
            <span className="w-9 h-9 rounded-xl bg-warn-soft text-warn-ink flex items-center justify-center shrink-0" aria-hidden>
              <SlidersIcon className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-[13.5px] text-ink">
                {triagem.fora.length} ficaram de fora
              </span>
              {/* `resumoDosPulados` existia e nunca tinha sido usado aqui — é a diferença entre
                  "22 fora do recorte" (que não aciona ninguém) e "13 sem tradução" (que é tarefa). */}
              <span className="block text-[12px] text-ink-muted leading-snug">
                {resumoDosPulados(triagem.fora) || 'ver o motivo de cada uma'}
              </span>
            </span>
          </button>
        ) : (
          /* Sem `opacity-70` no cartão inteiro. Ele apagava junto o texto secundário, que já é
             `text-ink-muted`: o par caía de 5,57:1 para 3,25:1 no tema vercel escuro, abaixo dos
             4,5:1. Medido em axe color-contrast. Este é o estado "nada pendente", ele deve ficar
             discreto, e fica: sem borda de destaque, com o ícone em tom suave. Apagar o texto não
             era o que produzia a discrição, era só o efeito colateral que quebrava a leitura. */
          <div className="card-panel bg-surface p-4 min-h-[100px] sm:min-h-0 flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-good-soft text-good-ink flex items-center justify-center shrink-0" aria-hidden>
              <Check className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-[13.5px] text-ink">Nada ficou de fora</span>
              <span className="block text-[12px] text-ink-muted leading-snug">todas passaram na régua</span>
            </span>
          </div>
        )}
      </section>

      {/* A LISTA DE GRAVAÇÕES. Aparece só quando pedida — a barra já é densa, e o caso comum é
          jogar a gravação em uso. Sem ela, "qual sessão?" não tinha resposta acionável. */}
      {escolhendoSessao && podeTrocarDeGravacao({ embutido: !!embutido, sessoesDisponiveis: sessoes.length }) && (
        <section className="card-panel bg-surface p-3 mb-4" aria-label="Escolher gravação">
          <p className="label-mono mb-2">De qual gravação vêm as frases</p>
          <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto custom-scrollbar">
            {sessoes.map(x => (
              <li key={x.id}>
                <button
                  onClick={() => { setSessaoEscolhida(x.id); setEscolhendoSessao(false); }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] cursor-pointer flex items-center gap-2 ${
                    (sessaoEmUso?.id ?? '') === x.id ? 'bg-accent-soft text-accent font-bold' : 'text-ink hover:bg-surface-hover'
                  }`}
                  title={x.title}
                >
                  <span className="truncate flex-1">{x.title}</span>
                  {/* Sem áudio, os jogos de escuta ficam de fora — dizer isto ANTES evita a
                      escolha que leva a três cartas bloqueadas. */}
                  {!x.audioUrl && <span className="badge-tag shrink-0">sem áudio</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fonte.id === 'trilha' && trilha && (
        <PainelTrilha
          dado={trilha}
          deck={deck ?? []}
          ageProfile={ageProfile}
          nivel={fonte.nivel}
          onEscolherNivel={(n: CefrLevel) => setFonte(f => ({ ...f, nivel: n }))}
        />
      )}

      {/* BARALHO VAZIO — o caso que antes dava tela em branco. Diz o que falta, com número.
          Na trilha ele não aparece: ali o caminho para sair do zero é o próprio painel acima. */}
      {tamanhoDoBaralho < menorMinimo && fonte.id !== 'trilha' ? (
        <section className="card-panel bg-surface p-8 text-center flex flex-col items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center">
            <Mic className="w-7 h-7 text-accent" aria-hidden />
          </span>
          <div>
            <p className="font-display font-extrabold text-[17px] text-ink">
              {tamanhoDoBaralho === 0 ? 'Você ainda não salvou palavras' : `Faltam ${menorMinimo - tamanhoDoBaralho} palavras`}
            </p>
            <p className="text-[13px] text-ink-muted mt-1.5 max-w-[46ch]">
              Os jogos usam as palavras que você guarda das suas gravações, nada de lista pronta.
              Você tem <b>{tamanhoDoBaralho}</b> e precisa de <b>{menorMinimo}</b> para a primeira rodada.
            </p>
          </div>
          <button
            onClick={() => onChangeView('capture')}
            className="py-2.5 px-5 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn transition-all cursor-pointer"
          >
            {ageProfile === 'kids' ? 'Gravar alguma coisa' : 'Capturar uma sessão'}
          </button>
        </section>
      ) : (
        <>
          {/* AGORA — só aparece quando há vencidos DE VERDADE (o contador estava sempre 0).
              Enquanto as métricas não chegaram, o espaço fica reservado: o card nascia da resposta
              da rede e empurrava para baixo tudo o que já estava pintado (0,05 do CLS medido no
              Jogar). 78px = p-4 + o bloco de 44 do ícone + a borda do `card-panel`. */}
          {detalhes && vencidos === 0 && !metrics && (
            <div className="w-full h-[78px] mb-4 rounded-2xl bg-surface border border-border-subtle animate-pulse" aria-hidden />
          )}
          {detalhes && vencidos > 0 && (
            <button
              onClick={() => pedirParaJogar({ id: 'blitz' })}
              className="w-full card-panel bg-accent-soft/40 border-accent/30 p-4 mb-4 flex items-center gap-4 text-left hover:border-accent transition-colors cursor-pointer"
            >
              <span className="w-11 h-11 rounded-xl bg-accent text-white flex items-center justify-center shrink-0" aria-hidden>
                <Timer className="w-5 h-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display font-extrabold text-[15px] text-ink">
                  {vencidos} {vencidos === 1 ? 'palavra pedindo revisão' : 'palavras pedindo revisão'}
                </span>
                <span className="block text-[12px] text-ink-muted">
                  {ageProfile === 'senior' ? 'Um desafio rápido resolve.' : 'Um duelo relâmpago resolve.'}
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-ink-faint shrink-0" aria-hidden />
            </button>
          )}

          {/* ── SUA PRÓXIMA RODADA ─────────────────────────────────────────────────────────────
              O lobby respondia "quais jogos existem" e deixava a escolha inteira por conta de quem
              chega, nove cartas, cada uma com dois números. Quem só quer jogar pagava uma decisão
              antes de qualquer coisa acontecer.

              O JOGO OFERECIDO É O PRIMEIRO DA ORDEM DO USUÁRIO que dá para jogar agora, e isso é
              deliberado: a ordem já É a preferência declarada (`lib/ordemDosJogos`, fixar no topo,
              mover), então respeitá-la é ler o que a pessoa disse, não inventar uma recomendação
              que ela não pediu e não pode conferir.

              O CARD NÃO PROMETE COMPOSIÇÃO. Ele diz o tamanho da rodada, a fonte e a duração
              medida, tudo já conhecido. Quantas são novas e quantas venceram só se sabe DEPOIS do
              sorteio, e é a antessala (um clique adiante) que reporta isso. Antecipar aqui seria
              uma promessa que o sorteio pode não cumprir. */}
          {proximaRodada && (
            <section className="card-panel bg-surface border-accent/40 p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="label-mono text-accent-ink mb-1">Sua próxima rodada</p>
                <h2 className="font-display font-black text-xl text-ink tracking-tight">
                  {proximaRodada.titulo[ageProfile]}
                </h2>
                <p className="text-[13px] text-ink-muted mt-1">
                  <b className="text-ink">{proximaRodada.tamanhoDaRodada}</b>{' '}
                  {proximaRodada.estado.fonte === 'falas' ? 'falas' : 'palavras'}
                  {' · '}{rotuloDaFonte(fonte, sessaoEmUso?.title).toLowerCase()}
                  {' · '}{rotuloDeDuracao(estimativaDeMinutos(proximaRodada.tamanhoDaRodada, temposMedidos))}
                </p>
              </div>
              <button
                onClick={() => pedirParaJogar({ id: proximaRodada.id })}
                className="btn-solid shrink-0 py-3 px-6"
              >
                <IconePlay className="w-4 h-4" aria-hidden />
                {ageProfile === 'kids' ? 'Bora jogar' : ageProfile === 'senior' ? 'Começar' : 'Jogar'}
              </button>
            </section>
          )}

          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h2 className="label-mono">Escolha um jogo</h2>

            {/* ── O CONTROLE QUE FALTAVA ─────────────────────────────────────────────────────
                A prévia da rodada tem um "começar direto da próxima vez", e ele fica DENTRO da
                própria prévia. Quem marcava perdia o único jeito de desmarcar: a tela do checkbox
                era justamente a que o checkbox impedia de abrir. Beco sem saída, e foi assim que
                a antessala sumiu para quem a desligou uma vez.

                O controle mora AQUI, e não em Ajustes, porque o lobby já é o dono das preferências
                de jogo, a ordem das cartas e os favoritos também são decididos e guardados nesta
                tela. E porque enterrá-lo em Ajustes → aba → seção repetiria o defeito original:
                um controle a três cliques do lugar onde ele faz efeito. */}
            <label className="flex items-center gap-2 text-[12px] text-ink-muted cursor-pointer select-none ml-auto">
              <input
                type="checkbox"
                checked={!pularSempre}
                onChange={e => mudarPularSempre(!e.target.checked)}
                className="w-6 h-6 accent-accent cursor-pointer"
              />
              {ageProfile === 'kids' ? 'Ver o que vem antes de jogar' : 'Mostrar a prévia antes de começar'}
            </label>

            {/* O PAGINADOR SÓ APARECE QUANDO HÁ SEGUNDA PÁGINA. Um "1 de 1" com duas setas mortas
                é ruído: promete navegação e não leva a lugar nenhum. */}
            {paginas > 1 && (
              <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <button
                  onClick={() => setPagina(p => Math.max(0, p - 1))}
                  disabled={paginaAtual === 0}
                  className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Página anterior de jogos"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="tabular-nums font-bold text-ink">{paginaAtual + 1}</span>
                <span aria-hidden>/</span>
                <span className="tabular-nums">{paginas}</span>
                <button
                  onClick={() => setPagina(p => Math.min(paginas - 1, p + 1))}
                  disabled={paginaAtual >= paginas - 1}
                  className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Próxima página de jogos"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map(j => {
              const liberado = j.estado.ok;
              /* C6 — A CARTA DEIXOU DE SER UM `<button>`.
                 Ela era um botão contendo quatro controles focáveis (o "?", as duas setas, o
                 alfinete). O comentário mais abaixo já registrava a intenção de evitar botão
                 dentro de botão usando `<span role="button">`, a intenção estava certa, o
                 mecanismo não: para a norma o que conta é DESCENDENTE FOCÁVEL, e `role="button"`
                 com `tabIndex={0}` é exatamente isso. O axe media 36 nós em `nested-interactive`.

                 O padrão aqui é o de carta com ação primária: o container não é interativo, o
                 TÍTULO é o botão de verdade e um pseudoelemento estende sua área de clique sobre
                 a carta inteira; os controles secundários sobem para `z-10` e continuam
                 alcançáveis. O comportamento visível não muda, clicar em qualquer lugar da carta
                 ainda começa a rodada, mas a árvore passa a ser válida e cada controle vira uma
                 parada de tabulação legítima. */
              return (
                <div
                  key={j.chave}
                  /* C9 — `opacity-60` saiu do estado bloqueado. Ela apagava o CARTÃO INTEIRO,
                     inclusive o texto que explica POR QUE está bloqueado, medido em 2,26:1 e
                     2,28:1, contra o mínimo de 4,5:1. Justo a frase que a pessoa precisa ler
                     ("falta 1 palavra") era a mais difícil de ler.

                     A WCAG 1.4.3 isenta componente inativo, então dava para declarar exceção.
                     Não é o caso: bloqueio aqui não é um controle desligado e mudo, é um
                     estado que CARREGA a informação de como sair dele. Apagar essa informação
                     é o oposto do que a tela precisa fazer.

                     O bloqueio continua evidente sem custar legibilidade: o cadeado no lugar do
                     ícone, a arte em `grayscale`, o fundo recuado e a frase do motivo. */
                  className={`card-panel text-left flex flex-col overflow-hidden transition-all relative group ${
                    liberado ? 'bg-surface hover:border-accent hover:-translate-y-1 hover:shadow-card' : 'bg-canvas border-dashed'
                  }`}
                >
                  {/* A MINIATURA mostra a MECÂNICA antes de a pessoa ler o título — é a diferença
                      entre "Frase embaralhada" (o quê?) e ver as peças caindo na linha.
                      Desenhada com tokens de tema, então repinta junto com o tema. */}
                  {/* Faixa 16:5 e não 16:7: a 132px de altura a arte ocupava mais espaço que o
                      texto da carta e levava a página a 1.800px de rolagem com nove jogos. Menor,
                      ela continua dizendo o que o jogo é e cabe mais jogo na tela. */}
                  {/* Dois detalhes que não são decorativos:
                      · `w-full`, a carta é um flex com `align-items: flex-start` (vem do
                        `.card-panel`), então a faixa não esticava sozinha: derivava a largura do
                        próprio SVG e deixava um vão preto de ~180px à direita, em TODA carta.
                      · `16/7` é exatamente a proporção do `viewBox` do desenho. Qualquer outra
                        faz o SVG encaixar por dentro e sobrar fundo nas laterais, o mesmo vão,
                        por outro caminho. O tamanho da arte é controlado pela largura máxima do
                        conteúdo, não por achatar a faixa. */}
                  <span className={`block w-full aspect-[16/7] bg-canvas border-b border-border-subtle overflow-hidden ${liberado ? '' : 'grayscale'}`} aria-hidden>
                    <span className="block w-full h-full transition-transform duration-300 group-hover:scale-[1.04]"><ArteDoJogo jogo={j.id} /></span>
                  </span>
                  {/* O SEU recorde na carta: motivo de voltar ("dá para bater?") sem abrir nada. */}
                  {liberado && (recordesMapa.get(j.id) ?? 0) > 0 && (
                    <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-ink/70 text-white text-[10.5px] font-black tabular-nums backdrop-blur-sm" aria-label={`Seu recorde: ${recordesMapa.get(j.id)} pontos`}>
                      <TrophyIcon className="w-3 h-3 text-warn" aria-hidden /> {recordesMapa.get(j.id)}
                    </span>
                  )}

                  <span className="w-full p-4 flex flex-col gap-2 flex-1">
                  <span className="flex items-center gap-2.5">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${liberado ? 'bg-accent-soft text-accent' : 'bg-canvas text-ink-faint'}`} aria-hidden>
                      {liberado ? j.icone : <Lock className="w-4 h-4" />}
                    </span>
                    {/* A AÇÃO PRIMÁRIA. `after:absolute after:inset-0` estende a área de clique
                        deste botão sobre a carta inteira, preservando o comportamento anterior
                        sem precisar de um botão envolvendo tudo. */}
                    <button
                      disabled={!liberado}
                      onClick={() => pedirParaJogar(j)}
                      // `min-h-6`: a área de clique REAL é a carta inteira (via `after:inset-0`),
                      // mas a caixa própria do botão media 17,5px — e é a caixa que a WCAG 2.5.8
                      // mede, não o pseudoelemento. Garantir os 24px no próprio elemento evita
                      // depender de uma expansão que a norma não enxerga.
                      className={`font-display font-extrabold text-[14px] text-ink leading-tight flex-1 text-left min-h-6 flex items-center after:absolute after:inset-0 after:content-[''] rounded-lg ${liberado ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      {j.titulo[ageProfile]}
                    </button>
                    {/* Instrução que não some é instrução que atrapalha: depois da primeira vez,
                        ela fica aqui, a um clique, em vez de voltar sozinha.
                        C5, `min-w-6 min-h-6` são os 24px de WCAG 2.2 AA 2.5.8; antes era `p-1.5`
                        sobre um ícone de 14px, o que dava 22px. */}
                    <button
                      onClick={() => setExplicando(j.id)}
                      className="relative z-10 min-w-6 min-h-6 inline-flex items-center justify-center rounded-lg text-ink-faint hover:text-accent hover:bg-surface-hover cursor-pointer shrink-0"
                      title="Como se joga"
                      aria-label={`Como se joga: ${j.titulo[ageProfile]}`}
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </span>

                  {/* ORGANIZAR A GRADE — alfinete e setas.
                      C6, agora são `<button>` de verdade. Eram `<span role="button">` porque a
                      carta inteira era um botão e botão dentro de botão é HTML inválido; com a
                      carta virando `<div>`, a razão do contorno deixou de existir e o elemento
                      certo voltou a ser possível. O `z-10` os mantém acima da área de clique
                      estendida do título, e é o que substitui o `stopPropagation` de antes.
                      Setas e não arrastar: arraste não existe em lugar nenhum deste projeto, quebra
                      no toque e não funciona por teclado sem trabalho extra. Seta funciona nos três
                      desde o primeiro dia. */}
                  <span className="relative z-10 flex items-center gap-1 pt-1">
                    {([
                      { icone: <ChevronLeft className="w-3.5 h-3.5" />, dir: -1 as const, rot: 'Mover para a esquerda' },
                      { icone: <ChevronRight className="w-3.5 h-3.5" />, dir: 1 as const, rot: 'Mover para a direita' },
                    ]).map(({ icone, dir, rot }) => (
                      <button
                        key={dir}
                        onClick={() => mexerNaOrdem(mover(ordem, idsVisiveis, j.id, dir))}
                        className="min-w-6 min-h-6 inline-flex items-center justify-center rounded-md text-ink-faint hover:text-accent hover:bg-surface-hover cursor-pointer"
                        title={rot}
                        aria-label={`${rot}: ${j.titulo[ageProfile]}`}
                      >
                        {icone}
                      </button>
                    ))}
                    {/* VER O QUE VEM — a volta para quem desligou a prévia, e SÓ para essa pessoa.
                        Com a prévia ligada ela já é o que o clique na carta abre, e um segundo
                        botão para a mesma tela vira ruído numa fileira que é de ORGANIZAR a grade
                        (mover, fixar), não de abrir telas. Some quando não tem o que resolver. */}
                    {pularSempre && (
                      <button
                        disabled={!liberado}
                        onClick={() => pedirParaJogar(j, true)}
                        className={`min-w-6 min-h-6 inline-flex items-center justify-center rounded-md hover:bg-surface-hover ${liberado ? 'text-ink-faint hover:text-accent cursor-pointer' : 'text-ink-faint/40 cursor-not-allowed'}`}
                        title="Ver o que vem nesta rodada, sem começar"
                        aria-label={`Ver o que vem: ${j.titulo[ageProfile]}`}
                      >
                        <ListChecks className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      aria-pressed={ordem.fixados.includes(j.id)}
                      onClick={() => mexerNaOrdem(alternarFixado(ordem, j.id))}
                      className={`min-w-6 min-h-6 inline-flex items-center justify-center rounded-md cursor-pointer hover:bg-surface-hover ${ordem.fixados.includes(j.id) ? 'text-accent' : 'text-ink-faint hover:text-accent'}`}
                      title={ordem.fixados.includes(j.id) ? 'Desafixar do topo' : 'Fixar no topo'}
                      aria-label={`${ordem.fixados.includes(j.id) ? 'Desafixar' : 'Fixar no topo'}: ${j.titulo[ageProfile]}`}
                    >
                      <Pin className={`w-3.5 h-3.5 ${ordem.fixados.includes(j.id) ? 'fill-current' : ''}`} />
                    </button>
                  </span>
                  <span className="text-[12px] text-ink-muted leading-snug">{j.descricao[ageProfile]}</span>
                  {/* Estado REAL, com número — nada de card habilitado que falha ao clicar.
                      DUAS CONTAS, e não uma. O gate mede o pool inteiro (`quantidade: 99`) mas a
                      rodada joga `maxItems`: dizer só "47 palavras prontas" fazia a carta prometer
                      uma partida de 47 e entregar 8, sem contar quais. Agora a primeira conta é a
                      da RODADA, que é o que vai acontecer ao clicar, e o pool vem em seguida. */}
                  <span className={`text-[11px] font-bold mt-auto pt-1 ${liberado ? 'text-good-ink' : 'text-ink-faint'}`}>
                    {(() => {
                      const unidade = j.estado.fonte === 'falas' ? ['fala', 'falas'] : ['palavra', 'palavras'];
                      if (liberado) {
                        const total = ('pool' in j.estado ? j.estado.pool : undefined) ?? j.estado.disponiveis;
                        /* O tamanho vem do ESTADO, não de um `min(total, maxItems)` refeito aqui.
                           A conta local mentia para o Termo, cuja escada consome 3 ou 7 e nunca 5. */
                        const naRodada = j.estado.tamanhoDaRodada;
                        return naRodada < total
                          ? `${naRodada} nesta rodada · ${total} disponíveis`
                          : `${naRodada} ${naRodada === 1 ? unidade[0] : unidade[1]} nesta rodada`;
                      }
                      /* O MOTIVO REAL, e não "faltam N falas". Na trilha esses jogos ficavam
                         bloqueados por um número que não explicava nada, a pessoa não tem como
                         adivinhar que a trilha não tem frase nem áudio. */
                      const motivo = 'motivo' in j.estado ? j.estado.motivo : undefined;
                      if (motivo === 'trilha-sem-frase') {
                        return ageProfile === 'kids'
                          ? 'a trilha tem palavras, não frases'
                          : 'a trilha tem palavras soltas, este jogo precisa de frase; escolha uma gravação';
                      }
                      if (motivo === 'sem-voz') return 'este navegador não tem voz sintetizada';
                      // Estado transitório e honesto: a gravação TEM som, ele está a caminho.
                      if (motivo === 'audio-carregando') return 'baixando o áudio da gravação…';
                      if (j.estado.fonte === 'falas' && j.estado.disponiveis === 0) return 'precisa de uma gravação com legenda';

                      /* A CONTA INTEIRA, e não só o que falta.
                         "faltam 2 palavras" não diz de quantas nem sobre o quê, e a pessoa não tem
                         como saber se 2 palavras é perto ou longe, nem em que idioma elas contam.
                         Com "precisa de 4 · você tem 2 do espanhol", a mesma linha responde as três
                         perguntas e o caminho de saída fica óbvio: gravar mais naquele idioma. */
                      const precisa = MINIGAMES[j.id].minItems;
                      const falta = `${j.estado.faltam === 1 ? 'falta' : 'faltam'} ${j.estado.faltam} ${j.estado.faltam === 1 ? unidade[0] : unidade[1]}`;
                      return ageProfile === 'kids'
                        ? `${falta} para abrir`
                        : `${falta} · precisa de ${precisa} · você tem ${j.estado.disponiveis} do ${langLabelPt(fonte.lang)}`;
                    })()}
                  </span>
                  {/* A PORTA DE SAÍDA — uma ação, a mais barata que resolve.
                      `z-10` porque o título estende a área de clique dele sobre a carta inteira
                      (`after:inset-0`); sem isso o clique aqui viraria "começar a rodada", que
                      está desabilitada, ou seja, um botão que não faz nada.
                      Quando `comoDesbloquear` devolve `null` (sem voz, áudio a caminho) NÃO
                      aparece botão: não existe ação, e inventar uma seria mentir. */}
                  {!liberado && (() => {
                    const porta = comoDesbloquear(j.estado, contextoDoDesbloqueio);
                    if (!porta) return null;
                    return (
                      <button
                        onClick={() => abrirPorta(porta)}
                        className="relative z-10 mt-1.5 self-start inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[11.5px] font-bold text-accent-ink hover:bg-accent hover:text-accent-contrast cursor-pointer"
                      >
                        {porta.rotulo} <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    );
                  })()}
                  {/* O RECORDE, quando existe. Vem da coluna `score`, que era gravada a cada rodada
                      desde a migração 0001 e nunca tinha sido lida de volta. Só aparece com jogo
                      liberado e recorde > 0: "recorde: 0" seria uma provocação sem sentido. */}
                  {liberado && (recordeDoJogo(j.id) ?? 0) > 0 && (
                    <span className="kpi-pill mt-1.5 self-start" title="Sua melhor sequência neste jogo, nesta fonte">
                      <Trophy className="w-3 h-3" aria-hidden /> recorde {recordeDoJogo(j.id)}
                    </span>
                  )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {erro && (
        <p className="mt-4 text-[12px] text-warn-ink">
          Não consegui carregar o seu baralho: {erro}
        </p>
      )}
      </div>

      {/* O progresso mora no CABEÇALHO (ver acima): uma linha, ao lado do título, onde o olho
          passa antes de jogar, e não empurra a primeira carta. Fora quando embutido: nível,
          streak e seeds são do PERFIL; a aba da sessão fala de UMA sessão. */}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={() => setImportando(true)}
          className="flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-accent cursor-pointer py-1"
        >
          <Package className="w-3.5 h-3.5" aria-hidden />
          {ageProfile === 'kids' ? 'Trazer palavras de fora' : 'Importar / exportar baralho (Anki)'}
        </button>
        {/* Dizia "Exercícios completos", prometendo os doze legados. Sobraram dois, e os dois são
            de MEMÓRIA (revisão espaçada e produção ativa), o resto virou jogo e mora aqui. O
            rótulo passa a dizer para onde leva de verdade. */}
        <button
          onClick={() => onChangeView('study')}
          className="text-[12px] text-ink-muted hover:text-accent underline cursor-pointer py-1"
        >
          {ageProfile === 'kids' ? 'Revisar minhas palavras' : 'Revisão espaçada e produção ativa'}
        </button>
      </div>
    </div>
  );
}
