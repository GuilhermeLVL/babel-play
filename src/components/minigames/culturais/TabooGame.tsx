import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, AlertTriangle, Timer as TimerIcon, Lightbulb } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { distractorsFor, extractKeywords, scoreRound } from '@core';
import { mascararResposta } from '../../../core/learning/pistaDeJogo';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { comemorar } from '../../../lib/juice';
import { play } from '../../../lib/soundFx';

/**
 * TABU — a definição chega SEM os termos que entregariam a resposta.
 *
 * As proibidas não vêm de baralho nenhum: saem do próprio material. `mascararResposta` tira a
 * palavra-alvo (e as flexões dela) do texto, e `extractKeywords` escolhe, no que sobrou, os
 * termos mais salientes — são esses que aparecem riscados. Item cujo texto não sustenta nenhuma
 * proibida fica fora da rodada: sem termo riscado o jogo é só uma definição comum.
 *
 * A resposta continua sendo ESCOLHA entre `answer` de outros itens. Auto-avaliação seria o único
 * lugar do app onde o resultado é declarado pelo jogador em vez de medido.
 */

interface TabooGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const SEGUNDOS: Record<AgeProfileType, number> = { kids: 35, pro: 30, senior: 45 };
/** Quantos termos são riscados por carta. Mais que isto e não sobra definição para ler. */
const PROIBIDAS_POR_CARTA = 3;

interface CartaTabu {
  item: MinigameItem;
  /** O texto já sem a palavra-alvo. */
  texto: string;
  /** Os termos riscados, em minúsculas. */
  proibidas: string[];
  opcoes: string[];
}

function montarCartas(items: MinigameItem[]): CartaTabu[] {
  return items.flatMap((item) => {
    /* O texto mais longo entre frase e pista: o tabu vive de definição, e uma tradução de uma
       palavra não sustenta nenhum termo riscado. */
    const cru = [item.sentence ?? '', item.prompt ?? '']
      .map((t) => t.trim())
      .sort((a, b) => b.length - a.length)[0];
    if (!cru) return [];
    const texto = mascararResposta(cru, item.answer);
    const proibidas = extractKeywords(texto, { max: PROIBIDAS_POR_CARTA, lang: item.lang }).map((p) => p.toLowerCase());
    if (!proibidas.length) return [];
    const distratores = distractorsFor(item, items, 3);
    if (!distratores.length) return [];
    const opcoes = [...distratores, item.answer];
    for (let i = opcoes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opcoes[i], opcoes[j]] = [opcoes[j], opcoes[i]];
    }
    return [{ item, texto, proibidas, opcoes }];
  });
}

