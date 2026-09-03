import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Briefcase, Heart, Check, Sparkles, AlertCircle, ArrowRight, Lock, Unlock, Eye, EyeOff, ShieldAlert, Plane, Compass, Volume2, Lightbulb } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela, pulsoDeZoom } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { speak } from '../../lib/tts';
import { playJuicedHit, playJuicedError, playJuicedVictory, calculateMultiplier } from '../../lib/gameFeel';

/**
 * KOFFER GAME — "Ich packe meinen Koffer" (O Jogo da Mala Infinita).
 *
 * Inspirado na clássica dinâmica de salão alemã (Goethe-Institut DaF).
 *
 * Mecânicas Avançadas:
 * 1. Temas de Destino: Berlim, Férias de Verão ou Aventura na Neve.
 * 2. Mala Física Tátil: Abre com novos itens, fecha e tranca com zíper na fase de Recordação.
 * 3. Recuperação Ativa Real (Recall): O jogador reconstrói a sequência da mala sem olhar.
 * 4. Desafio do Caso Acusativo (Akkusativ):
 *    - Masculino: der -> EINEN
 *    - Feminino: die -> EINE
 *    - Neutro: das -> EIN
 * 5. Sistema de Vidas com Corações, Botão de Espiada de Emergência e Carimbos de Passaporte.
 */

interface KofferItem {
  id: string;
  name: string;
  translation: string;
  gender: 'masculine' | 'feminine' | 'neuter';
  correctArticle: string;
  distractors: string[];
  emoji: string;
  category?: string;
}

interface DestinationTheme {
  id: string;
  name: string;
  flag: string;
  description: string;
  items: KofferItem[];
}

interface KofferGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const DESTINATIONS: DestinationTheme[] = [
  {
    id: 'berlin',
    name: 'Viagem a Berlim',
    flag: '🇩🇪',
    description: 'Bagagem urbana clássica com documentos e tecnologia',
    items: [
      { id: 'b1', name: 'Koffer', translation: 'mala', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '🧳' },
      { id: 'b2', name: 'Brille', translation: 'óculos', gender: 'feminine', correctArticle: 'eine', distractors: ['einen', 'ein'], emoji: '👓' },
      { id: 'b3', name: 'Buch', translation: 'livro', gender: 'neuter', correctArticle: 'ein', distractors: ['einen', 'eine'], emoji: '📖' },
      { id: 'b4', name: 'Pass', translation: 'passaporte', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '🛂' },
      { id: 'b5', name: 'Kamera', translation: 'câmera', gender: 'feminine', correctArticle: 'eine', distractors: ['ein', 'einen'], emoji: '📷' },
      { id: 'b6', name: 'Handy', translation: 'celular', gender: 'neuter', correctArticle: 'ein', distractors: ['eine', 'einen'], emoji: '📱' },
      { id: 'b7', name: 'Regenschirm', translation: 'guarda-chuva', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '☂️' },
      { id: 'b8', name: 'Jacke', translation: 'jaqueta', gender: 'feminine', correctArticle: 'eine', distractors: ['einen', 'ein'], emoji: '🧥' },
      { id: 'b9', name: 'Ticket', translation: 'bilhete de trem', gender: 'neuter', correctArticle: 'ein', distractors: ['einen', 'eine'], emoji: '🎟️' },
    ],
  },
  {
    id: 'strand',
    name: 'Férias na Praia',
    flag: '🏖️',
    description: 'Itens ensolarados de verão e mergulho tropical',
    items: [
      { id: 's1', name: 'Sonnenhut', translation: 'chapéu de sol', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '👒' },
      { id: 's2', name: 'Sonnenbrille', translation: 'óculos de sol', gender: 'feminine', correctArticle: 'eine', distractors: ['einen', 'ein'], emoji: '🕶️' },
      { id: 's3', name: 'Handtuch', translation: 'toalha de praia', gender: 'neuter', correctArticle: 'ein', distractors: ['einen', 'eine'], emoji: '🏖️' },
      { id: 's4', name: 'Wasserball', translation: 'bola inflável', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '🏐' },
      { id: 's5', name: 'Sonnencreme', translation: 'protetor solar', gender: 'feminine', correctArticle: 'eine', distractors: ['ein', 'einen'], emoji: '🧴' },
      { id: 's6', name: 'Surfbrett', translation: 'prancha de surf', gender: 'neuter', correctArticle: 'ein', distractors: ['eine', 'einen'], emoji: '🏄' },
      { id: 's7', name: 'Rucksack', translation: 'mochila', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '🎒' },
    ],
  },
];

