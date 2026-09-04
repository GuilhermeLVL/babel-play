import React, { useCallback, useEffect, useMemo, useState, useRef, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Check, Timer, Mic, ChevronRight, ChevronLeft, Pin, ListChecks, Map as MapIcon, Sprout, Flame, GraduationCap, Lock, HelpCircle, Package, Trophy, SlidersHorizontal as SlidersIcon, Trophy as TrophyIcon, Layers, Globe, BookOpen, CalendarClock, Sparkles, Languages, MessageSquareText, Gamepad2, Dices, Search, X as XIcon, Compass, Zap, Play as PlayIcon, Headphones, Puzzle, BarChart2 } from 'lucide-react';
import KarutaGame from '../minigames/KarutaGame';
import KofferGame from '../minigames/KofferGame';
import ChoseongGame from '../minigames/ChoseongGame';
import TabooGame from '../minigames/TabooGame';
import ShiritoriGame from '../minigames/ShiritoriGame';
import CadavreExquisGame from '../minigames/CadavreExquisGame';
import BaoGame from '../minigames/BaoGame';
import TenseTennisGame from '../minigames/TenseTennisGame';
import VitendawiliGame from '../minigames/VitendawiliGame';
import { playJuicedHit, triggerHaptic, triggerConfetti } from '../../lib/gameFeel';
import { apiFetch, fetchDeck, reviewCard, salvarRodada, fetchSessions, fetchSessionTranscript, patchUiSettings, fetchSettings, bulkAddCards, fetchHistoricoDeItens, fetchExerciseResults, fetchRecordes, gastarSeeds, type AppMetrics, type HistoricoDeItem } from '../../data/api';
import { toSentences, type Sentence, type PracticeSeed } from '../../lib/sentences';
import type { VocabCard, Recording } from '../../types';
import { coreOnly, type AgeProfileType } from '../../lib/profile';
import type { DerivedProgress } from '../../lib/progress';
import {
  buildItems, gradeFor, MINIGAMES, rodadasDaEscada,
  buildScrambleRounds, cartoesDaFonte, priorizar, cartoesDaTrilha, chaveDaPalavra, rotuloDaFonte,
  fontesDisponiveis, idiomasDisponiveis, fonteDaEscolha, escolhaDaFonte, mesmaFonte,
  progressoDaTrilha,
  SESSAO_DA_TRILHA, CONFIANCA_CURADA,
  buildRodadasEscuta, buildRodadasDitado, buildRodadasConectores, isDueNow,
  estadoDeCadaJogo, comoDesbloquear, type ContextoDeDesbloqueio, type Desbloqueio,
  cartoesDoFiltro, frasesDoAcervo,
  agruparJogos,
  estimativaDeMinutos, rotuloDeDuracao, pistasDaTriagem, resumoDosPulados,
  previaSegura, repetidosDaUltima, MAPA_REVELA_ALVO, origemDoMaterial,
  pontuarRodada, xpFromRound, acumular, mesmaCorrente, marcarPromovidas, resumir, agruparFases,
  faixaAuto, diaLocal, estadoDoItem, ordenarPorMemoria, etapasDoNivel, progressoDasEtapas, etapaAtual,
  frasesDaTrilha, diagnosticoTermo, rngDe, chaveDaPalavra as chaveDaPalavraCore, REGRAS, niveisEmJogo,
  type EstadoDoItem,
  type RodadaEscuta, type RodadaDitado, type RodadaConectores,
  type MinigameId, type MinigameItem, type RoundReport, type RodadaTermo, type RodadaFrase,
  type FonteDeItens, type Triagem, type DadoTrilha, type CefrLevel,
  type ItemCru, type ItemDaAntessala, type EstadoSequencia, type ResumoDaSequencia,
  type EscolhaDaPratica, type OrigemDaPratica, type FonteId,
} from '@core';
import { baseLang, langLabelNaUI } from '../../lib/languages';
import { langConfigFrom } from '../../lib/langConfig';
import { temFonteGuardada } from '../../lib/fonteDaPratica';
import { contarPassada } from '../../lib/passadasDoPipeline';
import { faixaDe as faixaDaComposicao, type EstrategiaDaUI } from '../../core/minigames/composicao';
import { lerPrecisoes, registrarPrecisao, registrarVistas, vistasRecentes as vistasGuardadas } from '../../lib/memoriaLocal';
import SalaDeEscolha from '../minigames/SalaDeEscolha';
import SeletorDeConteudo from '../minigames/SeletorDeConteudo';
import CoberturaDosIdiomas from '../minigames/CoberturaDosIdiomas';
import { isTtsSupported, hasVoiceFor, vozesCarregadas, aoMudarVozes } from '../../lib/tts';
import { useAudioDaSessao } from '../../lib/audioDaSessao';
import CuradoriaBaralho from './CuradoriaBaralho';
import MapaDoConteudo from './MapaDoConteudo';
import ArteDoJogo, { tomDoJogo, FAMILIAS } from '../minigames/ArteDosJogos';
import Recordes from './play/Recordes';
import { JOGOS, tituloDoJogo, descricaoDoJogo, type JogoUI } from './play/jogos';
import { numero, t, tp } from '../../lib/i18n';
import { T } from '../../lib/T';
import PainelTrilha from './PainelTrilha';
import BaralhoAnki from './BaralhoAnki';
import BaralhosAnki from './BaralhosAnki';
import { listarBaralhosAnki } from '../../data/apiAnki';
import { indiceDaTrilha, carregarTrilha, trilhaEmCache, precarregarNiveis } from '../../data/trilha/carregar';
import { escalaDe } from '../../core/learning/cefrWordlist';
import { rotuloDaEtapa } from '../../core/learning/trilha';
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
  filtroParaComposicao,
  type FaixaDificuldade,
  type Composicao, type CartaoParaCompor,
} from '../../core/minigames/composicao';
import { filtroDaFonte, fonteDominante, passaNoFiltro, type FiltroDaPratica } from '../../core/minigames/filtro';
import { lerFiltroGuardado, gravarFiltro, filtroDaQuery, queryDoFiltro } from '../../lib/filtroDaPratica';
import { lerUrlAtual, publicarQueryDoJogar, consumirQueryDoBoot } from '../../lib/rotas';
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
 * Quantos cartões o servidor PRIORIZA por rodada.
 *
 * Não é o tamanho do pool — o pool é o acervo inteiro (`recortarPelaComposicao` completa por trás).
 * Este número é só até onde vale a pena o servidor ordenar por vencimento e estratégia; o resto
 * entra na ordem da triagem. Cortar o pool aqui foi o que fez a Memória ver 5 palavras de 323.
 */
/**
 * A CHAVE DA MEMÓRIA CURTA (vistas recentes, persistidas por origem no localStorage).
 *
 * Uma função só, usada na LEITURA e na GRAVAÇÃO — este cálculo existia copiado em três pontos do
 * arquivo, e foi assim que o baralho Anki ficou de fora de um deles (auditoria S6): rodada com o
 * recorte ligado gravava as vistas em 'baralho' e a troca de baralho não zerava nada.
 *
 * O baralho entra na chave pela mesma razão que a sessão e o nível entram: trocar de baralho é
 * começar outro assunto. NOTA: isto é memória LOCAL; a `origem` persistida em `exercise_results`
 * continua 'baralho' — separar o histórico por baralho é decisão do modelo facetado, não daqui.
 */
function chaveDaMemoriaCurta(fonte: FonteDeItens, baralhoAnki: { id: string } | null): string {
  if (fonte.id === 'sessao') return `sessao:${fonte.sessionId ?? ''}`;
  if (fonte.id === 'trilha') return `trilha:${fonte.nivel ?? ''}`;
  if (fonte.id === 'dificeis') return 'dificeis';
  return baralhoAnki ? `baralho:anki:${baralhoAnki.id}` : 'baralho';
}

const LIMITE_DA_COMPOSICAO = 200;

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

export type JogoAtivo = 'karuta' | 'koffer' | 'choseong' | 'taboo' | 'shiritori' | 'cadavre' | 'bao' | 'tennis' | 'vitendawili' | null;

export interface JogoCulturalMeta {
  id: NonNullable<JogoAtivo>;
  nome: string;
  origemCultural: string;
  bandeira: string;
  descricao: string;
  habilidade: 'vocab' | 'escuta_fala' | 'frase_gramatica';
  habilidadeLabel: string;
  nivelCefr: string;
  tom: string;
}

export const JOGOS_CULTURAIS: readonly JogoCulturalMeta[] = [
  {
    id: 'karuta',
    nome: 'Karuta Reflexes',
    origemCultural: 'Japão',
    bandeira: '🇯🇵',
    descricao: 'Reaja instantaneamente e bata na carta certa ao ouvir a pista, no tradicional jogo japonês.',
    habilidade: 'vocab',
    habilidadeLabel: 'Vocabulário & Escuta',
    nivelCefr: 'B1 - B2',
    tom: '#e11d48',
  },
  {
    id: 'shiritori',
    nome: 'Shiritori Express',
    origemCultural: 'Japão',
    bandeira: '🇯🇵',
    descricao: 'Encadeie o vocabulário em tempo recorde ligando a última letra da palavra anterior.',
    habilidade: 'vocab',
    habilidadeLabel: 'Vocabulário & Conexões',
    nivelCefr: 'A2 - B1',
    tom: '#0284c7',
  },
  {
    id: 'bao',
    nome: 'Bao Mancala',
    origemCultural: 'África Oriental (Swahili)',
    bandeira: '🇹🇿',
    descricao: 'Semeie sementes de palavras nas covas certas e capture pontos ao traduzir os itens.',
    habilidade: 'vocab',
    habilidadeLabel: 'Ritmo & Vocabulário',
    nivelCefr: 'A1 - B2',
    tom: '#d97706',
  },
  {
    id: 'cadavre',
    nome: 'Cadavre Exquis',
    origemCultural: 'França (Surrealismo)',
    bandeira: '🇫🇷',
    descricao: 'Crie frases criativas e gramaticalmente perfeitas unindo sujeito, verbo e complementos.',
    habilidade: 'frase_gramatica',
    habilidadeLabel: 'Sintaxe & Criatividade',
    nivelCefr: 'B1 - C1',
    tom: '#7c3aed',
  },
  {
    id: 'taboo',
    nome: 'Taboo Arena',
    origemCultural: 'Mundial',
    bandeira: '🌍',
    descricao: 'Adivinhe a palavra secreta usando pistas inteligentes sem pronunciar os termos proibidos.',
    habilidade: 'escuta_fala',
    habilidadeLabel: 'Produção Ativa & Fluência',
    nivelCefr: 'B2 - C2',
    tom: '#db2777',
  },
  {
    id: 'vitendawili',
    nome: 'Vitendawili Enigmas',
    origemCultural: 'África Oriental',
    bandeira: '🇰🇪',
    descricao: 'Decifre charadas e metáforas ancestrais da tradição oral em desafios lógicos dinâmicos.',
    habilidade: 'escuta_fala',
    habilidadeLabel: 'Dedução & Expressões',
    nivelCefr: 'A2 - B2',
    tom: '#059669',
  },
  {
    id: 'tennis',
    nome: 'Tense Tennis',
    origemCultural: 'Reino Unido / LatAm',
    bandeira: '🎾',
    descricao: 'Rebata saques velozes conjugando verbos no tempo gramatical correto com reflexos afiados.',
    habilidade: 'frase_gramatica',
    habilidadeLabel: 'Gramática & Conjugação',
    nivelCefr: 'A2 - B2',
    tom: '#2563eb',
  },
  {
    id: 'koffer',
    nome: 'Koffer Packen',
    origemCultural: 'Alemanha',
    bandeira: '🇩🇪',
    descricao: '"Ich packe meinen Koffer...": retenha a bagagem inteira na memória de trabalho e adicione itens.',
    habilidade: 'vocab',
    habilidadeLabel: 'Memória Operacional & Acúmulo',
    nivelCefr: 'A1 - B1',
    tom: '#ea580c',
  },
  {
    id: 'choseong',
    nome: 'Choseong Quiz',
    origemCultural: 'Coreia do Sul',
    bandeira: '🇰🇷',
    descricao: 'Decodifique o enigma linguístico descobrindo a palavra oculta a partir de suas consoantes iniciais.',
    habilidade: 'vocab',
    habilidadeLabel: 'Ortografia & Fonética',
    nivelCefr: 'A2 - B2',
    tom: '#4f46e5',
  },
];

