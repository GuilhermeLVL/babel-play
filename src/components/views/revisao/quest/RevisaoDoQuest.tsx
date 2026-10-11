import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Ellipsis,
  Eye,
  Film,
  Flame,
  GraduationCap,
  Hand,
  Layers,
  Mic,
  Minus,
  PartyPopper,
  PenLine,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Target,
  TrendingUp,
  TriangleAlert,
  Undo2,
  Volume2,
  WalletCards,
  WifiOff,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react';

import { t, tp } from '../../../../lib/i18n';
import {
  andarBarra,
  armarCartao,
  chegarCena,
  entradaDoFim,
  pintarRodada,
  rajadaDoVeredito,
  sairComANota,
  soltarCartao,
} from '../../../../lib/polimento/revisao';
import { sentir } from '../../../../lib/polimento/sentidos';
import type { CenaDoCartao } from '../../../../lib/revisao/cena';
import type { VocabCard } from '../../../../types';
import FraseComLacuna from '../../../FraseComLacuna';
import { Dialogo, fecharDialogoDe } from '../../../ui';
import { Cena, Eq, FraseMarcada } from '../enxuta/pecas';

/**
 * A REVISÃO NO META QUEST (maquete aprovada pelo dono em 01/10/2026, tela 8; segunda rodada: todos os
 * estados da tela no mesmo desenho).
 *
 * Só apresentação. `Study.tsx` continua dono do baralho, da fila, das notas (FSRS no servidor), do
 * desfazer, do suspender e das preferências; aqui chega tudo pronto e cada toque volta por uma função.
 *
 * O que muda de forma no headset:
 *  · o topo é uma linha só (voltar, progresso, "10 / 18", opções, encerrar);
 *  · o cartão ocupa o miolo, e o único botão principal da tela mora nele;
 *  · as ações do cartão (desfazer, ouvir, editar, suspender) ficam na faixa do pé;
 *  · os atalhos de teclado não aparecem (não há teclado físico); no formato Digitar, o teclado do
 *    sistema sobe quando o campo ganha foco, e por isso o campo NÃO pega o foco sozinho.
 *
 * O MESMO DESENHO NO COMPUTADOR (02/10/2026): o último item é limite do APARELHO, não do desenho. Com
 * teclado físico (`atalhos`, que `Study.tsx` lê de `recursos.ts`) as teclas voltam a aparecer (Espaço,
 * 1 a 4, Z: os atalhos em si nunca saíram, moram em `Study.tsx`) e o campo de digitar pega o foco.
 */

/** O cabeçalho das telas que não são a rodada: voltar, sobrancelha, título e, à direita, as ações. */
function Cabecalho({ titulo, aoVoltar, acoes }: { titulo: string; aoVoltar: () => void; acoes?: ReactNode }) {
  return (
    <header className="q-cab">
      <button type="button" className="q-ctl q-voltar" aria-label={t('Voltar aos Cartões')} onClick={aoVoltar}>
        <ArrowLeft aria-hidden />
      </button>
      <div>
        <p className="q-sobre">{t('Revisão')}</p>
        <h1>{titulo}</h1>
      </div>
      {acoes}
    </header>
  );
}

/** O baralho ainda não chegou: a forma do cartão e da faixa, no lugar de um "Carregando…" solto. */
export function EsperaDaRevisaoNoQuest({ titulo, aoVoltar }: { titulo: string; aoVoltar: () => void }) {
  return (
    <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="carregando">
      <Cabecalho titulo={titulo} aoVoltar={aoVoltar} />
      <div className="qr-espera" role="status" aria-busy aria-label={t('Carregando o seu baralho…')}>
        <div className="q-esqueleto" />
        <div className="q-esqueleto" />
      </div>
    </div>
  );
}

