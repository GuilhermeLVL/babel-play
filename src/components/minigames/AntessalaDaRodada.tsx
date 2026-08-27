import { useEffect, useMemo, useState } from 'react';
import { X, Play, Shuffle, RotateCcw, Trophy, Flame, Target, Sparkles, Star, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { fetchRecordes, type RecordeDoJogo } from '../../data/api';
import { eventosVistos, todosOsEventos } from '../../lib/eventosDeJogo';
import { IconePixel } from '../views/play/IconesPixel';
import type { MinigameId, FaseJogada } from '@core';
import { nivelNoJogo } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import type { ItemDaAntessala } from '@core';
import { Segmentado, Ladrilho } from '../ui';

/**
 * ANTESSALA DA RODADA — o que vai cair, dito ANTES de a partida começar.
 *
 * O DEFEITO QUE ELA CONSERTA. A rodada começava no próprio clique do jogo: nenhuma prévia, nenhum
 * jeito de trocar o conteúdo, nenhum jeito de repetir o que acabou. E o sorteio era pior do que
 * parecia — medido no Termo, sobre um baralho de 200 palavras: 5 rodadas seguidas, 35 jogadas, 7
 * palavras DISTINTAS. Quem jogava não tinha como saber disso nem como sair do laço; a queixa que
 * chegou foi literalmente "fico preso nas mesmas questões".
 *
 * A CORREÇÃO É DE VISIBILIDADE, NÃO DE SORTEIO. Consertar o sorteio é trabalho de quem monta a
 * lista (esta tela recebe `itens` prontos). O que faltava aqui era o usuário poder VER a repetição
 * e agir sobre ela, e "Trocar por outras" existe para o caso de a lista ter vindo repetida de novo.
 *
 * COMO ELA DEIXOU DE ENTREGAR A RESPOSTA. A primeira versão respondia "são as mesmas 7 da rodada
 * passada?" imprimindo as 7 — e com isso imprimia a palavra que o Termo ia pedir para soletrar e a
 * frase que o Ditado ia pedir para transcrever, enquanto os próprios jogos se recusavam a mostrar
 * isso. Agora a lista só recebe o que `core/minigames/revelavel.ts` autoriza por jogo, e a
 * repetição é MEDIDA e dita em número ("5 dos 7 já caíram na sua última rodada"). Responde melhor
 * — ninguém precisa comparar sete itens de memória — e não custa conteúdo nenhum.
 *
 * ESTA TELA NÃO DECIDE SE É TELA CHEIA. Nada de `fixed inset-0`: ela é um bloco de conteúdo comum,
 * e quem a monta (Play.tsx) escolhe a moldura. Assim o mesmo componente serve embutido numa aba.
 */

/** Como aquele item foi da última vez. Vem de `GET /api/exercises/historico`. */
export interface HistoricoDoItem {
  vezes: number;
  erros: number;
  ultimoAcerto: boolean;
  /** Quando caiu pela última vez. Já vinha da API e não era exibido em lugar nenhum. */
  ultimaEm?: number;
}

/**
 * Filtro de dificuldade da rodada (Z1).
 *
 * `null` quando o jogo não é de modalidade `palavra` — os 5 de frase jogam sobre falas, que não
 * têm dificuldade por palavra. Chip inerte ensina que a tela mente; ausência de chip, não.
 */
/** Nomeadas porque agora atravessam a fronteira do `Segmentado`, que devolve `string`. */
type FaixaDeDificuldade = 'facil' | 'medio' | 'dificil';
type Estrategia = 'equilibrado' | 'recentes' | 'frequentes' | 'em-dificuldade';

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
  /** Id do jogo — liga a faixa de recordes (melhor placar/combo/precisão) e o colecionável. */
  gameId?: string;
  /** `null` quando o filtro não se aplica a este jogo. */
  filtroDificuldade?: FiltroDificuldade | null;
  itens: ItemDaAntessala[];
  historico: Map<string, HistoricoDoItem>;
  /** Palavras/falas vencidas no agendador — merecem marca própria. */
  vencidos: ReadonlySet<string>;
  /**
   * Quantos itens desta rodada já caíram na rodada ANTERIOR deste jogo. É o que substituiu a
   * lista de palavras na função de denunciar sorteio repetido — e responde melhor, porque não
   * exige comparar item por item de memória.
   */
  repetidos: number;
  ageProfile: AgeProfileType;
  /**
   * De onde vem esta rodada, já redigido pelo lobby (`rotuloDaFonte`).
   *
   * O que faltava: a antessala só recebia `titulo` (o nome do jogo) e não tinha como dizer "8
   * palavras suas, do inglês" — a primeira linha que o redesenho pede. A pessoa chegava aqui e o
   * recorte que ela acabou de escolher no lobby sumia da tela.
   */
  fonte?: {
    rotulo: string;
    /** Nome do idioma, já por extenso ("inglês"). Códigos não são para ler. */
    idioma?: string;
  };
  /** Estimativa de duração, quando MEDIDA. `null` vira "rodada curta" — nunca um minuto chutado. */
  duracao?: string | null;
  /**
   * As FASES já jogadas deste jogo nesta fonte, mais recente primeiro (`agruparFases`).
   * É o mapa de fases do pedido do dono: cada rodada passada com estrelas, pontos e a
   * possibilidade de REJOGAR aquele conteúdo exato para melhorar a pontuação.
   */
  fases?: FaseJogada[];
  /** Remonta a rodada com os itens exatos de uma fase passada. */
  onJogarFase?: (refs: string[]) => void;
  /** Tamanho do acervo da fonte — é o denominador do "% do vocabulário já jogado". */
  acervoTotal?: number;
  /** Quantos itens distintos do acervo a pessoa já jogou (o numerador). */
  itensJogados?: number;
  /** `null` quando não há rodada anterior deste jogo nesta fonte. */
  onRepetir: (() => void) | null;
  onTrocar: () => void;
  onJogar: () => void;
  onSair: () => void;
  /** Estado do "começar direto da próxima vez". */
  pularSempre: boolean;
  onMudarPularSempre: (v: boolean) => void;
}

