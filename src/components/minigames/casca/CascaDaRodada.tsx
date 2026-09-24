import type { MinigameId } from '@core';
import { CircleHelp, DoorOpen, Gamepad2, LogOut, Pause, Play, RotateCcw, Volume2, X } from 'lucide-react';
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

import { contagem321, entradaDeCamera } from '../../../lib/juice';
import type { AgeProfileType } from '../../../lib/profile';
import { CabecalhoDeTela, IconeEmBloco, Tela } from '../../ui';
import ComoSeJoga from '../ComoSeJoga';

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
  const placar = useRef({ pontos: 0, acertos: 0 });
  const [pronto, setPronto] = useState(false);
  const [passo, setPasso] = useState<Passo>(null);
  const [explicando, setExplicando] = useState(false);

  /* A contagem roda uma vez por montagem — "Recomeçar" remonta a casca (chave nova em Play.tsx),
     então a rodada recomeçada também conta 3-2-1. */
  useEffect(() => {
    let vivo = true;
    entradaDeCamera(palcoRef.current);
    void contagem321('Vai!', palcoRef.current).then(() => {
      if (vivo) setPronto(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const pausar = useCallback(() => setPasso('menu'), []);
  const continuar = useCallback(() => setPasso(null), []);

  // Esc ou P pausam; com a pausa aberta, P continua (o Esc do <dialog> nativo já fecha).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (explicando || e.ctrlKey || e.metaKey || e.altKey) return;
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
  }, [passo, explicando, pausar, continuar, pausaComP]);

  const estado = useMemo<EstadoDaRodada>(
    () => ({ ativo: pronto && !passo && !explicando, pausado: !!passo || explicando, placar }),
    [pronto, passo, explicando],
  );

  return (
    <Contexto.Provider value={estado}>
      <Tela largura="larga">
        <CabecalhoDeTela
          voltar={{ rotulo: 'Jogar', aoClicar: () => setPasso('sair') }}
          sobrancelha={`Rodada · ${total} ${unidade}`}
          icone={Gamepad2}
          titulo={titulo}
          acoes={
            <>
              <button type="button" className="btn btn-outline peq" aria-keyshortcuts="Escape" onClick={pausar}>
                <Pause aria-hidden /> Pausar
              </button>
              <button type="button" className="btn btn-outline peq" onClick={onRecomecar}>
                <RotateCcw aria-hidden /> Recomeçar
              </button>
            </>
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
            {som && (
              <div className="op-linha" style={{ padding: '6px 4px' }}>
                <b>
                  <Volume2 aria-hidden style={{ width: 16, height: 16, verticalAlign: -3 }} /> Sons
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
          <p className="mut" style={{ fontSize: 12, marginTop: 12 }}>
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
