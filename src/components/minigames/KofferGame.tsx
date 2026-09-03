import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Briefcase, Heart, Check, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';

/**
 * KOFFER GAME — "Ich packe meinen Koffer" (O Jogo da Mala Infinita).
 *
 * Inspirado na clássica dinâmica alemã de memorização cumulativa e declinação
 * de artigos e casos gramaticais (Acusativo). A cada nível, um novo item é colocado
 * na mala. O jogador precisa repetir os itens anteriores em ordem e acertar o artigo
 * gramatical correto do novo item adicionado.
 */

interface KofferItem {
  id: string;
  name: string;
  translation: string;
  gender: 'masculine' | 'feminine' | 'neuter';
  correctArticle: string;
  distractors: string[];
  emoji: string;
}

interface KofferGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const ITENS_MALA_PADRAO: KofferItem[] = [
  { id: 'k1', name: 'Koffer', translation: 'mala', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '🧳' },
  { id: 'k2', name: 'Brille', translation: 'óculos', gender: 'feminine', correctArticle: 'eine', distractors: ['einen', 'ein'], emoji: '👓' },
  { id: 'k3', name: 'Buch', translation: 'livro', gender: 'neuter', correctArticle: 'ein', distractors: ['einen', 'eine'], emoji: '📖' },
  { id: 'k4', name: 'Pass', translation: 'passaporte', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '🛂' },
  { id: 'k5', name: 'Kamera', translation: 'câmera', gender: 'feminine', correctArticle: 'eine', distractors: ['ein', 'einen'], emoji: '📷' },
  { id: 'k6', name: 'Handy', translation: 'celular', gender: 'neuter', correctArticle: 'ein', distractors: ['eine', 'einen'], emoji: '📱' },
  { id: 'k7', name: 'Schirm', translation: 'guarda-chuva', gender: 'masculine', correctArticle: 'einen', distractors: ['ein', 'eine'], emoji: '☂️' },
  { id: 'k8', name: 'Mütze', translation: 'gorro', gender: 'feminine', correctArticle: 'eine', distractors: ['einen', 'ein'], emoji: '🧢' },
];

