import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { scoreRound } from '@core';
import { Eye } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { regrasDoJogo, vezesDaAjuda } from '../../core/minigames/regras';
import { celebrar } from '../../lib/comemoracao';
import { useNivelDoJogo } from '../../lib/jogos/nivelDoJogo';
import { anima, limpar, MOLA_SUAVE, polido, reduz } from '../../lib/polimento/base';
import { centro, tremer } from '../../lib/polimento/jogos';
import { play } from '../../lib/soundFx';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from './casca/HudDaRodada';
import { falarNoJogo as falar } from './noQuest';
import { textosDoJogo } from './polimento/textos';

/**
 * MEMÓRIA — o tabuleiro do protótipo (`jogos5.js:44-111`; o giro é `girar`, `prototipo.js:1011-1025`).
 * Dezesseis cartas (doze no Fácil) saem de um monte embaixo da mesa; duas viradas por vez; o par fica
 * aberto e o que não combina treme e fecha sozinho.
 *
 * As regras e os números são os do protótipo. O que é do app: as palavras (as suas), a nota de revisão
 * de cada par e o placar comum da rodada.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

interface Carta {
  id: string;
  /** O par a que a carta pertence (`data-par`). */
  k: number;
  t: string;
  /** A palavra do par, que é a que se ouve ao fechar (`data-en`). */
  en: string;
}

