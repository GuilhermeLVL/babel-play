import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { distractorsFor, makeCloze, MINIGAMES, scoreRound } from '@core';
import { Sparkles,Volume2, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { comemorar } from '../../../lib/juice';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { speak } from '../../../lib/tts';

/**
 * VITENDAWILI — o enigma é a SUA PRÓPRIA FRASE com a palavra apagada.
 *
 * Charada autoral seria conteúdo inventado: aqui o enigma é a frase real de onde a palavra veio
 * (`item.sentence`, ou a `prompt` quando `item.clozed` diz que ela já é a frase com lacuna). A
 * frase é narrada com PAUSA na lacuna, e as alternativas são palavras reais da mesma rodada.
 *
 * ITEM SEM FRASE NÃO ENTRA: sem contexto não há enigma, e forjar um seria devolver material que a
 * pessoa nunca viu.
 */

interface VitendawiliGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** A lacuna do cloze do app é `_____`; aceitamos qualquer corrida de 3+ sublinhados. */
const LACUNA = /_{3,}/;
/** Silêncio no lugar da palavra apagada, para a lacuna ser OUVIDA e não só lida (ms). */
const PAUSA_NA_LACUNA = 700;

/** A frase com a lacuna, ou `null` quando este item não tem enigma possível. */
function enigmaDe(item: MinigameItem): string | null {
  if (item.clozed && LACUNA.test(item.prompt)) return item.prompt;
  const frase = item.sentence?.trim();
  if (!frase) return null;
  return makeCloze(frase, item.answer)?.prompt ?? null;
}

function narrarComPausa(texto: string, lang: string): void {
  const partes = texto.split(LACUNA);
  const antes = (partes[0] ?? '').trim();
  const depois = partes.slice(1).join(' ').trim();
  if (!antes) {
    if (depois) speak(depois, { lang });
    return;
  }
  speak(antes, {
    lang,
    onEnd: () => { if (depois) setTimeout(() => speak(depois, { lang }), PAUSA_NA_LACUNA); },
  });
}

function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function VitendawiliGame({ items, ageProfile, onFinish, onExit }: VitendawiliGameProps) {
  const def = MINIGAMES.vitendawili;

  /** Só os itens que têm frase: o enigma nasce dela ou não nasce. */
  const rodada = useMemo(() => {
    const comFrase: { item: MinigameItem; enigma: string }[] = [];
    for (const item of items) {
      const enigma = enigmaDe(item);
      if (enigma) comFrase.push({ item, enigma });
      if (comFrase.length >= def.maxItems) break;
    }
    return comFrase;
  }, [items, def.maxItems]);

  const suficiente = rodada.length >= def.minItems;

  const [indice, setIndice] = useState(0);
  const [eliminadas, setEliminadas] = useState<string[]>([]);
  const [encerrado, setEncerrado] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioEnigmaRef = useRef(Date.now());
  const encerradoRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const atual = rodada[indice];

  const alternativas = useMemo(() => {
    if (!atual) return [];
    const outros = rodada.map(r => r.item);
    return embaralhar([...distractorsFor(atual.item, outros, 3), atual.item.answer]);
  }, [atual, rodada]);

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  // Cada enigma é narrado ao entrar: a lacuna precisa ser ouvida, não só lida.
  useEffect(() => {
    if (!suficiente || !atual) return;
    setEliminadas([]);
    inicioEnigmaRef.current = Date.now();
    narrarComPausa(atual.enigma, atual.item.lang);
  }, [atual, suficiente]);

  const finalizar = (outcomes: ItemOutcome[]) => {
    if (encerradoRef.current) return;
    encerradoRef.current = true;
    setEncerrado(true);
    const perfeita = outcomes.length > 0 && outcomes.every(o => o.correct && o.attempts === 1);
    comemorar(perfeita ? 'rodadaPerfeita' : 'rodadaBoa', palcoRef.current);
    setTimeout(() => onFinish({
      gameId: 'vitendawili',
      items: outcomes,
      score: scoreRound('vitendawili', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    }), 900);
  };

  const escolher = (palavra: string, el: HTMLElement | null) => {
    if (encerradoRef.current || !atual || eliminadas.includes(palavra)) return;

    if (palavra !== atual.item.answer) {
      setEliminadas(prev => [...prev, palavra]);
      comemorar('erro', el);
      return;
    }

    outcomesRef.current.push({
      cardId: atual.item.cardId,
      itemRef: atual.item.answer,
      correct: true,
      attempts: 1 + eliminadas.length,
      ms: Date.now() - inicioEnigmaRef.current,
    });
    comemorar('acerto', el);
    speak(atual.item.answer, { lang: atual.item.lang });

    if (indice + 1 >= rodada.length) { finalizar(outcomesRef.current); return; }
    setTimeout(() => setIndice(i => i + 1), 800);
  };

  if (!suficiente || !atual) return null;

  const dir = direcaoDoTexto(atual.item.lang);
  const alvoGrande = ageProfile === 'kids' || ageProfile === 'senior';
  const [antes, ...resto] = atual.enigma.split(LACUNA);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-y-auto">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            aria-label="Sair do jogo"
            title="Sair dos Enigmas"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Vitendawili</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">🌍 Enigma</span>
            </div>
            <p className="text-xs text-ink-muted">O enigma é uma frase sua com a palavra apagada. Qual palavra a fecha?</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => narrarComPausa(atual.enigma, atual.item.lang)}
            disabled={encerrado}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Ouvir a frase de novo (não custa nota)"
          >
            <Volume2 className="w-4 h-4 text-accent" />
            <span>Ouvir</span>
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold text-base text-ink">{indice + 1}/{rodada.length}</span>
          </div>
        </div>
      </header>

      <main ref={palcoRef} className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-7 w-full max-w-2xl mx-auto">
        <p
          data-tour="enigma"
          dir={dir}
          className="text-center font-display font-black text-2xl sm:text-3xl leading-snug text-ink"
        >
          {antes}
          <span className="inline-block align-baseline mx-1.5 px-6 border-b-4 border-accent" aria-label="palavra apagada">&nbsp;</span>
          {resto.join(' ')}
        </p>

        <div data-tour="alternativas" className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {alternativas.map(palavra => {
            const fora = eliminadas.includes(palavra);
            return (
              <button
                key={palavra}
                onClick={e => escolher(palavra, e.currentTarget)}
                disabled={fora || encerrado}
                dir={dir}
                className={`rounded-2xl border-2 font-display font-black transition-colors ${
                  alvoGrande ? 'py-6 text-2xl' : 'py-5 text-xl'
                } ${
                  fora
                    ? 'border-border-subtle bg-surface text-ink-faint line-through cursor-not-allowed'
                    : 'border-border-subtle bg-surface text-ink hover:border-accent hover:bg-accent-soft/30 cursor-pointer'
                }`}
              >
                {palavra}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
