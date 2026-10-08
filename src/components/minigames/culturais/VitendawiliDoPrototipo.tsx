import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { distractorsFor, makeCloze, MINIGAMES, scoreRound } from '@core';
import { Volume2 } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useReducer, useRef } from 'react';
import { flushSync } from 'react-dom';

import { regrasDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { anima, MOLA_SUAVE, polido, reduz } from '../../../lib/polimento/base';
import AjudasGerais from '../casca/AjudasGerais';
import { useAtalhosDasAlternativas } from '../casca/atalhos';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useVozNoJogo } from '../noQuest';
import { textosDoJogo, unidadeDoPlacar } from '../polimento/textos';

/**
 * VITENDAWILI — a cena do protótipo (`jogos2.js:378-427`, `jogos.css:96-98`): a frase grande com um traço
 * no lugar da palavra, e as alternativas embaixo. A certa sai do botão e encaixa na lacuna.
 *
 * As regras e os números são os do protótipo: 3 alternativas no Fácil e 4 nos outros; a errada é riscada
 * e dá para tentar de novo, menos no Difícil, onde o primeiro erro encerra o enigma. O que é do app: o
 * enigma é a SUA frase com a palavra apagada (item sem frase não entra), as alternativas são palavras da
 * mesma rodada, e a nota de revisão de cada uma.
 *
 * No Fácil o protótipo mostra a tradução da frase. O item do app não traz a frase traduzida: aparece a
 * tradução da PALAVRA (a pista dela), que é o que há. Quando a pista já é a própria frase com lacuna,
 * não há o que mostrar.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** A lacuna do cloze do app é `_____`; vale qualquer corrida de 3 ou mais sublinhados. */
const LACUNA = /_{3,}/;

