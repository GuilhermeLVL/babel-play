import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { Volume2 } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import { regrasDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { idiomaDaInterface, t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { flutuar } from '../../../lib/polimento/jogos';
import AjudasGerais from '../casca/AjudasGerais';
import { useAtalhosDasAlternativas } from '../casca/atalhos';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useVozNoJogo } from '../noQuest';
import { textosDoJogo, unidadeDoPlacar } from '../polimento/textos';

/**
 * KARUTA — a cena do protótipo (`jogos2.js:13-60`, `jogos.css:75-85`): a pista em pílula, com o
 * equalizador que mexe enquanto o narrador fala, e a mesa de cartas. As cartas da mesa SÃO as da rodada:
 * a que foi pega fica apagada no lugar.
 *
 * As regras e os números são os do protótipo (4 cartas no Fácil, 6 nos outros; 12, 8 ou 6 segundos por
 * carta). O que é do app: as palavras, a voz (a pista é a tradução, falada no idioma de quem joga; pista
 * que é frase com lacuna é falada no idioma estudado) e a nota de revisão de cada carta.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
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

/** Quanto o equalizador espera pelo fim da fala antes de parar sozinho (`dizer`, `jogos.js:104`). */
const TETO_DA_FALA_MS = 7000;

export default function KarutaDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('karuta');
  const nivel = useNivelDoJogo('karuta');
  const regras = regrasDoJogo('karuta', nivel);
  const textos = textosDoJogo('karuta');

  /* `fila` de `jogos2.js:20`: as cartas da rodada. Duas cartas iguais na mesa não teriam como ser distinguidas. */
  const fila = useMemo(() => {
    const vistas = new Set<string>();
    const unicas = items.filter((it) => !vistas.has(it.answer) && !!vistas.add(it.answer));
    return unicas.slice(0, regras.cartas);
  }, [items, regras.cartas]);
  const mesa = useMemo(() => emb(fila.map((v) => v.answer)), [fila]);
  const suficiente = fila.length >= MINIGAMES.karuta.minItems;

  const [i, setI] = useState(0);
  const [certas, setCertas] = useState<string[]>([]);
  const [pegas, setPegas] = useState<string[]>([]);
  const [errada, setErrada] = useState<string | null>(null);
  const [falando, setFalando] = useState(false);
  const [fechada, setFechada] = useState(true);
  const [seq, setSeq] = useState(0);
  const [acabou, setAcabou] = useState(false);
  const [total, setTotal] = useState(regras.segundos * 1000);
  const [resto, setResto] = useState(regras.segundos * 1000);
  /** Quantas cartas já foram abertas: é o que liga o relógio. */
  const [abertas, setAbertas] = useState(0);

  const item = fila[i] as MinigameItem | undefined;
  /* A pista é a TRADUÇÃO, e tradução está no idioma de quem joga, não no de `item.lang`. A exceção é a
     pista que é a frase real com lacuna: essa está no idioma estudado. */
  const idiomaDaFala = item?.clozed ? item.lang : idiomaDaInterface();
  /* No headset sem voz para este idioma o botão de ouvir não aparece (seria um botão mudo); fora dele, sempre. */
  const haVoz = useVozNoJogo(idiomaDaFala);

  const mesaRef = useRef<HTMLDivElement>(null);
  const trava = useRef(true);
  const fim = useRef(0);
  const restoRef = useRef(regras.segundos * 1000);
  const tentativas = useRef(0);
  const comDica = useRef(false);
  const inicioDaCarta = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const cartaAberta = useRef(-1);
  const vezDaFala = useRef(0);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  /* `narrar` e `falando` de `jogos2.js:6-10, 26`: o equalizador mexe enquanto a pista é falada. */
  const narrar = () => {
    if (!item) return;
    const vez = ++vezDaFala.current;
    const calar = () => vez === vezDaFala.current && setFalando(false);
    setFalando(true);
    if (!falar(item.prompt, idiomaDaFala, { onEnd: calar, onError: calar })) return calar();
    depois(TETO_DA_FALA_MS, calar);
  };

  const registrar = (correct: boolean, revealed = false) => {
    if (!item) return null;
    outcomes.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct,
      attempts: Math.max(1, tentativas.current),
      ms: Date.now() - inicioDaCarta.current,
      ...(comDica.current ? { hinted: true } : {}),
      ...(revealed ? { revealed: true } : {}),
    });
    return recontar(outcomes.current);
  };

  /* `prox` de `jogos2.js:27-28`: acabou a fila, acabou a rodada (`pjFim`, 900 ms). */
  const avancar = () => {
    if (i + 1 >= fila.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'karuta',
          items: todos,
          score: scoreRound('karuta', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return;
    }
    setI((n) => n + 1);
  };

  /* A carta da vez (`prox`, `jogos2.js:29-40`): a pista aparece, é narrada, e o relógio parte. */
  useEffect(() => {
    if (!suficiente || !item || !ativo || finalizou.current || cartaAberta.current === i) return;
    cartaAberta.current = i;
    trava.current = false;
    tentativas.current = 0;
    comDica.current = false;
    inicioDaCarta.current = Date.now();
    setFechada(false);
    narrar();
    fim.current = performance.now() + regras.segundos * 1000;
    restoRef.current = regras.segundos * 1000;
    setTotal(restoRef.current);
    setResto(restoRef.current);
    setAbertas((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, ativo, suficiente]);

  /* O relógio (`pjRelogio`, `jogos.js:251-275`): passo de 100 ms; para com a rodada e retoma de onde parou. */
  useEffect(() => {
    if (acabou || abertas === 0) return;
    if (!ativo) {
      if (trava.current) return;
      restoRef.current = Math.max(0, fim.current - performance.now());
      return () => {
        fim.current = performance.now() + restoRef.current;
      };
    }
    const passo = window.setInterval(() => {
      if (trava.current) return;
      const r = fim.current - performance.now();
      restoRef.current = r;
      setResto(Math.max(0, r));
      if (r > 0 || !item) return;
      /* O tempo acabou (`jogos2.js:32-39`): a carta certa acende, já apagada, e vem a próxima. */
      trava.current = true;
      setFechada(true);
      setCertas((xs) => [...xs, item.answer]);
      setPegas((xs) => [...xs, item.answer]);
      registrar(false, true);
      setSeq(0);
      celebrar({ tipo: 'erro', el: mesaRef.current });
      flutuar(mesaRef.current, t('o tempo acabou'), 'erro');
      depois(1000, avancar);
    }, 100);
    return () => window.clearInterval(passo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, abertas, acabou]);

  /* `pj.clique` de `jogos2.js:41-55`. */
  const pegar = (carta: string, botao: HTMLElement | null) => {
    if (trava.current || !item || !ativo) return;
    tentativas.current += 1;
    if (carta !== item.answer) {
      /* Tocou errado: a carta pisca em vermelho e dá para tentar outra. */
      setErrada(carta);
      depois(420, () => setErrada((c) => (c === carta ? null : c)));
      setSeq(0);
      return celebrar({ tipo: 'erro', el: botao });
    }
    trava.current = true;
    setFechada(true);
    setCertas((xs) => [...xs, carta]);
    const comAjuda = comDica.current;
    const p = registrar(true);
    setSeq((n) => (comAjuda ? 0 : n + 1));
    celebrar({ tipo: 'acerto', combo: comAjuda ? 0 : seq + 1, el: botao, pontos: p?.ganho });
    falar(item.answer, item.lang);
    depois(800, () => {
      setPegas((xs) => [...xs, carta]);
      avancar();
    });
  };

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);
  /* Nada fica correndo depois de sair da tela. */
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  /* As teclas 1 a 6 pegam a carta pela posição (o protótipo não as desenha; o atalho continua). */
  useAtalhosDasAlternativas(
    mesa.length,
    (k) => pegar(mesa[k], mesaRef.current?.querySelectorAll<HTMLElement>('button')[k] ?? null),
    suficiente && ativo && !fechada && !acabou,
  );

  if (!suficiente) return null;

  const feitos = outcomes.current.length;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${fila.length} ${unidadeDoPlacar('karuta')}`}
        tempo={resto / 1000}
        progresso={resto / Math.max(1, total)}
        feito={feitos / Math.max(1, fila.length)}
        pouco={resto <= Math.min(10000, total * 0.34)}
        tourDoTempo="relogio"
        ajudas={
          <>
            {haVoz && (
              <BotaoDeAjuda
                icone={Volume2}
                rotulo={t('Ouvir de novo')}
                title="De graça"
                data-ajuda="ouvir"
                onClick={() => {
                  if (!trava.current && ativo) narrar();
                }}
              />
            )}
            <AjudasGerais
              jogo="karuta"
              parado={!ativo || acabou}
              aoGanharTempo={(s) => {
                if (trava.current) return false;
                fim.current += s * 1000;
                restoRef.current = fim.current - performance.now();
                setTotal((x) => Math.max(x, restoRef.current));
                setResto(restoRef.current);
              }}
              resposta={() => item?.answer ?? null}
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
        <div data-pista>
          {abertas > 0 && item && (
            <span className={`pj-pista${falando ? ' falando tocando' : ''}`}>
              <Volume2 data-pj-i="" aria-hidden />
              <span className="pj-eq" aria-hidden="true">
                {Array.from({ length: 5 }, (_, k) => (
                  <i key={k} style={{ '--i': k } as CSSProperties} />
                ))}
              </span>
              <span>{item.prompt}</span>
            </span>
          )}
        </div>
        <div ref={mesaRef} className="pj-mesa">
          {mesa.map((w, k) => (
            <button
              key={w}
              type="button"
              className={`pj-carta${certas.includes(w) ? ' certa' : ''}${pegas.includes(w) ? ' pega' : ''}${errada === w ? ' errada' : ''}`}
              data-op={w}
              style={{ '--i': k } as CSSProperties}
              lang={fila[0].lang}
              disabled={certas.includes(w)}
              onClick={(e) => pegar(w, e.currentTarget)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
