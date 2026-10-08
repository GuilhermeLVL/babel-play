import type { MinigameId } from '@core';
import { CircleHelp, DoorOpen, Gamepad2, Gauge, LogOut, Pause, Play, RotateCcw, Volume2, X } from 'lucide-react';
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

import { jogoTemNiveis } from '../../../core/minigames/regras';
import { definirJogoEmCurso } from '../../../lib/comemoracao';
import { perfilDoDispositivo } from '../../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../../lib/dispositivo/recursos';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { numero, t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { contagem321, entradaDeCamera } from '../../../lib/juice';
import type { AgeProfileType } from '../../../lib/profile';
import { CabecalhoDeTela, IconeEmBloco, Tela } from '../../ui';
import { InterruptorDoQuest } from '../../views/play/quest/pecasDoQuest';
import ComoSeJoga from '../ComoSeJoga';
import { jaFezTour, marcarTourFeito } from '../passosDosJogos';
import ExplicacaoDoJogo from '../polimento/ExplicacaoDoJogo';
import { jogoTemNiveisNoDesenho } from '../polimento/textos';
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
  /** Tela cheia de largura para tabuleiros que precisam (padrão `larga`, como no protótipo). */
  children: ReactNode;
}

type Passo = null | 'menu' | 'sair';