/**
 * Teto da lista. Acima disto a prévia deixa de ser lida e vira parede de texto — e o objetivo dela
 * é ser LIDA antes de jogar. 24 cobre com folga o tamanho real de uma rodada (o Termo joga de 1 a
 * 7 por vez); quando estourar, o excedente é ANUNCIADO logo abaixo, porque lista cortada em
 * silêncio mente sobre o tamanho da rodada — é o mesmo padrão da Curadoria.
 */
const MAX_VISIVEL = 24;

/** Estado de um item na rodada. A ordem de teste é a prioridade: vencido ganha de tudo. */
type Selo = { texto: string; variante: '' | 'ok' | 'warn' | 'err'; title?: string };

function seloDoItem(
  ref: string,
  historico: Map<string, HistoricoDoItem>,
  vencidos: ReadonlySet<string>,
): Selo {
  // Vencido primeiro: é a única marca que fala de PRAZO, e um item pode ser "já visto" e estar
  // vencido ao mesmo tempo — mostrar "já viu" aí esconderia justamente o motivo de ele ter voltado.
  if (vencidos.has(ref)) return { texto: 'vencida', variante: 'warn', title: 'Passou da hora de revisar' };

  const h = historico.get(ref);
  if (!h) return { texto: 'nova', variante: '', title: 'Você ainda não viu esta' };

  // Errou E não acertou na última: a marca de erro só vale enquanto o erro não foi resolvido —
  // senão uma pessoa que errou uma vez em janeiro carregaria "você errou" para sempre.
  if (h.erros > 0 && !h.ultimoAcerto) {
    return { texto: 'você errou', variante: 'err', title: `${h.erros} erro(s) em ${h.vezes} tentativa(s)` };
  }

  return { texto: 'já viu', variante: 'ok', title: `Você já jogou esta ${h.vezes}x` };
}

