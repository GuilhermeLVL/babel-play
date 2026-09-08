import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Award, Lightbulb, Delete, Timer as TimerIcon } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { MINIGAMES, chaveDoTermo, scoreRound } from '@core';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { comemorar, tremor } from '../../../lib/juice';

/**
 * CHOSEONG — as consoantes ficam à vista, as vogais somem, e a pessoa escreve a palavra a partir
 * do significado. É o 초성게임 transposto para o alfabeto latino, que é o que o gate garante
 * (`requisitos: { alfabeto: 'latino', escrita: 'teclado' }`).
 */

interface ChoseongGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const VOGAIS = ['A', 'E', 'I', 'O', 'U'];
/** Segundos por palavra, por perfil. */
const SEGUNDOS: Record<AgeProfileType, number> = { kids: 18, pro: 15, senior: 22 };

interface Enigma {
  item: MinigameItem;
  /** A palavra sem acento e em maiúsculas — é nela que os slots e a comparação vivem. */
  alvo: string;
  ocultas: Set<number>;
}

export default function ChoseongGame({ items, ageProfile, onFinish, onExit }: ChoseongGameProps) {
  /* Palavra sem nenhuma vogal não tem o que esconder: sai da rodada em vez de nascer resolvida. */
  const enigmas = useMemo<Enigma[]>(() => items.flatMap(item => {
    const alvo = chaveDoTermo(item.answer);
    const ocultas = new Set(alvo.split('').flatMap((c, i) => (VOGAIS.includes(c) ? [i] : [])));
    return alvo.length >= 2 && ocultas.size > 0 ? [{ item, alvo, ocultas }] : [];
  }), [items]);

  const suficiente = enigmas.length >= MINIGAMES.choseong.minItems;

  const [indice, setIndice] = useState(0);
  const [letras, setLetras] = useState<string[]>([]);
  /* O relógio declara de que palavra ele é: sem isso o zero da palavra anterior sobrevive um
     render à troca e dá a seguinte por perdida na hora, com um outcome de ms zero. */
  const [relogio, setRelogio] = useState({ palavra: 0, segundos: SEGUNDOS[ageProfile] });
  const tempo = relogio.palavra === indice ? relogio.segundos : SEGUNDOS[ageProfile];
  const [pontos, setPontos] = useState(0);
  const [dicasRestantes, setDicasRestantes] = useState(2);
  const [acabou, setAcabou] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioItemRef = useRef(Date.now());
  const tentativasRef = useRef(1);
  const comDicaRef = useRef(false);
  const respondidoRef = useRef(false);
  const jaFinalizouRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const enigma: Enigma | undefined = enigmas[indice];

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const finalizar = useCallback(() => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    setAcabou(true);
    const outcomes = outcomesRef.current;
    const report: RoundReport = {
      gameId: 'choseong',
      items: outcomes,
      score: scoreRound('choseong', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    };
    const perfeita = outcomes.length > 0 && outcomes.every(o => o.correct && !o.revealed);
    comemorar(perfeita ? 'rodadaPerfeita' : 'rodadaBoa', palcoRef.current);
    setTimeout(() => onFinish(report), 1100);
  }, [onFinish]);

  const registrar = useCallback((correct: boolean, revealed?: boolean) => {
    if (!enigma) return;
    outcomesRef.current.push({
      cardId: enigma.item.cardId,
      itemRef: enigma.item.answer,
      correct,
      attempts: tentativasRef.current,
      ms: Date.now() - inicioItemRef.current,
      hinted: comDicaRef.current,
      ...(revealed ? { revealed: true } : {}),
    });
    setPontos(scoreRound('choseong', outcomesRef.current));
  }, [enigma]);

  const avancar = useCallback(() => {
    if (indice + 1 >= enigmas.length) finalizar();
    else setIndice(i => i + 1);
  }, [indice, enigmas.length, finalizar]);

  // Troca de palavra: as consoantes entram já preenchidas, as vogais nascem vazias.
  useEffect(() => {
    if (!enigma || jaFinalizouRef.current) return;
    inicioItemRef.current = Date.now();
    tentativasRef.current = 1;
    comDicaRef.current = false;
    respondidoRef.current = false;
    setLetras(enigma.alvo.split('').map((c, i) => (enigma.ocultas.has(i) ? '' : c)));
    setRelogio({ palavra: indice, segundos: SEGUNDOS[ageProfile] });
  }, [indice, enigma, ageProfile]);

  useEffect(() => {
    if (acabou || !enigma || respondidoRef.current) return;
    if (relogio.palavra !== indice) return;
    if (tempo <= 0) {
      respondidoRef.current = true;
      registrar(false, true);
      comemorar('erro', palcoRef.current);
      avancar();
      return;
    }
    if (tempo <= 3) play('tick');
    const t = setTimeout(() => setRelogio(r => (r.palavra === indice ? { ...r, segundos: r.segundos - 1 } : r)), 1000);
    return () => clearTimeout(t);
  }, [relogio, tempo, indice, acabou, enigma, registrar, avancar]);

  const conferir = useCallback((montada: string[]) => {
    if (!enigma) return;
    if (montada.join('') === enigma.alvo) {
      respondidoRef.current = true;
      registrar(true);
      comemorar('acerto', palcoRef.current);
      setTimeout(avancar, 700);
      return;
    }
    tentativasRef.current += 1;
    comemorar('erro', palcoRef.current);
    tremor(palcoRef.current);
    setLetras(enigma.alvo.split('').map((c, i) => (enigma.ocultas.has(i) ? '' : c)));
  }, [enigma, registrar, avancar]);

  const escrever = useCallback((char: string) => {
    if (acabou || !enigma || respondidoRef.current) return;
    const vazio = letras.findIndex((l, i) => !l && enigma.ocultas.has(i));
    if (vazio === -1) return;
    const novas = [...letras];
    novas[vazio] = char;
    play('click');
    setLetras(novas);
    if (!novas.some((l, i) => !l && enigma.ocultas.has(i))) conferir(novas);
  }, [acabou, enigma, letras, conferir]);

  const apagar = useCallback(() => {
    if (acabou || !enigma || respondidoRef.current) return;
    for (let i = letras.length - 1; i >= 0; i--) {
      if (enigma.ocultas.has(i) && letras[i]) {
        const novas = [...letras];
        novas[i] = '';
        setLetras(novas);
        return;
      }
    }
  }, [acabou, enigma, letras]);

  // Teclado físico: quem sabe a palavra escreve direto, sem caçar botão.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') { e.preventDefault(); apagar(); return; }
      const letra = e.key.toUpperCase();
      if (VOGAIS.includes(letra)) { e.preventDefault(); escrever(letra); }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [escrever, apagar]);

  const usarDica = () => {
    if (acabou || !enigma || respondidoRef.current || dicasRestantes <= 0) return;
    const vazio = letras.findIndex((l, i) => !l && enigma.ocultas.has(i));
    if (vazio === -1) return;
    setDicasRestantes(d => d - 1);
    comDicaRef.current = true;
    play('timeBonus');
    const novas = [...letras];
    novas[vazio] = enigma.alvo[vazio];
    setLetras(novas);
    if (!novas.some((l, i) => !l && enigma.ocultas.has(i))) conferir(novas);
  };

  if (!suficiente) return null;

  return (
    <div ref={palcoRef} className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            aria-label="Sair do Choseong"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Choseong</span>
            <p className="text-xs text-ink-muted">As consoantes já estão na mesa. Complete as vogais.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={usarDica}
            disabled={dicasRestantes <= 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Lightbulb className="w-3.5 h-3.5 text-accent" />
            <span>Abrir uma vogal ({dicasRestantes})</span>
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Award className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold tabular-nums">{pontos}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <TimerIcon className={`w-4 h-4 ${tempo <= 3 ? 'text-error' : 'text-ink-muted'}`} />
            <span className={`font-mono font-black tabular-nums ${tempo <= 3 ? 'text-error-ink' : 'text-ink'}`}>{tempo}s</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col items-center justify-center gap-6 w-full max-w-2xl mx-auto">
        <p data-tour="pista" className="text-base sm:text-lg font-bold text-ink text-center">
          {enigma?.item.prompt}
        </p>

        <div
          dir={direcaoDoTexto(enigma?.item.lang)}
          lang={enigma?.item.lang}
          className="flex flex-wrap justify-center gap-2 sm:gap-3"
        >
          {letras.map((letra, i) => {
            const oculta = enigma?.ocultas.has(i) ?? false;
            return (
              <span
                key={i}
                className={`w-12 h-14 sm:w-14 sm:h-16 rounded-2xl flex items-center justify-center font-display font-black text-2xl sm:text-3xl border-2 shadow-card
                  ${!oculta
                    ? 'border-border-subtle bg-surface-hover text-ink-muted'
                    : letra
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-dashed border-border-subtle bg-surface text-ink-faint'}`}
              >
                {letra}
              </span>
            );
          })}
        </div>

        <div data-tour="teclado" className="flex flex-wrap justify-center gap-2">
          {VOGAIS.map(v => (
            <button
              key={v}
              onClick={() => escrever(v)}
              className="px-4 py-3 rounded-xl border border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft hover:text-accent-ink font-display font-black text-lg shadow-card active:scale-95 transition-all cursor-pointer"
            >
              {v}
            </button>
          ))}
          <button
            onClick={apagar}
            aria-label="Apagar a última vogal"
            className="px-4 py-3 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle text-ink-muted hover:text-ink shadow-card active:scale-95 transition-all cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <span className="text-xs font-mono text-ink-muted">Palavra {indice + 1} de {enigmas.length}</span>
      </main>
    </div>
  );
}