/** `emb` de `jogos.js:72-79`. */
function emb<T>(a: readonly T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export default function MemoriaDoPrototipo({ items, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('memory');
  const nivel = useNivelDoJogo('memory');
  const regras = regrasDoJogo('memory', nivel);
  const textos = textosDoJogo('memory');

  /* `jogos5.js:50-52`: os pares do nível, e as cartas embaralhadas UMA vez por rodada. */
  const pares = useMemo(() => items.slice(0, regras.pares), [items, regras.pares]);
  const cartas = useMemo<Carta[]>(
    () =>
      emb(
        pares.flatMap((it, k) => [
          { id: `p${k}`, k, t: it.answer, en: it.answer },
          { id: `t${k}`, k, t: it.prompt, en: it.answer },
        ]),
      ),
    [pares],
  );
  const total = pares.length;

  /** As cartas com a face à vista (viradas agora, espiadas ou de par fechado). */
  const [viradas, setViradas] = useState<ReadonlySet<string>>(new Set());
  const [fechados, setFechados] = useState<ReadonlySet<number>>(new Set());
  const [sequencia, setSequencia] = useState(0);
  const [espiadas, setEspiadas] = useState(() => vezesDaAjuda('memory', 'espiar', nivel));

  const mesa = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLButtonElement>());
  const vez = useRef(new Map<string, number>());
  const abertas = useRef<Carta[]>([]);
  const vistas = useRef(new Set<string>());
  const feitos = useRef(new Set<number>());
  const trava = useRef(false);
  const seq = useRef(0);
  const comDica = useRef(false);
  const tentativas = useRef(new Map<number, number>());
  const inicio = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };
  useEffect(() => () => esperas.current.forEach((t) => window.clearTimeout(t)), []);

  const face = (id: string, aberta: boolean) =>
    setViradas((v) => {
      const n = new Set(v);
      if (aberta) n.add(id);
      else n.delete(id);
      return n;
    });

  /**
   * `girar` (`prototipo.js:1011-1025`): a carta levanta e fecha até ficar de perfil, troca a face, abre e
   * pousa com mola. Se outro giro da mesma carta começar no meio, este desiste.
   */
  const girar = async (c: Carta, aberta: boolean) => {
    const n = (vez.current.get(c.id) ?? 0) + 1;
    vez.current.set(c.id, n);
    const el = els.current.get(c.id);
    if (!el || !polido() || reduz()) return face(c.id, aberta);
    play('select');
    try {
      await anima(el, [{ transform: 'rotateY(90deg) scale(1.14)' }], {
        d: 190,
        e: 'cubic-bezier(0.4, 0, 1, 1)',
        fill: 'forwards',
      }).finished;
    } catch {
      /* cancelada por um giro mais novo */
    }
    if (vez.current.get(c.id) !== n) return;
    face(c.id, aberta);
    limpar(el);
    anima(el, [{ transform: 'rotateY(-90deg) scale(1.14)' }, { transform: 'rotateY(0deg) scale(1)' }], {
      d: 520,
      e: MOLA_SUAVE,
    });
  };

  /* As cartas saem de um monte embaixo do tabuleiro, uma a uma (`jogos5.js:57-64`). */
  useEffect(() => {
    if (!mesa.current || !polido() || reduz()) return;
    const [mx, my] = centro(mesa.current);
    cartas.forEach((c, i) => {
      const el = els.current.get(c.id);
      if (!el) return;
      const [x, y] = centro(el);
      anima(
        el,
        [
          {
            opacity: 0,
            transform: `translate(${mx - x}px, ${my - y + 240}px) rotate(${(i % 2 ? 1 : -1) * (10 + i * 2)}deg) scale(0.5)`,
          },
          { opacity: 1, offset: 0.2 },
          { opacity: 1, transform: 'translate(0, 0) rotate(0deg) scale(1)' },
        ],
        { d: 700, atraso: 120 + i * 45, e: MOLA_SUAVE },
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez, ao montar a mesa
  }, []);

  const conta = (k: number) => tentativas.current.set(k, (tentativas.current.get(k) ?? 0) + 1);

  /** O par fechou (`pjAcerto`, `jogos.js:224-239`): a nota do par, o placar e o fim da rodada. */
  const acertar = (a: Carta, b: Carta) => {
    const dica = comDica.current;
    comDica.current = false;
    seq.current = dica ? 0 : seq.current + 1;
    setSequencia(seq.current);
    conta(a.k);
    feitos.current.add(a.k);
    setFechados(new Set(feitos.current));
    const it = pares[a.k];
    outcomes.current.push({
      cardId: it.cardId,
      itemRef: it.answer,
      correct: true,
      attempts: tentativas.current.get(a.k) ?? 1,
      ms: Date.now() - inicio.current,
      hinted: dica,
    });
    const p = recontar(outcomes.current);
    celebrar({ tipo: 'acerto', combo: seq.current, el: els.current.get(b.id) ?? null, pontos: p.ganho });
    falar(a.en, it.lang);
    if (feitos.current.size < total || finalizou.current) return;
    finalizou.current = true;
    const todos = outcomes.current;
    depois(900, () =>
      onFinish({
        gameId: 'memory',
        items: todos,
        score: scoreRound('memory', todos),
        durationMs: Date.now() - inicio.current,
      }),
    );
  };

  /* `pj.clique`, `jogos5.js:65-99`. */
  const clicar = (c: Carta) => {
    if (!ativo || trava.current || finalizou.current) return;
    if (abertas.current.includes(c) || viradas.has(c.id) || feitos.current.has(c.k)) return;
    abertas.current.push(c);
    void girar(c, true);
    if (abertas.current.length < 2) return;
    trava.current = true;
    const [a, b] = abertas.current;
    abertas.current = [];
    depois(regras.compararEmMs, () => {
      if (a.k === b.k) {
        trava.current = false;
        return acertar(a, b);
      }
      /* Só conta como erro quando a pessoa já tinha visto uma das duas: virar carta nova é explorar, não errar. */
      if (vistas.current.has(a.id) || vistas.current.has(b.id)) {
        if (vistas.current.has(a.id)) conta(a.k);
        if (vistas.current.has(b.id)) conta(b.k);
        seq.current = 0;
        comDica.current = false;
        setSequencia(0);
        celebrar({ tipo: 'erro', el: null });
      } else {
        seq.current = 0;
        setSequencia(0);
        play('close');
      }
      vistas.current.add(a.id).add(b.id);
      for (const x of [a, b]) tremer(els.current.get(x.id));
      /* As duas fecham sozinhas; no Fácil ficam abertas mais tempo para dar para guardar. */
      depois(regras.fecharErradoEmMs, () => {
        void girar(a, false);
        void girar(b, false);
        trava.current = false;
      });
    });
  };

  /* `pj.ajuda`, `jogos5.js:100-109`: Espiar abre todas as fechadas por um instante. Custa: zera o combo. */
  const espiar = () => {
    if (!ativo || trava.current || finalizou.current || espiadas <= 0) return;
    trava.current = true;
    const fechadas = cartas.filter((c) => !feitos.current.has(c.k) && !viradas.has(c.id));
    for (const c of fechadas) {
      void girar(c, true);
      vistas.current.add(c.id);
    }
    depois(regras.espiarMs, () => {
      for (const c of fechadas) if (!abertas.current.includes(c)) void girar(c, false);
      trava.current = false;
    });
    seq.current = 0;
    comDica.current = true;
    setSequencia(0);
    setEspiadas((n) => n - 1);
  };

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={sequencia}
        acertos={fechados.size}
        rotulo={`${fechados.size} de ${total} pares`}
        progresso={fechados.size / Math.max(1, total)}
        ajudas={
          <BotaoDeAjuda
            icone={Eye}
            rotulo="Espiar"
            resta={espiadas}
            title="Conta como dica: zera o combo"
            data-ajuda="espiar"
            onClick={espiar}
          />
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <div
          ref={mesa}
          className="tabuleiro w-full"
          aria-label="Tabuleiro"
          style={{ margin: 'auto', gridTemplateColumns: 'repeat(4,1fr)', maxWidth: 720 }}
        >
          {cartas.map((c, i) => {
            const par = fechados.has(c.k);
            const aberta = viradas.has(c.id);
            return (
              <button
                key={c.id}
                ref={(el) => {
                  if (el) els.current.set(c.id, el);
                  else els.current.delete(c.id);
                }}
                type="button"
                aria-label={aberta ? c.t : 'Carta virada'}
                className={`carta${aberta ? ' virada' : ''}${par ? ' par' : ''}`}
                data-texto={c.t}
                data-par={c.k}
                data-en={c.en}
                style={{ '--i': i } as React.CSSProperties}
                onClick={() => clicar(c)}
              >
                {aberta ? (
                  <span className="line-clamp-3 break-words" dir="ltr">
                    {c.t}
                  </span>
                ) : (
                  <span className="verso" aria-hidden="true">
                    ?
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
