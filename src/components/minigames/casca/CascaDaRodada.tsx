import type { MinigameId } from '@core';
import { CircleHelp, DoorOpen, Gauge, LogOut, type LucideIcon, Pause, Play, RotateCcw, Volume2, X } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { type NivelDoJogo, regrasDoJogo } from '../../../core/minigames/regras';
import { definirJogoEmCurso } from '../../../lib/comemoracao';
import { perfilDoDispositivo } from '../../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../../lib/dispositivo/recursos';
import { numero, t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { contagem321, entradaDeCamera } from '../../../lib/juice';
import { limparRetorno } from '../../../lib/polimento/jogos';
import type { AgeProfileType } from '../../../lib/profile';
import { CabecalhoDeTela, Tela } from '../../ui';
import { InterruptorDoQuest } from '../../views/play/quest/pecasDoQuest';
import ComoSeJoga from '../ComoSeJoga';
import { jaFezTour, marcarTourFeito } from '../passosDosJogos';
import ExplicacaoDoJogo from '../polimento/ExplicacaoDoJogo';
import { jogoTemNiveisNoDesenho, sobrancelhaNoDesenho } from '../polimento/textos';
import { ICONE_DO_JOGO } from './iconesDosJogos';
import SeletorDeNivel, { nomeDoNivel } from './SeletorDeNivel';

/**
 * A CASCA COMUM DA RODADA — a moldura que TODOS os jogos vestem (`T.jogo` do protótipo aprovado).
 *
 * O jogo em andamento é uma tela como as outras: cabeçalho com "← Jogar", a sobrancelha "Rodada ·
 * N palavras", o nome do jogo, "Pausar" e "Recomeçar" à direita, e o PALCO (`section.palco-jogo`)
 * onde o tabuleiro de cada jogo mora. Antes, cada um dos jogos desenhava o próprio topo, com o
 * próprio "X" que saía sem perguntar — a mesma ação com nove caras, e a rodada perdida num toque.
 *
 * O QUE A CASCA FAZ, e o jogo não precisa saber:
 *   - a CONTAGEM 3-2-1 sobre o palco e a entrada de câmera (`lib/juice`), uma vez por rodada;
 *   - a PAUSA (botão, Esc ou P) com "Continuar / Recomeçar / Como se joga / Sair da rodada", e a
 *     CONFIRMAÇÃO antes de sair — sair no meio não grava a rodada, e isso agora é dito;
 *   - o contexto `useRodada()`, que diz ao jogo se ele está `ativo` (contagem acabou e não está em
 *     pausa). O jogo com relógio para o relógio quando `ativo` é falso.
 *
 * O QUE O JOGO FAZ: desenha o seu tabuleiro dentro do palco, com o `HudDaRodada` como primeira
 * linha — o placar é dele, porque só ele sabe os pontos, a sequência e o progresso.
 */

interface EstadoDaRodada {
  /** A contagem acabou e a rodada não está em pausa: pode aceitar jogada e correr relógio. */
  ativo: boolean;
  pausado: boolean;
  /** O HUD escreve aqui o placar que a pausa mostra ("120 pontos · 4 acertos"). */
  placar: { current: { pontos: number; acertos: number } };
  /** O jogo e o nível desta rodada: o placar soma por eles o bônus do Difícil. Ausentes fora da casca. */
  jogo?: MinigameId;
  nivel?: NivelDoJogo;
}

const RODADA_SOLTA: EstadoDaRodada = { ativo: true, pausado: false, placar: { current: { pontos: 0, acertos: 0 } } };
const Contexto = createContext<EstadoDaRodada>(RODADA_SOLTA);

/**
 * O provedor do estado da rodada, exposto para quem monta um jogo FORA da casca e precisa dizer se
 * a rodada anda — os testes de componente simulam a contagem 3-2-1 e a pausa por aqui.
 */
export const ContextoDaRodada = Contexto;

/** Fora de uma casca (teste de componente, uso isolado) o jogo está sempre ativo. */
export function useRodada(): EstadoDaRodada {
  return useContext(Contexto);
}

interface CascaDaRodadaProps {
  jogo: MinigameId;
  /** O nome do jogo (já no perfil da pessoa). */
  titulo: string;
  /** Quantos itens a rodada tem e o nome deles ("palavras", "falas", "frases"). */
  total: number;
  unidade: string;
  ageProfile: AgeProfileType;
  /** Recomeça ESTA rodada do zero (mesmos itens). */
  onRecomecar: () => void;
  /** Sai sem terminar — só é chamado depois da confirmação. */
  onSair: () => void;
  /** P também pausa (padrão). Falso onde P é letra do tabuleiro (Termo): aí só o Esc pausa. */
  pausaComP?: boolean;
  /** O som do app (soundEnabled/toggleSound do App): o interruptor "Sons" da pausa. */
  som?: { ligado: boolean; alternar: () => void };
  /**
   * A RODADA ACABOU: o palco mostra a tela de fim no lugar do tabuleiro, como o `pjFim`
   * do protótipo (`jogos.js:296-328`). O cabeçalho continua; "Jogar" volta direto (não há rodada a
   * perder), Esc não pausa, e o palco ganha `.pj-acabou`, que esconde as ajudas e a instrução.
   */
  acabou?: boolean;
  /** O conteúdo desta rodada (o da ficha do Jogar): o ícone e o nome, ao lado da sobrancelha. */
  conteudo?: { icone: LucideIcon; nome: string };
  /** Tela cheia de largura para tabuleiros que precisam (padrão `larga`, como no protótipo). */
  children: ReactNode;
}

type Passo = null | 'menu' | 'sair';

/** Alvos em que P é letra, não atalho. */
const digitando = (el: EventTarget | null) =>
  el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

/**
 * O número da sobrancelha é o que a rodada de fato joga: os segundos do Duelo, os três degraus do
 * Soletrar, os níveis da Mala; nos outros, os itens da rodada.
 */
function quantosNaSobrancelha(jogo: MinigameId, nivel: NivelDoJogo, total: number): number {
  if (jogo === 'blitz') return regrasDoJogo('blitz', nivel).segundos;
  if (jogo === 'termo') return Math.min(3, total);
  /* A Mala joga até oito níveis; o Karuta, só as cartas da mesa; no Shiritori a primeira palavra abre a
     corrente e não é perguntada. */
  if (jogo === 'koffer') return Math.min(8, total);
  if (jogo === 'karuta') return Math.min(regrasDoJogo('karuta', nivel).cartas, total);
  if (jogo === 'shiritori') return Math.max(0, total - 1);
  return total;
}

export default function CascaDaRodada({
  jogo,
  titulo,
  total,
  unidade,
  ageProfile,
  onRecomecar,
  onSair,
  pausaComP = true,
  som,
  acabou = false,
  conteudo,
  children,
}: CascaDaRodadaProps) {
  const palcoRef = useRef<HTMLElement | null>(null);
  /* O nível desta rodada (Fácil, Médio, Difícil): aparece no cabeçalho quando não é o de sempre. */
  const nivel = useNivelDoJogo(jogo);
  const placar = useRef({ pontos: 0, acertos: 0 });
  const [pronto, setPronto] = useState(false);
  const [passo, setPasso] = useState<Passo>(null);
  const [explicando, setExplicando] = useState(false);
  /* A explicação em três telas do protótipo (`polimento/ExplicacaoDoJogo.tsx`). Abre sozinha na primeira
     partida de cada jogo, antes de o relógio andar; `pagina` 2 é a dos níveis. */
  const [onb, setOnb] = useState<{ pagina: 0 | 2; primeira: boolean } | null>(null);
  const [primeiraVez] = useState(() => !jaFezTour(jogo));

  /* O JOGO EM CURSO para o motor de comemoração (recompensas v2, onda 3): o acerto e o combo não
     dizem de que jogo vieram, e o efeito de maestria equipado só vale no jogo de origem. */
  useEffect(() => {
    definirJogoEmCurso(jogo);
    return () => definirJogoEmCurso(null);
  }, [jogo]);
  /* Ao sair da rodada nada fica pendurado na tela (`encerrarPartida`, `jogos.js:157`). */
  useEffect(() => limparRetorno, []);

  /* A contagem roda uma vez por montagem — "Recomeçar" remonta a casca (chave nova em Play.tsx),
     então a rodada recomeçada também conta 3-2-1. */
  useEffect(() => {
    let vivo = true;
    /* Como no protótipo: a contagem 3-2-1 é só do Duelo (`jogos.js:283-295`); os outros jogos começam
       direto. E na primeira partida a explicação vem antes (`jogos4.js:246-253`). */
    if (primeiraVez) {
      marcarTourFeito(jogo);
      const t = window.setTimeout(() => vivo && setOnb({ pagina: 0, primeira: true }), 450);
      return () => {
        vivo = false;
        window.clearTimeout(t);
      };
    }
    if (jogo !== 'blitz') {
      setPronto(true);
      return;
    }
    entradaDeCamera(palcoRef.current);
    void contagem321('Vai!', palcoRef.current).then(() => {
      if (vivo) setPronto(true);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A explicação fechou: recomeça se o nível mudou; senão a rodada segue (ou começa, na primeira vez). */
  const aoFecharOnb = (mudouONivel: boolean) => {
    const eraPrimeira = onb?.primeira;
    setOnb(null);
    if (mudouONivel) return onRecomecar();
    if (!eraPrimeira || pronto) return;
    if (jogo !== 'blitz') return setPronto(true);
    void contagem321('Vai!', palcoRef.current).then(() => setPronto(true));
  };

  const pausar = useCallback(() => setPasso('menu'), []);
  const continuar = useCallback(() => setPasso(null), []);

  // Esc ou P pausam; com a pausa aberta, P continua (o Esc do <dialog> nativo já fecha).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (acabou || explicando || onb || e.ctrlKey || e.metaKey || e.altKey) return;
      const p = pausaComP && (e.key === 'p' || e.key === 'P');
      if (passo) {
        if (p && passo === 'menu') {
          e.preventDefault();
          continuar();
        }
        return;
      }
      if (e.key === 'Escape' || (p && !digitando(e.target))) {
        e.preventDefault();
        pausar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [passo, explicando, onb, pausar, continuar, pausaComP, acabou]);

  const estado = useMemo<EstadoDaRodada>(
    () => ({
      ativo: pronto && !passo && !explicando && !onb && !acabou,
      pausado: !!passo || explicando || !!onb,
      placar,
      jogo,
      nivel,
    }),
    [pronto, passo, explicando, onb, acabou, jogo, nivel],
  );

  return (
    <Contexto.Provider value={estado}>
      <Tela largura="larga">
        <CabecalhoDeTela
          voltar={{ rotulo: 'Jogar', aoClicar: () => (acabou ? onSair() : setPasso('sair')) }}
          sobrancelha={
            <>
              {sobrancelhaNoDesenho(jogo, quantosNaSobrancelha(jogo, nivel, total), `Rodada · ${total} ${unidade}`)}
              {/* `aoMostrar.partida` de `fontes.js:289-294`: de onde vêm as palavras desta rodada. */}
              {conteudo && (
                <span className="fx-na-partida" title={t('O conteúdo desta rodada')}>
                  <conteudo.icone aria-hidden />
                  {conteudo.nome}
                </span>
              )}
            </>
          }
          /* A sobrancelha traz o ícone do próprio jogo (`jogos.js:128`). */
          icone={ICONE_DO_JOGO[jogo]}
          titulo={titulo}
          acoes={
            /* O CABEÇALHO DO PROTÓTIPO (`jogos.js:123-141`, `jogos4.js:95-99`): o selo do nível, que abre a
                 troca; "Como se joga"; e "Recomeçar", que o desenho novo já escondia. Sem "Pausar" na tela:
                 Esc e P continuam pausando. */
            <>
              {jogoTemNiveisNoDesenho(jogo) && (
                <button
                  type="button"
                  className="btn btn-outline peq pj-nivel"
                  data-pj="nivel"
                  data-nivel={nivel}
                  aria-label={`Nível de dificuldade: ${nomeDoNivel(nivel)}. Toque para trocar`}
                  onClick={() => setOnb({ pagina: 2, primeira: false })}
                >
                  <Gauge aria-hidden /> {nomeDoNivel(nivel)}
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline peq"
                data-pj="como"
                aria-label="Como se joga"
                onClick={() => setOnb({ pagina: 0, primeira: false })}
              >
                <CircleHelp aria-hidden /> Como se joga
              </button>
              <button type="button" className="btn btn-outline peq" data-acao="recomecar" onClick={onRecomecar}>
                <RotateCcw aria-hidden /> Recomeçar
              </button>
            </>
          }
        />
        <section
          ref={palcoRef}
          /* O palco é o do protótipo (`section.palco-jogo.px-partida[data-qj]`, `jogos.js:130`). */
          className={`palco-jogo px-partida${acabou ? ' pj-acabou' : ''}`}
          data-qj={jogo}
          id="palco"
          aria-busy={!pronto && !acabou}
          style={pronto || acabou ? undefined : { pointerEvents: 'none' }}
        >
          {children}
        </section>
      </Tela>

      {passo && (
        <DialogoDePausa
          jogo={jogo}
          passo={passo}
          pausaComP={pausaComP}
          som={som}
          titulo={titulo}
          placar={placar.current}
          aoContinuar={continuar}
          aoRecomecar={() => {
            setPasso(null);
            onRecomecar();
          }}
          aoComoSeJoga={() => {
            setPasso(null);
            setExplicando(true);
          }}
          aoPedirSair={() => setPasso('sair')}
          aoVoltarAoMenu={() => setPasso('menu')}
          aoSair={() => {
            setPasso(null);
            onSair();
          }}
        />
      )}
      {onb && <ExplicacaoDoJogo jogo={jogo} pagina={onb.pagina} primeira={onb.primeira} aoFechar={aoFecharOnb} />}
      {explicando && (
        <ComoSeJoga
          jogo={jogo}
          titulo={titulo}
          ageProfile={ageProfile}
          onJogar={() => setExplicando(false)}
          onFechar={() => setExplicando(false)}
        />
      )}
    </Contexto.Provider>
  );
}

/**
 * A PAUSA (`dialogoPausa` do protótipo) e a confirmação de saída, no mesmo `<dialog>` nativo:
 * `showModal()` prende o foco e deixa o fundo inerte; Esc fecha e volta ao jogo.
 */
function DialogoDePausa({
  jogo,
  passo,
  pausaComP,
  som,
  titulo,
  placar,
  aoContinuar,
  aoRecomecar,
  aoComoSeJoga,
  aoPedirSair,
  aoVoltarAoMenu,
  aoSair,
}: {
  jogo: MinigameId;
  passo: 'menu' | 'sair';
  pausaComP: boolean;
  som?: { ligado: boolean; alternar: () => void };
  titulo: string;
  placar: { pontos: number; acertos: number };
  aoContinuar: () => void;
  aoRecomecar: () => void;
  aoComoSeJoga: () => void;
  aoPedirSair: () => void;
  aoVoltarAoMenu: () => void;
  aoSair: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const fechar = useRef(aoContinuar);
  fechar.current = aoContinuar;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    // Esc (o `cancel` nativo) volta ao jogo em qualquer passo — nunca sai da rodada sozinho.
    const aoCancelar = (e: Event) => {
      e.preventDefault();
      fechar.current();
    };
    d.addEventListener('cancel', aoCancelar);
    return () => d.removeEventListener('cancel', aoCancelar);
  }, []);

  /* "Continuar" é o único botão principal; os sons são um ajuste em linha com o interruptor grande; a
     dica de atalho de teclado só aparece onde há teclado físico (o headset não tem; o computador tem, e
     Esc e P continuam pausando). */
  const comTeclado = recursosDoAparelho(perfilDoDispositivo()).tecladoFisico;
  return (
    <dialog ref={ref} className="m-auto qj qj-painel qj-pausa" aria-labelledby={idTitulo}>
      {passo === 'menu' ? (
        <>
          <div className="dlg-cab">
            <span className="q-ic" aria-hidden>
              <Pause />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="q-sobre">{t('Rodada em pausa')}</p>
              <h2 id={idTitulo}>{titulo}</h2>
              <p className="qj-nota">
                {t('{pontos} pontos · {acertos} acertos · o relógio parou', {
                  pontos: numero(placar.pontos),
                  acertos: placar.acertos,
                })}
              </p>
            </div>
          </div>
          <div className="dlg-corpo qj-painel-corpo">
            <button type="button" className="q-ctl pri bloco" autoFocus onClick={aoContinuar}>
              <Play aria-hidden /> {t('Continuar')}
            </button>
            <button type="button" className="q-ctl bloco" onClick={aoRecomecar}>
              <RotateCcw aria-hidden /> {t('Recomeçar')}
            </button>
            <button type="button" className="q-ctl bloco" onClick={aoComoSeJoga}>
              <CircleHelp aria-hidden /> {t('Como se joga')}
            </button>
            <SeletorDeNivel jogo={jogo} aoTrocar={aoRecomecar} />
            {som && (
              <div className="q-ajuste">
                <div>
                  <b>
                    <Volume2 aria-hidden /> {t('Sons')}
                  </b>
                  <small>{t('Liga e desliga os sons do app inteiro.')}</small>
                </div>
                <InterruptorDoQuest ligado={som.ligado} aoTrocar={som.alternar} rotulo={t('Sons do jogo')} />
              </div>
            )}
            <button type="button" className="q-ctl bloco perigo" onClick={aoPedirSair}>
              <LogOut aria-hidden /> {t('Sair da rodada')}
            </button>
            {/* A dica do atalho, só onde há teclado físico (o computador com o desenho novo). */}
            {comTeclado && (
              <p className="qj-nota" data-atalhos>
                <kbd>Esc</kbd>
                {pausaComP && (
                  <>
                    {' '}
                    {t('ou')} <kbd>P</kbd>
                  </>
                )}{' '}
                {t('pausa e continua')}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="dlg-cab">
            <span className="q-ic" aria-hidden>
              <DoorOpen />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 id={idTitulo}>{t('Sair sem terminar?')}</h2>
              <p className="qj-nota">
                {t('Esta rodada não conta para a revisão nem para os recordes. As palavras continuam no seu caderno.')}
              </p>
            </div>
            <button type="button" className="x" aria-label={t('Fechar')} onClick={aoContinuar}>
              <X aria-hidden />
            </button>
          </div>
          <div className="dlg-pe">
            <button type="button" className="q-ctl" autoFocus onClick={aoVoltarAoMenu}>
              {t('Continuar jogando')}
            </button>
            <button type="button" className="q-ctl perigo" onClick={aoSair}>
              <LogOut aria-hidden /> {t('Sair da rodada')}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
