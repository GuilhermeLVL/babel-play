import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { entraNaGrade, letrasNaGrade, scoreRound } from '@core';
import { Radar, Search } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { type Direcao, regrasDoJogo, vezesDaAjuda } from '../../core/minigames/regras';
import { celebrar } from '../../lib/comemoracao';
import { useNivelDoJogo } from '../../lib/jogos/nivelDoJogo';
import { flutuar, tremer } from '../../lib/polimento/jogos';
import { play } from '../../lib/soundFx';
import AjudasGerais from './casca/AjudasGerais';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from './casca/HudDaRodada';
import { falarNoJogo as falar } from './noQuest';
import { textosDoJogo } from './polimento/textos';

/**
 * CAÇA-PALAVRAS — o tabuleiro do protótipo (`jogos.js:534-637`): a grade à esquerda, a lista de
 * significados à direita, e o traço por arrasto (horizontal, vertical ou diagonal).
 *
 * As regras e os números são os do protótipo. O que é do app: as palavras (as suas), a nota de revisão
 * de cada uma e o placar comum. Duas adaptações às palavras de verdade:
 *   - a grade cresce quando a maior palavra não cabe em 8 (o protótipo só usa palavras de até 6 letras);
 *   - a letra com acento vai para a grade como é, e entra no sorteio do preenchimento (sozinha na grade,
 *     ela entregaria a palavra).
 * E uma do aparelho: tocar na primeira letra e depois na última também traça (no headset não há arrasto).
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

interface Palavra {
  /** O índice em `items`. */
  i: number;
  w: string;
  pt: string;
  cel: number[];
}

const PREENCHIMENTO = 'ABCDEFGHILMNOPRSTUW';
const rand = (n: number) => Math.floor(Math.random() * n);

