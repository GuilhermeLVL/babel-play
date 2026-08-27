import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Timer, Flame, Scissors, Zap } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { distractorsFor, scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, pontosDoElemento, pontosFlutuantes, multiplicador, tremor } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { play } from '../../lib/soundFx';
import {
  bonusDeTempo, pontosDoAcerto, emFever, ehMarco, rotuloDaSequencia, PENALIDADE_ERRO_S, SEQUENCIA_FEVER,
} from '../../core/minigames/blitzRegras';

/**
 * DUELO RELÂMPAGO — a revisão cronometrada.
 *
 * É o único jogo em que a VELOCIDADE conta: responder em menos de 3s vira nota "fácil" no
 * agendador, porque recuperação rápida é o sinal de que a palavra está firme. Nos outros jogos a
 * pessoa pode pensar à vontade, e por isso lá o teto é "bom".
 *
 * Os distratores são outras palavras REAIS do baralho — alternativa inventada denuncia a certa.
 *
 * O tempo é maior no perfil sênior (constante do perfil, não um `if` espalhado): pressa não é
 * parte do que se quer treinar ali.
 *
 * A DICA aqui é o "cortar duas": some com duas alternativas erradas. Foi escolhida assim porque
 * é a única ajuda que não entrega a resposta — a pessoa ainda precisa escolher entre duas, e
 * ainda contra o relógio. Custa nota 2 no item em que foi usada.
 *
 * O RITMO (2026-08-26, pedido do dono: "frenético, dopaminérgico"). As regras estão em
 * `core/minigames/blitzRegras` (puras, testadas); aqui é só a encenação delas:
 *   - acerto rápido DEVOLVE segundos à barra (a rodada dura mais para quem está bem);
 *   - bônus de velocidade por resposta, somado ao multiplicador da sequência;
 *   - o som do combo sobe um semitom por acerto seguido — a escada é o retorno mais imediato;
 *   - marcos (5, 10, 15…) explodem partículas nas bordas da tela e tremem o palco;
 *   - FEVER a partir de 8 seguidos: tudo × 2, palco pulsando dourado;
 *   - erro: clarão vermelho, −2 s, sequência zera. Pontos ganhos não se perdem.
 * O que NÃO entrou de propósito: nada que atrase a próxima jogada (efeitos ≤ 1 s, sem bloqueio),
 * e as guardas globais de movimento reduzido continuam valendo.
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

/** Placar que "roda" até o valor real em vez de saltar — o número subindo é metade do prazer. */
function usePlacarRolando(alvo: number): number {
  const [mostrado, setMostrado] = useState(alvo);
  useEffect(() => {
    if (mostrado === alvo) return;
    let vivo = true;
    const inicio = performance.now();
    const de = mostrado;
    const DUR = 420;
    const passo = (agora: number) => {
      if (!vivo) return;
      const t = Math.min(1, (agora - inicio) / DUR);
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
  /** Efeitos transitórios (classes CSS de 0,3–0,5 s). Cada um tem um contador para re-disparar. */
  const [barraPulso, setBarraPulso] = useState(0);
  const [erroPulso, setErroPulso] = useState(0);
  const [marco, setMarco] = useState<{ id: number; texto: string } | null>(null);
  /**
   * A RODADA ACABOU — tela congelada.
   *
   * `jaFinalizouRef` só protegia o `onFinish` de disparar duas vezes; não impedia a pessoa de
   * RESPONDER depois do fim. Como `onFinish` só é chamado 900 ms após `finalizar()` (o tempo da
   * comemoração), existia uma janela em que a última pergunta continuava viva e clicável — e, pior,
   * com aparência de NOVA, porque o `setEscolhido(null)` reabilitava as quatro alternativas.
   *
   * O resultado medido: um 21º `ItemOutcome` com o MESMO `cardId`, o que faz `Play.tsx` chamar
   * `reviewCard` duas vezes para o mesmo cartão. E como `inicioItemRef` acabara de ser zerado, o
   * clique reflexo entrava com `ms` mínimo — que em `gradeFor` do Duelo é nota **4 ("fácil")**. Ou
   * seja: um toque acidental promovia o cartão como se a pessoa tivesse respondido num relâmpago.
   *
   * Existe como ESTADO e não só como ref porque o congelamento tem de aparecer na tela (React
   * precisa re-renderizar com os botões desabilitados); o ref continua sendo a guarda síncrona do
   * clique, que não pode esperar o próximo render.
   */
  const [acabou, setAcabou] = useState(false);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const relogioRef = useRef<HTMLSpanElement | null>(null);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);
  /**
   * Índices já respondidos. `escolhido` já barra o segundo clique DENTRO de um item, mas ele é
   * estado: entre o clique e o re-render, dois toques rápidos passam os dois. Este ref é síncrono,
   * então um item nunca gera dois `ItemOutcome` — e é o `cardId` repetido que dobra a revisão.
   */
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
    /* Congela a tela AGORA, não em 900 ms. Vale para os dois caminhos que chegam aqui: a última
       resposta e o fim do tempo. No caminho do relógio isto é o que impede responder uma pergunta
       cujo tempo já acabou — o arquivo dizia "quem não foi perguntado não errou", e sem o
       congelamento quem não foi perguntado ainda podia acertar. */
    setAcabou(true);
    // Itens não alcançados no tempo NÃO viram nota: quem não foi perguntado não errou.
    const outcomes = resultadosRef.current;
    const impecavel = outcomes.length > 0 && outcomes.every(o => o.correct && !o.hinted);
    comemorar(impecavel ? 'rodadaPerfeita' : outcomes.some(o => o.correct) ? 'rodadaBoa' : 'erro', palcoRef.current, { tremer: impecavel });
    if (impecavel) explodirBordas(8, 'confete');
    setTimeout(() => onFinish({
      gameId: 'blitz',
      items: outcomes,
      score: scoreRound('blitz', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    }), 900);
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
      setPontos(p => p + ganho.total);

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
      // 3. Tempo de volta: a barra acende e o relógio ganha um "+2s". Só sem dica.
      const segundos = comDica ? 0 : bonusDeTempo(ms);
      if (segundos > 0) {
        setRestante(s => Math.min(duracao, s + segundos));
        setBarraPulso(n => n + 1);
        play('timeBonus');
        setTimeout(() => pontosDoElemento('+' + segundos + 's', relogioRef.current, 'bom'), 80);
      }
      // 4. Marcos e fever: a festa de tela inteira, reservada ao que é raro.
      if (nova === SEQUENCIA_FEVER && !comDica) {
        play('fever');
        explodirBordas(8, 'levelUp');
        tremor(palcoRef.current, 6);
        setMarco({ id: nova, texto: 'FEVER ×2' });
      } else if (ehMarco(nova) && !comDica) {
        play('levelUp');
        explodirBordas(nova >= 20 ? 12 : 6, nova >= 10 ? 'levelUp' : 'combo');
        tremor(palcoRef.current, 4);
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
      /* A ORDEM AQUI É A CORREÇÃO. Antes, `setEscolhido(null)` vinha PRIMEIRO e valia também para o
         último item: a revelação (verde/vermelho) sumia, as quatro alternativas voltavam a habilitar
         e a mesma pergunta ficava clicável pelos 900 ms que faltavam para `onFinish`. Agora, no
         último item nada é limpo — a tela fica no estado revelado e congelada. Só há reset quando
         existe um item seguinte para receber a tela limpa. */
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

  // O cartaz do marco some sozinho (a animação dura 1 s).
  useEffect(() => {
    if (!marco) return;
    const t = setTimeout(() => setMarco(null), 1000);
    return () => clearTimeout(t);
  }, [marco]);

  if (!item) return null;

  const pct = Math.max(0, Math.min(100, (restante / duracao) * 100));
  const apertado = restante <= CONTAGEM_FINAL_S;
  const rotulo = rotuloDaSequencia(sequencia);

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-8 animate-in fade-in duration-200 relative">
      <header className="flex items-center justify-between mb-4 shrink-0">
        <span
          ref={relogioRef}
          className={`flex items-center gap-1.5 font-mono font-black text-lg ${apertado ? 'text-error-ink' : 'text-ink'}`}
        >
          <Timer className="w-5 h-5" aria-hidden /> {restante}s
        </span>
        <span className="flex items-center gap-3">
          {pontos > 0 && (
            <span key={'p' + pontos} className="text-[13px] font-black text-accent-ink tabular-nums blitz-pop">{placar} pts</span>
          )}
          {sequencia >= 2 && (
            <span
              key={'s' + sequencia}
              className={`flex items-center gap-1 text-[13px] font-black blitz-pop ${fever ? 'text-warn-ink' : 'text-warn-ink'}`}
            >
              {fever ? <Zap className="w-4 h-4" aria-hidden /> : <Flame className="w-4 h-4" aria-hidden />}
              {sequencia}
              {multiplicador(sequencia) > 1 && <span> · ×{multiplicador(sequencia) * (fever ? 2 : 1)}</span>}
              {rotulo && <span className="hidden sm:inline uppercase tracking-wider text-[10px] ml-1 opacity-80">{rotulo}</span>}
            </span>
          )}
        </span>
        <span className="flex items-center gap-0.5">
          <button
            onClick={(e) => cortarDuas(e.currentTarget)}
            disabled={cortesRestantes <= 0 || cortadas.length > 0 || !!escolhido || acabou}
            className="p-2 rounded-lg text-ink-muted hover:text-warn-ink hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            title={'Cortar duas alternativas erradas (' + cortesRestantes + ' restantes — conta como dica)'}
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

      {/* Barra do tempo — a tensão do jogo. Acende quando ganha segundos; dourada no fever. */}
      <div className="h-1.5 bg-canvas rounded-full overflow-visible mb-8 shrink-0">
        <div
          key={'b' + barraPulso}
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            apertado ? 'bg-error' : fever ? 'bg-warn' : 'bg-accent'
          } ${barraPulso > 0 ? 'blitz-refill' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div
        ref={palcoRef}
        key={'e' + erroPulso}
        className={`flex-1 flex flex-col items-center justify-center gap-8 max-w-xl mx-auto w-full relative ${
          fever ? 'blitz-fever' : ''
        } ${erroPulso > 0 ? 'blitz-erro' : ''}`}
      >
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

        <div className="text-center">
          <p className="label-mono mb-2">
            {item.clozed ? 'Complete a frase' : ageProfile === 'senior' ? 'Qual palavra significa' : 'Que palavra é'}
          </p>
          <p data-tour="pergunta" className="font-display font-black text-2xl text-ink leading-tight">{item.prompt}</p>
          <p className="text-[11px] text-ink-faint mt-2">{indice + 1} de {items.length}</p>
        </div>

        <div data-tour="alternativas" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
          {alternativas.map(alt => {
            const escolhida = escolhido === alt;
            const certa = alt === item.answer;
            /* `acabou` entra aqui junto com `escolhido`: no fim do tempo a pergunta não foi
               respondida (`escolhido` é null) e sem isto ela continuaria clicável. */
            const revelando = escolhido !== null || acabou;
            const cortada = cortadas.includes(alt);
            return (
              <button
                key={alt}
                onClick={(e) => responder(alt, e.currentTarget)}
                disabled={revelando || cortada}
                className={`py-3.5 px-4 rounded-xl border font-bold text-[15px] transition-all ${
                  cortada
                    ? 'bg-canvas border-border-subtle text-ink-faint line-through opacity-40'
                    : revelando
                      ? certa
                        ? 'bg-good-soft border-good text-good-ink blitz-pop'
                        : escolhida
                          ? 'bg-error-soft border-error text-error-ink'
                          : 'bg-surface border-border-subtle text-ink-faint'
                      : 'bg-surface border-border-subtle text-ink hover:border-accent hover:-translate-y-0.5 cursor-pointer'
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