export default function KofferGame({ items: _itemsProp, ageProfile, onFinish, onExit }: KofferGameProps) {
  const [destinoIdx, setDestinoIdx] = useState(0);
  const destinoAtual = DESTINATIONS[destinoIdx];

  const poolItens = destinoAtual.items;

  const maxVidas = ageProfile === 'kids' ? 4 : 3;
  const [vidas, setVidas] = useState(maxVidas);
  const [pontos, setPontos] = useState(0);
  const [nivelAtual, setNivelAtual] = useState(1);
  const [etapa, setEtapa] = useState<'apresentar' | 'fechar_mala' | 'repetir' | 'artigo' | 'sucesso_nivel' | 'fim'>('apresentar');
  
  // Itens atualmente guardados na mala até o nível corrente
  const itensNaMala = useMemo(() => {
    return poolItens.slice(0, Math.min(nivelAtual, poolItens.length));
  }, [poolItens, nivelAtual]);

  const novoItem = itensNaMala[itensNaMala.length - 1];

  // Itens lembrados na rodada de repetição
  const [itensRelembrados, setItensRelembrados] = useState<string[]>([]);
  const [indiceRepeticao, setIndiceRepeticao] = useState(0);
  const [espiandoEmergencia, setEspiandoEmergencia] = useState(false);
  const [artigoErro, setArtigoErro] = useState<string | null>(null);

  // Dicas & Ajuda
  const [dicasRestantes, setDicasRestantes] = useState(3);
  const [dicaAberta, setDicaAberta] = useState(false);
  const [artigoEliminado, setArtigoEliminado] = useState<string | null>(null);
  const [itemDestacado, setItemDestacado] = useState<string | null>(null);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const malaRef = useRef<HTMLDivElement>(null);

  const usarDica = () => {
    if (dicasRestantes <= 0 || dicaAberta) return;
    play('click');
    setDicasRestantes((prev) => prev - 1);
    setDicaAberta(true);

    if (etapa === 'repetir') {
      const itemEsperado = itensNaMala[indiceRepeticao];
      if (itemEsperado) {
        setItemDestacado(itemEsperado.id);
        play('levelUp');
        setTimeout(() => setItemDestacado(null), 3500);
      }
    } else if (etapa === 'artigo' && novoItem) {
      const errados = ['einen', 'eine', 'ein'].filter((a) => a !== novoItem.correctArticle);
      if (errados.length > 0) {
        setArtigoEliminado(errados[0]);
        play('click');
      }
    }
  };

  // Início de cada nível
  useEffect(() => {
    inicioRodadaRef.current = Date.now();
    setItensRelembrados([]);
    setIndiceRepeticao(0);
    setEspiandoEmergencia(false);
    setArtigoErro(null);
    setDicaAberta(false);
    setArtigoEliminado(null);
    setItemDestacado(null);
    setEtapa('apresentar');
    play('add');

    const timer = setTimeout(() => {
      if (nivelAtual === 1) {
        // Nível 1: Primeiro item entra na mala, vai direto ao desafio de artigo
        setEtapa('artigo');
      } else {
        // Nível 2+: A mala FECHA com zíper e o jogador deve lembrar os itens anteriores da memória!
        setEtapa('fechar_mala');
        play('close');
        setTimeout(() => {
          setEtapa('repetir');
        }, 800);
      }
    }, 2200);

    return () => clearTimeout(timer);
  }, [nivelAtual, destinoIdx]);

  // Manipulador de clique no item durante o recall da memória
  const handleCliqueItemRecall = (item: KofferItem) => {
    if (etapa !== 'repetir') return;

    const itemEsperado = itensNaMala[indiceRepeticao];

    if (item.id === itemEsperado.id) {
      // ACERTOU O PASSO DA SEQUÊNCIA!
      const proximoIndice = indiceRepeticao + 1;
      setItensRelembrados((prev) => [...prev, item.id]);
      setIndiceRepeticao(proximoIndice);
      playJuicedHit(proximoIndice, undefined, `RECALL ${proximoIndice}/${itensNaMala.length - 1}`);

      // Se lembrou de todos os itens guardados antes do novo item
      if (proximoIndice >= itensNaMala.length - 1) {
        play('open');
        pulsoDeZoom();
        setTimeout(() => {
          setEtapa('artigo');
        }, 600);
      }
    } else {
      // ERROU A ORDEM DA MALA!
      playJuicedError(malaRef.current, undefined, 'ORDEM ERRADA!');
      setVidas((v) => {
        const resto = v - 1;
        if (resto <= 0) {
          concluirPartida(false);
        }
        return resto;
      });
    }
  };

  // Declinação do artigo no caso acusativo
  const handleEscolhaArtigo = (artigo: string, event: React.MouseEvent) => {
    if (etapa !== 'artigo' || !novoItem) return;

    const correto = artigo === novoItem.correctArticle;
    const duracao = Date.now() - inicioRodadaRef.current;

    outcomesRef.current.push({
      itemRef: novoItem.name,
      correct: correto,
      attempts: 1,
      ms: duracao,
    });

    if (correto) {
      const mult = calculateMultiplier(nivelAtual);
      const pts = (200 + (nivelAtual * 50)) * mult;
      setPontos((p) => p + pts);

      const rect = event.currentTarget.getBoundingClientRect();
      playJuicedHit(nivelAtual, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, `AKKUSATIV! ${mult}x`);

      // Toca a frase completa em alemão via TTS
      try {
        speak(`Ich packe in meinen Koffer ${artigo} ${novoItem.name}`, { lang: 'de-DE' });
      } catch {
        // Ignora
      }

      setEtapa('sucesso_nivel');

      setTimeout(() => {
        if (nivelAtual >= poolItens.length) {
          // Completou a mala inteira!
          concluirPartida(true);
        } else {
          setNivelAtual((n) => n + 1);
        }
      }, 1600);
    } else {
      setArtigoErro(`Atenção: "${novoItem.name}" é ${novoItem.gender.toUpperCase()}! No acusativo usa-se "${novoItem.correctArticle}".`);
      playJuicedError(malaRef.current, undefined, 'ARTIGO INCORRETO');
      setVidas((v) => {
        const resto = v - 1;
        if (resto <= 0) {
          concluirPartida(false);
        }
        return resto;
      });
    }
  };

  const concluirPartida = (venceu: boolean) => {
    setEtapa('fim');
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
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-md text-ink select-none overflow-y-auto">
      {/* Topo / Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/90 backdrop-blur-lg sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2.5 rounded-2xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Sair do Jogo da Mala"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wide uppercase text-accent">
                Ich packe meinen Koffer
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-ink font-bold border border-accent/20">
                {destinoAtual.flag} {destinoAtual.name}
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">
              Recuperação ativa da memória de trabalho & Caso Acusativo Alemão (einen / eine / ein)
            </p>
          </div>
        </div>

        {/* Status de Vidas & Pontos */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Botão de Dica */}
          <button
            onClick={usarDica}
            disabled={dicasRestantes <= 0 || dicaAberta}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            title="Dica de Memória ou Gramática"
          >
            <Lightbulb className="w-3.5 h-3.5 text-accent" />
            <span>Dica ({dicasRestantes})</span>
          </button>

          {/* Seletor de Destino Alternativo */}
          <button
            onClick={() => setDestinoIdx((prev) => (prev + 1) % DESTINATIONS.length)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold transition-all cursor-pointer"
            title="Trocar tema de destino"
          >
            <Compass className="w-3.5 h-3.5 text-accent" />
            <span>Mudar Destino</span>
          </button>

          {/* Vidas */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            {Array.from({ length: maxVidas }).map((_, i) => (
              <Heart
                key={i}
                className={`w-4 h-4 transition-all duration-300 ${
                  i < vidas ? 'text-rose-500 fill-rose-500 scale-100' : 'text-ink-muted/30 scale-75'
                }`}
              />
            ))}
          </div>

          {/* Pontos */}
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>
        </div>
      </header>

      {/* Arena da Mala */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
        <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center space-y-6" ref={malaRef}>
          
          {/* A MALA DE VIAGEM */}
          <div className="w-full max-w-2xl rounded-3xl border-2 border-border-subtle bg-surface-hover/70 p-6 sm:p-8 shadow-sm text-ink">
            {/* Cabeçalho da Mala */}
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle mb-4">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-accent" />
                <span className="font-mono font-bold text-xs uppercase tracking-widest text-ink">
                  Mala de Viagem · {itensNaMala.length} {itensNaMala.length === 1 ? 'Item' : 'Itens'} Guardados
                </span>
              </div>
              <div className="flex items-center gap-2">
                {etapa === 'fechar_mala' || etapa === 'repetir' ? (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-error/15 border border-error/30 text-error font-bold">
                    <Lock className="w-3.5 h-3.5" /> MALA FECHADA! RECORDE DA MEMÓRIA
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-good-soft border border-good/30 text-good-ink font-bold">
                    <Unlock className="w-3.5 h-3.5" /> MALA ABERTA
                  </span>
                )}
              </div>
            </div>

            {/* Conteúdo Interno da Mala */}
            {etapa === 'repetir' && !espiandoEmergencia ? (
              /* ESTADO FECHADO COM ZÍPER */
              <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
                <div className="p-4 rounded-full bg-surface border border-border-subtle shadow-sm animate-pulse">
                  <Lock className="w-10 h-10 text-accent" />
                </div>
                <div>
                  <h3 className="font-display font-black text-2xl text-ink">
                    O que já estava guardado na mala?
                  </h3>
                  <p className="text-xs text-ink-muted max-w-md mx-auto mt-1">
                    Toque nos itens abaixo rigorosamente na <strong>mesma ordem</strong> em que foram adicionados!
                  </p>
                </div>

                {/* Itens já lembrados no turno atual */}
                <div className="flex items-center gap-2 flex-wrap justify-center pt-2">
                  {itensRelembrados.map((id) => {
                    const item = poolItens.find((it) => it.id === id);
                    if (!item) return null;
                    return (
                      <span key={id} className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-good-soft border border-good/30 text-good-ink text-xs font-bold animate-scaleIn">
                        <Check className="w-3.5 h-3.5 text-good" />
                        <span>{item.emoji} {item.name}</span>
                      </span>
                    );
                  })}
                </div>

                {/* Botão de Espiada de Emergência */}
                <button
                  onClick={() => setEspiandoEmergencia(true)}
                  className="mt-2 text-xs flex items-center gap-1.5 text-accent hover:underline cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Espiar a mala por 1 segundo (-50 pts)</span>
                </button>
              </div>
            ) : (
              /* ESTADO ABERTO — VISUALIZAÇÃO DOS ITENS DENTRO DA MALA */
              <div className="py-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {itensNaMala.map((item, idx) => {
                    const eONovo = idx === itensNaMala.length - 1;
                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-2xl flex flex-col items-center justify-center text-center transition-all ${
                          eONovo
                            ? 'bg-surface border-2 border-accent shadow-md'
                            : 'bg-surface/80 border border-border-subtle'
                        }`}
                      >
                        <span className={`text-4xl sm:text-5xl mb-1 ${eONovo ? 'animate-bounce' : ''}`}>
                          {item.emoji}
                        </span>
                        <span className="font-bold text-sm text-ink">{item.name}</span>
                        <span className="text-[10px] text-ink-muted font-medium">({item.translation})</span>
                        {eONovo && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-accent text-accent-contrast mt-1">
                            Novo Item!
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ÁREA DE INTERAÇÃO DO JOGADOR CONFORME A ETAPA */}

          {/* ETAPA 1: REPETIÇÃO / RECALL ATIVO */}
          {etapa === 'repetir' && (
            <div className="w-full max-w-2xl space-y-3">
              <p className="text-xs font-mono uppercase text-ink-muted font-bold text-center">
                Passo {indiceRepeticao + 1} de {itensNaMala.length - 1}: Escolha o próximo item da sequência
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {poolItens.map((item) => {
                  const destacado = item.id === itemDestacado;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleCliqueItemRecall(item)}
                      className={`p-4 rounded-2xl border-2 transition-all shadow-md active:scale-95 flex flex-col items-center justify-center cursor-pointer group ${
                        destacado
                          ? 'border-accent ring-4 ring-accent/30 bg-accent-soft text-accent-ink animate-bounce'
                          : 'border-border-subtle bg-surface-hover hover:border-accent hover:bg-accent-soft/20'
                      }`}
                    >
                      <span className="text-3xl mb-1 group-hover:scale-110 transition-transform">{item.emoji}</span>
                      <span className="font-bold text-sm text-ink">{item.name}</span>
                      <span className="text-[10px] text-ink-muted">({item.translation})</span>
                      {destacado && (
                        <span className="text-[9px] font-black uppercase text-accent mt-1">É este! 💡</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ETAPA 2: DESAFIO DO ARTIGO ACUSATIVO */}
          {etapa === 'artigo' && novoItem && (
            <div className="w-full max-w-xl flex flex-col items-center text-center space-y-4 animate-fadeIn">
              <div className="space-y-1">
                <span className="text-xs font-mono uppercase tracking-widest text-blue-500 font-bold">
                  Gramática Alemã · Caso Acusativo
                </span>
                <h3 className="font-display font-black text-2xl sm:text-3xl text-ink">
                  Ich packe in meinen Koffer...
                </h3>
                <p className="text-sm text-ink-muted">
                  Qual o artigo correto no Acusativo para <strong>"{novoItem.name}"</strong>?
                </p>
                <div className="inline-block px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-600 mt-1">
                  Gênero Gramatical: {novoItem.gender === 'masculine' ? 'MASCULINO (der)' : novoItem.gender === 'feminine' ? 'FEMININO (die)' : 'NEUTRO (das)'}
                </div>
              </div>

              {artigoErro && (
                <div className="w-full px-4 py-2.5 rounded-xl bg-error/10 border border-error/30 text-error text-xs font-bold animate-shake">
                  {artigoErro}
                </div>
              )}

              {/* Botões dos Artigos */}
              <div className="w-full grid grid-cols-3 gap-3">
                {['einen', 'eine', 'ein'].map((art) => {
                  const eliminado = artigoEliminado === art;
                  if (eliminado) {
                    return (
                      <div
                        key={art}
                        className="py-4 px-3 rounded-2xl border-2 border-border-subtle bg-surface-hover/30 opacity-40 text-center flex flex-col items-center justify-center cursor-not-allowed"
                      >
                        <span className="line-through font-display font-black text-xl text-ink-muted">{art}</span>
                        <span className="text-[10px] text-error font-mono mt-1">Eliminado ❌</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={art}
                      onClick={(e) => handleEscolhaArtigo(art, e)}
                      className="py-4 px-3 rounded-2xl border-2 border-border-subtle bg-surface hover:border-blue-500 hover:bg-blue-500/10 transition-all shadow-md active:scale-95 font-display font-black text-xl text-ink cursor-pointer"
                    >
                      <span>{art}</span>
                      <span className="block text-[11px] font-sans text-ink-muted font-medium mt-1">
                        {art} {novoItem.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Pílula Didática */}
              <p className="text-xs text-ink-muted/80 max-w-md">
                💡 <em>Dica de Ouro:</em> No acusativo alemão, apenas o masculino muda (<strong>der → einen</strong>). O feminino (<strong>eine</strong>) e o neutro (<strong>ein</strong>) permanecem iguais!
              </p>
            </div>
          )}

          {/* ETAPA 3: SUCESSO DE NÍVEL */}
          {etapa === 'sucesso_nivel' && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-2 animate-scaleIn">
              <div className="p-3.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="font-display font-black text-2xl text-ink">Item Guardado com Sucesso!</h4>
              <p className="text-sm font-bold text-accent">Preparando o próximo item da mala...</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
