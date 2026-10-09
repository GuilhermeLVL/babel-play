import type { ItemOutcome, ResultadoDitado, RoundReport } from '@core';
import { conferirDitado, scorePronunciation, scoreRound } from '@core';
import { Gauge, Mic, Play, SkipForward } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import { palavrasDaFrase } from '../../core/minigames/palavrasDaFrase';
import { celebrar } from '../../lib/comemoracao';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../lib/dispositivo/recursos';
import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { criarFalante } from '../../lib/falante';
import { t } from '../../lib/i18n';
import { speechErrorMessage } from '../../lib/mediaErrors';
import { sentir } from '../../lib/polimento/sentidos';
import { toast } from '../Toast';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { usePlacarDaRodada } from './casca/HudDaRodada';
import type { FalaKaraoke } from './KaraokeGame';
import { SemVozNoQuest, useVozNoJogo } from './noQuest';
import { textosDoJogo } from './polimento/textos';

/**
 * KARAOKÊ DA FALA — a cena do protótipo (`jogos2.js:579-644`, `jogos.css:141-157`): a frase com uma
 * palavra por peça, que acende no ritmo da voz; "Ouvir", "devagar" e "Falar agora"; a nota embaixo,
 * com as palavras pintadas uma a uma; e "Próxima".
 *
 * No protótipo o microfone não é ligado e a nota é sorteada. Aqui a aparência é a dele e a nota é a de
 * verdade: o reconhecimento de fala do navegador ouve, `scorePronunciation` dá a nota e
 * `conferirDitado` diz quais palavras saíram e quais escaparam. Sem reconhecimento (o headset, um
 * navegador sem ele) o botão de falar não aparece e a tela diz por quê: nota inventada seria pior que
 * nenhuma. O jogo não tem níveis nem ajudas (`jogos4.js:194`).
 */

interface Props {
  falas: FalaKaraoke[];
  audioUrl: string;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** O passo em que as palavras acendem (`jogos2.js:590`), quando não se sabe quanto a fala dura. */
const PASSO = { normal: 340, devagar: 560 } as const;
/** A cada quanto uma palavra é pintada depois da nota (`jogos2.js:633`). */
const PASSO_DA_PINTURA = 90;
/** A partir de quanto a fala conta como acerto (a régua do app) e de quanto a nota fica verde (`jogos2.js:634`). */
const NOTA_QUE_PASSA = 60;
const NOTA_VERDE = 80;

type Reconhecimento = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};
const classeDoReconhecimento = (): (new () => Reconhecimento) | undefined => {
  const g = window as unknown as Record<string, new () => Reconhecimento>;
  return g.SpeechRecognition || g.webkitSpeechRecognition;
};

interface Nota {
  accuracy: number;
  transcript: string;
  diff: ResultadoDitado;
}