export default function KofferGame({ items: itemsProp, ageProfile, onFinish, onExit }: KofferGameProps) {
  // Pool de itens da mala
  const poolItens = useMemo<KofferItem[]>(() => {
    if (itemsProp && itemsProp.length >= 4) {
      return itemsProp.map((it, idx) => {
        const masc = idx % 3 === 0;
        const fem = idx % 3 === 1;
        const gender = masc ? 'masculine' : fem ? 'feminine' : 'neuter';
        const correctArticle = masc ? 'einen' : fem ? 'eine' : 'ein';
        const distractors = masc ? ['ein', 'eine'] : fem ? ['einen', 'ein'] : ['einen', 'eine'];
        return {
          id: it.cardId || `k-${idx}`,
          name: it.answer,
          translation: it.prompt,
          gender,
          correctArticle,
          distractors,
          emoji: ['📦', '🔑', '🎒', '🏷️', '🧭', '🎟️', '🎧'][idx % 7],
        };
      });
    }
    return ITENS_MALA_PADRAO;
  }, [itemsProp]);

  const maxVidas = ageProfile === 'kids' ? 4 : 3;
  const [vidas, setVidas] = useState(maxVidas);
  const [pontos, setPontos] = useState(0);
  const [nivelAtual, setNivelAtual] = useState(1);
  const [etapa, setEtapa] = useState<'apresentar' | 'repetir' | 'artigo' | 'sucesso_nivel' | 'fim'>('apresentar');
  
  // Itens atualmente empacotados na mala (cresce a cada nível)
  const itensNaMala = useMemo(() => {
    return poolItens.slice(0, nivelAtual);
  }, [poolItens, nivelAtual]);

  const novoItem = itensNaMala[itensNaMala.length - 1];

  // Estado da repetição sequencial
  const [indiceRepeticao, setIndiceRepeticao] = useState(0);
  const [itensClicados, setItensClicados] = useState<string[]>([]);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const malaRef = useRef<HTMLDivElement>(null);

  // Início de novo nível
  useEffect(() => {
    inicioRodadaRef.current = Date.now();
    setItensClicados([]);
    setIndiceRepeticao(0);
    setEtapa('apresentar');
    play('add');

    // Mostra o item novo por 2 segundos e então passa para a ação
    const timer = setTimeout(() => {
      if (nivelAtual === 1) {
        // Primeiro item: vai direto para o desafio de artigo
        setEtapa('artigo');
      } else {
        // Demais itens: primeiro precisa repetir a sequência anterior
        setEtapa('repetir');
      }
    }, 2200);

    return () => clearTimeout(timer);
  }, [nivelAtual]);

  // Manipula clique na sequência de itens (Fase: Repetir)
  const handleCliqueItemSequencia = (item: KofferItem) => {
    if (etapa !== 'repetir') return;

    const itemEsperado = itensNaMala[indiceRepeticao];

    if (item.id === itemEsperado.id) {
      // Acertou o passo da sequência
      play('click');
      const proximoIndice = indiceRepeticao + 1;
      setItensClicados((prev) => [...prev, item.id]);
      setIndiceRepeticao(proximoIndice);

      // Se terminou de repetir todos os itens anteriores
      if (proximoIndice >= itensNaMala.length - 1) {
        play('select');
        // Agora vai para a etapa de escolher o artigo do NOVO item
        setTimeout(() => {
          setEtapa('artigo');
        }, 400);
      }
    } else {
      // Errou a ordem da mala!
      tratarErroDeSequencia();
    }
  };

  const tratarErroDeSequencia = () => {
    play('error');
    if (malaRef.current) tremor(malaRef.current);
    setVidas((v) => {
      const novasVidas = v - 1;
      if (novasVidas <= 0) {
        finalizarJogo(false);
      }
      return novasVidas;
    });
    // Reinicia a tentativa de repetição deste nível
    setItensClicados([]);
    setIndiceRepeticao(0);
  };

  // Manipula a escolha do artigo gramatical (Fase: Artigo)
  const handleEscolhaArtigo = (artigo: string, event: React.MouseEvent) => {
    if (etapa !== 'artigo' || !novoItem) return;

    const correto = artigo === novoItem.correctArticle;
    const duracaoItem = Date.now() - inicioRodadaRef.current;

    outcomesRef.current.push({
      itemRef: novoItem.name,
      correct: correto,
      attempts: 1,
      ms: duracaoItem,
    });

    if (correto) {
      // ACERTOU O CASO GRAMATICAL!
      play('success');
      const rect = event.currentTarget.getBoundingClientRect();
      emitBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'combo');
      
      const pts = 150 + (nivelAtual * 50);
      setPontos((p) => p + pts);
      setEtapa('sucesso_nivel');

      setTimeout(() => {
        if (nivelAtual >= poolItens.length) {
          finalizarJogo(true);
        } else {
          setNivelAtual((n) => n + 1);
        }
      }, 1200);
    } else {
      // ERROU O ARTIGO!
      play('error');
      if (malaRef.current) tremor(malaRef.current);
      setVidas((v) => {
        const novasVidas = v - 1;
        if (novasVidas <= 0) {
          finalizarJogo(false);
        }
        return novasVidas;
      });
    }
  };

  const finalizarJogo = (venceu: boolean) => {
    setEtapa('fim');
    if (venceu) {
      play('fanfarra');
      comemorar('rodadaBoa');
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

  // Opções embaralhadas de artigos
  const opcoesArtigo = useMemo(() => {
    if (!novoItem) return [];
    return [novoItem.correctArticle, ...novoItem.distractors].sort();
  }, [novoItem]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden" ref={malaRef}>
      {/* Topo do jogo */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors"
            title="Sair do Jogo da Mala"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Ich packe meinen Koffer</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">Mala Infinita</span>
            </div>
            <p className="text-xs text-ink-muted">Treine a memória sequencial e o caso Acusativo alemão!</p>
          </div>
        </div>

        {/* Vidas, Nível e Pontuação */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            {Array.from({ length: maxVidas }).map((_, i) => (
              <Heart
                key={i}
                className={`w-5 h-5 transition-all ${
                  i < vidas ? 'text-error fill-error scale-100' : 'text-border-subtle fill-none scale-75'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <span className="text-xs text-ink-muted font-bold">NÍVEL</span>
            <span className="font-mono font-black text-accent">{nivelAtual}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold text-base">{pontos} pts</span>
          </div>
        </div>
      </header>

      {/* Arena Central: A Mala */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
        {/* A Mala Gráfica */}
        <div className="relative w-full max-w-2xl bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-8 shadow-card flex flex-col items-center">
          <div className="absolute -top-4 px-4 py-1 rounded-full bg-accent text-accent-contrast font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm">
            <Briefcase className="w-3.5 h-3.5" />
            <span>Mala de Viagem ({itensNaMala.length} {itensNaMala.length === 1 ? 'item' : 'itens'})</span>
          </div>

          {/* Compartimentos da mala com itens guardados */}
          <div className="w-full min-h-[140px] border-2 border-dashed border-border-subtle rounded-2xl p-4 my-4 flex flex-wrap items-center justify-center gap-3 bg-surface-hover/40">
            {itensNaMala.map((item, idx) => {
              const ehNovoDesteNivel = idx === itensNaMala.length - 1;
              const jaFoiRepetido = itensClicados.includes(item.id);

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 ${
                    ehNovoDesteNivel && etapa === 'apresentar'
                      ? 'border-accent bg-accent-soft text-accent-ink scale-110 shadow-md animate-bounce'
                      : jaFoiRepetido
                      ? 'border-good bg-good-soft text-good-ink'
                      : 'border-border-subtle bg-surface text-ink'
                  }`}
                >
                  <span className="text-xl">{item.emoji}</span>
                  <span className="font-bold text-sm">{item.name}</span>
                  {jaFoiRepetido && <Check className="w-4 h-4 text-good" />}
                </div>
              );
            })}
          </div>

          {/* Instrução Dinâmica da Fase */}
          <div className="text-center my-2 min-h-[50px] flex flex-col items-center justify-center">
            {etapa === 'apresentar' && (
              <div className="animate-fadeIn">
                <p className="text-xs text-ink-muted uppercase tracking-wider">Novo item sendo guardado:</p>
                <p className="text-xl font-display font-black text-accent mt-0.5">
                  "{novoItem?.name}" ({novoItem?.translation})
                </p>
              </div>
            )}

            {etapa === 'repetir' && (
              <div className="animate-fadeIn">
                <p className="text-sm font-bold text-ink">
                  Repita os itens que já estavam na mala na ordem em que foram empacotados!
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Item {indiceRepeticao + 1} de {itensNaMala.length - 1}
                </p>
              </div>
            )}

            {etapa === 'artigo' && (
              <div className="animate-fadeIn">
                <p className="text-sm font-bold text-ink">
                  Qual o artigo correto no <span className="underline decoration-accent font-black">Acusativo</span> para "{novoItem?.name}"?
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Gênero: <span className="font-bold uppercase text-accent">{novoItem?.gender}</span>
                </p>
              </div>
            )}

            {etapa === 'sucesso_nivel' && (
              <div className="text-good font-black text-lg flex items-center gap-2 animate-bounce">
                <Check className="w-5 h-5" />
                <span>Perfeito! Mala organizada com sucesso!</span>
              </div>
            )}

            {etapa === 'fim' && (
              <div className="text-accent font-black text-xl">
                Partida concluída! Calculando resultado...
              </div>
            )}
          </div>

          {/* Painel Interativo de Ação */}
          <div className="w-full mt-4 pt-4 border-t border-border-subtle flex flex-col items-center">
            {/* Se estiver na fase de repetir a sequência anterior: mostra botões dos itens */}
            {etapa === 'repetir' && (
              <div className="flex flex-wrap justify-center gap-3">
                {poolItens.slice(0, nivelAtual - 1).map((item) => {
                  const jaClicado = itensClicados.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleCliqueItemSequencia(item)}
                      disabled={jaClicado}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold border transition-all ${
                        jaClicado
                          ? 'opacity-40 border-border-subtle bg-surface-hover cursor-not-allowed'
                          : 'border-border-subtle bg-surface hover:border-accent hover:-translate-y-0.5 active:scale-95 shadow-sm'
                      }`}
                    >
                      <span>{item.emoji}</span>
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Se estiver na fase do desafio do artigo: mostra botões com opções (einen / eine / ein) */}
            {etapa === 'artigo' && (
              <div className="flex flex-wrap justify-center gap-4">
                {opcoesArtigo.map((artigo) => (
                  <button
                    key={artigo}
                    onClick={(e) => handleEscolhaArtigo(artigo, e)}
                    className="px-6 py-3 rounded-2xl border-2 border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft hover:text-accent-ink font-display font-black text-xl shadow-card transition-all active:scale-95 flex items-center gap-2"
                  >
                    <span>{artigo}</span>
                    <span className="text-sm font-normal text-ink-muted">({novoItem?.name})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
