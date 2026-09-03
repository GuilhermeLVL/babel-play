import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Flame, Trophy, Volume2, ArrowRight, Zap, Target, Lightbulb } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela, pulsoDeZoom } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { speak } from '../../lib/tts';

/**
 * TENSE TENNIS / PELOTA GRAMATICAL — O Tênis dos Tempos Verbais (🇪🇸/🇲🇽).
 *
 * Mapeado na Fase 3 do currículo de SLA (DeKeyser & Long - Focus on Form).
 * Automatiza o reflexo de flexão verbal sob pressão de tempo (Pretérito, Futuro, Subjuntivo).
 *
 * Design 100% harmonizado com os tokens Babel Play, animação de bola saltitante e botão de dica.
 */

interface TennisChallenge {
  id: string;
  verb: string;
  pronoun: string;
  tense: string;
  tenseLabel: string;
  correctAnswer: string;
  options: string[];
  translation: string;
  grammarHint: string;
}

interface TenseTennisGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const DESAFIOS_TENNIS: TennisChallenge[] = [
  {
    id: 'tt1',
    verb: 'HABLAR',
    pronoun: 'Yo',
    tense: 'pret_indefinido',
    tenseLabel: 'Pretérito Indefinido (Passado)',
    correctAnswer: 'Hablé',
    options: ['Hablé', 'Hablaba', 'Hablaré'],
    translation: 'Eu falei',
    grammarHint: 'No pretérito indefinido regular (-AR), a 1ª pessoa (Yo) termina em "-é" com acento!',
  },
  {
    id: 'tt2',
    verb: 'COMER',
    pronoun: 'Nosotros',
    tense: 'pret_indefinido',
    tenseLabel: 'Pretérito Indefinido (Passado)',
    correctAnswer: 'Comimos',
    options: ['Comemos', 'Comimos', 'Comeremos'],
    translation: 'Nós comemos (ontem)',
    grammarHint: 'No pretérito indefinido de verbos em -ER e -IR com "Nosotros", a terminação é "-imos"!',
  },
  {
    id: 'tt3',
    verb: 'VIVIR',
    pronoun: 'Ellos',
    tense: 'futuro',
    tenseLabel: 'Futuro Simple',
    correctAnswer: 'Vivirán',
    options: ['Vivieron', 'Vivían', 'Vivirán'],
    translation: 'Eles viverão',
    grammarHint: 'No futuro em espanhol, conserva-se o infinitivo "vivir-" e adiciona-se "-án"!',
  },
  {
    id: 'tt4',
    verb: 'HACER',
    pronoun: 'Tú',
    tense: 'pret_indefinido',
    tenseLabel: 'Pretérito Indefinido (Irregular)',
    correctAnswer: 'Hiciste',
    options: ['Hiciste', 'Hacías', 'Harás'],
    translation: 'Tu fizeste',
    grammarHint: 'O verbo "Hacer" tem raiz irregular "hic-" no pretérito indefinido: tú hic-iste!',
  },
  {
    id: 'tt5',
    verb: 'SER / ESTAR',
    pronoun: 'Él',
    tense: 'subjuntivo',
    tenseLabel: 'Presente de Subjuntivo (Desejo)',
    correctAnswer: 'Sea',
    options: ['Fue', 'Sea', 'Será'],
    translation: 'Que ele seja',
    grammarHint: 'O subjuntivo expressa dúvida ou desejo: "Ojalá que él sea feliz"!',
  },
  {
    id: 'tt6',
    verb: 'IR',
    pronoun: 'Yo',
    tense: 'pret_indefinido',
    tenseLabel: 'Pretérito Indefinido (Irregular)',
    correctAnswer: 'Fui',
    options: ['Iba', 'Fui', 'Iré'],
    translation: 'Eu fui',
    grammarHint: 'No pretérito indefinido, "Ir" e "Ser" compartilham as formas: Yo fui, tú fuiste!',
  },
];

