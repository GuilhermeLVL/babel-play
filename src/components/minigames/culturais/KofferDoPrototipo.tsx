import '../../../styles/polimentoJogosG2.css';

import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { Eye, Heart, Plane } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useReducer, useRef } from 'react';

import { regrasDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { t, tp } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { anima, EIO, MOLA, MOLA_SUAVE, polido, reduz } from '../../../lib/polimento/base';
import { flutuar } from '../../../lib/polimento/jogos';
import { sentir } from '../../../lib/polimento/sentidos';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar } from '../noQuest';
import { textosDoJogo, unidadeDoPlacar } from '../polimento/textos';

/**
 * MALA — a cena do protótipo (`jogos3.js:176-304`, `jogos3.css:62-115`): a rota dos níveis com o avião, a
 * mala com a tampa em 3D, os compartimentos numerados, as etiquetas na tampa, os adesivos de viagem, a
 * fala e as vidas; embaixo, a paleta de etiquetas de bagagem.
 *
 * As regras e os números são os do protótipo. O que é do app: as palavras (as suas), quantas são (a
 * rodada que o app montou, e não as 5 de exemplo) e o relatório por palavra, acumulado ao longo dos
 * níveis, como o `KofferGame` de sempre: `attempts` soma os erros na posição dela, `correct` diz se ela
 * chegou a ser posta no lugar, `hinted` se houve espiada no nível. Palavra que não chegou a ser cobrada
 * não vira resultado.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

type Fase = '' | 'entrando' | 'lembrando' | 'espiando' | 'pausa' | 'fim';

interface Registro {
  erros: number;
  colocou: boolean;
  ms: number;
  espiou: boolean;
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

/** `voarTexto` de `jogos3.js:8-16`: um texto voa de um elemento até outro (a palavra indo para a etiqueta). */
function voarTexto(de: Element | null, para: Element | null, texto: string): void {
  if (!polido() || reduz() || !de || !para) return;
  const a = de.getBoundingClientRect();
  const b = para.getBoundingClientRect();
  const v = document.createElement('span');
  v.className = 'ganho';
  v.style.cssText = `left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px;animation:none;translate:-50% -50%;font-size:20px`;
  v.textContent = texto;
  document.body.append(v);
  const fim = () => v.remove();
  anima(
    v,
    [
      { transform: 'translate(0,0) scale(1.1)', opacity: 1 },
      {
        transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(0.8)`,
        opacity: 0.3,
      },
    ],
    { d: 380, e: EIO, fill: 'forwards' },
  ).finished.then(fim, fim);
}

export default function KofferDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('koffer');
  /* `nivel` neste jogo já é o nível da mala (quantas palavras ela tem); o da dificuldade tem outro nome. */
  const dificuldade = useNivelDoJogo('koffer');
  const regras = regrasDoJogo('koffer', dificuldade);
  const textos = textosDoJogo('koffer');

  /* Duas palavras iguais na mala tornariam a ordem impossível de conferir por toque. */
  const pal = useMemo(() => {
    const vistas = new Set<string>();
    const unicos: MinigameItem[] = [];
    for (const it of items) {
      const chave = it.answer.trim().toLowerCase();
      if (!chave || vistas.has(chave)) continue;
      vistas.add(chave);
      unicos.push(it);
    }
    return unicos.slice(0, MINIGAMES.koffer.maxItems);
  }, [items]);
  /* A paleta é embaralhada uma vez, como no protótipo (`jogos3.js:184`). */
  const paleta = useMemo(() => emb(pal), [pal]);
  const suficiente = pal.length >= MINIGAMES.koffer.minItems;

  /* O estado da cena, mexido à mão como no protótipo; `pintar` redesenha. */
  const s = useRef({
    nivel: 1,
    passo: 0,
    vidas: regras.vidas,
    fase: '' as Fase,
    espiou: false,
    aberta: false,
    /** A paleta só destrava quando a mala fecha pela primeira vez (`abrir`, `jogos3.js:220`). */
    paletaPresa: true,
    fala: '',
    falaErro: false,
    /** O que `rota()`, `slots()` e `tags()` desenharam da última vez (eles não rodam a cada mudança). */
    rota: 0,
    slots: 0,
    slotNovo: false,
    tags: 0,
    tagsPasso: 0,
    completa: false,
    feitos: 0,
    seq: 0,
    adesivos: [] as { n: number; r: number }[],
  }).current;
  const [, pintar] = useReducer((n: number) => n + 1, 0);

  const cena = useRef<HTMLDivElement>(null);
  const mala = useRef<HTMLDivElement>(null);
  const registros = useRef(new Map<number, Registro>());
  const inicioDaRodada = useRef(Date.now());
  const inicioDaPosicao = useRef(Date.now());
  const esperas = useRef<number[]>([]);
  const comecou = useRef(false);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  const registro = (k: number): Registro => {
    const atual = registros.current.get(k);
    if (atual) return atual;
    const novo: Registro = { erros: 0, colocou: false, ms: 0, espiou: false };
    registros.current.set(k, novo);
    return novo;
  };
  /** Os resultados até agora, por palavra: o relatório final e o placar ao vivo são a mesma conta. */
  const resultados = (): ItemOutcome[] => {
    const lista: ItemOutcome[] = [];
    pal.forEach((item, k) => {
      const reg = registros.current.get(k);
      if (!reg) return; // nunca cobrada: quem não foi perguntado não errou
      lista.push({
        cardId: item.cardId,
        itemRef: item.answer,
        correct: reg.colocou,
        attempts: 1 + reg.erros,
        ms: reg.ms,
        ...(reg.espiou ? { hinted: true } : {}),
      });
    });
    return lista;
  };

  /* `pjFim` (`jogos.js:296-303`): a tela de fim vem 900 ms depois da última jogada. */
  const finalizar = () => {
    if (finalizou.current) return;
    finalizou.current = true;
    const todos = resultados();
    depois(900, () =>
      onFinish({
        gameId: 'koffer',
        items: todos,
        score: scoreRound('koffer', todos),
        durationMs: Date.now() - inicioDaRodada.current,
      }),
    );
  };

  /* `dizerFala` de `jogos3.js:197-200`. */
  const dizerFala = (texto?: string, erro = false) => {
    s.fala =
      texto ||
      (s.fase === 'lembrando'
        ? t('Passo {p} de {n}: qual palavra entrou nesta posição?', { p: s.passo + 1, n: s.nivel })
        : t('Guarde a ordem…'));
    s.falaErro = erro;
  };
  /* `abrir` de `jogos3.js:216-221`. */
  const abrir = (sim: boolean) => {
    s.aberta = sim;
    s.paletaPresa = sim;
    sentir(sim ? 'abre' : 'fecha', sim ? 'open' : 'close');
  };
  /* `tags` de `jogos3.js:212-215`. */
  const tags = () => {
    s.tags = s.nivel;
    s.tagsPasso = s.passo;
  };
  /* `fechar` de `jogos3.js:222-232`. */
  const fechar = () => {
    s.fase = 'lembrando';
    tags();
    abrir(false);
    dizerFala();
    inicioDaPosicao.current = Date.now();
    pintar();
    /* os fechos batem um instante depois de a tampa descer */
    depois(620, () => {
      sentir('encaixa', 'select');
      if (mala.current && polido() && !reduz())
        anima(
          mala.current,
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(5px) scale(1.01, 0.98)' },
            { transform: 'translateY(0)' },
          ],
          { d: 320, e: MOLA },
        );
    });
  };
  /* `entrar` de `jogos3.js:233-249`. */
  const entrar = () => {
    s.fase = 'entrando';
    s.passo = 0;
    s.espiou = false;
    s.rota = s.nivel;
    s.slots = s.nivel;
    s.slotNovo = true;
    tags();
    abrir(true);
    dizerFala();
    pintar();
    const novo = cena.current?.querySelector(`.ml-slot[data-s="${s.nivel - 1}"]`);
    if (novo && polido() && !reduz()) {
      /* a palavra nova cai de cima no compartimento dela */
      anima(
        novo,
        [
          { transform: 'translateY(-170px) rotate(-12deg) scale(1.3)', opacity: 0 },
          { opacity: 1, offset: 0.35 },
          { transform: 'translateY(0) rotate(0deg) scale(1)', opacity: 1 },
        ],
        { d: 700, atraso: 420, e: MOLA_SUAVE },
      );
    }
    const nova = pal[s.nivel - 1];
    depois(520, () => {
      falar(nova.answer, nova.lang);
      sentir('encaixa', 'select');
    });
    depois(regras.aVistaMs, fechar);
  };

  /* `pj.clique` de `jogos3.js:250-283`. */
  const tocar = (item: MinigameItem, botao: HTMLElement) => {
    if (s.fase !== 'lembrando' || !ativo) return;
    const reg = registro(s.passo);
    if (s.espiou) reg.espiou = true;
    if (item.answer !== pal[s.passo].answer) {
      s.vidas--;
      s.seq = 0;
      reg.erros++;
      dizerFala(t('Não foi esta. A ordem conta, e a tentativa custou uma vida.'), true);
      recontar(resultados());
      celebrar({ tipo: 'erro', el: mala.current });
      flutuar(mala.current, t('−1 vida'), 'erro');
      if (!s.vidas) {
        s.fase = 'fim';
        finalizar();
      }
      return pintar();
    }
    voarTexto(botao, cena.current?.querySelector(`.ml-tag[data-t="${s.passo}"]`) ?? null, item.answer);
    falar(item.answer, item.lang);
    reg.colocou = true;
    reg.ms = Date.now() - inicioDaPosicao.current;
    inicioDaPosicao.current = Date.now();
    s.passo++;
    tags();
    if (s.passo < s.nivel) {
      sentir('encaixa', 'select');
      recontar(resultados());
      dizerFala();
      return pintar();
    }
    s.fase = 'pausa';
    s.adesivos = [...s.adesivos, { n: s.nivel, r: Math.round(Math.random() * 30 - 15) }];
    s.feitos++;
    /* Espiar custa (`jogos.js:334-338`): o acerto que vem depois não soma combo. */
    s.seq = s.espiou ? 0 : s.seq + 1;
    const antes = placar.pontos;
    const p = recontar(resultados());
    celebrar({ tipo: 'acerto', combo: s.seq, el: mala.current, pontos: p.pontos - antes });
    if (s.nivel >= pal.length) {
      dizerFala(t('Mala completa!'));
      s.completa = true;
      finalizar();
      return pintar();
    }
    dizerFala(t('Mala refeita. Entra mais uma palavra.'));
    s.nivel++;
    depois(1200, entrar);
    pintar();
  };

  /* `pj.ajuda` de `jogos3.js:284-296`: uma vez por nível, só enquanto a pessoa está lembrando. */
  const espiar = () => {
    if (s.fase !== 'lembrando' || s.espiou || !ativo) return;
    s.espiou = true;
    s.seq = 0;
    s.fase = 'espiando';
    s.slots = s.nivel;
    s.slotNovo = false;
    abrir(true);
    dizerFala(t('Espiando…'));
    pintar();
    depois(1500, () => {
      s.fase = 'lembrando';
      abrir(false);
      dizerFala();
      pintar();
    });
  };

  /* A primeira palavra entra 350 ms depois de a rodada começar a valer (`jogos3.js:297`). */
  useEffect(() => {
    if (!suficiente || !ativo || comecou.current) return;
    comecou.current = true;
    depois(350, entrar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, suficiente]);

  /* O avião chega à parada do nível (`rota`, `jogos3.js:201-205`). */
  const rota = s.rota;
  useEffect(() => {
    const li = cena.current?.querySelector<HTMLElement>(`.ml-rota li[data-n="${rota - 1}"]`);
    const aviao = li?.querySelector('.ml-aviao');
    if (!li || !aviao || rota <= 1 || !polido() || reduz()) return;
    anima(
      aviao,
      [
        { transform: `translate(${-(li.parentElement?.clientWidth ?? 0) / 5}px, 6px) rotate(-12deg)` },
        { transform: 'translate(0, -8px) rotate(6deg)', offset: 0.6 },
        { transform: 'translate(0,0) rotate(0deg)' },
      ],
      { d: 900, e: EIO },
    );
  }, [rota]);

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  if (!suficiente) return null;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={s.seq}
        acertos={placar.acertos}
        rotulo={`${s.feitos} de ${pal.length} ${unidadeDoPlacar('koffer')}`}
        progresso={s.feitos / Math.max(1, pal.length)}
        ajudas={
          <BotaoDeAjuda
            icone={Eye}
            rotulo={t('Espiar')}
            title="Conta como dica: zera o combo"
            data-ajuda="espiar"
            onClick={espiar}
          />
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <div ref={cena} className="ml-cena">
          <ol className="ml-rota" aria-label={t('Rota dos níveis')}>
            {pal.map((_, k) => (
              <li
                key={k}
                data-n={k}
                className={
                  s.completa || (s.rota > 0 && k < s.rota - 1)
                    ? 'feito'
                    : s.rota > 0 && k === s.rota - 1
                      ? 'atual'
                      : undefined
                }
              >
                {k + 1}
                {s.rota > 0 && k === s.rota - 1 && (
                  <span className="ml-aviao" aria-hidden="true">
                    <Plane data-pj-i="" />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="ml-palco">
            <div ref={mala} className={`ml-mala ${s.aberta ? 'aberta' : 'fechada'}`}>
              <span className="ml-alca" />
              <div className="ml-corpo">
                <div className="ml-slots">
                  {pal.map((it, k) => {
                    const tem = k < s.slots;
                    return (
                      <div
                        key={k}
                        className={`ml-slot${tem ? ' cheio' : ''}${k === s.slots - 1 && s.slotNovo ? ' nova' : ''}`}
                        data-s={k}
                      >
                        <i>{k + 1}</i>
                        {tem && (
                          <>
                            <b lang={it.lang}>{it.answer}</b>
                            <small>{it.prompt}</small>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="ml-tampa">
                <span className="ml-conta">
                  {s.tags > 0 && tp(s.tags, '{n} palavra na mala', '{n} palavras na mala')}
                </span>
                <div className="ml-tags">
                  {pal.slice(0, s.tags).map((it, k) => (
                    <span
                      key={k}
                      className={`ml-tag ${k < s.tagsPasso ? 'ok' : k === s.tagsPasso ? 'agora' : ''}`}
                      data-t={k}
                    >
                      <i>{k + 1}</i>
                      {k < s.tagsPasso ? it.answer : '?'}
                    </span>
                  ))}
                </div>
                <div className="ml-adesivos">
                  {s.adesivos.map((a) => (
                    <span key={a.n} className="ml-adesivo" style={{ '--r': `${a.r}deg` } as CSSProperties}>
                      {a.n}
                    </span>
                  ))}
                </div>
              </div>
              <span className="ml-fecho e" />
              <span className="ml-fecho d" />
            </div>
          </div>
          <div className="ml-rodape">
            <p className={`ml-fala${s.falaErro ? ' erro' : ''}`} role="status">
              {s.fala}
            </p>
            <span className="vidas" aria-label={tp(s.vidas, '{n} vida', '{n} vidas')}>
              {Array.from({ length: regras.vidas }, (_, k) => (
                <span key={k} className={k >= s.vidas ? 'perdida' : undefined}>
                  <Heart data-pj-i="" aria-hidden />
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className="pj-paleta ml-paleta">
          {paleta.map((it) => (
            <button
              key={it.answer}
              type="button"
              className="pj-opcao"
              data-op={it.answer}
              lang={it.lang}
              disabled={s.paletaPresa}
              onClick={(e) => tocar(it, e.currentTarget)}
            >
              {it.answer}
              {regras.etiquetasComTraducao && <small lang="">{it.prompt}</small>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
