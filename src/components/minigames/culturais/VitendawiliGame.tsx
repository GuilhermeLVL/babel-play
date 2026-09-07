import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Flame, HelpCircle, ArrowRight, Check, Volume2, Lightbulb, Compass } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { comemorar, tremor, pulsoDeZoom } from '../../../lib/juice';
import { emitBurst } from '../../../lib/effects';
import { speak } from '../../../lib/tts';
import { playJuicedHit, playJuicedError, playJuicedVictory, calculateMultiplier, triggerConfetti } from '../../../lib/gameFeel';

/**
 * VITENDAWILI — Enigmas & Metáforas Culturais do Mundo (Swahili 🌍).
 *
 * Mapeado na Fase 5 de SLA: Treina a competência sociopragmática e a quebra
 * do pensamento literal da L1 através de charadas metafóricas tradicionais.
 *
 * Versão Reformulada:
 * - Contextualizado e intuitivo: O narrador apresenta o enigma com clareza.
 * - 3 Cartas ilustradas táteis com emojis saltitantes e traduções diretas.
 * - Botão de Dica Cultural (💡): Elimina 1 alternativa falsa e dá uma pista divertida.
 * - Design limpo e 100% harmonizado com o sistema visual do Babel Play.
 */

interface CulturalRiddle {
  id: string;
  question: string;
  swahiliPhrase: string;
  solution: string;
  solutionPt: string;
  emoji: string;
  hint: string;
  culturalExplanation: string;
  distractors: {
    solution: string;
    solutionPt: string;
    emoji: string;
  }[];
}

interface VitendawiliGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const ENIGMAS_CULTURAIS: CulturalRiddle[] = [
  {
    id: 'r1',
    question: 'Tenho uma casca lisa e perfeita, não tenho portas nem janelas, mas guardo uma vida inteira por dentro. Quem sou eu?',
    swahiliPhrase: 'Nyumba yangu haina mlango wala dirisha.',
    solution: 'An Egg',
    solutionPt: 'Um Ovo',
    emoji: '🥚',
    hint: 'Pense em algo frágil que quebramos na frigideira para o café da manhã!',
    culturalExplanation: 'Na tradição Swahili de Zanzibar, o ovo simboliza o mistério da criação e o segredo guardado.',
    distractors: [
      { solution: 'A Coconut', solutionPt: 'Um Coco', emoji: '🥥' },
      { solution: 'A Secret Box', solutionPt: 'Uma Caixa Secreta', emoji: '📦' },
    ],
  },
  {
    id: 'r2',
    question: 'Sempre que você caminha sob o sol, eu sigo seus passos em silêncio absoluto. Se você corre, eu corro. Quem sou eu?',
    swahiliPhrase: 'Kila nikitembea, ananifuata lakini hasemi neno.',
    solution: 'Your Shadow',
    solutionPt: 'Sua Sombra',
    emoji: '👤',
    hint: 'Ela desaparece quando a luz do sol se apaga!',
    culturalExplanation: 'A sombra representa o companheiro fiel e o eco silencioso das nossas ações no mundo.',
    distractors: [
      { solution: 'The Wind', solutionPt: 'O Vento', emoji: '💨' },
      { solution: 'A Stray Dog', solutionPt: 'Um Cachorro', emoji: '🐕' },
    ],
  },
  {
    id: 'r3',
    question: 'Uso uma coroa de rei no topo da cabeça e meu fruto doce cresce protegido por dezenas de espinhos pontiagudos. Quem sou eu?',
    swahiliPhrase: 'Ndege wangu anataga mayai mwibani.',
    solution: 'A Pineapple',
    solutionPt: 'Um Abacaxi',
    emoji: '🍍',
    hint: 'Uma fruta tropical deliciosa com casca escamosa e folhas afiadas!',
    culturalExplanation: 'Representa a lição de que as maiores recompensas da vida exigem paciência para atravessar os espinhos.',
    distractors: [
      { solution: 'A Rose', solutionPt: 'Uma Rosa', emoji: '🌹' },
      { solution: 'A Cactus', solutionPt: 'Um Cacto', emoji: '🌵' },
    ],
  },
  {
    id: 'r4',
    question: 'Eu viajo veloz pelos mares sem motor, sem rodas e sem combustível, empurrado apenas pelo sopro do céu. Quem sou eu?',
    swahiliPhrase: 'Gari langu linaenda bila magurudumu wala mafuta.',
    solution: 'A Sailboat',
    solutionPt: 'Um Veleiro / Canoa',
    emoji: '⛵',
    hint: 'Flutua nas ondas do oceano com grandes panos brancos erguidos!',
    culturalExplanation: 'Homenagem aos dhows — os lendários barcos à vela que navegam pelo Oceano Índico há mais de mil anos.',
    distractors: [
      { solution: 'A Whale', solutionPt: 'Uma Baleia', emoji: '🐋' },
      { solution: 'A Cloud', solutionPt: 'Uma Nuvem', emoji: '☁️' },
    ],
  },
  {
    id: 'r5',
    question: 'Ilumino as aldeias inteiras do céu durante a noite, todos podem me contemplar, mas nenhuma mão humana consegue me tocar. Quem sou eu?',
    swahiliPhrase: 'Namuona kila usiku lakini siwezi kumgusa.',
    solution: 'The Moon',
    solutionPt: 'A Lua',
    emoji: '🌙',
    hint: 'Muda de forma no céu noturno: cheia, crescente, minguante...',
    culturalExplanation: 'A lua é a bússola tradicional dos pescadores da África Oriental para prever as marés.',
    distractors: [
      { solution: 'A Star', solutionPt: 'Uma Estrela', emoji: '⭐' },
      { solution: 'A Campfire', solutionPt: 'Uma Fogueira', emoji: '🔥' },
    ],
  },
];

