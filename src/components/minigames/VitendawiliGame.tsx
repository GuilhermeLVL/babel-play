import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Flame, Moon, HelpCircle, ArrowRight, Check, Volume2, Award } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela, pulsoDeZoom } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { speak } from '../../lib/tts';

/**
 * VITENDAWILI — O Duelo de Enigmas Metafóricos Swahili (Tega! / Tegua!).
 *
 * Mapeado na Fase 5 do currículo de SLA (Canale & Swain, Dörnyei & Scott).
 *
 * Ritual Tradicional ao redor da fogueira em Zanzibar e Quênia:
 * 1. O ancião clama: "Kitendawili!" (Tenho um enigma!)
 * 2. O aprendiz responde: "Tega!" (Arme a armadilha!)
 * 3. Declama-se uma profunda metáfora poética da sabedoria comunitária.
 * 4. O aprendiz decifra o sentido figurado, quebrando o vício de interpretação literal da L1.
 */

interface RiddleChallenge {
  id: string;
  riddleSwahili: string;
  riddleTranslation: string;
  solution: string;
  solutionTranslation: string;
  distractors: { text: string; translation: string }[];
  explanation: string;
  emoji: string;
}

interface VitendawiliGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const ENIGMAS_VITENDAWILI: RiddleChallenge[] = [
  {
    id: 'v1',
    riddleSwahili: 'Nyumba yangu haina mlango.',
    riddleTranslation: 'Minha casa não tem porta.',
    solution: 'Egg',
    solutionTranslation: 'Um Ovo (Yai)',
    distractors: [
      { text: 'Cave', translation: 'Uma Caverna' },
      { text: 'Box', translation: 'Uma Caixa' },
    ],
    explanation: 'A casca do ovo abriga a vida inteira por dentro, mas não possui nenhuma porta para entrar!',
    emoji: '🥚',
  },
  {
    id: 'v2',
    riddleSwahili: 'Kila nikitembea, ananifuata lakini hasemi neno.',
    riddleTranslation: 'Sempre que caminho, ele me segue mas não diz uma única palavra.',
    solution: 'Shadow',
    solutionTranslation: 'A Sombra (Kivuli)',
    distractors: [
      { text: 'Dog', translation: 'O Cachorro' },
      { text: 'Wind', translation: 'O Vento' },
    ],
    explanation: 'Sua sombra caminha em silêncio absoluto ao seu lado durante o dia.',
    emoji: '👤',
  },
  {
    id: 'v3',
    riddleSwahili: 'Ndege wangu anataga mayai mwibani.',
    riddleTranslation: 'Meu pássaro bota ovos no meio dos espinhos.',
    solution: 'Pineapple',
    solutionTranslation: 'O Abacaxi (Nanasi)',
    distractors: [
      { text: 'Cactus', translation: 'Um Cacto' },
      { text: 'Hedgehog', translation: 'Um Porco-espinho' },
    ],
    explanation: 'O fruto dourado do abacaxi cresce coroado e protegido por folhas pontiagudas e espinhosas.',
    emoji: '🍍',
  },
  {
    id: 'v4',
    riddleSwahili: 'Gari langu linaenda bila magurudumu wala mafuta.',
    riddleTranslation: 'Meu carro anda sem rodas nem combustível.',
    solution: 'Boat / Canoe',
    solutionTranslation: 'O Barco / Canoa (Mashua)',
    distractors: [
      { text: 'Airplane', translation: 'O Avião' },
      { text: 'Horse', translation: 'O Cavalo' },
    ],
    explanation: 'A canoa desliza sobre as águas impulsionada apenas pelo vento e pelas correntes marítimas.',
    emoji: '🛶',
  },
  {
    id: 'v5',
    riddleSwahili: 'Namuona lakini siwezi kumgusa.',
    riddleTranslation: 'Eu a vejo toda noite, mas nunca consigo tocá-la.',
    solution: 'The Moon',
    solutionTranslation: 'A Lua (Mwezi)',
    distractors: [
      { text: 'Fire', translation: 'O Fogo' },
      { text: 'Mountain', translation: 'A Montanha' },
    ],
    explanation: 'A lua ilumina a aldeia inteira no céu noturno, porém está além do alcance das mãos humanas.',
    emoji: '🌙',
  },
];

