import type { EstadoDoItem, FaseJogada, MinigameId } from '@core';
import type { ItemDaAntessala } from '@core';
import { ALVO_MAX, ALVO_MIN, JANELA_DE_RODADAS, JANELAS_DE_RETORNO, LEECH_APOS, nivelNoJogo } from '@core';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Gamepad2,
  History,
  LifeBuoy,
  Lock,
  Play,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Sparkle,
  Sparkles,
  Target,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { EstrategiaDaUI, FaixaDificuldade } from '../../core/minigames/composicao';
import { fetchRecordes, type RecordeDoJogo } from '../../data/api';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { eventosVistos, todosOsEventos } from '../../lib/eventosDeJogo';
import { proximaRecompensa } from '../../lib/galeria/progressao';
import { numero as formatar, t, tp } from '../../lib/i18n';
import type { AgeProfileType } from '../../lib/profile';
import BarraDeMaestria from '../maestria/BarraDeMaestria';
import { CabecalhoDeTela, Tela, TituloDeSecao } from '../ui';
import { IconePixel } from '../views/play/IconesPixel';
import { InterruptorDoQuest, OpcoesDoQuest, VoltarDoQuest } from '../views/play/quest/pecasDoQuest';
import { Segmentos } from '../views/vocab/Dialogo';
import { regraDaRodada } from './casca/regras';
import { COMO_SE_JOGA } from './ComoSeJoga';

/**
 * ANTESSALA DA RODADA — o que vai cair, dito ANTES de a partida começar.
 *
 * O DESENHO É O DO PROTÓTIPO APROVADO (`T.antessala` de `docs/prototipos/consistencia-telas.html`,
 * com as camadas das rodadas 10–12): cabeçalho com "Como se joga", o cartão-herói com a arte do
 * jogo flutuando e o que ele treina, o cartão "Nível · foco" que abre os chips, o progresso neste
 * jogo, os quatro ladrilhos, "Por que estas?" com a lista que abre, as fases jogadas e o pé fixo
 * com o Jogar brilhando. A marcação é a dele; o CSS vem gerado dele (`src/styles/prototipo.css`).
 *
 * O QUE CONTINUA DE ANTES, porque é recurso real: a lista só recebe o que `core/minigames/revelavel`
 * autoriza (a antessala não entrega a resposta do Termo nem do Ditado), a repetição da rodada
 * passada é medida e dita em número, as fases paginam e rejogam os refs exatos, o Auto diz o
 * motivo, e as palavras difíceis (leeches) têm a rodada de resgate.
 *
 * ESTA TELA NÃO DECIDE SE É TELA CHEIA: quem a monta (Play.tsx) escolhe a moldura.
 */

/** Como aquele item foi da última vez. Vem de `GET /api/exercises/historico`. */
export interface HistoricoDoItem {
  vezes: number;
  erros: number;
  ultimoAcerto: boolean;
  /** Quando caiu pela última vez. */
  ultimaEm?: number;
}

type FaixaDeDificuldade = FaixaDificuldade;
type Estrategia = EstrategiaDaUI;

/**
 * Filtro de dificuldade da rodada (Z1). `null` quando o jogo não é de modalidade `palavra` — os de
 * frase jogam sobre falas, que não têm dificuldade por palavra. Chip inerte ensina que a tela mente.
 */
interface FiltroDificuldade {
  faixas: FaixaDeDificuldade[];
  estrategia: Estrategia;
  aoTrocarFaixa: (f: FaixaDeDificuldade) => void;
  aoTrocarEstrategia: (e: Estrategia) => void;
  /** Quantos itens existem em cada faixa no recorte atual. */
  disponivelPorFaixa: { facil: number; medio: number; dificil: number };
  /** Mínimo do jogo — abaixo disso o chip fica desabilitado COM O MOTIVO. */
  minimoDoJogo: number;
  origemDaComposicao: 'servidor' | 'fallback-local';
}

interface AntessalaProps {
  titulo: string;
  /** Id do jogo — liga a arte, o "Treina", a regra, os recordes e o colecionável. */
  gameId?: string;
  filtroDificuldade?: FiltroDificuldade | null;
  itens: ItemDaAntessala[];
  historico: Map<string, HistoricoDoItem>;
  /** Palavras/falas vencidas no agendador. */
  vencidos: ReadonlySet<string>;
  /** Quantos itens desta rodada já caíram na rodada ANTERIOR deste jogo. */
  repetidos: number;
  ageProfile: AgeProfileType;
  /** De onde vem esta rodada, já redigido pelo lobby (`rotuloDaFonte`). */
  fonte?: { rotulo: string; idioma?: string };
  /** Estimativa de duração, quando MEDIDA. `null` vira "rodada curta" — nunca um minuto chutado. */
  duracao?: string | null;
  /** As FASES já jogadas deste jogo nesta fonte, mais recente primeiro. */
  fases?: FaseJogada[];
  /** Remonta a rodada com os itens exatos de uma fase passada. */
  onJogarFase?: (refs: string[]) => void;
  /** Uma AMOSTRA (já passada pelo funil anti-spoiler) do que caiu numa fase. */
  amostraDaFase?: (refs: string[]) => { textos: string[]; total: number };
  /** Tamanho do acervo da fonte — o denominador do "% do vocabulário já enfrentado". */
  acervoTotal?: number;
  /** Quantos itens distintos do acervo a pessoa já jogou (o numerador). */
  itensJogados?: number;
  /** Estado de memória de cada item da rodada (tag + motivo) — o "por que estas?". */
  estados?: ReadonlyMap<string, EstadoDoItem>;
  /** Nível GERAL do app, para dizer a próxima recompensa. */
  nivelGeral?: number;
  /** MAESTRIA deste jogo (recompensas v2): os pontos do servidor. `null`/ausente = sem barra. */
  maestria?: { pontos: number } | null;
  /** Itens do acervo marcados como difíceis para você e a rodada de resgate. */
  leeches?: string[];
  onResgate?: (() => void) | null;
  /** Decisão do modo Auto (faixa + motivo), ou null quando o filtro é manual/não se aplica. */
  auto?: { faixa: FaixaDificuldade; motivo: string } | null;
  /** Termo: quantas palavras ficaram fora e por quê. */
  diagnosticoTermo?: { jogaveis: number; foraPor: Record<string, number> } | null;
  /** Etapa da trilha que recorta esta rodada. */
  etapa?: string | null;
  /** `null` quando não há rodada anterior deste jogo nesta fonte. */
  onRepetir: (() => void) | null;
  onTrocar: () => void;
  onJogar: () => void;
  /** Volta para Jogar sem jogar. */
  onSair: () => void;
  /** Abre "Como se joga" deste jogo. */
  onComoSeJoga?: () => void;
  /** Estado do "começar direto da próxima vez". */
  pularSempre: boolean;
  onMudarPularSempre: (v: boolean) => void;
}

/** Teto da lista: acima disto a prévia vira parede de texto. O excedente é ANUNCIADO. */
const MAX_VISIVEL = 24;
/** Fases por página da tabela. */
const FASES_POR_PAGINA = 6;

