import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Eye } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, pontosDoElemento, multiplicador } from '../../lib/juice';

/**
 * JOGO DA MEMÓRIA — palavra ↔ tradução.
 *
 * Por que este é o primeiro dos quatro: é o que tem a mecânica mais simples (sem grade, sem
 * relógio) e ao mesmo tempo o ciclo completo — item → nota no agendador → resultado gravado →
 * XP no perfil. Validar o ciclo aqui, antes de multiplicar por quatro, é barato.
 *
 * O que o torna EXERCÍCIO e não passatempo: para fechar um par a pessoa precisa lembrar o que a
 * palavra quer dizer (recuperação ativa). E a mecânica traz repetição espaçada de graça — o par
 * que ela erra volta para a mesa e reaparece até ser fechado.
 *
 * A VIRADA É 3D porque aqui ela É a mecânica: a carta gira no eixo Y e o verso aparece do outro
 * lado, como um objeto de verdade. É o único lugar do app onde o 3D carrega significado em vez
 * de enfeitar — em qualquer outro seria só barulho visual.
 */

interface MemoryGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Uma carta na mesa: a frente (palavra) ou o verso (tradução) de um item. */
interface Carta {
  id: string;
  itemIndex: number;
  texto: string;
  lado: 'palavra' | 'traducao';
}

/** Cores das duplas — a mesma paleta categórica usada para as pessoas na captura. */
const CORES = ['#7C3AED', '#0284C7', '#10B981', '#F59E0B', '#EF4444', '#E91E63', '#14B8A6', '#8B5CF6'];