export default function TabooGame({ items, ageProfile, onFinish, onExit }: TabooGameProps) {
  const cartas = useMemo(() => montarCartas(items), [items]);

  const [idx, setIdx] = useState(0);
  const [liberadas, setLiberadas] = useState<string[]>([]);
  const [restante, setRestante] = useState(SEGUNDOS[ageProfile]);
  const [resultado, setResultado] = useState<RoundReport | null>(null);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioCartaRef = useRef(Date.now());
  const acabouRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cartas.length) onExit();
  }, [cartas, onExit]);

  const finalizar = (outcomes: ItemOutcome[]) => {
    if (acabouRef.current) return;
    acabouRef.current = true;
    if (outcomes.length > 0 && outcomes.every((o) => o.correct && !o.hinted && !o.revealed)) {
      comemorar('rodadaPerfeita', palcoRef.current);
    }
    setResultado({
      gameId: 'taboo',
      items: outcomes,
      score: scoreRound('taboo', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    });
  };

  const avancar = (outcome: ItemOutcome) => {
    const outcomes = outcomesRef.current;
    outcomes.push(outcome);
    if (idx + 1 >= cartas.length) {
      finalizar(outcomes);
      return;
    }
    setIdx(idx + 1);
    setLiberadas([]);
    setRestante(SEGUNDOS[ageProfile]);
    inicioCartaRef.current = Date.now();
  };

  useEffect(() => {
    if (!cartas.length || acabouRef.current || resultado) return;
    if (restante <= 0) {
      const carta = cartas[idx];
      play('error');
      avancar({
        cardId: carta.item.cardId,
        itemRef: carta.item.answer,
        correct: false,
        attempts: 1,
        ms: Date.now() - inicioCartaRef.current,
        revealed: true,
      });
      return;
    }
    const t = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante, idx, resultado, cartas]);

  if (!cartas.length) return null;

  if (resultado) {
    const acertos = resultado.items.filter((o) => o.correct).length;
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas text-ink p-6">
        <div className="card-panel bg-surface p-8 w-full max-w-md text-center">
          <p className="label-mono mb-3">Fim da rodada</p>
          <p className="font-display font-black text-5xl tabular-nums text-ink">{resultado.score}</p>
          <p className="text-[12px] text-ink-muted mt-1">pontos</p>
          <p className="text-[13px] text-ink-muted mt-4">
            acertos: <b className="text-ink">{acertos}/{resultado.items.length}</b>
          </p>
          <button onClick={() => onFinish(resultado)} className="btn-ink w-full justify-center mt-6 cursor-pointer">
            Continuar
          </button>
        </div>
      </div>
    );
  }

  const carta = cartas[idx];
  const riscadas = carta.proibidas.filter((p) => !liberadas.includes(p));
  /* A definição vira pedaços para que só as proibidas saiam riscadas — o resto do texto fica
     exatamente como está, pontuação inclusive. */
  const pedacos = carta.texto.split(/([\p{L}\p{N}'’-]+)/gu);

  const responder = (op: string) => {
    if (acabouRef.current) return;
    const certo = op === carta.item.answer;
    comemorar(certo ? 'acerto' : 'erro', palcoRef.current);
    avancar({
      cardId: carta.item.cardId,
      itemRef: carta.item.answer,
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioCartaRef.current,
      hinted: liberadas.length > 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            title="Sair do Tabu"
            aria-label="Sair do jogo"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Palavra proibida</span>
            <p className="text-xs text-ink-muted">A definição vem sem os termos mais óbvios.</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => riscadas.length > 1 && setLiberadas((xs) => [...xs, riscadas[0]])}
            disabled={riscadas.length <= 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Liberar uma palavra proibida (limita a nota a difícil)"
          >
            <Lightbulb className="w-3.5 h-3.5 text-warn" />
            <span>Liberar 1</span>
          </button>

          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            restante <= 5 ? 'border-error bg-error-soft text-error-ink' : 'border-border-subtle bg-surface'
          }`}>
            <TimerIcon className="w-4 h-4" aria-hidden />
            <span className="font-mono font-black text-base tabular-nums">{restante}s</span>
          </span>
        </div>
      </header>

      <main ref={palcoRef} className="flex-1 flex flex-col items-center justify-center gap-6 p-4 lg:p-8 max-w-2xl mx-auto w-full min-h-0 overflow-y-auto">
        <div data-tour="alvo" className="w-full rounded-2xl border-2 border-border-subtle bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="label-mono">Definição ({idx + 1} de {cartas.length})</p>
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-error-ink">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
              {riscadas.length} proibida{riscadas.length === 1 ? '' : 's'}
            </span>
          </div>
          <p
            dir={direcaoDoTexto(carta.item.lang)}
            className="text-[17px] sm:text-[19px] leading-relaxed text-ink"
          >
            {pedacos.map((p, i) =>
              riscadas.includes(p.toLowerCase()) ? (
                <s key={i} className="text-ink-faint decoration-error decoration-2">{p}</s>
              ) : (
                <React.Fragment key={i}>{p}</React.Fragment>
              ),
            )}
          </p>
        </div>

        <div data-tour="alternativas" className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {carta.opcoes.map((op) => (
            <button
              key={op}
              onClick={() => responder(op)}
              dir={direcaoDoTexto(carta.item.lang)}
              className="py-4 px-4 rounded-2xl border-2 border-border-subtle bg-surface text-ink font-bold text-[16px] hover:border-accent transition-colors cursor-pointer"
            >
              {op}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
