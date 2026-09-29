import '../../../../styles/capturaNoCelular.css';

import {
  ArrowLeftRight,
  CircleHelp,
  Cpu,
  Hand,
  Loader2,
  Mic,
  MicOff,
  PictureInPicture2,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Type,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { t } from '../../../../lib/i18n';

export interface LadoDoPar {
  rotulo: string;
  nome: ReactNode;
}

/**
 * A ABA CAPTURAR NO CELULAR — a maquete aprovada pelo dono (2026-09-29: "adaptar a aplicação para
 * que ela tenha um design focado no mobile"). O mesmo sistema visual (tokens, cartão escuro, ícones
 * lucide), reorganizado para uma mão só:
 *
 *  · PRONTO: o par de idiomas num controle só (troca num toque), a conversa ou o vazio que ensina
 *    com os passos do celular, o modo (Privado/Rápido) dito com "Trocar", e embaixo, ao alcance do
 *    polegar, UM microfone grande com Opções e Flutuante do lado. Os cinco botões empilhados do
 *    computador (Iniciar, Microfone, Legendas, Idiomas, Foco) saíram daqui.
 *  · GRAVANDO: a conversa ocupa a tela (a barra de abas do app some, como numa chamada), uma barra
 *    fina no alto (tempo, som entrando, par, texto) e a doca embaixo: Mudo, Encerrar, Flutuante.
 *
 * Só apresentação: o estado e os efeitos continuam em `LiveCapture` (o mesmo `iniciarCaptura`, o
 * mesmo `handleStopRecording`); a conversa e os avisos chegam prontos.
 */
export default function CapturaNoCelular({
  gravando,
  abrindo,
  retomar,
  tempo,
  ondas,
  lados,
  aoTrocarLados,
  aoAbrirIdiomas,
  parCurto,
  modo,
  aoTrocarModo,
  micLigado,
  micAbrindo,
  aoAlternarMic,
  flutuante,
  podeIniciar,
  aoIniciar,
  aoParar,
  aoAbrirOpcoes,
  aoAbrirAjuda,
  aoAbrirVisual,
  temFalas,
  conversa,
  avisos,
  rodape,
}: {
  gravando: boolean;
  abrindo: boolean;
  /** Há uma sessão salva a continuar (o botão diz "Continuar"). */
  retomar: boolean;
  tempo: string;
  /**
   * As ondas do nível, prontas (`OndasDoNivel` com `variante="celular"`). Chegam como nó, e não como
   * a lista de níveis: a lista mudava a cada 50 ms e re-renderizava esta tela e a de cima inteiras.
   */
  ondas: ReactNode;
  lados: [LadoDoPar, LadoDoPar];
  /** Troca os dois lados; ausente quando um lado é "Detectar" (não há o que trocar). */
  aoTrocarLados?: () => void;
  aoAbrirIdiomas: () => void;
  parCurto: ReactNode;
  modo: { privado: boolean; rotulo: string; sub: string } | null;
  aoTrocarModo?: () => void;
  micLigado: boolean;
  micAbrindo: boolean;
  aoAlternarMic: (ligado: boolean) => void;
  flutuante: { ativo: boolean; alternar: () => void };
  podeIniciar: boolean;
  aoIniciar: () => void;
  aoParar: () => void;
  aoAbrirOpcoes: () => void;
  aoAbrirAjuda: () => void;
  aoAbrirVisual: () => void;
  temFalas: boolean;
  conversa: ReactNode;
  avisos?: ReactNode;
  rodape?: ReactNode;
}) {
  const botaoFlutuante = (
    <div className="cel-lat">
      <button
        type="button"
        className="cel-ib"
        role="switch"
        aria-checked={flutuante.ativo}
        aria-label={t('Legendas flutuantes')}
        data-ligado={flutuante.ativo || undefined}
        onClick={flutuante.alternar}
      >
        <PictureInPicture2 aria-hidden />
      </button>
      <span aria-hidden>{t('Flutuante')}</span>
    </div>
  );

  if (gravando) {
    return (
      <div className="cel cel-gravando" data-testid="captura-no-celular">
        <div className="cel-barra">
          <span className="cel-aovivo" aria-label={t('Gravando há {tempo}', { tempo })}>
            <span className="cel-ponto" aria-hidden />
            <span className="tn">{tempo}</span>
          </span>
          {ondas}
          <button type="button" className="cel-chip" onClick={aoAbrirIdiomas} aria-label={t('Idiomas da sessão')}>
            {parCurto}
          </button>
          <button type="button" className="cel-ib peq" onClick={aoAbrirVisual} aria-label={t('Texto e tradução')}>
            <Type aria-hidden />
          </button>
        </div>
        {avisos}
        <div className="cel-conversa">{conversa}</div>
        <div className="cel-doca escura">
          <div className="cel-lat">
            <button
              type="button"
              className="cel-ib"
              role="switch"
              aria-checked={micLigado}
              aria-label={micLigado ? t('Microfone ativo') : t('Microfone mudo')}
              data-ligado={!micLigado || undefined}
              disabled={micAbrindo}
              onClick={() => aoAlternarMic(!micLigado)}
            >
              {micAbrindo ? <Loader2 aria-hidden className="animate-spin" /> : micLigado ? <Mic aria-hidden /> : <MicOff aria-hidden />}
            </button>
            <span aria-hidden>{micLigado ? t('Mudo') : t('Ativar')}</span>
          </div>
          <button type="button" className="cel-parar" onClick={aoParar} aria-label={t('Parar captura')} data-sfx="none">
            <i aria-hidden />
          </button>
          {botaoFlutuante}
        </div>
      </div>
    );
  }

  return (
    <div className="cel" data-testid="captura-no-celular">
      <div className="cel-topo">
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="cel-sobrancelha">
            <Cpu aria-hidden /> {t('Transcrição no aparelho')}
          </p>
          <h1 className="cel-titulo">{t('Capturar')}</h1>
        </div>
        <button type="button" className="cel-ib peq" onClick={aoAbrirAjuda} aria-label={t('Ajuda')}>
          <CircleHelp aria-hidden />
        </button>
      </div>

      <div className="cel-par">
        <button type="button" className="cel-lado" onClick={aoAbrirIdiomas}>
          <small>{lados[0].rotulo}</small>
          <b>{lados[0].nome}</b>
        </button>
        {aoTrocarLados ? (
          <button type="button" className="cel-troca" onClick={aoTrocarLados} aria-label={t('Trocar os idiomas')}>
            <ArrowLeftRight aria-hidden />
          </button>
        ) : (
          <span className="cel-troca" aria-hidden>
            <ArrowLeftRight />
          </span>
        )}
        <button type="button" className="cel-lado fim" onClick={aoAbrirIdiomas}>
          <small>{lados[1].rotulo}</small>
          <b>{lados[1].nome}</b>
        </button>
      </div>

      {avisos}

      <div className="cel-meio">
        {temFalas ? (
          <div className="cel-conversa cartao-escuro">{conversa}</div>
        ) : (
          <section className="cel-vazio" aria-label={t('Como começar')}>
            <h2>{t('Sua conversa aparece aqui')}</h2>
            <div className="cel-passo">
              <span aria-hidden>
                <Play />
              </span>
              <p>
                <b>{t('Dê play')}</b> {t('no vídeo ou na aula, ou peça para a pessoa falar perto do celular.')}
              </p>
            </div>
            <div className="cel-passo">
              <span aria-hidden>
                <Mic />
              </span>
              <p>
                <b>{t('Toque no microfone')}</b> {t('aqui embaixo. A legenda aparece em segundos.')}
              </p>
            </div>
            <div className="cel-passo">
              <span aria-hidden>
                <Hand />
              </span>
              <p>
                <b>{t('Toque numa frase')}</b> {t('para ouvir de novo, devagar, ou guardar palavras.')}
              </p>
            </div>
            <p className="cel-aviso" data-testid="aviso-sem-audio-do-sistema">
              {t('No celular, o som de outros apps não entra: a legenda vem do microfone.')}
            </p>
            {modo && (
              <div className="cel-modo">
                {modo.privado ? <ShieldCheck aria-hidden className="ok" /> : <Zap aria-hidden />}
                <span>
                  <b>{modo.rotulo}</b>
                  {modo.sub}
                </span>
                {aoTrocarModo && (
                  <button type="button" onClick={aoTrocarModo}>
                    {t('Trocar')}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
        {rodape}
      </div>

      <div className="cel-doca">
        <div className="cel-lat">
          <button type="button" className="cel-ib" onClick={aoAbrirOpcoes} aria-label={t('Opções da captura')}>
            <SlidersHorizontal aria-hidden />
          </button>
          <span aria-hidden>{t('Opções')}</span>
        </div>
        <div className="cel-centro">
          <button
            type="button"
            className="cel-mic"
            onClick={aoIniciar}
            disabled={!podeIniciar || abrindo}
            aria-label={retomar ? t('Continuar captura') : t('Iniciar captura')}
          >
            {abrindo ? <Loader2 aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
          </button>
          <span className="cel-rotulo-mic" aria-hidden>
            {abrindo ? t('Abrindo o microfone…') : retomar ? t('Toque para continuar') : t('Toque para ouvir')}
          </span>
        </div>
        {botaoFlutuante}
      </div>
    </div>
  );
}