/**
 * "há 3 dias" em vez de um carimbo de data. O que importa aqui é a DISTÂNCIA — se caiu agora há
 * pouco, a rodada está se repetindo; se faz semanas, revisar faz sentido. A data exata fica no
 * `title`, para quem quiser conferir.
 */
function quandoCaiu(ultimaEm?: number): string | null {
  if (!ultimaEm) return null;
  const dias = Math.floor((Date.now() - ultimaEm) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

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
  acervoTotal,
  itensJogados,
  onRepetir,
  onTrocar,
  onJogar,
  onSair,
  pularSempre,
  onMudarPularSempre,
}: AntessalaProps) {
  /* Recordes DESTE jogo: transforma a antessala em tela pré-jogo — a pessoa vê o que tem a bater
     antes de apertar Jogar. Best-effort: sem histórico, a faixa simplesmente não aparece. */
  const [recorde, setRecorde] = useState<RecordeDoJogo | null>(null);
  useEffect(() => {
    if (!gameId) return;
    void fetchRecordes().then((rs) => setRecorde(rs.find((r) => r.exerciseKind === gameId) ?? null));
  }, [gameId]);
  const vistos = eventosVistos().length;
  const totalEventos = todosOsEventos().length;

  /**
   * O SALDO em número. É a linha que responde "o que vem" sem obrigar a contar selos na lista —
   * e é ela que denuncia a rodada repetida: "0 você nunca viu" cinco vezes seguidas é visível.
   */
  const saldo = useMemo(() => {
    let novos = 0, vistos = 0, devidos = 0;
    for (const it of itens) {
      if (vencidos.has(it.ref)) devidos++;
      if (historico.has(it.ref)) vistos++; else novos++;
    }
    return { total: itens.length, novos, vistos, devidos };
  }, [itens, historico, vencidos]);

  const FAIXAS = [
    { id: 'facil' as const, rotulo: 'Fácil' },
    { id: 'medio' as const, rotulo: 'Médio' },
    { id: 'dificil' as const, rotulo: 'Difícil' },
  ];
  const ESTRATEGIAS = [
    { id: 'equilibrado' as const, rotulo: 'Equilibrado' },
    { id: 'recentes' as const, rotulo: 'Recentes' },
    { id: 'frequentes' as const, rotulo: 'Mais vistas' },
    { id: 'em-dificuldade' as const, rotulo: 'Errando' },
  ];

  const visiveis = itens.slice(0, MAX_VISIVEL);
  const vazia = itens.length === 0;

  /**
   * A LISTA SÓ SE PAGA QUANDO AS LINHAS DIFEREM.
   *
   * Nos três jogos que não podem revelar nada (Memória, Qual foi?, Ditado), uma rodada de itens
   * todos inéditos vira oito linhas "N letras · VENCIDA" — medido na tela, é exatamente o que
   * aparecia. Oito linhas quase idênticas não ajudam a decidir "jogo ou troco", e ainda empurram
   * os botões para fora da dobra.
   *
   * Quando não há NADA que distinga um item do outro — sem pista, sem nível, sem histórico —, a
   * lista dá lugar a um resumo que diz a mesma coisa em duas linhas. Basta um item com histórico
   * para as linhas voltarem a informar (aí cada uma tem o seu "há 3 dias"), e a lista volta.
   */
  /* A pergunta certa é "o título carrega alguma coisa além do esqueleto?", e não "existe campo
     `pista`?". Quando o jogo permite a pista, ela SOBE para o título e o campo `pista` fica vazio
    , checar o campo colapsava para o resumo justamente as listas que informam (o Termo mostrando
     sete traduções distintas viraria "7 palavras, de 6 a 6 letras"). Onde o título É o esqueleto,
     aí sim não há o que distinguir.

     E A CONTA É POR MAIORIA, NÃO POR `some`. Medido na tela com o baralho real: uma rodada de
     Memória com OITO itens, sete deles puro esqueleto e UM com nível CEFR (herdado de uma
     importação da trilha), passava no `some` e imprimia oito linhas "N letras · VENCIDA", a
     parede de repetição que este bloco existe para evitar, derrubada por um único item. A lista só
     se paga quando a maior parte dela distingue; abaixo disso, o resumo diz mais em duas linhas. */
  const informativos = itens.filter(i => (i.titulo && i.titulo !== i.forma) || i.cefr || historico.has(i.ref)).length;
  const listaInforma = itens.length > 0 && informativos * 2 >= itens.length;
  const tamanhos = itens.map(i => i.tamanho).filter((n): n is number => typeof n === 'number' && n > 0);
  const faixa = tamanhos.length
    ? { min: Math.min(...tamanhos), max: Math.max(...tamanhos), unidade: itens[0]?.forma?.includes('palavra') ? 'palavras' : 'letras' }
    : null;

  // Textos por perfil. Ficam junto do lugar onde aparecem porque são desta tela e de mais nenhuma;
  // `COPY` é para termo reutilizado entre telas, e enchê-lo de frase local é como ele apodrece.
  const subtitulo: Record<AgeProfileType, string> = {
    kids: 'Isto é o que vem agora. Não gostou? Troca.',
    pro: 'Prévia da rodada, o conteúdo exato que será jogado, antes de começar.',
    senior: 'Veja o que vai aparecer. Você pode trocar antes de começar.',
  };
  const rotuloTotal: Record<AgeProfileType, string> = {
    kids: 'nesta rodada',
    pro: 'itens na rodada',
    senior: 'nesta rodada',
  };
  const rotuloNovos: Record<AgeProfileType, string> = {
    kids: 'você nunca viu',
    pro: 'inéditos',
    senior: 'são novas para você',
  };
  const rotuloVistos: Record<AgeProfileType, string> = {
    kids: 'você já jogou',
    pro: 'já vistos',
    senior: 'você já viu antes',
  };
  const rotuloVencidos: Record<AgeProfileType, string> = {
    kids: 'pedindo revisão',
    pro: 'vencidos no agendador',
    senior: 'para repetir hoje',
  };
  const txtJogar: Record<AgeProfileType, string> = {
    kids: 'Bora jogar',
    pro: 'Jogar',
    senior: 'Começar',
  };
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
    pro: 'Começar direto da próxima vez (pular esta prévia)',
    senior: 'Da próxima vez, começar direto',
  };
  const txtVazia: Record<AgeProfileType, string> = {
    kids: 'Não sobrou nada para jogar agora. Tente trocar.',
    pro: 'Nenhum item elegível para esta rodada.',
    senior: 'Não há palavras disponíveis agora. Tente trocar.',
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 pb-28 animate-in fade-in duration-200">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <p className="label-mono mb-1">Antes de começar</p>
            <h1 className="font-display font-black text-2xl text-ink tracking-tight truncate" title={titulo}>
              {titulo}
            </h1>

            {/* ── DE ONDE VEM ESTA RODADA ────────────────────────────────────────────────────
                Uma linha, não um selo por item: numa rodada homogênea (o caso normal) oito selos
                idênticos dizendo "do inglês" são a mesma parede de repetição que `listaInforma`
                já combate mais abaixo. A informação é da RODADA, então mora no cabeçalho dela.

                A duração vem MEDIDA de `@core/minigames/duracao` ou não vem: "rodada curta" é
                verdade e não promete minuto nenhum. */}
            <p className="text-[13px] text-ink-muted mt-1 flex flex-wrap items-center gap-x-1.5">
              <span className="font-semibold text-ink">{itens.length}</span>
              <span>{rotuloTotal[ageProfile]}</span>
              {fonte && <><span aria-hidden>·</span><span>{fonte.rotulo.toLowerCase()}</span></>}
              {fonte?.idioma && <><span aria-hidden>·</span><span>do {fonte.idioma}</span></>}
              {duracao && <><span aria-hidden>·</span><span>{duracao}</span></>}
            </p>

            <p className="text-[13px] text-ink-muted mt-1 max-w-[70ch]">{subtitulo[ageProfile]}</p>

            {/* ── CHIPS DE DIFICULDADE (Z1) ───────────────────────────────────────────────
                Linha de chips, não modal: o usuário já está a um clique de jogar. Chip sem itens
                suficientes fica DESABILITADO com o motivo, botão que falha ao ser clicado é pior
                que botão ausente. */}
            {/* RECOLHIDOS por pedido do dono (2026-08-27): as duas fileiras de chips vinham ANTES
                do progresso e da lista — configuração raramente mexida cobrindo a informação que
                decide "jogo ou não". Continuam a um clique, mas agora pedem o clique. */}
            {filtroDificuldade && (
              <details className="mt-3 group">
                <summary className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink cursor-pointer select-none w-fit list-none [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
                  Ajustar a rodada (nível e foco)
                  <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-2 space-y-1.5">
                <Segmentado
                  rotulo="nível"
                  rotuloDoGrupo="Dificuldade das palavras desta rodada"
                  multiplo
                  valor={filtroDificuldade.faixas}
                  aoTrocar={(id) => filtroDificuldade.aoTrocarFaixa(id as FaixaDeDificuldade)}
                  opcoes={FAIXAS.map((f) => {
                    const n = filtroDificuldade.disponivelPorFaixa[f.id];
                    const insuficiente = n > 0 && n < filtroDificuldade.minimoDoJogo;
                    return {
                      id: f.id,
                      rotulo: f.rotulo,
                      contagem: n,
                      dica: `${n} disponíveis`,
                      motivoBloqueio: n === 0
                        ? `nenhuma palavra ${f.rotulo.toLowerCase()} neste recorte`
                        : insuficiente
                          ? `só ${n} ${f.rotulo.toLowerCase()}; este jogo precisa de ${filtroDificuldade.minimoDoJogo}`
                          : undefined,
                    };
                  })}
                />
                <Segmentado
                  rotulo="foco"
                  rotuloDoGrupo="De onde vêm as palavras desta rodada"
                  valor={[filtroDificuldade.estrategia]}
                  aoTrocar={(id) => filtroDificuldade.aoTrocarEstrategia(id as Estrategia)}
                  opcoes={ESTRATEGIAS.map((e) => ({ id: e.id, rotulo: e.rotulo }))}
                />
                {/* Seleção sem servidor continua válida — mas o usuário merece saber. */}
                {filtroDificuldade.origemDaComposicao === 'fallback-local' && (
                  <p className="text-[11px] text-ink-muted">
                    Seleção montada no seu dispositivo (sem conexão com o servidor).
                  </p>
                )}
                </div>
              </details>
            )}
          </div>
          {/* p-2 sobre um ícone de 20px dá 36px de alvo. O projeto já teve de voltar aqui uma vez:
              botões de 16px eram inatingíveis no toque. */}
          <button
            onClick={onSair}
            className="shrink-0 p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover cursor-pointer"
            title="Sair sem jogar"
            aria-label="Sair sem jogar"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* ── O HERÓI DO PROGRESSO: a primeira coisa depois do título é o SEU caminho neste jogo,
            não a configuração da rodada (pedido do dono, 2026-08-27). Nível com barra, recorde a
            bater, % do vocabulário já enfrentado — o que mostra que jogar de novo constrói algo.
            Só aparece com histórico: para quem nunca jogou não há progresso a mentir. ── */}
        {gameId && recorde && (() => {
          const niv = nivelNoJogo(recorde.rodadas);
          const pctVocab = acervoTotal && acervoTotal > 0
            ? Math.min(100, Math.round(((itensJogados ?? 0) / acervoTotal) * 100))
            : null;
          return (
            <section className="card-panel bg-canvas p-4 mb-5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <div className="flex items-center gap-3 min-w-0">
                  <IconePixel id={gameId as MinigameId} className="w-9 h-9 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-display font-black text-[15px] text-ink leading-tight">
                      Nível {niv.nivel} <span className="font-semibold text-ink-muted">neste jogo</span>
                    </p>
                    {/* A barra até o próximo nível: 3 rodadas por nível, contado das rodadas
                        REALMENTE jogadas (recorde.rodadas — rodadas distintas por roundId). */}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-28 h-2 rounded-full bg-surface overflow-hidden border border-border-subtle" role="progressbar" aria-valuenow={niv.noNivel} aria-valuemax={niv.porNivel} aria-label="Progresso até o próximo nível">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${niv.pct}%` }} />
                      </div>
                      <span className="text-[11px] text-ink-muted tabular-nums">{niv.noNivel}/{niv.porNivel} p/ nível {niv.nivel + 1}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] ml-auto">
                  <span className="flex items-center gap-1.5 text-warn-ink font-black tabular-nums" title="Sua melhor pontuação neste jogo"><Trophy className="w-3.5 h-3.5" aria-hidden /> {recorde.melhorPontos}</span>
                  {(recorde.melhorCombo ?? 0) > 0 && <span className="flex items-center gap-1.5 text-ink tabular-nums" title="Seu maior combo"><Flame className="w-3.5 h-3.5 text-warn" aria-hidden /> ×{recorde.melhorCombo}</span>}
                  {recorde.precisao != null && <span className="flex items-center gap-1.5 text-ink tabular-nums" title="Precisão histórica"><Target className="w-3.5 h-3.5 text-good" aria-hidden /> {recorde.precisao}%</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-border-subtle text-[12px] text-ink-muted">
                <span><b className="text-ink tabular-nums">{recorde.rodadas}</b> {recorde.rodadas === 1 ? 'rodada jogada' : 'rodadas jogadas'}</span>
                {pctVocab != null && (
                  <span title={`${itensJogados ?? 0} de ${acervoTotal} itens desta fonte já apareceram para você`}>
                    <b className="text-ink tabular-nums">{pctVocab}%</b> do vocabulário enfrentado
                  </span>
                )}
                <span className="flex items-center gap-1.5 ml-auto"><Sparkles className="w-3.5 h-3.5 text-accent" aria-hidden /> eventos raros: {vistos}/{totalEventos}</span>
              </div>
            </section>
          );
        })()}

        {/* ── O SALDO ────────────────────────────────────────────────────────────────────────
            Os mesmos quatro números de sempre, agora em ladrilhos: numa linha corrida de texto
            ("8 nesta rodada · 7 inéditos · 1 já vistos") todos pesavam igual, e o que carrega a
            decisão de jogar ou trocar é o "quantas você nunca viu", cinco rodadas seguidas com
            zero ali é a denúncia de sorteio repetido que esta tela existe para dar.

            "Vencidos" continua sendo o único com cor: é o único que fala de PRAZO. */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Ladrilho valor={saldo.total} rotulo={rotuloTotal[ageProfile]} />
          <Ladrilho valor={saldo.novos} rotulo={rotuloNovos[ageProfile]} tom={saldo.novos > 0 ? 'good' : 'ink'} />
          <Ladrilho valor={saldo.vistos} rotulo={rotuloVistos[ageProfile]} />
          <Ladrilho valor={saldo.devidos} rotulo={rotuloVencidos[ageProfile]} tom={saldo.devidos > 0 ? 'warn' : 'ink'} />
        </section>

        {/* A DENÚNCIA DA REPETIÇÃO, em número.
            Este é o trabalho que a lista de palavras fazia mal: para notar que "são as mesmas 7 da
            rodada passada" era preciso guardar as 7 de cabeça. Aqui a comparação já vem feita, e o
            botão que resolve está logo abaixo. Só aparece quando há repetição, uma linha dizendo
            "0 repetidos" toda vez viraria ruído e ninguém leria a que importa. */}
        {repetidos > 0 && (
          <section className="card-panel bg-surface p-3 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`badge-tag shrink-0 ${repetidos === saldo.total ? 'warn' : ''}`}>
              {repetidos === saldo.total ? 'rodada repetida' : 'repete'}
            </span>
            <p className="text-[13px] text-ink-muted">
              <b className="text-ink">{repetidos} {repetidos === 1 ? 'item' : 'itens'}</b>
              {' '}de {saldo.total} {repetidos === 1 ? 'já caiu' : 'já caíram'} na sua última rodada deste jogo
              {repetidos === saldo.total ? ', é a mesma rodada.' : '.'}
            </p>
          </section>
        )}

        {vazia ? (
          <section className="card-panel bg-surface p-8 text-center">
            <p className="text-[13px] text-ink-muted">{txtVazia[ageProfile]}</p>
          </section>
        ) : !listaInforma ? (
          /* Este jogo esconde o conteúdo por definição e não há histórico para diferenciar as
             linhas. Dizer isso em duas frases é mais honesto do que fingir uma lista. */
          <section className="card-panel bg-surface p-5 mb-3">
            <p className="text-[13px] text-ink">
              <b>{itens.length}</b>{' '}
              {faixa
                ? <>{faixa.unidade === 'palavras' ? 'falas' : 'palavras'}, de <b>{faixa.min}</b> a <b>{faixa.max}</b> {faixa.unidade}</>
                : <>itens</>}
              {saldo.novos === itens.length ? ', todas inéditas para você.' : '.'}
            </p>
            <p className="text-[12px] text-ink-muted mt-1.5 max-w-[62ch] leading-snug">
              Este jogo esconde o conteúdo até você jogar, mostrar aqui entregaria a resposta.
              O que dá para saber antes está na linha de cima.
            </p>
          </section>
        ) : (
          <ul className="flex flex-col gap-1.5 mb-3">
            {visiveis.map((item) => {
              const selo = seloDoItem(item.ref, historico, vencidos);
              const quando = quandoCaiu(historico.get(item.ref)?.ultimaEm);
              return (
                <li
                  key={item.ref}
                  className="card-panel bg-surface p-3 flex flex-wrap items-center gap-x-3 gap-y-1.5"
                >
                  {/* O título já vem REDIGIDO pelo core: a frase (karaokê/conectores), a tradução
                      (Termo/duelo/caça-palavras/embaralhada) ou só o esqueleto ("7 letras") nos três
                      que não podem mostrar nada. A tela não escolhe, se escolhesse, voltaria a ser
                      um lugar onde alguém pode esquecer a regra. */}
                  <span className="font-display font-bold text-[14px] text-ink min-w-[8rem] flex-1 truncate" title={item.titulo}>
                    {item.titulo}
                  </span>
                  {/* Apoio, quando o jogo permite E o título não é ele mesmo. */}
                  {item.pista && (
                    <span className="text-[12px] text-ink-muted min-w-[8rem] flex-1 truncate" title={item.pista}>
                      {item.pista}
                    </span>
                  )}
                  {/* A FORMA é o que sobra quando nada mais pode ser dito — e mesmo quando pode, ela
                      distingue itens que de outro modo teriam a mesma linha. */}
                  {item.forma && item.forma !== item.titulo && (
                    <span className="text-[11px] text-ink-faint shrink-0 font-mono">{item.forma}</span>
                  )}
                  {item.cefr && <span className="badge-tag acc shrink-0" title="Nível curado desta palavra">{item.cefr}</span>}
                  {/* Distância da última vez: é o que diferencia "já viu" de "acabou de cair". */}
                  {quando && <span className="text-[11px] text-ink-faint shrink-0">{quando}</span>}
                  {/* O selo tem TEXTO, não só cor — daltônico e tema de alto contraste leem igual. */}
                  <span
                    className={`badge-tag ${selo.variante} ml-auto shrink-0`}
                    title={selo.title}
                  >
                    {selo.texto}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* Excedente ANUNCIADO: sem esta linha a pessoa acharia que a rodada tem 24 itens. */}
        {listaInforma && itens.length > MAX_VISIVEL && (
          <p className="text-[12px] text-ink-faint mb-3">
            mostrando {MAX_VISIVEL} de {itens.length}, o resto entra na mesma rodada
          </p>
        )}

        {/* ── SUAS FASES: as rodadas passadas viram um mapa de fases com estrelas — e cada uma
            pode ser REJOGADA com o conteúdo exato, para caçar as 3 estrelas ou bater os pontos.
            Limitado às 6 mais recentes: é uma prateleira de retorno rápido, não um arquivo. ── */}
        {fases && fases.length > 0 && onJogarFase && (
          <section className="mt-5">
            <p className="label-mono mb-2">Suas fases neste jogo</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {fases.slice(0, 6).map((f, idx) => (
                <li key={f.roundId}>
                  <button
                    onClick={() => onJogarFase(f.refs)}
                    disabled={f.refs.length === 0}
                    className="w-full text-left card-panel bg-surface hover:border-accent transition-colors p-3 cursor-pointer disabled:opacity-50 disabled:cursor-default group"
                    title={f.refs.length ? 'Jogar esta fase de novo com as mesmas palavras' : 'Esta rodada antiga não guardou as palavras'}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold text-ink">Fase {fases.length - idx}</span>
                      {/* Estrela TEXTUALMENTE preenchida ou vazia — cor sozinha não passa no
                          alto contraste; o title diz a régua. */}
                      <span className="flex items-center gap-0.5" title={`${f.estrelas} de 3 estrelas (${f.precisao}% de acerto)`} aria-label={`${f.estrelas} de 3 estrelas`}>
                        {[1, 2, 3].map((n) => (
                          <Star key={n} className={`w-3.5 h-3.5 ${n <= f.estrelas ? 'text-warn fill-warn' : 'text-border-subtle'}`} aria-hidden />
                        ))}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11.5px] text-ink-muted tabular-nums">
                      {f.pontos > 0 && <span className="flex items-center gap-1"><Trophy className="w-3 h-3" aria-hidden /> {f.pontos}</span>}
                      <span className="flex items-center gap-1"><Target className="w-3 h-3" aria-hidden /> {f.acertos}/{f.total}</span>
                      {f.combo > 1 && <span className="flex items-center gap-1"><Flame className="w-3 h-3" aria-hidden /> ×{f.combo}</span>}
                      {quandoCaiu(f.quando) && <span className="ml-auto text-ink-faint">{quandoCaiu(f.quando)}</span>}
                    </span>
                    {f.refs.length > 0 && (
                      <span className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-accent-ink opacity-0 group-hover:opacity-100 transition-opacity">
                        <RotateCcw className="w-3 h-3" aria-hidden /> jogar de novo{f.estrelas < 3 ? ' e melhorar' : ''}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2.5 mt-5">
          <button onClick={onJogar} disabled={vazia} className="btn-solid disabled:opacity-40">
            <Play className="w-4 h-4" aria-hidden />
            {txtJogar[ageProfile]}
          </button>
          <button onClick={onTrocar} className="btn-outline">
            <Shuffle className="w-4 h-4" aria-hidden />
            {txtTrocar[ageProfile]}
          </button>
          {/* Só aparece quando existe rodada anterior. Botão presente e inerte é pior que ausente:
              o usuário clica, nada acontece e ele conclui que a tela está quebrada. */}
          {onRepetir && (
            <button onClick={onRepetir} className="btn-outline">
              <RotateCcw className="w-4 h-4" aria-hidden />
              {txtRepetir[ageProfile]}
            </button>
          )}
        </div>

        {/* Quem já sabe o que vem não deveria pagar o pedágio desta tela toda vez. O <label> inteiro
            é a área de clique (py-2 → passa de 24px), porque a caixa sozinha tem ~13px. */}
        <label className="flex items-center gap-2.5 mt-6 py-2 text-[13px] text-ink-muted cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={pularSempre}
            onChange={(e) => onMudarPularSempre(e.target.checked)}
            className="shrink-0 accent-[var(--accent)] cursor-pointer"
          />
          {txtPular[ageProfile]}
        </label>
      </div>
    </div>
  );
}
