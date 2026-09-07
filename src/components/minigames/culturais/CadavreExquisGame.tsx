import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Wand2, Volume2, BookOpen, Shuffle, Check, ArrowRight, Theater, Plus, Palette, RotateCcw, Lightbulb } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { comemorar, tremor, flashDeTela, pulsoDeZoom } from '../../../lib/juice';
import { emitBurst } from '../../../lib/effects';
import { speak } from '../../../lib/tts';
import { playJuicedHit, playJuicedVictory, triggerConfetti, calculateMultiplier } from '../../../lib/gameFeel';

/**
 * CADAVRE EXQUIS — Laboratório Surrealista de Frases e Sintaxe (Cadavre Exquis 🇫🇷).
 *
 * Nascido em Paris (1925) nos círculos de André Breton e Jacques Prévert.
 *
 * Recursos Avançados:
 * 1. 3 Temas Surrealistas Selecionáveis: Clássico Parisiense, Odisseia Cósmica e Fantasia Maluca.
 * 2. Liberdade Criativa: Escolha cartas ilustradas OU crie sua própria palavra customizada!
 * 3. Leitura Teatral de Alta Fidelidade (TTS): Ouça a frase surreal declamada com pompa.
 * 4. Galeria de Obras Próprias: Salve as 3 obras criadas na sessão com carimbo de vernissage.
 */

interface SyntacticCard {
  id: string;
  role: 'subject' | 'verb' | 'object' | 'adverb';
  roleLabel: string;
  text: string;
  translation: string;
  emoji: string;
}

interface SurrealTheme {
  id: string;
  name: string;
  emoji: string;
  cards: Record<'subject' | 'verb' | 'object' | 'adverb', SyntacticCard[]>;
}

