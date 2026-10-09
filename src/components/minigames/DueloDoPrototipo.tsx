import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { distractorsFor, scoreRound } from '@core';
import { Scissors } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { regrasDoJogo, vezesDaAjuda } from '../../core/minigames/regras';
import { celebrar } from '../../lib/comemoracao';
import { t } from '../../lib/i18n';
import { useNivelDoJogo } from '../../lib/jogos/nivelDoJogo';
import { flutuar, palcoDaRodada, selo } from '../../lib/polimento/jogos';
import { sentir } from '../../lib/polimento/sentidos';
import AjudasGerais from './casca/AjudasGerais';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from './casca/HudDaRodada';
import { falarNoJogo as falar } from './noQuest';
import { textosDoJogo } from './polimento/textos';

/**
 * DUELO RELÂMPAGO — o tabuleiro do protótipo (`jogos.js:724-790`): o significado em letras grandes, as
 * alternativas com as teclas 1 a 4, e o relógio da rodada, que ganha tempo no acerto rápido e perde 2 s
 * no erro. Oito acertos seguidos ligam o FEVER.
 *
 * As regras e os números são os do protótipo. O que é do app: as palavras (as suas), os distratores
 * (palavras de verdade do mesmo idioma), a nota de revisão de cada uma e o placar comum. A contagem
 * 3-2-1 é da casca; até ela acabar o palco diz "Prepare-se".
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Oito acertos seguidos ligam o FEVER (`jogos.js:750, 757`). */
const FEVER = 8;

