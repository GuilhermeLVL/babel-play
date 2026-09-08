import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Volume2, Award, Timer as TimerIcon } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { MINIGAMES, distractorsFor, scoreRound } from '@core';
import { direcaoDoTexto } from '../../../lib/languages';
import { idiomaDaInterface } from '../../../lib/i18n';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { comemorar, tremor } from '../../../lib/juice';
import { speak, isTtsSupported } from '../../../lib/tts';

/**
 * KARUTA — o narrador declama a PISTA e as cartas na mesa trazem as palavras candidatas.
 *
 * A inversão é o jogo inteiro. Declamar a RESPOSTA e espalhar respostas escritas casava som com
 * grafia: a pessoa achava a carta sem lembrar de nada. Ouvindo o SIGNIFICADO e tocando na palavra,
 * a rodada volta a ser recuperação — a mesma pergunta do Duelo, feita pelo ouvido.
 */

interface KarutaGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Segundos para varrer a mesa, por perfil. */
const SEGUNDOS: Record<AgeProfileType, number> = { kids: 12, pro: 8, senior: 14 };
/** Teto de cartas na mesa: acima disso a varredura vira sorte. */
const CARTAS_NA_MESA = 6;

function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function KarutaGame({ items, ageProfile, onFinish, onExit }: KarutaGameProps) {
  const suficiente = items.length >= MINIGAMES.karuta.minItems;

  const [indice, setIndice] = useState(0);
  /**
   * O relógio DECLARA de que carta ele é.
   *
   * Com `tempo` solto, o zero da carta anterior sobrevivia um render à troca: o efeito de reset
   * zera a guarda de "já respondeu" antes do efeito do relógio rodar, e o relógio — ainda em 0,
   * porque o `setTempo` do reset só chega no render seguinte — dava a carta NOVA por perdida na
   * hora, com um outcome de ms zero. Amarrar o relógio ao índice fecha a janela.
   */
  const [relogio, setRelogio] = useState({ carta: 0, segundos: SEGUNDOS[ageProfile] });
  const tempo = relogio.carta === indice ? relogio.segundos : SEGUNDOS[ageProfile];
  const [pontos, setPontos] = useState(0);
  const [acertada, setAcertada] = useState<string | null>(null);
  const [errada, setErrada] = useState<string | null>(null);
  const [acabou, setAcabou] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioItemRef = useRef(Date.now());
  const tentativasRef = useRef(0);
  const respondidoRef = useRef(false);
  const jaFinalizouRef = useRef(false);
  const mesaRef = useRef<HTMLDivElement | null>(null);

  const item: MinigameItem | undefined = items[indice];

  /* A pista é a TRADUÇÃO, e tradução está no idioma de quem joga — não no de `item.lang`. Falar a
     pista com a voz da língua praticada leria "casa" com sotaque inglês. A exceção é a pista
     `clozed`, que é a frase real: essa sim está em `item.lang`. */
  const idiomaDaFala = item?.clozed ? item.lang : idiomaDaInterface();

  /** A mesa: a carta certa mais os distratores que os OUTROS itens da rodada derem. */
  const mesa = useMemo(() => {
    if (!item) return [];
    const quantos = Math.min(CARTAS_NA_MESA, items.length) - 1;
    return embaralhar([item.answer, ...distractorsFor(item, items, quantos)]);
  }, [item, items]);

  const narrar = useCallback(() => {
    if (!item) return;
    speak(item.prompt, { lang: idiomaDaFala });
  }, [item, idiomaDaFala]);

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const finalizar = useCallback(() => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    setAcabou(true);
    const outcomes = outcomesRef.current;
    const report: RoundReport = {
      gameId: 'karuta',
      items: outcomes,
      score: scoreRound('karuta', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    };
    const perfeita = outcomes.length > 0 && outcomes.every(o => o.correct && !o.revealed);
    comemorar(perfeita ? 'rodadaPerfeita' : 'rodadaBoa', mesaRef.current);
    setTimeout(() => onFinish(report), 1100);
  }, [onFinish]);

  const registrar = useCallback((correct: boolean, revealed?: boolean) => {
    if (!item) return;
    outcomesRef.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct,
      attempts: Math.max(1, tentativasRef.current),
      ms: Date.now() - inicioItemRef.current,
      ...(revealed ? { revealed: true } : {}),
    });
    setPontos(scoreRound('karuta', outcomesRef.current));
  }, [item]);

  const avancar = useCallback(() => {
    if (indice + 1 >= items.length) finalizar();
    else setIndice(i => i + 1);
  }, [indice, items.length, finalizar]);

  // Troca de carta: zera o relógio e as tentativas, e o narrador declama de novo.
  useEffect(() => {
    if (!item || jaFinalizouRef.current) return;
    inicioItemRef.current = Date.now();
    tentativasRef.current = 0;
    respondidoRef.current = false;
    setAcertada(null);
    setErrada(null);
    setRelogio({ carta: indice, segundos: SEGUNDOS[ageProfile] });
    narrar();
  }, [indice, item, ageProfile, narrar]);

  // O relógio da carta. Um `setTimeout` por segundo, como no Duelo.
  useEffect(() => {
    if (acabou || !item || respondidoRef.current) return;
    if (relogio.carta !== indice) return;
    if (tempo <= 0) {
      respondidoRef.current = true;
      registrar(false, true);
      comemorar('erro', mesaRef.current);
      avancar();
      return;
    }
    if (tempo <= 3) play('tick');
    const t = setTimeout(() => setRelogio(r => (r.carta === indice ? { ...r, segundos: r.segundos - 1 } : r)), 1000);
    return () => clearTimeout(t);
  }, [relogio, tempo, indice, acabou, item, registrar, avancar]);

  const golpear = (carta: string, el: HTMLElement | null) => {
    if (acabou || !item || respondidoRef.current) return;
    tentativasRef.current += 1;

    if (carta !== item.answer) {
      // "Otetsuki": a carta errada volta para a mesa e a rodada continua — só a nota cai.
      setErrada(carta);
      setTimeout(() => setErrada(null), 420);
      comemorar('erro', el);
      tremor(mesaRef.current);
      return;
    }

    respondidoRef.current = true;
    setAcertada(carta);
    registrar(true);
    comemorar('acerto', el);
    speak(item.answer, { lang: item.lang });
    setTimeout(avancar, 700);
  };

  if (!suficiente) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            aria-label="Sair do Karuta"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Karuta</span>
            <p className="text-xs text-ink-muted">Ouça o significado e toque na palavra que ele descreve.</p>
          </div>
        </div>

        <div data-tour="placar" className="flex items-center gap-3">
          <button
            onClick={narrar}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-contrast font-bold text-sm shadow-card hover:opacity-95 active:scale-95 transition-all cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
            <span>Ouvir de novo</span>
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

      <div className="px-6 py-3 border-b border-border-subtle bg-surface/60 flex items-center justify-between gap-3">
        {/* Sem voz no aparelho o jogo seria insolúvel: aí, e só aí, a pista aparece escrita. */}
        {isTtsSupported() ? (
          <p className="text-sm text-ink-muted">O narrador já declamou a pista. Repita quando quiser.</p>
        ) : (
          <p data-tour="pista" className="text-sm font-bold text-ink">{item?.prompt}</p>
        )}
        <span className="text-xs font-mono text-ink-muted">Carta {indice + 1} de {items.length}</span>
      </div>

      <main ref={mesaRef} className="flex-1 p-6 sm:p-10 overflow-y-auto flex items-start justify-center">
        <div
          data-tour="cartas"
          className="w-full max-w-4xl grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5"
        >
          {mesa.map(carta => {
            const certa = carta === acertada;
            const furada = carta === errada;
            return (
              <button
                key={carta}
                onClick={e => golpear(carta, e.currentTarget)}
                disabled={acabou || certa}
                dir={direcaoDoTexto(item?.lang)}
                lang={item?.lang}
                className={`aspect-[4/3] rounded-2xl border-2 px-4 py-3 flex items-center justify-center text-center font-display font-black text-xl sm:text-2xl shadow-card transition-all cursor-pointer
                  ${certa
                    ? 'border-good bg-good-soft text-good-ink'
                    : furada
                    ? 'border-error bg-error-soft text-error-ink'
                    : 'border-border-subtle bg-surface text-ink hover:border-accent hover:text-accent hover:-translate-y-1'}`}
              >
                {carta}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
