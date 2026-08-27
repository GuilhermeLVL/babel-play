import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Scissors, Zap, Flame, Star, Trophy } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { distractorsFor, scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, pontosDoElemento, pontosFlutuantes, multiplicador, tremor } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { play } from '../../lib/soundFx';
import {
  bonusDeTempo, pontosDoAcerto, emFever, ehMarco, rotuloDaSequencia, estrelasDaRodada,
  PENALIDADE_ERRO_S, SEQUENCIA_FEVER,
} from '../../core/minigames/blitzRegras';

/**
 * DUELO RELÂMPAGO — a revisão cronometrada, agora em "ARCADE DE BRINQUEDO" (v2, 2026-08-27).
 *
 * A mecânica não mudou (velocidade conta; recuperação rápida = nota "fácil"; distratores são
 * palavras REAIS do baralho; a dica "cortar duas" custa nota 2 e zera o combo). O que mudou é a
 * ENCENAÇÃO, pedida pelo dono: "caricato, estilo jogo de verdade".
 *
 *   - Botões gordos com sombra dura que AFUNDAM ao apertar (CSS `blitz-btn`); acerto dá
 *     squash & stretch, erro balança.
 *   - O relógio virou um ANEL (SVG): dá para VER o tempo encolhendo, e ele "engole" um pulso
 *     quando um acerto rápido devolve segundos.
 *   - O combo é um SELO gigante acima da pergunta (×3 · EM CHAMAS), não um numerozinho no canto.
 *   - Marcos soltam uma ONDA DE CHOQUE + partículas nas bordas; FEVER pulsa dourado e dobra tudo.
 *   - A rodada termina numa TELA DE RESULTADO: estrelas (regra pura em blitzRegras), pontos
 *     rolando, melhor combo e RECORDE pessoal (localStorage `babel.blitz.recorde`) com fanfarra.
 *
 * Regras de pontuação/tempo continuam TODAS em `core/minigames/blitzRegras` (puras, testadas).
 * As guardas de sempre valem: `.animations-off`/`.performance-mode` desligam os efeitos; nenhum
 * efeito muda layout nem atrasa a próxima jogada.
 */

interface BlitzGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Segundos por rodada, por perfil. */
const DURACAO: Record<AgeProfileType, number> = { kids: 60, pro: 60, senior: 90 };
/** Segundos finais em que o relógio marca cada segundo com um toque. */
const CONTAGEM_FINAL_S = 10;
const CHAVE_RECORDE = 'babel.blitz.recorde';

/** Rajadas nas BORDAS da tela (marcos e fever): a festa cerca o jogo em vez de cobri-lo. */
function explodirBordas(quantas: number, kind: 'levelUp' | 'combo' | 'confete'): void {
  if (typeof window === 'undefined') return;
  const w = window.innerWidth, h = window.innerHeight;
  for (let i = 0; i < quantas; i++) {
    const lado = i % 4;
    const t = Math.random();
    const x = lado === 0 ? w * t : lado === 1 ? w * 0.96 : lado === 2 ? w * t : w * 0.04;
    const y = lado === 0 ? h * 0.06 : lado === 1 ? h * t : lado === 2 ? h * 0.94 : h * t;
    setTimeout(() => emitBurst(x, y, kind), i * 60);
  }
}