/** Baralho vazio: de onde as palavras vêm, e o único passo para sair daqui. */
export function BaralhoVazioNoQuest({
  titulo,
  motivo,
  aoVoltar,
  aoCapturar,
  children,
}: {
  titulo: string;
  /** A frase do perfil ("Seu baralho está vazio"). */
  motivo: string;
  aoVoltar: () => void;
  aoCapturar?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="vazio">
      <Cabecalho titulo={titulo} aoVoltar={aoVoltar} />
      <div className="q-vazio">
        <span className="q-ic">
          <Brain aria-hidden />
        </span>
        <h2>{motivo}</h2>
        <p>
          {t(
            'Toque numa palavra de qualquer transcrição para mandá-la ao baralho. A revisão espaçada aparece aqui assim que houver cartões.',
          )}
        </p>
        {aoCapturar && (
          <button type="button" className="q-ctl pri" onClick={aoCapturar}>
            <Mic aria-hidden /> {t('Capturar uma sessão')}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * PRODUÇÃO ATIVA. Na tela de sempre ela só abre pela paleta de comandos (teclado) ou vinda de outra tela;
 * no headset não há teclado, então ganha um botão: fora da rodada e nas opções. Sem palavra madura o
 * bastante, o botão aparece desligado e o motivo fica escrito.
 */
export interface ProducaoAtivaNoQuest {
  rotulo: string;
  /** "12 palavras prontas para escrever de memória". */
  dica: string;
  /** Por que ainda não abre (nenhuma palavra com estabilidade suficiente). */
  bloqueio?: string;
  aoComecar: () => void;
}

/** Fora de uma rodada (a pessoa encerrou sem sair da tela): quantas esperam, e começar. */
export function ForaDaRodadaNoQuest({
  titulo,
  quantas,
  chamada,
  explicacao,
  producao,
  aoComecar,
  aoOpcoes,
  aoVoltar,
  children,
}: {
  titulo: string;
  /** As vencidas agora, ou o baralho inteiro quando nada vence. */
  quantas: number;
  chamada: string;
  explicacao: string;
  producao?: ProducaoAtivaNoQuest;
  aoComecar: () => void;
  aoOpcoes: () => void;
  aoVoltar: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="fora">
      <Cabecalho
        titulo={titulo}
        aoVoltar={aoVoltar}
        acoes={
          <button type="button" className="q-ctl" aria-label={t('Opções da revisão')} onClick={aoOpcoes}>
            <Settings2 aria-hidden /> {t('Opções')}
          </button>
        }
      />
      <div className="q-vazio">
        <span className="qr-contagem">{quantas}</span>
        <h2>{chamada}</h2>
        <p>{explicacao}</p>
        <button type="button" className="q-ctl pri" onClick={aoComecar}>
          <Target aria-hidden /> {titulo}
        </button>
        {producao && (
          <div className="qr-segundo" data-testid="producao-ativa-fora">
            <button type="button" className="q-ctl" disabled={!!producao.bloqueio} onClick={producao.aoComecar}>
              <PenLine aria-hidden /> {producao.rotulo}
            </button>
            <small>{producao.bloqueio ?? producao.dica}</small>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** Um grupo de "O que mudou" (`grupos`, `cartoes2.js:889`). */
export interface GrupoQueMudou {
  /** `ct-nv` (começaram), `ct-rv` (passaram para "em revisão"), `ct-ap` (escaparam). */
  classe: 'ct-nv' | 'ct-rv' | 'ct-ap';
  icone: 'comecaram' | 'subiram' | 'escaparam';
  titulo: string;
  palavras: Array<{ id: string; palavra: string; idioma?: string }>;
}

/**
 * O FIM DA SESSÃO, ENXUTO — porte de `ctHtmlDoFim()` (`cartoes2.js:880-905`): 3 números, o ganho, o que
 * mudou, e dois botões. Tudo o que aparece é dado da sessão: o ganho é o que o servidor creditou, e a
 * linha de missão e sequência só existe quando o app as tem (`recompensas_v2`).
 */
export function FimDaRodadaNoQuest({
  titulo,
  feitoEm,
  proximo,
  cartoes,
  lembradas,
  tempo,
  xp,
  seeds,
  grupos,
  missao,
  sequencia,
  escaparam,
  podeDesfazer,
  aoDesfazer,
  aoPraticar,
  aoAbrirPalavra,
  aoVoltar,
  children,
}: {
  /** "Você fechou o dia" ou "Você fechou a sessão". */
  titulo: string;
  /** "As 12 palavras foram revisadas." */
  feitoEm: string;
  /** "A próxima abre amanhã com 3 palavras." */
  proximo: string;
  cartoes: number;
  /** "92%". */
  lembradas: string;
  tempo: string;
  /** O XP que o servidor creditou; 0 não mostra a linha do ganho. */
  xp: number;
  /** Só com as recompensas v2; `null` não mostra. */
  seeds: number | null;
  grupos: GrupoQueMudou[];
  /** "Missão 12 de 20 palavras", quando o app tem missões. */
  missao?: string;
  /** "5 dias", quando há sequência a mostrar (nunca no perfil protegido). */
  sequencia?: string;
  /** Quantas escaparam: o botão principal pratica essas. */
  escaparam: number;
  podeDesfazer: boolean;
  aoDesfazer: () => void;
  /** Ausente = não há o que praticar (nenhum cartão com frase). */
  aoPraticar?: () => void;
  aoAbrirPalavra?: (id: string) => void;
  aoVoltar: () => void;
  children?: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (raiz.current) entradaDoFim(raiz.current);
  }, []);
  const ICONE = { comecaram: Sprout, subiram: TrendingUp, escaparam: Repeat } as const;
  return (
    <div
      className="q-palco q-revisao ct-rev ct-fim cx-fim"
      data-testid="revisao-no-quest"
      data-estado="fim"
      ref={raiz}
    >
      <header className="q-cab cx-topo">
        <button type="button" className="q-ctl q-voltar" aria-label={t('Voltar aos Cartões')} onClick={aoVoltar}>
          <ArrowLeft aria-hidden />
        </button>
        <div>
          <p className="q-sobre">{t('Revisão')}</p>
          <h1>{t('Sessão concluída')}</h1>
        </div>
        <button
          type="button"
          className="q-ctl cx-ic cx-desfazer"
          aria-label={t('Desfazer a última nota')}
          title={t('Desfazer a última nota (Z)')}
          disabled={!podeDesfazer}
          onClick={aoDesfazer}
        >
          <Undo2 aria-hidden />
        </button>
      </header>
      <div className="q-cartao fundo qr-fecho">
        <span className="q-ic">
          <PartyPopper aria-hidden />
        </span>
        <div>
          <h2>{titulo}</h2>
          <p>
            {feitoEm} {proximo}
          </p>
        </div>
      </div>
      <div className="qr-numeros">
        <div className="q-num">
          <span className="q-rotulo">{t('Cartões')}</span>
          <b>{cartoes}</b>
        </div>
        <div className="q-num">
          <span className="q-rotulo">{t('Lembradas')}</span>
          <b className="bom">{lembradas}</b>
        </div>
        <div className="q-num">
          <span className="q-rotulo">{t('Tempo')}</span>
          <b>{tempo}</b>
        </div>
      </div>
      {xp > 0 && (
        <p
          className="cx-ganho"
          data-testid="ganho-da-sessao"
          data-seeds-da-revisao={seeds ?? undefined}
          title={t('O ganho é o que entrou na sua conta por esta sessão.')}
        >
          <Zap aria-hidden />
          <b>+{xp} XP</b>
          {seeds !== null && seeds > 0 && (
            <>
              <i>·</i>
              <Sprout aria-hidden />
              <b>+{seeds} Seeds</b>
            </>
          )}
          <span>{t('por esta sessão')}</span>
        </p>
      )}
      <section className="q-cartao ct-mudou cx-mudou">
        <h2>{t('O que mudou')}</h2>
        {grupos.length ? (
          <ul className="cx-subiu">
            {grupos.map((g) => {
              const Icone = ICONE[g.icone];
              return (
                <li key={g.classe}>
                  <span className={`q-tag ${g.classe}`}>
                    <Icone aria-hidden /> {g.palavras.length}
                  </span>
                  <span className="cx-subiu-t">{g.titulo}</span>
                  <span className="q-acoes">
                    {g.palavras.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="q-chip"
                        lang={p.idioma}
                        disabled={!aoAbrirPalavra}
                        onClick={() => aoAbrirPalavra?.(p.id)}
                      >
                        {p.palavra}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="qv-nota">{t('Todas lembradas: os intervalos cresceram.')}</p>
        )}
      </section>
      {(missao || sequencia) && (
        <p className="cx-hoje-linha" data-testid="hoje-em-uma-linha">
          {missao && (
            <span>
              <Target aria-hidden />
              <b>{t('Missão')}</b> {missao}
            </span>
          )}
          {missao && sequencia && <i>·</i>}
          {sequencia && (
            <span>
              <Flame aria-hidden />
              <b>{t('Sequência')}</b> {sequencia}
            </span>
          )}
        </p>
      )}
      <div className="q-faixa cx-fim-pe" role="toolbar" aria-label={t('O que fazer agora')}>
        {aoPraticar && (
          <button type="button" className="q-ctl pri" onClick={aoPraticar}>
            <Sparkles aria-hidden />{' '}
            {escaparam
              ? tp(escaparam, 'Praticar a que escapou', 'Praticar as {n} que escaparam')
              : t('Praticar de outro jeito')}
          </button>
        )}
        <button type="button" className={`q-ctl ${aoPraticar ? '' : 'pri'}`.trim()} onClick={aoVoltar}>
          <Layers aria-hidden /> {t('Voltar')}
        </button>
      </div>
      {children}
    </div>
  );
}

export type FormatoDaRodada = 'cloze' | 'typing' | 'mc' | 'active-production';

export interface NotaDoQuest {
  id: string;
  /** `e`, `d`, `b`, `f`: a cor da nota (a mesma classe da tela de sempre). */
  classe: string;
  rotulo: string;
  /** O intervalo que o FSRS dá a esta nota ("3,5 d"). */
  detalhe: string;
  /** A tecla que dá esta nota no computador ("1" a "4"). */
  tecla?: string;
  aoDar: (origem: Element | null) => void;
}

/** De onde a frase veio, em texto pequeno (`cxOnde`, `cartoes2.js:154-159`). */
export interface OndeDaFrase {
  texto: string;
  tipo: 'sessao' | 'trilha' | 'baralho';
}

/** A linha de aviso entre o topo e o cartão (`cxLinha`, `cartoes2.js:272-283`). */
export type AvisoDaRodada =
  | { tipo: 'dificil'; palavra: string; idioma?: string; aoVerSaidas: () => void; aoDispensar: () => void }
  | { tipo: 'sem-rede'; pendentes: number; aoTentar: () => void };

/**
 * A RODADA, ENXUTA — porte de `ctHtmlDaRodada()` e `ctMioloDoCartao()` (`cartoes2.js:207-310`).
 *
 *  · o topo: voltar, barra, "10 / 26", desfazer (aceso depois de cada nota) e "…";
 *  · a linha entre o topo e o cartão: um aviso de uma linha ou, nos 3 primeiros cartões, a instrução;
 *    o espaço dela existe sempre, então um aviso não empurra o cartão;
 *  · a frente com UMA fileira (Fala original ou Ouvir, e Mostrar resposta);
 *  · o verso com a cena (quando o cartão nasceu de uma captura) e UMA fileira de notas; Fala original e
 *    Minha voz são dois ícones ao lado da frase;
 *  · a linha discreta de teclas no pé, só onde há teclado.
 *
 * Só apresentação: `Study.tsx` continua dono do baralho, da fila, das notas e das preferências.
 */
export function RodadaDoQuest({
  titulo,
  rotulo,
  indice,
  total,
  direcao = 1,
  cartao,
  frase,
  idioma,
  selo,
  selos,
  pele,
  onde,
  instrucao,
  aviso,
  formato,
  notas,
  mostrandoResposta,
  aoMostrarResposta,
  convidaDizer = false,
  aoAgoraNao,
  tocando = null,
  aoOuvirOriginal,
  quemFalou,
  aoOuvir,
  cena,
  traducaoDaFrase,
  achadaEm,
  aoJuntarCena,
  aoAbrirSessao,
  aoMinhaVoz,
  temVozGuardada = false,
  tentativa,
  aoDigitar,
  verificado,
  certo,
  aoVerificar,
  alternativas,
  aoEscolher,
  aoAvancar,
  consequencia,
  producao,
  podeDesfazer,
  aoDesfazer,
  aoMais,
  aoVoltar,
  atalhos = false,
  children,
}: {
  /** Há teclado físico: a linha de teclas aparece e o campo de digitar pega o foco sozinho. */
  atalhos?: boolean;
  /** O título da tela (fica na página para o leitor de tela). */
  titulo: string;
  /** "Revisão de hoje": o nome da barra de progresso. */
  rotulo: string;
  indice: number;
  total: number;
  /** De que lado o cartão entra: 1 depois de uma nota, -1 depois de desfazer. */
  direcao?: 1 | -1;
  cartao: VocabCard;
  /** A frase mostrada (a do cartão, ou a da cena juntada). */
  frase: string;
  /** O idioma da palavra (`lang` dos textos). */
  idioma?: string;
  /** "B1 · Sessão". */
  selo: string;
  selos: { nova: boolean; deNovo: boolean; dificil: boolean; seguidas: number };
  /** As classes da pele de cartão equipada, no estado da palavra. */
  pele: string;
  onde?: OndeDaFrase;
  /** A instrução do formato: só chega nos 3 primeiros cartões. */
  instrucao?: string;
  aviso?: AvisoDaRodada;
  formato: FormatoDaRodada;
  notas: NotaDoQuest[];
  mostrandoResposta: boolean;
  aoMostrarResposta: () => void;
  /** "Diga em voz alta antes de virar" neste cartão. */
  convidaDizer?: boolean;
  aoAgoraNao?: () => void;
  /** O que está soando agora: o botão vira equalizador. */
  tocando?: 'original' | 'voz' | null;
  /** O cartão tem fala de sessão: o botão de ouvir é "Fala original". */
  aoOuvirOriginal?: () => void;
  quemFalou?: string;
  /** A voz do aparelho. Sem voz para o idioma da palavra, o botão não existe. */
  aoOuvir?: () => void;
  /** A cena do verso (cartão nascido de captura, ou cena juntada). */
  cena?: CenaDoCartao | null;
  traducaoDaFrase?: string;
  /** "Reunião de produto": a palavra de um cartão trazido aparece nesta sessão da pessoa. */
  achadaEm?: string;
  aoJuntarCena?: () => void;
  aoAbrirSessao?: () => void;
  aoMinhaVoz?: () => void;
  temVozGuardada?: boolean;
  /** Digitar e Escolher: o que a pessoa respondeu e se já foi conferido. */
  tentativa: string;
  aoDigitar: (valor: string) => void;
  verificado: boolean;
  certo: boolean;
  aoVerificar: () => void;
  alternativas: string[];
  aoEscolher: (opcao: string) => void;
  aoAvancar: (origem: Element | null) => void;
  /** "Conta como “Bom”: volta em 3 d." */
  consequencia?: string;
  /** O exercício de produção ativa, inteiro (ele tem o próprio estado). */
  producao?: ReactNode;
  podeDesfazer: boolean;
  aoDesfazer: () => void;
  aoMais: () => void;
  aoVoltar: () => void;
  children?: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const saindo = useRef(false);
  const barraAntes = useRef((indice / Math.max(1, total)) * 100);
  const lembrar = formato === 'cloze';
  const verso = mostrandoResposta || verificado;
  const quatro = notas.length === 4;
  const rotuloDeErrar = notas[0]?.rotulo ?? '';
  const rotuloDeLembrar = notas.find((n) => n.classe === 'b')?.rotulo ?? '';

  /* Vivos para os gestos, que são armados uma vez por cartão. */
  const vivo = useRef({ lembrar, mostrandoResposta, notas, aoMostrarResposta, aoMais });
  vivo.current = { lembrar, mostrandoResposta, notas, aoMostrarResposta, aoMais };

  /** A nota sai do botão, o cartão escorrega, e só então a nota vale (`ctDarNota`, `cartoes2.js:425-432`). */
  const darNota = async (n: NotaDoQuest, origem: Element | null) => {
    if (saindo.current) return;
    saindo.current = true;
    sentir(n.classe === 'e' ? 'desliga' : n.classe === 'd' ? 'aba' : 'liga');
    if (raiz.current)
      await sairComANota(raiz.current, {
        errou: n.classe === 'e',
        origem,
        texto: n.classe === 'e' ? t('volta nesta sessão ou na próxima') : t('volta em {quando}', { quando: n.detalhe }),
      });
    saindo.current = false;
    n.aoDar(origem);
  };

  /* Cartão novo: o de antes solta o que o gesto deixou, a barra anda e o cartão entra. */
  useLayoutEffect(() => {
    const r = raiz.current;
    if (!r) return;
    soltarCartao(r);
    andarBarra(r, barraAntes.current);
    barraAntes.current = (indice / Math.max(1, total)) * 100;
    pintarRodada(r, direcao === -1 ? 'voltar' : 'proximo', { dir: direcao, seguidas: selos.seguidas });
    const cartaoEl = r.querySelector<HTMLElement>('.qr-cartao');
    if (!cartaoEl) return;
    return armarCartao(cartaoEl, {
      pode: () => vivo.current.lembrar,
      mostrando: () => vivo.current.mostrandoResposta,
      aoMostrar: () => vivo.current.aoMostrarResposta(),
      aoDarNota: (qual) => {
        const n = vivo.current.notas.find((x) => x.classe === qual);
        if (n) {
          sentir(qual === 'e' ? 'desliga' : 'liga');
          n.aoDar(null);
        }
      },
      aoSegurar: () => vivo.current.aoMais(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartao.id, indice]);
  const primeiraPintura = useRef(true);
  useLayoutEffect(() => {
    if (primeiraPintura.current) {
      primeiraPintura.current = false;
      return;
    }
    if (!raiz.current || !verso) return;
    pintarRodada(raiz.current, 'resposta');
    if (verificado && certo) rajadaDoVeredito(raiz.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verso]);
  useLayoutEffect(() => {
    if (raiz.current && cena && mostrandoResposta) chegarCena(raiz.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!cena, mostrandoResposta]);
  useLayoutEffect(() => {
    if (raiz.current && aviso) {
      pintarRodada(raiz.current, 'aviso');
      if (aviso.tipo === 'dificil') sentir('aviso');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso?.tipo, aviso?.tipo === 'dificil' ? aviso.palavra : '']);

  /** `cxBotaoOuvir()` de `cartoes2.js:161-166`: a fala gravada quando existe; senão, a voz do aparelho. */
  const botaoDeOuvir = aoOuvirOriginal ? (
    <button
      type="button"
      className={`q-ctl ct-som ${tocando === 'original' ? 'ct-tocando' : ''}`.trim()}
      aria-label={t('Fala original')}
      title={t('A fala gravada da sessão (R)')}
      onClick={aoOuvirOriginal}
    >
      <AudioLines aria-hidden />
      <Eq />
      <span>{t('Fala original')}</span>
    </button>
  ) : aoOuvir ? (
    <button
      type="button"
      className={`q-ctl ct-som ${tocando === 'voz' ? 'ct-tocando' : ''}`.trim()}
      aria-label={t('Ouvir na voz do aparelho')}
      title={t('Esta origem não tem gravação: toca a voz do aparelho (V)')}
      onClick={aoOuvir}
    >
      <Volume2 aria-hidden />
      <Eq />
      <span>{t('Ouvir')}</span>
    </button>
  ) : null;

  /* No verso, Fala original e Minha voz são dois ícones ao lado da frase (`cartoes2.js:230-232`). */
  const icones = mostrandoResposta && lembrar && (aoOuvirOriginal || aoOuvir || aoMinhaVoz) && (
    <span className="cx-icones">
      {aoOuvirOriginal ? (
        <button
          type="button"
          className={`q-ctl cx-ic ct-som ${tocando === 'original' ? 'ct-tocando' : ''}`.trim()}
          aria-label={quemFalou ? t('Fala original: {quem}', { quem: quemFalou }) : t('Fala original')}
          title={quemFalou ? t('Fala original · {quem} (R)', { quem: quemFalou }) : t('Fala original (R)')}
          onClick={aoOuvirOriginal}
        >
          <AudioLines aria-hidden />
          <Eq />
        </button>
      ) : (
        aoOuvir && (
          <button
            type="button"
            className={`q-ctl cx-ic ct-som ${tocando === 'voz' ? 'ct-tocando' : ''}`.trim()}
            aria-label={t('Ouvir na voz do aparelho')}
            title={t('Ouvir na voz do aparelho (V)')}
            onClick={aoOuvir}
          >
            <Volume2 aria-hidden />
            <Eq />
          </button>
        )
      )}
      {aoMinhaVoz && (
        <button
          type="button"
          className="q-ctl cx-ic"
          aria-label={t('Minha voz: gravar e comparar')}
          title={t('Minha voz: gravar e comparar (M)')}
          onClick={aoMinhaVoz}
        >
          <Mic aria-hidden />
          {temVozGuardada && <i className="cx-ponto" aria-hidden />}
        </button>
      )}
    </span>
  );

  const IconeDeOnde = onde?.tipo === 'sessao' ? Mic : onde?.tipo === 'trilha' ? GraduationCap : WalletCards;
  const linhaDeOnde = onde && !(cena && mostrandoResposta) && (
    <p className="cx-onde">
      <IconeDeOnde aria-hidden />
      <span>{onde.texto}</span>
    </p>
  );

  const topoDoCartao = (
    <>
      <div className="termo" lang={idioma}>
        {cartao.word}
      </div>
      {cartao.phonetics && <p className="ct-ipa tn">{cartao.phonetics}</p>}
      {(frase || icones) && (
        <div className={`ct-frase cx-frase-linha ${tocando === 'original' ? 'ct-tocando' : ''}`.trim()}>
          {frase && (
            <p className={`exemplo ${tocando === 'original' ? 'ct-tocando' : ''}`.trim()} lang={idioma}>
              “<FraseMarcada frase={frase} palavra={cartao.word} />”
            </p>
          )}
          {icones}
        </div>
      )}
      {linhaDeOnde}
    </>
  );

  const resultado = (texto: string) => (
    <div className="resp qr-resultado" data-certo={certo}>
      <p className={`qr-veredito ${certo ? 'certo' : 'errado'}`} role="status">
        {certo ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}
        <span>{texto}</span>
      </p>
      {consequencia && <p className="ct-consequencia">{consequencia}</p>}
      <button type="button" className="q-ctl pri qr-principal" onClick={(e) => aoAvancar(e.currentTarget)}>
        {t('Avançar')} <ArrowRight aria-hidden />
      </button>
    </div>
  );

  const teclas = lembrar ? (
    mostrandoResposta ? (
      <>
        <kbd>1</kbd> {t('a')} <kbd>{quatro ? 4 : 2}</kbd> {t('responde')} · <kbd>R</kbd> {t('ouve')}
        {aoMinhaVoz && (
          <>
            {' '}
            · <kbd>M</kbd> {t('minha voz')}
          </>
        )}
      </>
    ) : (
      <>
        <kbd>{t('Espaço')}</kbd> {t('mostra a resposta')} · <kbd>R</kbd> {t('ouve')}
      </>
    )
  ) : formato === 'mc' ? (
    <>
      <kbd>1</kbd> {t('a')} <kbd>4</kbd> {t('escolhe')}
    </>
  ) : (
    <>
      <kbd>Enter</kbd> {t('verifica')}
    </>
  );

  return (
    <div
      className="q-palco q-revisao ct-rev cx-rev"
      data-testid="revisao-no-quest"
      data-estado="rodada"
      data-formato={formato}
      data-cx-lado={verso ? 'verso' : 'frente'}
      ref={raiz}
    >
      <header className="q-cab qr-topo cx-topo">
        <button type="button" className="q-ctl q-voltar" aria-label={t('Voltar aos Cartões')} onClick={aoVoltar}>
          <ArrowLeft aria-hidden />
        </button>
        <div className="qr-progresso">
          <span
            className="q-barra"
            role="progressbar"
            aria-label={t('Progresso da sessão: {rotulo}', { rotulo })}
            aria-valuenow={indice}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <span style={{ width: `${(indice / Math.max(1, total)) * 100}%` }} />
          </span>
          <span className="qr-conta">
            {Math.min(indice + 1, total)} / {total}
            {aviso?.tipo === 'sem-rede' && (
              <i className="cx-sem-rede-ic" title={t('Sem rede: há notas que não foram gravadas')}>
                <WifiOff aria-hidden />
              </i>
            )}
          </span>
        </div>
        <button
          type="button"
          className="q-ctl cx-ic cx-desfazer"
          aria-label={t('Desfazer a última nota')}
          title={t('Desfazer a última nota (Z)')}
          disabled={!podeDesfazer}
          onClick={aoDesfazer}
        >
          <Undo2 aria-hidden />
        </button>
        <button
          type="button"
          className="q-ctl cx-ic"
          aria-label={t('Mais ações e ajustes')}
          title={t('Mais ações e ajustes')}
          onClick={aoMais}
        >
          <Ellipsis aria-hidden />
        </button>
      </header>
      <h1 className="sr">{titulo}</h1>
      <div className="cx-linha">
        {aviso?.tipo === 'dificil' ? (
          <div className="cx-aviso ct-aviso-dif" role="status">
            <button type="button" className="cx-aviso-corpo" onClick={aviso.aoVerSaidas}>
              <TriangleAlert aria-hidden />
              <span>
                <b lang={aviso.idioma}>“{aviso.palavra}”</b> {t('não está entrando.')}
                <span className="cx-longo"> {t('Quer tentar de outro jeito?')}</span>
              </span>
              <i className="cx-aviso-vai">
                <span className="cx-longo">{t('Ver as saídas')}</span>
                <ChevronRight aria-hidden />
              </i>
            </button>
            <button type="button" className="cx-aviso-x" aria-label={t('Dispensar o aviso')} onClick={aviso.aoDispensar}>
              <X aria-hidden />
            </button>
          </div>
        ) : aviso?.tipo === 'sem-rede' ? (
          <div className="cx-aviso ct-sem-rede" role="status">
            <span className="cx-aviso-corpo">
              <WifiOff aria-hidden />
              <span>
                <b>{t('Sem rede.')}</b>{' '}
                {tp(aviso.pendentes, '{n} nota não foi gravada', '{n} notas não foram gravadas')}
                <span className="cx-longo">{t(': elas esperam nesta tela até a internet voltar')}</span>.
              </span>
            </span>
            <button type="button" className="cx-aviso-acao" aria-label={t('Tentar enviar agora')} onClick={aviso.aoTentar}>
              <RefreshCw aria-hidden />
              <span>
                {t('Tentar')}
                <span className="cx-longo"> {t('agora')}</span>
              </span>
            </button>
          </div>
        ) : (
          instrucao && <p className="q-texto qr-dica">{instrucao}</p>
        )}
      </div>

      <section className={`q-cartao qr-cartao flash ${pele}`} aria-label={t('Cartão')} data-ct-carta={cartao.id}>
        <span className="ct-selos">
          <span className="q-tag off qr-selo">{selo}</span>
          {selos.nova && !selos.deNovo && <span className="q-tag ct-nv">{t('nova')}</span>}
          {selos.deNovo && <span className="q-tag ct-ap">{t('de novo')}</span>}
          {selos.dificil && (
            <span className="q-tag ct-dif">
              <TriangleAlert aria-hidden /> {t('difícil')}
            </span>
          )}
          {selos.seguidas >= 3 && (
            <span className="q-tag ct-combo">
              <Flame aria-hidden /> {t('{n} seguidas', { n: selos.seguidas })}
            </span>
          )}
        </span>
        <i className="ct-carimbo e" aria-hidden>
          {rotuloDeErrar}
        </i>
        <i className="ct-carimbo b" aria-hidden>
          {rotuloDeLembrar}
        </i>

        {formato === 'active-production' ? (
          producao
        ) : formato === 'typing' ? (
          <>
            {topoDoCartao}
            {!verificado ? (
              <div className="resp qr-sem-linha qr-digitar">
                <label className="q-campo">
                  <span>{t('Digite a tradução')}</span>
                  <input
                    id="rev-digitar"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    value={tentativa}
                    placeholder={atalhos ? t('Digite a tradução…') : t('Toque para escrever')}
                    autoFocus={atalhos}
                    onChange={(e) => aoDigitar(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tentativa.trim()) aoVerificar();
                    }}
                  />
                </label>
                <div className="cx-fileira">
                  {botaoDeOuvir}
                  <button
                    type="button"
                    className="q-ctl pri qr-principal"
                    disabled={!tentativa.trim()}
                    onClick={aoVerificar}
                  >
                    <Check aria-hidden /> {t('Verificar')}
                  </button>
                </div>
              </div>
            ) : (
              resultado(
                certo
                  ? t('Correto! A tradução era “{traducao}”.', { traducao: cartao.translation })
                  : t('Incorreto. A tradução era “{traducao}” (você escreveu “{tentativa}”).', {
                      traducao: cartao.translation || '—',
                      tentativa,
                    }),
              )
            )}
          </>
        ) : formato === 'mc' ? (
          <>
            <div className="qr-lacuna" lang={idioma}>
              <FraseComLacuna sentence={frase || cartao.sentence} word={cartao.word} />
            </div>
            <p className="exemplo">{cartao.translation}</p>
            {!verificado ? (
              <div className="qr-opcoes" role="group" aria-label={t('Qual palavra completa a frase')}>
                {alternativas.map((opcao, i) => (
                  <button key={i} type="button" className="qr-opcao" lang={idioma} onClick={() => aoEscolher(opcao)}>
                    {opcao}
                  </button>
                ))}
              </div>
            ) : (
              resultado(
                certo
                  ? t('Correto!')
                  : t('Incorreto. Você selecionou “{tentativa}”. A resposta correta era “{palavra}”.', {
                      tentativa,
                      palavra: cartao.word,
                    }),
              )
            )}
          </>
        ) : !mostrandoResposta ? (
          /* LEMBRAR: a palavra e a frase; a tradução só depois. */
          <>
            {topoDoCartao}
            <div className="resp qr-sem-linha">
              {convidaDizer && (
                <p className="cx-diga">
                  <Mic aria-hidden />
                  <span>{t('Diga em voz alta antes de virar')}</span>
                  <button type="button" className="cx-link" onClick={aoAgoraNao}>
                    {t('Agora não')}
                  </button>
                </p>
              )}
              <div className="cx-fileira ct-origem">
                {botaoDeOuvir}
                <button type="button" className="q-ctl pri qr-principal" onClick={aoMostrarResposta}>
                  <Eye aria-hidden /> {t('Mostrar resposta')}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {topoDoCartao}
            <div className="resp">
              <div className={`cx-resposta ${cena ? 'com-cena' : ''}`.trim()}>
                {cena && <Cena cena={cena} aoAbrirSessao={aoAbrirSessao} />}
                <div className="cx-resposta-texto">
                  <b>{cartao.translation || '—'}</b>
                  {traducaoDaFrase && <p className="ct-trad-da-frase">“{traducaoDaFrase}”</p>}
                  {cartao.explanation && <p>{cartao.explanation}</p>}
                </div>
              </div>
              {achadaEm && aoJuntarCena && (
                <button type="button" className="cx-juntar" onClick={aoJuntarCena}>
                  <Film aria-hidden />
                  <span>{t('Esta palavra aparece em “{sessao}”, uma das suas capturas.', { sessao: achadaEm })}</span>
                  <b>{t('Juntar a cena')}</b>
                </button>
              )}
              <div
                className="fsrs"
                role="group"
                aria-label={t('Quão fácil foi lembrar')}
                style={{ '--n': notas.length } as CSSProperties}
              >
                {notas.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={n.classe}
                    title={n.tecla ? t('Tecla {tecla}', { tecla: n.tecla }) : undefined}
                    onClick={(e) => void darNota(n, e.currentTarget)}
                  >
                    {n.rotulo}
                    <small>{n.detalhe}</small>
                  </button>
                ))}
              </div>
              {instrucao && (
                <p className="ct-gestos">
                  <Hand aria-hidden />{' '}
                  {t('Ou deslize o cartão: esquerda, {errar}; direita, {lembrar}.', {
                    errar: rotuloDeErrar,
                    lembrar: rotuloDeLembrar,
                  })}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {atalhos && formato !== 'active-production' && (
        <p className="cx-teclas" data-precisa="teclado">
          {teclas} · <kbd>Z</kbd> {t('desfaz')} · <kbd>?</kbd> {t('todos os atalhos')}
        </p>
      )}

      {children}
    </div>
  );
}

/* ── OPÇÕES DA REVISÃO ─────────────────────────────────────────────────────────────────────────── */

export type TipoDeCartaoDoQuest = 'lembrar' | 'digitar' | 'escolha';
export type OrdemDoQuest = 'vencidas' | 'misturar';
export interface ValoresDaRevisaoNoQuest {
  novas: number;
  revisoes: number;
  ordem: OrdemDoQuest;
  tipo: TipoDeCartaoDoQuest;
  ouvir: boolean;
  retencao: number;
  botoes: 2 | 4;
}

/** Número com menos e mais: escrever um número com o teclado do headset é o caminho lento. */
function Passo({
  rotulo,
  valor,
  min,
  max,
  passo,
  aoTrocar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  aoTrocar: (n: number) => void;
}) {
  const limitar = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <span className="qr-passo">
      <button
        type="button"
        className="q-ctl"
        aria-label={t('Diminuir: {rotulo}', { rotulo })}
        disabled={valor <= min}
        onClick={() => aoTrocar(limitar(valor - passo))}
      >
        <Minus aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valor}
        aria-label={rotulo}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) aoTrocar(limitar(n));
        }}
      />
      <button
        type="button"
        className="q-ctl"
        aria-label={t('Aumentar: {rotulo}', { rotulo })}
        disabled={valor >= max}
        onClick={() => aoTrocar(limitar(valor + passo))}
      >
        <Plus aria-hidden />
      </button>
    </span>
  );
}

/** Escolha entre poucos, com as pílulas do headset. */
function Escolha<T extends string>({
  rotulo,
  atual,
  opcoes,
  aoTrocar,
}: {
  rotulo: string;
  atual: T;
  opcoes: Array<[T, string]>;
  aoTrocar: (v: T) => void;
}) {
  return (
    <div className="q-abas q-seg" role="group" aria-label={rotulo}>
      {opcoes.map(([v, r]) => (
        <button key={v} type="button" className="q-aba" aria-pressed={atual === v} onClick={() => aoTrocar(v)}>
          {r}
        </button>
      ))}
    </div>
  );
}

/** As seis opções da revisão, uma por linha, todas valendo de verdade (as mesmas da tela de sempre). */
export function OpcoesDaRevisaoNoQuest({
  valores,
  padrao,
  temVoz,
  producao,
  aoTrocar,
  aoFechar,
}: {
  valores: ValoresDaRevisaoNoQuest;
  padrao: ValoresDaRevisaoNoQuest;
  /** Há voz para o idioma estudado neste aparelho? Sem ela, "ouvir ao mostrar" diz o motivo. */
  temVoz: boolean;
  producao?: ProducaoAtivaNoQuest;
  aoTrocar: (v: Partial<ValoresDaRevisaoNoQuest>) => void;
  aoFechar: () => void;
}) {
  const descricao: Record<TipoDeCartaoDoQuest, string> = {
    lembrar: t('Você pensa e mostra a resposta.'),
    digitar: t('Você escreve a tradução.'),
    escolha: t('Quatro alternativas.'),
  };
  return (
    <Dialogo
      icone={SlidersHorizontal}
      titulo={t('Ajustes da memória')}
      sub={t('Valem para todas as rodadas. A agenda é do FSRS.')}
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo qr-opcoes-dlg">
        <div className="q-ajuste">
          <div>
            <b>{t('Novas por dia')}</b>
            <small>{t('Quantas palavras nunca vistas entram por dia.')}</small>
          </div>
          <Passo
            rotulo={t('Novas por dia')}
            valor={valores.novas}
            min={0}
            max={200}
            passo={5}
            aoTrocar={(novas) => aoTrocar({ novas })}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Revisões por dia')}</b>
            <small>{t('Um teto para dias de atraso; o resto fica para amanhã.')}</small>
          </div>
          <Passo
            rotulo={t('Revisões por dia')}
            valor={valores.revisoes}
            min={10}
            max={999}
            passo={10}
            aoTrocar={(revisoes) => aoTrocar({ revisoes })}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Ordem')}</b>
          </div>
          <Escolha<OrdemDoQuest>
            rotulo={t('Ordem')}
            atual={valores.ordem}
            aoTrocar={(ordem) => aoTrocar({ ordem })}
            opcoes={[
              ['vencidas', t('Vencidas primeiro')],
              ['misturar', t('Misturar')],
            ]}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Tipo de cartão')}</b>
            <small>{descricao[valores.tipo]}</small>
          </div>
          <Escolha<TipoDeCartaoDoQuest>
            rotulo={t('Tipo de cartão')}
            atual={valores.tipo}
            aoTrocar={(tipo) => aoTrocar({ tipo })}
            opcoes={[
              ['lembrar', t('Lembrar')],
              ['digitar', t('Digitar')],
              ['escolha', t('Escolher')],
            ]}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Ouvir a palavra ao mostrar')}</b>
            {!temVoz && <small>{t('Este aparelho não tem voz para o idioma que você estuda.')}</small>}
          </div>
          <button
            type="button"
            className="q-interruptor"
            role="switch"
            aria-checked={valores.ouvir}
            aria-label={t('Ouvir a palavra ao mostrar')}
            onClick={() => aoTrocar({ ouvir: !valores.ouvir })}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Meta de retenção · {n}%', { n: valores.retencao })}</b>
            <small>{t('Mais alta = palavras voltam mais cedo, mais revisões por dia.')}</small>
          </div>
          <span className="qr-passo">
            <button
              type="button"
              className="q-ctl"
              aria-label={t('Diminuir: {rotulo}', { rotulo: t('Meta de retenção') })}
              disabled={valores.retencao <= 80}
              onClick={() => aoTrocar({ retencao: Math.max(80, valores.retencao - 1) })}
            >
              <Minus aria-hidden />
            </button>
            <input
              type="range"
              min={80}
              max={97}
              value={valores.retencao}
              aria-label={t('Meta de retenção')}
              onChange={(e) => aoTrocar({ retencao: Number(e.target.value) })}
            />
            <button
              type="button"
              className="q-ctl"
              aria-label={t('Aumentar: {rotulo}', { rotulo: t('Meta de retenção') })}
              disabled={valores.retencao >= 97}
              onClick={() => aoTrocar({ retencao: Math.min(97, valores.retencao + 1) })}
            >
              <Plus aria-hidden />
            </button>
          </span>
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Botões de resposta')}</b>
            <small>
              {valores.botoes === 2
                ? t('Esqueci e Lembrei: gravam Errei e Bom.')
                : t('Errei, Difícil, Bom e Fácil.')}
            </small>
          </div>
          <Escolha<'2' | '4'>
            rotulo={t('Botões de resposta')}
            atual={String(valores.botoes) as '2' | '4'}
            aoTrocar={(v) => aoTrocar({ botoes: v === '2' ? 2 : 4 })}
            opcoes={[
              ['4', t('Quatro')],
              ['2', t('Dois')],
            ]}
          />
        </div>
        {/* Não é um ajuste: é o outro exercício desta tela, que no computador só abre pelo teclado. */}
        {producao && (
          <div className="q-ajuste" data-testid="producao-ativa-nas-opcoes">
            <div>
              <b>{producao.rotulo}</b>
              <small>{producao.bloqueio ?? producao.dica}</small>
            </div>
            <button
              type="button"
              className="q-ctl"
              disabled={!!producao.bloqueio}
              onClick={(e) => {
                fecharDialogoDe(e.currentTarget);
                producao.aoComecar();
              }}
            >
              <PenLine aria-hidden /> {t('Começar')}
            </button>
          </div>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="q-ctl" style={{ marginRight: 'auto' }} onClick={() => aoTrocar({ ...padrao })}>
          <RotateCcw aria-hidden /> {t('Voltar ao padrão')}
        </button>
        <button type="button" className="q-ctl pri" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          <Check aria-hidden /> {t('Pronto')}
        </button>
      </div>
    </Dialogo>
  );
}