export default function VitendawiliGame({ items: _itemsProp, ageProfile, onFinish, onExit }: VitendawiliGameProps) {
  const [indice, setIndice] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [revelado, setRevelado] = useState(false);
  const [dicaAberta, setDicaAberta] = useState(false);
  const [opcoesEliminadas, setOpcoesEliminadas] = useState<string[]>([]);
  const [dicasRestantes, setDicasRestantes] = useState(3);
  const [finalizado, setFinalizado] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioEnigmaRef = useRef(Date.now());
  const cardRef = useRef<HTMLDivElement>(null);

  const enigmaAtual = ENIGMAS_CULTURAIS[indice % ENIGMAS_CULTURAIS.length];

  // Opções de resposta embaralhadas
  const opcoesAtuais = useMemo(() => {
    const lista = [
      { solution: enigmaAtual.solution, solutionPt: enigmaAtual.solutionPt, emoji: enigmaAtual.emoji, correta: true },
      ...enigmaAtual.distractors.map((d) => ({ ...d, correta: false })),
    ];
    return lista.sort(() => Math.random() - 0.5);
  }, [enigmaAtual]);

  useEffect(() => {
    inicioEnigmaRef.current = Date.now();
    setRevelado(false);
    setDicaAberta(false);
    setOpcoesEliminadas([]);
  }, [indice]);

  // Usar dica: revela o conselho e elimina 1 opção incorreta
  const usarDica = () => {
    if (dicasRestantes <= 0 || dicaAberta) return;
    play('click');
    play('select');
    setDicasRestantes((d) => d - 1);
    setDicaAberta(true);

    const distratorParaEliminar = enigmaAtual.distractors.find((d) => !opcoesEliminadas.includes(d.solution));
    if (distratorParaEliminar) {
      setOpcoesEliminadas((prev) => [...prev, distratorParaEliminar.solution]);
    }
  };

  const handleEscolha = (opc: { solution: string; solutionPt: string; emoji: string; correta: boolean }, event: React.MouseEvent) => {
    if (revelado) return;

    const duracao = Date.now() - inicioEnigmaRef.current;
    outcomesRef.current.push({
      itemRef: enigmaAtual.solution,
      correct: opc.correta,
      attempts: 1,
      ms: duracao,
    });

    if (opc.correta) {
      const novoCombo = combo + 1;
      setCombo(novoCombo);
      const mult = calculateMultiplier(novoCombo);
      const pts = (250 + (novoCombo * 40)) * mult;
      setPontos((p) => p + pts);

      const rect = event.currentTarget.getBoundingClientRect();
      playJuicedHit(
        novoCombo,
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        `DECIFRADO! ${mult}x`
      );
      triggerConfetti({ particleCount: 45, spread: 50 });

      setRevelado(true);

      // Pronuncia a resposta em inglês
      try {
        speak(enigmaAtual.solution, { lang: 'en-US' });
      } catch {
        // Ignora
      }
    } else {
      setCombo(0);
      setOpcoesEliminadas((prev) => [...prev, opc.solution]);
      playJuicedError(cardRef.current, undefined, 'NÃO É ESTE!');
    }
  };

  const proximoEnigma = () => {
    if (indice + 1 >= ENIGMAS_CULTURAIS.length) {
      concluirPartida(true);
    } else {
      setIndice((i) => i + 1);
    }
  };

  const concluirPartida = (venceu: boolean) => {
    setFinalizado(true);
    if (venceu) {
      playJuicedVictory();
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
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-md text-ink select-none overflow-y-auto">
      {/* Header Limpo do Babel Play */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/90 backdrop-blur-lg sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2.5 rounded-2xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Sair dos Enigmas"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wide uppercase text-accent">
                Enigmas Culturais
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-ink font-bold border border-accent/20">
                🌍 Vitendawili · Swahili
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">
              Decifre metáforas populares que os nativos usam para aguçar a mente!
            </p>
          </div>
        </div>

        {/* Status de Pontos & Botão de Dica */}
        <div className="flex items-center gap-3">
          <button
            onClick={usarDica}
            disabled={dicasRestantes <= 0 || dicaAberta || revelado}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover font-bold text-xs text-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            title="Receber uma pista do enigma"
          >
            <Lightbulb className="w-4 h-4 text-accent" />
            <span>Dica ({dicasRestantes})</span>
          </button>

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>
        </div>
      </header>

      {/* Arena Central do Enigma */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
        <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-card flex flex-col items-center space-y-6" ref={cardRef}>
          
          {/* Topo do Card de Enigma */}
          <div className="w-full flex items-center justify-between border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-accent uppercase tracking-wider">
              <Flame className="w-4 h-4 text-accent" />
              <span>Enigma {indice + 1} de {ENIGMAS_CULTURAIS.length}</span>
            </div>
            <span className="text-xs text-ink-muted">Metáfora Popular</span>
          </div>

          {/* O ENUNCIADO CLARO DA CHARADA */}
          <div className="w-full text-center space-y-3 py-2">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-accent-soft text-accent flex items-center justify-center shadow-sm">
              <span className="text-3xl animate-bounce">🤔</span>
            </div>

            <h2 className="font-display font-black text-2xl sm:text-3xl text-ink max-w-2xl mx-auto leading-snug">
              "{enigmaAtual.question}"
            </h2>

            {/* Frase Tradicional em Swahili com botão de áudio nativo */}
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-mono italic text-ink-muted">
                Swahili: "{enigmaAtual.swahiliPhrase}"
              </span>
              <button
                onClick={() => speak(enigmaAtual.swahiliPhrase, { lang: 'sw' })}
                className="p-1 rounded-full hover:bg-surface-hover text-accent transition-colors cursor-pointer"
                title="Ouvir sonoridade em Swahili"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* DICA CULTURAL EXPANDIDA */}
          {dicaAberta && !revelado && (
            <div className="w-full p-4 rounded-2xl bg-accent-soft/40 border border-accent/30 text-ink text-xs sm:text-sm font-medium flex items-center gap-3 animate-fadeIn">
              <Lightbulb className="w-5 h-5 text-accent shrink-0" />
              <div>
                <strong className="text-accent-ink block font-bold">Pista do Contador de Histórias:</strong>
                <span>{enigmaAtual.hint}</span>
              </div>
            </div>
          )}

          {/* ESTADO DE JOGO: AS 3 CARTAS ILUSTRADAS TÁTEIS */}
          {!revelado ? (
            <div className="w-full space-y-3 pt-2">
              <p className="text-xs font-mono uppercase text-ink-muted font-bold text-center">
                Qual é a resposta para esta metáfora?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {opcoesAtuais.map((opc, idx) => {
                  const eliminada = opcoesEliminadas.includes(opc.solution);
                  if (eliminada) {
                    return (
                      <div
                        key={idx}
                        className="p-5 rounded-2xl border-2 border-border-subtle bg-surface-hover/30 opacity-40 flex flex-col items-center justify-center text-center cursor-not-allowed"
                      >
                        <span className="text-2xl grayscale mb-1">❌</span>
                        <span className="font-bold text-sm text-ink-muted line-through">{opc.solution}</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={idx}
                      onClick={(e) => handleEscolha(opc, e)}
                      className="p-6 rounded-2xl border-2 border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft/20 transition-all shadow-card active:scale-95 text-center flex flex-col items-center justify-center group cursor-pointer"
                    >
                      <span className="text-4xl sm:text-5xl mb-2 group-hover:scale-125 group-hover:animate-bounce transition-transform">
                        {opc.emoji}
                      </span>
                      <span className="font-display font-black text-xl text-ink group-hover:text-accent transition-colors">
                        {opc.solution}
                      </span>
                      <span className="text-xs text-ink-muted font-medium mt-1">
                        ({opc.solutionPt})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ESTADO DE SUCESSO E REVELAÇÃO CULTURAL */
            <div className="w-full flex flex-col items-center text-center space-y-4 py-4 animate-scaleIn">
              <div className="w-20 h-20 rounded-full bg-accent-soft text-accent flex items-center justify-center shadow-lg">
                <span className="text-5xl animate-bounce">{enigmaAtual.emoji}</span>
              </div>

              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-accent font-bold">
                  Enigma Decifrado com Sabedoria!
                </span>
                <h3 className="font-display font-black text-3xl text-ink mt-1">
                  {enigmaAtual.solution} ({enigmaAtual.solutionPt})
                </h3>
              </div>

              <div className="p-4 rounded-2xl bg-surface-hover border border-border-subtle text-xs sm:text-sm text-ink-muted max-w-xl text-left">
                💡 <strong className="text-ink">Por que esta metáfora é usada?</strong> {enigmaAtual.culturalExplanation}
              </div>

              <button
                onClick={proximoEnigma}
                className="px-8 py-3 rounded-2xl bg-accent text-accent-contrast font-black text-sm shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>{indice + 1 >= ENIGMAS_CULTURAIS.length ? 'Concluir Desafio' : 'Próximo Enigma'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
