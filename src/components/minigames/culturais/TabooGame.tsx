import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ShieldAlert, Sparkles, AlertTriangle, Flame, ArrowRight, Volume2, Bomb, Clock, Lightbulb, Send, Check, Zap } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { comemorar, tremor, glitchDeTela, flashDeTela, pulsoDeZoom } from '../../../lib/juice';
import { emitBurst } from '../../../lib/effects';
import { speak } from '../../../lib/tts';
import { playJuicedHit, playJuicedError, playJuicedVictory, calculateMultiplier, triggerShake } from '../../../lib/gameFeel';

/**
 * TABOO ARENA — Forja da Circunlocução e Paráfrase de Alta Tensão.
 *
 * Inspirado no clássico jogo de festa e padrão-ouro de fluência B2/C1 (Dörnyei & Scott).
 *
 * Recursos Avançados:
 * 1. Baralho de 15 cartas de festa icônicas com 4 palavras proibidas rigorosas.
 * 2. MODO 1: Arcade Paraphrase (Escolha a definição legítima entre armadilhas tabu).
 * 3. MODO 2: Forja Livre do Falante (O jogador digita sua própria circunlocução com Taboo Radar em tempo real!).
 * 4. Power-ups de Festa:
 *    - 💣 Bomba de Tabu: Destrói 1 das 4 palavras proibidas.
 *    - ⏱️ Tempo Congelado: +15 segundos no cronômetro.
 *    - 💡 Dica Dourada: Elimina 1 alternativa falsa.
 * 5. Buzzer Arcade com Glitch de tela ao cometer infração tabu.
 */

interface TabooCardData {
  id: string;
  itemRef: string;
  targetWord: string;
  translation: string;
  forbiddenWords: string[];
  options: {
    text: string;
    valid: boolean;
    reason?: string;
  }[];
}