export default function MemoryGame({ items, ageProfile, onFinish, onExit }: MemoryGameProps) {
  const folgado = ageProfile !== 'pro';

  /** Baralho embaralhado UMA vez (por rodada) — reembaralhar a cada render arruinaria o jogo. */
  const cartas = useMemo<Carta[]>(() => {
    const baralho: Carta[] = [];
    items.forEach((it, i) => {
      baralho.push({ id: `p${i}`, itemIndex: i, texto: it.answer, lado: 'palavra' });
      baralho.push({ id: `t${i}`, itemIndex: i, texto: it.prompt, lado: 'traducao' });
    });
    for (let i = baralho.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
    }
    return baralho;
  }, [items]);

  const [viradas, setViradas] = useState<string[]>([]);
  const [fechados, setFechados] = useState<Set<number>>(new Set());
  const [travado, setTravado] = useState(false);
  /** Pares fechados em seguida, sem nenhum erro no meio — é o que alimenta o multiplicador. */
  const [sequencia, setSequencia] = useState(0);
  const [pontos, setPontos] = useState(0);
  /** Espiada usada: mostra todas as cartas por um instante e marca os itens como "com dica". */
  const [espiando, setEspiando] = useState(false);
  const espiadasRef = useRef(0);
  const comDicaRef = useRef(false);
  /** Tentativas por item — é o que vira a nota (1 de primeira = 3; muitas = 1). */
  const tentativasRef = useRef<Map<number, number>>(new Map());
  const inicioRef = useRef<number>(Date.now());
  const inicioItemRef = useRef<Map<number, number>>(new Map());
  const mesaRef = useRef<HTMLDivElement | null>(null);

  const total = items.length;
  const ESPIADAS = 2; // duas por rodada: ajuda quem travou, sem virar o jogo inteiro

  // Rodada terminada: monta o relatório uma única vez.
  const jaFinalizouRef = useRef(false);
  useEffect(() => {
    if (fechados.size !== total || total === 0 || jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    const agora = Date.now();
    const outcomes: ItemOutcome[] = items.map((it, i) => ({
      cardId: it.cardId,
      itemRef: it.answer,
      correct: true, // fechar o par É acertar; o QUANTO custou está nas tentativas
      attempts: tentativasRef.current.get(i) ?? 1,
      ms: agora - (inicioItemRef.current.get(i) ?? inicioRef.current),
      hinted: comDicaRef.current,
    }));
    const report: RoundReport = {
      gameId: 'memory',
      items: outcomes,
      score: scoreRound('memory', outcomes),
      durationMs: agora - inicioRef.current,
    };
    // Mesa limpa SEM nenhum erro é raro: só esse caso ganha a chuva de confete.
    const semErro = outcomes.every(o => o.attempts <= 1) && !comDicaRef.current;
    comemorar(semErro ? 'rodadaPerfeita' : 'rodadaBoa', mesaRef.current, { tremer: semErro });
    setTimeout(() => onFinish(report), 900);
  }, [fechados, total, items, onFinish]);

  const virar = (carta: Carta, el: HTMLElement | null) => {
    if (travado || espiando || viradas.includes(carta.id) || fechados.has(carta.itemIndex)) return;
    if (!inicioItemRef.current.has(carta.itemIndex)) inicioItemRef.current.set(carta.itemIndex, Date.now());
    play('select');
    const novas = [...viradas, carta.id];
    setViradas(novas);
    if (novas.length < 2) return;

    const [a, b] = novas.map(id => cartas.find(c => c.id === id)!);
    const par = a.itemIndex === b.itemIndex && a.lado !== b.lado;
    // Conta a tentativa nos DOIS itens envolvidos: virar a carta errada custa para o par a que
    // ela pertence também — é a informação de que a pessoa ainda não sabe onde ele está.
    for (const idx of new Set([a.itemIndex, b.itemIndex])) {
      tentativasRef.current.set(idx, (tentativasRef.current.get(idx) ?? 0) + 1);
    }

    if (par) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const ganho = 10 * mult;
      setSequencia(nova);
      setPontos(p => p + ganho);
      comemorar(mult > 1 ? 'sequencia' : 'acerto', el, { texto: `+${ganho}${mult > 1 ? ` ×${mult}` : ''}`, tremer: mult >= 3 });
      setFechados(prev => new Set([...prev, a.itemIndex]));
      setViradas([]);
      return;
    }
    // Erro: as cartas voltam e a sequência zera. A re-exposição é a repetição espaçada da mecânica.
    setSequencia(0);
    comemorar('erro', el);
    setTravado(true);
    setTimeout(() => { setViradas([]); setTravado(false); }, 850);
  };

  /** ESPIAR: abre a mesa inteira por 1,2s. Cobra a nota de todos os itens (ver `gradeFor`). */
  const espiar = (el: HTMLElement | null) => {
    if (espiando || travado || espiadasRef.current >= ESPIADAS) return;
    espiadasRef.current += 1;
    comDicaRef.current = true;
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    setEspiando(true);
    play('select');
    pontosDoElemento(`${ESPIADAS - espiadasRef.current} espiadas`, el, 'neutro');
    setTimeout(() => setEspiando(false), 1200);
  };

  const mult = multiplicador(sequencia);

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-8 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      <header className="flex items-center justify-between mb-5 shrink-0">
        <div className="min-w-0">
          <h2 className="font-display font-black text-lg text-ink">
            {ageProfile === 'kids' ? 'Ache os pares' : 'Jogo da memória'}
          </h2>
          <p data-tour="placar" className="text-[12px] text-ink-muted">
            {fechados.size} de {total} {total === 1 ? 'par fechado' : 'pares fechados'}
            {pontos > 0 && <span className="text-accent-ink font-bold"> · {pontos} pts</span>}
            {mult > 1 && <span className="text-warn-ink font-bold"> · ×{mult}</span>}
          </p>
        </div>
        <span className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => espiar(e.currentTarget)}
            disabled={espiadasRef.current >= ESPIADAS || espiando}
            className="p-2 rounded-lg text-ink-muted hover:text-warn-ink hover:bg-surface-hover disabled:opacity-40 transition-colors cursor-pointer"
            data-tour="espiar"
            aria-label="Espiar a mesa"
            title={`Espiar todas as cartas (${ESPIADAS - espiadasRef.current} restantes, conta como dica)`}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={onExit}
            className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors cursor-pointer"
            aria-label="Sair do jogo"
            title="Sair do jogo"
          >
            <X className="w-5 h-5" />
          </button>
        </span>
      </header>

      {/* A mesa fica no MEIO da área livre: encostada no topo, ela deixava metade da tela vazia
          e o olho tinha de subir a cada jogada. */}
      <div ref={mesaRef} data-tour="mesa" className={`grid gap-2.5 ${total <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-4'} max-w-3xl w-full mx-auto my-auto`}>
        {cartas.map(carta => {
          const aberta = espiando || viradas.includes(carta.id) || fechados.has(carta.itemIndex);
          const fechada = fechados.has(carta.itemIndex);
          const cor = CORES[carta.itemIndex % CORES.length];
          return (
            <button
              key={carta.id}
              onClick={(e) => virar(carta, e.currentTarget)}
              disabled={fechada}
              aria-label={aberta ? carta.texto : 'Carta virada para baixo'}
              className={`carta3d ${aberta ? 'aberta' : ''} ${folgado ? 'min-h-[5.5rem]' : 'min-h-[4.5rem]'} rounded-2xl ${
                fechada ? 'opacity-70' : 'cursor-pointer'
              } ${!aberta ? 'hover:-translate-y-0.5 transition-transform' : ''}`}
            >
              <span className="carta3d-giro block">
                {/* O VERSO (o que se vê antes de virar) fica na FRENTE do elemento 3D — a carta
                    começa com a face de trás voltada para a pessoa, como na mesa de verdade. */}
                <span className="carta3d-frente bg-canvas border border-border-subtle rounded-2xl" aria-hidden>
                  <span className="w-6 h-6 rounded-lg bg-border-subtle/60" />
                </span>
                <span
                  className="carta3d-verso bg-surface shadow-card rounded-2xl px-2.5 py-2 text-center"
                  style={{ borderColor: cor, borderWidth: 2, borderStyle: 'solid' }}
                >
                  <span
                    className={`${folgado ? 'text-[14px]' : 'text-[13px]'} font-bold leading-tight break-words`}
                    style={{ color: carta.lado === 'palavra' ? cor : undefined }}
                  >
                    {carta.texto}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-faint text-center mt-5 mb-auto max-w-[52ch] mx-auto">
        {ageProfile === 'senior'
          ? 'Toque em duas cartas: uma com a palavra e outra com o significado dela.'
          : 'Vire duas cartas e feche o par: a palavra e a tradução dela.'}
      </p>
    </div>
  );
}