function emb<T>(a: readonly T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** A grade (`jogos.js:541-561`): cada palavra tenta até 300 lugares nas direções do nível. */
function montar(items: MinigameItem[], direcoes: readonly Direcao[]) {
  const itens = items
    .map((it, i) => ({ i, w: letrasNaGrade(it.answer), pt: it.prompt }))
    .filter((it) => entraNaGrade(it.w));
  const N = Math.max(8, Math.min(14, Math.max(0, ...itens.map((it) => [...it.w].length))));
  const g: string[] = Array(N * N).fill('');
  const jog: Palavra[] = [];
  for (const it of itens) {
    const letras = [...it.w];
    const L = letras.length;
    if (L > N) continue;
    for (let t = 0; t < 300; t++) {
      const [dr, dc] = direcoes[rand(direcoes.length)];
      const r0 = dr < 0 ? L - 1 + rand(N - L + 1) : rand(N - dr * (L - 1));
      const c0 = dc < 0 ? L - 1 + rand(N - L + 1) : rand(N - dc * (L - 1));
      const cel = letras.map((_, k) => (r0 + dr * k) * N + c0 + dc * k);
      if (cel.every((p, k) => !g[p] || g[p] === letras[k])) {
        cel.forEach((p, k) => (g[p] = letras[k]));
        jog.push({ ...it, cel });
        break;
      }
    }
  }
  const acentos = [...new Set(jog.flatMap((x) => [...x.w]).filter((l) => !/[A-Z]/.test(l)))];
  const alfabeto = [...PREENCHIMENTO, ...acentos];
  g.forEach((c, i) => c || (g[i] = alfabeto[rand(alfabeto.length)]));
  return { N, g, jog };
}

export default function CacaPalavrasDoPrototipo({ items, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('wordsearch');
  const nivel = useNivelDoJogo('wordsearch');
  const regras = regrasDoJogo('wordsearch', nivel);
  const textos = textosDoJogo('wordsearch');

  // eslint-disable-next-line react-hooks/exhaustive-deps -- a grade é sorteada UMA vez por rodada
  const { N, g, jog } = useMemo(() => montar(items, regras.direcoes), [items]);

  const [sel, setSel] = useState<number[]>([]);
  const [achadas, setAchadas] = useState<ReadonlySet<number>>(new Set());
  const [dica, setDica] = useState<number[]>([]);
  const [sequencia, setSequencia] = useState(0);
  const [radares, setRadares] = useState(() => vezesDaAjuda('wordsearch', 'radar', nivel));

  const grade = useRef<HTMLDivElement>(null);
  const ini = useRef(-1);
  /** A primeira ponta marcada por toque, à espera da última. */
  const ponta = useRef(-1);
  const selRef = useRef<number[]>([]);
  const ok = useRef(new Set<number>());
  const seq = useRef(0);
  const comDica = useRef(false);
  const inicio = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };
  useEffect(() => () => esperas.current.forEach((t) => window.clearTimeout(t)), []);

  const celula = (i: number) => grade.current?.querySelector<HTMLElement>(`[data-c="${i}"]`) ?? null;

  /* `reta`, `jogos.js:567-573`: só linha reta (horizontal, vertical ou diagonal perfeita). */
  const reta = (a: number, b: number): number[] | null => {
    const [r0, c0, r1, c1] = [Math.floor(a / N), a % N, Math.floor(b / N), b % N];
    const [dr, dc] = [r1 - r0, c1 - c0];
    if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return null;
    const n = Math.max(Math.abs(dr), Math.abs(dc));
    return Array.from({ length: n + 1 }, (_, k) => (r0 + Math.sign(dr) * k) * N + c0 + Math.sign(dc) * k);
  };
  const marcar = (lista: number[]) => {
    if (lista.length !== selRef.current.length && lista.length > 1) play('click');
    selRef.current = lista;
    setSel(lista);
  };

  /* `soltar`, `jogos.js:580-607`. */
  const conferir = (era: number[]) => {
    const chave = era.join(',');
    const it = jog.find(
      (x) => !ok.current.has(x.i) && (x.cel.join(',') === chave || [...x.cel].reverse().join(',') === chave),
    );
    if (it) {
      ok.current.add(it.i);
      setAchadas(new Set(ok.current));
      setDica((d) => d.filter((c) => !it.cel.includes(c)));
      const comAjuda = comDica.current;
      comDica.current = false;
      seq.current = comAjuda ? 0 : seq.current + 1;
      setSequencia(seq.current);
      const item = items[it.i];
      outcomes.current.push({
        cardId: item.cardId,
        itemRef: item.answer,
        correct: true,
        attempts: 1,
        ms: Date.now() - inicio.current,
        hinted: comAjuda,
      });
      const p = recontar(outcomes.current);
      celebrar({
        tipo: 'acerto',
        combo: seq.current,
        el: celula(it.cel[Math.floor(it.cel.length / 2)]),
        pontos: p.ganho,
      });
      falar(item.answer, item.lang);
      if (ok.current.size < jog.length || finalizou.current) return;
      finalizou.current = true;
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'wordsearch',
          items: todos,
          score: scoreRound('wordsearch', todos),
          durationMs: Date.now() - inicio.current,
        }),
      );
    } else if (era.length > 1) {
      /* Traço errado: zera o combo, treme a grade e diz "Tente de novo". Não conta erro. */
      seq.current = 0;
      setSequencia(0);
      play('error');
      tremer(grade.current);
      flutuar(celula(era[era.length - 1]), 'Tente de novo', 'erro');
    }
  };
  const soltar = () => {
    if (ini.current < 0) return;
    ini.current = -1;
    const era = selRef.current;
    /* Um toque só: é a primeira ponta; o toque seguinte, noutra letra, fecha o traço. */
    if (era.length === 1) {
      const de = ponta.current;
      if (de < 0 || de === era[0]) {
        ponta.current = de === era[0] ? -1 : era[0];
        if (ponta.current < 0) marcar([]);
        return;
      }
      ponta.current = -1;
      const l = reta(de, era[0]);
      marcar([]);
      if (l) conferir(l);
      return;
    }
    ponta.current = -1;
    marcar([]);
    conferir(era);
  };

  /* `pj.ajuda`, `jogos.js:628-635`: o Radar faz as duas pontas de uma palavra piscarem. De graça. */
  const radar = () => {
    if (!ativo || finalizou.current || radares <= 0) return;
    const it = emb(jog.filter((x) => !ok.current.has(x.i)))[0];
    if (!it) return;
    const pontas = [it.cel[0], it.cel[it.cel.length - 1]];
    setDica((d) => [...d, ...pontas]);
    flutuar(celula(pontas[0]), 'achei as pontas', '');
    depois(4000, () => setDica((d) => d.filter((c) => !pontas.includes(c))));
    setRadares((n) => n - 1);
  };

  /** A ordem de cada célula dentro da palavra achada (`--k`, o atraso da animação). */
  const ordem = useMemo(() => {
    const m = new Map<number, number>();
    for (const it of jog) if (achadas.has(it.i)) it.cel.forEach((c, k) => m.set(c, k));
    return m;
  }, [jog, achadas]);

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={sequencia}
        acertos={achadas.size}
        rotulo={`${achadas.size} de ${jog.length} palavras`}
        progresso={achadas.size / Math.max(1, jog.length)}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Radar}
              rotulo="Radar"
              resta={radares}
              title="De graça"
              data-ajuda="radar"
              onClick={radar}
            />
            <AjudasGerais
              jogo="wordsearch"
              parado={!ativo || finalizou.current}
              resposta={() => jog.find((x) => !ok.current.has(x.i))?.w ?? null}
              aoVerResposta={() => {
                comDica.current = true;
                seq.current = 0;
                setSequencia(0);
              }}
            />
          </>
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <div className="caca">
          <div
            ref={grade}
            className="grade-caca"
            style={{ '--n': N } as React.CSSProperties}
            onPointerDown={(e) => {
              const c = (e.target as Element).closest<HTMLElement>('[data-c]');
              if (!c || !ativo || finalizou.current) return;
              e.preventDefault();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* ponteiro sintético */
              }
              ini.current = Number(c.dataset.c);
              marcar([ini.current]);
            }}
            onPointerMove={(e) => {
              if (ini.current < 0) return;
              const c = document.elementFromPoint(e.clientX, e.clientY)?.closest?.<HTMLElement>('.grade-caca [data-c]');
              const l = c && reta(ini.current, Number(c.dataset.c));
              if (l) marcar(l);
            }}
            onPointerUp={soltar}
            onPointerCancel={() => {
              ini.current = -1;
              ponta.current = -1;
              marcar([]);
            }}
          >
            {g.map((c, i) => {
              const k = ordem.get(i);
              const classe = [sel.includes(i) && 'sel', k !== undefined && 'achada', dica.includes(i) && 'dica']
                .filter(Boolean)
                .join(' ');
              return (
                <span
                  key={i}
                  data-c={i}
                  className={classe || undefined}
                  style={k === undefined ? undefined : ({ '--k': k } as React.CSSProperties)}
                >
                  {c}
                </span>
              );
            })}
          </div>
          <div>
            <span className="label-mono">Ache a palavra que significa:</span>
            <ul className="pistas">
              {jog.map((it, k) => (
                <li key={it.i} data-k={k} className={achadas.has(it.i) ? 'feita' : undefined}>
                  <Search data-pj-i="" aria-hidden />
                  <span>
                    {it.pt}
                    {regras.pistaComInicial && (
                      <>
                        {' '}
                        <em className="pj-ini">{[...it.w][0]}…</em>
                      </>
                    )}
                  </span>
                  {achadas.has(it.i) && <b>{it.w}</b>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
