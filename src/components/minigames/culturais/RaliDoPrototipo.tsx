import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { Flame, Lightbulb } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ajudasDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { anima, MOLA, polido, reduz } from '../../../lib/polimento/base';
import { sentir } from '../../../lib/polimento/sentidos';
import AjudasGerais from '../casca/AjudasGerais';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useSemTecladoFisico } from '../noQuest';
import { textosDoJogo } from '../polimento/textos';

/**
 * RALI — a cena do protótipo (`jogos3.js:19-173`, `jogos3.css:9-59`): uma quadra, um adversário e a
 * BOLA COMO RELÓGIO. Ela sai da raquete do Babel e chega à sua no tempo que você tem; escrevendo a
 * palavra letra por letra, cada letra certa acende, a errada fica vermelha um instante e sai sozinha,
 * e ao completar a sua raquete devolve.
 *
 * As regras e os números são os do protótipo. O que é do app: as palavras (as suas, não as de exemplo),
 * a nota de revisão de cada uma e o placar comum da rodada.
 *
 * Duas adaptações às palavras de verdade, que o protótipo (só palavras simples em inglês) não tinha:
 *   - letra com acento aceita a letra sem ele ("avo" escreve "avó"), e a casa mostra a letra certa;
 *   - espaço, hífen e apóstrofo entram sozinhos: ninguém precisa digitá-los.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

interface Ponto {
  x: number;
  y: number;
  s: number;
}

/** Segundos da bola por nível (`jogos3.js:29`). No Quest, sem teclado físico, o triplo: lá se digita apontando. */
const BASE_POR_NIVEL = { facil: 11, medio: 8, dificil: 6 } as const;
const SEM_TECLADO = 3;

const semAcento = (c: string) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const ehLetra = (c: string) => /\p{L}/u.test(c);
const kf = (p: Ponto) => `translate(${p.x}px, ${p.y}px) scale(${p.s})`;

