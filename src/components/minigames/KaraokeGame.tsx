import type { ItemOutcome, ResultadoDitado, RoundReport } from '@core';
import { conferirDitado, pontuarRodada, scorePronunciation, scoreRound } from '@core';
import { Mic, MicOff, Play, SkipForward, Square, Turtle } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { palavrasDaFrase } from '../../core/minigames/palavrasDaFrase';
import { celebrar } from '../../lib/comemoracao';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../lib/dispositivo/recursos';
import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { criarFalante } from '../../lib/falante';
import { t } from '../../lib/i18n';
import { pontosDoElemento } from '../../lib/juice';
import { speechErrorMessage } from '../../lib/mediaErrors';
import type { AgeProfileType } from '../../lib/profile';
import { toast } from '../Toast';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada from './casca/HudDaRodada';
import { SemVozNoQuest, useQuestNovo, useVozNoJogo } from './noQuest';

/**
 * KARAOKÊ DA FALA — a frase real toca com as palavras acendendo em sincronia; você fala junto e
 * recebe uma nota de pronúncia.
 */

export interface FalaKaraoke {
  id?: string;
  texto: string;
  traducao?: string;
  lang: string;
  startMs: number;
  endMs: number;
}

interface KaraokeGameProps {
  falas: FalaKaraoke[];
  audioUrl: string;
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

type Fase = 'parado' | 'ouvindo' | 'gravando' | 'avaliado';

export default function KaraokeGame({ falas, audioUrl, ageProfile, onFinish }: KaraokeGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa). */
  const { ativo } = useRodada();
  /** O placar que o HUD mostra: a MESMA conta do fim da rodada (`pontuarRodada`), refeita a cada fala. */
  const [placar, setPlacar] = useState({ pontos: 0, sequencia: 0, acertos: 0 });
  const [indice, setIndice] = useState(0);
  const [fase, setFaseEstado] = useState<Fase>('parado');
  /**
   * A fase também num `ref` (QA dos jogos, 2026-09-26): os callbacks do reconhecimento nascem no
   * clique e liam a fase DAQUELE render — `rec.onend` via 'parado' e nunca liberava o "Parar".
   */
  const faseRef = useRef<Fase>('parado');
  const setFase = (f: Fase) => {
    faseRef.current = f;
    setFaseEstado(f);
  };
  /** Os relógios do "Ouvir" — cancelados quando a gravação começa, senão a derrubam ao vencer. */
  const relogiosDoOuvirRef = useRef<{ passo?: ReturnType<typeof setInterval>; fim?: ReturnType<typeof setTimeout> }>(
    {},
  );
  const pararRelogiosDoOuvir = () => {
    clearInterval(relogiosDoOuvirRef.current.passo);
    clearTimeout(relogiosDoOuvirRef.current.fim);
    relogiosDoOuvirRef.current = {};
  };
  const [palavraAtiva, setPalavraAtiva] = useState(-1);
  const [nota, setNota] = useState<{ accuracy: number; transcript: string; diff: ResultadoDitado } | null>(null);
  const [semReconhecimento, setSemReconhecimento] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<any>(null);
  const inicioFalaRef = useRef(0);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);

  const fala = falas[indice];
  const palavras = fala ? palavrasDaFrase(fala.texto, fala.lang) : [];

  /* NO QUEST o navegador não reconhece fala: o jogo não dá nota ali, e diz isso no lugar do botão de
     falar. O Karaokê ABRE no headset sempre que há som (o clipe da gravação ou a voz do site, quando ela
     lê o idioma da fala), no modo "ouça, repita em voz alta e siga"; o cartão do lobby leva a etiqueta
     "Sem nota de voz" (`jogosNoQuest.ts`) e só fica apagado quando não há som nenhum para repetir.
     A pergunta é ao RECURSO, não ao aparelho: no computador com o desenho novo, o navegador que reconhece
     fala dá nota como sempre; o que não reconhece (Firefox) cai no mesmo modo, com a frase do navegador. */
  const questNovo = useQuestNovo();
  const semNotaAqui = useMemo(
    () => questNovo && !recursosDoAparelho(perfilDoDispositivo()).reconhecimentoDoNavegador,
    [questNovo],
  );
  const haVoz = useVozNoJogo(fala?.lang);
  const temSom = !!audioUrl || haVoz;

  const falante = useMemo(() => criarFalante(audioRef, audioUrl), [audioUrl]);
  const ouvir = (velocidade = 1) => {
    if (!fala || !falante.disponivel || !temSom) return;
    pararRelogiosDoOuvir();
    setFase('ouvindo');
    setPalavraAtiva(-1);
    falante.ouvir({ texto: fala.texto, lang: fala.lang, startMs: fala.startMs, endMs: fala.endMs }, velocidade);

    const medida = fala.endMs > fala.startMs ? fala.endMs - fala.startMs : 0;
    const duracao = (medida || Math.max(900, fala.texto.length * 90)) / velocidade;
    const passo = duracao / Math.max(1, palavras.length);
    let i = 0;
    const timer = setInterval(() => {
      setPalavraAtiva(i);
      i++;
      if (i >= palavras.length) clearInterval(timer);
    }, passo);

    const fim = setTimeout(() => {
      falante.parar();
      clearInterval(timer);
      setPalavraAtiva(-1);
      if (faseRef.current === 'ouvindo') setFase('parado');
    }, duracao);
    relogiosDoOuvirRef.current = { passo: timer, fim };
  };

  const gravar = () => {
    if (!ativo || semNotaAqui) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSemReconhecimento(true);
      return;
    }
    // Gravar interrompe a escuta: o relógio do "Ouvir" não pode derrubar a gravação ao vencer.
    pararRelogiosDoOuvir();
    falante.parar();
    setPalavraAtiva(-1);
    const rec = new SR();
    rec.lang = fala.lang || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;
    inicioFalaRef.current = Date.now();
    setFase('gravando');
    setNota(null);

    rec.onresult = (e: any) => {
      const dito = e.results?.[0]?.[0]?.transcript ?? '';
      const duracao = Date.now() - inicioFalaRef.current;
      const s = scorePronunciation(fala.texto, dito, { durationMs: duracao });
      setNota({ accuracy: s.accuracy, transcript: dito, diff: conferirDitado(fala.texto, dito, fala.lang) });
      setFase('avaliado');

      /* A nota da pronúncia é o número que sobe; o fim da rodada comemora no fim comum. */
      if (s.accuracy >= 60) {
        celebrar({ tipo: 'acerto', combo: placar.sequencia + 1 });
        pontosDoElemento(`${s.accuracy}%`, null, 'bom');
      } else {
        celebrar({ tipo: 'erro' });
        pontosDoElemento(`${s.accuracy}%`, null, 'ruim');
      }

      registrarFala({
        ...(fala.id ? { itemRef: fala.id } : {}),
        correct: s.accuracy >= 60,
        attempts: 1,
        ms: duracao,
      });
    };
    // Parava sem dizer por quê: mic negado e rede caída davam o mesmo silêncio.
    rec.onerror = (e: any) => {
      const msg = speechErrorMessage(e?.error);
      if (msg) toast.warn(msg);
      setFase('parado');
    };
    rec.onend = () => {
      if (faseRef.current === 'gravando') setFase('parado');
    };
    try {
      rec.start();
    } catch {
      setFase('parado');
    }
  };

  const parar = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* já parou */
    }
  };

  /**
   * Grava o resultado de UMA fala — no máximo um por fala.
   *
   * O `push` direto empilhava: cada clique em "Falar agora" instancia um reconhecimento novo, e
   * três tentativas na mesma fala viravam três `ItemOutcome` com o mesmo `itemRef`. Como esse campo
   * é o que alimenta o histórico ("o que já caiu"), a fala parecia ter aparecido três vezes.
   *
   * Sem `itemRef` (fala sem id) não há como saber se é a mesma — aí empilha, porque supor que duas
   * falas anônimas são a mesma apagaria uma nota de verdade.
   */
  const recontar = () => {
    const p = pontuarRodada('karaoke', resultadosRef.current);
    setPlacar({
      pontos: p.total,
      sequencia: p.sequenciaFinal,
      acertos: resultadosRef.current.filter((o) => o.correct).length,
    });
  };
  const registrarFala = (o: ItemOutcome) => {
    const i = o.itemRef ? resultadosRef.current.findIndex((a) => a.itemRef === o.itemRef) : -1;
    if (i < 0) resultadosRef.current.push(o);
    else resultadosRef.current[i] = { ...o, attempts: resultadosRef.current[i].attempts + 1 };
    recontar();
  };

  const proxima = () => {
    /*
     * PULOU SEM FALAR? ISSO É UM RESULTADO, e antes não era nenhum.
     *
     * O outcome só nascia dentro de `rec.onresult`, então passar por uma fala sem falar não
     * registrava nada — a rodada terminava com menos itens do que falas, e o relatório dava a
     * entender que o resto não existiu. `revealed: true` é o campo que o projeto já usa para
     * "desistiu", e `correct: false` sem `attempts` é o que o agendador precisa para tratar como
     * item não recuperado. Não é castigo: é a diferença entre "não lembrei" e "não aconteceu".
     */
    if (fase !== 'avaliado' && fala.id && !resultadosRef.current.some((a) => a.itemRef === fala.id)) {
      resultadosRef.current.push({
        itemRef: fala.id,
        correct: false,
        attempts: 0,
        ms: Date.now() - inicioFalaRef.current,
        revealed: true,
      });
      recontar();
    }

    /* Avançar no meio de uma gravação ou escuta encerra as duas: o resultado que chegasse depois
       cairia sobre a fala seguinte. */
    pararRelogiosDoOuvir();
    try {
      recRef.current?.abort?.();
    } catch {
      /* já parou */
    }
    recRef.current = null;

    if (indice + 1 >= falas.length) {
      if (jaFinalizouRef.current) return;
      jaFinalizouRef.current = true;
      const todos = resultadosRef.current;
      /* Nenhuma comemoração aqui: o fim da rodada é festejado UMA vez, no fim comum
         (`ResultadoDaRodada`), pelas estrelas. Rodada de zero itens continua sem festa nem "erro". */
      setTimeout(
        () =>
          onFinish({
            gameId: 'karaoke',
            items: todos,
            score: scoreRound('karaoke', todos),
            durationMs: Date.now() - inicioRodadaRef.current,
          }),
        900,
      );
      return;
    }
    setIndice((i) => i + 1);
    setFase('parado');
    setNota(null);
    setPalavraAtiva(-1);
  };

  useEffect(
    () => () => {
      pararRelogiosDoOuvir();
      try {
        recRef.current?.abort?.();
      } catch {
        /* nada */
      }
    },
    [],
  );

  if (!fala) return null;

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o palco
     do Karaokê, que é dele. */
  return (
    <>
      <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />

      {/* Topo unificado */}

      <HudDaRodada
        pontos={placar.pontos}
        sequencia={placar.sequencia}
        acertos={placar.acertos}
        rotulo={`Fala ${indice + 1} de ${falas.length}${fase === 'gravando' ? ' · gravando' : ''}`}
        progresso={indice / falas.length}
      />

      <div data-qj="karaoke" className="w-full max-w-2xl flex flex-col items-center gap-6">
        {/* A FRASE: acende em sincronia com o áudio enquanto se ouve e, DEPOIS de falar, vira o
            resultado, cada palavra com o próprio veredito. É a mesma frase servindo aos dois
            momentos, em vez de um segundo bloco repetindo o texto embaixo. */}
        <p data-tour="frase" className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-center">
          {palavras.map((p, i) => {
            const v = nota?.diff.palavras[i];
            const corDoVeredito = v ? (v.certa ? 'var(--good)' : 'var(--warn)') : undefined;
            return (
              <span
                key={i}
                /* Cor nunca sozinha: a palavra que escapou também ganha sublinhado ondulado, senão
                   quem não distingue verde de laranja não recebe informação nenhuma. */
                style={
                  corDoVeredito
                    ? { color: corDoVeredito, textDecoration: v!.certa ? undefined : 'underline wavy' }
                    : undefined
                }
                title={v && !v.certa ? (v.escrita ? `ouvimos “${v.escrita}”` : 'não ouvimos esta palavra') : undefined}
                className={`font-display font-black text-2xl leading-tight transition-colors duration-150 ${
                  nota
                    ? ''
                    : i === palavraAtiva
                      ? 'text-accent scale-105'
                      : i < palavraAtiva
                        ? 'text-ink'
                        : 'text-ink-faint'
                }`}
              >
                {p}
              </span>
            );
          })}
        </p>

        {fala.traducao && <p className="text-[13px] text-ink-muted text-center -mt-2">{fala.traducao}</p>}

        {!temSom && <SemVozNoQuest idioma={fala.lang} />}

        <div className="flex items-center gap-3" data-qp="acoes">
          {temSom && (
            <>
              <button
                data-qp="acao"
                onClick={() => ouvir(1)}
                disabled={fase === 'gravando'}
                className="py-3 px-5 rounded-xl bg-canvas border border-border-subtle text-ink font-bold text-[13px] hover:border-accent disabled:opacity-40 cursor-pointer flex items-center gap-2"
              >
                <Play className="w-4 h-4" /> {ageProfile === 'senior' ? 'Ouvir a fala' : 'Ouvir'}
              </button>
              <button
                data-tour="devagar"
                data-qp="acao"
                onClick={() => ouvir(0.6)}
                disabled={fase === 'gravando'}
                className="py-3 px-4 rounded-xl bg-canvas border border-border-subtle text-ink-muted font-bold text-[13px] hover:border-accent hover:text-ink disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                title="Toca a mesma fala mais devagar, sem mudar o tom da voz"
              >
                <Turtle className="w-4 h-4" /> devagar
              </button>
            </>
          )}

          {semNotaAqui ? null : fase === 'gravando' ? (
            <button
              data-qp="acao-pri"
              onClick={parar}
              className="py-3 px-6 rounded-xl bg-error text-white font-bold text-[13px] shadow-btn cursor-pointer flex items-center gap-2"
            >
              <Square className="w-4 h-4" /> Parar
            </button>
          ) : (
            <button
              data-tour="falar"
              data-qp="acao-pri"
              onClick={gravar}
              className="py-3 px-6 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-[13px] shadow-btn cursor-pointer flex items-center gap-2"
            >
              <Mic className="w-4 h-4" /> {ageProfile === 'kids' ? 'Falar!' : 'Falar agora'}
            </button>
          )}
        </div>

        {/* O motivo, dito no lugar do botão: nota de pronúncia inventada seria pior que nenhuma. */}
        {semNotaAqui && (
          <p className="qj-sem-voz" role="note" data-testid="karaoke-sem-nota" data-tour="falar">
            <MicOff aria-hidden />
            <span>
              {noHeadset()
                ? t('O headset não avalia a pronúncia.')
                : t('Este navegador não tem reconhecimento de voz, então não avalia a pronúncia.')}{' '}
              {temSom
                ? t('Ouça, repita em voz alta e siga para a próxima.')
                : t('Leia em voz alta e siga para a próxima.')}
            </span>
          </p>
        )}

        {fase === 'gravando' && (
          <p className="flex items-center gap-2 text-[13px] text-accent font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" aria-hidden /> ouvindo você…
          </p>
        )}

        {/* NOTA — só quando houve reconhecimento de verdade. */}
        {nota && (
          <div className="w-full max-w-md text-center animate-in fade-in slide-in-from-bottom-2">
            <p
              className="font-display font-black text-3xl"
              style={{ color: nota.accuracy >= 60 ? 'var(--good)' : 'var(--warn)' }}
            >
              {nota.accuracy}%
            </p>
            {/* O número agregado precisa dizer DE QUANTAS — "85%" sem denominador não diz se
                escapou uma palavra ou seis. */}
            <p className="text-[13px] text-ink font-bold mt-0.5">
              {nota.diff.acertos} de {nota.diff.total} palavras
            </p>
            {/* As que escaparam, listadas: passar o mouse em cima já mostra, mas no toque não há
                mouse, e é justamente quem está no celular que mais precisa. */}
            {nota.diff.acertos < nota.diff.total && (
              <p className="text-[12px] text-ink-muted mt-1.5 leading-relaxed">
                escapou:{' '}
                {nota.diff.palavras
                  .filter((p) => !p.certa)
                  .map((p, i, todas) => (
                    <span key={i}>
                      <b className="text-ink">{p.esperada}</b>
                      {p.escrita ? <> (ouvimos “{p.escrita}”)</> : null}
                      {i < todas.length - 1 ? ', ' : ''}
                    </span>
                  ))}
              </p>
            )}
            <p className="text-[12px] text-ink-muted mt-1">o que entendemos: “{nota.transcript}”</p>
          </div>
        )}

        {semReconhecimento && (
          <p className="text-[12px] text-warn-ink text-center max-w-[46ch]">
            Este navegador não tem reconhecimento de voz, então não dá para dar nota aqui, e nota de pronúncia inventada
            seria pior que nenhuma. Você ainda pode ouvir e repetir.
          </p>
        )}

        <button
          data-qp="acao"
          onClick={() => proxima()}
          className="py-2.5 px-5 rounded-xl bg-surface border border-border-subtle text-ink font-bold text-[13px] hover:border-accent cursor-pointer flex items-center gap-1.5"
        >
          {indice + 1 >= falas.length ? 'Terminar' : 'Próxima'} <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
}
