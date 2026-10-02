/**
 * PRÁTICA DE PRONÚNCIA (SHADOWING) DE UMA FALA — o `.sombra` do protótipo aprovado, DENTRO da fala
 * da transcrição (aba Transcrição da Sessão).
 *
 * Três momentos, como no desenho: pronto (ouvir e gravar), analisando, nota. A gravação é real nas
 * duas pontas: o reconhecimento de fala do navegador dá o texto que a nota compara com a frase
 * (`scorePronunciation`), e um `MediaRecorder` no mesmo microfone guarda o áudio — é ele que toca
 * em "Ouvir minha gravação". Sem reconhecimento de fala no navegador, a tela diz isso.
 */
import { scorePronunciation } from '@core';
import { Headphones, Mic, RotateCcw, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { perfilDoDispositivo } from '../../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../../lib/dispositivo/recursos';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import { micErrorMessage, speechErrorMessage } from '../../../lib/mediaErrors';
import { toast } from '../../Toast';

type Etapa = 'pronto' | 'gravando' | 'analisando' | 'nota';

export default function SombraDaFala({
  texto,
  idioma,
  aoOuvirOriginal,
}: {
  texto: string;
  /** Idioma REAL da fala (BCP-47), para o reconhecimento escutar a língua certa. */
  idioma: string;
  /** Ausente = não há como ouvir o original aqui (sem áudio gravado e sem voz para o idioma). */
  aoOuvirOriginal?: () => void;
}) {
  const questNovo = useQuestNovo();
  const [etapa, setEtapa] = useState<Etapa>('pronto');
  const [nota, setNota] = useState<{ n: number; texto: string } | null>(null);
  const [minhaGravacao, setMinhaGravacao] = useState<string | null>(null);
  const reconhecedor = useRef<{ stop: () => void } | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);

  useEffect(
    () => () => {
      try {
        reconhecedor.current?.stop();
      } catch {
        /* já parado */
      }
      gravador.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(
    () => () => {
      if (minhaGravacao) URL.revokeObjectURL(minhaGravacao);
    },
    [minhaGravacao],
  );

  /**
   * Liga o `MediaRecorder` no microfone: é ele que guarda o áudio de "Ouvir minha gravação". Não
   * depende do reconhecimento de fala. Devolve o motivo quando o microfone não abre.
   */
  const ligarGravador = async (aoParar?: () => void): Promise<unknown> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const pedacos: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && pedacos.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (pedacos.length) setMinhaGravacao(URL.createObjectURL(new Blob(pedacos, { type: rec.mimeType })));
        aoParar?.();
      };
      rec.start();
      gravador.current = rec;
      return null;
    } catch (erro) {
      gravador.current = null;
      return erro ?? new Error('microfone indisponível');
    }
  };

  const gravar = async () => {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) {
      toast.warn('O reconhecimento de fala não existe neste navegador: use o Chrome ou o Edge para a nota.');
      return;
    }
    // O áudio de verdade, para "Ouvir minha gravação". Sem a gravação, a nota ainda vale; só o
    // "ouvir" fica indisponível.
    await ligarGravador();
    const r = new SR();
    r.lang = idioma;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    let ouvido = '';
    const inicio = Date.now();
    r.onresult = (e: any) => {
      ouvido = e.results?.[0]?.[0]?.transcript || '';
    };
    r.onerror = (e: any) => {
      const msg = speechErrorMessage(e?.error);
      if (msg) toast.warn(msg);
    };
    r.onend = () => {
      reconhecedor.current = null;
      if (gravador.current?.state === 'recording') gravador.current.stop();
      setEtapa('analisando');
      const p = scorePronunciation(texto, ouvido, { durationMs: Date.now() - inicio });
      setNota({ n: Math.round(p.fluency), texto: p.feedback });
      setEtapa('nota');
    };
    reconhecedor.current = r;
    setMinhaGravacao(null);
    setEtapa('gravando');
    try {
      r.start();
    } catch {
      setEtapa('pronto');
    }
  };

  const parar = () => {
    try {
      reconhecedor.current?.stop();
    } catch {
      /* já parado */
    }
  };

  const ouvirMinha = () => {
    if (minhaGravacao) void new Audio(minhaGravacao).play();
  };

  /* META QUEST: a NOTA compara a frase com o que o reconhecimento de fala do NAVEGADOR ouviu, e o
     navegador do Quest não tem reconhecimento. Gravar a própria voz e ouvir a gravação não dependem
     dele (é o `MediaRecorder`): ficam. Só a nota de 0 a 100 fica de fora, com o motivo dito. */
  if (questNovo && !recursosDoAparelho(perfilDoDispositivo()).reconhecimentoDoNavegador) {
    const gravarSemNota = async () => {
      setMinhaGravacao(null);
      const erro = await ligarGravador(() => setEtapa('nota'));
      if (erro) toast.error(micErrorMessage(erro), { detail: erro });
      else setEtapa('gravando');
    };
    const pararSemNota = () => {
      if (gravador.current?.state === 'recording') gravador.current.stop();
    };
    const ouvirOriginal = aoOuvirOriginal && (
      <button type="button" className="q-ctl" onClick={aoOuvirOriginal}>
        <Volume2 aria-hidden /> {t('Ouvir original')}
      </button>
    );
    return (
      <div className="qs-sombra" data-testid="sombra-sem-reconhecimento" aria-live="polite">
        <span className="q-rotulo">{t('Prática de pronúncia (shadowing)')}</span>
        {etapa === 'gravando' ? (
          <div className="q-acoes">
            <span className="qs-gravando" role="status">
              <span className="qs-ponto-gravando" aria-hidden /> {t('Gravando: fale a frase agora.')}
            </span>
            <button type="button" className="q-ctl" onClick={pararSemNota}>
              <Square aria-hidden /> {t('Parar')}
            </button>
          </div>
        ) : etapa === 'nota' ? (
          <>
            <p className="q-texto">
              {minhaGravacao
                ? t('Gravação pronta. Ouça o original e depois a sua voz, e compare.')
                : t('A gravação saiu vazia. Tente de novo.')}
            </p>
            <div className="q-acoes">
              {ouvirOriginal}
              <button type="button" className="q-ctl" disabled={!minhaGravacao} onClick={ouvirMinha}>
                <Headphones aria-hidden /> {t('Ouvir minha gravação')}
              </button>
              <button type="button" className="q-ctl" onClick={() => void gravarSemNota()}>
                <RotateCcw aria-hidden /> {t('Tentar de novo')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="q-texto">{t('Ouça a fala e repita no mesmo ritmo.')}</p>
            <div className="q-acoes">
              {ouvirOriginal}
              <button type="button" className="q-ctl" onClick={() => void gravarSemNota()}>
                <Mic aria-hidden /> {t('Gravar a minha voz')}
              </button>
            </div>
          </>
        )}
        <p className="qs-apoio" data-testid="nota-indisponivel">
          {t(
            'A nota de 0 a 100 não está disponível no Quest: ela usa o reconhecimento de fala do navegador, que o headset não tem. Para receber a nota, abra esta sessão no computador ou no celular.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="sombra entra" aria-live="polite" onClick={(e) => e.stopPropagation()}>
      <div className="linha" style={{ gap: 10 }}>
        <span className="label-mono">Prática ativa de pronúncia (shadowing)</span>
      </div>
      {etapa === 'pronto' ? (
        <>
          <p className="mut" style={{ fontSize: 13 }}>
            Ouça a fala e repita no mesmo ritmo.
          </p>
          <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline peq" onClick={aoOuvirOriginal}>
              <Volume2 aria-hidden /> Ouvir original
            </button>
            <button type="button" className="btn btn-solid peq" onClick={() => void gravar()}>
              <Mic aria-hidden /> Gravar a minha voz
            </button>
          </div>
        </>
      ) : etapa === 'gravando' ? (
        <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="ondas" aria-hidden>
            <i />
            <i style={{ animationDelay: '.2s' }} />
            <i style={{ animationDelay: '.4s' }} />
            <i style={{ animationDelay: '.1s' }} />
          </span>
          <span>Gravando: fale a frase agora.</span>
          <button type="button" className="btn btn-outline peq" onClick={parar}>
            <Square aria-hidden /> Parar
          </button>
        </div>
      ) : etapa === 'analisando' || !nota ? (
        <div className="linha" style={{ gap: 10 }}>
          <span className="ondas" aria-hidden>
            <i />
            <i style={{ animationDelay: '.2s' }} />
            <i style={{ animationDelay: '.4s' }} />
            <i style={{ animationDelay: '.1s' }} />
          </span>
          <span>Comparando com a fala original…</span>
        </div>
      ) : (
        <div className="linha" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            className="nota-sombra"
            style={{
              background: `conic-gradient(var(--good) 0 ${nota.n}%, var(--surface-sunken) ${nota.n}% 100%)`,
            }}
          >
            <b className="tn">{nota.n}</b>
            <small>de 100</small>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 13 }}>{nota.texto}</p>
            <div className="linha" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline peq" onClick={aoOuvirOriginal}>
                <Volume2 aria-hidden /> Ouvir original
              </button>
              <button type="button" className="btn btn-outline peq" disabled={!minhaGravacao} onClick={ouvirMinha}>
                <Headphones aria-hidden /> Ouvir minha gravação
              </button>
              <button type="button" className="btn btn-outline peq" onClick={() => void gravar()}>
                <RotateCcw aria-hidden /> Tentar de novo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