/** Placar que "rola" até o valor real em vez de saltar — o número subindo é metade do prazer. */
function usePlacarRolando(alvo: number, dur = 420): number {
  const [mostrado, setMostrado] = useState(alvo);
  useEffect(() => {
    if (mostrado === alvo) return;
    let vivo = true;
    const inicio = performance.now();
    const de = mostrado;
    const passo = (agora: number) => {
      if (!vivo) return;
      const t = Math.min(1, (agora - inicio) / dur);
      const suave = 1 - Math.pow(1 - t, 3);
      setMostrado(Math.round(de + (alvo - de) * suave));
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);
  return mostrado;
}

function lerRecorde(): number {
  try { return Number(localStorage.getItem(CHAVE_RECORDE)) || 0; } catch { return 0; }
}

/** O ANEL do tempo: SVG com stroke-dashoffset — o tempo encolhe visivelmente. */
function AnelDoTempo({ restante, duracao, apertado, fever, pulso }: {
  restante: number; duracao: number; apertado: boolean; fever: boolean; pulso: number;
}) {
  const R = 20;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, restante / duracao));
  return (
    <span key={'anel' + pulso} className={`relative inline-flex items-center justify-center ${pulso > 0 ? 'blitz-selo' : ''}`} aria-label={`${restante} segundos restantes`}>
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
        <circle cx="26" cy="26" r={R} fill="none" stroke="var(--border-subtle)" strokeWidth="5" />
        <circle
          cx="26" cy="26" r={R} fill="none"
          stroke={apertado ? 'var(--error)' : fever ? 'var(--warn)' : 'var(--accent)'}
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <span className={`absolute font-mono font-black text-[15px] tabular-nums ${apertado ? 'text-error-ink' : 'text-ink'}`}>{restante}</span>
    </span>
  );
}