/** Alvos em que P é letra, não atalho. */
const digitando = (el: EventTarget | null) =>
  el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

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
  children,
}: CascaDaRodadaProps) {
  const palcoRef = useRef<HTMLElement | null>(null);
  /* O nível desta rodada (Fácil, Médio, Difícil): aparece no cabeçalho quando não é o de sempre. */
  const nivel = useNivelDoJogo(jogo);
  const placar = useRef({ pontos: 0, acertos: 0 });
  const [pronto, setPronto] = useState(false);
  const [passo, setPasso] = useState<Passo>(null);
  const [explicando, setExplicando] = useState(false);
  /* DESENHO NOVO: a explicação em três telas do protótipo (`polimento/ExplicacaoDoJogo.tsx`). Abre
     sozinha na primeira partida de cada jogo, antes de o relógio andar; `pagina` 2 é a dos níveis. */
  const questNovo = useQuestNovo();
  const [onb, setOnb] = useState<{ pagina: 0 | 2; primeira: boolean } | null>(null);
  const [primeiraVez] = useState(() => questNovo && !jaFezTour(jogo));

  /* O JOGO EM CURSO para o motor de comemoração (recompensas v2, onda 3): o acerto e o combo não
     dizem de que jogo vieram, e o efeito de maestria equipado só vale no jogo de origem. */
  useEffect(() => {
    definirJogoEmCurso(jogo);
    return () => definirJogoEmCurso(null);
  }, [jogo]);

  /* A contagem roda uma vez por montagem — "Recomeçar" remonta a casca (chave nova em Play.tsx),
     então a rodada recomeçada também conta 3-2-1. */
  useEffect(() => {
    let vivo = true;
    /* NO DESENHO NOVO, como no protótipo: a contagem 3-2-1 é só do Duelo (`jogos.js:283-295`); os
       outros jogos começam direto. E na primeira partida a explicação vem antes (`jogos4.js:246-253`). */
    if (questNovo) {
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
      if (explicando || onb || e.ctrlKey || e.metaKey || e.altKey) return;
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
  }, [passo, explicando, onb, pausar, continuar, pausaComP]);

  const estado = useMemo<EstadoDaRodada>(
    () => ({ ativo: pronto && !passo && !explicando && !onb, pausado: !!passo || explicando || !!onb, placar }),
    [pronto, passo, explicando, onb],
  );

  return (
    <Contexto.Provider value={estado}>
      <Tela largura="larga">
        <CabecalhoDeTela
          voltar={{ rotulo: 'Jogar', aoClicar: () => setPasso('sair') }}
          sobrancelha={`Rodada · ${total} ${unidade}${!questNovo && nivel !== 'medio' && jogoTemNiveis(jogo) ? ` · ${nomeDoNivel(nivel)}` : ''}`}
          icone={Gamepad2}
          titulo={titulo}
          acoes={
            questNovo ? (
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
            ) : (
              <>
                {/* A EXPLICAÇÃO A UM TOQUE, sem passar pela pausa: quem não entendeu a regra no meio da
                    rodada não sabe que ela mora atrás de "Pausar". Abrir para o relógio, como a pausa. */}
                <button
                  type="button"
                  className="btn btn-outline peq"
                  data-acao="como"
                  aria-label={t('Como se joga')}
                  title={t('Como se joga')}
                  onClick={() => setExplicando(true)}
                >
                  <CircleHelp aria-hidden />
                </button>
                <button type="button" className="btn btn-outline peq" aria-keyshortcuts="Escape" onClick={pausar}>
                  <Pause aria-hidden /> Pausar
                </button>
                {/* `data-acao`: no Quest o topo fica com a saída e a pausa; recomeçar está dentro da pausa
                    (`styles/questJogar.css`). */}
                <button type="button" className="btn btn-outline peq" data-acao="recomecar" onClick={onRecomecar}>
                  <RotateCcw aria-hidden /> Recomeçar
                </button>
              </>
            )
          }
        />
        <section
          ref={palcoRef}
          className="palco-jogo"
          id="palco"
          aria-busy={!pronto}
          style={pronto ? undefined : { pointerEvents: 'none' }}
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

  /* META QUEST (segunda rodada, 01/10/2026): a mesma pausa e a mesma confirmação, nas peças do headset.
     "Continuar" é o único botão principal; os sons viram um ajuste em linha com o interruptor grande; a
     dica de atalho de teclado só aparece onde há teclado físico (o headset não tem; o computador com o
     desenho novo tem, e Esc e P continuam pausando). */
  const questNovo = useQuestNovo();
  const comTeclado = recursosDoAparelho(perfilDoDispositivo()).tecladoFisico;
  if (questNovo) {
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
                  {t(
                    'Esta rodada não conta para a revisão nem para os recordes. As palavras continuam no seu caderno.',
                  )}
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

  return (
    <dialog ref={ref} className="m-auto" aria-labelledby={idTitulo}>
      {passo === 'menu' ? (
        <div className="pausa">
          <div className="emoji" aria-hidden>
            <Pause />
          </div>
          <span className="label-mono">Rodada em pausa</span>
          <h2 id={idTitulo}>{titulo}</h2>
          <p className="mut tn">
            {placar.pontos} pontos · {placar.acertos} acertos · o relógio parou
          </p>
          <div className="pilha" style={{ marginTop: 18 }}>
            <button type="button" className="btn btn-solid bloco" autoFocus onClick={aoContinuar}>
              <Play aria-hidden /> Continuar
            </button>
            <button type="button" className="btn btn-outline bloco" onClick={aoRecomecar}>
              <RotateCcw aria-hidden /> Recomeçar
            </button>
            <button type="button" className="btn btn-outline bloco" onClick={aoComoSeJoga}>
              <CircleHelp aria-hidden /> Como se joga
            </button>
            <SeletorDeNivel jogo={jogo} aoTrocar={aoRecomecar} />
            {som && (
              <div className="op-linha" style={{ padding: '6px 4px' }}>
                <b>
                  <Volume2 aria-hidden style={{ display: 'inline-block', width: 16, height: 16, verticalAlign: -3 }} />{' '}
                  Sons
                </b>
                <button
                  type="button"
                  className={`interruptor ${som.ligado ? 'on' : ''}`}
                  role="switch"
                  aria-checked={som.ligado}
                  aria-label="Sons do jogo"
                  onClick={som.alternar}
                >
                  <span />
                </button>
              </div>
            )}
            <button type="button" className="btn btn-outline bloco perigo" onClick={aoPedirSair}>
              <LogOut aria-hidden /> Sair da rodada
            </button>
          </div>
          {/* Onde não há teclado (headset, celular) a dica de atalho some (`styles/dispositivo.css`). */}
          <p className="mut" data-precisa="teclado" style={{ fontSize: 12, marginTop: 12 }}>
            <kbd>Esc</kbd>
            {pausaComP && (
              <>
                {' '}
                ou <kbd>P</kbd>
              </>
            )}{' '}
            pausa e continua
          </p>
        </div>
      ) : (
        <>
          <div className="dlg-cab">
            <IconeEmBloco icone={DoorOpen} />
            <div style={{ minWidth: 0 }}>
              <h2 id={idTitulo}>Sair sem terminar?</h2>
              <p className="mut" style={{ fontSize: 13 }}>
                Esta rodada não conta para a revisão nem para os recordes. As palavras continuam no seu caderno.
              </p>
            </div>
            <button type="button" className="x" aria-label="Fechar" onClick={aoContinuar}>
              <X aria-hidden />
            </button>
          </div>
          <div className="dlg-pe">
            <button type="button" className="btn btn-outline" autoFocus onClick={aoVoltarAoMenu}>
              Continuar jogando
            </button>
            <button type="button" className="btn btn-solid perigo-solid" onClick={aoSair}>
              <LogOut aria-hidden /> Sair da rodada
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
