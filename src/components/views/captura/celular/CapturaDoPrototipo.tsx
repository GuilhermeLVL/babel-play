import '../../../../styles/capturaNoCelular.css';
import '../../../../styles/polimentoCaptura.css';

import {
  ChevronDown,
  CircleQuestionMark,
  Cpu,
  Languages,
  Mic,
  PictureInPicture2,
  SlidersHorizontal,
} from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '../../../../lib/i18n';
import { afundarBotao, celular, entrarPronta, sairMiolo } from '../../../../lib/polimento/captura';
import { entrarNivel } from '../../../../lib/polimento/niveis';
import { type NiveisDaCaptura, useNiveisDaCaptura } from '../niveis/useNiveisDaCaptura';

/**
 * CAPTURAR NO DESENHO NOVO — a tela do protótipo de polimento, em todo aparelho (`direto.js:25-62`,
 * `telas.js:78-91`; itens D6–D10 de `fidelidade/casca-e-telas.md`).
 *
 * Abre PRONTA, não gravando: o topo (idiomas, modelo, microfone, ajustes, ajuda), o miolo que diz o
 * que fazer e a faixa de baixo com "Iniciar captura". O microfone só liga no toque em Iniciar. Ao
 * gravar, a mesma tela: o miolo sai, a legenda ocupa o meio e o botão vira "Encerrar".
 *
 * Só apresentação: o estado e os efeitos continuam em `LiveCapture` (o mesmo `iniciarCaptura`, o
 * mesmo `handleStopRecording`); a legenda e os avisos chegam prontos.
 *
 * O NÍVEL DE SERVIÇO (protótipo `anuncios-no-gratis`, `planos4.js:251-298`): com `niveis`, a tela ganha
 * a fileira `.pl-linha` logo abaixo do topo (seletor, marca, medidor), a marca no topo e a nota no
 * miolo. As peças e o dado real moram em `../niveis/`.
 */
