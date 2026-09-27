import type { ItemOutcome, RodadaEscuta, RoundReport } from '@core';
import { scoreRound } from '@core';
import { Play, RotateCcw, Turtle } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { emitBurst } from '../../lib/effects';
import { criarFalante } from '../../lib/falante';
import { playJuicedError, playJuicedHit, playJuicedVictory, triggerHaptic } from '../../lib/gameFeel';
import { multiplicador } from '../../lib/juice';
import type { AgeProfileType } from '../../lib/profile';
import { useRodada } from './casca/CascaDaRodada';
import { botaoDaAlternativa, useAtalhosDasAlternativas } from './casca/atalhos';
import HudDaRodada from './casca/HudDaRodada';

/**
 * QUAL FOI? — ouvir um trecho real e escolher a legenda certa.
 */

interface EscutaGameProps {
  rodadas: RodadaEscuta[];
  audioUrl: string;
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function EscutaGame({ rodadas, audioUrl, ageProfile: _ageProfile, onFinish }: EscutaGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa). */
  const { ativo } = useRodada();
  const [acertos, setAcertos] = useState(0);
  const tocouRef = useRef(-1);
  const [indice, setIndice] = useState(0);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const [sequencia, setSequencia] = useState(0);
  const [pontos, setPontos] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pararRef = useRef<number | null>(null);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const encerradoRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const rodada = rodadas[indice];

  const falante = useMemo(() => criarFalante(audioRef, audioUrl), [audioUrl]);
  const ouvir = (velocidade = 1) => {
    if (!rodada || !falante.disponivel) return;
    triggerHaptic('soft');
    falante.ouvir(
      {
        texto: rodada.correta.text,
        // `FalaComAudio.lang` é opcional e `ItemAudivel.lang` não; '' e undefined percorrem o mesmo
        // caminho no falante (baseLang trata os dois como ''), então o som não muda.
        lang: rodada.correta.lang ?? '',
        startMs: rodada.correta.startMs,
        endMs: rodada.correta.endMs,
      },
      velocidade,
    );
    setTocando(true);
    if (pararRef.current) window.clearTimeout(pararRef.current);
    const duracao =
      rodada.correta.endMs > rodada.correta.startMs
        ? Math.max(300, rodada.correta.endMs - rodada.correta.startMs) / velocidade
        : Math.max(900, rodada.correta.text.length * 90) / velocidade;
    pararRef.current = window.setTimeout(() => setTocando(false), duracao);
  };