export default function RaliDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('tenis');
  const nivel = useNivelDoJogo('tenis');
  const semTeclado = useSemTecladoFisico();
  const base = BASE_POR_NIVEL[nivel] * (semTeclado ? SEM_TECLADO : 1);
  const suficiente = items.length >= MINIGAMES.tenis.minItems;
  const textos = textosDoJogo('tenis');

  const [i, setI] = useState(0);
  const [rali, setRali] = useState(0);
  const [voce, setVoce] = useState(0);
  const [ele, setEle] = useState(0);
  const [valor, setValor] = useState('');
  const [msg, setMsg] = useState<{ rotulo: string; era: string } | null>(null);
  const [resto, setResto] = useState(base * 1000);
  const [total, setTotal] = useState(base * 1000);
  const [dicas, setDicas] = useState(() => ajudasDoJogo('tenis', 'letra', nivel));
  const [acabou, setAcabou] = useState(false);
  /** Quantos saques já saíram: é o que liga o relógio da bola. */
  const [saques, setSaques] = useState(0);

  const item = items[i] as MinigameItem | undefined;
  const alvo = item?.answer ?? '';

  /* O que a cena mexe à mão, como no protótipo: as animações da bola não passam pelo React. */
  const quadra = useRef<HTMLDivElement>(null);
  const bola = useRef<HTMLSpanElement>(null);
  const miolinho = useRef<HTMLElement>(null);
  const sombra = useRef<HTMLSpanElement>(null);
  const eu = useRef<HTMLSpanElement>(null);
  const opp = useRef<HTMLSpanElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const placarDoRali = useRef<HTMLSpanElement>(null);
  const anims = useRef<Animation[]>([]);
  const A = useRef<Ponto>({ x: 0, y: 0, s: 0.42 });
  const B = useRef<Ponto>({ x: 0, y: 0, s: 1.12 });

  const trava = useRef(true);
  const fim = useRef(0);
  const restoRef = useRef(base * 1000);
  const raliRef = useRef(0);
  const valorRef = useRef('');
  const comDica = useRef(false);
  const inicioDaBola = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };
  const escrever = (v: string) => {
    valorRef.current = v;
    setValor(v);
  };

  /* ---- A bola (`jogos3.js:40-59`) ---- */
  const parar = () => {
    for (const a of anims.current) {
      a.finished.catch(() => undefined);
      a.cancel();
    }
    anims.current = [];
  };
  /** Onde a bola está agora (para devolver de onde ela estiver, sem salto). */
  const aqui = (): Ponto => {
    const t = new DOMMatrix(bola.current ? getComputedStyle(bola.current).transform : undefined);
    return { x: t.m41, y: t.m42, s: t.a };
  };
  const voar = (de: Ponto, para: Ponto, ms: number, alto: number) => {
    parar();
    if (!bola.current || !sombra.current || !miolinho.current) return;
    const o: KeyframeAnimationOptions = { duration: ms, easing: 'linear', fill: 'forwards' };
    anims.current = [
      bola.current.animate([{ transform: kf(de) }, { transform: kf(para) }], o),
      sombra.current.animate([{ transform: kf(de) }, { transform: kf(para) }], o),
      miolinho.current.animate(
        [
          { transform: 'translateY(0)' },
          { transform: `translateY(${-alto}px)`, offset: 0.5 },
          { transform: 'translateY(0)' },
        ],
        { duration: ms, easing: 'ease-in-out', fill: 'forwards' },
      ),
    ];
  };
  const bater = (r: HTMLElement | null) => {
    if (r && !reduz())
      r.animate([{ rotate: '-46deg' }, { rotate: '34deg', offset: 0.55 }, { rotate: '0deg' }], {
        duration: 300,
        easing: 'ease-out',
      });
  };

  const registrar = (correct: boolean, revealed = false) => {
    if (!item) return null;
    outcomes.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct,
      attempts: 1,
      ms: Date.now() - inicioDaBola.current,
      hinted: comDica.current,
      ...(revealed ? { revealed: true } : {}),
    });
    return recontar(outcomes.current);
  };

  const proxima = () => {
    setMsg(null);
    if (i + 1 >= items.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'tenis',
          items: todos,
          score: scoreRound('tenis', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return;
    }
    setI((n) => n + 1);
  };

  /* ---- O saque (`jogos3.js:74-107`) ---- */
  useEffect(() => {
    if (!suficiente || !item || !ativo || finalizou.current || !trava.current) return;
    /* A primeira bola espera meio segundo, como no protótipo (`jogos3.js:171`). */
    const t = window.setTimeout(
      () => {
        const q = quadra.current;
        if (!q) return;
        trava.current = false;
        comDica.current = false;
        inicioDaBola.current = Date.now();
        const seg = Math.max(Math.ceil(base / 2), base - raliRef.current);
        const fx = [0.32, 0.5, 0.68][Math.floor(Math.random() * 3)];
        const [w, h] = [q.clientWidth, q.clientHeight];
        A.current = { x: w * (0.5 + (fx - 0.5) * 0.4), y: h * 0.4, s: 0.42 };
        B.current = { x: w * fx, y: h * 0.88, s: 1.12 };
        if (opp.current) opp.current.style.left = A.current.x + 16 + 'px';
        if (eu.current) eu.current.style.left = B.current.x + 30 + 'px';
        escrever(nivel === 'facil' ? item.answer[0] : '');
        if (!semTeclado) campo.current?.focus({ preventScroll: true });
        bater(opp.current);
        sentir('quique'); /* `jogos3.js:91` */
        /* A bola é o relógio: sai da raquete do adversário e chega à sua no tempo que você tem. */
        voar(A.current, B.current, seg * 1000, h * 0.3);
        fim.current = performance.now() + seg * 1000;
        restoRef.current = seg * 1000;
        setTotal(seg * 1000);
        setResto(seg * 1000);
        setSaques((n) => n + 1);
      },
      i === 0 ? 500 : 0,
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, ativo, suficiente]);

  /* ---- O relógio da bola, que para junto com a rodada (`jogos3.js:169`) ---- */
  useEffect(() => {
    if (acabou || saques === 0) return;
    if (!ativo) {
      if (trava.current) return;
      restoRef.current = Math.max(0, fim.current - performance.now());
      for (const a of anims.current) a.pause();
      return () => {
        fim.current = performance.now() + restoRef.current;
        for (const a of anims.current) a.play();
      };
    }
    const passo = window.setInterval(() => {
      if (trava.current) return;
      const r = fim.current - performance.now();
      restoRef.current = r;
      setResto(Math.max(0, r));
      if (r > 0) return;
      /* A bola caiu (`jogos3.js:94-106`). */
      trava.current = true;
      raliRef.current = 0;
      setRali(0);
      setEle((n) => n + 1);
      sentir('quique'); /* `jogos3.js:99` */
      const de = aqui();
      voar(de, { x: de.x, y: (quadra.current?.clientHeight ?? 0) * 1.2, s: 1.3 }, 420, 26);
      setMsg({ rotulo: 'A bola caiu na quadra. Era:', era: alvo });
      registrar(false, true);
      celebrar({ tipo: 'erro', el: quadra.current });
      falar(alvo, item?.lang ?? '');
      depois(1700, proxima);
    }, 100);
    return () => window.clearInterval(passo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, saques, acabou]);

  /* ---- A devolução (`jogos3.js:108-131`) ---- */
  const devolver = (v = valorRef.current) => {
    if (trava.current || !v || !item) return;
    trava.current = true;
    const de = aqui();
    bater(eu.current);
    sentir('quique'); /* `jogos3.js:114` */
    if (semAcento(v) === semAcento(alvo) && v.length === alvo.length) {
      raliRef.current += 1;
      setRali(raliRef.current);
      setVoce((n) => n + 1);
      voar(de, A.current, 460, 70);
      const p = registrar(true);
      celebrar({ tipo: 'acerto', combo: p?.sequencia ?? 0, el: eu.current, pontos: p?.ganho });
      falar(alvo, item.lang);
      depois(560, proxima);
      return;
    }
    raliRef.current = 0;
    setRali(0);
    setEle((n) => n + 1);
    voar(de, { x: (quadra.current?.clientWidth ?? 0) * 1.2, y: de.y - 60, s: 0.7 }, 480, 40);
    setMsg({ rotulo: 'Fora! Era:', era: alvo });
    registrar(false);
    celebrar({ tipo: 'erro', el: quadra.current });
    falar(alvo, item.lang);
    depois(1700, proxima);
  };

  /** O que foi digitado vira o valor das casas: só letras contam; o que não é letra entra sozinho. */
  const receber = (digitado: string) => {
    if (trava.current) return;
    let v = '';
    for (const c of digitado) {
      while (v.length < alvo.length && !ehLetra(alvo[v.length])) v += alvo[v.length];
      if (v.length >= alvo.length) break;
      if (!ehLetra(c)) continue;
      /* Certa (com ou sem acento): fica a letra da palavra. Errada: fica o que foi digitado. */
      v += semAcento(c) === semAcento(alvo[v.length]) ? alvo[v.length] : c.toLowerCase();
    }
    while (v.length < alvo.length && v.length > 0 && !ehLetra(alvo[v.length])) v += alvo[v.length];
    escrever(v);
    sentir('tecla'); /* `jogos3.js:135` */
    if (v === alvo) return devolver(v);
    const errada = [...v].findIndex((c, x) => c !== alvo[x]);
    if (errada < 0) return;
    sentir('erro'); /* `jogos3.js:141` */
    /* Letra errada: fica vermelha um instante e sai sozinha. Não precisa apagar (`jogos3.js:138-147`). */
    depois(380, () => {
      if (valorRef.current !== v || trava.current) return;
      escrever(v.slice(0, errada));
    });
  };

  /* Sem foco no campo (clicou fora): a tecla vale do mesmo jeito (`jogos3.js:150-159`). */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!ativo || e.ctrlKey || e.metaKey || e.altKey) return;
      const emCampo = e.target === campo.current;
      if (e.key === 'Enter') {
        e.preventDefault();
        return devolver();
      }
      if (emCampo || trava.current) return;
      if ([...e.key].length === 1 && ehLetra(e.key)) receber(valorRef.current + e.key);
      else if (e.key === 'Backspace') receber(valorRef.current.slice(0, -1));
      else return;
      /* A tecla já foi contada aqui: sem isto, o campo que acaba de ganhar o foco a escreveria de novo. */
      e.preventDefault();
      campo.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, i, alvo]);

  /* O rali que sobe dá um pulo (`jogos3.js:67`). */
  useEffect(() => {
    if (rali && placarDoRali.current && polido() && !reduz())
      anima(
        placarDoRali.current,
        [{ transform: 'scale(1)' }, { transform: 'scale(1.3) rotate(-5deg)' }, { transform: 'scale(1)' }],
        {
          d: 520,
          e: MOLA,
        },
      );
  }, [rali]);

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);
  /* A bola nova começa travada até o saque; e nada fica correndo depois de sair da tela. */
  useEffect(() => {
    trava.current = true;
  }, [i]);
  useEffect(
    () => () => {
      parar();
      esperas.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const usarDica = useCallback(() => {
    if (trava.current || dicas <= 0 || !alvo) return;
    setDicas((n) => n - 1);
    comDica.current = true;
    escrever(alvo[0]);
    if (!semTeclado) campo.current?.focus({ preventScroll: true });
  }, [dicas, alvo, semTeclado]);

  if (!suficiente) return null;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={rali}
        acertos={placar.acertos}
        rotulo={`${outcomes.current.length} de ${items.length} bolas`}
        tempo={resto / 1000}
        progresso={resto / Math.max(1, total)}
        feito={outcomes.current.length / Math.max(1, items.length)}
        pouco={resto <= Math.min(10000, total * 0.34)}
        tourDoTempo="relogio"
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Primeira letra"
              resta={dicas}
              title="Conta como dica: zera o combo"
              data-ajuda="letra"
              onClick={usarDica}
            />
            <AjudasGerais
              jogo="tenis"
              parado={!ativo || acabou || !!msg}
              aoGanharTempo={(s) => {
                if (trava.current) return;
                fim.current += s * 1000;
                const r = fim.current - performance.now();
                restoRef.current = r;
                setTotal((t) => Math.max(t, r));
                setResto(r);
                /* +10 s: a bola ganha ar (`jogos3.js:168`). */
                voar(aqui(), B.current, Math.max(400, r), 30);
                if (!semTeclado) campo.current?.focus({ preventScroll: true });
              }}
              resposta={() => alvo || null}
              aoVerResposta={() => {
                comDica.current = true;
                raliRef.current = 0;
                setRali(0);
              }}
            />
          </>
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <div className="rl-arena">
          <div className="rl-placar" aria-label="Placar do rali">
            <span>
              <small>Você</small>
              <b data-voce>{voce}</b>
            </span>
            <span ref={placarDoRali} className={`rl-rali${rali >= 2 ? ' quente' : ''}`}>
              <b>
                <Flame data-pj-i="" aria-hidden />
                <i data-rali style={{ fontStyle: 'normal' }}>
                  {rali}
                </i>
              </b>
              <small>rali</small>
            </span>
            <span>
              <small>Babel</small>
              <b data-ele>{ele}</b>
            </span>
          </div>
          {/* Tocar na quadra chama o teclado (`jogos3.js:149`). */}
          <div ref={quadra} className="rl-quadra" onClick={() => campo.current?.focus({ preventScroll: true })}>
            <svg className="rl-chao" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id="rl-corte">
                  <polygon points="26,0 74,0 98,64 2,64" />
                </clipPath>
              </defs>
              <g clipPath="url(#rl-corte)">
                <rect className="g1" width="100" height="64" />
                <rect className="g2" y="5" width="100" height="7" />
                <rect className="g2" y="20" width="100" height="10" />
                <rect className="g2" y="40" width="100" height="12" />
              </g>
              <g className="ln">
                <polygon points="26,0 74,0 98,64 2,64" />
                <line x1="32" y1="0" x2="14" y2="64" />
                <line x1="68" y1="0" x2="86" y2="64" />
                <line x1="28.6" y1="12" x2="71.4" y2="12" />
                <line x1="19.6" y1="44" x2="80.4" y2="44" />
                <line x1="50" y1="12" x2="50" y2="44" />
              </g>
            </svg>
            <span ref={opp} className="rl-raq ele" />
            <div className="rl-rede" />
            <span ref={sombra} className="rl-sombra" />
            <span ref={bola} className="rl-bola">
              <i ref={miolinho} />
            </span>
            <span ref={eu} className="rl-raq eu" />
            <div className="rl-pista">
              <small>Devolva escrevendo</small>
              <b>{item?.prompt}</b>
            </div>
            <p className="rl-msg" role="status">
              {msg && (
                <>
                  {msg.rotulo} <b>{msg.era}</b>
                </>
              )}
            </p>
          </div>
          <div className="rl-digita">
            <div className="rl-letras" aria-hidden="true">
              {[...alvo].map((c, k) => (
                <span key={k} className={valor[k] ? (valor[k] === c ? 'ok' : 'no') : k === valor.length ? 'vez' : ''}>
                  {valor[k] || ''}
                </span>
              ))}
            </div>
            <input
              ref={campo}
              className="rl-campo"
              type="text"
              aria-label="Sua devolução"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              lang={item?.lang}
              maxLength={alvo.length || undefined}
              value={valor}
              onChange={(e) => receber(e.target.value)}
            />
          </div>
          <p className="rl-dica">Enter devolve antes de completar. Tocar na quadra chama o teclado.</p>
        </div>
      </div>
    </>
  );
}
