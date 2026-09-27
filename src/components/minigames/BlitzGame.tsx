import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { distractorsFor, scoreRound } from '@core';
import { Scissors, Zap } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  bonusDeTempo,
  ehMarco,
  emFever,
  PENALIDADE_ERRO_S,
  pontosDoAcerto,
  rotuloDaSequencia,
  SEQUENCIA_FEVER,
} from '../../core/minigames/blitzRegras';
import { celebrar } from '../../lib/comemoracao';
import { eventosCondicionais } from '../../lib/eventosDeJogo';
import {
  executarEfeito,
  multiplicador,
  pontosDoElemento,
  pontosFlutuantes,
  pulsoDeZoom,
  tremor,
  tremorDeTela,
} from '../../lib/juice';
import { direcaoDoTexto } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { falar } from '../../lib/tts';
import { botaoDaAlternativa, useAtalhosDasAlternativas } from './casca/atalhos';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda } from './casca/HudDaRodada';

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
 *   - A rodada termina no FIM COMUM (`ResultadoDaRodada`), como todos os jogos: uma régua de
 *     estrelas só (`fases`), e o envio ao ranking mora lá. Até 27/09 havia uma tela própria antes.
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

export default function BlitzGame({ items, ageProfile, onFinish }: BlitzGameProps) {
  const duracao = DURACAO[ageProfile];
  /** A casca diz se a rodada anda: durante a contagem 3-2-1 e na pausa, o relógio para. */
  const { ativo } = useRodada();
  const [indice, setIndice] = useState(0);
  const [restante, setRestante] = useState(duracao);
  const [sequencia, setSequencia] = useState(0);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [pontos, setPontos] = useState(0);
  const [acertos, setAcertos] = useState(0);
  /** Alternativas cortadas pela dica NESTE item (zera ao trocar de item). */
  const [cortadas, setCortadas] = useState<string[]>([]);
  const [cortesRestantes, setCortesRestantes] = useState(2);
  /** Efeitos transitórios (classes CSS de 0,3–0,7 s); contadores para re-disparar. */
  const [erroPulso, setErroPulso] = useState(0);
  const [ondas, setOndas] = useState<number[]>([]);
  const [marco, setMarco] = useState<{ id: number; texto: string } | null>(null);
  /**
   * A RODADA ACABOU — tela congelada. `jaFinalizouRef` é a guarda síncrona (o clique não espera
   * o render); o estado `acabou` é o que desabilita os botões na tela. Sem os dois, um toque
   * reflexo depois do fim gerava um 21º outcome com o MESMO cardId e ms mínimo — promoção
   * acidental do cartão (medido; ver histórico deste arquivo).
   */
  const [acabou, setAcabou] = useState(false);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);
  /** Índices já respondidos (guarda síncrona contra o toque duplo dentro de um item). */
  const respondidosRef = useRef<Set<number>>(new Set());

  const item = items[indice];
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

  /**
   * O FIM É O COMUM. O Duelo tinha a própria tela de resultado (estrelas por outra régua, recorde
   * local, fanfarra) ANTES da tela comum (`ResultadoDaRodada`, estrelas de `fases`): duas telas de
   * fim e duas notas para a mesma rodada. Agora o relatório sai aqui e o fim é o de todos os
   * jogos — que também festeja, conta o recorde e oferece o ranking (só aos jogos com ranking).
   */
  const finalizar = () => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    setAcabou(true);
    // Itens não alcançados no tempo NÃO viram nota: quem não foi perguntado não errou.
    const outcomes = resultadosRef.current;
    onFinish({
      gameId: 'blitz',
      items: outcomes,
      score: scoreRound('blitz', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    });
  };

  // O relógio. Zerou, acabou — mesmo com itens restantes. Nos últimos segundos, um toque por segundo.
  // Parado enquanto a casca não deixa a rodada andar (contagem, pausa, "Como se joga").
  useEffect(() => {
    if (jaFinalizouRef.current || !ativo) return;
    if (restante <= 0) {
      finalizar();
      return;
    }
    if (restante <= CONTAGEM_FINAL_S) play('tick');
    const t = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // `finalizar` é guardado por `jaFinalizouRef`: o relógio só precisa reagir ao tempo e à pausa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante, ativo]);

  const responder = (alternativa: string, el: HTMLElement | null) => {
    /* As três guardas são síncronas de propósito: `escolhido` é estado e chega um render atrasado. */
    if (escolhido || !item || !ativo) return;
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
      setAcertos((n) => n + 1);
      setPontos((p) => p + ganho.total);

      // 1. O acerto pelo motor de comemoração: tom que sobe com a sequência, vibração e o "+N".
      celebrar({ tipo: 'acerto', combo: nova, el, pontos: ganho.total });
      falar(item.answer, item.lang);

      // 2. Velocidade: um segundo número, defasado, para não colidir com o primeiro.
      if (ganho.velocidade > 0 && el) {
        const r = el.getBoundingClientRect();
        setTimeout(
          () => pontosFlutuantes('⚡ rápido +' + ganho.velocidade, r.left + r.width * 0.75, r.top, 'bom'),
          140,
        );
      }
      // 3. Tempo de volta: o anel "engole" um pulso e o relógio ganha um "+2s". Só sem dica.
      const segundos = comDica ? 0 : bonusDeTempo(ms);
      if (segundos > 0) {
        setRestante((s) => Math.min(duracao, s + segundos));
        play('timeBonus');
        setTimeout(
          () => pontosDoElemento('+' + segundos + 's', document.querySelector('#palco .hud-tempo'), 'bom'),
          80,
        );
      }
      // 4. Eventos CONDICIONAIS nos limiares (combo 5/10/15).
      for (const ev of eventosCondicionais({ combo: nova, fever: emFever(nova) })) executarEfeito(ev);
      /* 5. Marcos e fever: onda de choque e cartaz, reservados ao que é raro. As partículas e a
         vibração do degrau de multiplicador saem do HUD (`celebrar({ tipo: 'combo' })`). */
      if (nova === SEQUENCIA_FEVER && !comDica) {
        play('fever');
        pulsoDeZoom();
        tremor(palcoRef.current, 6);
        setOndas((o) => [...o, nova]);
        setMarco({ id: nova, texto: 'FEVER ×2' });
      } else if (ehMarco(nova) && !comDica) {
        play('levelUp');
        tremorDeTela(4);
        tremor(palcoRef.current, 4);
        setOndas((o) => [...o, nova]);
        setMarco({ id: nova, texto: nova + ' seguidas!' });
      }
    } else {
      setSequencia(0);
      setErroPulso((n) => n + 1);
      setRestante((s) => Math.max(0, s - PENALIDADE_ERRO_S));
      celebrar({ tipo: 'erro', el: el ?? palcoRef.current });
      pontosDoElemento('−' + PENALIDADE_ERRO_S + 's', el, 'ruim');
    }
    setTimeout(
      () => {
        /* No último item nada é limpo — a tela fica no estado revelado e congelada; só há reset
         quando existe um item seguinte para receber a tela limpa (correção antiga, mantida). */
        if (indice + 1 >= items.length) {
          finalizar();
          return;
        }
        setEscolhido(null);
        setCortadas([]);
        inicioItemRef.current = Date.now();
        setIndice((i) => i + 1);
      },
      certo ? 420 : 650,
    );
  };

  /** DICA "cortar duas": remove duas alternativas erradas do item atual. Custa nota 2. */
  const cortarDuas = (el: HTMLElement | null) => {
    if (!item || escolhido || cortesRestantes <= 0 || cortadas.length) return;
    if (jaFinalizouRef.current) return; // gastar uma dica numa rodada encerrada não faz nada
    const erradas = alternativas.filter((a) => a !== item.answer);
    setCortadas(erradas.slice(0, 2));
    setCortesRestantes((n) => n - 1);
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    pontosDoElemento('sobraram 2', el, 'neutro');
  };

  // Teclas 1–4: a alternativa pela posição na tela (as cortadas pela dica não respondem).
  useAtalhosDasAlternativas(
    alternativas.length,
    (i) => {
      const alt = alternativas[i];
      if (!alt || cortadas.includes(alt)) return;
      responder(alt, botaoDaAlternativa(palcoRef.current, 'alternativas', i));
    },
    !!item && ativo && !escolhido && !acabou,
  );

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

  return (
    /* S7: este container é `flex-1` dentro de uma coluna flex mais externa (o shell do jogo).
       Um item flex sem `min-h-0` não encolhe abaixo do tamanho do seu CONTEÚDO — é a mesma lição
       de layout do Termo nesta base ("sticky/overlay não reserva espaço", mas aqui é o oposto:
       um item cresce e o pai não segura). Com enunciado de 160 caracteres em viewport curta, o
       palco crescia além da tela e as alternativas saíam sem nenhuma rolagem. `min-h-0` deixa o
       flex encolher de verdade; `overflow-y-auto` dá para onde o excesso ir. */
    /* A CASCA COMUM (`casca/CascaDaRodada`) desenha o cabeçalho, a pausa e a contagem; aqui fica o
       placar comum (`HudDaRodada`) e o tabuleiro do Duelo, que é dele. */
    <>
      <HudDaRodada
        pontos={pontos}
        sequencia={sequencia}
        acertos={acertos}
        mult={multVisivel}
        comFever
        rotulo={`Item ${indice + 1} de ${items.length}`}
        tempo={restante}
        progresso={restante / duracao}
        pouco={apertado}
        ajudas={
          <BotaoDeAjuda
            icone={Scissors}
            rotulo="Cortar duas"
            resta={cortesRestantes}
            disabled={cortadas.length > 0 || !!escolhido || acabou}
            onClick={(e) => cortarDuas(e.currentTarget)}
            title={`Cortar duas alternativas erradas (${cortesRestantes} restantes)`}
            data-tour="tesoura"
          />
        }
      />
      <div
        ref={palcoRef}
        key={'e' + erroPulso}
        className={`flex-1 flex flex-col items-center justify-center gap-7 max-w-xl mx-auto w-full relative min-h-0 py-2 ${
          fever ? 'blitz-fever' : ''
        } ${erroPulso > 0 ? 'blitz-erro' : ''}`}
      >
        {/* Ondas de choque dos marcos. */}
        {ondas.map((o) => (
          <span key={o} className="blitz-onda" aria-hidden />
        ))}

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
            <span
              key={'selo' + sequencia}
              className={`blitz-selo flex items-baseline gap-1.5 select-none ${fever ? 'text-warn-ink' : sequencia >= 5 ? 'text-warn-ink' : 'text-accent-ink'}`}
            >
              <Zap className="w-6 h-6 self-center" aria-hidden />
              <span className="font-display font-black text-4xl leading-none">×{multVisivel}</span>
              {rotulo && <span className="font-black uppercase tracking-widest text-[12px] opacity-80">{rotulo}</span>}
            </span>
          )}
        </div>

        <div className="text-center">
          <p className="label-mono mb-2">
            {item.clozed ? 'Complete a frase' : ageProfile === 'senior' ? 'Qual palavra significa' : 'Que palavra é'}
          </p>
          {/* Pista curada pode chegar com até 160 caracteres. `line-clamp-4` corta em linha
              cheia (não no meio de uma palavra); o `title` guarda o texto inteiro. Acima de
              ~80 chars a fonte desce um degrau para abrir mais linha antes do clamp cortar —
              mesma técnica condicional simples da carta de memória, sem medir DOM. */}
          <p
            data-tour="pergunta"
            dir={direcaoDoTexto(item.clozed ? item.lang : '')}
            className={`font-display font-black text-ink leading-tight line-clamp-4 ${item.prompt.length > 80 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}
            title={item.prompt}
          >
            {item.prompt}
          </p>
          <p className="text-[11px] text-ink-faint mt-2">
            {indice + 1} de {items.length}
          </p>
        </div>

        <div data-tour="alternativas" className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {alternativas.map((alt, posicao) => {
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
                aria-keyshortcuts={String(posicao + 1)}
                dir={direcaoDoTexto(item.lang)}
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
    </>
  );
}