export default function CapturaDoPrototipo({
  gravando,
  temFalas,
  abrindo,
  tempo,
  par,
  parCurto,
  modelo,
  micLigado,
  micAbrindo,
  aoAlternarMic,
  podeIniciar,
  aoIniciar,
  aoParar,
  aoAbrirIdiomas,
  aoAbrirModelo,
  aoAbrirAjustes,
  aoAbrirAjuda,
  aoFlutuante,
  letra,
  legenda,
  avisos,
  niveis,
  noQuest = false,
}: {
  gravando: boolean;
  /** Já há falas na tela (mesmo parada). */
  temFalas: boolean;
  /** O navegador ainda está abrindo o microfone ou o som do aparelho. */
  abrindo: boolean;
  tempo: string;
  /** O par por extenso ("Detectar → Português"). */
  par: string;
  /** O par em siglas ("EN → PT"). */
  parCurto: string;
  /** O que transcreve ("Modelo local · 589 MB"). */
  modelo: string;
  micLigado: boolean;
  micAbrindo: boolean;
  aoAlternarMic: (ligado: boolean) => void;
  podeIniciar: boolean;
  aoIniciar: () => void;
  aoParar: () => void;
  aoAbrirIdiomas: () => void;
  aoAbrirModelo: () => void;
  aoAbrirAjustes: () => void;
  aoAbrirAjuda: () => void;
  /** Abre ou fecha as legendas flutuantes. Ausente = sem o botão (onde não há janela flutuante). */
  aoFlutuante?: () => void;
  letra: { menor: () => void; maior: () => void; noMinimo: boolean; noMaximo: boolean };
  /** A legenda ao vivo (`HistoricoDoPrototipo`), usada enquanto grava. */
  legenda: ReactNode;
  avisos?: ReactNode;
  /** O nível de serviço (seletor, marca, medidor e folhas). Ausente = a tela de antes, sem a fileira. */
  niveis?: NiveisDaCaptura;
  /** No Quest a captura fica como está: só o seletor e a marca. */
  noQuest?: boolean;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const principal = useRef<HTMLButtonElement>(null);
  const miolo = useRef<HTMLDivElement>(null);
  const nivel = useNiveisDaCaptura(niveis, { gravando, noQuest, modelo, aoAbrirModelo });
  /* Pronta é a tela de quem ainda não tem nada: parada, com falas na tela (uma captura retomada, um
     salvar que ficou para depois), a legenda continua à vista. */
  const semNada = !gravando && !temFalas;
  /* A tela pronta fica mais um instante quando a gravação começa: o tempo de o miolo sair
     (`iniciarVivo()` de `direto.js:54-61`). */
  const [pronta, setPronta] = useState(semNada);
  useLayoutEffect(() => {
    if (semNada === pronta) return;
    if (semNada) {
      setPronta(true);
      return;
    }
    let vivo = true;
    const comecou = () => {
      if (vivo) setPronta(false);
    };
    const relogio = window.setTimeout(comecou, 400); /* a legenda nunca fica esperando uma animação presa */
    void sairMiolo(miolo.current).then(comecou);
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
    };
  }, [semNada, pronta]);

  /* `prepararVivo()` de `direto.js:43-46`: a cada vez que a tela pronta aparece. */
  useLayoutEffect(() => {
    if (!pronta || !raiz.current) return;
    entrarPronta(raiz.current);
    entrarNivel(raiz.current); /* `planos4.js:297` */
  }, [pronta]);

  /* `direto.js:15-20`: já na captura pronta, tocar de novo em Capturar na navegação começa a gravar. */
  const iniciar = useRef(aoIniciar);
  iniciar.current = aoIniciar;
  useEffect(() => {
    if (!semNada || !podeIniciar || abrindo) return;
    /* O toque que TROUXE a pessoa para cá não conta: só o seguinte, já com a tela pronta à vista. */
    const desde = performance.now();
    const aoClicar = (e: MouseEvent) => {
      const item = (e.target as Element | null)?.closest?.('.q-trilho .q-item:not(.q-mais-botao)');
      if (!item || item.getAttribute('aria-current') !== 'page' || !raiz.current?.isConnected) return;
      if (e.timeStamp <= desde) return;
      comecar();
    };
    document.addEventListener('click', aoClicar);
    return () => document.removeEventListener('click', aoClicar);
  }, [semNada, podeIniciar, abrindo]);

  /** `iniciarVivo()` de `direto.js:48-62`: o botão responde na hora; o miolo sai quando a gravação começa. */
  function comecar() {
    afundarBotao(principal.current);
    iniciar.current();
  }

  return (
    <div
      ref={raiz}
      className={`cel cel-gravando quest-vivo px-vivo${pronta ? ' px-pronto' : ''}${!pronta && !gravando ? ' px-parada' : ''}`}
      data-testid="captura-do-prototipo"
    >
      <div className="px-vivo-topo">
        <button type="button" className="q-chip" onClick={aoAbrirIdiomas}>
          <Languages aria-hidden /> {par} <ChevronDown aria-hidden />
        </button>
        {/* `planos4.js:266-268`: o chip "Modelo local" só diz a verdade com o modelo local em uso. */}
        <button type="button" className="q-chip px-so-largo" hidden={nivel.modeloOculto} onClick={aoAbrirModelo}>
          <Cpu aria-hidden /> {modelo}
        </button>
        {nivel.marcaDoTopo}
        <span className="q-espaco" />
        <button
          type="button"
          className="q-ctl"
          role="switch"
          aria-checked={micLigado}
          aria-label={micLigado ? t('Microfone ativo') : t('Microfone mudo')}
          disabled={micAbrindo}
          onClick={() => aoAlternarMic(!micLigado)}
        >
          <Mic aria-hidden />
        </button>
        <button type="button" className="q-ctl" aria-label={t('Ajustes da captura')} onClick={aoAbrirAjustes}>
          <SlidersHorizontal aria-hidden />
        </button>
        <button type="button" className="q-ctl" aria-label={t('Ajuda')} onClick={aoAbrirAjuda}>
          <CircleQuestionMark aria-hidden />
        </button>
      </div>
      {nivel.linha}
      {avisos}
      <div className="cel-conversa">
        {pronta ? (
          <div className="q-leg">
            <div className="q-historico" aria-live="polite">
              <div className="px-pronto-miolo" ref={miolo}>
                <span className="q-ic">
                  <Mic aria-hidden />
                </span>
                <h2>{t('Pronto para legendar')}</h2>
                <p>
                  {celular()
                    ? t('Toque em Iniciar e deixe o celular perto do som. A legenda nos dois idiomas aparece aqui.')
                    : t(
                        'O som do computador entra sozinho. Dê play no vídeo, aula ou chamada e clique em Iniciar. A legenda bilíngue aparece aqui e nas Legendas flutuantes.',
                      )}
                </p>
                {nivel.nota}
              </div>
            </div>
          </div>
        ) : (
          legenda
        )}
      </div>
      <div className="q-faixa" role="toolbar" aria-label={t('Controles da captura')}>
        <span className="q-tempo">
          <span className="cel-ponto" />
          <span className="tn">{tempo}</span>
        </span>
        {!gravando ? (
          <button
            ref={principal}
            type="button"
            className="q-ctl pri"
            data-px="iniciar"
            data-testid="iniciar-captura"
            disabled={!podeIniciar || abrindo}
            onClick={comecar}
          >
            <Mic aria-hidden /> {t('Iniciar captura')}
          </button>
        ) : (
          <button
            ref={principal}
            type="button"
            className="q-ctl pri"
            data-px="encerrar"
            data-sfx="none"
            data-testid="encerrar-captura"
            onClick={aoParar}
          >
            <i className="q-quadrado" /> {t('Encerrar')}
          </button>
        )}
        {aoFlutuante && (
          <button type="button" className="q-ctl" data-px="flutuante" onClick={aoFlutuante}>
            <PictureInPicture2 aria-hidden /> {t('Legendas flutuantes')}
          </button>
        )}
        <span className="q-espaco" />
        <button
          type="button"
          className="q-ctl"
          aria-label={t('Diminuir a letra')}
          disabled={letra.noMinimo}
          onClick={letra.menor}
        >
          A−
        </button>
        <button
          type="button"
          className="q-ctl q-fica"
          aria-label={t('Aumentar a letra')}
          disabled={letra.noMaximo}
          onClick={letra.maior}
        >
          A+
        </button>
        <button type="button" className="q-ctl" aria-label={t('Idiomas da sessão')} onClick={aoAbrirIdiomas}>
          {parCurto}
        </button>
      </div>
      {nivel.folhas}
    </div>
  );
}