const habilidadeDoJogoClassico = (id: MinigameId): 'vocab' | 'escuta_fala' | 'frase_gramatica' => {
  if (id === 'memory' || id === 'wordsearch' || id === 'termo') return 'vocab';
  if (id === 'escuta' || id === 'ditado' || id === 'karaoke') return 'escuta_fala';
  return 'frase_gramatica'; // scramble, blitz, conectores
};

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
/**
 * PULAR A PRÉVIA É O PADRÃO — quem quiser vê-la marca o checkbox no lobby.
 *
 * A prévia vinha ligada, e voltava a cada rodada: mais uma tela cheia entre querer jogar e jogar,
 * com quatro contadores dos quais três costumam ser "0". Ela continua inteira e a um clique — o
 * checkbox "Mostrar a prévia antes de começar" fica ao lado do título da grade, e o botão de
 * espiar aparece em cada carta justamente quando a prévia está desligada.
 *
 * `'0'` explícito é o que distingue "escolheu ver" de "nunca mexeu": só quem desmarcou volta a
 * ver a prévia, e quem chega hoje entra na partida no primeiro clique.
 */
const pularAntessala = (): boolean => {
  try { return localStorage.getItem(CHAVE_PULAR) !== '0'; } catch { return true; }
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
  
  useEffect(() => { setOrdem(lerOrdem()); }, []);
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
  const fonte = useMemo<FonteDeItens>(
    () => ({ ...fonteDominante(filtro), lang: filtro.idiomas[0] ?? '' }),
    [filtro],
  );
  const setFonte = useCallback((upd: FonteDeItens | ((f: FonteDeItens) => FonteDeItens)) => {
    setFiltro(prev => {
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
  const rankingDeDificeis = useMemo(
    () => (metrics?.palavrasDificeis ?? []).map((p) => p.cardId),
    [metrics],
  );

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
  const [jogoCulturalAtivo, setJogoCulturalAtivo] = useState<JogoAtivo>(null);
  const [categoriaAtiva, setCategoriaAtiva] = useState<'todos' | 'classicos' | 'culturais' | 'favoritos'>('todos');
  const [buscaJogos, setBuscaJogos] = useState('');
  const [filtroHabilidade, setFiltroHabilidade] = useState<'todas' | 'vocab' | 'escuta_fala' | 'frase_gramatica'>('todas');
  const [vendoBaralhos, setVendoBaralhos] = useState(false);
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
  const temBaralhosAnki = decksAnki.length > 0;
  const recarregarBaralhosAnki = useCallback(async () => {
    try {
      const lista = await listarBaralhosAnki();
      setDecksAnki(lista.map((d) => ({ id: d.id, nome: d.nome, lang: d.idiomaOrigem ?? null })));
      // Baralho escolhido que sumiu (purgado noutra aba) não pode continuar recortando a rodada.
      setFiltro((prev) => {
        const vivos = prev.baralhos.filter((id) => lista.some((d) => d.id === id));
        return vivos.length === prev.baralhos.length ? prev : { ...prev, baralhos: vivos };
      });
    } catch { /* sem baralhos: a porta só não aparece */ } finally { setDecksCarregados(true); }
  }, []);
  useEffect(() => { void recarregarBaralhosAnki(); }, [recarregarBaralhosAnki]);
  /** Derivado do filtro — o "chip" é só a cara do primeiro baralho do recorte. */
  const baralhoAnki = useMemo<{ id: string; nome: string } | null>(() => {
    const id = filtro.baralhos[0];
    if (!id) return null;
    return { id, nome: decksAnki.find((d) => d.id === id)?.nome ?? 'Baralho' };
  }, [filtro.baralhos, decksAnki]);
  const setBaralhoAnki = useCallback((v: { id: string; nome: string } | null) => {
    setFiltro((prev) => v
      ? { ...prev, fontes: prev.fontes.includes('baralho') ? prev.fontes : [...prev.fontes, 'baralho'], baralhos: [v.id] }
      : { ...prev, baralhos: [] });
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
  /* v3 — RODADA EM CURSO marca o body (`data-jogo-ativo`): o modal de recompensa (App) espera
     `babel:rodada-fechou` em vez de cobrir a partida. Fechar a rodada dispara o evento. */
  const emRodada = !resultado && !!(rodada || rodadaTermo || rodadaFrase || rodadaKaraoke || rodadaEscuta || rodadaDitado || rodadaConectores);
  useEffect(() => {
    if (emRodada) document.body.setAttribute('data-jogo-ativo', '1');
    else {
      const estava = document.body.hasAttribute('data-jogo-ativo');
      document.body.removeAttribute('data-jogo-ativo');
      if (estava) window.dispatchEvent(new Event('babel:rodada-fechou'));
    }
    return () => { document.body.removeAttribute('data-jogo-ativo'); };
  }, [emRodada]);
  /* Z1 — FILTRO DE DIFICULDADE. Vale para os 4 jogos de modalidade `palavra`; os 5 de frase
     jogam sobre falas, que não têm dificuldade por palavra (ver `composicao.ts`). */
  const [faixas, setFaixas] = useState<FaixaDificuldade[]>([]);
  /* SELEÇÃO v2: 'auto' é o padrão — a faixa vem da precisão recente do jogo (`faixaAuto`), com
     o motivo dito na antessala. Escolher um chip de nível tira do automático. */
  const [estrategia, setEstrategia] = useState<EstrategiaDaUI>('auto');
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
    const agora = Date.now();
    /* SELEÇÃO v2 — os insumos da régua: a memória de itens (histórico por `item_ref`, em todos os
       jogos) e a SEMENTE do dia (rotação própria por jogo dentro do mesmo acervo). */
    const sementeDoDia = String(diaLocal(agora));
    const memoria = historico;
    /* A trilha recorta pela ETAPA atual (+ o que está voltando por erro ou vencido): estudar a
       etapa 7 não deveria sortear o nível A2 inteiro. Sem material suficiente, alarga. */
    let base = jogaveis;
    if (!apenas?.size && fonte.id === 'trilha' && etapaDaTrilha) {
      const daEtapa = new Set(etapaDaTrilha.palavras.map((p) => chaveDaPalavraCore(p)));
      const recorte = jogaveis.filter((c) => {
        if (daEtapa.has(chaveDaPalavraCore(c.word))) return true;
        const e = estadoDoItem(memoria.get(c.word));
        return e.tag === 'errando' || isDueNow(c, 'fsrs', agora);
      });
      if (recorte.length >= MINIGAMES[jogo].minItems) base = recorte;
    }
    /* Modo AUTO: a faixa decidida pela precisão recente filtra aqui (o pedido ao servidor não muda
       por jogo). Sem material na faixa, alarga para o acervo inteiro em vez de recusar a rodada. */
    if (!apenas?.size && estrategia === 'auto' && aceitaFiltroDeDificuldade(jogo)) {
      const { faixa } = decisaoAuto(jogo);
      const naFaixa = base.filter((c) => {
        const f = faixaDaComposicao((c as { difficultyScore?: number | null }).difficultyScore ?? null, composicao?.cortes);
        return f == null || f === faixa;
      });
      if (naFaixa.length >= MINIGAMES[jogo].minItems) base = naFaixa;
    }
    /**
     * O QUE JÁ CAIU NESTA CORRENTE SAI DO MATERIAL — regra DURA, e ela some do resto do arquivo.
     *
     * Há dois conjuntos de "já vi" e eles nunca tiveram o mesmo peso, mas eram fundidos num só
     * `evitar` logo abaixo:
     *
     *   · `vistasRecentes` — memória curta persistida (teto 200, por origem). É PREFERÊNCIA: melhor
     *     não repetir, mas repetir é aceitável, porque a alternativa é ficar sem jogo depois de uma
     *     maratona. Todos os construtores a tratam como demoção, com fallback — e está certo.
     *   · `vistosNaSequencia` — o que caiu NESTA corrente. É CONTRATO: o botão que trouxe a pessoa
     *     até aqui diz "palavras novas".
     *
     * Fundidos, o segundo herdava o fallback do primeiro. MEDIDO no banco real (`trilha:A1`): duas
     * correntes emendadas devolveram 5 das 7 mesmas palavras; simulando com o dado da trilha, da
     * terceira rodada em diante era 7/7 — para sempre. A piscina é pequena porque a trilha recorta
     * pela ETAPA atual e o Termo ainda reduz ao maior grupo de mesmo comprimento: na etapa 1 do A1
     * são nove palavras de cinco letras, e a escada come sete.
     *
     * Cortando aqui, ANTES dos oito ramos, a regra vale para os nove jogos de uma vez — inclusive
     * para o ramo de palavra falada da trilha (Ditado/Qual foi?/Karaokê), que é `slice(0, maxItems)`
     * puro e nunca recebeu `evitar` nenhum: lá "mais uma" repetia a rodada inteira desde sempre.
     *
     * E quando não sobra material, cada ramo já devolve `null` — que é o caminho honesto que
     * existia e era inalcançável: `semMaterial` fica verdadeiro e a raspadinha esconde o "mais uma"
     * em vez de entregar a rodada anterior de novo.
     *
     * `apenas` (repetir estas) ignora a regra de propósito: ali repetir é o pedido.
     */
    const naoRepetir = apenas?.size ? null : evitarTambem;
    const semRepetidas = <T,>(lista: T[], refDe: (x: T) => string) =>
      naoRepetir?.size ? lista.filter(x => !naoRepetir.has((refDe(x) ?? '').trim())) : lista;

    const cartas = semRepetidas(apenas?.size ? jogaveis.filter(c => apenas.has(c.word)) : base, c => c.word);
    /* Frases: na trilha vêm das 2.552 frases Tatoeba (`frasesDaTrilha`), que antes eram código
       morto e deixavam a Frase embaralhada bloqueada com "trilha sem frase". */
    /* As frases do acervo só entram quando NÃO há fala gravada: numa rodada de escuta, misturar
       voz sintetizada com áudio real entrega a resposta pelo timbre. */
    /* A fala gravada TAMBÉM passa pelo filtro de idioma: sem isto, uma gravação em inglês
       aparecia numa rodada de árabe — a rodada dizia um idioma e jogava outro (G0, defeito 3). */
    const doIdioma = (f: { lang?: string }) => !fonte.lang || !f.lang || baseLang(f.lang) === baseLang(fonte.lang);
    const gravadas = frases.filter(doIdioma);
    const falasGravadas = comTrilha ? [...frasesTrilha, ...gravadas] : gravadas;
    const falasBrutas = falasGravadas.length ? falasGravadas : frasesDoAcervoAtual;
    const falas = semRepetidas(apenas?.size ? falasBrutas.filter(f => apenas.has(f.id)) : falasBrutas, f => f.id);
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
    /* Jogo de FRASE vive de gravação, e a prévia diz isso mesmo quando a aba é outra —
       `origemDoMaterial` (revelavel.ts) carrega a regra e o porquê (auditoria S4). */
    const pronta = (crus: ItemCru[], aplicar: () => void): RodadaPronta => ({
      jogo,
      previa: previaSegura(jogo, crus.map(c => ({
        ...c,
        origem: origemDoMaterial(jogo, fonte.id, c.origem),
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
      /* SELEÇÃO v2: os cinco jogos de frase passam pela MESMA régua de memória das palavras
         (errando → novas → aprendendo → firmes; leeches fora; semente própria por jogo). Antes só
         demoviam o que tinha acabado de cair, e isso morria no F5. */
      const { ordenados } = ordenarPorMemoria(falas, f => f.id, {
        memoria, semente: `${jogo}:${sementeDoDia}`, agora, diaDe: diaLocal, cotaDeNovas: 0.3,
      });
      if (!evitar?.size) return ordenados;
      const frescas: typeof falas = [];
      const vistas: typeof falas = [];
      for (const f of ordenados) (evitar.has(f.id) ? vistas : frescas).push(f);
      return [...frescas, ...vistas];
    })();

    if (jogo === 'termo') {
      /* A escada gasta 1+2+4 = 7 palavras, e todas precisam ter o MESMO comprimento: o palpite é
         um só para todos os tabuleiros de um degrau.

         O tamanho da rodada é decidido por `rodadasDaEscada`, no core, e não aqui. O comentário
         que existia neste lugar afirmava que "com menos de 7, `planoDaEscada` encurta a escada em
         vez de recusar o jogo", era falso, e foi essa premissa que deixou o Termo inacessível:
         com `mesmoTamanho`, pedir 7 e ter 5 devolvia lista VAZIA, nunca uma escada curta. */
      /* A FAIXA CHEGA AO TERMO. Ela já recortava o material da rodada, mas o Termo montava a
         escada com régua própria: 4–8 letras e 1→2→4 tabuleiros para todo mundo. O resultado na
         tela era um quarteto — quatro grades lado a lado, nove linhas cada — para quem estava
         começando. Agora as letras e o teto da escada seguem a mesma faixa do resto.
         A escolha explícita nos chips vence; sem ela, a decisão automática pela precisão recente. */
      /* REFAZER NÃO É ESCOLHER DIFICULDADE. Com `apenas`, as palavras JÁ foram escolhidas numa
         rodada que aconteceu, e reaplicar a régua de letras de hoje sobre elas tornava fases
         inteiras impossíveis de refazer — o clique morria em silêncio. Ver `ReguaDeLetras`. */
      const faixaDoTermo = apenas?.size
        ? 'livre' as const
        : faixas.length === 1 ? faixas[0] : faixas.length ? undefined : decisaoAuto('termo').faixa;
      const r = rodadasDaEscada(cartas, { evitar, memoria, semente: sementeDoDia, diaDe: diaLocal, faixa: faixaDoTermo });
      if (!r.length) return null;
      return pronta(
        r.map(x => ({ ref: x.palavra, alvo: x.palavra, pista: x.pista, ...nivelDe(x.palavra) })),
        () => setRodadaTermo(r),
      );
    }
    if (jogo === 'scramble') {
      // `rand` com semente: a Frase embaralhada não embaralhava a ORDEM das falas (mesma rodada
      // para sempre); a ordem já vem da memória, e o embaralhar das peças fica determinístico no dia.
      const r = buildScrambleRounds(falasNaOrdem, { quantidade: MINIGAMES.scramble.maxItems, rand: rngDe(`scramble:${sementeDoDia}:${falasNaOrdem.length}`) });
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
    const itens = priorizar(buildItems(jogo, cartas, { evitar, memoria, semente: sementeDoDia, diaDe: diaLocal, excluirEvitadas: true, now: agora }), trecho, x => x.answer);
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
  const CUSTO_PULAR = 40; // economia v2: subiu com a Loja (≈ metade de um dia ativo)
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
    /* SELEÇÃO v2: a memória curta agora PERSISTE por origem (sobrevive ao F5, teto 200), e a
       precisão desta rodada alimenta o modo Auto deste jogo. */
    {
      const origemDaRodada = chaveDaMemoriaCurta(fonte, baralhoAnki);
      const refs = report.items.map(o => o.itemRef).filter((r): r is string => !!r);
      registrarVistas(origemDaRodada, refs);
      setVistasRecentes(vistasGuardadas(origemDaRodada));
      const total = report.items.length;
      const certos = report.items.filter(o => o.correct && !o.revealed).length;
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
    const origem = fonte.id === 'sessao' ? `sessao:${fonte.sessionId ?? ''}`
      : fonte.id === 'trilha' ? `trilha:${fonte.nivel ?? ''}`
      : fonte.id === 'dificeis' ? 'dificeis'
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
    /* ECONOMIA v2: a rodada gravada muda Seeds/XP (acertos, rodada perfeita) e pode fechar uma
       conquista. O App recarrega as métricas ao ouvir isto — antes só recarregava quando a lista
       de sessões mudava, e o saldo ficava uma rodada atrás. */
    if (gravacao.ok) window.dispatchEvent(new CustomEvent('babel:metricas-mudaram'));

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
      /* F26: `fonte.nivel` só é CEFR quando a trilha do idioma foi medida por linguista. Numa
         trilha por frequência os mesmos seis rótulos são faixas de corpus, e gravá-los como CEFR
         curado com confiança 1 plantaria um dado falso no banco. */
      const curado = escalaDe(fonte.lang) === 'cefr';
      const novos = errados
        .map(o => porPalavra.get((o.itemRef ?? '').toLowerCase()))
        .filter((c): c is VocabCard => !!c && !c.id)
        // Sem glosa do par não há pista: o cartão jogaria, mas nasceria mudo no baralho.
        .filter(c => !!c.translation?.trim())
        .map(c => ({
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
    // setFonte é useCallback estável; entra na lista só para o linter dizer a verdade.
  }, [setFonte]);

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
      sessoes.map(s => s.id),
      decksAnki.map(d => d.id),
    );
    const guardado = daUrl ?? lerFiltroGuardado(sessoes.map(s => s.id), decksAnki.map(d => d.id));
    /* RESTAURAR O MESMO FILTRO NÃO É MUDAR DE FILTRO: devolver `prev` aborta a atualização e poupa
       uma passada inteira do pipeline (triagem, composição, gate) — a mesma economia que a
       restauração de fonte já tinha, mantida aqui. O idioma NÃO vem do guardado: chega pelo
       carregador de settings (preferência de perfil, atravessa dispositivos) e o merge preserva o
       que já estiver no estado. */
    setFiltro(prev => {
      // Idioma explícito na URL também vence; o guardado local nunca vence o de settings (perfil).
      const idiomas = daUrl?.idiomas.length ? daUrl.idiomas
        : prev.idiomas.length ? prev.idiomas : guardado.idiomas;
      const restaurado = { ...guardado, idiomas };
      return JSON.stringify(restaurado) === JSON.stringify(prev) ? prev : restaurado;
    });
  }, [embutido, sessoes, sessoesCarregadas, decksCarregados, decksAnki]);

  /* FONTE 'dificeis' SEM MATERIAL degrada para o baralho — o ranking guardado ontem pode ter
     esvaziado hoje (revisar bem TIRA palavra do ranking, que é o objetivo). Só age com as
     métricas carregadas: antes disso, ranking vazio significa "ainda não sei". */
  useEffect(() => {
    if (!metrics || fonte.id !== 'dificeis' || rankingDeDificeis.length >= 4) return;
    setFonte(f => ({ id: 'baralho', lang: f.lang }));
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
        setSessoes(lista.map(x => ({ id: x.id, title: x.title, audioUrl: x.audioUrl ?? undefined })));
        setSessoesCarregadas(true);

        /* A gravação de onde se veio vence o palpite do código — e o palpite continua sendo dito
           na tela, nunca silencioso. O ramo de "escolha manual" saiu junto com a lista de
           gravações inalcançável: quem escolhe a gravação hoje é a Sala, por `fonte.sessionId`. */
        const escolhida = recording?.id ? lista.find(x => x.id === recording.id) : undefined;
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
      } catch {
        /* Sem sessão os jogos de frase ficam bloqueados com o motivo. E a busca terminou:
           quem espera por ela (a restauração da fonte) não pode ficar esperando para sempre. */
        if (!cancelado) setSessoesCarregadas(true);
      }
    })();
    return () => { cancelado = true; };
    /* `recording?.title` é lido por REF de propósito, e não como dependência: ele só serve de
       fallback para quando a sessão não aparece na lista, e colocá-lo aqui faria uma simples
       RENOMEAÇÃO refazer a busca do transcrito na rede. A atualização do rótulo é o efeito abaixo. */
  }, [recording?.id, recording?.audioUrl]);

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
  }, [recording?.id, setFonte]);

  /** A `origem` como ela é gravada em `exercise_results` — precisa casar com o que o fim de
   *  rodada escreve, senão o histórico da fonte errada apareceria na antessala. */
  const origemAtual = fonte.id === 'sessao' ? `sessao:${fonte.sessionId ?? ''}`
    : fonte.id === 'trilha' ? `trilha:${fonte.nivel ?? ''}`
    : fonte.id === 'dificeis' ? 'dificeis'
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
      setLinhasDaFonte(linhas);

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
    /* Trocar de BARALHO também é trocar de assunto (auditoria S6): sem o `baralhoAnki` na chave e
       na dependência, a troca não zerava as vistas nem a corrente — o placar de um baralho
       continuava numa rodada do outro. */
    const origemDaFonte = chaveDaMemoriaCurta(fonte, baralhoAnki);
    setVistasRecentes(vistasGuardadas(origemDaFonte));
    setSequencia(null);
  }, [fonte, baralhoAnki]);

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
  const triagem: Triagem = useMemo(
    () => {
      /* Instrumento, não lógica — ver `lib/passadasDoPipeline`. Desligado, custa uma leitura de
         propriedade; ligado, é o que prova quantas vezes o baralho inteiro é triado por carga. */
      contarPassada('triagem', { cartoes: (deck ?? []).length, fonte: fonte.id, lang: fonte.lang });
      // Fonte única mantém a partição exclusiva de sempre (byte a byte). Com mais de uma, quem
      // parte o acervo é o predicado, que sabe somar.
      return filtro.fontes.length > 1
        ? cartoesDoFiltro(deck ?? [], filtro, { rankingDificeis: conjuntoDeDificeis, agora: Date.now() })
        : cartoesDaFonte(deck ?? [], fonteComRanking);
    },
    [deck, fonteComRanking, fonte.id, fonte.lang, filtro, conjuntoDeDificeis],
  );

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
      /* A fonte legada CONTINUA no pedido — é a proveniência e o caminho dos servidores antigos —
         mas quem FILTRA agora é o `filtro` facetado abaixo: um objeto só, o mesmo dos dois lados
         (a paridade SQL × predicado é travada por teste de integração). */
      fonte: { id: fonte.id === 'sessao' ? 'sessao' : fonte.id === 'trilha' ? 'trilha' : 'baralho',
               ref: fonte.id === 'sessao' ? fonte.sessionId
                 : fonte.id === 'trilha' ? baseLang(fonte.lang)
                 : baralhoAnki ? `anki:${baralhoAnki.id}` : null,
               lang: baseLang(fonte.lang) },
      filtro: filtroParaComposicao(filtro, filtro.recorte.dificeis ? rankingDeDificeis : undefined),
      dificuldade: faixas.length ? faixas : undefined,
      // 'auto' é decisão do cliente (por jogo); ao servidor vai o equilibrado.
      estrategia: estrategia === 'auto' ? 'equilibrado' : estrategia,
      limite: LIMITE_DA_COMPOSICAO,
    }, paraCompor, buscarComposicaoPeloFunil).then((c) => { if (vivo) setComposicao(c); });
    return () => { vivo = false; };
  }, [deck, fonte, filtro, faixas, estrategia, baralhoAnki, rankingDeDificeis]);

  /* A trilha carrega sob demanda, já unida às glosas do par praticado→nativo. O ÍNDICE responde
     pelas contagens (existe? quantas?) sem baixar nada — é ele que impede a aba de sumir e o
     número de piscar zero enquanto o dado vem. */
  const entradaDaTrilha = useMemo(() => indiceDaTrilha()[baseLang(fonte.lang)] ?? null, [fonte.lang]);
  const [trilha, setTrilha] = useState<DadoTrilha | null>(() => trilhaEmCache(fonte.lang, idiomaNativo));
  const [carregandoTrilha, setCarregandoTrilha] = useState(false);
  useEffect(() => {
    if (!entradaDaTrilha) { setTrilha(null); return; }
    void precarregarNiveis(fonte.lang);
    const emCache = trilhaEmCache(fonte.lang, idiomaNativo);
    if (emCache) { setTrilha(emCache); return; }
    let vivo = true;
    setCarregandoTrilha(true);
    carregarTrilha(fonte.lang, idiomaNativo)
      .then(d => { if (vivo) setTrilha(d); })
      .finally(() => { if (vivo) setCarregandoTrilha(false); });
    return () => { vivo = false; };
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
    () => (trilha ? niveisDaRodada.flatMap(n => frasesDaTrilha(trilha, n) as unknown as Sentence[]) : []),
    [niveisDaRodada, trilha],
  );

  /* A ETAPA ATUAL da trilha: primeira não feita (≥80% das palavras já no caderno). Recorta a
     rodada em `montarRodada`; `acertos` vem do histórico (a coluna "acertou" nunca era passada). */
  const etapaDaTrilha = useMemo(() => {
    if (fonte.id !== 'trilha' || !trilha || !fonte.nivel) return null;
    const etapas = etapasDoNivel(trilha, fonte.nivel);
    const jaTem = new Set((deck ?? []).filter(c => c.daTrilha).map(c => chaveDaPalavraCore(c.word)));
    const acertos = new Set([...historico.values()].filter(h => h.ultimoAcerto).map(h => chaveDaPalavraCore(h.itemRef)));
    return etapaAtual(progressoDasEtapas(etapas, jaTem, acertos));
  }, [fonte.id, fonte.nivel, trilha, deck, historico]);

  /** Decisão do modo Auto para um jogo: precisões recentes (localStorage) → faixa + motivo. */
  const decisaoAuto = (jogo: MinigameId) => faixaAuto({ ultimasPrecisoes: lerPrecisoes(jogo), faixaAtual: faixaAutoAtualRef.current[jogo] ?? null });
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
        .filter(c => c.sourceSessionId && baseLang(c.srcLang ?? '') === base)
        .map(c => c.sourceSessionId as string),
    );
    return sessoes.filter(s => comMaterial.has(s.id));
  }, [sessoes, deck, fonte.lang]);

  const fontesOferecidas = useMemo(
    () => fontesDisponiveis({
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
  const totalDaTrilhaAtual = useMemo(
    () => {
      if (!entradaDaTrilha) return 0;
      const niveis = fonte.nivel ? [fonte.nivel] : Object.keys(entradaDaTrilha.porNivel);
      return niveis.reduce((n, nv) => n + (entradaDaTrilha.porNivel[nv] ?? 0), 0);
    },
    [entradaDaTrilha, fonte.nivel],
  );

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
  const prefetchTrilha = React.useCallback((lang: string) => {
    void precarregarNiveis(lang);
    void carregarTrilha(lang, idiomaNativo);
  }, [idiomaNativo]);

  const trilhaDe = React.useCallback((lang: string) => {
    const e = indiceDaTrilha()[baseLang(lang)];
    const vazia = { niveis: [] as CefrLevel[], total: 0, porNivel: {} as Partial<Record<CefrLevel, number>>, escala: null };
    if (!e) return vazia;
    const niveis = (Object.keys(e.porNivel) as CefrLevel[]).filter(n => (e.porNivel[n] ?? 0) > 0);
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
      const doBanco = new Map(triagem.usaveis.map(c => [chaveDaPalavra(c.word), c]));
      /* `niveisDaRodada` é o nível escolhido, ou TODOS quando não há escolha — ver `niveisEmJogo`.
         O cartão do BANCO vence o embutido: quem já fichou a palavra carrega o histórico dela. */
      const embutidos = niveisDaRodada
        .flatMap(n => cartoesDaTrilha(trilha, n))
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
    () => frases.filter(f => !fonte.lang || !f.lang || baseLang(f.lang) === baseLang(fonte.lang)),
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
      return triagem.usaveis.filter(c => passaNoFiltro(c, filtro, { rankingDificeis: conjuntoDeDificeis, agora: Date.now() }));
    }
    const doBanco = new Map(triagem.usaveis.map(c => [chaveDaPalavra(c.word), c]));
    const embutidos = niveisDaRodada
      .flatMap(n => cartoesDaTrilha(trilha, n))
      .filter(c => !doBanco.has(chaveDaPalavra(c.word))) as unknown as VocabCard[];
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
    let pedindo = 0, nunca = 0, traducao = 0, frase = 0;
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
  const pistas = useMemo(
    () => pistasDaTriagem({ ...triagem, usaveis: acervoDaFonte }),
    [triagem, acervoDaFonte],
  );

  /* SELEÇÃO v2: os itens do acervo marcados como difíceis para você (≥ LEECH_APOS erros seguidos).
     Ficam fora da rotação comum e voltam na rodada de resgate da antessala. */
  const leechesDoAcervo = useMemo(
    () => acervoDaFonte.filter(c => estadoDoItem(historico.get(c.word)).tag === 'leech').map(c => c.word),
    [acervoDaFonte, historico],
  );

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
  const [temVoz, setTemVoz] = useState(() => isTtsSupported());
  useEffect(() => {
    /* Estado e não `useMemo`: a lista de vozes é mutável e vive FORA do React. Um memo com um
       contador de dependência fingiria uma relação que não existe (e o lint acusa, com razão);
       aqui a resposta é recalculada nos dois momentos em que ela pode mudar — quando o idioma
       da prática muda, e quando o navegador finalmente entrega as vozes. */
    const avaliar = () => setTemVoz(isTtsSupported() && (!vozesCarregadas() || hasVoiceFor(fonte.lang)));
    avaliar();
    return aoMudarVozes(avaliar);
  }, [fonte.lang]);

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
    contarPassada('gate', { cartas: jogaveis.length, falas: frasesDoIdioma.length, fonte: fonte.id, lang: fonte.lang });
    const porId = estadoDeCadaJogo({
      cartas: jogaveis,
      frases: frasesDoIdioma.length ? frasesDoIdioma : frasesDoAcervoAtual,
      frasesDaTrilha: comTrilha ? frasesTrilha : undefined,
      temAudio: !!audioSessao,
      audioPronto: !!audioParaJogos,
      temVoz,
      fonteId: fonte.id,
      lang: fonte.lang,
    });
    return JOGOS.map(j => ({ ...j, estado: porId[j.id] }));
  }, [jogaveis, frasesDoIdioma, frasesDoAcervoAtual, frasesTrilha, comTrilha, audioSessao, audioParaJogos, fonte.lang, fonte.id, temVoz]);

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
      nomeDoIdioma: langLabelNaUI,
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
  /* A GRADE MOSTRA TODOS OS JOGOS. A paginação saiu junto com o paginador: `POR_PAGINA` era 9 e
     existem exatamente 9 jogos, então a segunda página nunca chegou a existir — eram 25 linhas de
     JSX inertes mais três derivações para uma navegação que nenhum usuário viu. Quando o décimo
     jogo aparecer, a grade cresce; se um dia precisar paginar de novo, o corte volta aqui. */
  const idsVisiveis = ordenados.map(j => j.id);

  const mexerNaOrdem = (nova: OrdemDosJogos) => { setOrdem(nova); gravarOrdem(nova); };

  /* O ESCOPO DO BANNER era o pior contador da tela (auditoria, defeito 2): `metrics.dueToday` é
     GLOBAL da conta — sem idioma, sem aba, sem recorte — e ficava ao lado de números de escopo
     estrito, sem aviso ("1041 pedindo revisão" sobre um recorte de 847). `vencidosAgora` já
     existia e é a verdade CERTA: os vencidos DENTRO do que a rodada pode usar — o mesmo conjunto
     de todos os outros números da tela, e o mesmo que o botão do banner de fato joga. */
  const vencidos = vencidosAgora.size;
  const tamanhoDoBaralho = deck?.length ?? 0;
  const menorMinimo = Math.min(...JOGOS.map(j => MINIGAMES[j.id].minItems));

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
  const jogosProntos = useMemo(() => ordenados.filter(j => j.estado.ok), [ordenados]);
  const jogosPresos = useMemo(() => {
    /* Enquanto a trilha carrega, nenhum jogo é declarado bloqueado: o acervo ainda não chegou, e
       "faltam N palavras" seria mentira, não só feiura. */
    if (carregandoTrilha) return [];
    const porId = new Map(ordenados.map(j => [j.id, j]));
    return agruparJogos(estados.map(j => j.estado)).presos
      .map(p => ({ ...p, ui: porId.get(p.estado.id)! }))
      .filter(p => p.ui);
  }, [estados, ordenados, carregandoTrilha]);
  /* UMA lista, dois grupos. A grade continua sendo um `<ul>` só — o cabeçalho do segundo grupo
     entra como item na fronteira — porque a carta tem 240 linhas de regras (portas de desbloqueio,
     modo organizar, recordes, tour) e duplicá-la para ter duas grades seria criar dois lugares
     onde a mesma carta pode divergir. */
  const listaDeJogos = useMemo(
    () => [...jogosProntos, ...jogosPresos.map(p => p.ui)],
    [jogosProntos, jogosPresos],
  );

  const abrirJogoCultural = useCallback((id: NonNullable<JogoAtivo>) => {
    triggerHaptic('soft');
    playJuicedHit(1);
    setJogoCulturalAtivo(id);
  }, []);

  const partidaRapida = useCallback(() => {
    triggerHaptic('combo');
    playJuicedHit(2);

    const classicosLiberados = listaDeJogos.filter(j => j.estado.ok);
    const totalOpcoes = classicosLiberados.length + JOGOS_CULTURAIS.length;
    if (totalOpcoes === 0) {
      toast.warn(t('Nenhum jogo disponível no momento'));
      return;
    }

    const sorteio = Math.floor(Math.random() * totalOpcoes);
    if (sorteio < classicosLiberados.length) {
      const escolhido = classicosLiberados[sorteio];
      toast.ok(`${t('Partida rápida:')} ${tituloDoJogo(escolhido, ageProfile)}!`);
      pedirParaJogar(escolhido);
    } else {
      const cultIndex = sorteio - classicosLiberados.length;
      const escolhido = JOGOS_CULTURAIS[cultIndex];
      toast.ok(`${t('Partida cultural rápida:')} ${escolhido.nome}!`);
      setJogoCulturalAtivo(escolhido.id);
    }
  }, [listaDeJogos, ageProfile]);

  const buscaNormalizada = buscaJogos.trim().toLowerCase();

  const jogosClassicosFiltrados = useMemo(() => {
    if (categoriaAtiva === 'culturais') return [];
    return listaDeJogos.filter(j => {
      if (categoriaAtiva === 'favoritos' && !ordem.fixados.includes(j.id)) return false;
      if (filtroHabilidade !== 'todas' && habilidadeDoJogoClassico(j.id) !== filtroHabilidade) return false;
      if (buscaNormalizada) {
        const titulo = tituloDoJogo(j, ageProfile).toLowerCase();
        const desc = descricaoDoJogo(j, ageProfile, fonte.id === 'trilha').toLowerCase();
        if (!titulo.includes(buscaNormalizada) && !desc.includes(buscaNormalizada)) return false;
      }
      return true;
    });
  }, [listaDeJogos, categoriaAtiva, ordem.fixados, filtroHabilidade, buscaNormalizada, ageProfile, fonte.id]);

  const jogosCulturaisFiltrados = useMemo(() => {
    if (categoriaAtiva === 'classicos' || categoriaAtiva === 'favoritos') return [];
    return JOGOS_CULTURAIS.filter(c => {
      if (filtroHabilidade !== 'todas' && c.habilidade !== filtroHabilidade) return false;
      if (buscaNormalizada) {
        const nome = c.nome.toLowerCase();
        const desc = c.descricao.toLowerCase();
        const origem = c.origemCultural.toLowerCase();
        const hab = c.habilidadeLabel.toLowerCase();
        if (!nome.includes(buscaNormalizada) && !desc.includes(buscaNormalizada) && !origem.includes(buscaNormalizada) && !hab.includes(buscaNormalizada)) {
          return false;
        }
      }
      return true;
    });
  }, [categoriaAtiva, filtroHabilidade, buscaNormalizada]);


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
        titulo={((j) => (j ? tituloDoJogo(j, ageProfile) : ''))(JOGOS.find(j => j.id === jogo))}
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
        titulo={jogoUI ? tituloDoJogo(jogoUI, ageProfile) : ''}
        nivelGeral={progress.available ? progress.level : undefined}
        /* Z1 — CHIPS DE DIFICULDADE. Só aparecem onde significam algo: os 5 jogos de frase jogam
           sobre falas, que não têm dificuldade por palavra. Chip inerte ensina que a tela mente. */
        filtroDificuldade={aceitaFiltroDeDificuldade(antessala.jogo) ? {
          faixas,
          estrategia,
          aoTrocarFaixa: (f: FaixaDificuldade) => {
            setFaixas((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));
            if (estrategia === 'auto') setEstrategia('equilibrado'); // chip manual assume o controle
            setAntessala(null);   // o recorte mudou: a prévia atual não vale mais
          },
          aoTrocarEstrategia: (e: EstrategiaDaUI) => { setEstrategia(e); if (e === 'auto') setFaixas([]); setAntessala(null); },
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
        estados={new Map<string, EstadoDoItem>(antessala.previa.map(i => [i.ref, estadoDoItem(historico.get(i.ref))]))}
        leeches={leechesDoAcervo}
        onResgate={leechesDoAcervo.length
          ? () => {
              // Só as difíceis + 2 firmes/aprendendo para dar respiro; sem cronômetro de combo aqui.
              const firmes = acervoDaFonte.filter(c => { const t = estadoDoItem(historico.get(c.word)).tag; return t === 'firme' || t === 'aprendendo'; }).slice(0, 2).map(c => c.word);
              const r = montarRodada(antessala.jogo, null, new Set([...leechesDoAcervo, ...firmes]));
              if (r) setAntessala(r); else toast.warn('Este jogo precisa de mais itens para a rodada de resgate. Tente outro jogo.');
            }
          : null}
        auto={estrategia === 'auto' && aceitaFiltroDeDificuldade(antessala.jogo) ? (() => { const d = decisaoAuto(antessala.jogo); faixaAutoAtualRef.current[antessala.jogo] = d.faixa; return { faixa: d.faixa, motivo: d.motivo }; })() : null}
        diagnosticoTermo={antessala.jogo === 'termo' ? diagnosticoTermo(acervoDaFonte) : null}
        etapa={fonte.id === 'trilha' && etapaDaTrilha ? etapaDaTrilha.nome : null}
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
        jogo={((j) => (j ? tituloDoJogo(j, ageProfile) : resultado.gameId))(JOGOS.find((j) => j.id === resultado.gameId))}
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
        /* A porta para o resumo, e só quando ela tem o que mostrar. As palavras erradas eram
           gravadas item a item em `exercise_results` desde sempre e nunca chegavam a ninguém. */
        onVerErros={resultado.items.some(o => !o.correct) ? () => setVerResumo(true) : null}
        onDone={sairDaSequencia}
        semMaterial={semMaterial}
        onPularVez={saldoSeeds >= CUSTO_PULAR && !gastando ? pularVez : null}
        custoPular={CUSTO_PULAR}
        saldoSeeds={saldoSeeds}
        progress={progress}
        onVerProgressao={() => onChangeView('loja', { aba: 'progressao' })}
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
        titulo={tituloDoJogo(carta, ageProfile)}
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
  if (vendoBaralhos) {
    return telaCheia(
      <BaralhosAnki
        onVoltar={() => { setVendoBaralhos(false); void recarregarBaralhosAnki(); }}
        onImportar={() => { setVendoBaralhos(false); setImportando(true); }}
        /* O IDIOMA VEM JUNTO. Recortar por um baralho de japonês sem sair do inglês deixava a
           gaveta — que lista baralhos do idioma vigente — sem o chip do baralho recortado: o
           recorte ficava ligado e sem o controle que o desliga. */
        onJogarCom={(id, nome, lang) => {
          setBaralhoAnki({ id, nome });
          if (lang && baseLang(lang) !== baseLang(fonte.lang)) trocarIdioma(lang);
          setVendoBaralhos(false);
        }}
        /* Ativar projeta cartões novos: o baralho da tela precisa ser relido, senão o lobby
           continuaria mostrando o acervo de antes da ativação. */
        onAtivou={async () => { try { setDeck((await fetchDeck()).filter(c => c.inDeck)); } catch { /* mantém */ } }}
      />
    );
  }
  if (jogoCulturalAtivo) {
    const itensCulturais = acervoDaFonte.map((c) => ({
      cardId: c.id,
      prompt: c.translation || '',
      answer: c.word,
      lang: fonte.lang || 'en-US',
    }));
    const fecharJogoCultural = () => {
      setJogoCulturalAtivo(null);
    };
    const propsComuns = {
      items: itensCulturais,
      ageProfile,
      onFinish: fecharJogoCultural,
      onExit: fecharJogoCultural,
    };

    let conteudoCultural: React.ReactNode = null;
    if (jogoCulturalAtivo === 'karuta') conteudoCultural = <KarutaGame {...propsComuns} />;
    else if (jogoCulturalAtivo === 'koffer') conteudoCultural = <KofferGame {...propsComuns} />;
    else if (jogoCulturalAtivo === 'choseong') conteudoCultural = <ChoseongGame {...propsComuns} />;
    else if (jogoCulturalAtivo === 'taboo') conteudoCultural = <TabooGame {...propsComuns} />;
    else if (jogoCulturalAtivo === 'shiritori') conteudoCultural = <ShiritoriGame {...propsComuns} />;
    else if (jogoCulturalAtivo === 'cadavre') conteudoCultural = <CadavreExquisGame {...propsComuns} />;
    else if (jogoCulturalAtivo === 'bao') conteudoCultural = <BaoGame {...propsComuns} />;
    else if (jogoCulturalAtivo === 'tennis') conteudoCultural = <TenseTennisGame {...propsComuns} />;
    else if (jogoCulturalAtivo === 'vitendawili') conteudoCultural = <VitendawiliGame {...propsComuns} />;

    if (conteudoCultural) {
      return telaCheia(conteudoCultural);
    }
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
        <header className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="w-8 h-8 rounded-xl bg-accent text-white flex items-center justify-center shadow-xs shrink-0" aria-hidden>
                <Gamepad2 className="w-4 h-4" />
              </span>
              <h1 className="font-display font-black text-2xl text-ink tracking-tight">
                {ageProfile === 'senior' ? t('Praticar jogando') : t('Jogar & Praticar')}
              </h1>
              <span className="kpi-pill text-[10.5px] font-extrabold uppercase tracking-wider text-accent border-accent/30 bg-accent-soft/60">
                {jogosProntos.length + JOGOS_CULTURAIS.length} {t('Jogos')}
              </span>
            </div>
            <p className="text-[13px] text-ink-muted mt-1 max-w-[65ch]">
              {ageProfile === 'senior'
                ? t('Jogos curtos com as palavras que você já salvou. Cada acerto conta para a sua memória.')
                : t('Rodadas curtas e dinâmicas com as suas palavras. O que você acerta aqui conta na revisão.')}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start md:self-auto flex-wrap sm:flex-nowrap">
            {/* BOTÃO DE DESTAQUE: PARTIDA RÁPIDA NO TOPO */}
            <button
              type="button"
              onClick={partidaRapida}
              className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-black text-[13px] shadow-sm hover:shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer shrink-0"
              title={t('Sorteia um jogo aleatório dentre os disponíveis e inicia imediatamente')}
            >
              <Dices className="w-4 h-4" />
              <span>{t('Partida Rápida')}</span>
            </button>

            {/* PROGRESSO no cabeçalho */}
            {progress.available ? (
              <section
                aria-label={t('Seu progresso')}
                className="card-panel bg-surface px-4 py-2.5 flex items-center gap-4 shrink-0 self-start sm:self-auto relative hover:border-accent transition-colors"
              >
                <div
                  className="min-w-[8rem]"
                  title={t('{xp} XP no total, {detalhe}. Faltam {faltam} XP para o próximo.', {
                    xp: progress.xp,
                    detalhe: metrics
                      ? t('{sessoes} {unidade}, {palavras} palavras capturadas, {revisoes} revisões, {itens} itens de jogo', {
                          sessoes: metrics.sessions,
                          unidade: tp(metrics.sessions, 'sessão', 'sessões'),
                          palavras: metrics.wordsCaptured,
                          revisoes: metrics.reviews,
                          itens: metrics.drillItems ?? 0,
                        })
                      : t('calculado das suas métricas'),
                    faltam: progress.xpForLevel - progress.xpIntoLevel,
                  })}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="label-mono">{ageProfile === 'senior' ? t('Etapa') : t('Nível')} {progress.level}</span>
                    <span className="text-[11px] text-ink-muted tabular-nums">{progress.xpIntoLevel}/{progress.xpForLevel} XP</span>
                  </div>
                  <div className="h-1.5 bg-canvas rounded-full mt-1.5 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.levelPct} aria-label={t('Progresso para {escala} {n}', { escala: ageProfile === 'senior' ? t('etapa') : t('nível'), n: progress.level + 1 })}>
                    <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${progress.levelPct}%` }} />
                  </div>
                </div>
                <span
                  className="flex items-center gap-1 text-[13px] font-bold text-ink"
                  title={progress.practicedToday
                    ? t('Você já apareceu hoje: {n} {dias}. Abrir o app amanhã mantém a contagem.', {
                        n: progress.streakDays, dias: tp(progress.streakDays, 'dia seguido', 'dias seguidos'),
                      })
                    : t('Dias seguidos em que você abriu o app ou revisou. Não há penalidade por quebrar.')}
                >
                  <Flame className={`w-4 h-4 ${progress.practicedToday ? 'text-warn-ink' : 'text-ink-faint'}`} aria-hidden /> {progress.streakDays}
                  <span className="text-ink-muted font-medium text-[12px]">{tp(progress.streakDays, 'dia', 'dias')}</span>
                </span>
                <span
                  className="flex items-center gap-1 text-[13px] font-bold text-ink"
                  title={(() => {
                    const seeds = (id: string) => REGRAS.find(r => r.id === id)?.seeds ?? 0;
                    return t('Saldo: {ganhas} ganhas − {gastas} gastas. Jogando: {acerto} por acerto e {perfeita} por rodada sem erro.', {
                      ganhas: progress.seedsGanhas,
                      gastas: metrics?.seedsGastas ?? 0,
                      acerto: seeds('jogoCerto'),
                      perfeita: seeds('rodadaPerfeita'),
                    });
                  })()}
                >
                  <Sprout className="w-4 h-4 text-good-ink" aria-hidden /> {progress.seeds}
                  <span className="text-ink-muted font-medium text-[12px]">{t('seeds')}</span>
                </span>
                <button
                  onClick={() => onChangeView('loja')}
                  className="ms-0.5 shrink-0 min-w-6 min-h-6 inline-flex items-center justify-center rounded-lg text-ink-faint hover:text-accent cursor-pointer after:absolute after:inset-0 after:content-[''] after:rounded-[inherit]"
                  title={t('Ver o passe, a loja e os desafios')}
                  aria-label={t('Ver o passe, a loja e os desafios')}
                >
                  <ChevronRight className="w-4 h-4" aria-hidden />
                </button>
              </section>
            ) : (
              <div className="card-panel bg-surface px-4 py-2.5 h-[54px] w-[22rem] max-w-full animate-pulse shrink-0" aria-hidden />
            )}
          </div>
        </header>
      )}

      {/* A CORRENTE QUE ACABOU DE ENCERRAR.
          Sair no meio de uma rodada perde a rodada parcial (nenhum dos nove jogos expõe relatório
          parcial). O que já estava somado, porém, foi conquistado, apagá-lo sem dizer nada é o
          tipo de silêncio que faz a pessoa achar que o app perdeu o progresso dela. */}
      {ultimaCorrente && ultimaCorrente.rodadas > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] animate-in fade-in">
          <span className="kpi-pill">
            <T txt="sequência encerrada · <b>{rodadas}</b> rodadas · <b>{pontos}</b> pontos"
               val={{ rodadas: ultimaCorrente.rodadas, pontos: ultimaCorrente.pontos }} />
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
      {!embutido && fontesOferecidas.length > 1 && (
        <div className="mb-4">
          <SeletorDeConteudo
            total={acervoDaFonte.length}
            /* O nome curto da ABA, não o título longo do painel de contexto: a linha precisa caber
               ao lado do total e do idioma, e "Revisão do que você ouviu" empurrava o resto. */
            nomeDaFonte={filtro.fontes.length > 1
              ? t('{n} fontes', { n: filtro.fontes.length })
              : baralhoAnki
                ? baralhoAnki.nome
                : (() => {
                    const r = ABAS_DE_FONTE.find(a => a.origem === escolhaAtual.origem)?.rotulo[ageProfile];
                    return r ? t(r) : '';
                  })()}
            idioma={fonte.lang ? langLabelNaUI(fonte.lang) : undefined}
            aberta={seletorAberto}
            aoAlternar={() => setSeletorAberto(v => !v)}
            aoLimpar={() => {
              setFiltro(prev => ({ ...prev, baralhos: [], recorte: {}, midia: {} }));
            }}
            avisoDeVazio={
              acervoDaFonte.length === 0 &&
              (filtro.recorte.pedindoRevisao || filtro.recorte.nuncaVistas || filtro.midia.comTraducao || filtro.midia.comFrase || filtro.baralhos.length > 0)
                ? t('nenhum item passa; desligue um recorte para voltar a ter material')
                : undefined
            }
            acoesBarra={
              <>
                <button
                  type="button"
                  onClick={() => setVerRecordes(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover hover:border-warn text-[12px] font-bold text-ink transition-colors cursor-pointer"
                  title={t('Ver recordes e ranking')}
                >
                  <TrophyIcon className="w-3.5 h-3.5 text-warn" />
                  <span className="hidden sm:inline">{t('Recordes')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVendoMapa(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover hover:border-accent text-[12px] font-bold text-ink transition-colors cursor-pointer"
                  title={t('Mapa do conteúdo')}
                >
                  <MapIcon className="w-3.5 h-3.5 text-accent" />
                  <span className="hidden sm:inline">{t('Mapa')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurando(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover hover:border-warn text-[12px] font-bold text-ink transition-colors cursor-pointer"
                  title={resumoDosPulados(triagem.fora) || t('Ver itens fora do recorte')}
                >
                  <SlidersIcon className="w-3.5 h-3.5 text-ink-muted" />
                  <span className="hidden sm:inline">{t('Curadoria')}</span>
                  {triagem.fora.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-warn-soft text-warn-ink text-[11px] font-mono font-bold">
                      {triagem.fora.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={alternarDetalhes}
                  aria-expanded={detalhes}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[12px] font-medium transition-colors cursor-pointer ${
                    detalhes
                      ? 'bg-canvas border-border-subtle text-ink font-bold'
                      : 'border-border-subtle bg-surface hover:bg-surface-hover text-ink-muted hover:text-ink'
                  }`}
                  title={detalhes ? t('Ocultar estatísticas do baralho') : t('Ver estatísticas do baralho')}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <ChevronRight className={`w-3 h-3 transition-transform ${detalhes ? 'rotate-90' : ''}`} />
                </button>
              </>
            }
            acoes={
              <>
                <button
                  onClick={() => setImportando(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-[12.5px] font-semibold text-ink hover:border-accent transition-colors cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5" aria-hidden />
                  {ageProfile === 'kids' ? t('Palavras de fora') : t('Trazer do Anki')}
                </button>
                {temBaralhosAnki && (
                  <button
                    onClick={() => setVendoBaralhos(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-[12.5px] font-semibold text-ink hover:border-accent transition-colors cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" aria-hidden />
                    {t('Gerenciar baralhos')}
                  </button>
                )}
                {/* A Sala só sobra para o que a gaveta não cobre: começar num idioma que ainda
                    não tem palavra nenhuma (a faceta lista só os que têm material). */}
                <button
                  onClick={() => setSalaAberta(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-[12.5px] font-semibold text-ink hover:border-accent transition-colors cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" aria-hidden />
                  {t('Outro idioma')}
                </button>
                {/* Ao lado de "outro idioma", que é a pergunta que ela responde: o app oferece 28
                    e não entrega 28 experiências iguais. */}
                <div className="w-full">
                  <CoberturaDosIdiomas baralho={idiomasDoBaralho} />
                </div>
              </>
            }
            facetas={[
              {
                /* IDIOMA É A PRIMEIRA FACETA porque manda em todas as outras: trocar de idioma
                   troca o acervo inteiro, e as contagens abaixo passam a falar de outro material.
                   Ele morava atrás de um botão que abria um modal — a decisão mais determinante
                   da tela era a mais escondida. A lista completa continua na Sala, para quem
                   estuda um idioma que ainda não tem palavra nenhuma. */
                id: 'idioma',
                rotulo: t('idioma'),
                exclusiva: true,
                valor: fonte.lang ? [baseLang(fonte.lang)] : [],
                aoTrocar: (lang) => {
                  /* Baralho de OUTRO idioma não sobrevive à troca: ficaria marcado recortando
                     para zero, e o motivo não estaria em lugar nenhum da tela. */
                  setFiltro(prev => ({
                    ...prev,
                    baralhos: prev.baralhos.filter(id => {
                      const d = decksAnki.find(x => x.id === id);
                      return !d?.lang || baseLang(d.lang) === baseLang(lang);
                    }),
                  }));
                  aplicarEscolha({ ...escolhaAtual, lang });
                },
                opcoes: idiomasDoBaralho.map(i => ({
                  id: i.lang,
                  rotulo: langLabelNaUI(i.lang),
                  contagem: i.jogaveis,
                  icone: <Globe className="w-3.5 h-3.5" aria-hidden />,
                  motivoBloqueio: i.jogaveis === 0 ? t('nenhuma palavra pronta para jogar neste idioma ainda') : undefined,
                })),
              },
              {
                id: 'fonte',
                rotulo: t('de onde vêm'),
                ajuda: t('marque quantas quiser — elas se somam na rodada'),
                valor: filtro.fontes.map(f => (f === 'trilha' ? 'trilha' : 'gravacoes')),
                aoTrocar: (origem) => {
                  const alvo = origem === 'trilha' ? 'trilha' as const : 'baralho' as const;
                  setFiltro(prev => {
                    const tinha = prev.fontes.includes(alvo);
                    const fontes = tinha ? prev.fontes.filter(f => f !== alvo) : [...prev.fontes, alvo];
                    // Nenhuma fonte marcada não é "tudo", é uma rodada que não abre.
                    return fontes.length ? { ...prev, fontes } : prev;
                  });
                },
                /* A fonte sem material continua VISÍVEL, travada e com o porquê — some da tela
                   era pior: "As que mais escapam" desaparecia sem explicação assim que a pessoa
                   revisava bem, que é justamente quando ela merece saber por que sumiu. */
                opcoes: ABAS_DE_FONTE.filter(aba => aba.origem !== 'dificeis').map(aba => {
                  const contagem = aba.origem === 'trilha' ? totalDaTrilhaAtual
                    : aba.origem === 'dificeis' ? rankingDeDificeis.length
                    : palavrasDasGravacoes;
                  const oferecida = aba.fontes.some(f => fontesOferecidas.includes(f));
                  return {
                    id: aba.origem,
                    rotulo: t(aba.rotulo[ageProfile]),
                    contagem,
                    icone: aba.origem === 'trilha' ? <GraduationCap className="w-3.5 h-3.5" aria-hidden />
                      : aba.origem === 'dificeis' ? <Flame className="w-3.5 h-3.5" aria-hidden />
                      : <Mic className="w-3.5 h-3.5" aria-hidden />,
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
                rotulo: trilha?.escala === 'frequencia' ? t('faixa do curso') : t('nível do curso'),
                ajuda: trilha?.escala === 'frequencia'
                  ? t('por frequência de uso — a faixa 1 traz as mais comuns')
                  : t('cada etapa tem o seu vocabulário'),
                exclusiva: true,
                valor: [fonte.nivel ?? 'todos'],
                aoTrocar: (n) => aplicarEscolha({ ...escolhaAtual, nivel: n === 'todos' ? undefined : (n as CefrLevel) }),
                opcoes: fonte.id !== 'trilha' || !trilha ? [] : [
                  {
                    id: 'todos',
                    rotulo: trilha.escala === 'frequencia' ? t('Todas as faixas') : t('Todos os níveis'),
                    contagem: trilhaDe(fonte.lang).total,
                    icone: <BookOpen className="w-3.5 h-3.5" aria-hidden />,
                  },
                  ...trilhaDe(fonte.lang).niveis.map(n => ({
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
                rotulo: t('quais gravações'),
                ajuda: t('nenhuma marcada = todas'),
                valor: filtro.sessoes,
                aoTrocar: (id) => setFiltro(prev => ({
                  ...prev,
                  sessoes: prev.sessoes.includes(id) ? [] : [id],
                  fontes: prev.sessoes.includes(id) ? prev.fontes : ['sessao'],
                })),
                opcoes: fonte.id === 'trilha' || sessoesDoIdioma.length < 2 ? [] : sessoesDoIdioma.map(s => ({
                  id: s.id,
                  rotulo: s.title || t('gravação sem título'),
                  icone: <Mic className="w-3.5 h-3.5" aria-hidden />,
                })),
              },
              {
                id: 'baralho',
                rotulo: t('quais baralhos'),
                ajuda: t('nenhum marcado = todos'),
                valor: filtro.baralhos,
                aoTrocar: (id) => setBaralhoAnki(filtro.baralhos.includes(id) ? null : (decksAnki.find(d => d.id === id) ?? null)),
                /* SÓ OS BARALHOS DO IDIOMA ESCOLHIDO. Oferecer um baralho japonês com inglês
                   selecionado produzia "0 palavras · nenhum item passa" — a tela convidava a uma
                   escolha que ela mesma anulava. O idioma do baralho vem do import. */
                opcoes: fonte.id === 'trilha' ? [] : decksAnki.filter(d => !fonte.lang || !d.lang || baseLang(d.lang) === baseLang(fonte.lang)).map((d) => ({
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
                    const homonimos = decksAnki.filter(o => o.nome === d.nome);
                    return homonimos.length > 1
                      ? t('{nome} ({i} de {n})', { nome: legivel, i: homonimos.indexOf(d) + 1, n: homonimos.length })
                      : legivel;
                  })(),
                })),
              },
              {
                id: 'recorte',
                rotulo: t('recorte'),
                ajuda: t('filtra dentro do que você escolheu acima'),
                valor: [
                  ...(filtro.recorte.dificeis ? ['dificeis'] : []),
                  ...(filtro.recorte.pedindoRevisao ? ['pedindoRevisao'] : []),
                  ...(filtro.recorte.nuncaVistas ? ['nuncaVistas'] : []),
                  ...(filtro.midia.comTraducao ? ['comTraducao'] : []),
                  ...(filtro.midia.comFrase ? ['comFrase'] : []),
                ],
                aoTrocar: (id) => setFiltro(prev =>
                  id === 'comTraducao' || id === 'comFrase'
                    ? { ...prev, midia: { ...prev.midia, [id]: !prev.midia[id] } }
                    : { ...prev, recorte: { ...prev.recorte, [id]: !prev.recorte[id as 'pedindoRevisao' | 'nuncaVistas' | 'dificeis'] } }),
                opcoes: fonte.id === 'trilha' ? [] : [
                  {
                    id: 'dificeis',
                    rotulo: t(ABAS_DE_FONTE.find(a => a.origem === 'dificeis')?.rotulo[ageProfile] ?? 'As que mais escapam'),
                    contagem: rankingDeDificeis.length,
                    icone: <Flame className="w-3.5 h-3.5" aria-hidden />,
                    motivoBloqueio: rankingDeDificeis.length < 4
                      ? t('revise mais um pouco — ainda não há material para uma rodada')
                      : undefined,
                  },
                  {
                    id: 'pedindoRevisao', rotulo: t('Pedindo revisão'), contagem: contagemRecortes.pedindo,
                    icone: <CalendarClock className="w-3.5 h-3.5" aria-hidden />,
                    motivoBloqueio: contagemRecortes.pedindo === 0 ? t('nada vencido neste acervo agora') : undefined,
                  },
                  {
                    id: 'nuncaVistas', rotulo: t('Nunca vistas'), contagem: contagemRecortes.nunca,
                    icone: <Sparkles className="w-3.5 h-3.5" aria-hidden />,
                    motivoBloqueio: contagemRecortes.nunca === 0 ? t('tudo aqui já foi visto ao menos uma vez') : undefined,
                  },
                  {
                    id: 'comTraducao', rotulo: t('Com tradução'), contagem: contagemRecortes.traducao,
                    icone: <Languages className="w-3.5 h-3.5" aria-hidden />,
                    motivoBloqueio: contagemRecortes.traducao === 0 ? t('nenhum item deste acervo tem tradução utilizável') : undefined,
                  },
                  {
                    id: 'comFrase', rotulo: t('Com frase'), contagem: contagemRecortes.frase,
                    icone: <MessageSquareText className="w-3.5 h-3.5" aria-hidden />,
                    motivoBloqueio: contagemRecortes.frase === 0 ? t('nenhum item deste acervo tem frase de exemplo') : undefined,
                  },
                ],
              },
            ]}
          />
        </div>
      )}

      {verRecordes && <Recordes ageProfile={ageProfile} onFechar={() => setVerRecordes(false)} />}

      {/* ── DIAGNÓSTICO TÉCNICO EXPANSÍVEL (ativado pelo botão de gráfico da barra de acervo) ── */}
      {detalhes && (
        <section
          aria-label={t('Diagnóstico do baralho')}
          className="card-panel bg-surface border border-border-subtle px-4 py-2.5 mb-4 text-[12px] text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl animate-in fade-in duration-200"
        >
          <span className="label-mono flex items-center gap-1.5 text-ink font-bold">
            <BarChart2 className="w-3.5 h-3.5 text-accent" />
            {t('Diagnóstico')}
          </span>
          <span className="font-bold text-good-ink" title={t('{n} palavras do idioma escolhido passaram na régua de qualidade.', { n: contagem.total })}>
            ✓ {t('{n} no idioma', { n: contagem.total })}
          </span>
          <span title={t('Jogos de par precisam de tradução.')}>
            · {t('{n} com tradução', { n: pistas.comTraducao.length })}
          </span>
          {pistas.soComFrase.length > 0 && (
            <span title={t('Sem tradução, mas com frase real.')}>
              · {t('{n} só com frase', { n: pistas.soComFrase.length })}
            </span>
          )}
          {!coreOnly(ageProfile) && triagem.outroIdioma.length > 0 && (
            <span title={t('Existem e prestam, mas são de outro idioma')}>
              · {t('{n} em outro idioma', { n: triagem.outroIdioma.length })}
            </span>
          )}
          {triagem.fora.length > 0 && (
            <span className="text-warn-ink font-semibold">· {t('{n} fora do recorte', { n: triagem.fora.length })}</span>
          )}
          {nuncaCairam > 0 && (
            <span>· {t('{n} nunca caíram', { n: numero(nuncaCairam) })}</span>
          )}
        </section>
      )}

      {fonte.id === 'trilha' && trilha && (
        <PainelTrilha
          dado={trilha}
          deck={deck ?? []}
          ageProfile={ageProfile}
          nivel={fonte.nivel}
          onEscolherNivel={(n: CefrLevel) => setFonte(f => ({ ...f, nivel: n }))}
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
              <T txt="Os jogos usam as palavras que você guarda das suas gravações, nada de lista pronta. Você tem <b>{tem}</b> e precisa de <b>{precisa}</b> para a primeira rodada."
                 val={{ tem: tamanhoDoBaralho, precisa: menorMinimo }} />
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
          {/* ── NAVEGAÇÃO DE CATEGORIAS ── */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5 p-1 bg-surface border border-border-subtle rounded-xl overflow-x-auto custom-scrollbar" role="tablist" aria-label={t('Categorias de jogos')}>
              {[
                { id: 'todos' as const, label: t('Todos'), icon: <Sparkles className="w-3.5 h-3.5" />, total: jogosProntos.length + JOGOS_CULTURAIS.length },
                { id: 'classicos' as const, label: t('Clássicos'), icon: <Zap className="w-3.5 h-3.5" />, total: jogosProntos.length },
                { id: 'culturais' as const, label: t('Jogos do Mundo'), icon: <Globe className="w-3.5 h-3.5" />, total: JOGOS_CULTURAIS.length },
                { id: 'favoritos' as const, label: t('Favoritos'), icon: <Pin className="w-3.5 h-3.5" />, total: ordem.fixados.length },
              ].map(cat => {
                const ativo = categoriaAtiva === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    onClick={() => {
                      setCategoriaAtiva(cat.id);
                      triggerHaptic('soft');
                      playJuicedHit(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-bold transition-all cursor-pointer ${
                      ativo
                        ? 'bg-accent text-white shadow-xs'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                    }`}
                  >
                    {cat.icon}
                    <span>{cat.label}</span>
                    <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                      ativo ? 'bg-white/25 text-white' : 'bg-canvas text-ink-muted'
                    }`}>
                      {cat.total}
                    </span>
                  </button>
                );
              })}
            </div>

            <ul className="hidden lg:flex items-center gap-3 list-none m-0 p-0 text-[11.5px] text-ink-muted" aria-label={t('A cor diz o que o jogo treina')}>
              {FAMILIAS.map(f => (
                <li key={f.rotulo} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: f.tom }} aria-hidden />
                  {f.rotulo}
                </li>
              ))}
            </ul>
          </div>

          {/* ── BARRA DE BUSCA, HABILIDADES E OPÇÕES ── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={buscaJogos}
                onChange={e => setBuscaJogos(e.target.value)}
                placeholder={t('Buscar por nome, mecânica, país...')}
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface border border-border-subtle text-ink placeholder:text-ink-faint text-[12.5px] focus:outline-none focus:border-accent transition-colors"
              />
              {buscaJogos && (
                <button
                  type="button"
                  onClick={() => setBuscaJogos('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-0.5 cursor-pointer"
                  title={t('Limpar busca')}
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
              {[
                { id: 'todas' as const, label: t('Todas'), icon: null },
                { id: 'vocab' as const, label: t('Vocabulário'), icon: <BookOpen className="w-3.5 h-3.5" /> },
                { id: 'escuta_fala' as const, label: t('Escuta & Fala'), icon: <Headphones className="w-3.5 h-3.5" /> },
                { id: 'frase_gramatica' as const, label: t('Sintaxe & Frases'), icon: <Puzzle className="w-3.5 h-3.5" /> },
              ].map(h => {
                const ativo = filtroHabilidade === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setFiltroHabilidade(h.id);
                      triggerHaptic('soft');
                      playJuicedHit(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-bold shrink-0 transition-colors cursor-pointer border ${
                      ativo
                        ? 'bg-accent-soft text-accent-ink border-accent/40 font-black'
                        : 'bg-surface border-border-subtle text-ink-muted hover:text-ink hover:border-ink-faint'
                    }`}
                  >
                    {h.icon}
                    <span>{h.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 shrink-0 ms-auto">
              <label className="flex items-center gap-1.5 text-[12px] text-ink-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!pularSempre}
                  onChange={e => mudarPularSempre(!e.target.checked)}
                  className="w-5 h-5 accent-accent cursor-pointer"
                />
                <span className="hidden sm:inline">{ageProfile === 'kids' ? t('Ver antes de jogar') : t('Prévia antes de começar')}</span>
              </label>

              <button
                type="button"
                onClick={() => setModoOrganizar(v => !v)}
                aria-pressed={modoOrganizar}
                title={t('Mudar a ordem das cartas e fixar as favoritas no topo')}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-bold cursor-pointer transition-colors ${
                  modoOrganizar ? 'bg-accent text-accent-contrast border-accent' : 'bg-surface border-border-subtle text-ink-muted hover:text-ink hover:border-ink-faint'
                }`}
              >
                <Pin className="w-3.5 h-3.5" aria-hidden />
                {modoOrganizar ? t('Pronto') : t('Organizar')}
              </button>
            </div>
          </div>

          {/* ── GRADE DINÂMICA DE JOGOS ── */}
          <ul id="grade-de-jogos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none m-0 p-0">
            {/* Clássicos Filtrados */}
            {jogosClassicosFiltrados.map((j, i) => {
              const liberado = j.estado.ok;
              const prontosNestaLista = jogosClassicosFiltrados.filter(item => item.estado.ok);
              const presosNestaLista = jogosClassicosFiltrados.filter(item => !item.estado.ok);
              const abreOSegundoGrupo = i === prontosNestaLista.length && presosNestaLista.length > 0;

              return (
                <React.Fragment key={j.chave}>
                {abreOSegundoGrupo && (
                  <li className="col-span-full list-none mt-4 mb-1">
                    <h3 className="font-display font-bold text-[15px] text-ink">{t('Precisam de outro material')}</h3>
                    <p className="text-[12.5px] text-ink-muted mt-0.5 max-w-[64ch]">
                      {t('Não estão quebrados: pedem algo que este recorte não tem. Cada um diz o que falta.')}
                    </p>
                  </li>
                )}
                <li className="contents">
                <div
                  className={`card-panel text-start flex flex-col overflow-hidden transition-all relative group ${
                    liberado ? 'bg-surface hover:border-accent hover:-translate-y-1 hover:shadow-card' : 'bg-canvas border-dashed'
                  }`}
                >
                  <span
                    className="block w-full aspect-[16/7] border-b border-border-subtle overflow-hidden"
                    style={{ background: `color-mix(in srgb, ${tomDoJogo(j.id)} ${liberado ? 9 : 4}%, var(--canvas))` }}
                    aria-hidden
                  >
                    <ArteDoJogo jogo={j.id} />
                  </span>

                  <span className="p-4 flex flex-col flex-1 gap-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          liberado ? 'bg-surface text-ink' : 'bg-surface-hover text-ink-muted'
                        }`}
                        aria-hidden
                      >
                        {liberado ? j.icone : <Lock className="w-3.5 h-3.5" />}
                      </span>
                      <h3 className="font-display font-bold text-[14.5px] text-ink leading-tight">
                        <button
                          type="button"
                          disabled={!liberado}
                          onClick={() => {
                            triggerHaptic('soft');
                            playJuicedHit(1);
                            pedirParaJogar(j);
                          }}
                          className={`text-start font-bold ${
                            liberado
                              ? 'cursor-pointer text-ink hover:text-accent after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-accent'
                              : 'cursor-not-allowed text-ink-muted'
                          }`}
                        >
                          {tituloDoJogo(j, ageProfile)}
                        </button>
                      </h3>
                    </span>

                    {liberado && pularSempre && (
                      <button
                        onClick={() => pedirParaJogar(j, true)}
                        className="relative z-10 min-w-6 min-h-6 inline-flex items-center justify-center rounded-lg text-ink-faint hover:text-accent hover:bg-surface-hover cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                        title={t('Ver a prévia desta rodada antes de começar')}
                        aria-label={`${t('Prévia da rodada')}: ${tituloDoJogo(j, ageProfile)}`}
                      >
                        <ListChecks className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => setExplicando(j.id)}
                      className="relative z-10 min-w-6 min-h-6 inline-flex items-center justify-center rounded-lg text-ink-faint hover:text-accent hover:bg-surface-hover cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                      title={t('Como se joga')}
                      aria-label={`${t('Como se joga')}: ${tituloDoJogo(j, ageProfile)}`}
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </span>

                  {modoOrganizar && (
                    <span className="relative z-10 flex items-center gap-1 pt-1">
                      {([
                        { icone: <ChevronLeft className="w-3.5 h-3.5" />, dir: -1 as const, rot: t('Mover para a esquerda') },
                        { icone: <ChevronRight className="w-3.5 h-3.5" />, dir: 1 as const, rot: t('Mover para a direita') },
                      ]).map(({ icone, dir, rot }) => (
                        <button
                          key={dir}
                          onClick={() => mexerNaOrdem(mover(ordem, idsVisiveis, j.id, dir))}
                          className="min-w-6 min-h-6 inline-flex items-center justify-center rounded-md text-ink-faint hover:text-accent hover:bg-surface-hover cursor-pointer"
                          title={rot}
                          aria-label={`${rot}: ${tituloDoJogo(j, ageProfile)}`}
                        >
                          {icone}
                        </button>
                      ))}
                      <button
                        aria-pressed={ordem.fixados.includes(j.id)}
                        onClick={() => mexerNaOrdem(alternarFixado(ordem, j.id))}
                        className={`min-w-6 min-h-6 inline-flex items-center justify-center rounded-md cursor-pointer hover:bg-surface-hover ${ordem.fixados.includes(j.id) ? 'text-accent' : 'text-ink-faint hover:text-accent'}`}
                        title={ordem.fixados.includes(j.id) ? t('Desafixar do topo') : t('Fixar no topo')}
                        aria-label={`${ordem.fixados.includes(j.id) ? t('Desafixar') : t('Fixar no topo')}: ${tituloDoJogo(j, ageProfile)}`}
                      >
                        <Pin className={`w-3.5 h-3.5 ${ordem.fixados.includes(j.id) ? 'fill-current' : ''}`} />
                      </button>
                    </span>
                  )}

                  <span className="text-[12px] text-ink-muted leading-snug">
                    {descricaoDoJogo(j, ageProfile, fonte.id === 'trilha')}
                  </span>

                  {!liberado && (() => {
                    const porta = comoDesbloquear(j.estado, contextoDoDesbloqueio);
                    if (!porta) return null;
                    return (
                      <button
                        onClick={() => abrirPorta(porta)}
                        className="relative z-10 mt-auto self-start inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[11.5px] font-bold text-accent-ink hover:bg-accent hover:text-accent-contrast cursor-pointer"
                      >
                        {porta.rotulo} <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    );
                  })()}

                  <span className={`text-[11px] pt-1 ${liberado ? 'font-bold mt-auto text-good-ink' : 'text-ink-muted'}`}>
                    {(() => {
                      const unidade = (n: number) => (j.estado.fonte === 'falas'
                        ? tp(n, 'fala', 'falas')
                        : tp(n, 'palavra', 'palavras'));
                      if (liberado) {
                        const total = ('pool' in j.estado ? j.estado.pool : undefined) ?? j.estado.disponiveis;
                        const naRodada = j.estado.tamanhoDaRodada;
                        return naRodada < total
                          ? t('{n} nesta rodada · {total} disponíveis', { n: naRodada, total })
                          : t('{n} {unidade} nesta rodada', { n: naRodada, unidade: unidade(naRodada) });
                      }
                      const motivo = 'motivo' in j.estado ? j.estado.motivo : undefined;
                      if (motivo === 'trilha-sem-frase') {
                        return ageProfile === 'kids'
                          ? t('a trilha tem palavras, não frases')
                          : t('a trilha tem palavras soltas, este jogo precisa de frase; escolha uma gravação');
                      }
                      if (motivo === 'sem-voz') return t('este navegador não tem voz em {idioma}', { idioma: langLabelNaUI(fonte.lang) });
                      /* A trilha japonesa TEM 5.181 frases: a mensagem de acervo vazio mandaria a
                         pessoa procurar uma gravação para resolver o que não é falta de material. */
                      if (motivo === 'escrita-sem-separacao') {
                        return ageProfile === 'kids'
                          ? t('em {idioma} as palavras ficam juntinhas, sem espaço', { idioma: langLabelNaUI(fonte.lang) })
                          : t('este jogo separa as palavras da frase, e {idioma} não marca onde cada uma começa', { idioma: langLabelNaUI(fonte.lang) });
                      }
                      // Estado transitório e honesto: a gravação TEM som, ele está a caminho.
                      if (motivo === 'audio-carregando') return t('baixando o áudio da gravação…');
                      if (j.estado.fonte === 'falas' && j.estado.disponiveis === 0) return t('precisa de uma gravação com legenda');

                      /* A CONTA INTEIRA, e não só o que falta.
                         "faltam 2 palavras" não diz de quantas nem sobre o quê, e a pessoa não tem
                         como saber se 2 palavras é perto ou longe, nem em que idioma elas contam.
                         Com "precisa de 4 · você tem 2 do espanhol", a mesma linha responde as três
                         perguntas e o caminho de saída fica óbvio: gravar mais naquele idioma. */
                      const precisa = MINIGAMES[j.id].minItems;
                      const falta = tp(j.estado.faltam, 'falta {n} {unidade}', 'faltam {n} {unidade}', {
                        unidade: unidade(j.estado.faltam),
                      });
                      return ageProfile === 'kids'
                        ? t('{falta} para abrir', { falta })
                        : t('{falta} · precisa de {precisa} · você tem {tem} do {idioma}', {
                            falta, precisa, tem: j.estado.disponiveis, idioma: langLabelNaUI(fonte.lang),
                          });
                    })()}
                  </span>
                  {/* O RECORDE, quando existe. Vem da coluna `score`, que era gravada a cada rodada
                      desde a migração 0001 e nunca tinha sido lida de volta. Só aparece com jogo
                      liberado e recorde > 0: "recorde: 0" seria uma provocação sem sentido. */}
                  {liberado && (recordeDoJogo(j.id) ?? 0) > 0 && (
                    <span className="kpi-pill mt-1.5 self-start" title={t('Sua melhor sequência neste jogo, nesta fonte')}>
                      <Trophy className="w-3 h-3" aria-hidden /> {t('recorde {n}', { n: recordeDoJogo(j.id) ?? 0 })}
                    </span>
                  )}
                  </span>
                </div>
                </li>
                </React.Fragment>
              );
            })}

            {/* Separador dos Jogos Culturais na visualização "Todos" */}
            {categoriaAtiva === 'todos' && jogosClassicosFiltrados.length > 0 && jogosCulturaisFiltrados.length > 0 && (
              <li className="col-span-full list-none mt-6 mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-t border-border-subtle pt-6">
                <div>
                  <h3 className="font-display font-black text-[16px] text-ink flex items-center gap-2">
                    <Globe className="w-4 h-4 text-accent" /> {t('Jogos do Mundo & Inovações Culturais')}
                  </h3>
                  <p className="text-[12.5px] text-ink-muted mt-0.5 max-w-[65ch]">
                    {t('Minigames baseados em ricas tradições mundiais (Karuta, Mancala, Shiritori, Cadavre Exquis e mais), 100% integrados com Game Feel.')}
                  </p>
                </div>
                <span className="kpi-pill text-[11px] font-bold self-start sm:self-auto">{jogosCulturaisFiltrados.length} {t('jogos')}</span>
              </li>
            )}

            {/* Cards dos Jogos Culturais */}
            {jogosCulturaisFiltrados.map((cult) => (
              <li key={cult.id} className="contents">
                <div
                  className="card-panel bg-surface text-start flex flex-col overflow-hidden transition-all relative group hover:border-accent hover:-translate-y-1 hover:shadow-card"
                >
                  <div
                    className="w-full aspect-[16/7] border-b border-border-subtle overflow-hidden relative p-3 flex flex-col justify-between"
                    style={{ background: `color-mix(in srgb, ${cult.tom} 12%, var(--canvas))` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface/90 text-ink text-[11px] font-bold shadow-xs backdrop-blur-xs">
                        <span>{cult.bandeira}</span>
                        <span>{cult.origemCultural}</span>
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent text-white text-[10.5px] font-mono font-bold tracking-tight shadow-xs">
                        {cult.nivelCefr}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface/80 text-ink-muted text-[10.5px] font-medium backdrop-blur-xs">
                        <Sparkles className="w-3 h-3 text-accent" />
                        {cult.habilidadeLabel}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col flex-1 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-black text-[15px] text-ink leading-tight">
                        <button
                          type="button"
                          onClick={() => abrirJogoCultural(cult.id)}
                          className="text-start font-bold cursor-pointer text-ink group-hover:text-accent transition-colors after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {cult.nome}
                        </button>
                      </h3>
                      <span className="relative z-10 w-7 h-7 rounded-lg bg-surface border border-border-subtle flex items-center justify-center text-ink-muted group-hover:text-accent group-hover:border-accent/40 transition-colors">
                        <Gamepad2 className="w-4 h-4" />
                      </span>
                    </div>

                    <p className="text-[12.5px] text-ink-muted leading-snug flex-1">
                      {cult.descricao}
                    </p>

                    <div className="pt-2 border-t border-border-subtle/60 flex items-center justify-between text-[11.5px] mt-auto">
                      <span className="text-good-ink font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> {t('100% Funcional')}
                      </span>
                      <span className="relative z-10 font-bold text-accent group-hover:underline flex items-center gap-1">
                        {t('Jogar')} <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}

            {/* Estado Vazio de Busca */}
            {jogosClassicosFiltrados.length === 0 && jogosCulturaisFiltrados.length === 0 && (
              <li className="col-span-full list-none py-12 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center text-ink-faint">
                  <Search className="w-6 h-6" />
                </div>
                <p className="font-bold text-ink text-[15px]">{t('Nenhum jogo encontrado')}</p>
                <p className="text-[12.5px] text-ink-muted max-w-sm">
                  {t('Tente buscar por outro termo ou ajuste os filtros de categoria e habilidade.')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setBuscaJogos('');
                    setFiltroHabilidade('todas');
                    setCategoriaAtiva('todos');
                    triggerHaptic('soft');
                    playJuicedHit(1);
                  }}
                  className="px-4 py-2 rounded-xl bg-surface border border-border-subtle hover:border-accent text-[12px] font-bold text-ink cursor-pointer transition-colors"
                >
                  {t('Limpar filtros e busca')}
                </button>
              </li>
            )}
          </ul>
        </>
      )}

      {erro && (
        <p className="mt-4 text-[12px] text-warn-ink">
          {t('Não consegui carregar o seu baralho: {erro}', { erro })}
        </p>
      )}
      </div>

      {/* O progresso mora no CABEÇALHO (ver acima): uma linha, ao lado do título, onde o olho
          passa antes de jogar, e não empurra a primeira carta. Fora quando embutido: nível,
          streak e seeds são do PERFIL; a aba da sessão fala de UMA sessão. */}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {/* O Anki saiu daqui e subiu para a faixa de fontes: era a única porta para trazer
            vocabulário de fora e estava no rodapé, abaixo de nove cartas e da faixa de progresso. */}
        {/* Dizia "Exercícios completos", prometendo os doze legados. Sobraram dois, e os dois são
            de MEMÓRIA (revisão espaçada e produção ativa), o resto virou jogo e mora aqui. O
            rótulo passa a dizer para onde leva de verdade. */}
        <button
          onClick={() => onChangeView('study')}
          className="text-[12px] text-ink-muted hover:text-accent underline cursor-pointer py-1"
        >
          {ageProfile === 'kids' ? t('Revisar minhas palavras') : t('Revisão espaçada e produção ativa')}
        </button>
      </div>
    </div>
  );
}