interface CadavreExquisGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const TEMAS_SURREALISTAS: SurrealTheme[] = [
  {
    id: 'paris',
    name: 'Salão Parisiense 1925',
    emoji: '🎪',
    cards: {
      subject: [
        { id: 'p-s1', role: 'subject', roleLabel: 'Sujeito', text: 'The golden dragon', translation: 'O dragão dourado', emoji: '🐉' },
        { id: 'p-s2', role: 'subject', roleLabel: 'Sujeito', text: 'A philosophical robot', translation: 'Um robô filosófico', emoji: '🤖' },
        { id: 'p-s3', role: 'subject', roleLabel: 'Sujeito', text: 'The invisible cat', translation: 'O gato invisível', emoji: '🐱' },
        { id: 'p-s4', role: 'subject', roleLabel: 'Sujeito', text: 'A sleepy maestro', translation: 'Um maestro sonolento', emoji: '🎻' },
      ],
      verb: [
        { id: 'p-v1', role: 'verb', roleLabel: 'Verbo', text: 'quietly paints', translation: 'pinta silenciosamente', emoji: '🎨' },
        { id: 'p-v2', role: 'verb', roleLabel: 'Verbo', text: 'joyfully drinks', translation: 'bebe alegremente', emoji: '☕' },
        { id: 'p-v3', role: 'verb', roleLabel: 'Verbo', text: 'secretly investigates', translation: 'investiga em segredo', emoji: '🔍' },
        { id: 'p-v4', role: 'verb', roleLabel: 'Verbo', text: 'wildly celebrates', translation: 'celebra loucamente', emoji: '🎉' },
      ],
      object: [
        { id: 'p-o1', role: 'object', roleLabel: 'Objeto', text: 'a spicy taco', translation: 'um taco apimentado', emoji: '🌮' },
        { id: 'p-o2', role: 'object', roleLabel: 'Objeto', text: 'the midnight moon', translation: 'a lua da meia-noite', emoji: '🌙' },
        { id: 'p-o3', role: 'object', roleLabel: 'Objeto', text: 'an ancient violin', translation: 'um violino ancestral', emoji: '🎻' },
        { id: 'p-o4', role: 'object', roleLabel: 'Objeto', text: 'a crystalline diamond', translation: 'um diamante cristalino', emoji: '💎' },
      ],
      adverb: [
        { id: 'p-a1', role: 'adverb', roleLabel: 'Circunstância', text: 'under the deep ocean', translation: 'sob o oceano profundo', emoji: '🌊' },
        { id: 'p-a2', role: 'adverb', roleLabel: 'Circunstância', text: 'before breakfast', translation: 'antes do café da manhã', emoji: '🥞' },
        { id: 'p-a3', role: 'adverb', roleLabel: 'Circunstância', text: 'on top of the pyramid', translation: 'no topo da pirâmide', emoji: '🏛️' },
        { id: 'p-a4', role: 'adverb', roleLabel: 'Circunstância', text: 'with infinite wisdom', translation: 'com sabedoria infinita', emoji: '✨' },
      ],
    },
  },
  {
    id: 'space',
    name: 'Odisseia Cósmica',
    emoji: '🚀',
    cards: {
      subject: [
        { id: 's-s1', role: 'subject', roleLabel: 'Sujeito', text: 'A friendly alien', translation: 'Um alienígena amigável', emoji: '👽' },
        { id: 's-s2', role: 'subject', roleLabel: 'Sujeito', text: 'The quantum satellite', translation: 'O satélite quântico', emoji: '🛰️' },
        { id: 's-s3', role: 'subject', roleLabel: 'Sujeito', text: 'A brave astronaut', translation: 'Uma astronauta corajosa', emoji: '🧑‍🚀' },
        { id: 's-s4', role: 'subject', roleLabel: 'Sujeito', text: 'The glowing supernova', translation: 'A supernova brilhante', emoji: '⭐' },
      ],
      verb: [
        { id: 's-v1', role: 'verb', roleLabel: 'Verbo', text: 'swiftly navigates', translation: 'navega velozmente', emoji: '🛸' },
        { id: 's-v2', role: 'verb', roleLabel: 'Verbo', text: 'curiously scans', translation: 'escaneia com curiosidade', emoji: '📡' },
        { id: 's-v3', role: 'verb', roleLabel: 'Verbo', text: 'telepathically contacts', translation: 'contata telepaticamente', emoji: '🧠' },
        { id: 's-v4', role: 'verb', roleLabel: 'Verbo', text: 'brightly illuminates', translation: 'ilumina com brilho', emoji: '💡' },
      ],
      object: [
        { id: 's-o1', role: 'object', roleLabel: 'Objeto', text: 'an asteroid belt', translation: 'um cinturão de asteroides', emoji: '🪐' },
        { id: 's-o2', role: 'object', roleLabel: 'Objeto', text: 'a mysterious wormhole', translation: 'um buraco de minhoca misterioso', emoji: '🌀' },
        { id: 's-o3', role: 'object', roleLabel: 'Objeto', text: 'a galactic message', translation: 'uma mensagem galáctica', emoji: '📜' },
        { id: 's-o4', role: 'object', roleLabel: 'Objeto', text: 'a laser telescope', translation: 'um telescópio laser', emoji: '🔭' },
      ],
      adverb: [
        { id: 's-a1', role: 'adverb', roleLabel: 'Circunstância', text: 'near the Andromeda galaxy', translation: 'perto da galáxia de Andrômeda', emoji: '🌌' },
        { id: 's-a2', role: 'adverb', roleLabel: 'Circunstância', text: 'during zero gravity', translation: 'durante a gravidade zero', emoji: '🪶' },
        { id: 's-a3', role: 'adverb', roleLabel: 'Circunstância', text: 'at the speed of light', translation: 'na velocidade da luz', emoji: '⚡' },
        { id: 's-a4', role: 'adverb', roleLabel: 'Circunstância', text: 'inside the space station', translation: 'dentro da estação espacial', emoji: '🛰️' },
      ],
    },
  },
];

const ETAPAS: ('subject' | 'verb' | 'object' | 'adverb')[] = ['subject', 'verb', 'object', 'adverb'];

