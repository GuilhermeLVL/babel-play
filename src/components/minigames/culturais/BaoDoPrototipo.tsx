import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { Check, Lightbulb, Sprout } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { flushSync } from 'react-dom';

import { regrasDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { anima, EIO, polido, reduz } from '../../../lib/polimento/base';
import { tremer } from '../../../lib/polimento/jogos';
import { play } from '../../../lib/soundFx';
import AjudasGerais from '../casca/AjudasGerais';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar } from '../noQuest';
import { textosDoJogo, unidadeDoPlacar } from '../polimento/textos';

/**
 * BAO — a cena do protótipo (`jogos2.js:286-375`, `jogos.css:197-209`): a pista, a palavra sendo montada
 * (o que falta aparece em pontos) e as covas redondas com os pedaços fora de ordem.
 *
 * As regras e os números são os do protótipo: a palavra é cortada a cada 2 letras, com 3 a 6 pedaços;
 * 4, 3 ou 2 erros por palavra; a Dica semeia o próximo pedaço, uma vez por palavra. O que é do app: as
 * palavras e a nota de revisão de cada uma.
 *
 * Uma adaptação às palavras de verdade: a cova vale pelo TEXTO do pedaço, e não pelo lugar de onde ele
 * saiu. "BANANA" tem dois "NA", e no protótipo (que confere pelo índice) só um deles servia.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Palavra curta demais não tem o que remontar. */
const MIN_LETRAS = 3;