export default function BlitzGame({ items, ageProfile, onFinish, onExit }: BlitzGameProps) {
  const duracao = DURACAO[ageProfile];
  const [indice, setIndice] = useState(0);
  const [restante, setRestante] = useState(duracao);
  const [sequencia, setSequencia] = useState(0);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [pontos, setPontos] = useState(0);
  /** Alternativas cortadas pela dica NESTE item (zera ao trocar de item). */
  const [cortadas, setCortadas] = useState<string[]>([]);
  const [cortesRestantes, setCortesRestantes] = useState(2);
  /** Efeitos transitórios (classes CSS de 0,3–0,7 s); contadores para re-disparar. */
  const [anelPulso, setAnelPulso] = useState(0);
  const [erroPulso, setErroPulso] = useState(0);
  const [ondas, setOndas] = useState<number[]>([]);
  const [marco, setMarco] = useState<{ id: number; texto: string } | null>(null);
  /** Tela de resultado (fim da rodada). O onFinish só dispara no "Continuar". */
  const [resultado, setResultado] = useState<{
    report: RoundReport; estrelas: 0 | 1 | 2 | 3; recorde: boolean; melhorSeq: number;
  } | null>(null);
  /**
   * A RODADA ACABOU — tela congelada. `jaFinalizouRef` é a guarda síncrona (o clique não espera
   * o render); o estado `acabou` é o que desabilita os botões na tela. Sem os dois, um toque
   * reflexo depois do fim gerava um 21º outcome com o MESMO cardId e ms mínimo — promoção
   * acidental do cartão (medido; ver histórico deste arquivo).
   */
  const [acabou, setAcabou] = useState(false);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const relogioRef = useRef<HTMLSpanElement | null>(null);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);
  const melhorSeqRef = useRef(0);
  const pontosRef = useRef(0);
  /** Índices já respondidos (guarda síncrona contra o toque duplo dentro de um item). */
  const respondidosRef = useRef<Set<number>>(new Set());

  const item = items[indice];
  const placar = usePlacarRolando(pontos);
  const fever = emFever(sequencia);

  /** Alternativas embaralhadas UMA vez por item (senão trocam de lugar a cada render). */
  const alternativas = useMemo(() => {
    if (!item) return [];
    const erradas = distractorsFor(item, items, 3);
    const todas = [...erradas, item.answer];
    for (let i = todas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [todas[i], todas[j]] = [todas[j], todas[i]];
    }
    return todas;
  }, [item, items]);

  const finalizar = () => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    setAcabou(true);
    // Itens não alcançados no tempo NÃO viram nota: quem não foi perguntado não errou.
    const outcomes = resultadosRef.current;
    const estrelas = estrelasDaRodada(outcomes);
    const report: RoundReport = {
      gameId: 'blitz',
      items: outcomes,
      score: scoreRound('blitz', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    };
    // Recorde pessoal por PONTOS da encenação (não pela nota do agendador): é o número que a
    // pessoa viu subir a rodada inteira.
    const anterior = lerRecorde();
    const recorde = pontosRef.current > anterior && pontosRef.current > 0;
    if (recorde) { try { localStorage.setItem(CHAVE_RECORDE, String(pontosRef.current)); } catch { /* sem storage */ } }
    setResultado({ report, estrelas, recorde, melhorSeq: melhorSeqRef.current });
    // Fanfarra: um arpejo por estrela, subindo; recorde ganha a festa grande.
    for (let i = 0; i < estrelas; i++) setTimeout(() => play('fanfarra', { transpose: i * 4 }), 200 + i * 380);
    if (recorde) {
      setTimeout(() => { play('levelUp'); explodirBordas(10, 'confete'); }, 200 + estrelas * 380);
    } else if (estrelas === 3) {
      setTimeout(() => explodirBordas(8, 'confete'), 900);
    }
  };

  // O relógio. Zerou, acabou — mesmo com itens restantes. Nos últimos segundos, um toque por segundo.
  useEffect(() => {
    if (jaFinalizouRef.current) return;
    if (restante <= 0) { finalizar(); return; }
    if (restante <= CONTAGEM_FINAL_S) play('tick');
    const t = setTimeout(() => setRestante(s => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante]);

  const responder = (alternativa: string, el: HTMLElement | null) => {
    /* As três guardas são síncronas de propósito: `escolhido` é estado e chega um render atrasado. */
    if (escolhido || !item) return;
    if (jaFinalizouRef.current) return;
    if (respondidosRef.current.has(indice)) return;
    respondidosRef.current.add(indice);
    const certo = alternativa === item.answer;
    const ms = Date.now() - inicioItemRef.current;
    setEscolhido(alternativa);
    resultadosRef.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct: certo,
      attempts: 1,
      ms,
      hinted: cortadas.length > 0,
    });
    if (certo) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const comDica = cortadas.length > 0;
      const ganho = pontosDoAcerto(ms, mult, nova, comDica);
      setSequencia(nova);
      melhorSeqRef.current = Math.max(melhorSeqRef.current, nova);
      setPontos(p => { pontosRef.current = p + ganho.total; return p + ganho.total; });

      // 1. O acerto em si: partícula + número no botão. O som do combo sobe com a sequência.
      const texto = '+' + ganho.total + (mult > 1 && !comDica ? ' ×' + mult : '') + (ganho.fever ? ' FEVER' : '');
      if (mult > 1 && !comDica) {
        comemorar('sequencia', el, { texto, tremer: mult >= 3 });
        play('combo', { transpose: Math.min(12, nova) });
      } else {
        comemorar('acerto', el, { texto });
      }
      // 2. Velocidade: um segundo número, defasado, para não colidir com o primeiro.
      if (ganho.velocidade > 0 && el) {
        const r = el.getBoundingClientRect();
        setTimeout(() => pontosFlutuantes('⚡ rápido +' + ganho.velocidade, r.left + r.width * 0.75, r.top, 'bom'), 140);
      }
      // 3. Tempo de volta: o anel "engole" um pulso e o relógio ganha um "+2s". Só sem dica.
      const segundos = comDica ? 0 : bonusDeTempo(ms);
      if (segundos > 0) {
        setRestante(s => Math.min(duracao, s + segundos));
        setAnelPulso(n => n + 1);
        play('timeBonus');
        setTimeout(() => pontosDoElemento('+' + segundos + 's', relogioRef.current, 'bom'), 80);
      }
      // 4. Marcos e fever: onda de choque + festa nas bordas, reservada ao que é raro.
      if (nova === SEQUENCIA_FEVER && !comDica) {
        play('fever');
        explodirBordas(8, 'levelUp');
        tremor(palcoRef.current, 6);
        setOndas(o => [...o, nova]);
        setMarco({ id: nova, texto: 'FEVER ×2' });
      } else if (ehMarco(nova) && !comDica) {
        play('levelUp');
        explodirBordas(nova >= 20 ? 12 : 6, nova >= 10 ? 'levelUp' : 'combo');
        tremor(palcoRef.current, 4);
        setOndas(o => [...o, nova]);
        setMarco({ id: nova, texto: nova + ' seguidas!' });
      }
    } else {
      setSequencia(0);
      setErroPulso(n => n + 1);
      setRestante(s => Math.max(0, s - PENALIDADE_ERRO_S));
      comemorar('erro', el, { tremer: true });
      setTimeout(() => pontosDoElemento('−' + PENALIDADE_ERRO_S + 's', relogioRef.current, 'ruim'), 60);
    }
    setTimeout(() => {
      /* No último item nada é limpo — a tela fica no estado revelado e congelada; só há reset
         quando existe um item seguinte para receber a tela limpa (correção antiga, mantida). */
      if (indice + 1 >= items.length) { finalizar(); return; }
      setEscolhido(null);
      setCortadas([]);
      inicioItemRef.current = Date.now();
      setIndice(i => i + 1);
    }, certo ? 420 : 650);
  };

  /** DICA "cortar duas": remove duas alternativas erradas do item atual. Custa nota 2. */
  const cortarDuas = (el: HTMLElement | null) => {
    if (!item || escolhido || cortesRestantes <= 0 || cortadas.length) return;
    if (jaFinalizouRef.current) return; // gastar uma dica numa rodada encerrada não faz nada
    const erradas = alternativas.filter(a => a !== item.answer);
    setCortadas(erradas.slice(0, 2));
    setCortesRestantes(n => n - 1);
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    pontosDoElemento('sobraram 2', el, 'neutro');
  };

  // Cartaz do marco e ondas somem sozinhos (as animações duram ≤ 1 s).
  useEffect(() => {
    if (!marco) return;
    const t = setTimeout(() => setMarco(null), 1000);
    return () => clearTimeout(t);
  }, [marco]);
  useEffect(() => {
    if (!ondas.length) return;
    const t = setTimeout(() => setOndas([]), 800);
    return () => clearTimeout(t);
  }, [ondas]);

  if (!item) return null;

  const apertado = restante <= CONTAGEM_FINAL_S;
  const rotulo = rotuloDaSequencia(sequencia);
  const multVisivel = multiplicador(sequencia) * (fever ? 2 : 1);

  /* ══════════════ TELA DE RESULTADO ══════════════ */
  if (resultado) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="card-panel bg-surface p-8 w-full max-w-md text-center relative overflow-hidden">
          <p className="label-mono mb-3">Fim da rodada</p>
          <div className="flex items-center justify-center gap-2 mb-4" aria-label={`${resultado.estrelas} de 3 estrelas`}>
            {[0, 1, 2].map(i => (
              <Star
                key={i}
                className={`w-12 h-12 blitz-estrela ${i < resultado.estrelas ? 'text-warn fill-warn' : 'text-border-subtle'}`}
                style={{ animationDelay: `${0.2 + i * 0.38}s` }}
                aria-hidden
              />
            ))}
          </div>
          <p className={`font-display font-black text-5xl tabular-nums ${resultado.recorde ? 'text-warn-ink blitz-recorde' : 'text-ink'}`}>
            {placar}
          </p>
          <p className="text-[12px] text-ink-muted mt-1">pontos</p>
          {resultado.recorde ? (
            <p className="flex items-center justify-center gap-1.5 mt-3 font-black text-[15px] text-warn-ink">
              <Trophy className="w-5 h-5" aria-hidden /> NOVO RECORDE!
            </p>
          ) : (
            lerRecorde() > 0 && <p className="text-[12px] text-ink-faint mt-3">recorde pessoal: {lerRecorde()}</p>
          )}
          <div className="flex items-center justify-center gap-5 mt-4 text-[13px] text-ink-muted">
            <span className="flex items-center gap-1"><Flame className="w-4 h-4 text-warn" aria-hidden /> melhor combo: <b className="text-ink">{resultado.melhorSeq}</b></span>
            <span>acertos: <b className="text-ink">{resultado.report.items.filter(o => o.correct).length}/{resultado.report.items.length}</b></span>
          </div>
          <button
            onClick={() => onFinish(resultado.report)}
            className="btn-ink w-full justify-center mt-7 cursor-pointer"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-8 animate-in fade-in duration-200 relative">
      <header className="flex items-center justify-between mb-2 shrink-0">
        <span ref={relogioRef}>
          <AnelDoTempo restante={restante} duracao={duracao} apertado={apertado} fever={fever} pulso={anelPulso} />
        </span>
        <span key={'p' + pontos} className={`font-display font-black text-3xl tabular-nums ${pontos > 0 ? 'blitz-pop' : ''} ${fever ? 'text-warn-ink' : 'text-ink'}`}>
          {placar}
        </span>
        <span className="flex items-center gap-0.5">
          <button
            onClick={(e) => cortarDuas(e.currentTarget)}
            disabled={cortesRestantes <= 0 || cortadas.length > 0 || !!escolhido || acabou}
            className="p-2 rounded-lg text-ink-muted hover:text-warn-ink hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            title={'Cortar duas alternativas erradas (' + cortesRestantes + ' restantes, conta como dica)'}
            data-tour="tesoura"
            aria-label="Cortar duas alternativas"
          >
            <Scissors className="w-4 h-4" />
          </button>
          <button onClick={onExit} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Sair do jogo">
            <X className="w-5 h-5" />
          </button>
        </span>
      </header>

      <div
        ref={palcoRef}
        key={'e' + erroPulso}
        className={`flex-1 flex flex-col items-center justify-center gap-7 max-w-xl mx-auto w-full relative ${
          fever ? 'blitz-fever' : ''
        } ${erroPulso > 0 ? 'blitz-erro' : ''}`}
      >
        {/* Ondas de choque dos marcos. */}
        {ondas.map(o => <span key={o} className="blitz-onda" aria-hidden />)}

        {/* Cartaz do marco: nasce no centro, cresce e some. Não recebe clique. */}
        {marco && (
          <div
            key={marco.id}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 font-display font-black text-4xl sm:text-5xl text-warn-ink drop-shadow-lg whitespace-nowrap blitz-marco"
          >
            {marco.texto}
          </div>
        )}

        {/* O SELO do combo: grande, acima da pergunta, pop a cada acerto. */}
        <div className="h-12 flex items-end justify-center" aria-hidden={sequencia < 2}>
          {sequencia >= 2 && (
            <span key={'selo' + sequencia} className={`blitz-selo flex items-baseline gap-1.5 select-none ${fever ? 'text-warn-ink' : sequencia >= 5 ? 'text-warn-ink' : 'text-accent-ink'}`}>
              {fever ? <Zap className="w-6 h-6 self-center" aria-hidden /> : <Flame className="w-6 h-6 self-center" aria-hidden />}
              <span className="font-display font-black text-4xl leading-none">×{multVisivel}</span>
              {rotulo && <span className="font-black uppercase tracking-widest text-[12px] opacity-80">{rotulo}</span>}
            </span>
          )}
        </div>

        <div className="text-center">
          <p className="label-mono mb-2">
            {item.clozed ? 'Complete a frase' : ageProfile === 'senior' ? 'Qual palavra significa' : 'Que palavra é'}
          </p>
          <p data-tour="pergunta" className="font-display font-black text-2xl sm:text-3xl text-ink leading-tight">{item.prompt}</p>
          <p className="text-[11px] text-ink-faint mt-2">{indice + 1} de {items.length}</p>
        </div>

        <div data-tour="alternativas" className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {alternativas.map(alt => {
            const escolhida = escolhido === alt;
            const certa = alt === item.answer;
            /* `acabou` entra junto com `escolhido`: no fim do tempo a pergunta não foi respondida
               e sem isto ela continuaria clicável. */
            const revelando = escolhido !== null || acabou;
            const cortada = cortadas.includes(alt);
            return (
              <button
                key={alt}
                onClick={(e) => responder(alt, e.currentTarget)}
                disabled={revelando || cortada}
                className={`blitz-btn py-4 px-4 font-bold text-[16px] ${
                  cortada
                    ? 'bg-canvas border-border-subtle text-ink-faint line-through opacity-40'
                    : revelando
                      ? certa
                        ? 'bg-good-soft border-good text-good-ink blitz-btn-certa blitz-squash'
                        : escolhida
                          ? 'bg-error-soft border-error text-error-ink blitz-btn-errada blitz-balanca'
                          : 'bg-surface border-border-subtle text-ink-faint'
                      : 'bg-surface border-border-subtle text-ink hover:border-accent cursor-pointer'
                }`}
              >
                {alt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