interface TabooGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const TABOO_DECK: TabooCardData[] = [
  {
    id: 'tb1',
    itemRef: 'Airport',
    targetWord: 'Airport',
    translation: 'Aeroporto',
    forbiddenWords: ['Plane', 'Fly', 'Terminal', 'Luggage'],
    options: [
      { text: 'A facility where passengers board aircraft on long paved runways after security inspection.', valid: true },
      { text: 'A station where people catch a plane to fly on holiday.', valid: false, reason: 'TABU! Usou as palavras "plane" e "fly".' },
      { text: 'A large building where travelers check in their luggage bags.', valid: false, reason: 'TABU! Usou a palavra "luggage".' },
    ],
  },
  {
    id: 'tb2',
    itemRef: 'Hospital',
    targetWord: 'Hospital',
    translation: 'Hospital',
    forbiddenWords: ['Doctor', 'Nurse', 'Sick', 'Medicine'],
    options: [
      { text: 'Where you go to see a doctor when you feel sick.', valid: false, reason: 'TABU! Usou as palavras "doctor" e "sick".' },
      { text: 'A healthcare institution providing specialized surgical care, intensive therapy and emergency treatments.', valid: true },
      { text: 'A facility where the nurse distributes medicine to patients in rooms.', valid: false, reason: 'TABU! Usou as palavras "nurse" e "medicine".' },
    ],
  },
  {
    id: 'tb3',
    itemRef: 'Restaurant',
    targetWord: 'Restaurant',
    translation: 'Restaurante',
    forbiddenWords: ['Food', 'Eat', 'Menu', 'Waiter'],
    options: [
      { text: 'A commercial establishment where customers order culinary meals prepared by culinary chefs.', valid: true },
      { text: 'A diner to eat delicious fast food with friends.', valid: false, reason: 'TABU! Usou as palavras "eat" e "food".' },
      { text: 'Where the waiter brings the printed menu to your table.', valid: false, reason: 'TABU! Usou as palavras "waiter" e "menu".' },
    ],
  },
  {
    id: 'tb4',
    itemRef: 'Library',
    targetWord: 'Library',
    translation: 'Biblioteca',
    forbiddenWords: ['Book', 'Read', 'Quiet', 'Study'],
    options: [
      { text: 'A public building where students study textbooks and read.', valid: false, reason: 'TABU! Usou as palavras "study" e "read".' },
      { text: 'A quiet room full of story books on wooden shelves.', valid: false, reason: 'TABU! Usou as palavras "quiet" e "book".' },
      { text: 'A municipal sanctuary where citizens borrow literature collections and archive records.', valid: true },
    ],
  },
  {
    id: 'tb5',
    itemRef: 'Bicycle',
    targetWord: 'Bicycle',
    translation: 'Bicicleta',
    forbiddenWords: ['Wheel', 'Ride', 'Pedal', 'Helmet'],
    options: [
      { text: 'A human-powered two-track vehicle steered with handlebars and propelled by leg gears.', valid: true },
      { text: 'A vehicle with two wheels that you ride on the street.', valid: false, reason: 'TABU! Usou as palavras "wheel" e "ride".' },
      { text: 'Where you push the pedal while wearing a protective helmet.', valid: false, reason: 'TABU! Usou as palavras "pedal" e "helmet".' },
    ],
  },
  {
    id: 'tb6',
    itemRef: 'Cinema',
    targetWord: 'Cinema',
    translation: 'Cinema',
    forbiddenWords: ['Movie', 'Film', 'Popcorn', 'Screen'],
    options: [
      { text: 'An entertainment venue featuring large projection audiovisual spectacles for seated audiences.', valid: true },
      { text: 'A dark theater where you eat popcorn while watching a movie.', valid: false, reason: 'TABU! Usou "popcorn" e "movie".' },
      { text: 'Where people watch a new Hollywood film on a giant screen.', valid: false, reason: 'TABU! Usou "film" e "screen".' },
    ],
  },
  {
    id: 'tb7',
    itemRef: 'Chocolate',
    targetWord: 'Chocolate',
    translation: 'Chocolate',
    forbiddenWords: ['Sweet', 'Candy', 'Dark', 'Cocoa'],
    options: [
      { text: 'A confection produced from roasted Theobroma seeds combined with milk fats and sugar cane.', valid: true },
      { text: 'A delicious sweet candy that kids love to munch on.', valid: false, reason: 'TABU! Usou "sweet" e "candy".' },
      { text: 'A treat made from pure cocoa beans available in dark blocks.', valid: false, reason: 'TABU! Usou "cocoa" e "dark".' },
    ],
  },
];