/** `emb` de `jogos.js:72-79`. */
function emb<T>(a: readonly T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** `partir` de `jogos2.js:295-306`: a cada 2 letras, com no mínimo 3 pedaços e no máximo 6. */
export function partirEmPedacos(palavra: string): string[] {
  const letras = [...palavra];
  const n = Math.max(3, Math.min(6, Math.ceil(letras.length / 2)));
  const out: string[] = [];
  for (let k = 0, p = 0; k < n; k++) {
    const tam = Math.ceil((letras.length - p) / (n - k));
    out.push(letras.slice(p, p + tam).join(''));
    p += tam;
  }
  return out.filter(Boolean);
}

/** As covas (`jogos2.js:317-319`): os pedaços fora de ordem, nunca na ordem certa. */
function covasDe(ped: string[]): string[] {
  if (new Set(ped).size < 2) return [...ped];
  for (let vez = 0; vez < 24; vez++) {
    const ordem = emb(ped);
    if (ordem.some((x, k) => x !== ped[k])) return ordem;
  }
  return [...ped.slice(1), ped[0]];
}

export default function BaoDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('bao');
  const nivel = useNivelDoJogo('bao');
  const limite = regrasDoJogo('bao', nivel).errosPorPalavra;
  const textos = textosDoJogo('bao');

  const fila = useMemo(
    () => items.filter((it) => [...it.answer.trim()].length >= MIN_LETRAS).slice(0, MINIGAMES.bao.maxItems),
    [items],
  );
  const suficiente = fila.length >= MINIGAMES.bao.minItems;

  /* O estado da palavra, mexido à mão como no protótipo; `pintar` redesenha. */
  const s = useRef({
    i: 0,
    feito: 0,
    erros: 0,
    dica: false,
    viuResposta: false,
    trava: false,
    semeadas: [] as number[],
    erradas: [] as number[],
    aviso: '',
    seq: 0,
    acabou: false,
  }).current;
  const [, pintar] = useReducer((n: number) => n + 1, 0);

  const item = fila[s.i] as MinigameItem | undefined;
  const palavra = item ? item.answer.trim().toUpperCase() : '';
  const ped = useMemo(() => partirEmPedacos(palavra), [palavra]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as covas de cada palavra, mesmo que ela se repita
  const covas = useMemo(() => covasDe(ped), [ped, s.i]);

  const bao = useRef<HTMLDivElement>(null);
  const montada = useRef<HTMLElement>(null);
  const inicioDaPalavra = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  const registrar = (correct: boolean) => {
    if (!item) return null;
    outcomes.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct,
      attempts: 1 + s.erros,
      ms: Date.now() - inicioDaPalavra.current,
      ...(s.dica || s.viuResposta ? { hinted: true } : {}),
    });
    return recontar(outcomes.current);
  };

  /* `prox` de `jogos2.js:311-322`: acabou a fila, acabou a rodada (`pjFim`, 900 ms). */
  const prox = () => {
    if (s.i + 1 >= fila.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      s.acabou = true;
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'bao',
          items: todos,
          score: scoreRound('bao', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return pintar();
    }
    Object.assign(s, {
      i: s.i + 1,
      feito: 0,
      erros: 0,
      dica: false,
      viuResposta: false,
      trava: false,
      semeadas: [],
      erradas: [],
      aviso: '',
    });
    inicioDaPalavra.current = Date.now();
    pintar();
  };

  /* `semear` de `jogos2.js:323-347`. */
  const semear = (k: number, botao: HTMLElement | null) => {
    if (!item) return;
    const de = botao?.getBoundingClientRect();
    s.semeadas = [...s.semeadas, k];
    s.erradas = [];
    s.aviso = '';
    s.feito++;
    if (de && montada.current && polido() && !reduz()) {
      /* O pedaço voa da cova até a palavra montada. */
      const alvo = montada.current.getBoundingClientRect();
      const v = document.createElement('span');
      v.className = 'ganho';
      v.style.cssText = `left:${de.left + de.width / 2}px;top:${de.top + de.height / 2}px;animation:none;translate:-50% -50%;font-size:22px`;
      v.textContent = covas[k];
      document.body.append(v);
      const fim = () => v.remove();
      anima(
        v,
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          {
            transform: `translate(${alvo.left + alvo.width / 2 - de.left - de.width / 2}px, ${alvo.top + alvo.height / 2 - de.top - de.height / 2}px) scale(1.3)`,
            opacity: 0.2,
          },
        ],
        { d: 420, e: EIO, fill: 'forwards' },
      ).finished.then(fim, fim);
    }
    if (s.feito < ped.length) {
      play('select');
      return pintar();
    }
    s.trava = true;
    const comAjuda = s.dica || s.viuResposta;
    const p = registrar(true);
    s.seq = comAjuda ? 0 : s.seq + 1;
    celebrar({ tipo: 'acerto', combo: s.seq, el: montada.current, pontos: p?.ganho });
    falar(item.answer, item.lang);
    depois(1000, prox);
    pintar();
  };

  /* `pj.clique` de `jogos2.js:348-363`. */
  const tocar = (k: number, botao: HTMLElement) => {
    if (s.trava || !ativo || !item || s.semeadas.includes(k)) return;
    if (covas[k] === ped[s.feito]) return semear(k, botao);
    s.erros++;
    s.erradas = [...s.erradas, k];
    /* a cova errada desmarca sozinha */
    depois(700, () => {
      s.erradas = s.erradas.filter((x) => x !== k);
      pintar();
    });
    s.seq = 0;
    const perdeu = s.erros >= limite;
    s.trava = perdeu;
    s.aviso = perdeu
      ? t('A palavra era {palavra}.', { palavra })
      : t('Este pedaço não abre a palavra aqui. Restam {n}.', { n: limite - s.erros });
    /* A cova é redesenhada (fica vermelha) ANTES de tremer: o React reescreve a classe dela. */
    flushSync(pintar);
    play('error');
    tremer(botao);
    if (!perdeu) return;
    registrar(false);
    celebrar({ tipo: 'erro', el: bao.current });
    depois(1600, prox);
  };

  /* `pj.ajuda` de `jogos2.js:364-368`: a Dica semeia o próximo pedaço, uma vez por palavra. */
  const usarDica = () => {
    if (s.dica || s.trava || !ativo) return;
    s.dica = true;
    s.seq = 0;
    pintar();
    depois(0, () => {
      const k = covas.findIndex((x, n) => x === ped[s.feito] && !s.semeadas.includes(n));
      if (k >= 0) semear(k, bao.current?.querySelector<HTMLElement>(`.pj-cova[data-cova="${k}"]`) ?? null);
    });
  };

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  if (!suficiente || !item) return null;

  const feitos = outcomes.current.length;
  const falta = [...ped.slice(s.feito).join('')].length;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={s.seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${fila.length} ${unidadeDoPlacar('bao')}`}
        progresso={feitos / Math.max(1, fila.length)}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo={t('Dica')}
              title="Conta como dica: zera o combo"
              data-ajuda="dica"
              onClick={usarDica}
            />
            <AjudasGerais
              jogo="bao"
              parado={!ativo || s.acabou}
              resposta={() => item.answer}
              aoVerResposta={() => {
                s.viuResposta = true;
                s.seq = 0;
                pintar();
              }}
            />
          </>
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <div className="termo-dica">
          <span className="label-mono">{t('Pista')}</span>
          <b>{item.prompt}</b>
        </div>
        <div ref={bao} className="pj-bao">
          <div className="pj-montada">
            <span className="label-mono">
              <Sprout data-pj-i="" aria-hidden /> {t('Palavra montada')}
            </span>
            <b ref={montada} data-montada lang={item.lang}>
              {ped.slice(0, s.feito).join('')}
              <i>{'·'.repeat(falta)}</i>
            </b>
            <small data-conta>{t('{f} de {n} pedaços', { f: s.feito, n: ped.length })}</small>
          </div>
          {/* A chave refaz as covas a cada palavra, como o `innerHTML` do protótipo. */}
          <div key={s.i} className="pj-covas">
            {covas.map((texto, k) => {
              const semeada = s.semeadas.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={`pj-cova${semeada ? ' semeada' : ''}${s.erradas.includes(k) ? ' errada' : ''}`}
                  data-ped={ped.indexOf(texto)}
                  data-cova={k}
                  lang={item.lang}
                  disabled={semeada}
                  onClick={(e) => tocar(k, e.currentTarget)}
                >
                  {semeada ? <Check data-pj-i="" aria-hidden /> : texto}
                </button>
              );
            })}
          </div>
          <p className="pj-aviso erro" role="status">
            {s.aviso}
          </p>
        </div>
      </div>
    </>
  );
}
