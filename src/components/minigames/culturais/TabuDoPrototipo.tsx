import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { distractorsFor, extractKeywords, scoreRound } from '@core';
import { Lightbulb, TriangleAlert } from 'lucide-react';
import { type CSSProperties, Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { mascararResposta } from '../../../core/learning/pistaDeJogo';
import { regrasDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { flutuar } from '../../../lib/polimento/jogos';
import { sentir } from '../../../lib/polimento/sentidos';
import AjudasGerais from '../casca/AjudasGerais';
import { useAtalhosDasAlternativas } from '../casca/atalhos';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { textosDoJogo } from '../polimento/textos';

/**
 * TABU — a cena do protótipo (`jogos2.js:526-576`, `jogos.css:110-115`): a definição num cartão, com os
 * termos mais óbvios riscados, e as alternativas embaixo. Uma tentativa só por carta, contra o relógio.
 *
 * As regras e os números são os do protótipo. O que é do app: a definição e as proibidas saem do seu
 * material (`mascararResposta` tira a palavra-alvo do texto, `extractKeywords` escolhe o que riscar), as
 * alternativas são as respostas dos outros itens, e a nota de revisão de cada carta.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Quantos termos são riscados por carta (as três chaves `{…}` de cada definição do protótipo). */
const PROIBIDAS_POR_CARTA = 3;

interface Carta {
  item: MinigameItem;
  /** A definição em pedaços: os que são palavra proibida saem em `<s>`. */
  pedacos: string[];
  /** Os termos riscados, em minúsculas, na ordem em que aparecem no texto. */
  proibidas: string[];
  opcoes: string[];
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

function montarCartas(items: MinigameItem[], alternativas: number): Carta[] {
  return items.flatMap((item) => {
    /* O texto mais longo entre frase e pista: uma tradução de uma palavra não sustenta termo riscado. */
    const cru = [item.sentence ?? '', item.prompt ?? ''].map((x) => x.trim()).sort((a, b) => b.length - a.length)[0];
    if (!cru) return [];
    const texto = mascararResposta(cru, item.answer);
    const chaves = extractKeywords(texto, { max: PROIBIDAS_POR_CARTA, lang: item.lang }).map((p) => p.toLowerCase());
    if (!chaves.length) return [];
    /* `distr` de `jogos.js:82`: a certa e 2 (Fácil) ou 3 erradas, embaralhadas. */
    const distratores = distractorsFor(item, items, alternativas - 1);
    if (!distratores.length) return [];
    const pedacos = texto.split(/([\p{L}\p{N}'’-]+)/gu);
    const proibidas = [...new Set(pedacos.map((p) => p.toLowerCase()).filter((p) => chaves.includes(p)))];
    if (!proibidas.length) return [];
    return [{ item, pedacos, proibidas, opcoes: emb([item.answer, ...distratores]) }];
  });
}

const proibidasEmTexto = (n: number) => `${n} ${n === 1 ? t('proibida') : t('proibidas')}`;

export default function TabuDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('taboo');
  const nivel = useNivelDoJogo('taboo');
  const regras = regrasDoJogo('taboo', nivel);
  const textos = textosDoJogo('taboo');
  const cartas = useMemo(() => montarCartas(items, regras.alternativas), [items, regras.alternativas]);

  const [i, setI] = useState(0);
  const carta = cartas[i] as Carta | undefined;
  /* No Fácil a primeira proibida já vem solta (`jogos2.js:547-550`); sobra sempre pelo menos uma. */
  const soltasDeInicio = (c: Carta | undefined) =>
    c ? c.proibidas.slice(0, Math.min(regras.proibidasLiberadas, c.proibidas.length - 1)) : [];
  const [livres, setLivres] = useState<string[]>(() => soltasDeInicio(cartas[0]));
  const [resposta, setResposta] = useState<{ escolhida: string | null } | null>(null);
  const [seq, setSeq] = useState(0);
  const [feitos, setFeitos] = useState(0);
  const [acabou, setAcabou] = useState(false);
  const [total, setTotal] = useState(regras.segundos * 1000);
  const [resto, setResto] = useState(regras.segundos * 1000);

  const cartao = useRef<HTMLDivElement>(null);
  const opcoes = useRef<HTMLDivElement>(null);
  const trava = useRef(false);
  const fim = useRef(0);
  const restoRef = useRef(regras.segundos * 1000);
  const comDica = useRef(false);
  const inicioDaCarta = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  /* `prox` de `jogos2.js:541-551`. */
  const prox = () => {
    if (i + 1 >= cartas.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'taboo',
          items: todos,
          score: scoreRound('taboo', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return;
    }
    trava.current = false;
    comDica.current = false;
    inicioDaCarta.current = Date.now();
    restoRef.current = regras.segundos * 1000;
    fim.current = performance.now() + restoRef.current;
    setTotal(restoRef.current);
    setResto(restoRef.current);
    setLivres(soltasDeInicio(cartas[i + 1]));
    setResposta(null);
    setI(i + 1);
  };

  /* `responder` de `jogos2.js:552-565`: uma tentativa só; a certa fica marcada. `null` é o tempo esgotado. */
  const responder = (op: string | null, botao: HTMLElement | null = null) => {
    if (trava.current || !carta || !ativo) return;
    trava.current = true;
    const certo = op === carta.item.answer;
    setResposta({ escolhida: op });
    outcomes.current.push({
      cardId: carta.item.cardId,
      itemRef: carta.item.answer,
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioDaCarta.current,
      ...(op === null ? { revealed: true } : { hinted: comDica.current }),
    });
    const p = recontar(outcomes.current);
    setFeitos((n) => n + 1);
    if (certo) {
      setSeq((n) => n + 1);
      celebrar({ tipo: 'acerto', combo: seq + 1, el: botao, pontos: p.ganho });
    } else {
      setSeq(0);
      const el = botao ?? cartao.current;
      celebrar({ tipo: 'erro', el });
      if (!botao) flutuar(el, t('o tempo acabou'), 'erro');
    }
    depois(certo ? 700 : 1300, prox);
  };

  /* O relógio (`pjRelogio`, `jogos.js:251-275`): passo de 100 ms; para com a rodada e retoma de onde parou. */
  useEffect(() => {
    if (!carta || acabou || resposta) return;
    if (!ativo) return;
    fim.current = performance.now() + restoRef.current;
    const passo = window.setInterval(() => {
      if (trava.current) return;
      const r = fim.current - performance.now();
      restoRef.current = Math.max(0, r);
      setResto(restoRef.current);
      if (r <= 0) responder(null);
    }, 100);
    return () => {
      window.clearInterval(passo);
      restoRef.current = Math.max(0, fim.current - performance.now());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, i, acabou, resposta]);

  useEffect(() => {
    if (!cartas.length) onExit();
  }, [cartas, onExit]);
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  /* As teclas 1 a 4 escolhem pela posição (o protótipo não as desenha no Tabu; o atalho continua). */
  useAtalhosDasAlternativas(
    carta?.opcoes.length ?? 0,
    (k) => {
      const op = carta?.opcoes[k];
      if (op) responder(op, opcoes.current?.querySelectorAll<HTMLElement>('button')[k] ?? null);
    },
    !!carta && ativo && !resposta && !acabou,
  );

  if (!carta) return null;

  const riscadas = carta.proibidas.filter((p) => !livres.includes(p));

  /* `pj.ajuda` de `jogos2.js:567-573`: solta a primeira ainda riscada; sobra sempre pelo menos uma. */
  const liberar = () => {
    if (trava.current || riscadas.length <= 1) return;
    setLivres((xs) => [...xs, riscadas[0]]);
    /* Custa (`jogos.js:334-338`): zera o combo, e o acerto que vier conta como "com dica". */
    comDica.current = true;
    setSeq(0);
    sentir('liga', 'toggleOn');
  };

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${cartas.length} cartas`}
        tempo={resto / 1000}
        progresso={resto / Math.max(1, total)}
        feito={feitos / Math.max(1, cartas.length)}
        pouco={resto <= Math.min(10000, total * 0.34)}
        tourDoTempo="relogio"
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Liberar 1"
              title="Conta como dica: zera o combo"
              data-ajuda="liberar"
              disabled={!ativo || acabou || !!resposta}
              onClick={liberar}
            />
            <AjudasGerais
              jogo="taboo"
              parado={!ativo || acabou || !!resposta}
              aoGanharTempo={(s) => {
                if (trava.current) return false;
                fim.current += s * 1000;
                restoRef.current = fim.current - performance.now();
                setTotal((x) => Math.max(x, restoRef.current));
                setResto(restoRef.current);
              }}
              resposta={() => carta.item.answer}
              aoVerResposta={() => {
                comDica.current = true;
                setSeq(0);
              }}
            />
          </>
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <div ref={cartao} className="pj-tabu" data-tour="alvo">
          <header>
            <span className="label-mono">
              {t('Definição')} ({i + 1} de {cartas.length})
            </span>
            <span>
              <TriangleAlert data-pj-i="" aria-hidden /> <span data-n>{proibidasEmTexto(riscadas.length)}</span>
            </span>
          </header>
          <p lang={carta.item.lang}>
            {carta.pedacos.map((p, k) =>
              carta.proibidas.includes(p.toLowerCase()) ? (
                <s key={k} className={livres.includes(p.toLowerCase()) ? 'livre' : undefined}>
                  {p}
                </s>
              ) : (
                <Fragment key={k}>{p}</Fragment>
              ),
            )}
          </p>
        </div>
        {/* `opcoesHtml` de `jogos.js:83-84`. A chave refaz os botões a cada carta, para a entrada tocar de novo. */}
        <div ref={opcoes} key={i} className="opcoes-blitz ">
          {carta.opcoes.map((op, k) => (
            <button
              key={op}
              type="button"
              data-op={op}
              style={{ '--i': k } as CSSProperties}
              className={
                resposta
                  ? op === carta.item.answer
                    ? 'certa'
                    : op === resposta.escolhida
                      ? 'errada'
                      : undefined
                  : undefined
              }
              disabled={!!resposta}
              lang={carta.item.lang}
              onClick={(e) => responder(op, e.currentTarget)}
            >
              {op}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