/** A frase com a lacuna, ou `null` quando este item não tem enigma possível. */
function enigmaDe(item: MinigameItem): string | null {
  if (item.clozed && LACUNA.test(item.prompt)) return item.prompt;
  const frase = item.sentence?.trim();
  if (!frase) return null;
  return makeCloze(frase, item.answer)?.prompt ?? null;
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

export default function VitendawiliDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('vitendawili');
  const nivel = useNivelDoJogo('vitendawili');
  const regras = regrasDoJogo('vitendawili', nivel);
  const textos = textosDoJogo('vitendawili');

  /** Só os itens que têm frase: o enigma nasce dela ou não nasce. */
  const fr = useMemo(() => {
    const comFrase: { item: MinigameItem; partes: [string, string] }[] = [];
    for (const item of items) {
      const enigma = enigmaDe(item);
      if (!enigma) continue;
      const [antes, ...resto] = enigma.split(LACUNA);
      comFrase.push({ item, partes: [antes, resto.join(' ')] });
      if (comFrase.length >= MINIGAMES.vitendawili.maxItems) break;
    }
    return comFrase;
  }, [items]);
  const suficiente = fr.length >= MINIGAMES.vitendawili.minItems;

  /* O estado do enigma, mexido à mão como no protótipo; `pintar` redesenha. */
  const s = useRef({
    i: 0,
    trava: false,
    fora: [] as string[],
    certa: null as string | null,
    cheia: false,
    viuResposta: false,
    seq: 0,
    acabou: false,
  }).current;
  const [, pintar] = useReducer((n: number) => n + 1, 0);

  const atual = fr[s.i] as (typeof fr)[number] | undefined;
  /* No headset sem voz para este idioma o botão de ouvir não aparece (seria um botão mudo); fora dele, sempre. */
  const haVoz = useVozNoJogo(atual?.item.lang);
  /* `distr` de `jogos.js:82`: a certa e 2 (Fácil) ou 3 erradas, embaralhadas. */
  const opcoes = useMemo(() => {
    if (!atual) return [];
    const outros = fr.map((x) => x.item);
    return emb([atual.item.answer, ...distractorsFor(atual.item, outros, regras.alternativas - 1)]);
  }, [atual, fr, regras.alternativas]);

  const lacuna = useRef<HTMLSpanElement>(null);
  const grupo = useRef<HTMLDivElement>(null);
  const inicioDoEnigma = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const narrado = useRef(-1);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  /* `narrar` de `jogos2.js:387`: a frase com uma pausa (a vírgula) no lugar da palavra. */
  const narrar = () => {
    if (atual) falar(atual.partes.join(', '), atual.item.lang);
  };

  const registrar = (correct: boolean) => {
    if (!atual) return null;
    outcomes.current.push({
      cardId: atual.item.cardId,
      itemRef: atual.item.answer,
      correct,
      attempts: 1 + s.fora.length - (correct ? 0 : 1),
      ms: Date.now() - inicioDoEnigma.current,
      ...(s.viuResposta ? { hinted: true } : {}),
    });
    return recontar(outcomes.current);
  };

  /* `prox` de `jogos2.js:388-394`: acabou a fila, acabou a rodada (`pjFim`, 900 ms). */
  const prox = () => {
    if (s.i + 1 >= fr.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      s.acabou = true;
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'vitendawili',
          items: todos,
          score: scoreRound('vitendawili', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return pintar();
    }
    Object.assign(s, { i: s.i + 1, trava: false, fora: [], certa: null, cheia: false, viuResposta: false });
    pintar();
  };

  /* Cada enigma é narrado ao entrar; o primeiro espera a rodada começar a valer. */
  const i = s.i;
  useEffect(() => {
    if (!suficiente || !ativo || narrado.current === i) return;
    narrado.current = i;
    inicioDoEnigma.current = Date.now();
    narrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, ativo, suficiente]);

  /* `pj.clique` de `jogos2.js:395-420`. */
  const escolher = (op: string, botao: HTMLElement | null) => {
    if (s.trava || !atual || !ativo || s.fora.includes(op)) return;
    if (op !== atual.item.answer) {
      s.fora = [...s.fora, op];
      s.seq = 0;
      /* O botão é redesenhado (riscado) ANTES do retorno do erro: o React reescreve a classe dele. */
      if (!regras.umaTentativa) {
        flushSync(pintar);
        return celebrar({ tipo: 'erro', el: botao });
      }
      /* no Difícil é uma tentativa só por enigma */
      s.trava = true;
      s.certa = atual.item.answer;
      flushSync(pintar);
      registrar(false);
      celebrar({ tipo: 'erro', el: botao });
      return depois(1400, prox);
    }
    s.trava = true;
    const de = botao?.getBoundingClientRect();
    s.cheia = true;
    s.certa = op;
    /* A lacuna precisa estar com a palavra antes de ser medida. */
    flushSync(pintar);
    const l = lacuna.current;
    if (l && de && polido() && !reduz()) {
      /* A palavra sai do botão e encaixa na lacuna. */
      const para = l.getBoundingClientRect();
      anima(
        l,
        [
          {
            transform: `translate(${de.left + de.width / 2 - para.left - para.width / 2}px, ${de.top + de.height / 2 - para.top - para.height / 2}px) scale(0.8)`,
            opacity: 0.4,
          },
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
        ],
        { d: 520, e: MOLA_SUAVE },
      );
    }
    const comAjuda = s.viuResposta;
    const p = registrar(true);
    s.seq = comAjuda ? 0 : s.seq + 1;
    celebrar({ tipo: 'acerto', combo: s.seq, el: l, pontos: p?.ganho });
    falar(`${atual.partes[0]}${atual.item.answer}${atual.partes[1]}`, atual.item.lang);
    depois(1300, prox);
    pintar();
  };

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  /* As teclas 1 a 4 escolhem pela posição (o protótipo não as desenha aqui; o atalho continua). */
  useAtalhosDasAlternativas(
    opcoes.length,
    (k) => escolher(opcoes[k], grupo.current?.querySelectorAll<HTMLElement>('button')[k] ?? null),
    suficiente && !!atual && ativo && !s.trava && !s.acabou,
  );

  if (!suficiente || !atual) return null;

  const feitos = outcomes.current.length;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={s.seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${fr.length} ${unidadeDoPlacar('vitendawili')}`}
        progresso={feitos / Math.max(1, fr.length)}
        ajudas={
          <>
            {haVoz && (
              <BotaoDeAjuda
                icone={Volume2}
                rotulo={t('Ouvir')}
                title="De graça"
                data-ajuda="ouvir"
                onClick={() => {
                  if (!s.trava && ativo) narrar();
                }}
              />
            )}
            <AjudasGerais
              jogo="vitendawili"
              parado={!ativo || s.acabou}
              resposta={() => atual.item.answer}
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
        <p className="pj-enigma" lang={atual.item.lang}>
          {atual.partes[0]}
          <span
            ref={lacuna}
            key={s.i}
            className={`pj-lacuna${s.cheia ? ' cheia' : ''}`}
            aria-label={t('palavra apagada')}
          >
            {s.cheia ? atual.item.answer : ' '}
          </span>
          {atual.partes[1]}
        </p>
        {regras.traducaoAVista && !atual.item.clozed && (
          <p className="mut" style={{ textAlign: 'center' }}>
            {atual.item.prompt}
          </p>
        )}
        {/* `opcoesHtml` de `jogos.js:83-84`. A chave refaz os botões a cada enigma, para a entrada tocar de novo. */}
        <div ref={grupo} key={`op-${s.i}`} className="opcoes-blitz ">
          {opcoes.map((op, k) => {
            const fora = s.fora.includes(op);
            return (
              <button
                key={op}
                type="button"
                data-op={op}
                style={{ '--i': k } as CSSProperties}
                className={`${fora ? 'pj-fora' : ''}${s.certa === op ? ' certa' : ''}`.trim() || undefined}
                disabled={fora}
                lang={atual.item.lang}
                onClick={(e) => escolher(op, e.currentTarget)}
              >
                {op}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
