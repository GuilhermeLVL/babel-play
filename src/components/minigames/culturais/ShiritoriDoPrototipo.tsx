import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { scoreRound } from '@core';
import { ArrowRight, Lightbulb, Link2 } from 'lucide-react';
import { type CSSProperties, Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { regrasDoJogo } from '../../../core/minigames/regras';
import { montarCorrente } from '../../../core/minigames/shiritori';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { flutuar } from '../../../lib/polimento/jogos';
import AjudasGerais from '../casca/AjudasGerais';
import { useAtalhosDasAlternativas } from '../casca/atalhos';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar } from '../noQuest';
import { textosDoJogo, unidadeDoPlacar } from '../polimento/textos';

/**
 * SHIRITORI — a cena do protótipo (`jogos2.js:430-480`, `jogos.css:99-109`): a corrente até aqui, a palavra
 * na ponta com a última letra em destaque, a letra exigida (escondida até pedir, ou já à vista no Fácil)
 * e três alternativas.
 *
 * As regras e os números são os do protótipo: 23, 15 ou 11 segundos por elo; a errada é riscada e dá para
 * tentar de novo; "Ver a letra" não custa nada. O que é do app: a corrente é montada com as SUAS palavras
 * (`core/minigames/shiritori`; se elas não encadeiam, a rodada não nasce), e a nota de revisão de cada elo.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function ShiritoriDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('shiritori');
  const nivel = useNivelDoJogo('shiritori');
  const regras = regrasDoJogo('shiritori', nivel);
  const textos = textosDoJogo('shiritori');
  const corrente = useMemo(() => montarCorrente(items), [items]);
  const passos = corrente?.passos ?? [];

  const [i, setI] = useState(0);
  const [fora, setFora] = useState<string[]>([]);
  const [certa, setCerta] = useState<string | null>(null);
  const [letraAVista, setLetraAVista] = useState(regras.letraAVista);
  const [fechado, setFechado] = useState(true);
  const [seq, setSeq] = useState(0);
  const [acabou, setAcabou] = useState(false);
  const [total, setTotal] = useState(regras.segundos * 1000);
  const [resto, setResto] = useState(regras.segundos * 1000);
  /** Quantos elos já foram abertos: é o que liga o relógio. */
  const [abertos, setAbertos] = useState(0);

  const passo = passos[i] as (typeof passos)[number] | undefined;

  const elos = useRef<HTMLDivElement>(null);
  const opcoes = useRef<HTMLDivElement>(null);
  const trava = useRef(true);
  const fim = useRef(0);
  const restoRef = useRef(regras.segundos * 1000);
  const tentativas = useRef(1);
  const comDica = useRef(false);
  const inicioDoElo = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const eloAberto = useRef(-1);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  const registrar = (correct: boolean, revealed = false) => {
    if (!passo) return null;
    outcomes.current.push({
      cardId: passo.item.cardId,
      itemRef: passo.item.answer,
      correct,
      attempts: tentativas.current,
      ms: Date.now() - inicioDoElo.current,
      ...(revealed ? { revealed: true } : {}),
      ...(correct && comDica.current ? { hinted: true } : {}),
    });
    return recontar(outcomes.current);
  };

  /* `prox` de `jogos2.js:438-439`: acabou a corrente, acabou a rodada (`pjFim`, 900 ms). */
  const avancar = () => {
    if (i + 1 >= passos.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'shiritori',
          items: todos,
          score: scoreRound('shiritori', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return;
    }
    setFora([]);
    setCerta(null);
    setLetraAVista(regras.letraAVista);
    setI((n) => n + 1);
  };

  /* O elo da vez (`prox`, `jogos2.js:440-456`): a corrente rola até a ponta e o relógio parte. */
  useEffect(() => {
    if (!passo || !ativo || finalizou.current || eloAberto.current === i) return;
    eloAberto.current = i;
    trava.current = false;
    tentativas.current = 1;
    comDica.current = false;
    inicioDoElo.current = Date.now();
    setFechado(false);
    if (elos.current) elos.current.scrollLeft = elos.current.scrollWidth;
    fim.current = performance.now() + regras.segundos * 1000;
    restoRef.current = regras.segundos * 1000;
    setTotal(restoRef.current);
    setResto(restoRef.current);
    setAbertos((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, ativo, passo]);

  /* O relógio (`pjRelogio`, `jogos.js:251-275`): passo de 100 ms; para com a rodada e retoma de onde parou. */
  useEffect(() => {
    if (acabou || abertos === 0) return;
    if (!ativo) {
      if (trava.current) return;
      restoRef.current = Math.max(0, fim.current - performance.now());
      return () => {
        fim.current = performance.now() + restoRef.current;
      };
    }
    const tique = window.setInterval(() => {
      if (trava.current) return;
      const r = fim.current - performance.now();
      restoRef.current = r;
      setResto(Math.max(0, r));
      if (r > 0 || !passo) return;
      /* O tempo acabou (`jogos2.js:451-455`): o elo certo acende e vem o próximo. */
      trava.current = true;
      setFechado(true);
      setCerta(passo.item.answer);
      registrar(false, true);
      setSeq(0);
      celebrar({ tipo: 'erro', el: opcoes.current });
      flutuar(opcoes.current, t('o tempo acabou'), 'erro');
      depois(1100, avancar);
    }, 100);
    return () => window.clearInterval(tique);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, abertos, acabou]);

  /* `pj.clique` de `jogos2.js:457-471`. */
  const escolher = (op: string, botao: HTMLElement | null) => {
    if (trava.current || !passo || !ativo || fora.includes(op)) return;
    if (op !== passo.item.answer) {
      setFora((xs) => [...xs, op]);
      tentativas.current += 1;
      setSeq(0);
      return celebrar({ tipo: 'erro', el: botao });
    }
    trava.current = true;
    setFechado(true);
    setCerta(op);
    const comAjuda = comDica.current;
    const p = registrar(true);
    setSeq((n) => (comAjuda ? 0 : n + 1));
    celebrar({ tipo: 'acerto', combo: comAjuda ? 0 : seq + 1, el: botao, pontos: p?.ganho });
    falar(passo.item.answer, passo.item.lang);
    depois(650, avancar);
  };

  useEffect(() => {
    if (!corrente) onExit();
  }, [corrente, onExit]);
  /* Nada fica correndo depois de sair da tela. */
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  /* As teclas 1 a 3 escolhem pela posição (o protótipo não as desenha aqui; o atalho continua). */
  useAtalhosDasAlternativas(
    passo?.opcoes.length ?? 0,
    (k) => {
      const op = passo?.opcoes[k];
      if (op) escolher(op, opcoes.current?.querySelectorAll<HTMLElement>('button')[k] ?? null);
    },
    !!passo && ativo && !fechado && !acabou,
  );

  if (!corrente || !passo) return null;

  const anterior = i === 0 ? corrente.inicio : passos[i - 1].item;
  const naCorrente = [corrente.inicio, ...passos.slice(0, i).map((x) => x.item)];
  const letras = [...anterior.answer];
  const feitos = outcomes.current.length;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${passos.length} ${unidadeDoPlacar('shiritori')}`}
        tempo={resto / 1000}
        progresso={resto / Math.max(1, total)}
        feito={feitos / Math.max(1, passos.length)}
        pouco={resto <= Math.min(10000, total * 0.34)}
        tourDoTempo="relogio"
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo={t('Ver a letra')}
              title="De graça"
              data-ajuda="letra"
              onClick={() => {
                if (!trava.current && ativo) setLetraAVista(true);
              }}
            />
            <AjudasGerais
              jogo="shiritori"
              parado={!ativo || acabou}
              aoGanharTempo={(s) => {
                if (trava.current) return false;
                fim.current += s * 1000;
                restoRef.current = fim.current - performance.now();
                setTotal((x) => Math.max(x, restoRef.current));
                setResto(restoRef.current);
              }}
              resposta={() => passo.item.answer}
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
        <div className="pj-corrente">
          <span className="label-mono">
            {t('A corrente até aqui ({i} de {n})', { i: naCorrente.length, n: passos.length + 1 })}
          </span>
          <div ref={elos} className="pj-elos">
            {naCorrente.map((elo, k) => (
              <Fragment key={k}>
                {k > 0 && <ArrowRight data-pj-i="" aria-hidden />}
                <span lang={elo.lang}>{elo.answer}</span>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="pj-centro">
          <span className="label-mono">{t('Palavra na ponta')}</span>
          <p className="pj-ponta" lang={anterior.lang}>
            {letras.slice(0, -1).join('')}
            <u>{letras[letras.length - 1]}</u>
          </p>
          <span className="mut">{anterior.prompt}</span>
          <p className="pj-letra" hidden={!letraAVista}>
            <Link2 data-pj-i="" aria-hidden /> {t('A próxima começa com')} <b>{passo.letra.toLocaleUpperCase()}</b>
          </p>
        </div>
        {/* `opcoesHtml` de `jogos.js:83-84`. A chave refaz os botões a cada elo, para a entrada tocar de novo. */}
        <div ref={opcoes} key={i} className="opcoes-blitz tres">
          {passo.opcoes.map((op, k) => {
            const riscada = fora.includes(op);
            return (
              <button
                key={op}
                type="button"
                data-op={op}
                style={{ '--i': k } as CSSProperties}
                className={`${riscada ? 'pj-fora' : ''}${certa === op ? ' certa' : ''}`.trim() || undefined}
                disabled={riscada}
                lang={passo.item.lang}
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