export default function TabooGame({ items: _itemsProp, ageProfile, onFinish, onExit }: TabooGameProps) {
  const cards = TABOO_DECK;
  const [indice, setIndice] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [tempo, setTempo] = useState(30);
  const [infracaoMsg, setInfracaoMsg] = useState<string | null>(null);
  const [finalizado, setFinalizado] = useState(false);
  
  // Power-ups
  const [bombasRestantes, setBombasRestantes] = useState(2);
  const [dicasRestantes, setDicasRestantes] = useState(2);
  const [palavrasTabuAtivas, setPalavrasTabuAtivas] = useState<string[]>([]);
  const [opcoesEliminadas, setOpcoesEliminadas] = useState<number[]>([]);

  // Modo Forja Livre
  const [modoCriador, setModoCriador] = useState(false);
  const [textoCriador, setTextoCriador] = useState('');
  const [radarInfracao, setRadarInfracao] = useState<string | null>(null);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioCardRef = useRef(Date.now());
  const cardRef = useRef<HTMLDivElement>(null);

  const cardAtual = cards[indice % cards.length];

  // Configura a nova carta
  useEffect(() => {
    inicioCardRef.current = Date.now();
    setTempo(ageProfile === 'senior' ? 40 : ageProfile === 'kids' ? 35 : 30);
    setInfracaoMsg(null);
    setPalavrasTabuAtivas([...cardAtual.forbiddenWords]);
    setOpcoesEliminadas([]);
    setTextoCriador('');
    setRadarInfracao(null);
  }, [indice, cardAtual, ageProfile]);

  // Cronômetro
  useEffect(() => {
    if (finalizado) return;
    const timer = setInterval(() => {
      setTempo((prev) => {
        if (prev <= 1) {
          tratarEscolha(false, 'Tempo esgotado!');
          return 30;
        }
        if (prev <= 4) play('tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [indice, finalizado]);

  // Detector de Tabu em Tempo Real no Modo Forja Livre
  useEffect(() => {
    if (!modoCriador || !textoCriador.trim()) {
      setRadarInfracao(null);
      return;
    }
    const textoUpper = textoCriador.toUpperCase();
    for (const tabu of palavrasTabuAtivas) {
      if (textoUpper.includes(tabu.toUpperCase())) {
        setRadarInfracao(`ALERTA: Você usou o termo tabu "${tabu}"! Remova-o antes de enviar.`);
        return;
      }
    }
    if (textoUpper.includes(cardAtual.targetWord.toUpperCase())) {
      setRadarInfracao(`ALERTA: Você usou a própria palavra alvo "${cardAtual.targetWord}"! Descreva-a sem nomeá-la.`);
      return;
    }
    setRadarInfracao(null);
  }, [textoCriador, palavrasTabuAtivas, modoCriador, cardAtual]);

  // Uso da Bomba de Tabu: destrói uma das palavras proibidas com explosão sensorial
  const usarBomba = () => {
    if (bombasRestantes <= 0 || palavrasTabuAtivas.length <= 1) return;
    play('combo');
    triggerShake(cardRef.current, 'medium');
    emitBurst(window.innerWidth / 2, window.innerHeight * 0.45, 'fumaca');
    setBombasRestantes((b) => b - 1);
    setPalavrasTabuAtivas((prev) => prev.slice(0, prev.length - 1));
  };

  // Uso do Congelamento de Tempo
  const usarTempoExtra = () => {
    play('click');
    play('select');
    setTempo((t) => t + 15);
  };

  // Uso da Dica Dourada: elimina uma opção incorreta
  const usarDicaDourada = () => {
    if (dicasRestantes <= 0) return;
    const idxIncorreto = cardAtual.options.findIndex((o, i) => !o.valid && !opcoesEliminadas.includes(i));
    if (idxIncorreto >= 0) {
      play('click');
      play('select');
      setDicasRestantes((d) => d - 1);
      setOpcoesEliminadas((prev) => [...prev, idxIncorreto]);
    }
  };

  const tratarEscolha = (valida: boolean, motivo?: string, event?: React.MouseEvent) => {
    const duracao = Date.now() - inicioCardRef.current;
    outcomesRef.current.push({
      itemRef: cardAtual.targetWord,
      correct: valida,
      attempts: 1,
      ms: duracao,
    });

    if (valida) {
      const novoCombo = combo + 1;
      setCombo(novoCombo);
      const mult = calculateMultiplier(novoCombo);
      const pts = (220 + (novoCombo * 40)) * mult;
      setPontos((p) => p + pts);

      const rect = event?.currentTarget.getBoundingClientRect();
      playJuicedHit(
        novoCombo,
        rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined,
        `LIMPO! ${mult}x`
      );

      avancarCard();
    } else {
      // ACIONOU TABU! BUZZER ARCADE E GLITCH
      setCombo(0);
      setInfracaoMsg(motivo || 'Acionou palavra tabu!');
      playJuicedError(cardRef.current, undefined, 'TABOO DETECTADO!');
      glitchDeTela();
    }
  };

  // Submissão da própria circunlocução no modo forja livre
  const handleSubmeterForjaLivre = (e: React.FormEvent) => {
    e.preventDefault();
    if (radarInfracao || textoCriador.trim().length < 20) {
      play('error');
      return;
    }

    play('fanfarra');
    comemorar('rodadaPerfeita');
    emitBurst(window.innerWidth / 2, window.innerHeight / 2, 'combo');

    const pts = 350 + (combo * 50);
    setPontos((p) => p + pts);

    outcomesRef.current.push({
      itemRef: `${cardAtual.targetWord} (Forja Livre)`,
      correct: true,
      attempts: 1,
      ms: Date.now() - inicioCardRef.current,
    });

    avancarCard();
  };

  const avancarCard = () => {
    if (indice + 1 >= 5) {
      // Finaliza a sessão após 5 cartas de tabu
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
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-md text-ink select-none overflow-y-auto">
      {/* Topo / Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/90 backdrop-blur-lg sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2.5 rounded-2xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Sair da Taboo Arena"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wide uppercase text-accent">
                Taboo Arena
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-ink font-bold border border-accent/20">
                🌐 Circunlocução C1
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">
              Descreva conceitos funcionais sem jamais acionar as palavras proibidas!
            </p>
          </div>
        </div>

        {/* Status de Pontos, Combo e Tempo */}
        <div className="flex items-center gap-3 sm:gap-4">
          {combo > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black text-xs shadow-lg animate-pulse">
              <Flame className="w-4 h-4 fill-current" />
              <span>{combo}x ARCADE STREAK</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-rose-500" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>

          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border transition-colors shadow-sm ${
            tempo <= 5 ? 'border-error bg-error/10 text-error animate-pulse' : 'border-border-subtle bg-surface'
          }`}>
            <Clock className={`w-4 h-4 ${tempo <= 5 ? 'animate-spin text-error' : 'text-ink-muted'}`} />
            <span className="font-mono font-black text-base">{tempo}s</span>
          </div>
        </div>
      </header>

      {/* Arena Central do Taboo */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
        <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center space-y-6" ref={cardRef}>
          
          {/* BARRA DE POWER-UPS & SELETOR DE MODO */}
          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border-subtle pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModoCriador(false)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !modoCriador ? 'bg-accent text-accent-contrast shadow-sm' : 'bg-surface hover:bg-surface-hover text-ink-muted'
                }`}
              >
                Modo Desafio de Paráfrases
              </button>
              <button
                onClick={() => setModoCriador(true)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  modoCriador ? 'bg-accent text-accent-contrast shadow-sm' : 'bg-surface hover:bg-surface-hover text-ink-muted'
                }`}
              >
                ✍️ Modo Forja Livre (+350 pts)
              </button>
            </div>

            {/* Power-ups de Festa */}
            <div className="flex items-center gap-2">
              <button
                onClick={usarBomba}
                disabled={bombasRestantes <= 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink disabled:opacity-40 cursor-pointer shadow-sm"
                title="Bomba de Tabu: destrói 1 palavra proibida"
              >
                <Bomb className="w-3.5 h-3.5 text-rose-500" />
                <span>Bomba ({bombasRestantes})</span>
              </button>

              <button
                onClick={usarTempoExtra}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink cursor-pointer shadow-sm"
                title="+15 segundos de tempo"
              >
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>+15s</span>
              </button>

              <button
                onClick={usarDicaDourada}
                disabled={dicasRestantes <= 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink disabled:opacity-40 cursor-pointer shadow-sm"
                title="Dica Dourada: elimina 1 opção falsa"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span>Dica ({dicasRestantes})</span>
              </button>
            </div>
          </div>

          {/* O CARTÃO DE TABOO */}
          <div className="w-full max-w-xl bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-8 shadow-card text-center space-y-4">
            {/* A PALAVRA ALVO */}
            <div>
              <p className="text-xs uppercase font-mono tracking-widest text-ink-muted font-bold mb-1">
                CONCEITO ALVO ({indice + 1} de 5)
              </p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl animate-bounce">🎯</span>
                <h2 className="font-display font-black text-4xl sm:text-5xl text-ink tracking-wide">
                  {cardAtual.targetWord}
                </h2>
              </div>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm font-bold text-ink-muted">({cardAtual.translation})</span>
                <button
                  onClick={() => speak(cardAtual.targetWord, { lang: 'en-US' })}
                  className="p-1 rounded-full hover:bg-surface-hover text-accent cursor-pointer"
                  title="Ouvir pronúncia"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* TABOO LIST: AS 4 PALAVRAS PROIBIDAS */}
            <div className="p-4 rounded-2xl bg-surface-hover border border-border-subtle text-ink">
              <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-bold uppercase tracking-widest text-error mb-3">
                <AlertTriangle className="w-4 h-4 text-error" />
                <span>PALAVRAS PROIBIDAS (TABOO)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {palavrasTabuAtivas.map((tabu, i) => (
                  <div
                    key={i}
                    className="py-2.5 px-3 rounded-xl bg-surface border border-border-subtle font-mono font-bold text-sm text-ink shadow-sm flex items-center justify-center gap-2 hover:scale-105 transition-transform"
                  >
                    <span className="text-xs text-error font-bold">🚫</span>
                    <span>{tabu}</span>
                  </div>
                ))}
              </div>
            </div>

            {infracaoMsg && (
              <div className="p-3 rounded-xl bg-error/15 border border-error/30 text-error text-xs font-bold animate-shake">
                {infracaoMsg}
              </div>
            )}
          </div>

          {/* ÁREA DE INTERAÇÃO DO JOGADOR */}
          {!modoCriador ? (
            /* MODO 1: ESCOLHA DE PARÁFRASE ARCADE */
            <div className="w-full max-w-2xl space-y-3">
              <p className="text-xs font-mono uppercase text-ink-muted font-bold text-center">
                Selecione a única circunlocução que descreve o conceito SEM acionar nenhuma palavra tabu:
              </p>

              <div className="space-y-2.5">
                {cardAtual.options.map((opcao, idx) => {
                  if (opcoesEliminadas.includes(idx)) return null;
                  return (
                    <button
                      key={idx}
                      onClick={(e) => tratarEscolha(opcao.valid, opcao.reason, e)}
                      className="w-full p-4 rounded-2xl border-2 border-border-subtle bg-surface-hover hover:border-accent hover:bg-accent-soft/20 transition-all shadow-md active:scale-98 text-left flex items-center justify-between group cursor-pointer"
                    >
                      <span className="text-sm sm:text-base font-semibold text-ink group-hover:text-accent transition-colors pr-4">
                        "{opcao.text}"
                      </span>
                      <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-accent shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* MODO 2: FORJA LIVRE COM TABOO RADAR */
            <div className="w-full max-w-2xl space-y-4">
              <div className="text-center space-y-1">
                <h4 className="font-display font-black text-lg text-ink">Forje Sua Própria Circunlocução</h4>
                <p className="text-xs text-ink-muted">
                  Escreva uma frase em inglês explicando <strong>{cardAtual.targetWord}</strong> sem usar nenhuma das palavras tabu!
                </p>
              </div>

              <form onSubmit={handleSubmeterForjaLivre} className="space-y-3">
                <textarea
                  value={textoCriador}
                  onChange={(e) => setTextoCriador(e.target.value)}
                  placeholder="Ex: An optical instrument worn on the face to protect vision from solar radiation..."
                  rows={3}
                  className="w-full p-4 rounded-2xl border-2 border-border-subtle bg-surface text-ink font-medium focus:border-accent focus:outline-none transition-all shadow-sm"
                />

                {radarInfracao && (
                  <div className="p-3 rounded-xl bg-error/15 border border-error/40 text-error text-xs font-bold animate-shake">
                    {radarInfracao}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted font-mono">
                    {textoCriador.trim().length} / 20 caracteres mínimos
                  </span>
                  <button
                    type="submit"
                    disabled={!!radarInfracao || textoCriador.trim().length < 20}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black flex items-center gap-2 hover:opacity-95 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Validar com a Banca de Tabu</span>
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
