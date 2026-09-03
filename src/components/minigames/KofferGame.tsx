import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Briefcase, Heart, Check, Sparkles, AlertCircle, ArrowRight, Lock, Unlock, Eye, EyeOff, ShieldAlert, Plane, Compass, Volume2 } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela, pulsoDeZoom } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { speak } from '../../lib/tts';

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

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const malaRef = useRef<HTMLDivElement>(null);

  // Início de cada nível
  useEffect(() => {
    inicioRodadaRef.current = Date.now();
    setItensRelembrados([]);
    setIndiceRepeticao(0);
    setEspiandoEmergencia(false);
    setArtigoErro(null);
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
      play('click');
      play('add');
      const proximoIndice = indiceRepeticao + 1;
      setItensRelembrados((prev) => [...prev, item.id]);
      setIndiceRepeticao(proximoIndice);

      // Se lembrou de todos os itens guardados antes do novo item
      if (proximoIndice >= itensNaMala.length - 1) {
        play('open');
        play('select');
        pulsoDeZoom();
        setTimeout(() => {
          setEtapa('artigo');
        }, 600);
      }
    } else {
      // ERROU A ORDEM DA MALA!
      play('error');
      if (malaRef.current) tremor(malaRef.current);
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
      play('success');
      play('combo');
      const pts = 200 + (nivelAtual * 50);
      setPontos((p) => p + pts);

      const rect = event.currentTarget.getBoundingClientRect();
      emitBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'combo');

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
      play('error');
      setArtigoErro(`Atenção: "${novoItem.name}" é ${novoItem.gender.toUpperCase()}! No acusativo usa-se "${novoItem.correctArticle}".`);
      if (malaRef.current) tremor(malaRef.current);
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
              <span className="font-display font-black text-xl tracking-wide uppercase bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">
                Ich packe meinen Koffer
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 font-bold border border-blue-500/20">
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
          
          {/* A MALA FÍSICA ESTILIZADA */}
          <div className="w-full max-w-3xl relative rounded-3xl border-4 border-amber-900/60 bg-gradient-to-b from-amber-950/80 to-amber-900/90 p-6 sm:p-8 shadow-2xl text-amber-50">
            {/* Alça e Cantoneiras Metálicas da Mala */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-28 h-5 rounded-t-xl bg-amber-700 border-2 border-amber-500 shadow-md" />
            <div className="absolute top-2 left-2 w-5 h-5 rounded-tl-lg border-t-2 border-l-2 border-amber-400" />
            <div className="absolute top-2 right-2 w-5 h-5 rounded-tr-lg border-t-2 border-r-2 border-amber-400" />
            <div className="absolute bottom-2 left-2 w-5 h-5 rounded-bl-lg border-b-2 border-l-2 border-amber-400" />
            <div className="absolute bottom-2 right-2 w-5 h-5 rounded-br-lg border-b-2 border-r-2 border-amber-400" />

            {/* Cabeçalho da Mala */}
            <div className="flex items-center justify-between pb-4 border-b border-amber-700/60 mb-4">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-amber-400" />
                <span className="font-mono font-bold text-xs uppercase tracking-widest text-amber-200">
                  Mala de Viagem · {itensNaMala.length} {itensNaMala.length === 1 ? 'Item' : 'Itens'} Guardados
                </span>
              </div>
              <div className="flex items-center gap-2">
                {etapa === 'fechar_mala' || etapa === 'repetir' ? (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-950 border border-rose-600 text-rose-300 font-bold">
                    <Lock className="w-3.5 h-3.5" /> MALA FECHADA! RECORDE DA MEMÓRIA
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-600 text-emerald-300 font-bold">
                    <Unlock className="w-3.5 h-3.5" /> MALA ABERTA
                  </span>
                )}
              </div>
            </div>

            {/* Conteúdo Interno da Mala */}
            {etapa === 'repetir' && !espiandoEmergencia ? (
              /* ESTADO FECHADO COM ZÍPER */
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-full bg-amber-900/70 border-2 border-amber-600 shadow-inner animate-pulse">
                  <Lock className="w-12 h-12 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-display font-black text-2xl text-amber-100">
                    O que já estava guardado na mala?
                  </h3>
                  <p className="text-xs text-amber-300/80 max-w-md mx-auto mt-1">
                    Toque nos itens abaixo rigorosamente na <strong>mesma ordem</strong> em que foram adicionados!
                  </p>
                </div>

                {/* Itens já lembrados no turno atual */}
                <div className="flex items-center gap-2 flex-wrap justify-center pt-2">
                  {itensRelembrados.map((id) => {
                    const item = poolItens.find((it) => it.id === id);
                    if (!item) return null;
                    return (
                      <span key={id} className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-900/80 border border-emerald-500 text-emerald-200 text-xs font-bold animate-scaleIn">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{item.emoji} {item.name}</span>
                      </span>
                    );
                  })}
                </div>

                {/* Botão de Espiada de Emergência */}
                <button
                  onClick={() => setEspiandoEmergencia(true)}
                  className="mt-2 text-xs flex items-center gap-1.5 text-amber-400/70 hover:text-amber-300 transition-colors underline cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Espiar a mala por 1 segundo (-50 pts)</span>
                </button>
              </div>
            ) : (
              /* ESTADO ABERTO — VISUALIZAÇÃO DOS ITENS DENTRO DA MALA */
              <div className="py-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {itensNaMala.map((item, idx) => {
                    const eONovo = idx === itensNaMala.length - 1;
                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-2xl flex flex-col items-center justify-center text-center transition-all ${
                          eONovo
                            ? 'bg-amber-600/50 border-2 border-amber-400 shadow-lg animate-bounce'
                            : 'bg-amber-900/40 border border-amber-700/50'
                        }`}
                      >
                        <span className="text-3xl sm:text-4xl mb-1">{item.emoji}</span>
                        <span className="font-bold text-sm text-amber-100">{item.name}</span>
                        <span className="text-[10px] text-amber-300/80 font-medium">({item.translation})</span>
                        {eONovo && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 mt-1">
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
                {poolItens.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleCliqueItemRecall(item)}
                    className="p-4 rounded-2xl border-2 border-border-subtle bg-surface-hover hover:border-accent hover:bg-accent-soft/20 transition-all shadow-md active:scale-95 flex flex-col items-center justify-center cursor-pointer group"
                  >
                    <span className="text-3xl mb-1 group-hover:scale-110 transition-transform">{item.emoji}</span>
                    <span className="font-bold text-sm text-ink">{item.name}</span>
                    <span className="text-[10px] text-ink-muted">({item.translation})</span>
                  </button>
                ))}
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
                {['einen', 'eine', 'ein'].map((art) => (
                  <button
                    key={art}
                    onClick={(e) => handleEscolhaArtigo(art, e)}
                    className="py-4 px-3 rounded-2xl border-2 border-border-subtle bg-surface-hover hover:border-blue-500 hover:bg-blue-500/10 transition-all shadow-md active:scale-95 font-display font-black text-xl text-ink cursor-pointer"
                  >
                    <span>{art}</span>
                    <span className="block text-[11px] font-sans text-ink-muted font-medium mt-1">
                      {art} {novoItem.name}
                    </span>
                  </button>
                ))}
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