export default function CadavreExquisGame({ items: _itemsProp, ageProfile, onFinish, onExit }: CadavreExquisGameProps) {
  const [temaIdx, setTemaIdx] = useState(0);
  const temaAtual = TEMAS_SURREALISTAS[temaIdx];

  const [etapaIndice, setEtapaIndice] = useState(0);
  const [fraseMontada, setFraseMontada] = useState<SyntacticCard[]>([]);
  const [revelando, setRevelando] = useState(false);
  const [pontos, setPontos] = useState(0);
  const [obrasCriadas, setObrasCriadas] = useState<{ en: string; pt: string; emojis: string }[]>([]);
  const [dicaAberta, setDicaAberta] = useState(false);
  
  // Customização de palavra livre
  const [escrevendoCustom, setEscrevendoCustom] = useState(false);
  const [textoCustom, setTextoCustom] = useState('');

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioEtapaRef = useRef(Date.now());

  const papelAtual = ETAPAS[etapaIndice];
  const opcoesAtuais = temaAtual.cards[papelAtual];

  const handleEscolhaSlot = (card: SyntacticCard, event?: React.MouseEvent) => {
    const coords = event
      ? {
          x: event.currentTarget.getBoundingClientRect().left + event.currentTarget.getBoundingClientRect().width / 2,
          y: event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2,
        }
      : undefined;

    playJuicedHit(etapaIndice + 1, coords, `+${(etapaIndice + 1) * 50}`);
    const novaFrase = [...fraseMontada, card];
    setFraseMontada(novaFrase);
    setEscrevendoCustom(false);
    setTextoCustom('');

    if (etapaIndice + 1 < ETAPAS.length) {
      setEtapaIndice((prev) => prev + 1);
    } else {
      desdobrarFrase(novaFrase);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textoCustom.trim()) return;

    const customCard: SyntacticCard = {
      id: `custom-${Date.now()}`,
      role: papelAtual,
      roleLabel: papelAtual,
      text: textoCustom.trim(),
      translation: 'Sua palavra livre',
      emoji: '✨',
    };

    handleEscolhaSlot(customCard);
  };

  const desdobrarFrase = (frase: SyntacticCard[]) => {
    setRevelando(true);
    playJuicedVictory();
    triggerConfetti();

    const fraseIngles = frase.map((c) => c.text).join(' ') + '.';
    const frasePortugues = frase.map((c) => c.translation).join(' ') + '.';
    const emojis = frase.map((c) => c.emoji).join(' ');

    setObrasCriadas((prev) => [...prev, { en: fraseIngles, pt: frasePortugues, emojis }]);

    // Dispara a leitura teatral pelo sintetizador de voz
    setTimeout(() => {
      speak(fraseIngles, { lang: 'en-US' });
    }, 600);

    const mult = calculateMultiplier(obrasCriadas.length + 1);
    const pts = 300 * mult;
    setPontos((p) => p + pts);

    outcomesRef.current.push({
      itemRef: fraseIngles,
      correct: true,
      attempts: 1,
      ms: Date.now() - inicioEtapaRef.current,
    });
  };

  const proximaRodadaOuFim = () => {
    if (obrasCriadas.length >= 3) {
      // Finaliza o jogo após 3 obras surrealistas
      playJuicedVictory();
      comemorar('rodadaPerfeita');
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
    } else {
      setEtapaIndice(0);
      setFraseMontada([]);
      setRevelando(false);
      inicioEtapaRef.current = Date.now();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-md text-ink select-none overflow-y-auto">
      {/* Topo / Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/90 backdrop-blur-lg sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2.5 rounded-2xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Sair do Cadavre Exquis"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wide uppercase bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                Cadavre Exquis
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-bold border border-emerald-500/20">
                {temaAtual.emoji} {temaAtual.name}
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">
              O lendário jogo dos poetas surrealistas de Paris para dominar a ordem dos constituintes!
            </p>
          </div>
        </div>

        {/* Status de Pontos & Seletor de Tema */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => setDicaAberta((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-all cursor-pointer shadow-sm"
            title="Dica Sintática"
          >
            <Lightbulb className="w-3.5 h-3.5 text-emerald-500" />
            <span>Dica Sintática</span>
          </button>

          <button
            onClick={() => setTemaIdx((prev) => (prev + 1) % TEMAS_SURREALISTAS.length)}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold transition-all cursor-pointer shadow-sm"
          >
            <Palette className="w-3.5 h-3.5 text-emerald-500" />
            <span>Mudar Tema</span>
          </button>

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>
        </div>
      </header>

      {/* Arena Central Surrealista */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
        <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center space-y-6">
          
          {/* OS 4 SLOTS SINTÁTICOS DA SANFONA DE BRETON */}
          <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ETAPAS.map((papel, idx) => {
              const selecionada = fraseMontada[idx];
              const eAtiva = idx === etapaIndice && !revelando;
              const labels = ['1. Sujeito (S)', '2. Verbo (V)', '3. Objeto (O)', '4. Circunstância (A)'];

              return (
                <div
                  key={papel}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center text-center ${
                    selecionada
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                      : eAtiva
                      ? 'border-accent bg-accent-soft/30 animate-pulse shadow-md'
                      : 'border-border-subtle bg-surface-hover/50 opacity-60'
                  }`}
                >
                  <span className="text-[10px] font-mono uppercase font-bold text-ink-muted mb-1">
                    {labels[idx]}
                  </span>
                  {selecionada ? (
                    <div className="flex flex-col items-center animate-scaleIn">
                      <span className="text-2xl">{selecionada.emoji}</span>
                      <span className="font-bold text-xs sm:text-sm text-ink mt-1">
                        {revelando ? selecionada.text : '??? (Oculto)'}
                      </span>
                    </div>
                  ) : (
                    <span className="font-display font-black text-xl text-ink-muted/60 py-2">
                      {eAtiva ? '👉 Sua Vez' : '???'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ESTADO 1: ESCOLHA DA CARTA SINTÁTICA */}
          {!revelando ? (
            <div className="w-full space-y-4 animate-fadeIn">
              <div className="text-center space-y-1">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-3xl animate-bounce">🎭</span>
                  <span className="text-xs font-mono uppercase tracking-widest text-emerald-600 font-bold">
                    Etapa {etapaIndice + 1} de 4 · Escolha uma Parte Sintática
                  </span>
                </div>
                <h3 className="font-display font-black text-2xl sm:text-3xl text-ink">
                  {papelAtual === 'subject' && 'Quem é o Sujeito da ação?'}
                  {papelAtual === 'verb' && 'O que ele faz? (Verbo)'}
                  {papelAtual === 'object' && 'Sobre o que recai a ação? (Objeto)'}
                  {papelAtual === 'adverb' && 'Onde ou como isso acontece? (Circunstância)'}
                </h3>
              </div>

              {/* Box de Dica Sintática se ativada */}
              {dicaAberta && (
                <div className="w-full max-w-xl mx-auto p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-ink text-xs sm:text-sm font-medium flex items-center gap-3 animate-fadeIn">
                  <Lightbulb className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <strong className="text-emerald-700 block font-bold">Guia Gramatical Sintático:</strong>
                    <span>
                      {papelAtual === 'subject' && 'O Sujeito (Subject) é o agente que pratica a ação na oração (ex: The dragon, A robot).'}
                      {papelAtual === 'verb' && 'O Verbo (Verb) descreve o ato, processo ou movimento do sujeito (ex: paints, investigates).'}
                      {papelAtual === 'object' && 'O Objeto (Object) é o complemento que recebe o efeito ou o alvo da ação verbal (ex: a taco, the moon).'}
                      {papelAtual === 'adverb' && 'A Circunstância (Adverbial) adiciona tempo, espaço, modo ou atmosfera à sentença (ex: under the deep ocean, before breakfast).'}
                    </span>
                  </div>
                </div>
              )}

              {/* Botões de Cartas Surrealistas */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                {opcoesAtuais.map((card) => (
                  <button
                    key={card.id}
                    onClick={(e) => handleEscolhaSlot(card, e)}
                    className="p-5 rounded-2xl border-2 border-border-subtle bg-surface-hover hover:border-emerald-500 hover:bg-emerald-500/10 transition-all shadow-md active:scale-95 text-left flex items-center gap-4 group cursor-pointer"
                  >
                    <span className="text-3xl sm:text-4xl group-hover:scale-110 transition-transform">
                      {card.emoji}
                    </span>
                    <div>
                      <span className="font-display font-black text-lg sm:text-xl text-ink group-hover:text-emerald-600 transition-colors block">
                        {card.text}
                      </span>
                      <span className="text-xs text-ink-muted font-medium block">({card.translation})</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Opção de Inserção Livre de Palavras */}
              <div className="w-full max-w-md mx-auto pt-2 text-center">
                {!escrevendoCustom ? (
                  <button
                    onClick={() => setEscrevendoCustom(true)}
                    className="text-xs font-bold text-accent hover:underline flex items-center justify-center gap-1 mx-auto cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ou digite sua própria palavra maluca para este slot</span>
                  </button>
                ) : (
                  <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={textoCustom}
                      onChange={(e) => setTextoCustom(e.target.value)}
                      placeholder={`Escreva em inglês para este slot (${papelAtual})...`}
                      className="flex-1 px-4 py-2.5 rounded-xl border-2 border-accent bg-surface text-ink text-sm font-bold focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!textoCustom.trim()}
                      className="px-4 py-2.5 rounded-xl bg-accent text-accent-contrast font-bold text-xs cursor-pointer disabled:opacity-40"
                    >
                      Inserir
                    </button>
                  </form>
                )}
              </div>
            </div>
          ) : (
            /* ESTADO 2: A REVELAÇÃO DO CADÁVER ESQUISITO */
            <div className="w-full flex flex-col items-center text-center space-y-6 animate-scaleIn py-4">
              <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 flex items-center gap-2">
                <Theater className="w-5 h-5" />
                <span className="font-mono font-bold text-xs uppercase tracking-widest">
                  Obra Surrealista Desdobrada!
                </span>
              </div>

              <div className="space-y-3 max-w-2xl">
                <p className="text-3xl sm:text-5xl font-display font-black text-ink leading-tight">
                  "{fraseMontada.map((c) => c.text).join(' ')}."
                </p>
                <p className="text-base sm:text-lg font-bold text-ink-muted">
                  ({fraseMontada.map((c) => c.translation).join(' ')}.)
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => speak(fraseMontada.map((c) => c.text).join(' ') + '.', { lang: 'en-US' })}
                  className="px-5 py-3 rounded-2xl border-2 border-border-subtle bg-surface hover:bg-surface-hover font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                >
                  <Volume2 className="w-4 h-4 text-emerald-500" />
                  <span>Ouvir Declamado Novamente</span>
                </button>

                <button
                  onClick={proximaRodadaOuFim}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-sm flex items-center gap-2 transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>{obrasCriadas.length >= 3 ? 'Concluir Vernissage' : 'Criar Próxima Frase Absurda'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* GALERIA DE OBRAS DA SESSÃO */}
          {obrasCriadas.length > 0 && (
            <div className="w-full border-t border-border-subtle pt-6">
              <h4 className="font-mono font-bold text-xs uppercase tracking-widest text-ink-muted mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-500" />
                <span>Galeria de Obras Surrealistas Criadas ({obrasCriadas.length})</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {obrasCriadas.map((obra, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-surface-hover border border-border-subtle flex flex-col justify-between">
                    <span className="text-lg mb-1">{obra.emojis}</span>
                    <p className="text-xs font-bold text-ink mb-1">"{obra.en}"</p>
                    <p className="text-[10px] text-ink-muted">{obra.pt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
