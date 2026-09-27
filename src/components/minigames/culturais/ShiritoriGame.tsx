import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { scoreRound } from '@core';
import { ArrowRight, Lightbulb, Link2, Volume2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { montarCorrente } from '../../../core/minigames/shiritori';
import { t } from '../../../lib/i18n';
import { comemorar } from '../../../lib/juice';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { falar } from '../../../lib/tts';
import AvisoDaJogada from '../casca/AvisoDaJogada';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';

/**
 * SHIRITORI — a corrente encadeia pela última letra, e a corrente é O SEU BARALHO.
 *
 * A montagem da rodada (ordenar os itens numa corrente válida e escolher os distratores) mora em
 * `core/minigames/shiritori`, testada fora do React. Aqui só se joga o que ela devolveu; quando
 * ela devolve `null`, o material não fecha corrente e a rodada não nasce.
 */

interface ShiritoriGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Segundos por elo. O sênior tem mais tempo para ler a corrente inteira antes de escolher. */
const SEGUNDOS: Record<AgeProfileType, number> = { kids: 20, pro: 15, senior: 25 };

export default function ShiritoriGame({ items, ageProfile, onFinish, onExit }: ShiritoriGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa); o placar do HUD sai dos resultados. */
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('shiritori');
  const corrente = useMemo(() => montarCorrente(items), [items]);

  const [idx, setIdx] = useState(0);
  const [erradas, setErradas] = useState<string[]>([]);
  const [tentativas, setTentativas] = useState(1);
  const [letraVisivel, setLetraVisivel] = useState(false);
  const [restante, setRestante] = useState(SEGUNDOS[ageProfile]);
  const [resultado, setResultado] = useState<RoundReport | null>(null);
  /** O tempo deste elo acabou: o elo certo aparece antes do próximo (QA dos jogos, 2026-09-26). */
  const [revelado, setRevelado] = useState<string | null>(null);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioPassoRef = useRef(Date.now());
  const acabouRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!corrente) onExit();
  }, [corrente, onExit]);

  const finalizar = (outcomes: ItemOutcome[]) => {
    if (acabouRef.current) return;
    acabouRef.current = true;
    const perfeita = outcomes.length > 0 && outcomes.every((o) => o.correct && o.attempts <= 1 && !o.revealed);
    if (perfeita) comemorar('rodadaPerfeita', palcoRef.current);
    /* Direto para o fim de rodada COMUM (`ResultadoDaRodada`), como os outros jogos. A tela própria
       "Fim da corrente" repetia pontos e acertos que a tela seguinte já mostra, e pedia um clique a
       mais (QA dos jogos, 2026-09-26). */
    const relatorio: RoundReport = {
      gameId: 'shiritori',
      items: outcomes,
      score: scoreRound('shiritori', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    };
    setResultado(relatorio);
    setTimeout(() => onFinish(relatorio), 900);
  };

  const avancar = (outcome: ItemOutcome) => {
    const outcomes = outcomesRef.current;
    outcomes.push(outcome);
    recontar(outcomes);
    if (!corrente || idx + 1 >= corrente.passos.length) {
      finalizar(outcomes);
      return;
    }
    setIdx(idx + 1);
    setErradas([]);
    setTentativas(1);
    setLetraVisivel(false);
    setRevelado(null);
    setRestante(SEGUNDOS[ageProfile]);
    inicioPassoRef.current = Date.now();
  };

  // O relógio do elo. Zerou: a corrente foi revelada, e revelação é nota 1.
  useEffect(() => {
    if (!corrente || acabouRef.current || resultado || revelado) return;
    if (restante <= 0) {
      /* O elo certo aparece (e é dito) antes do próximo: antes a corrente pulava sem mostrar. */
      const passo = corrente.passos[idx];
      play('error');
      setRevelado(passo.item.answer);
      falar(passo.item.answer, passo.item.lang);
      const outcome: ItemOutcome = {
        cardId: passo.item.cardId,
        itemRef: passo.item.answer,
        correct: false,
        attempts: tentativas,
        ms: Date.now() - inicioPassoRef.current,
        revealed: true,
      };
      setTimeout(() => avancar(outcome), 1800);
      return;
    }
    if (!ativo) return; // o relógio para na contagem e na pausa
    const tique = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(tique);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante, ativo, idx, resultado, corrente, revelado]);

  if (!corrente) return null;

  const passo = corrente.passos[idx];
  const anterior = idx === 0 ? corrente.inicio : corrente.passos[idx - 1].item;
  const jaNaCorrente = [corrente.inicio, ...corrente.passos.slice(0, idx).map((p) => p.item)];

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o tabuleiro,
     que é deste jogo. */
  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={placar.sequencia}
        acertos={placar.acertos}
        rotulo={`Elo ${idx + 1} de ${corrente.passos.length}`}
        tempo={restante}
        progresso={restante / SEGUNDOS[ageProfile]}
        pouco={restante <= 5}
        ajudas={
          <BotaoDeAjuda
            icone={Lightbulb}
            rotulo="Ver a letra"
            disabled={letraVisivel}
            onClick={() => setLetraVisivel(true)}
          />
        }
      />

      <div ref={palcoRef} className="flex flex-col items-center justify-center gap-7 max-w-2xl mx-auto w-full">
        <div data-tour="corrente" className="w-full rounded-2xl border border-border-subtle bg-surface p-4">
          <p className="label-mono mb-3">
            A corrente até aqui ({jaNaCorrente.length} de {corrente.passos.length + 1})
          </p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {jaNaCorrente.map((elo, i) => (
              <React.Fragment key={elo.answer + i}>
                {i > 0 && <ArrowRight className="w-4 h-4 text-ink-faint shrink-0" aria-hidden />}
                <span
                  dir={direcaoDoTexto(elo.lang)}
                  className="shrink-0 px-3 py-1.5 rounded-xl border border-border-subtle bg-canvas font-mono font-bold text-[13px] text-ink"
                >
                  {elo.answer}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="text-center">
          <p className="label-mono mb-2">Palavra na ponta</p>
          <p
            dir={direcaoDoTexto(anterior.lang)}
            className="font-display font-black text-4xl sm:text-5xl text-ink tracking-wide"
          >
            {anterior.answer.slice(0, -1)}
            <span className="text-accent underline decoration-4 underline-offset-4">{anterior.answer.slice(-1)}</span>
          </p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-[13px] text-ink-muted">{anterior.prompt}</span>
            <button
              onClick={() => falar(anterior.answer, anterior.lang)}
              className="p-1.5 rounded-full hover:bg-surface-hover text-accent cursor-pointer"
              title="Ouvir a palavra"
              aria-label="Ouvir a palavra"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
          {letraVisivel && (
            <p className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent-soft text-accent-ink text-[13px] font-bold">
              <Link2 className="w-4 h-4" aria-hidden />A próxima começa com{' '}
              <b className="font-mono text-base">{passo.letra}</b>
            </p>
          )}
        </div>

        <div data-tour="opcoes" className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
          {passo.opcoes.map((op) => {
            const riscada = erradas.includes(op);
            const certaRevelada = revelado === op;
            return (
              <button
                key={op}
                onClick={(e) => {
                  if (riscada || acabouRef.current || revelado || !ativo) return;
                  if (op === passo.item.answer) {
                    comemorar('acerto', e.currentTarget);
                    falar(passo.item.answer, passo.item.lang);
                    avancar({
                      cardId: passo.item.cardId,
                      itemRef: passo.item.answer,
                      correct: true,
                      attempts: tentativas,
                      ms: Date.now() - inicioPassoRef.current,
                    });
                  } else {
                    comemorar('erro', e.currentTarget);
                    setErradas((xs) => [...xs, op]);
                    setTentativas((t) => t + 1);
                  }
                }}
                disabled={riscada || !!revelado}
                dir={direcaoDoTexto(passo.item.lang)}
                className={`py-4 px-4 rounded-2xl border-2 font-bold text-[16px] transition-colors ${
                  certaRevelada
                    ? 'bg-good-soft border-good text-good-ink'
                    : riscada
                      ? 'bg-canvas border-border-subtle text-ink-faint line-through opacity-40'
                      : 'bg-surface border-border-subtle text-ink hover:border-accent cursor-pointer'
                }`}
              >
                {op}
              </button>
            );
          })}
        </div>
        {revelado && (
          <AvisoDaJogada tom="erro" rotulo={t('O tempo acabou. O elo era:')} resposta={revelado} lang={passo.item.lang} />
        )}
      </div>
    </>
  );
}