/** Estado de um item na rodada. A ordem de teste é a prioridade: vencido ganha de tudo. */
type Selo = { texto: string; tom: 'acc' | 'ok' | 'warn' | 'rare'; title?: string };

function seloDoItem(ref: string, historico: Map<string, HistoricoDoItem>, vencidos: ReadonlySet<string>): Selo {
  if (vencidos.has(ref)) return { texto: 'vencida', tom: 'rare', title: 'Passou da hora de revisar' };
  const h = historico.get(ref);
  if (!h) return { texto: 'nova', tom: 'acc', title: 'Você ainda não viu esta' };
  // A marca de erro só vale enquanto o erro não foi resolvido.
  if (h.erros > 0 && !h.ultimoAcerto) {
    return { texto: 'você errou', tom: 'warn', title: `${h.erros} erro(s) em ${h.vezes} tentativa(s)` };
  }
  return { texto: 'já viu', tom: 'ok', title: `Você já jogou esta ${h.vezes}x` };
}

/** "há 3 dias" em vez de um carimbo de data: o que importa aqui é a DISTÂNCIA. */
function quandoCaiu(ultimaEm?: number): string | null {
  if (!ultimaEm) return null;
  const dias = Math.floor((Date.now() - ultimaEm) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

const FAIXAS: Array<{ id: FaixaDeDificuldade; rotulo: string }> = [
  { id: 'facil', rotulo: 'Fácil' },
  { id: 'medio', rotulo: 'Médio' },
  { id: 'dificil', rotulo: 'Difícil' },
];
const ESTRATEGIAS: Array<[Estrategia, string]> = [
  ['auto', 'Auto'],
  ['equilibrado', 'Equilibrado'],
  ['recentes', 'Recentes'],
  ['frequentes', 'Mais vistas'],
  ['em-dificuldade', 'Errando'],
];

export default function AntessalaDaRodada({
  titulo,
  gameId,
  filtroDificuldade,
  itens,
  historico,
  vencidos,
  repetidos,
  ageProfile,
  fonte,
  duracao,
  fases,
  onJogarFase,
  amostraDaFase,
  acervoTotal,
  itensJogados,
  estados,
  leeches,
  nivelGeral,
  maestria,
  onResgate,
  auto,
  diagnosticoTermo,
  etapa,
  onRepetir,
  onTrocar,
  onJogar,
  onSair,
  onComoSeJoga,
  pularSempre,
  onMudarPularSempre,
}: AntessalaProps) {
  /* Recordes DESTE jogo — best-effort: sem histórico, o cartão de progresso simplesmente não aparece. */
  const [recorde, setRecorde] = useState<RecordeDoJogo | null>(null);
  const [paginaDeFases, setPaginaDeFases] = useState(0);
  const [nivelAberto, setNivelAberto] = useState(false);
  /* META QUEST: o desenho do headset (ver o ramo antes do `return`), e "Como funciona a repetição"
     num botão que abre e fecha (no computador é um `<details>`). */
  const questNovo = useQuestNovo();
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  useEffect(() => {
    setPaginaDeFases(0);
  }, [gameId]);
  useEffect(() => {
    if (!gameId) return;
    void fetchRecordes().then((rs) => setRecorde(rs.find((r) => r.exerciseKind === gameId) ?? null));
  }, [gameId]);
  const vistos = eventosVistos().length;
  const totalEventos = todosOsEventos().length;

  /** O SALDO em número — é ele que denuncia a rodada repetida. */
  const saldo = useMemo(() => {
    let novos = 0,
      jaVistos = 0,
      devidos = 0;
    for (const it of itens) {
      if (vencidos.has(it.ref)) devidos++;
      if (historico.has(it.ref)) jaVistos++;
      else novos++;
    }
    return { total: itens.length, novos, vistos: jaVistos, devidos };
  }, [itens, historico, vencidos]);

  const porMotivo = useMemo(() => {
    const c = { errando: 0, novas: 0, aprendendo: 0, firmes: 0, leech: 0 };
    for (const it of itens) {
      const e = estados?.get(it.ref);
      if (!e) continue;
      if (e.tag === 'errando') c.errando++;
      else if (e.tag === 'nova') c.novas++;
      else if (e.tag === 'aprendendo') c.aprendendo++;
      else if (e.tag === 'firme') c.firmes++;
      else if (e.tag === 'leech') c.leech++;
    }
    return c;
  }, [itens, estados]);
  /* A lista nasce aberta quando há algo que pede atenção (erro voltando / difícil para você). */
  const [itensAbertos, setItensAbertos] = useState(porMotivo.errando > 0 || porMotivo.leech > 0);

  const visiveis = itens.slice(0, MAX_VISIVEL);
  const vazia = itens.length === 0;

  /* A LISTA SÓ SE PAGA QUANDO AS LINHAS DIFEREM (por maioria): nos jogos que não podem revelar
     nada, oito linhas "N letras · vencida" não ajudam a decidir — aí vira um resumo em duas linhas. */
  const informativos = itens.filter((i) => (i.titulo && i.titulo !== i.forma) || i.cefr || historico.has(i.ref)).length;
  const listaInforma = itens.length > 0 && informativos * 2 >= itens.length;
  const tamanhos = itens.map((i) => i.tamanho).filter((n): n is number => typeof n === 'number' && n > 0);
  const faixaDeTamanho = tamanhos.length
    ? {
        min: Math.min(...tamanhos),
        max: Math.max(...tamanhos),
        unidade: itens[0]?.forma?.includes('palavra') ? 'palavras' : 'letras',
      }
    : null;

  const rotuloTotal: Record<AgeProfileType, string> = {
    kids: 'Nesta rodada',
    pro: 'Itens na rodada',
    senior: 'Nesta rodada',
  };
  const rotuloNovos: Record<AgeProfileType, string> = {
    kids: 'Você nunca viu',
    pro: 'Inéditos',
    senior: 'Novas para você',
  };
  const rotuloVistos: Record<AgeProfileType, string> = {
    kids: 'Você já jogou',
    pro: 'Já vistos',
    senior: 'Já viu antes',
  };
  const rotuloVencidos: Record<AgeProfileType, string> = {
    kids: 'Pedindo revisão',
    pro: 'Vencidos',
    senior: 'Para repetir hoje',
  };
  const txtJogar: Record<AgeProfileType, string> = { kids: 'Bora jogar', pro: 'Jogar', senior: 'Começar' };
  const txtTrocar: Record<AgeProfileType, string> = {
    kids: 'Trocar por outras',
    pro: 'Trocar por outras',
    senior: 'Trocar por outras palavras',
  };
  const txtRepetir: Record<AgeProfileType, string> = {
    kids: 'Repetir a última',
    pro: 'Repetir a última',
    senior: 'Repetir a rodada anterior',
  };
  const txtPular: Record<AgeProfileType, string> = {
    kids: 'Começar direto da próxima vez',
    pro: 'Começar direto da próxima vez',
    senior: 'Da próxima vez, começar direto',
  };
  const txtVazia: Record<AgeProfileType, string> = {
    kids: 'Não sobrou nada para jogar agora. Tente trocar.',
    pro: 'Nenhum item elegível para esta rodada.',
    senior: 'Não há palavras disponíveis agora. Tente trocar.',
  };

  const como = gameId ? COMO_SE_JOGA[gameId as MinigameId] : undefined;
  const sub = [
    `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} na rodada`,
    fonte?.rotulo,
    fonte?.idioma ? `do ${fonte.idioma}` : null,
    duracao || 'rodada curta',
  ]
    .filter(Boolean)
    .join(' · ');

  /* O resumo do nível: as faixas escolhidas, ou a que o Auto decidiu — nunca a palavra "automático" sozinha. */
  const resumoDoNivel = (() => {
    if (!filtroDificuldade) return '';
    const escolhidas = FAIXAS.filter((f) => filtroDificuldade.faixas.includes(f.id));
    if (escolhidas.length && escolhidas.length < FAIXAS.length) return escolhidas.map((f) => f.rotulo).join(', ');
    if (auto) return `${FAIXAS.find((f) => f.id === auto.faixa)?.rotulo ?? auto.faixa} (automático)`;
    return 'Todos';
  })();

  const progresso = gameId && recorde ? nivelNoJogo(recorde.rodadas) : null;
  const pctVocab =
    acervoTotal && acervoTotal > 0 ? Math.min(100, Math.round(((itensJogados ?? 0) / acervoTotal) * 100)) : null;
  const proxima = nivelGeral != null ? proximaRecompensa(nivelGeral) : null;

  const paginas = fases?.length ? Math.ceil(fases.length / FASES_POR_PAGINA) : 0;
  const pagina = Math.min(paginaDeFases, Math.max(0, paginas - 1));
  const daPagina = fases?.slice(pagina * FASES_POR_PAGINA, pagina * FASES_POR_PAGINA + FASES_POR_PAGINA) ?? [];

  /* ── META QUEST (segunda rodada, 01/10/2026) ─────────────────────────────────────────────────────
     A mesma antessala nas peças do headset: o que o jogo treina e os quatro números lado a lado, nível
     e foco numa linha de ajuste, "Por que estas?" com os motivos em pílulas e a lista numa tabela de
     linhas altas, as fases com "Repetir" por linha. As ações ficam FIXAS na faixa de baixo, com um único
     botão principal (Jogar), para não se perderem quando o miolo rola. Tudo o que aparece é o que foi
     calculado acima; os motivos que no computador moram no `title` aqui são escritos. */
  if (questNovo) {
    const nomeCurto = titulo.split(/[:(]/)[0].trim();
    const rotuloDaFaixa = (id: string) => t(FAIXAS.find((f) => f.id === id)?.rotulo ?? id);
    const rotuloDoFoco = (id: string) => t(ESTRATEGIAS.find(([e]) => e === id)?.[1] ?? id);
    return (
      <div className="qj qj-coluna" data-testid="antessala-do-quest">
        <div className="q-palco tela qj-tela quest-ante">
          <div className="q-cab">
            <VoltarDoQuest rotulo={t('Voltar para Jogar')} aoClicar={onSair} />
            <div>
              <p className="q-sobre">{t('Antes de começar')}</p>
              <h1>{titulo}</h1>
            </div>
            {onComoSeJoga && (
              <button type="button" className="q-chip" aria-haspopup="dialog" onClick={onComoSeJoga}>
                <CircleHelp aria-hidden /> {t('Como se joga')}
              </button>
            )}
          </div>

          <div className="qj-chips">
            <span className="q-chip">{tp(itens.length, '{n} item na rodada', '{n} itens na rodada')}</span>
            {fonte?.rotulo && <span className="q-chip">{fonte.rotulo}</span>}
            {fonte?.idioma && <span className="q-chip">{fonte.idioma}</span>}
            <span className="q-chip">{duracao || t('rodada curta')}</span>
            {etapa && <span className="q-chip">{etapa}</span>}
          </div>

          <div className="qj-ante-topo">
            <section className="q-cartao qj-heroi">
              <span className="qj-arte" aria-hidden>
                {gameId && <IconePixel id={gameId as MinigameId} className="" />}
              </span>
              <div>
                <p className="q-rotulo">{t('Treina')}</p>
                <h2>{t(como?.treina ?? 'Reconhecer e lembrar palavras.')}</h2>
                <p className="qj-nota">{regraDaRodada(gameId)}</p>
              </div>
            </section>
            <div className="q-grade g2 qj-saldo">
              <div className="q-num">
                <b>{saldo.total}</b>
                <span>{t(rotuloTotal[ageProfile])}</span>
              </div>
              <div className="q-num" data-tom="acento">
                <b>{saldo.novos}</b>
                <span>{t(rotuloNovos[ageProfile])}</span>
              </div>
              <div className="q-num" data-tom="bom">
                <b>{saldo.vistos}</b>
                <span>{t(rotuloVistos[ageProfile])}</span>
              </div>
              <div className="q-num" data-tom="alerta">
                <b>{saldo.devidos}</b>
                <span>{t(rotuloVencidos[ageProfile])}</span>
              </div>
            </div>
          </div>

          {maestria && gameId && (
            <section className="q-cartao">
              <BarraDeMaestria jogo={gameId as MinigameId} pontos={maestria.pontos} />
            </section>
          )}

          {/* NÍVEL · FOCO: recolhido, dizendo o que está valendo. Só nos jogos de palavra. */}
          {filtroDificuldade && (
            <section className="q-secao" data-secao="nivel">
              <div className="q-ajuste">
                <div>
                  <b>
                    {t('Nível: {nivel} · foco: {foco}', {
                      nivel: (() => {
                        const escolhidas = FAIXAS.filter((f) => filtroDificuldade.faixas.includes(f.id));
                        if (escolhidas.length && escolhidas.length < FAIXAS.length)
                          return escolhidas.map((f) => t(f.rotulo)).join(', ');
                        if (auto) return t('{faixa} (automático)', { faixa: rotuloDaFaixa(auto.faixa) });
                        return t('Todos');
                      })(),
                      foco: rotuloDoFoco(filtroDificuldade.estrategia),
                    })}
                  </b>
                  {auto && filtroDificuldade.estrategia === 'auto' && (
                    <small>
                      {t('Auto escolheu {faixa}: {motivo}', {
                        faixa: rotuloDaFaixa(auto.faixa).toLowerCase(),
                        motivo: auto.motivo,
                      })}
                    </small>
                  )}
                </div>
                <button
                  type="button"
                  className="q-ctl"
                  aria-expanded={nivelAberto}
                  onClick={() => setNivelAberto((v) => !v)}
                >
                  <SlidersHorizontal aria-hidden /> {nivelAberto ? t('Fechar') : t('Trocar')}
                </button>
              </div>
              {nivelAberto && (
                <div className="q-cartao">
                  <div className="q-secao">
                    <p className="q-rotulo">{t('Nível')}</p>
                    <OpcoesDoQuest
                      rotulo={t('Dificuldade das palavras desta rodada')}
                      valor={filtroDificuldade.faixas}
                      aoTrocar={(f) => filtroDificuldade.aoTrocarFaixa(f as FaixaDeDificuldade)}
                      opcoes={FAIXAS.map((f) => {
                        const n = filtroDificuldade.disponivelPorFaixa[f.id];
                        const nome = t(f.rotulo).toLowerCase();
                        return {
                          id: f.id,
                          rotulo: t(f.rotulo),
                          contagem: n,
                          motivoBloqueio:
                            n === 0
                              ? t('nenhuma palavra de nível {nivel} neste recorte', { nivel: nome })
                              : n < filtroDificuldade.minimoDoJogo
                                ? t('só {n} de nível {nivel}; este jogo precisa de {minimo}', {
                                    n,
                                    nivel: nome,
                                    minimo: filtroDificuldade.minimoDoJogo,
                                  })
                                : undefined,
                        };
                      })}
                    />
                  </div>
                  <div className="q-secao">
                    <p className="q-rotulo">{t('Foco')}</p>
                    <OpcoesDoQuest
                      rotulo={t('Foco da rodada')}
                      exclusiva
                      valor={[filtroDificuldade.estrategia]}
                      aoTrocar={(e) => filtroDificuldade.aoTrocarEstrategia(e as Estrategia)}
                      opcoes={ESTRATEGIAS.map(([id, rotulo]) => ({ id, rotulo: t(rotulo) }))}
                    />
                    {filtroDificuldade.origemDaComposicao === 'fallback-local' && (
                      <p className="qj-nota">{t('Seleção montada no seu dispositivo (sem conexão com o servidor).')}</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* SEU PROGRESSO NESTE JOGO: só com histórico. */}
          {recorde && progresso && (
            <section className="q-cartao" data-secao="progresso">
              <div className="qj-entre">
                <div>
                  <p className="q-rotulo">{t('Seu progresso neste jogo')}</p>
                  <h2>{t('Nível {n} no {jogo}', { n: progresso.nivel, jogo: nomeCurto })}</h2>
                </div>
                <span className="qj-nota">
                  {[
                    t('melhor {n}', { n: formatar(recorde.melhorPontos) }),
                    (recorde.melhorCombo ?? 0) > 0 ? t('combo ×{n}', { n: recorde.melhorCombo ?? 0 }) : null,
                    recorde.precisao != null ? `${recorde.precisao}%` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <div
                className="q-barra"
                role="progressbar"
                aria-label={t('Progresso do nível')}
                aria-valuenow={progresso.noNivel}
                aria-valuemax={progresso.porNivel}
              >
                <span style={{ width: `${progresso.pct}%` }} />
              </div>
              <p className="qj-nota">
                {[
                  t('{n} de {total} rodadas para o nível {proximo}', {
                    n: progresso.noNivel,
                    total: progresso.porNivel,
                    proximo: progresso.nivel + 1,
                  }),
                  proxima
                    ? t('próxima recompensa: {nome} no nível {nivel}', {
                        nome: proxima.destaque.nome,
                        nivel: proxima.nivel,
                      })
                    : null,
                  tp(recorde.rodadas, '{n} rodada jogada', '{n} rodadas jogadas'),
                  pctVocab != null ? t('{n}% do vocabulário já enfrentado', { n: pctVocab }) : null,
                  t('eventos raros: {a}/{b}', { a: vistos, b: totalEventos }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </section>
          )}

          {vazia ? (
            <div className="q-vazio">
              <span className="q-ic" aria-hidden>
                <Shuffle />
              </span>
              <h2>{t('Rodada vazia')}</h2>
              <p>{t(txtVazia[ageProfile])}</p>
            </div>
          ) : (
            <section className="q-secao" data-secao="porque">
              <header>
                <div>
                  <h2>{t('Por que estas?')}</h2>
                </div>
              </header>
              <div className="qj-chips">
                {porMotivo.errando > 0 && (
                  <span className="q-chip" data-tom="alerta">
                    <RotateCcw aria-hidden />{' '}
                    {tp(porMotivo.errando, '{n} voltando porque você errou', '{n} voltando porque você errou')}
                  </span>
                )}
                {saldo.devidos > 0 && (
                  <span className="q-chip" data-tom="acento">
                    <Target aria-hidden /> {tp(saldo.devidos, '{n} vencida', '{n} vencidas')}
                  </span>
                )}
                {saldo.novos > 0 && (
                  <span className="q-chip">
                    <Sparkle aria-hidden /> {tp(saldo.novos, '{n} nova', '{n} novas')}
                  </span>
                )}
                {porMotivo.aprendendo > 0 && (
                  <span className="q-chip" data-tom="bom">
                    <Check aria-hidden /> {t('{n} em aprendizado', { n: porMotivo.aprendendo })}
                  </span>
                )}
                {porMotivo.firmes > 0 && (
                  <span className="q-chip">
                    {tp(porMotivo.firmes, '{n} firme (completando)', '{n} firmes (completando)')}
                  </span>
                )}
                {repetidos > 0 && (
                  <span className="q-chip" data-tom={repetidos === saldo.total ? 'alerta' : undefined}>
                    <History aria-hidden />{' '}
                    {repetidos === saldo.total ? t('rodada repetida') : tp(repetidos, '{n} repete', '{n} repetem')}
                  </span>
                )}
              </div>
              {/* A DENÚNCIA DA REPETIÇÃO, em número. */}
              {repetidos > 0 && (
                <p className="qj-nota">
                  {tp(
                    repetidos,
                    '{n} item de {total} já caiu na sua última rodada deste jogo',
                    '{n} itens de {total} já caíram na sua última rodada deste jogo',
                    { total: saldo.total },
                  )}
                  {repetidos === saldo.total ? t(', é a mesma rodada.') : '.'}
                </p>
              )}
              {auto && filtroDificuldade && filtroDificuldade.faixas.length > 0 && (
                <p className="qj-nota">
                  <b>{t('No automático seria:')}</b> {auto.motivo}
                </p>
              )}
              {diagnosticoTermo && Object.values(diagnosticoTermo.foraPor).some((n) => n > 0) && (
                <p className="qj-nota">
                  {t('Fora do Termo:')}{' '}
                  {Object.entries(diagnosticoTermo.foraPor)
                    .filter(([, n]) => n > 0)
                    .map(
                      ([k, n]) =>
                        `${n} ${t(k === 'hifen-ou-espaco' ? 'com hífen/espaço' : k === 'curta' ? 'curtas demais' : k === 'longa' ? 'longas demais' : 'sem pista útil')}`,
                    )
                    .join(' · ')}
                  .
                </p>
              )}
              {leeches && leeches.length > 0 && (
                <div className="q-aviso qj-alerta">
                  <span>
                    <b>{tp(leeches.length, '{n} palavra difícil para você', '{n} palavras difíceis para você')}.</b>{' '}
                    {t(
                      'Saíram da rotação depois de {n} erros seguidos. Voltam numa rodada só delas, com ajuda liberada.',
                      { n: LEECH_APOS },
                    )}
                  </span>
                  {onResgate && (
                    <button type="button" className="q-ctl" onClick={onResgate}>
                      <LifeBuoy aria-hidden /> {t('Rodada de resgate')}
                    </button>
                  )}
                </div>
              )}
              <div className="q-acoes">
                {listaInforma && (
                  <button
                    type="button"
                    className="q-chip"
                    aria-expanded={itensAbertos}
                    onClick={() => setItensAbertos((v) => !v)}
                  >
                    {itensAbertos ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
                    {itensAbertos
                      ? tp(itens.length, 'Esconder o item', 'Esconder os {n} itens')
                      : tp(itens.length, 'Ver o item', 'Ver os {n} itens')}
                  </button>
                )}
                <button
                  type="button"
                  className="q-chip"
                  aria-expanded={regrasAbertas}
                  onClick={() => setRegrasAbertas((v) => !v)}
                >
                  <CircleHelp aria-hidden /> {t('Como funciona a repetição e a dificuldade')}
                </button>
              </div>
              {regrasAbertas && (
                <ul className="qj-regras">
                  <li>
                    {t('Cada palavra ou frase tem uma memória única em todos os jogos: nova → em aprendizado → firme.')}
                  </li>
                  <li>
                    {t(
                      'Errou? Ela volta espaçada: 1º erro em {a} rodadas, 2º seguido em {b}, 3º só no dia seguinte. Um acerto zera a contagem.',
                      { a: JANELAS_DE_RETORNO[0], b: JANELAS_DE_RETORNO[1] },
                    )}
                  </li>
                  <li>
                    {t(
                      '{n} erros seguidos marcam a palavra como difícil para você: ela sai do sorteio comum e volta na rodada de resgate.',
                      { n: LEECH_APOS },
                    )}
                  </li>
                  <li>{t('Cada rodada garante pelo menos 30% de itens novos; vencidas no agendador vêm antes.')}</li>
                  <li>
                    {t(
                      'Cada jogo tem a própria rotação: o mesmo acervo não rende as mesmas palavras em todos os jogos no mesmo dia.',
                    )}
                  </li>
                  <li>
                    {t(
                      'Dificuldade automática mira {min}-{max}% de acerto: sobe ou desce um degrau a cada {n} rodadas. Os chips de nível assumem o controle quando você quiser.',
                      { min: ALVO_MIN, max: ALVO_MAX, n: JANELA_DE_RODADAS },
                    )}
                  </li>
                </ul>
              )}
              {listaInforma ? (
                itensAbertos && (
                  <>
                    <div className="q-tabela-caixa" tabIndex={0} role="region" aria-label={t('Itens da rodada')}>
                      <table className="q-tabela">
                        <thead>
                          <tr>
                            <th>{t('Item')}</th>
                            <th>{t('Última vez')}</th>
                            <th>{t('Estado')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visiveis.map((item) => {
                            const selo = seloDoItem(item.ref, historico, vencidos);
                            const quando = quandoCaiu(historico.get(item.ref)?.ultimaEm);
                            const motivo = estados?.get(item.ref)?.motivo;
                            const apoio = [
                              item.pista,
                              item.forma && item.forma !== item.titulo ? item.forma : null,
                              item.cefr,
                              motivo && motivo !== 'já viu' && motivo !== 'nova para você' ? motivo : null,
                            ]
                              .filter(Boolean)
                              .join(' · ');
                            return (
                              <tr key={item.ref}>
                                <td className="qj-item">
                                  <b>{item.titulo}</b>
                                  {apoio && <small>{apoio}</small>}
                                </td>
                                <td>{quando ? t(quando) : t('nunca caiu')}</td>
                                <td className="qj-item">
                                  <span className="q-tag" data-tom={selo.tom}>
                                    {t(selo.texto)}
                                  </span>
                                  {/* O porquê do selo (no computador é a dica ao parar o ponteiro). */}
                                  {selo.title && <small>{selo.title}</small>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {itens.length > MAX_VISIVEL && (
                      <p className="qj-nota">
                        {t('mostrando {n} de {total}, o resto entra na mesma rodada', {
                          n: MAX_VISIVEL,
                          total: itens.length,
                        })}
                      </p>
                    )}
                  </>
                )
              ) : (
                /* Este jogo esconde o conteúdo por definição e não há histórico para diferenciar as linhas. */
                <p className="qj-nota">
                  {faixaDeTamanho
                    ? t('{n} {coisas}, de {min} a {max} {unidade}', {
                        n: itens.length,
                        coisas: faixaDeTamanho.unidade === 'palavras' ? t('falas') : t('palavras'),
                        min: faixaDeTamanho.min,
                        max: faixaDeTamanho.max,
                        unidade: t(faixaDeTamanho.unidade),
                      })
                    : tp(itens.length, '{n} item', '{n} itens')}
                  {saldo.novos === itens.length ? t(', todas inéditas para você.') : '.'}{' '}
                  {t('Este jogo esconde o conteúdo até você jogar: mostrar aqui entregaria a resposta.')}
                </p>
              )}
            </section>
          )}

          {/* SUAS FASES: cada linha rejoga os itens exatos daquela rodada. */}
          {fases && fases.length > 0 && onJogarFase && (
            <section className="q-secao" data-secao="fases">
              <header>
                <div>
                  <h2>{t('Suas fases neste jogo')}</h2>
                  <p>{t('"Repetir" joga a fase de novo com exatamente as mesmas palavras.')}</p>
                </div>
                {paginas > 1 && (
                  <nav className="q-acoes" aria-label={t('Páginas das fases')}>
                    <button
                      type="button"
                      className="q-ctl"
                      onClick={() => setPaginaDeFases((p) => Math.max(0, p - 1))}
                      disabled={pagina === 0}
                      aria-label={t('Página anterior')}
                    >
                      <ChevronLeft aria-hidden />
                    </button>
                    <span className="q-tempo" aria-live="polite">
                      {pagina + 1} / {paginas}
                    </span>
                    <button
                      type="button"
                      className="q-ctl"
                      onClick={() => setPaginaDeFases((p) => Math.min(paginas - 1, p + 1))}
                      disabled={pagina >= paginas - 1}
                      aria-label={t('Próxima página')}
                    >
                      <ChevronRight aria-hidden />
                    </button>
                  </nav>
                )}
              </header>
              <div className="q-tabela-caixa" tabIndex={0} role="region" aria-label={t('Fases jogadas')}>
                <table className="q-tabela">
                  <thead>
                    <tr>
                      <th>{t('Fase')}</th>
                      <th>{t('Pontos')}</th>
                      <th>{t('Estrelas')}</th>
                      <th>{t('Quando')}</th>
                      <th>{t('O que caiu')}</th>
                      <th>
                        <span className="sr">{t('Repetir')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {daPagina.map((f, idx) => {
                      const ordemDaFase = fases.length - (pagina * FASES_POR_PAGINA + idx);
                      const amostra = amostraDaFase?.(f.refs);
                      const podeRejogar = f.refs.length > 0;
                      const quando = quandoCaiu(f.quando);
                      return (
                        <tr key={f.roundId}>
                          <td>{ordemDaFase}</td>
                          <td>
                            <b>{f.pontos ? formatar(f.pontos) : '—'}</b>
                          </td>
                          <td className="qj-item">
                            <span
                              className="qj-estrelas"
                              role="img"
                              aria-label={t('{n} de 3 estrelas', { n: f.estrelas })}
                            >
                              {'★'.repeat(f.estrelas)}
                              <span aria-hidden>{'★'.repeat(3 - f.estrelas)}</span>
                            </span>
                            {/* O acerto da fase, escrito (no computador é a dica ao parar o ponteiro). */}
                            <small>{t('{n}% de acerto', { n: f.precisao })}</small>
                          </td>
                          <td>{quando ? t(quando) : '—'}</td>
                          <td className="qj-item">
                            {amostra && amostra.textos.length > 0 ? (
                              <>
                                {amostra.textos.join(', ')}
                                {amostra.total > amostra.textos.length && ` +${amostra.total - amostra.textos.length}`}
                              </>
                            ) : (
                              t('{a} de {b} nesta fase', { a: f.acertos, b: f.total })
                            )}
                            {/* O motivo do botão desligado é escrito (no computador ele mora no `title`). */}
                            {!podeRejogar && <small>{t('Esta rodada antiga não guardou as palavras')}</small>}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="q-ctl"
                              onClick={() => onJogarFase(f.refs)}
                              disabled={!podeRejogar}
                              aria-label={t('Repetir a fase {n}', { n: ordemDaFase })}
                            >
                              <RotateCcw aria-hidden /> {t('Repetir')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="q-faixa" role="toolbar" aria-label={t('Ações da rodada')}>
          <span className="qj-faixa-ajuste">
            <InterruptorDoQuest ligado={pularSempre} aoTrocar={onMudarPularSempre} rotulo={t(txtPular[ageProfile])} />
            <span aria-hidden>{t(txtPular[ageProfile])}</span>
          </span>
          <span className="q-espaco" />
          {onRepetir && (
            <button type="button" className="q-ctl" onClick={onRepetir}>
              <RotateCcw aria-hidden /> {t(txtRepetir[ageProfile])}
            </button>
          )}
          <button type="button" className="q-ctl" onClick={onTrocar}>
            <Shuffle aria-hidden /> {t(txtTrocar[ageProfile])}
          </button>
          <button type="button" className="q-ctl pri" onClick={onJogar} disabled={vazia}>
            <Play aria-hidden /> {t(txtJogar[ageProfile])}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        voltar={{ rotulo: 'Jogar', aoClicar: onSair }}
        sobrancelha="Antes de começar"
        icone={Gamepad2}
        titulo={titulo}
        sub={sub}
        acoes={
          onComoSeJoga && (
            <button type="button" className="btn btn-outline peq" onClick={onComoSeJoga}>
              <CircleHelp aria-hidden /> Como se joga
            </button>
          )
        }
      />

      <div className="cascata">
        {/* O HERÓI: a arte do jogo flutuando e o que ele treina, em uma frase. */}
        <section className="cartao ante-heroi">
          <span className="brilho" aria-hidden />
          <span className="arte-flutua" aria-hidden>
            {gameId && <IconePixel id={gameId as MinigameId} className="" />}
          </span>
          <div>
            <span className="label-mono">Treina</span>
            <h2 style={{ fontSize: 19, fontWeight: 900, margin: '2px 0 4px' }}>
              {como?.treina ?? 'Reconhecer e lembrar palavras.'}
            </h2>
            <p className="mut">{regraDaRodada(gameId)}</p>
          </div>
        </section>

        {maestria && gameId && (
          <section className="cartao p5">
            <BarraDeMaestria jogo={gameId as MinigameId} pontos={maestria.pontos} />
          </section>
        )}

        {/* NÍVEL · FOCO — recolhido, mas anunciando o que está valendo. Só nos jogos de palavra. */}
        {filtroDificuldade && (
          <section className="cartao p5">
            <div className="entre">
              <span>
                Nível: <b>{resumoDoNivel}</b> · foco:{' '}
                <b>
                  {ESTRATEGIAS.find(([id]) => id === filtroDificuldade.estrategia)?.[1] ?? filtroDificuldade.estrategia}
                </b>
              </span>
              <button
                type="button"
                className="link"
                aria-expanded={nivelAberto}
                onClick={() => setNivelAberto((v) => !v)}
              >
                <SlidersHorizontal aria-hidden /> {nivelAberto ? 'Fechar' : 'Trocar'}
              </button>
            </div>
            {nivelAberto && (
              <div className="pilha entra" style={{ marginTop: 14 }}>
                <div>
                  <span className="label-mono">Nível</span>
                  <div className="chips" role="group" aria-label="Dificuldade das palavras desta rodada">
                    {FAIXAS.map((f) => {
                      const n = filtroDificuldade.disponivelPorFaixa[f.id];
                      const insuficiente = n > 0 && n < filtroDificuldade.minimoDoJogo;
                      const motivo =
                        n === 0
                          ? `nenhuma palavra ${f.rotulo.toLowerCase()} neste recorte`
                          : insuficiente
                            ? `só ${n} ${f.rotulo.toLowerCase()}; este jogo precisa de ${filtroDificuldade.minimoDoJogo}`
                            : undefined;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className="pill"
                          aria-pressed={filtroDificuldade.faixas.includes(f.id)}
                          disabled={!!motivo}
                          title={motivo}
                          onClick={() => filtroDificuldade.aoTrocarFaixa(f.id)}
                        >
                          {f.rotulo}{' '}
                          <span className="n">{motivo ? <Lock aria-label={motivo} /> : `${n} disponíveis`}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <span className="label-mono">Foco</span>
                  <Segmentos
                    rotulo="Foco da rodada"
                    atual={filtroDificuldade.estrategia}
                    opcoes={ESTRATEGIAS}
                    aoTrocar={(e) => filtroDificuldade.aoTrocarEstrategia(e)}
                  />
                  {auto && filtroDificuldade.estrategia === 'auto' && (
                    <p className="mut" style={{ fontSize: 12.5, marginTop: 6 }}>
                      <Sparkles aria-hidden style={{ width: 13, height: 13, verticalAlign: -2 }} /> Auto escolheu{' '}
                      <b>{FAIXAS.find((f) => f.id === auto.faixa)?.rotulo.toLowerCase() ?? auto.faixa}</b>:{' '}
                      {auto.motivo}
                    </p>
                  )}
                  {filtroDificuldade.origemDaComposicao === 'fallback-local' && (
                    <p className="mut" style={{ fontSize: 12, marginTop: 6 }}>
                      Seleção montada no seu dispositivo (sem conexão com o servidor).
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* SEU PROGRESSO NESTE JOGO — só com histórico: para quem nunca jogou não há progresso a mentir. */}
        {recorde && progresso && (
          <section className="cartao p5 secao">
            <div className="entre">
              <div>
                <span className="label-mono">Seu progresso neste jogo</span>
                <h3 style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>
                  Nível {progresso.nivel} no {titulo.split(/[:(]/)[0].trim()}
                </h3>
              </div>
              <span className="mut tn" style={{ fontSize: 12.5 }}>
                melhor {recorde.melhorPontos}
                {(recorde.melhorCombo ?? 0) > 0 && ` · combo ×${recorde.melhorCombo}`}
                {recorde.precisao != null && ` · ${recorde.precisao}%`}
              </span>
            </div>
            <div
              className="barra"
              style={{ marginTop: 10 }}
              role="progressbar"
              aria-label="Progresso do nível"
              aria-valuenow={progresso.noNivel}
              aria-valuemax={progresso.porNivel}
            >
              <span style={{ width: `${progresso.pct}%` }} />
            </div>
            <p className="mut" style={{ fontSize: 12.5, marginTop: 8 }}>
              {progresso.noNivel} de {progresso.porNivel} rodadas para o nível {progresso.nivel + 1}
              {proxima && ` · próxima recompensa: ${proxima.destaque.nome} no nível ${proxima.nivel}`}
              {` · ${recorde.rodadas} ${recorde.rodadas === 1 ? 'rodada jogada' : 'rodadas jogadas'}`}
              {pctVocab != null && ` · ${pctVocab}% do vocabulário já enfrentado`}
              {` · eventos raros: ${vistos}/${totalEventos}`}
            </p>
          </section>
        )}

        <div className="ladrilhos secao">
          <div className="cartao ladrilho">
            <span className="label-mono">{rotuloTotal[ageProfile]}</span>
            <span className="v">{saldo.total}</span>
          </div>
          <div className="cartao ladrilho">
            <span className="label-mono">{rotuloNovos[ageProfile]}</span>
            <span className="v acc">{saldo.novos}</span>
          </div>
          <div className="cartao ladrilho">
            <span className="label-mono">{rotuloVistos[ageProfile]}</span>
            <span className="v good">{saldo.vistos}</span>
          </div>
          <div className="cartao ladrilho">
            <span className="label-mono">{rotuloVencidos[ageProfile]}</span>
            <span className="v warn">{saldo.devidos}</span>
          </div>
        </div>

        {vazia ? (
          <section className="cartao p5 secao">
            <p className="mut" style={{ fontSize: 13.5 }}>
              {txtVazia[ageProfile]}
            </p>
          </section>
        ) : (
          <section className="cartao p5 secao">
            <TituloDeSecao icone={CircleHelp} titulo="Por que estas?" />
            <div className="chips">
              {porMotivo.errando > 0 && (
                <span className="badge warn">
                  <RotateCcw aria-hidden /> {porMotivo.errando} voltando porque você errou
                </span>
              )}
              {saldo.devidos > 0 && (
                <span className="badge acc">
                  <Target aria-hidden /> {saldo.devidos} vencidas
                </span>
              )}
              {saldo.novos > 0 && (
                <span className="badge neu">
                  <Sparkle aria-hidden /> {saldo.novos} novas
                </span>
              )}
              {porMotivo.aprendendo > 0 && (
                <span className="badge ok">
                  <Check aria-hidden /> {porMotivo.aprendendo} em aprendizado
                </span>
              )}
              {porMotivo.firmes > 0 && <span className="badge neu">{porMotivo.firmes} firmes (completando)</span>}
              {etapa && <span className="badge acc">{etapa}</span>}
              {repetidos > 0 && (
                <span className={`badge ${repetidos === saldo.total ? 'warn' : 'neu'}`}>
                  <History aria-hidden /> {repetidos === saldo.total ? 'rodada repetida' : `${repetidos} repetem`}
                </span>
              )}
            </div>
            {/* A DENÚNCIA DA REPETIÇÃO, em número — a comparação já vem feita. */}
            {repetidos > 0 && (
              <p className="mut" style={{ fontSize: 13, marginTop: 10 }}>
                <b style={{ color: 'var(--ink)' }}>
                  {repetidos} {repetidos === 1 ? 'item' : 'itens'}
                </b>{' '}
                de {saldo.total} {repetidos === 1 ? 'já caiu' : 'já caíram'} na sua última rodada deste jogo
                {repetidos === saldo.total ? ', é a mesma rodada.' : '.'}
              </p>
            )}
            {auto && filtroDificuldade && filtroDificuldade.faixas.length > 0 && (
              <p className="mut" style={{ fontSize: 12.5, marginTop: 10 }}>
                <b style={{ color: 'var(--ink)' }}>No automático seria:</b> {auto.motivo}
              </p>
            )}
            {diagnosticoTermo && Object.values(diagnosticoTermo.foraPor).some((n) => n > 0) && (
              <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
                Fora do Termo:{' '}
                {Object.entries(diagnosticoTermo.foraPor)
                  .filter(([, n]) => n > 0)
                  .map(
                    ([k, n]) =>
                      `${n} ${k === 'hifen-ou-espaco' ? 'com hífen/espaço' : k === 'curta' ? 'curtas demais' : k === 'longa' ? 'longas demais' : 'sem pista útil'}`,
                  )
                  .join(' · ')}
                .
              </p>
            )}
            {leeches && leeches.length > 0 && (
              <div className="aviso-info warn" style={{ marginTop: 12 }}>
                <LifeBuoy aria-hidden />
                <span>
                  <b style={{ color: 'var(--ink)' }}>
                    {leeches.length}{' '}
                    {leeches.length === 1 ? 'palavra difícil para você' : 'palavras difíceis para você'}.
                  </b>{' '}
                  Saíram da rotação depois de {LEECH_APOS} erros seguidos. Voltam numa rodada só delas, com ajuda
                  liberada.
                </span>
                {onResgate && (
                  <button type="button" className="btn btn-outline peq" onClick={onResgate}>
                    <LifeBuoy aria-hidden /> Rodada de resgate
                  </button>
                )}
              </div>
            )}
            <details className="det" style={{ marginTop: 12 }}>
              <summary>Como funciona a repetição e a dificuldade</summary>
              <ul
                className="mut"
                style={{ fontSize: 13, marginTop: 8, maxWidth: '70ch', paddingLeft: 18, listStyle: 'disc' }}
              >
                <li>Cada palavra ou frase tem uma memória única em todos os jogos: nova → em aprendizado → firme.</li>
                <li>
                  Errou? Ela volta espaçada: 1º erro em {JANELAS_DE_RETORNO[0]} rodadas, 2º seguido em{' '}
                  {JANELAS_DE_RETORNO[1]}, 3º só no dia seguinte. Um acerto zera a contagem.
                </li>
                <li>
                  {LEECH_APOS} erros seguidos marcam a palavra como difícil para você: ela sai do sorteio comum e volta
                  na rodada de resgate.
                </li>
                <li>Cada rodada garante pelo menos 30% de itens novos; vencidas no agendador vêm antes.</li>
                <li>
                  Cada jogo tem a própria rotação: o mesmo acervo não rende as mesmas palavras em todos os jogos no
                  mesmo dia.
                </li>
                <li>
                  Dificuldade automática mira {ALVO_MIN}-{ALVO_MAX}% de acerto: sobe ou desce um degrau a cada{' '}
                  {JANELA_DE_RODADAS} rodadas. Os chips de nível assumem o controle quando você quiser.
                </li>
              </ul>
            </details>
            {listaInforma ? (
              <>
                <button
                  type="button"
                  className="link"
                  style={{ marginTop: 6 }}
                  aria-expanded={itensAbertos}
                  onClick={() => setItensAbertos((v) => !v)}
                >
                  {itensAbertos ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}{' '}
                  {itensAbertos ? 'Esconder' : 'Ver'} {itens.length === 1 ? 'o item' : `os ${itens.length} itens`}
                </button>
                {itensAbertos && (
                  <ul className="lista-mapa entra">
                    {visiveis.map((item) => {
                      const selo = seloDoItem(item.ref, historico, vencidos);
                      const quando = quandoCaiu(historico.get(item.ref)?.ultimaEm);
                      const motivo = estados?.get(item.ref)?.motivo;
                      const apoio = [
                        item.pista,
                        item.forma && item.forma !== item.titulo ? item.forma : null,
                        item.cefr,
                        motivo && motivo !== 'já viu' && motivo !== 'nova para você' ? motivo : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <li key={item.ref}>
                          <div style={{ minWidth: 0 }}>
                            <b title={item.titulo}>{item.titulo}</b>
                            {apoio && <small className="mut">{apoio}</small>}
                          </div>
                          <span className="mut tn" style={{ fontSize: 12 }}>
                            {quando ?? 'nunca caiu'}
                          </span>
                          <span className={`badge ${selo.tom}`} title={selo.title}>
                            {selo.texto}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {itensAbertos && itens.length > MAX_VISIVEL && (
                  <p className="mut" style={{ fontSize: 12, marginTop: 8 }}>
                    mostrando {MAX_VISIVEL} de {itens.length}, o resto entra na mesma rodada
                  </p>
                )}
              </>
            ) : (
              /* Este jogo esconde o conteúdo por definição e não há histórico para diferenciar as linhas. */
              <p className="mut" style={{ fontSize: 13, marginTop: 10, maxWidth: '62ch' }}>
                <b style={{ color: 'var(--ink)' }}>{itens.length}</b>{' '}
                {faixaDeTamanho ? (
                  <>
                    {faixaDeTamanho.unidade === 'palavras' ? 'falas' : 'palavras'}, de <b>{faixaDeTamanho.min}</b> a{' '}
                    <b>{faixaDeTamanho.max}</b> {faixaDeTamanho.unidade}
                  </>
                ) : (
                  'itens'
                )}
                {saldo.novos === itens.length ? ', todas inéditas para você.' : '.'} Este jogo esconde o conteúdo até
                você jogar: mostrar aqui entregaria a resposta.
              </p>
            )}
          </section>
        )}

        {/* SUAS FASES — tabela paginada; cada linha rejoga os refs exatos daquela rodada. */}
        {fases && fases.length > 0 && onJogarFase && (
          <section className="cartao p5 secao">
            <TituloDeSecao
              icone={History}
              titulo="Suas fases neste jogo"
              desc="Clique numa fase para repetir exatamente as mesmas palavras."
              direita={
                paginas > 1 && (
                  <nav className="linha" style={{ gap: 6 }} aria-label="Páginas das fases">
                    <button
                      type="button"
                      className="btn btn-outline peq"
                      onClick={() => setPaginaDeFases((p) => Math.max(0, p - 1))}
                      disabled={pagina === 0}
                      aria-label="Página anterior"
                    >
                      <ChevronLeft aria-hidden />
                    </button>
                    <span className="mut tn" style={{ fontSize: 12.5 }} aria-live="polite">
                      {pagina + 1}/{paginas}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline peq"
                      onClick={() => setPaginaDeFases((p) => Math.min(paginas - 1, p + 1))}
                      disabled={pagina >= paginas - 1}
                      aria-label="Próxima página"
                    >
                      <ChevronRight aria-hidden />
                    </button>
                  </nav>
                )
              }
            />
            <div className="tabela-rola" tabIndex={0} role="region" aria-label="Fases jogadas">
              <table className="tabela compacta">
                <thead>
                  <tr>
                    <th className="label-mono">Fase</th>
                    <th className="label-mono tn">Pontos</th>
                    <th className="label-mono">Estrelas</th>
                    <th className="label-mono">Quando</th>
                    <th className="label-mono col-extra">O que caiu</th>
                    <th>
                      <span className="sr-only">Repetir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {daPagina.map((f, idx) => {
                    const numero = fases.length - (pagina * FASES_POR_PAGINA + idx);
                    const amostra = amostraDaFase?.(f.refs);
                    const podeRejogar = f.refs.length > 0;
                    return (
                      <tr key={f.roundId}>
                        <td className="tn">{numero}</td>
                        <td className="tn">
                          <b>{f.pontos || '—'}</b>
                        </td>
                        <td
                          aria-label={`${f.estrelas} de 3 estrelas`}
                          title={`${f.estrelas} de 3 (${f.precisao}% de acerto)`}
                        >
                          {'★'.repeat(f.estrelas)}
                          <span style={{ opacity: 0.25 }}>{'★'.repeat(3 - f.estrelas)}</span>
                        </td>
                        <td className="mut">{quandoCaiu(f.quando) || '—'}</td>
                        <td className="mut col-extra">
                          {amostra && amostra.textos.length > 0 ? (
                            <>
                              {amostra.textos.join(', ')}
                              {amostra.total > amostra.textos.length && ` +${amostra.total - amostra.textos.length}`}
                            </>
                          ) : (
                            `${f.acertos} de ${f.total} nesta fase`
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline peq"
                            onClick={() => onJogarFase(f.refs)}
                            disabled={!podeRejogar}
                            aria-label={`Repetir a fase ${numero}`}
                            title={
                              podeRejogar
                                ? 'Jogar esta fase de novo com as mesmas palavras'
                                : 'Esta rodada antiga não guardou as palavras'
                            }
                          >
                            <RotateCcw aria-hidden /> Repetir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <div className="pe-ante">
        <label className="check">
          <input type="checkbox" checked={pularSempre} onChange={(e) => onMudarPularSempre(e.target.checked)} />{' '}
          {txtPular[ageProfile]}
        </label>
        <span style={{ flex: 1 }} />
        {onRepetir && (
          <button type="button" className="btn btn-outline" onClick={onRepetir}>
            <RotateCcw aria-hidden /> {txtRepetir[ageProfile]}
          </button>
        )}
        <button type="button" className="btn btn-outline" onClick={onTrocar}>
          <Shuffle aria-hidden /> {txtTrocar[ageProfile]}
        </button>
        <button type="button" className="btn btn-solid btn-jogar-grande" onClick={onJogar} disabled={vazia}>
          <Play aria-hidden /> {txtJogar[ageProfile]}
        </button>
      </div>
    </Tela>
  );
}