  // Toca sozinho ao entrar em cada fala — depois da contagem, e uma vez só por fala.
  useEffect(() => {
    if (rodada && ativo && tocouRef.current !== indice) {
      tocouRef.current = indice;
      ouvir(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, ativo]);
  useEffect(
    () => () => {
      if (pararRef.current) window.clearTimeout(pararRef.current);
    },
    [],
  );

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const responder = (id: string | undefined, el: HTMLElement | null) => {
    if (escolhido || !rodada || !ativo) return;
    const certo = id === rodada.correta.id;
    setEscolhido(id ?? '');
    audioRef.current?.pause();

    const rect = el?.getBoundingClientRect();
    const coords = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;

    resultadosRef.current.push({
      ...(rodada.correta.id ? { itemRef: rodada.correta.id } : {}),
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioItemRef.current,
    });

    if (certo) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const ganho = 10 * mult;
      setSequencia(nova);
      setAcertos((n) => n + 1);
      setPontos((p) => p + ganho);
      triggerHaptic('success');
      if (coords) emitBurst(coords.x, coords.y, 'confete');
      playJuicedHit(nova, coords, `+${ganho}${mult > 1 ? ` ×${mult}` : ''}`);
    } else {
      setSequencia(0);
      triggerHaptic('error');
      playJuicedError(palcoRef.current, coords, 'Ouça novamente');
    }

    // Pausa para LER a resposta certa antes de trocar
    setTimeout(
      () => {
        if (indice + 1 >= rodadas.length) {
          if (encerradoRef.current) return;
          encerradoRef.current = true;
          const todos = resultadosRef.current;
          const impecavel = todos.every((o) => o.correct);
          if (impecavel) playJuicedVictory();
          setTimeout(
            () =>
              onFinish({
                gameId: 'escuta',
                items: todos,
                score: scoreRound('escuta', todos),
                durationMs: Date.now() - inicioRodadaRef.current,
              }),
            900,
          );
          return;
        }
        setIndice((i) => i + 1);
        setEscolhido(null);
        inicioItemRef.current = Date.now();
      },
      certo ? 900 : 2000,
    );
  };

  useAtalhosDasAlternativas(
    rodada?.opcoes.length ?? 0,
    (i) => {
      const op = rodada?.opcoes[i];
      if (op) responder(op.id, botaoDaAlternativa(palcoRef.current, 'alternativas', i));
    },
    !!rodada && ativo && escolhido === null,
  );

  if (!rodada) return null;

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o palco
     da Escuta, que é dela. */
  return (
    <>
      <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
      <HudDaRodada
        pontos={pontos}
        sequencia={sequencia}
        acertos={acertos}
        rotulo={`Fala ${indice + 1} de ${rodadas.length}`}
        progresso={indice / rodadas.length}
      />
      <div ref={palcoRef} className="w-full max-w-2xl mx-auto flex flex-col items-center gap-6">
        {/* O BOTÃO DE OUVIR é o centro da tela: é o que a pessoa veio fazer aqui. */}
        <div className="flex items-center gap-3">
          <button
            data-tour="ouvir"
            onClick={() => ouvir(1)}
            className={`py-4 px-8 rounded-2xl bg-accent hover:bg-accent-ink text-white font-bold text-[15px] shadow-btn cursor-pointer flex items-center gap-2.5 transition-transform ${
              tocando ? 'scale-105' : ''
            }`}
          >
            {tocando ? <RotateCcw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {tocando ? 'tocando…' : 'Ouvir de novo'}
          </button>
          <button
            data-tour="devagar"
            onClick={() => ouvir(0.6)}
            className="py-4 px-4 rounded-2xl bg-canvas border border-border-subtle text-ink-muted hover:text-ink hover:border-accent font-bold text-[13px] cursor-pointer flex items-center gap-1.5"
            title="Toca mais devagar, sem mudar o tom da voz"
          >
            <Turtle className="w-4 h-4" /> devagar
          </button>
        </div>
        <p className="text-[12px] text-ink-faint">Ouça quantas vezes quiser, isso não tira ponto.</p>

        {/* AS ALTERNATIVAS */}
        <div data-tour="alternativas" className="w-full flex flex-col gap-2">
          {rodada.opcoes.map((op, posicao) => {
            const certa = op.id === rodada.correta.id;
            const escolhida = escolhido === op.id;
            const revelando = escolhido !== null;
            return (
              <button
                key={op.id}
                onClick={(e) => responder(op.id, e.currentTarget)}
                disabled={revelando}
                aria-keyshortcuts={String(posicao + 1)}
                className={`py-3.5 px-4 rounded-xl border text-start font-medium text-[14px] leading-snug transition-all ${
                  revelando
                    ? certa
                      ? 'bg-good-soft border-good text-good-ink font-bold'
                      : escolhida
                        ? 'bg-error-soft border-error text-error-ink'
                        : 'bg-surface border-border-subtle text-ink-faint'
                    : 'bg-surface border-border-subtle text-ink hover:border-accent hover:-translate-y-0.5 cursor-pointer'
                }`}
              >
                {op.text}
              </button>
            );
          })}
        </div>

        {/* A tradução só aparece DEPOIS: antes, ela entregaria a resposta. */}
        {escolhido !== null && rodada.correta.translation && (
          <p className="text-[13px] text-ink-muted text-center animate-in fade-in">{rodada.correta.translation}</p>
        )}
      </div>
    </>
  );
}
