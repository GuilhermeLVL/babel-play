import { AudioLines, Ear, Mic, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { rapidoDoMicPermitido } from '../../../../lib/consentimentoDeNuvem';
import { t } from '../../../../lib/i18n';
import { chegarPalpite, varrerOnda } from '../../../../lib/polimento/revisao';
import { sentir } from '../../../../lib/polimento/sentidos';
import { BARRAS_DA_ONDA, duracaoDaOriginal, picosDaFrase, reamostrar } from '../../../../lib/revisao/enxuta';
import { Onda } from './pecas';

/**
 * O GRAVADOR — porte de `cxGravador()` (`cartoes4.js:64-332`): um componente só, usado na folha
 * "Minha voz" e na prática "Falar".
 *
 * Grava a fala da pessoa (getUserMedia + MediaRecorder), desenha a onda ao vivo (AnalyserNode), toca a
 * fala original e depois a gravação, com as duas ondas à vista. SEM NOTA e sem reprovar: quem julga é a
 * pessoa. O áudio fica na memória desta tela; guardar (ou não) é decisão de quem usa o gravador.
 *
 * O QUE NÃO VEIO DO PROTÓTIPO: a simulação. Lá, sem microfone, a onda era de exemplo; aqui não há onda
 * inventada: sem permissão ou sem microfone, a tela diz o que houve e como resolver.
 *
 * "O QUE O APARELHO ENTENDEU?" usa o reconhecimento de fala do navegador, que precisa ouvir ENQUANTO a
 * pessoa grava e, no Chrome, manda o áudio ao fabricante do navegador. Por isso: só existe onde o
 * navegador tem o reconhecimento E o perfil pode usá-lo (`rapidoDoMicPermitido`, a régua da captura:
 * nunca no perfil protegido sem o responsável), fica DESLIGADO até a pessoa ligar, e é sempre mostrado
 * como palpite.
 */

type Fase = 'pronto' | 'pedindo' | 'gravando' | 'ouvindo' | 'feito' | 'negado' | 'sem-mic';

export interface Gravado {
  /** A onda da gravação, em barras de 0,08 a 1. */
  picos: number[];
  dur: number;
  audio: Blob;
}

export interface ControleDoGravador {
  /** Toca a original e depois uma gravação guardada, com a onda dela na trilha de baixo. */
  ouvirGuardada(g: { rotulo: string; picos: number[]; dur: number; audio: Blob }): void;
  /** Há uma gravação desta abertura pronta para guardar? */
  gravado(): Gravado | null;
}

type Reconhecedor = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function reconhecedorDoNavegador(): (new () => Reconhecedor) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconhecedor;
    webkitSpeechRecognition?: new () => Reconhecedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const CHAVE_DO_PALPITE = 'revisao.palpiteDoAparelho';
const palpiteLigado = (): boolean => {
  try {
    return localStorage.getItem(CHAVE_DO_PALPITE) === 'true';
  } catch {
    return false;
  }
};

const segundos = (ms: number): string => t('{s} s', { s: (ms / 1000).toFixed(1).replace('.', ',') });
const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const Gravador = forwardRef<
  ControleDoGravador,
  {
    frase: string;
    /** O idioma da frase (BCP-47), para o palpite escutar a língua certa. */
    idioma: string;
    /** Quem falou na sessão; vazio = a original é a voz do aparelho. */
    quem?: string;
    /** A original é a fala gravada da sessão (e não a voz do aparelho). */
    originalGravada: boolean;
    /** Faz a original soar e resolve quando ela acabou. Ausente = não há como ouvi-la aqui. */
    aoOuvirOriginal?: () => Promise<void>;
    /** O texto do estado "pronto" (a prática "Falar" tem o seu). */
    convite?: string;
    /** Começa a gravar ao abrir (a folha "Minha voz" aberta pelo ícone). */
    gravarAoAbrir?: boolean;
    aoGravar?: (g: Gravado) => void;
    /** As duas ondas já foram ouvidas uma vez. */
    aoComparar?: () => void;
  }
>(function Gravador(
  { frase, idioma, quem, originalGravada, aoOuvirOriginal, convite, gravarAoAbrir = false, aoGravar, aoComparar },
  ref,
) {
  const [fase, setFase] = useState<Fase>('pronto');
  const [aoVivo, setAoVivo] = useState<number[]>([]);
  const [picosEu, setPicosEu] = useState<number[]>([]);
  const [tempo, setTempo] = useState('');
  const [rotuloEu, setRotuloEu] = useState('');
  const [palpite, setPalpite] = useState<'fechado' | 'pedir' | 'aberto'>('fechado');
  const [entendido, setEntendido] = useState('');

  const raiz = useRef<HTMLDivElement>(null);
  const trilhaO = useRef<HTMLDivElement>(null);
  const trilhaE = useRef<HTMLDivElement>(null);
  const caixaDoPalpite = useRef<HTMLDivElement>(null);
  /* O estado que não é de tela (`g`, `cartoes4.js:70`). */
  const g = useRef({
    vivo: true,
    vez: 0,
    fase: 'pronto' as Fase,
    picos: [] as number[],
    gravado: null as Gravado | null,
    url: null as string | null,
    t0: 0,
    laco: 0,
    rec: null as MediaRecorder | null,
    stream: null as MediaStream | null,
    contexto: null as AudioContext | null,
    audio: null as HTMLAudioElement | null,
    reconhecedor: null as Reconhecedor | null,
    ouvido: '',
    apertou: 0,
    soltouCedo: false,
    urlsDeFora: [] as string[],
  });
  const retornos = useRef({ aoGravar, aoComparar, aoOuvirOriginal });
  retornos.current = { aoGravar, aoComparar, aoOuvirOriginal };

  const durO = duracaoDaOriginal(frase);
  const temPalpite = !!reconhecedorDoNavegador() && rapidoDoMicPermitido();

  const irPara = useCallback((f: Fase) => {
    g.current.fase = f;
    if (g.current.vivo) setFase(f);
    if (f !== 'feito') setPalpite('fechado');
  }, []);

  const soltarMicrofone = () => {
    const s = g.current;
    clearTimeout(s.laco);
    s.stream?.getTracks().forEach((x) => x.stop());
    s.stream = null;
    void s.contexto?.close().catch(() => undefined);
    s.contexto = null;
    try {
      s.reconhecedor?.stop();
    } catch {
      /* já parado */
    }
    s.reconhecedor = null;
  };

  /** `tocar()` de `cartoes4.js:234-262`: primeiro a fala original, depois a gravação. */
  const tocar = useCallback(
    async (guardada?: { picos: number[]; dur: number; audio: Blob }) => {
      const s = g.current;
      if (!s.gravado && !guardada) return;
      const vez = ++s.vez;
      s.audio?.pause();
      irPara('ouvindo');
      const ouvirOriginal = retornos.current.aoOuvirOriginal;
      if (trilhaO.current && raiz.current) {
        varrerOnda(raiz.current, trilhaO.current, durO);
        await Promise.all([
          Promise.race([ouvirOriginal ? ouvirOriginal().catch(() => undefined) : Promise.resolve(), pausa(durO + 2200)]),
          pausa(durO),
        ]);
        if (vez !== s.vez || !s.vivo) return;
        await pausa(220);
      }
      let url = s.url;
      if (guardada) {
        url = URL.createObjectURL(guardada.audio);
        s.urlsDeFora.push(url);
      }
      const durE = Math.min(8000, Math.max(900, guardada ? guardada.dur : (s.gravado?.dur ?? 900)));
      if (trilhaE.current && raiz.current) varrerOnda(raiz.current, trilhaE.current, durE);
      if (url) {
        const audio = new Audio(url);
        s.audio = audio;
        const acabou = new Promise<void>((r) => {
          audio.onended = () => r();
          audio.onerror = () => r();
        });
        try {
          await audio.play();
        } catch {
          /* sem som neste navegador: a onda varre do mesmo jeito */
        }
        await Promise.race([acabou, pausa(durE + 900)]);
      } else await pausa(durE);
      if (vez !== s.vez || !s.vivo) return;
      raiz.current?.querySelectorAll('.tocando').forEach((x) => x.classList.remove('tocando'));
      irPara('feito');
      retornos.current.aoComparar?.();
    },
    [durO, irPara],
  );

  /** `terminar()` de `cartoes4.js:125-133`. */
  const terminar = useCallback(
    (audio: Blob, dur: number) => {
      const s = g.current;
      if (!s.vivo) return;
      const picos = reamostrar(s.picos);
      s.gravado = { picos, dur, audio };
      setPicosEu(picos);
      setAoVivo([]);
      setTempo(segundos(dur));
      sentir('liga');
      retornos.current.aoGravar?.(s.gravado);
      void tocar();
    },
    [tocar],
  );

  /** `parar()` de `cartoes4.js:134-140`. */
  const parar = useCallback(() => {
    const s = g.current;
    if (s.fase !== 'gravando') return;
    clearTimeout(s.laco);
    if (s.rec && s.rec.state !== 'inactive') s.rec.stop();
  }, []);

  /** `gravar()` de `cartoes4.js:159-226`, sem a simulação. */
  const gravar = useCallback(async () => {
    const s = g.current;
    if (s.fase === 'gravando' || s.fase === 'pedindo') return;
    s.vez++;
    s.audio?.pause();
    raiz.current?.querySelectorAll('.tocando').forEach((x) => x.classList.remove('tocando'));
    if (s.url) URL.revokeObjectURL(s.url);
    s.url = null;
    s.gravado = null;
    s.picos = [];
    s.ouvido = '';
    setPicosEu([]);
    setAoVivo([]);
    setTempo('');
    setRotuloEu('');
    setEntendido('');
    const temMic = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder === 'function';
    if (!temMic) return irPara('sem-mic');
    irPara('pedindo');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (erro) {
      if (!s.vivo) return;
      const nome = (erro as { name?: string } | null)?.name;
      return irPara(nome === 'NotAllowedError' || nome === 'SecurityError' ? 'negado' : 'sem-mic');
    }
    if (!s.vivo) return stream.getTracks().forEach((x) => x.stop());
    s.stream = stream;
    let an: AnalyserNode | null = null;
    try {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        s.contexto = new AC();
        an = s.contexto.createAnalyser();
        an.fftSize = 512;
        s.contexto.createMediaStreamSource(stream).connect(an);
      }
    } catch {
      an = null;
    }
    const partes: Blob[] = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream);
    } catch {
      soltarMicrofone();
      return irPara('sem-mic');
    }
    rec.ondataavailable = (e) => {
      if (e.data.size) partes.push(e.data);
    };
    rec.onstop = () => {
      const dur = performance.now() - s.t0;
      soltarMicrofone();
      if (!s.vivo) return;
      const audio = new Blob(partes, { type: rec.mimeType || 'audio/webm' });
      s.url = URL.createObjectURL(audio);
      terminar(audio, dur);
    };
    s.rec = rec;
    rec.start();
    s.t0 = performance.now();
    irPara('gravando');
    sentir('grava');
    /* O palpite, só para quem ligou: o reconhecimento ouve junto com a gravação. */
    const SR = temPalpite && palpiteLigado() ? reconhecedorDoNavegador() : undefined;
    if (SR) {
      try {
        const r = new SR();
        r.lang = idioma;
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.continuous = false;
        r.onresult = (e) => {
          s.ouvido = e.results?.[0]?.[0]?.transcript ?? '';
        };
        r.onerror = () => undefined;
        r.onend = () => {
          if (s.vivo) setEntendido(s.ouvido);
        };
        r.start();
        s.reconhecedor = r;
      } catch {
        s.reconhecedor = null;
      }
    }
    const buf = an ? new Uint8Array(an.fftSize) : null;
    const passo = () => {
      if (s.fase !== 'gravando' || !s.vivo) return;
      const dt = performance.now() - s.t0;
      if (an && buf) {
        an.getByteTimeDomainData(buf);
        let m = 0;
        for (const v of buf) m = Math.max(m, Math.abs(v - 128));
        s.picos.push(Math.max(0.06, Math.min(1, m / 80)));
        setAoVivo(s.picos.slice(-BARRAS_DA_ONDA));
      }
      setTempo(segundos(dt));
      if (dt > 8000) return parar(); /* uma frase não passa de 8 s */
      s.laco = window.setTimeout(passo, 60);
    };
    passo();
    if (s.soltouCedo) {
      s.soltouCedo = false;
      parar();
    }
     
  }, [idioma, irPara, parar, temPalpite, terminar]);

  useImperativeHandle(
    ref,
    () => ({
      /* `ouvirGuardada()` de `cartoes4.js:264-271`. */
      ouvirGuardada(v) {
        const s = g.current;
        if (s.fase === 'gravando' || s.fase === 'pedindo') return;
        setRotuloEu(v.rotulo);
        setPicosEu(v.picos);
        setAoVivo([]);
        setTempo(segundos(v.dur));
        void tocar(v);
      },
      gravado: () => g.current.gravado,
    }),
    [tocar],
  );

  /* `destruir()` de `cartoes4.js:321-329`. */
  useEffect(() => {
    const s = g.current;
    s.vivo = true;
    return () => {
      s.vivo = false;
      s.vez++;
      if (s.rec && s.rec.state !== 'inactive') {
        try {
          s.rec.stop();
        } catch {
          /* já parado */
        }
      }
      soltarMicrofone();
      s.audio?.pause();
      if (s.url) URL.revokeObjectURL(s.url);
      s.urlsDeFora.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    if (gravarAoAbrir) void gravar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (palpite !== 'fechado') chegarPalpite(caixaDoPalpite.current);
  }, [palpite]);

  const gravando = fase === 'gravando';
  const status =
    fase === 'pronto'
      ? (convite ?? t('Toque no microfone e diga a frase. Ninguém dá nota: você ouve e compara.'))
      : fase === 'pedindo'
        ? t('Pedindo o microfone ao navegador…')
        : fase === 'gravando'
          ? t('Gravando. Toque de novo (ou solte) quando terminar.')
          : fase === 'ouvindo'
            ? aoOuvirOriginal
              ? t('Primeiro a fala original, depois a sua.')
              : t('Agora a sua gravação.')
            : fase === 'feito'
              ? t('Compare no olho e no ouvido. Sem nota: quem julga é você.')
              : fase === 'negado'
                ? t(
                    'O navegador não deixou usar o microfone. Toque no cadeado ao lado do endereço, permita o microfone e tente de novo. O que você grava não sai deste aparelho.',
                  )
                : t(
                    'Não achei um microfone neste aparelho. Ligue um, confira se outro programa não está usando e tente de novo.',
                  );

  return (
    <div
      className="cx-voz"
      data-fase={fase === 'sem-mic' ? 'negado' : fase}
      data-testid="gravador"
      ref={raiz}
      onPointerDown={(e) => {
        /* segurar e soltar também vale: começa ao apertar, para ao soltar (`cartoes4.js:284-302`) */
        const b = (e.target as Element).closest<HTMLButtonElement>('.cx-mic');
        const s = g.current;
        if (!b || b.disabled) return;
        if (s.fase === 'gravando') {
          s.apertou = 0;
          return;
        }
        s.apertou = performance.now();
        s.soltouCedo = false;
        void gravar();
        window.addEventListener(
          'pointerup',
          () => {
            if (performance.now() - s.apertou <= 450) return;
            if (s.fase === 'gravando') parar();
            else if (s.fase === 'pedindo') s.soltouCedo = true;
          },
          { once: true },
        );
      }}
    >
      <div className="cx-trilha orig" ref={trilhaO}>
        <span className="cx-quem">
          {originalGravada ? <AudioLines aria-hidden /> : <Volume2 aria-hidden />}
          <span>
            {originalGravada
              ? quem
                ? t('Fala original · {quem}', { quem })
                : t('Fala original')
              : t('Voz do aparelho')}
          </span>
        </span>
        <Onda picos={picosDaFrase(frase)} />
      </div>
      <div className="cx-trilha eu" ref={trilhaE}>
        <span className="cx-quem">
          <Mic aria-hidden />
          <span className="cx-quem-eu">{rotuloEu || t('Você')}</span>
          <em className="cx-tempo">{tempo}</em>
        </span>
        <Onda picos={gravando ? aoVivo : picosEu} aoVivo={gravando} />
      </div>
      <p className="cx-voz-status" role="status">
        {status}
      </p>
      <div className="cx-voz-acoes">
        <button
          type="button"
          className="cx-mic"
          aria-label={gravando ? t('Parar de gravar') : picosEu.length ? t('Gravar de novo') : t('Gravar a minha voz')}
          disabled={fase === 'pedindo' || fase === 'ouvindo'}
          hidden={fase === 'feito' || fase === 'negado' || fase === 'sem-mic'}
          onClick={() => {
            /* o pointerdown já tratou este toque (`cartoes4.js:308`); o teclado chega só aqui */
            if (performance.now() - g.current.apertou < 700) return;
            if (gravando) parar();
            else void gravar();
          }}
        >
          {gravando ? <Square aria-hidden /> : <Mic aria-hidden />}
        </button>
        <div className="cx-voz-mais">
          {fase === 'feito' && (
            <>
              <button type="button" className="q-ctl pri" onClick={() => void tocar()}>
                <Play aria-hidden /> {t('Ouvir de novo')}
              </button>
              <button type="button" className="q-ctl" onClick={() => void gravar()}>
                <RotateCcw aria-hidden /> {t('Gravar de novo')}
              </button>
              {temPalpite && palpite === 'fechado' && (
                <button
                  type="button"
                  className="cx-link"
                  onClick={() => setPalpite(palpiteLigado() ? 'aberto' : 'pedir')}
                >
                  <Ear aria-hidden /> {t('O que o aparelho entendeu?')}
                </button>
              )}
            </>
          )}
          {(fase === 'negado' || fase === 'sem-mic') && (
            <button type="button" className="q-ctl pri" onClick={() => void gravar()}>
              <RotateCcw aria-hidden /> {t('Tentar de novo')}
            </button>
          )}
        </div>
      </div>
      <div className="cx-palpite" hidden={palpite === 'fechado'} ref={caixaDoPalpite}>
        {palpite === 'aberto' && (
          <>
            <p>
              <Ear aria-hidden />
              <span>
                {entendido ? (
                  <>
                    {t('Entendi:')} <b lang={idioma}>“{entendido}”</b>
                  </>
                ) : (
                  t('O aparelho não entendeu nada desta vez.')
                )}
              </span>
            </p>
            <small>
              {t(
                'Palpite do aparelho. Ele erra bastante e às vezes é só o microfone. Não vale nota e não muda o cartão.',
              )}
            </small>
          </>
        )}
        {palpite === 'pedir' && (
          <>
            <p>
              <Ear aria-hidden />
              <span>{t('O palpite vem do reconhecimento de fala do navegador, que precisa ouvir enquanto você grava.')}</span>
            </p>
            <small>
              {t(
                'Em alguns navegadores esse áudio vai para o fabricante do navegador. Fica desligado até você ligar, e só vale neste aparelho.',
              )}
            </small>
            <button
              type="button"
              className="q-ctl"
              onClick={() => {
                try {
                  localStorage.setItem(CHAVE_DO_PALPITE, 'true');
                } catch {
                  /* vale só nesta abertura */
                }
                setPalpite('fechado');
                void gravar();
              }}
            >
              <Mic aria-hidden /> {t('Ligar o palpite e gravar de novo')}
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export default Gravador;