export default function KaraokeDoPrototipo({ falas, audioUrl, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('karaoke');
  const textos = textosDoJogo('karaoke');

  const [i, setI] = useState(0);
  /** A palavra acesa agora; `palavras.length` quando a fala acabou de tocar (todas "passaram"). */
  const [ativa, setAtiva] = useState(-1);
  const [ouvindo, setOuvindo] = useState(false);
  const [nota, setNota] = useState<Nota | null>(null);
  /** Quantas palavras já foram pintadas com o veredito. */
  const [pintadas, setPintadas] = useState(0);
  const [seq, setSeq] = useState(0);
  const [feita, setFeita] = useState(false);
  const [acabou, setAcabou] = useState(false);

  const fala = falas[i] as FalaKaraoke | undefined;
  const palavras = useMemo(() => (fala ? palavrasDaFrase(fala.texto, fala.lang) : []), [fala]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pct = useRef<HTMLElement>(null);
  const trava = useRef(false);
  const feitaRef = useRef(false);
  /** `tocando` de `jogos2.js:585`: só a última escuta pedida acende palavras. */
  const vezDoOuvir = useRef(0);
  const relogiosDoOuvir = useRef<number[]>([]);
  const rec = useRef<Reconhecimento | null>(null);
  const tocouRef = useRef(-1);
  const inicioDaFala = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  const haVoz = useVozNoJogo(fala?.lang);
  const temSom = !!audioUrl || haVoz;
  const falante = useMemo(() => criarFalante(audioRef, audioUrl), [audioUrl]);
  /* A pergunta é ao RECURSO: o headset não reconhece fala, e há navegador de computador que também não. */
  const semNota = useMemo(
    () => !recursosDoAparelho(perfilDoDispositivo()).reconhecimentoDoNavegador || !classeDoReconhecimento(),
    [],
  );

  const pararDeOuvir = () => {
    vezDoOuvir.current++;
    relogiosDoOuvir.current.forEach((x) => window.clearTimeout(x));
    relogiosDoOuvir.current = [];
  };

  /* `tocar` de `jogos2.js:587-602`: a fala soa e as palavras acendem uma a uma; no fim todas "passaram". */
  const tocar = (devagar: boolean) => {
    if (!fala || trava.current || !falante.disponivel || !temSom) return;
    pararDeOuvir();
    const vez = vezDoOuvir.current;
    const velocidade = devagar ? 0.6 : 1;
    falante.ouvir({ texto: fala.texto, lang: fala.lang, startMs: fala.startMs, endMs: fala.endMs }, velocidade);
    /* Com o clipe da gravação o passo é o da fala de verdade; com a voz, o do protótipo. */
    const medida = fala.endMs > fala.startMs ? fala.endMs - fala.startMs : 0;
    const passo = medida ? medida / velocidade / Math.max(1, palavras.length) : devagar ? PASSO.devagar : PASSO.normal;
    /* As palavras perdem a pintura da nota (`jogos2.js:592`); a nota em si continua na tela. */
    setPintadas(0);
    for (let k = 0; k <= palavras.length; k++)
      relogiosDoOuvir.current.push(
        window.setTimeout(() => {
          if (vez === vezDoOuvir.current) {
            setAtiva(k);
            sentir('fala'); /* `jogos2.js:598` */
          }
        }, k * passo),
      );
  };

  /* A fala toca sozinha 350 ms depois de entrar (`jogos2.js:610`), uma vez por fala. */
  useEffect(() => {
    if (!fala || !ativo || tocouRef.current === i) return;
    const x = window.setTimeout(() => {
      tocouRef.current = i;
      tocar(false);
    }, 350);
    return () => window.clearTimeout(x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, ativo]);
  useEffect(
    () => () => {
      esperas.current.forEach((x) => window.clearTimeout(x));
      relogiosDoOuvir.current.forEach((x) => window.clearTimeout(x));
      try {
        rec.current?.abort?.();
      } catch {
        /* já parou */
      }
      falante.parar();
    },
    [falante],
  );

  /** No máximo um resultado por fala: regravar troca o que havia e soma a tentativa. */
  const registrar = (o: ItemOutcome) => {
    const k = o.itemRef ? outcomes.current.findIndex((a) => a.itemRef === o.itemRef) : -1;
    if (k < 0) outcomes.current.push(o);
    else outcomes.current[k] = { ...o, attempts: outcomes.current[k].attempts + 1 };
    return recontar(outcomes.current);
  };

  /* "Falar agora" (`jogos2.js:622-640`), com o microfone de verdade. */
  const falar = () => {
    if (!fala || !ativo || semNota) return;
    /* Com a gravação em curso o botão a encerra: o protótipo, que não grava, não tem "Parar". */
    if (trava.current) {
      try {
        rec.current?.stop();
      } catch {
        /* já parou */
      }
      return;
    }
    const Classe = classeDoReconhecimento();
    if (!Classe) return;
    trava.current = true;
    pararDeOuvir();
    falante.parar();
    sentir('grava', 'recordStart');
    setAtiva(-1);
    setNota(null);
    setPintadas(0);
    setOuvindo(true);
    const r = new Classe();
    r.lang = fala.lang || 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    rec.current = r;
    const inicio = Date.now();
    inicioDaFala.current = inicio;
    const soltar = () => {
      if (rec.current !== r) return;
      rec.current = null;
      trava.current = false;
      setOuvindo(false);
    };
    r.onresult = (e) => {
      const dito = e.results?.[0]?.[0]?.transcript ?? '';
      const ms = Date.now() - inicio;
      const s = scorePronunciation(fala.texto, dito, { durationMs: ms });
      const diff = conferirDitado(fala.texto, dito, fala.lang);
      const passou = s.accuracy >= NOTA_QUE_PASSA;
      setNota({ accuracy: s.accuracy, transcript: dito, diff });
      /* As palavras são pintadas uma a uma (`jogos2.js:633`). */
      for (let k = 1; k <= diff.palavras.length; k++) depois(k * PASSO_DA_PINTURA, () => setPintadas(k));
      const p = registrar({
        ...(fala.id ? { itemRef: fala.id } : {}),
        correct: passou,
        attempts: 1,
        ms,
      });
      feitaRef.current = true;
      setFeita(true);
      soltar();
      /* O número da nota só existe no próximo desenho: é dele que o "+N" sobe. */
      window.requestAnimationFrame(() => {
        if (passou) {
          setSeq((n) => n + 1);
          celebrar({ tipo: 'acerto', combo: seq + 1, el: pct.current, pontos: p.ganho });
        } else {
          setSeq(0);
          celebrar({ tipo: 'erro', el: pct.current });
        }
      });
    };
    /* Microfone negado e rede caída davam o mesmo silêncio: o motivo é dito. */
    r.onerror = (e) => {
      const msg = speechErrorMessage(e?.error ?? '');
      if (msg) toast.warn(msg);
      soltar();
    };
    r.onend = soltar;
    try {
      r.start();
    } catch {
      soltar();
    }
  };

  /* "Próxima" / "Terminar" (`jogos2.js:615-621`): seguir sem ter falado conta como erro. */
  const pular = () => {
    if (!fala || !ativo || finalizou.current) return;
    pararDeOuvir();
    falante.parar();
    /* Seguir no meio de uma gravação a encerra: o resultado que chegasse depois cairia na fala seguinte. */
    const r = rec.current;
    rec.current = null;
    try {
      r?.abort?.();
    } catch {
      /* já parou */
    }
    trava.current = false;
    setOuvindo(false);
    if (!feitaRef.current) {
      setSeq(0);
      if (fala.id && !outcomes.current.some((a) => a.itemRef === fala.id)) {
        outcomes.current.push({
          itemRef: fala.id,
          correct: false,
          attempts: 0,
          ms: Date.now() - inicioDaFala.current,
          revealed: true,
        });
        recontar(outcomes.current);
      }
      /* Onde não há como dar nota, seguir não é erro: é o único caminho. */
      if (!semNota) celebrar({ tipo: 'erro', el: null });
    }
    if (i + 1 >= falas.length) {
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'karaoke',
          items: todos,
          score: scoreRound('karaoke', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return;
    }
    feitaRef.current = false;
    setFeita(false);
    setNota(null);
    setPintadas(0);
    setAtiva(-1);
    inicioDaFala.current = Date.now();
    setI(i + 1);
  };

  if (!fala) return null;

  const escaparam = nota ? nota.diff.palavras.filter((p) => !p.certa).map((p) => p.esperada) : [];
  const feitos = Math.min(falas.length, i + (feita || acabou ? 1 : 0));

  return (
    <>
      <audio ref={audioRef} src={audioUrl || undefined} preload="auto" hidden />
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${falas.length} falas`}
        progresso={feitos / Math.max(1, falas.length)}
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <p className="pj-frase" lang={fala.lang} data-tour="frase">
          {palavras.map((p, k) => {
            const v = nota && k < pintadas ? nota.diff.palavras[k] : null;
            const classe = v
              ? v.certa
                ? 'certa'
                : 'escapou'
              : k === ativa
                ? 'ativa'
                : k < ativa
                  ? 'passou'
                  : undefined;
            return (
              <span key={k} className={classe}>
                {p}
              </span>
            );
          })}
        </p>
        {fala.traducao && <p className="mut">{fala.traducao}</p>}
        {!temSom && <SemVozNoQuest idioma={fala.lang} />}
        <div className="pj-acoes">
          {temSom && (
            <>
              <button type="button" className="btn btn-outline" data-pj="ouvir" onClick={() => tocar(false)}>
                <Play data-pj-i="" aria-hidden /> {t('Ouvir')}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                data-pj="devagar"
                data-tour="devagar"
                title={t('Toca a mesma fala mais devagar, sem mudar o tom da voz')}
                onClick={() => tocar(true)}
              >
                <Gauge data-pj-i="" aria-hidden /> {t('devagar')}
              </button>
            </>
          )}
          {!semNota && (
            <button type="button" className="btn btn-solid" data-pj="falar" data-tour="falar" onClick={falar}>
              <Mic data-pj-i="" aria-hidden /> {t('Falar agora')}
            </button>
          )}
        </div>
        <div className="pj-nota" role="status">
          {ouvindo ? (
            <span className="pj-ouvindo">
              <span className="pj-eq" aria-hidden="true">
                {Array.from({ length: 7 }, (_, k) => (
                  <i key={k} style={{ '--i': k } as CSSProperties} />
                ))}
              </span>{' '}
              {t('ouvindo você…')}
            </span>
          ) : nota ? (
            <>
              <b
                ref={pct}
                className="pj-pct"
                style={{ color: `var(--${nota.accuracy >= NOTA_VERDE ? 'good' : 'warn'})` }}
              >
                {nota.accuracy}%
              </b>
              <p>
                {nota.diff.acertos} de {nota.diff.total} palavras
                {escaparam.length ? ` · ${t('escapou')}: ${escaparam.join(', ')}` : ''}
              </p>
              <small>
                {t('o que entendemos')}: “{nota.transcript}”
              </small>
            </>
          ) : semNota ? (
            /* O motivo, dito no lugar da nota: nota de pronúncia inventada seria pior que nenhuma. */
            <small data-testid="karaoke-sem-nota">
              {noHeadset()
                ? t('O headset não avalia a pronúncia.')
                : t('Este navegador não tem reconhecimento de voz, então não avalia a pronúncia.')}{' '}
              {temSom
                ? t('Ouça, repita em voz alta e siga para a próxima.')
                : t('Leia em voz alta e siga para a próxima.')}
            </small>
          ) : null}
        </div>
        <button type="button" className="btn btn-outline peq" data-pj="pular" onClick={pular}>
          {i === falas.length - 1 ? t('Terminar') : t('Próxima')} <SkipForward data-pj-i="" aria-hidden />
        </button>
      </div>
    </>
  );
}