export default function TenseTennisGame({ items: _itemsProp, ageProfile, onFinish, onExit }: TenseTennisGameProps) {
  const [indice, setIndice] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [rallies, setRallies] = useState(0);
  const [tempo, setTempo] = useState(7);
  const [finalizado, setFinalizado] = useState(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  
  // Dicas
  const [dicasRestantes, setDicasRestantes] = useState(3);
  const [dicaAberta, setDicaAberta] = useState(false);
  const [opcoesEliminadas, setOpcoesEliminadas] = useState<string[]>([]);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioJogadaRef = useRef(Date.now());
  const quadraRef = useRef<HTMLDivElement>(null);

  const desafioAtual = DESAFIOS_TENNIS[indice % DESAFIOS_TENNIS.length];

  useEffect(() => {
    inicioJogadaRef.current = Date.now();
    setTempo(ageProfile === 'senior' ? 9 : ageProfile === 'kids' ? 8 : 6);
    setErroMsg(null);
    setDicaAberta(false);
    setOpcoesEliminadas([]);
  }, [indice, ageProfile]);

  // Cronômetro da bola voando
  useEffect(() => {
    if (finalizado) return;
    const timer = setInterval(() => {
      setTempo((prev) => {
        if (prev <= 1) {
          tratarBolaFora('Bola cruzou a linha de fundo! Tempo esgotado.');
          return 6;
        }
        if (prev <= 2) play('tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [indice, finalizado]);

  const usarDica = () => {
    if (dicasRestantes <= 0 || dicaAberta) return;
    play('click');
    play('select');
    setDicasRestantes((d) => d - 1);
    setDicaAberta(true);

    const incorreta = desafioAtual.options.find((opc) => opc !== desafioAtual.correctAnswer && !opcoesEliminadas.includes(opc));
    if (incorreta) {
      setOpcoesEliminadas((prev) => [...prev, incorreta]);
    }
  };

  const tratarRebatida = (opcao: string, event: React.MouseEvent) => {
    const correto = opcao === desafioAtual.correctAnswer;
    const duracao = Date.now() - inicioJogadaRef.current;

    outcomesRef.current.push({
      itemRef: `${desafioAtual.verb} (${desafioAtual.pronoun})`,
      correct: correto,
      attempts: 1,
      ms: duracao,
    });

    if (correto) {
      // ACE / REBATIDA PERFEITA!
      play('combo');
      play('levelUp');
      const novoRally = rallies + 1;
      setRallies(novoRally);
      const pts = 180 + (novoRally * 40);
      setPontos((p) => p + pts);

      const rect = event.currentTarget.getBoundingClientRect();
      emitBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'combo');
      pulsoDeZoom();

      // Fala a conjugação em espanhol
      try {
        speak(`${desafioAtual.pronoun} ${desafioAtual.correctAnswer}`, { lang: 'es-ES' });
      } catch {
        // Ignora
      }

      if (indice + 1 >= 5) {
        concluirPartida(true);
      } else {
        setIndice((i) => i + 1);
      }
    } else {
      tratarBolaFora(`Out! "${opcao}" não é a forma exigida para ${desafioAtual.tenseLabel}.`);
    }
  };

  const tratarBolaFora = (motivo: string) => {
    play('error');
    setRallies(0);
    setErroMsg(motivo);
    if (quadraRef.current) tremor(quadraRef.current);

    setTimeout(() => {
      if (indice + 1 >= 5) {
        concluirPartida(false);
      } else {
        setIndice((i) => i + 1);
      }
    }, 1200);
  };

  const concluirPartida = (venceu: boolean) => {
    setFinalizado(true);
    if (venceu) {
      play('fanfarra');
      comemorar('rodadaPerfeita');
    } else {
      play('error');
    }

    const duracaoTotal = Date.now() - inicioPartidaRef.current;
    const report: RoundReport = {
      gameId: 'blitz' as any,
      items: outcomesRef.current,
      score: pontos,
      durationMs: duracaoTotal,
    };

    setTimeout(() => {
      onFinish(report);
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-md text-ink select-none overflow-y-auto">
      {/* Header Limpo do Babel Play */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/90 backdrop-blur-lg sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2.5 rounded-2xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Sair do Tense Tennis"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wide uppercase text-accent">
                Tense Tennis
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-ink font-bold border border-accent/20">
                🎾 🇪🇸 Pelota Gramatical
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">
              Rebata o verbo no tempo correto antes da bola cruzar a linha de fundo!
            </p>
          </div>
        </div>

        {/* Status & Dica */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={usarDica}
            disabled={dicasRestantes <= 0 || dicaAberta}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover font-bold text-xs text-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            title="Receber dica de conjugação"
          >
            <Lightbulb className="w-4 h-4 text-accent" />
            <span>Dica ({dicasRestantes})</span>
          </button>

          {rallies > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-accent-contrast font-black text-xs shadow-md animate-bounce">
              <Flame className="w-4 h-4 fill-current" />
              <span>{rallies}x RALLY</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>

          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border transition-colors shadow-sm ${
            tempo <= 2 ? 'border-error bg-error/10 text-error animate-pulse' : 'border-border-subtle bg-surface'
          }`}>
            <span className="font-mono font-black text-base">{tempo}s</span>
          </div>
        </div>
      </header>

      {/* A Quadra de Tênis */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
        <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-card flex flex-col items-center space-y-6" ref={quadraRef}>
          
          {/* PLACAR ELETRÔNICO LIMPO */}
          <div className="w-full max-w-xl bg-surface-hover/80 border-2 border-border-subtle rounded-3xl p-6 shadow-sm text-center space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle text-xs font-mono">
              <span className="text-accent font-bold uppercase tracking-wider">Quadra Central · Madrid</span>
              <span className="text-ink-muted">Jogada {indice + 1} de 5</span>
            </div>

            {/* O SAQUE DA BOLA COM ANIMAÇÃO SALTITANTE */}
            <div className="py-4 flex flex-col items-center">
              <span className="text-xs font-mono uppercase tracking-widest text-ink-muted font-bold mb-2">
                BOLA EM JOGO (SAQUE)
              </span>
              <div className="flex items-center gap-3">
                <span className="text-4xl animate-bounce">🎾</span>
                <span className="font-display font-black text-4xl sm:text-6xl tracking-wider text-ink">
                  {desafioAtual.verb}
                </span>
                <span className="text-xl sm:text-2xl px-3.5 py-1 rounded-xl bg-accent text-accent-contrast font-black shadow-sm animate-pulse">
                  {desafioAtual.pronoun}
                </span>
              </div>
              <span className="text-sm text-ink-muted mt-2 font-bold">({desafioAtual.translation})</span>
            </div>

            {/* TEMPO VERBAL EXIGIDO */}
            <div className="pt-3 border-t border-border-subtle flex items-center justify-center gap-2">
              <Target className="w-4 h-4 text-accent" />
              <span className="text-sm font-bold text-ink">
                Rebata no tempo: <strong className="text-accent underline decoration-2">{desafioAtual.tenseLabel}</strong>
              </span>
            </div>
          </div>

          {/* DICA GRAMATICAL SE ATIVADA */}
          {dicaAberta && (
            <div className="w-full max-w-xl p-4 rounded-2xl bg-accent-soft/40 border border-accent/30 text-ink text-xs sm:text-sm font-medium flex items-center gap-3 animate-fadeIn">
              <Lightbulb className="w-5 h-5 text-accent shrink-0" />
              <div>
                <strong className="text-accent-ink block font-bold">Dica de Conjugação:</strong>
                <span>{desafioAtual.grammarHint}</span>
              </div>
            </div>
          )}

          {erroMsg && (
            <div className="w-full max-w-xl p-3 rounded-xl bg-error/15 border border-error/30 text-error font-bold text-center text-xs animate-shake">
              {erroMsg}
            </div>
          )}

          {/* AS 3 OPÇÕES DE REBATIDA */}
          <div className="w-full max-w-xl space-y-3">
            <p className="text-xs font-mono uppercase text-ink-muted font-bold text-center">
              Selecione o alvo correto na quadra para rebater o Ace:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {desafioAtual.options.map((opc, idx) => {
                const eliminada = opcoesEliminadas.includes(opc);
                if (eliminada) {
                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl border-2 border-border-subtle bg-surface-hover/30 opacity-40 text-center flex flex-col items-center justify-center cursor-not-allowed"
                    >
                      <span className="text-xl line-through text-ink-muted font-bold">{opc}</span>
                      <span className="text-[10px] text-error font-mono mt-1">Eliminada ❌</span>
                    </div>
                  );
                }

                return (
                  <button
                    key={idx}
                    onClick={(e) => tratarRebatida(opc, e)}
                    className="p-5 rounded-2xl border-2 border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft/20 transition-all shadow-card active:scale-95 text-center flex flex-col items-center justify-center cursor-pointer group"
                  >
                    <span className="font-display font-black text-2xl sm:text-3xl text-ink group-hover:text-accent group-hover:scale-110 transition-all">
                      {opc}
                    </span>
                    <span className="text-xs text-ink-muted font-mono mt-1 group-hover:text-accent">Rebater 🎾</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
