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

import { MB_DO_MOTOR_LOCAL, motorDaSombra, motorEhLocal } from '../../../core/fala/motorDaSombra';
import { FLAG_SOMBRA_LOCAL } from '../../../core/planos';
import { rapidoDoMicPermitido } from '../../../lib/consentimentoDeNuvem';
import { perfilDoDispositivo } from '../../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../../lib/dispositivo/recursos';
import { noHeadset } from '../../../lib/dispositivo/telaNovaDoQuest';
import { aceitouBaixar, guardarAceite } from '../../../lib/fala/consentimentoDaSombra';
import type { OuvirUmaFrase } from '../../../lib/fala/ouvirFraseNoAparelho';
import { useFlag } from '../../../lib/flags';
import { t } from '../../../lib/i18n';
import { micErrorMessage, speechErrorMessage } from '../../../lib/mediaErrors';
import { toast } from '../../Toast';

type Etapa = 'pronto' | 'aviso' | 'preparando' | 'gravando' | 'analisando' | 'nota';

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

  /* SOMBRA LOCAL (openspec `sombra-sem-web-speech`): onde não há Web Speech utilizável (Firefox, Quest) ou o perfil
     protegido não pode usá-lo, a frase é transcrita NO APARELHO depois de gravada. Só com a flag `sombra_local`. */
  const flagLocal = useFlag(FLAG_SOMBRA_LOCAL);
  const perfil = perfilDoDispositivo();
  const webSpeechExiste = recursosDoAparelho(perfil).reconhecimentoDoNavegador;
  const webSpeechPermitido = rapidoDoMicPermitido();
  const escolha = motorDaSombra({
    webSpeechExiste,
    webSpeechPermitido,
    idioma,
    aparelhoFraco: perfil.tipo === 'celular-fraco' || perfil.tipo === 'quest',
    economiaDeDados: perfil.sinais.economiaDeDados,
    flag: flagLocal,
  });
  const [progresso, setProgresso] = useState(0);
  const [semFala, setSemFala] = useState(false);
  const sessaoLocal = useRef<OuvirUmaFrase | null>(null);
  const vivo = useRef(true);
  useEffect(
    () => () => {
      vivo.current = false;
      sessaoLocal.current?.cancelar();
      sessaoLocal.current = null;
      if (perfil.poucaMemoria) void import('../../../lib/fala/transcritorDaSombra').then((m) => m.liberarSombraLocal());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só no desmonte
    [],
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

  const comecarLocal = async () => {
    setMinhaGravacao(null);
    setSemFala(false);
    setProgresso(0);
    setEtapa('preparando');
    try {
      const { prepararSombraLocal } = await import('../../../lib/fala/transcritorDaSombra');
      await prepararSombraLocal(escolha.motor, (f) => vivo.current && setProgresso(Math.round(f * 100)));
      const { ouvirUmaFrase } = await import('../../../lib/fala/ouvirFraseNoAparelho');
      const sessao = await ouvirUmaFrase({ lang: idioma });
      if (!vivo.current) return sessao.cancelar();
      sessaoLocal.current = sessao;
      inicioLocal.current = Date.now();
      await ligarGravador();
      setEtapa('gravando');
    } catch (erro) {
      sessaoLocal.current = null;
      if (vivo.current) {
        setEtapa('pronto');
        toast.error(micErrorMessage(erro), { detail: erro });
      }
    }
  };
  const inicioLocal = useRef(0);

  const gravarLocal = () => {
    if (!aceitouBaixar(escolha.motor)) return setEtapa('aviso');
    void comecarLocal();
  };

  const pararLocal = async () => {
    const sessao = sessaoLocal.current;
    sessaoLocal.current = null;
    if (gravador.current?.state === 'recording') gravador.current.stop();
    if (!sessao) return;
    setEtapa('analisando');
    try {
      const r = await sessao.parar();
      if (!vivo.current) return;
      if (r.semFala) {
        setSemFala(true);
        setNota(null);
      } else {
        const p = scorePronunciation(texto, r.texto, { durationMs: r.duracaoMs });
        setNota({ n: Math.round(p.fluency), texto: p.feedback });
      }
    } catch {
      if (!vivo.current) return;
      setSemFala(false);
      setNota(null);
      toast.warn(t('O aparelho não conseguiu comparar a sua voz agora. A gravação continua aí para você ouvir.'));
    }
    setEtapa('nota');
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

  if (motorEhLocal(escolha.motor)) {
    const mb = MB_DO_MOTOR_LOCAL[escolha.motor as keyof typeof MB_DO_MOTOR_LOCAL];
    const ouvirOriginal = aoOuvirOriginal && (
      <button type="button" className="q-ctl" onClick={aoOuvirOriginal}>
        <Volume2 aria-hidden /> {t('Ouvir original')}
      </button>
    );
    return (
      <div className="qs-sombra" data-testid="sombra-local" aria-live="polite">
        <span className="q-rotulo">{t('Prática de pronúncia (shadowing)')}</span>
        {etapa === 'aviso' ? (
          <>
            <p className="q-texto" data-testid="sombra-local-aviso">
              {t(
                'Para dar a nota, o Frasy baixa um modelo de {mb} MB e entende a sua voz aqui no seu aparelho. O áudio não sai dele.',
                { mb },
              )}
            </p>
            <div className="q-acoes">
              <button
                type="button"
                className="q-ctl"
                onClick={() => {
                  guardarAceite(escolha.motor);
                  void comecarLocal();
                }}
              >
                {t('Baixar e continuar')}
              </button>
              <button type="button" className="q-ctl" onClick={() => setEtapa('pronto')}>
                {t('Agora não')}
              </button>
            </div>
          </>
        ) : etapa === 'preparando' ? (
          <p className="q-texto" role="status">
            {t('Preparando o modelo no aparelho… {n}%', { n: progresso })}
          </p>
        ) : etapa === 'gravando' ? (
          <div className="q-acoes">
            <span className="qs-gravando" role="status">
              <span className="qs-ponto-gravando" aria-hidden /> {t('Gravando: fale a frase agora.')}
            </span>
            <button type="button" className="q-ctl" onClick={() => void pararLocal()}>
              <Square aria-hidden /> {t('Parar')}
            </button>
          </div>
        ) : etapa === 'analisando' ? (
          <p className="q-texto" role="status">
            {t('Comparando com a fala original…')}
          </p>
        ) : etapa === 'nota' ? (
          <>
            {nota ? (
              <p className="q-texto" data-testid="nota-local">
                <strong>{nota.n}</strong> {t('de 100')}. {nota.texto}{' '}
                <em>{t('É um palpite do aparelho: ele pode errar. Ouça a sua gravação e compare.')}</em>
              </p>
            ) : (
              <p className="q-texto" data-testid="sem-fala">
                {semFala
                  ? t('Não deu para ouvir a sua voz. Fale mais perto do microfone e tente de novo.')
                  : t('A nota não saiu desta vez. Tente de novo.')}
              </p>
            )}
            <div className="q-acoes">
              {ouvirOriginal}
              <button type="button" className="q-ctl" disabled={!minhaGravacao} onClick={ouvirMinha}>
                <Headphones aria-hidden /> {t('Ouvir minha gravação')}
              </button>
              <button type="button" className="q-ctl" onClick={gravarLocal}>
                <RotateCcw aria-hidden /> {t('Tentar de novo')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="q-texto">{t('Ouça a fala e repita no mesmo ritmo.')}</p>
            <div className="q-acoes">
              {ouvirOriginal}
              <button type="button" className="q-ctl" onClick={gravarLocal}>
                <Mic aria-hidden /> {t('Gravar a minha voz')}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* SEM RECONHECIMENTO DE FALA (o Quest; no computador, um navegador que não o tem): a
     NOTA compara a frase com o que o reconhecimento do NAVEGADOR ouviu. Gravar a própria voz e ouvir a
     gravação não dependem dele (é o `MediaRecorder`): ficam. Só a nota de 0 a 100 fica de fora, com o
     motivo dito. Quem decide é o RECURSO (`recursos.ts`), não o desenho: no computador com o
     reconhecimento, a prática com nota de sempre aparece dentro da folha. */
  if (escolha.motor !== 'web-speech') {
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
        {/* O motivo é do APARELHO: no headset falta o reconhecimento; no computador, é o navegador (o
            Firefox não o tem) e a saída é outra. */}
        <p className="qs-apoio" data-testid="nota-indisponivel">
          {webSpeechExiste && !webSpeechPermitido
            ? t(
                'A nota de 0 a 100 usa o reconhecimento de fala do navegador, que só vale para a sua conta com a autorização de quem cuida de você. Você ainda pode gravar a sua voz e comparar com o original.',
              )
            : noHeadset()
              ? t(
                  'A nota de 0 a 100 não está disponível no Quest: ela usa o reconhecimento de fala do navegador, que o headset não tem. Para receber a nota, abra esta sessão no computador ou no celular.',
                )
              : t(
                  'A nota de 0 a 100 não está disponível neste navegador: ela usa o reconhecimento de fala, que ele não tem. Para receber a nota, abra esta sessão no Chrome ou no Edge.',
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
