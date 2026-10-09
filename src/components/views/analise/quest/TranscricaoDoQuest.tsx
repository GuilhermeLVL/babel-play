import {
  AlertTriangle,
  BookOpen,
  CircleHelp,
  MessagesSquare,
  MoreHorizontal,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import { Fragment, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';

import type { FalaDaAnalise } from '../../../../lib/analise/tiposDaAnalise';
import { t } from '../../../../lib/i18n';
import {
  criarMarcador,
  ESPERA_DO_AVISO_MS,
  type GuiaDaFala,
  pedacosDaFrase,
  seguirFala,
} from '../../../../lib/polimento/sessao';
import { toast } from '../../../Toast';
import { Dialogo, fecharDialogoDe } from '../../../ui';

/** Um ajuste de "Ajustar exibição": o nome, as opções e a escolhida. */
export interface AjusteDeExibicao {
  rotulo: string;
  opcoes: ReadonlyArray<readonly [valor: string, rotulo: string]>;
  atual: string;
  aoEscolher: (valor: string) => void;
}

/** Uma palavra desta sessão que já está no caderno. */
interface PalavraDaSessao {
  id: string;
  word: string;
  translation?: string;
  cefrLevel?: string;
  sentence?: string;
}

/**
 * A ABA TRANSCRIÇÃO DO DESENHO NOVO — a marcação do primeiro painel de `PAINEIS_DA_SESSAO`
 * (`telas3.js:64-70`): três chips, as falas com CADA PALAVRA numa `span.w`, e o player preso embaixo.
 *
 *   · tocar numa fala (ou em "Opções da fala") abre a folha da frase, a mesma da captura
 *     (`telas3.js:175-177`, item D53); quem a monta é a `Analysis`;
 *   · "Ouvir este trecho" faz o player recomeçar daquela fala (`telas3.js:174`);
 *   · enquanto toca, a fala ativa acende e as palavras dela vão sendo marcadas (`tocar()`,
 *     `telas3.js:28-62`, item D51), em `lib/polimento/sessao.ts`, no tempo do som de verdade: pausar
 *     mantém o que já foi marcado, retomar continua, e um salto recomeça limpo.
 *
 * Só apresentação: nenhuma regra mora aqui. A `Analysis` entrega as falas, o estado e as ações.
 */
export default function TranscricaoDoQuest({
  falas,
  estado,
  aoTentarDeNovo,
  documento,
  indiceAtivo,
  tocando,
  classes,
  traducaoPrimeiro,
  ocultarOriginal,
  traducaoDe,
  idiomaDaTraducao,
  procedencia,
  player,
  palavras,
  podeOuvir,
  aoOuvir,
  aoAbrirFala,
  aoAbrirPalavra,
  ajustes,
  audio,
  velocidade = 1,
  palavraFalada,
  vozAvisaPalavra = true,
}: {
  falas: readonly FalaDaAnalise[];
  /** A transcrição ainda está vindo, chegou, ou o pedido falhou. */
  estado: 'carregando' | 'pronta' | 'erro';
  aoTentarDeNovo: () => void;
  /** Sessão de documento: sem player e sem tempo. */
  documento: boolean;
  /** A fala em que o player está (`-1` = nenhuma). */
  indiceAtivo: number;
  /** O player está tocando: só então a fala acende e as palavras são marcadas. */
  tocando: boolean;
  /** As classes de "Ajustar exibição" (`t-sepia f-serif s-grande`), as mesmas da tela de sempre. */
  classes: string;
  traducaoPrimeiro: boolean;
  ocultarOriginal: boolean;
  /** A tradução que a fala mostra agora (a polida, quando é ela a escolhida). */
  traducaoDe: (fala: FalaDaAnalise) => { texto: string; polida: boolean };
  /** O idioma da tradução, para o `lang` da linha traduzida. */
  idiomaDaTraducao?: string;
  /** De onde veio a transcrição (o chip "Procedência" diz isto ao toque). */
  procedencia: string | null;
  /** A faixa do player, já montada. Documento não tem. */
  player?: ReactNode;
  palavras: readonly PalavraDaSessao[];
  /** Há como ouvir esta fala aqui (o áudio gravado, ou uma voz para o idioma dela)? */
  podeOuvir: (fala: FalaDaAnalise) => boolean;
  /** "Ouvir este trecho": o player recomeça desta fala. */
  aoOuvir: (fala: FalaDaAnalise) => void;
  /** Abre a folha da frase desta fala. */
  aoAbrirFala: (fala: FalaDaAnalise) => void;
  aoAbrirPalavra: (palavra: string, frase: string) => void;
  ajustes: readonly AjusteDeExibicao[];
  /** O `<audio>` do áudio gravado. Com ele, a marcação das palavras segue o tempo do áudio. */
  audio?: RefObject<HTMLAudioElement | null>;
  /** Sem áudio gravado, a velocidade da voz que narra (a cadência da marcação a acompanha). */
  velocidade?: number;
  /**
   * Sem áudio gravado: a tela põe aqui quem recebe o aviso de palavra da voz (`boundary`), e o player
   * o chama com a posição da fala e o caractere que está sendo dito.
   */
  palavraFalada?: { current: ((posicao: number, charIndex: number) => void) | null };
  /** A voz que narra avisa a palavra? A voz do site (o headset) não avisa: vale só a cadência. */
  vozAvisaPalavra?: boolean;
}) {
  const [verPalavras, setVerPalavras] = useState(false);
  const [ajustando, setAjustando] = useState(false);

  /* O PLAYER MARCA PALAVRA POR PALAVRA (`tocar()` e `pararPlayer()`, `telas3.js:16-62`), e quem manda é
     o SOM. Com áudio gravado, a fala e a palavra saem do tempo do `<audio>`; sem ele, da voz que
     narra. Pausar mantém o que já foi marcado; um salto (anterior, próxima, "Ouvir este trecho")
     recomeça limpo, como `tocar(i)` no protótipo. */
  const raiz = useRef<HTMLDivElement>(null);
  const marcador = useMemo(() => criarMarcador(() => raiz.current), []);
  const linhaDeAntes = useRef(-1);
  const posicao = tocando && !documento ? falas.findIndex((f) => f.index === indiceAtivo) : -1;
  const falasDeAgora = useRef(falas);
  falasDeAgora.current = falas;

  /* ÁUDIO GRAVADO: a cada quadro (e a cada `timeupdate`, para a aba em segundo plano), a fala em que o
     áudio está e a fração dela que já tocou dizem quantas palavras marcar. As gravações não guardam o
     tempo de cada palavra: dentro da fala a marcação é proporcional, do começo ao fim gravados dela. */
  useEffect(() => {
    if (!audio || !tocando || documento) return;
    let quadro = 0;
    let feito = '';
    const acerta = () => {
      const a = audio.current;
      const todas = falasDeAgora.current;
      if (!a) return;
      const t = a.currentTime;
      let i = -1;
      for (let n = 0; n < todas.length; n++) if (todas[n].startTime <= t) i = n;
      if (i < 0) return;
      const fala = todas[i];
      const inicio = fala.inicioExato ?? fala.startTime;
      const fim =
        fala.fimExato && fala.fimExato > inicio
          ? fala.fimExato
          : (todas[i + 1]?.startTime ?? (Number.isFinite(a.duration) && a.duration > inicio ? a.duration : inicio + 6));
      const n = pedacosDaFrase(fala.original).length;
      const fracao = Math.min(1, Math.max(0, (t - inicio) / Math.max(0.05, fim - inicio)));
      const k = t < inicio ? 0 : Math.min(n, Math.floor(fracao * n) + 1);
      if (feito === `${i}:${k}`) return;
      feito = `${i}:${k}`;
      const antes = linhaDeAntes.current;
      if (antes !== -1 && i !== antes && i !== antes + 1) marcador.parar();
      marcador.ate(i, k);
      linhaDeAntes.current = i;
    };
    const laco = () => {
      acerta();
      quadro = requestAnimationFrame(laco);
    };
    laco();
    const a = audio.current;
    a?.addEventListener('timeupdate', acerta);
    return () => {
      cancelAnimationFrame(quadro);
      a?.removeEventListener('timeupdate', acerta);
    };
  }, [audio, tocando, documento, marcador]);

  /* SEM ÁUDIO GRAVADO: o player narra por voz, fala a fala. A palavra é a que a voz avisa; a voz que
     não avisa segue a cadência estimada pela velocidade. Pausar cala a voz e retomar relê a fala: a
     marcação dela recomeça junto. */
  const guia = useRef<GuiaDaFala | null>(null);
  useEffect(() => {
    if (audio) return;
    if (posicao < 0) {
      marcador.pausar();
      guia.current = null;
      return;
    }
    const antes = linhaDeAntes.current;
    if (antes !== -1 && posicao !== antes && posicao !== antes + 1) marcador.parar();
    linhaDeAntes.current = posicao;
    const fala = falasDeAgora.current[posicao];
    guia.current = seguirFala(marcador, {
      linha: posicao,
      texto: fala.original || fala.translation || '',
      palavras: pedacosDaFrase(fala.original),
      velocidade,
    });
    guia.current.comecou(vozAvisaPalavra ? ESPERA_DO_AVISO_MS : 0);
  }, [audio, posicao, marcador, velocidade, vozAvisaPalavra]);
  useEffect(() => {
    if (!palavraFalada) return;
    palavraFalada.current = (p, charIndex) => {
      if (p === linhaDeAntes.current) guia.current?.palavra(charIndex);
    };
    return () => {
      palavraFalada.current = null;
    };
  }, [palavraFalada]);
  useEffect(() => () => marcador.parar(), [marcador]);

  const barra = (
    <div className="q-acoes qs-barra">
      <button
        type="button"
        className="q-chip"
        data-testid="procedencia"
        onClick={() =>
          toast.info(
            procedencia
              ? t('Procedência: {origem}', { origem: procedencia })
              : t('Esta sessão não registrou de onde veio a transcrição.'),
          )
        }
      >
        <CircleHelp aria-hidden /> {t('Procedência')}
      </button>
      <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setVerPalavras(true)}>
        <BookOpen aria-hidden /> {t('Palavras desta sessão')} <span className="qs-n">{palavras.length}</span>
      </button>
      <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setAjustando(true)}>
        <SlidersHorizontal aria-hidden /> {t('Ajustar exibição')}
      </button>
    </div>
  );

  return (
    <>
      {barra}

      {estado === 'carregando' ? (
        <div
          className="q-lista"
          aria-busy="true"
          aria-label={t('Carregando a transcrição')}
          data-testid="falas-carregando"
        >
          <div className="q-esqueleto qs-esqueleto" />
          <div className="q-esqueleto qs-esqueleto" />
          <div className="q-esqueleto qs-esqueleto" />
        </div>
      ) : estado === 'erro' ? (
        <div className="q-vazio" role="alert">
          <span className="q-ic">
            <AlertTriangle aria-hidden />
          </span>
          <h2>{t('Não deu para carregar a transcrição')}</h2>
          <p>{t('Confira a conexão e tente de novo. A gravação continua guardada.')}</p>
          <button type="button" className="q-ctl pri" onClick={aoTentarDeNovo}>
            <RotateCcw aria-hidden /> {t('Tentar de novo')}
          </button>
        </div>
      ) : falas.length === 0 ? (
        <div className="q-vazio">
          <span className="q-ic">
            <MessagesSquare aria-hidden />
          </span>
          <h2>{t('Sem texto nesta sessão')}</h2>
          <p>{t('Esta gravação não tem transcrição. Quando houver falas, elas aparecem aqui, com a tradução.')}</p>
        </div>
      ) : (
        <div
          ref={raiz}
          className={`transcrito qs-falas ${classes}`}
          role="group"
          aria-label={documento ? t('Texto da sessão') : t('Transcrição da sessão')}
        >
          {falas.map((fala, i) => {
            const traducao = traducaoDe(fala);
            const original = !ocultarOriginal && (
              <span className="qs-o" lang={fala.lang || undefined}>
                {pedacosDaFrase(fala.original).map((p, k) => (
                  // As palavras de uma fala não mudam de ordem: o índice é a identidade delas.
                  <Fragment key={k}>
                    {k > 0 && ' '}
                    <span className="w">{p}</span>
                  </Fragment>
                ))}
              </span>
            );
            const traduzida = traducao.texto && (
              <span
                className="qs-t"
                lang={idiomaDaTraducao || undefined}
                data-polida={traducao.polida ? '' : undefined}
              >
                {traducao.texto}
              </span>
            );
            const ativa = i === posicao;
            return (
              <div key={fala.index} className={ativa ? 'qs-fala ativa' : 'qs-fala'} data-fala={fala.index}>
                <button
                  type="button"
                  className="qs-fala-texto"
                  aria-haspopup="dialog"
                  aria-current={ativa ? 'true' : undefined}
                  onClick={() => aoAbrirFala(fala)}
                >
                  <span className="qs-meta">
                    <span className="qs-quem">{fala.speaker}</span>
                    {fala.time && <span className="qs-tempo tn">{fala.time}</span>}
                    {traducao.polida && <span className="q-tag">{t('Polida')}</span>}
                  </span>
                  {traducaoPrimeiro ? (
                    <>
                      {traduzida}
                      {original}
                    </>
                  ) : (
                    <>
                      {original}
                      {traduzida}
                    </>
                  )}
                </button>
                <div className="qs-acoes-da-fala">
                  {podeOuvir(fala) && !documento && (
                    <button
                      type="button"
                      className="q-ctl"
                      aria-label={t('Ouvir este trecho')}
                      data-px-ouvir={fala.index}
                      onClick={() => aoOuvir(fala)}
                    >
                      <Volume2 aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    className="q-ctl"
                    aria-label={t('Opções da fala')}
                    aria-haspopup="dialog"
                    data-px-opcoes={fala.index}
                    onClick={() => aoAbrirFala(fala)}
                  >
                    <MoreHorizontal aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {player}

      {/* AS PALAVRAS DESTA SESSÃO que já estão no caderno. */}
      {verPalavras && (
        <Dialogo
          icone={BookOpen}
          titulo={t('Palavras desta sessão')}
          sub={t('As que esta gravação já pôs no seu caderno.')}
          aoFechar={() => setVerPalavras(false)}
        >
          {palavras.length ? (
            <div className="dlg-corpo qs-miolo q-lista">
              {palavras.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="q-linha"
                  onClick={(e) => {
                    fecharDialogoDe(e.currentTarget);
                    aoAbrirPalavra(c.word.toLowerCase(), c.sentence || c.word);
                  }}
                >
                  <span>
                    <b>{c.word}</b>
                    {c.translation && <small>{c.translation}</small>}
                  </span>
                  {c.cefrLevel && <span className="q-fim">{c.cefrLevel}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="dlg-corpo qs-miolo">
              <p className="q-texto">
                {t(
                  'Nenhuma palavra desta sessão foi para o caderno ainda. Toque numa fala e depois numa palavra para analisá-la e guardá-la.',
                )}
              </p>
            </div>
          )}
        </Dialogo>
      )}

      {/* AJUSTAR EXIBIÇÃO: os mesmos cinco ajustes, um por linha. */}
      {ajustando && (
        <Dialogo
          icone={SlidersHorizontal}
          titulo={t('Ajustar exibição')}
          sub={t('Vale para o texto desta tela.')}
          aoFechar={() => setAjustando(false)}
        >
          <div className="dlg-corpo qs-miolo qs-ajustes">
            {ajustes.map((a) => (
              <div key={a.rotulo} className="q-ajuste">
                <b>{a.rotulo}</b>
                <div className="q-abas q-seg" role="group" aria-label={a.rotulo}>
                  {a.opcoes.map(([valor, rotulo]) => (
                    <button
                      key={valor}
                      type="button"
                      className="q-aba"
                      aria-pressed={a.atual === valor}
                      onClick={() => a.aoEscolher(valor)}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialogo>
      )}
    </>
  );
}