function emb<T>(a: readonly T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export default function DueloDoPrototipo({ items, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('blitz');
  const nivel = useNivelDoJogo('blitz');
  const regras = regrasDoJogo('blitz', nivel);
  const textos = textosDoJogo('blitz');
  const duracao = regras.segundos * 1000;

  const [i, setI] = useState(0);
  /** A rodada começou: a contagem acabou e a primeira pergunta está na mesa. */
  const [comecou, setComecou] = useState(false);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [fora, setFora] = useState<string[]>([]);
  const [sequencia, setSequencia] = useState(0);
  const [resto, setResto] = useState(duracao);
  const [total, setTotal] = useState(duracao);
  const [cortes, setCortes] = useState(() => vezesDaAjuda('blitz', 'cortar', nivel));
  const [acabou, setAcabou] = useState(false);

  const item = items[i] as MinigameItem | undefined;
  /* `distr`, `jogos.js:82`: a certa e os distratores do nível, embaralhados UMA vez por pergunta. */
  const opcoes = useMemo(
    () => (item ? emb([item.answer, ...distractorsFor(item, items, regras.alternativas - 1)]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por pergunta
    [item, items],
  );

  const miolo = useRef<HTMLDivElement>(null);
  const trava = useRef(true);
  const fim = useRef(0);
  const totalRef = useRef(duracao);
  const restoRef = useRef(duracao);
  const ultimoTique = useRef(99);
  const t0 = useRef(0);
  const cortou = useRef(false);
  const seq = useRef(0);
  const comDica = useRef(false);
  const inicio = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };
  useEffect(
    () => () => {
      esperas.current.forEach((x) => window.clearTimeout(x));
      palcoDaRodada()?.classList.remove('fever', 'tenso');
    },
    [],
  );

  /** `pjFim` (`jogos.js:296-303`): 200 ms quando o tempo acaba, 900 ms depois da última jogada. */
  const encerrar = (ja: boolean) => {
    if (finalizou.current) return;
    finalizou.current = true;
    trava.current = true;
    setAcabou(true);
    palcoDaRodada()?.classList.remove('fever', 'tenso');
    const todos = outcomes.current;
    depois(ja ? 200 : 900, () =>
      onFinish({
        gameId: 'blitz',
        items: todos,
        score: scoreRound('blitz', todos),
        durationMs: Date.now() - inicio.current,
      }),
    );
  };

  /* O relógio da rodada (`pjRelogio`, `jogos.js:251-275`). Começa quando a contagem acaba e para com a rodada. */
  useEffect(() => {
    if (acabou) return;
    if (!ativo) {
      if (!comecou) return;
      restoRef.current = Math.max(0, fim.current - performance.now());
      return () => {
        fim.current = performance.now() + restoRef.current;
      };
    }
    if (!comecou) {
      trava.current = false;
      inicio.current = Date.now();
      t0.current = performance.now();
      fim.current = performance.now() + duracao;
      setComecou(true);
    }
    const passo = window.setInterval(() => {
      const r = Math.max(0, fim.current - performance.now());
      restoRef.current = r;
      setResto(r);
      const s = Math.ceil(r / 1000);
      const pouco = r <= Math.min(10000, totalRef.current * 0.34);
      palcoDaRodada()?.classList.toggle('tenso', pouco);
      if (pouco && s < ultimoTique.current && r > 0) sentir('tique', 'tick');
      ultimoTique.current = pouco ? s : 99;
      if (r <= 0) encerrar(true);
    }, 100);
    return () => window.clearInterval(passo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, comecou, acabou]);

  /* `escolher`, `jogos.js:739-769`. */
  const escolher = (op: string | undefined, b: HTMLElement | null) => {
    if (trava.current || !item || !op || fora.includes(op)) return;
    trava.current = true;
    setEscolhida(op);
    const ok = op === item.answer;
    const ms = performance.now() - t0.current;
    const dica = comDica.current || cortou.current;
    comDica.current = false;
    outcomes.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct: ok,
      attempts: 1,
      ms: Math.round(ms),
      hinted: dica,
    });
    const p = recontar(outcomes.current);
    if (ok) {
      seq.current = dica ? 0 : seq.current + 1;
      setSequencia(seq.current);
      celebrar({ tipo: 'acerto', combo: seq.current, el: b, pontos: p.ganho });
      falar(item.answer, item.lang);
      /* Acerto rápido devolve tempo: 2 s até 1,5 s, 1 s até 3 s; o relógio nunca passa do total. */
      const ganho = ms < 1500 ? 2 : ms < 3000 ? 1 : 0;
      if (ganho) {
        fim.current = Math.min(fim.current + ganho * 1000, performance.now() + totalRef.current);
        flutuar(document.querySelector('#palco [data-pj="relogio"]'), `+${ganho}s`, 'good');
      }
      if (seq.current === FEVER) {
        selo('FEVER ×2', 'fever');
        palcoDaRodada()?.classList.add('fever');
      }
    } else {
      seq.current = 0;
      setSequencia(0);
      palcoDaRodada()?.classList.remove('fever');
      celebrar({ tipo: 'erro', el: b });
      flutuar(b, '−2s', 'erro');
      fim.current -= 2000;
    }
    depois(ok ? 420 : 650, () => {
      if (finalizou.current) return;
      if (i + 1 >= items.length) return encerrar(false);
      cortou.current = false;
      t0.current = performance.now();
      setEscolhida(null);
      setFora([]);
      setI((n) => n + 1);
      trava.current = false;
    });
  };

  /* As teclas 1 a 4 (`pj.tecla`, `jogos.js:771`). */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!ativo || e.ctrlKey || e.metaKey || e.altKey || !/^[1-4]$/.test(e.key)) return;
      const b = miolo.current?.querySelectorAll<HTMLButtonElement>('.opcoes-blitz button')[Number(e.key) - 1];
      if (b && !b.disabled) escolher(b.dataset.op, b);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, i, fora, item]);

  /* `pj.ajuda`, `jogos.js:772-780`: uma vez por pergunta, tira alternativas erradas. Custa: zera o combo. */
  const cortar = () => {
    if (trava.current || !item || cortou.current || cortes <= 0) return;
    cortou.current = true;
    setFora(emb(opcoes.filter((x) => x !== item.answer)).slice(0, regras.cortadas));
    flutuar(miolo.current?.querySelector('.opcoes-blitz'), 'sobraram 2', '');
    seq.current = 0;
    comDica.current = true;
    setSequencia(0);
    setCortes((n) => n - 1);
  };

  const feitos = outcomes.current.length;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={sequencia}
        acertos={placar.acertos}
        rotulo={`${Math.min(feitos, items.length)} de ${items.length} palavras`}
        tempo={comecou && !acabou ? resto / 1000 : undefined}
        progresso={comecou ? resto / Math.max(1, total) : feitos / Math.max(1, items.length)}
        feito={feitos / Math.max(1, items.length)}
        pouco={resto <= Math.min(10000, total * 0.34)}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Scissors}
              rotulo="Cortar 2"
              resta={cortes}
              title="Conta como dica: zera o combo"
              data-ajuda="cortar"
              onClick={cortar}
            />
            <AjudasGerais
              jogo="blitz"
              parado={!ativo || acabou}
              aoGanharTempo={(s) => {
                if (!comecou || finalizou.current) return false;
                fim.current += s * 1000;
                totalRef.current = Math.max(totalRef.current, fim.current - performance.now());
                setTotal(totalRef.current);
                setResto(Math.max(0, fim.current - performance.now()));
              }}
              resposta={() => (comecou ? (item?.answer ?? null) : null)}
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
      <div ref={miolo} className="pj-miolo">
        {!comecou || !item ? (
          <div className="blitz-palavra">
            <span className="label-mono">Prepare-se</span>
            <b>···</b>
          </div>
        ) : (
          <>
            <div className="blitz-palavra" key={i}>
              <span className="label-mono">{item.clozed ? t('Complete a frase') : 'Que palavra é'}</span>
              <b>{item.prompt}</b>
            </div>
            <div className="opcoes-blitz" key={`o${i}`}>
              {opcoes.map((op, k) => (
                <button
                  key={op}
                  type="button"
                  data-op={op}
                  className={
                    [
                      escolhida !== null && op === item.answer && 'certa',
                      escolhida === op && op !== item.answer && 'errada',
                      fora.includes(op) && 'pj-fora',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  disabled={escolhida !== null || acabou || fora.includes(op)}
                  style={{ '--i': k } as React.CSSProperties}
                  onClick={(e) => escolher(op, e.currentTarget)}
                >
                  <kbd>{k + 1}</kbd>
                  {op}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