export default function VitendawiliGame({ items: _itemsProp, ageProfile, onFinish, onExit }: VitendawiliGameProps) {
  const [indice, setIndice] = useState(0);
  const [faseRitual, setFaseRitual] = useState<'chamada' | 'enigma' | 'revelacao'>('chamada');
  const [pontos, setPontos] = useState(0);
  const [sabedoriaCombo, setSabedoriaCombo] = useState(0);
  const [finalizado, setFinalizado] = useState(false);
  const [opcoesEmbaralhadas, setOpcoesEmbaralhadas] = useState<{ text: string; translation: string; correta: boolean }[]>([]);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioEnigmaRef = useRef(Date.now());
  const cardRef = useRef<HTMLDivElement>(null);

  const enigmaAtual = ENIGMAS_VITENDAWILI[indice % ENIGMAS_VITENDAWILI.length];

  // Configura o enigma da rodada
  useEffect(() => {
    setFaseRitual('chamada');
    inicioEnigmaRef.current = Date.now();

    const todas = [
      { text: enigmaAtual.solution, translation: enigmaAtual.solutionTranslation, correta: true },
      ...enigmaAtual.distractors.map((d) => ({ text: d.text, translation: d.translation, correta: false })),
    ].sort(() => Math.random() - 0.5);

    setOpcoesEmbaralhadas(todas);
  }, [indice, enigmaAtual]);

  // Passo do ritual: O jogador responde "TEGA!" ao clamor "KITENDAWILI!"
  const responderTega = () => {
    play('click');
    play('add');
    pulsoDeZoom();
    setFaseRitual('enigma');

    // Toca a pronúncia do enigma em Swahili
    try {
      speak(enigmaAtual.riddleSwahili, { lang: 'sw' });
    } catch {
      // Ignora
    }
  };

  const handleEscolhaSolucao = (opc: { text: string; translation: string; correta: boolean }, event: React.MouseEvent) => {
    const duracao = Date.now() - inicioEnigmaRef.current;

    outcomesRef.current.push({
      itemRef: enigmaAtual.riddleSwahili,
      correct: opc.correta,
      attempts: 1,
      ms: duracao,
    });

    if (opc.correta) {
      play('success');
      play('combo');
      const novoCombo = sabedoriaCombo + 1;
      setSabedoriaCombo(novoCombo);
      const pts = 250 + (novoCombo * 50);
      setPontos((p) => p + pts);

      const rect = event.currentTarget.getBoundingClientRect();
      emitBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'combo');
      pulsoDeZoom();
      flashDeTela();

      setFaseRitual('revelacao');
    } else {
      play('error');
      setSabedoriaCombo(0);
      if (cardRef.current) tremor(cardRef.current);
    }
  };

  const proximoEnigmaOuFim = () => {
    if (indice + 1 >= ENIGMAS_VITENDAWILI.length) {
      concluirPartida(true);
    } else {
      setIndice((i) => i + 1);
    }
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
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/90 backdrop-blur-lg sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2.5 rounded-2xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Sair do Vitendawili"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wide uppercase bg-gradient-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">
                Vitendawili Enigmas
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/15 text-orange-600 font-bold border border-orange-500/20">
                🔥 🌍 Swahili · Tega!
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">
              O ritual dos enigmas e metáforas da sabedoria Swahili de Zanzibar!
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 sm:gap-4">
          {sabedoriaCombo > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-600 text-white font-black text-xs shadow-lg animate-bounce">
              <Flame className="w-4 h-4 fill-current" />
              <span>{sabedoriaCombo}x SABEDORIA ANCESTRAL</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>
        </div>
      </header>

      {/* Arena da Fogueira Swahili */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
        <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center space-y-6" ref={cardRef}>
          
          {/* FASE 1 DO RITUAL: O CHAMADO "KITENDAWILI!" */}
          {faseRitual === 'chamada' && (
            <div className="w-full max-w-lg text-center space-y-6 py-8 animate-scaleIn">
              <div className="p-4 rounded-full bg-orange-500/15 border-2 border-orange-500/40 w-24 h-24 mx-auto flex items-center justify-center animate-pulse">
                <Flame className="w-12 h-12 text-orange-500" />
              </div>

              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold">
                  O Ancião ao redor da fogueira proclama:
                </span>
                <h2 className="font-display font-black text-4xl sm:text-5xl text-ink mt-2">
                  "Kitendawili!"
                </h2>
                <p className="text-sm text-ink-muted mt-1">
                  (Tenho um enigma para desafiar sua mente!)
                </p>
              </div>

              <button
                onClick={responderTega}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-display font-black text-xl tracking-wider shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                Responder: "TEGA!" (Arme a armadilha!)
              </button>
            </div>
          )}

          {/* FASE 2 DO RITUAL: DECLAMAÇÃO DA METÁFORA POÉTICA */}
          {faseRitual === 'enigma' && (
            <div className="w-full max-w-2xl space-y-6 animate-fadeIn">
              <div className="text-center space-y-2">
                <span className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold">
                  Enigma {indice + 1} de {ENIGMAS_VITENDAWILI.length}
                </span>

                <div className="p-6 rounded-3xl bg-gradient-to-b from-orange-950 to-amber-950 border-4 border-orange-500/50 text-orange-50 shadow-2xl space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <Moon className="w-5 h-5 text-orange-400" />
                    <span className="text-xs font-mono uppercase tracking-widest text-orange-300">
                      Metáfora em Swahili
                    </span>
                  </div>

                  <h3 className="font-display font-black text-3xl sm:text-4xl text-amber-100">
                    "{enigmaAtual.riddleSwahili}"
                  </h3>

                  <p className="text-base sm:text-lg font-bold text-amber-300/90 italic">
                    "{enigmaAtual.riddleTranslation}"
                  </p>
                </div>
              </div>

              {/* AS OPÇÕES DE RESPOSTA METAFÓRICA */}
              <div className="space-y-3">
                <p className="text-xs font-mono uppercase text-ink-muted font-bold text-center">
                  Qual é o significado profundo desta metáfora cultural?
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {opcoesEmbaralhadas.map((opc, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => handleEscolhaSolucao(opc, e)}
                      className="p-5 rounded-2xl border-2 border-border-subtle bg-surface-hover hover:border-orange-500 hover:bg-orange-500/10 transition-all shadow-md active:scale-95 text-center flex flex-col items-center justify-center cursor-pointer group"
                    >
                      <span className="font-display font-black text-xl sm:text-2xl text-ink group-hover:text-orange-600 transition-colors">
                        {opc.text}
                      </span>
                      <span className="text-xs text-ink-muted font-medium mt-1">
                        ({opc.translation})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* FASE 3: REVELAÇÃO DA SABEDORIA */}
          {faseRitual === 'revelacao' && (
            <div className="w-full max-w-lg text-center space-y-4 py-4 animate-scaleIn">
              <span className="text-6xl">{enigmaAtual.emoji}</span>
              <h3 className="font-display font-black text-3xl text-ink">
                Enigma Decifrado!
              </h3>
              <p className="text-lg font-bold text-accent">
                Resposta: {enigmaAtual.solution} ({enigmaAtual.solutionTranslation})
              </p>

              <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-xs sm:text-sm text-ink font-medium">
                💡 <strong>Sabedoria Popular:</strong> {enigmaAtual.explanation}
              </div>

              <button
                onClick={proximoEnigmaOuFim}
                className="px-8 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 text-white font-black text-sm shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                Próximo Enigma
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
