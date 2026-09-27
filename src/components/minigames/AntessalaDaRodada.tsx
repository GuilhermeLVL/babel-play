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
import { eventosVistos, todosOsEventos } from '../../lib/eventosDeJogo';
import { proximaRecompensa } from '../../lib/galeria/progressao';
import type { AgeProfileType } from '../../lib/profile';
import BarraDeMaestria from '../maestria/BarraDeMaestria';
import { CabecalhoDeTela, Tela, TituloDeSecao } from '../ui';
import { IconePixel } from '../views/play/IconesPixel';
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
