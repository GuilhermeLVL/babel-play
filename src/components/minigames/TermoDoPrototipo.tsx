import type { ItemOutcome, RodadaTermo, RoundReport } from '@core';
import { montarEscada, planoDaEscada, scoreRound } from '@core';
import { Check, CornerDownLeft, Delete, Lightbulb, Volume2 } from 'lucide-react';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { regrasDoJogo, vezesDaAjuda } from '../../core/minigames/regras';
import { celebrar } from '../../lib/comemoracao';
import { useNivelDoJogo } from '../../lib/jogos/nivelDoJogo';
import { polido } from '../../lib/polimento/base';
import { flutuar, selo, tremer } from '../../lib/polimento/jogos';
import { play } from '../../lib/soundFx';
import AjudasGerais from './casca/AjudasGerais';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from './casca/HudDaRodada';
import { falarNoJogo as falar } from './noQuest';
import { textosDoJogo } from './polimento/textos';

/**
 * SOLETRAR (TERMO) — o tabuleiro do protótipo (`jogos4.js:263-412`, sobre `jogos.js:387-531`): a escada
 * de um tabuleiro e depois dois com o mesmo palpite, o teclado na tela, e a linha nova que já vem com as
 * letras verdes escritas e presas (com um tabuleiro só).
 *
 * As regras e os números são os do protótipo. O que é do app: as palavras (as suas, do tamanho que
 * tiverem), a nota de revisão de cada uma e o placar comum. A escada é a do protótipo, 1 e depois 2:
 * o degrau de quatro tabuleiros do desenho antigo não existe aqui.
 */

interface Props {
  rodadas: RodadaTermo[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

type Cor = 'certa' | 'lugar' | 'fora';

interface Tab {
  r: RodadaTermo;
  w: string;
  ok: boolean;
  falhou: boolean;
  /** As letras que a pessoa já sabe (verdes ou dadas por dica), por posição. */
  sabe: string[];
  /** As linhas já julgadas: as letras e a cor de cada uma. */
  linhas: Array<{ letras: string[]; res: Cor[]; venceu: boolean }>;
  /** A linha que leva a classe `atual` (a que venceu fica com ela). */
  atual: number;
  revela: string;
  dica: boolean;
}

/** A escada do protótipo (`DEGRAUS`, `jogos4.js:265`): uma palavra, depois duas ao mesmo tempo. */
const ESCADA = [1, 2];
const LINHAS_DO_TECLADO = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const PESO: Record<Cor, number> = { fora: 1, lugar: 2, certa: 3 };
const SUBIU = 'Subiu! Agora são duas ao mesmo tempo: o mesmo palpite vale para as duas.';

/** `julgar`, `jogos.js:388-399`: verde no lugar; amarelo enquanto houver letra sobrando; senão cinza. */
function julgar(p: string[], w: string[]): Cor[] {
  const r: Cor[] = w.map(() => 'fora');
  const resto: Record<string, number> = {};
  w.forEach((c, i) => {
    if (p[i] === c) r[i] = 'certa';
    else resto[c] = (resto[c] || 0) + 1;
  });
  p.forEach((c, i) => {
    if (r[i] !== 'certa' && resto[c]) {
      r[i] = 'lugar';
      resto[c]--;
    }
  });
  return r;
}

export default function TermoDoPrototipo({ rodadas, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('termo');
  const nivel = useNivelDoJogo('termo');
  const regras = regrasDoJogo('termo', nivel);
  const textos = textosDoJogo('termo');

  const degraus = useMemo(() => montarEscada(rodadas, planoDaEscada(rodadas.length, ESCADA)), [rodadas]);
  const total = degraus.reduce((n, d) => n + d.length, 0);

  const [, pintar] = useReducer((n: number) => n + 1, 0);
  const [sequencia, setSequencia] = useState(0);
  const [feitos, setFeitos] = useState(0);
  const [acertos, setAcertos] = useState(0);
  const [dicas, setDicas] = useState(() => vezesDaAjuda('termo', 'letra', nivel));
  const [instr, setInstr] = useState<string | null>(null);

  /* O estado do tabuleiro é o do protótipo, mexido à mão; `pintar()` redesenha. */
  const j = useRef({
    d: 0,
    tabs: [] as Tab[],
    linha: 0,
    max: 0,
    teclas: {} as Record<string, Cor>,
    /** As cores que o teclado mostra: só mudam quando o julgamento termina (`jogos4.js:343`). */
    pintadas: {} as Record<string, Cor>,
    cel: [] as string[],
    fix: [] as boolean[],
  }).current;
  const miolo = useRef<HTMLDivElement>(null);
  const trava = useRef(false);
  const seq = useRef(0);
  const comDica = useRef(false);
  const inicio = useRef(Date.now());
  const inicioDoDegrau = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };
  useEffect(() => () => esperas.current.forEach((t) => window.clearTimeout(t)), []);

  const tam = j.tabs[0]?.w.length ?? degraus[0]?.[0]?.resposta.length ?? 5;
  const tabEl = (k: number) => miolo.current?.querySelector<HTMLElement>(`[data-tab="${k}"]`) ?? null;
  const fileira = (k: number) =>
    miolo.current?.querySelector<HTMLElement>(`[data-tab="${k}"] .linha-termo:nth-child(${j.linha + 1})`) ?? null;

  /* Com um tabuleiro só, o que já é verde volta escrito: a pessoa só digita o que falta (`jogos4.js:270-277`). */
  const novaLinha = () => {
    const n = j.tabs[0].w.length;
    j.cel = j.tabs.length === 1 ? [...j.tabs[0].sabe] : Array<string>(n).fill('');
    j.fix = j.cel.map(Boolean);
    for (const t of j.tabs)
      if (j.tabs.length > 1 && t.sabe.some(Boolean)) t.revela = t.sabe.map((c) => c || '·').join('');
  };
  /* `armar`, `jogos4.js:288-300`. */
  const armar = () => {
    const ws = degraus[j.d];
    j.max = ws.length === 1 ? regras.tentativas.umTabuleiro : regras.tentativas.doisTabuleiros;
    j.linha = 0;
    j.teclas = {};
    j.pintadas = {};
    j.tabs = ws.map((r) => ({
      r,
      w: r.resposta.toUpperCase(),
      ok: false,
      falhou: false,
      sabe: Array<string>(r.resposta.length).fill(''),
      linhas: [],
      atual: 0,
      revela: '',
      dica: false,
    }));
    if (regras.primeiraLetraDada) for (const t of j.tabs) t.sabe[0] = t.w[0];
    inicioDoDegrau.current = Date.now();
    novaLinha();
  };
  /* Montado uma vez, antes do primeiro desenho. */
  if (!j.tabs.length && degraus.length) armar();

  const encerrar = () => {
    if (finalizou.current) return;
    finalizou.current = true;
    trava.current = true;
    const todos = outcomes.current;
    depois(900, () =>
      onFinish({
        gameId: 'termo',
        items: todos,
        score: scoreRound('termo', todos),
        durationMs: Date.now() - inicio.current,
      }),
    );
  };
  const registrar = (t: Tab, correct: boolean, attempts: number) => {
    outcomes.current.push({
      cardId: t.r.cardId,
      itemRef: t.r.palavra,
      correct,
      attempts,
      ms: Date.now() - inicioDoDegrau.current,
      hinted: t.dica,
      revealed: false,
    });
    return recontar(outcomes.current);
  };

  const digitar = (ch: string) => {
    const k = j.cel.indexOf('');
    if (trava.current || k < 0) return;
    j.cel[k] = ch;
    play('click');
    pintar();
  };
  /* Apagar pula as letras presas (`jogos4.js:308-316`). */
  const apagar = () => {
    if (trava.current) return;
    let k = j.cel.length - 1;
    while (k >= 0 && (!j.cel[k] || j.fix[k])) k--;
    if (k < 0) return;
    j.cel[k] = '';
    play('remove');
    pintar();
  };
  /* `enviar`, `jogos4.js:317-382`. */
  const enviar = () => {
    if (trava.current) return;
    if (j.cel.includes('')) {
      j.tabs.forEach((t, k) => !t.ok && tremer(fileira(k)));
      play('error');
      return;
    }
    trava.current = true;
    const palpite = [...j.cel];
    const fechadas: number[] = [];
    j.tabs.forEach((t, k) => {
      if (t.ok) return;
      const res = julgar(palpite, [...t.w]);
      res.forEach((x, i) => {
        if ((PESO[j.teclas[palpite[i]]] || 0) < PESO[x]) j.teclas[palpite[i]] = x;
        if (x === 'certa') t.sabe[i] = palpite[i];
      });
      const venceu = palpite.join('') === t.w;
      t.linhas.push({ letras: palpite, res, venceu });
      if (venceu) {
        t.ok = true;
        fechadas.push(k);
      }
    });
    pintar();
    if (polido()) for (let i = 0; i < palpite.length; i++) depois(i * 110, () => play('select'));
    depois(5 * 110 + 420, () => {
      j.pintadas = { ...j.teclas };
      for (const k of fechadas) {
        const t = j.tabs[k];
        const dica = comDica.current || t.dica;
        t.dica = dica;
        comDica.current = false;
        seq.current = dica ? 0 : seq.current + 1;
        setSequencia(seq.current);
        const p = registrar(t, true, j.linha + 1);
        setAcertos((n) => n + 1);
        setFeitos((n) => n + 1);
        celebrar({ tipo: 'acerto', combo: seq.current, el: tabEl(k), pontos: p.ganho });
        falar(t.r.palavra || t.r.resposta, t.r.lang);
      }
      if (!fechadas.length) {
        seq.current = 0;
        setSequencia(0);
      }
      for (const t of j.tabs) if (!t.ok) t.atual = -1;
      j.linha++;
      trava.current = false;
      if (j.tabs.every((t) => t.ok)) {
        pintar();
        if (++j.d >= degraus.length) return encerrar();
        trava.current = true;
        selo('Subiu!');
        play('levelUp');
        setInstr(SUBIU);
        return depois(1500, () => {
          trava.current = false;
          armar();
          pintar();
        });
      }
      if (j.linha >= j.max) {
        j.tabs.forEach((t, k) => {
          if (t.ok) return;
          t.falhou = true;
          registrar(t, false, j.max);
          setFeitos((n) => n + 1);
          seq.current = 0;
          setSequencia(0);
          celebrar({ tipo: 'erro', el: tabEl(k) });
        });
        pintar();
        return encerrar();
      }
      for (const t of j.tabs) if (!t.ok) t.atual = j.linha;
      novaLinha();
      pintar();
    });
  };
  /* `pj.tecla`, `jogos4.js:391-395`. Sem dependências: o ouvinte enxerga sempre o estado de agora. */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!ativo || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        return enviar();
      }
      if (e.key === 'Backspace') return apagar();
      if (/^[a-zA-Z]$/.test(e.key)) digitar(e.key.toUpperCase());
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  const aberto = () => j.tabs.findIndex((t) => !t.ok && !t.falhou);

  /* `pj.ajuda`, `jogos4.js:396-409`: a Dica revela a próxima letra desconhecida do primeiro tabuleiro aberto. */
  const dica = () => {
    const k0 = aberto();
    const t = j.tabs[k0];
    if (!t || !ativo || finalizou.current || dicas <= 0) return;
    const i = t.sabe.findIndex((c) => !c);
    if (i < 0 || trava.current) return;
    t.sabe[i] = t.w[i];
    t.dica = true;
    if (j.tabs.length === 1) {
      j.cel[i] = t.w[i];
      j.fix[i] = true;
    } else t.revela = t.sabe.map((c) => c || '·').join('');
    flutuar(tabEl(k0), `letra ${i + 1}`, '');
    seq.current = 0;
    comDica.current = true;
    setSequencia(0);
    setDicas((n) => n - 1);
    pintar();
  };
  const ouvir = () => {
    const t = j.tabs[aberto()];
    if (t) falar(t.r.palavra || t.r.resposta, t.r.lang);
  };

  if (!degraus.length) return null;

  /* O tabuleiro só ganha o selo quando o julgamento termina (`jogos4.js:344-349`): até lá a linha vencedora
     é a de agora (`linhas.length` passa de `linha`). */
  const resolvido = (t: Tab) => t.ok && t.linhas.length <= j.linha;

  const tecla = (c: string) => (
    <button key={c} type="button" data-tecla={c} className={j.pintadas[c] || undefined} onClick={() => digitar(c)}>
      {c}
    </button>
  );

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={sequencia}
        acertos={acertos}
        rotulo={`${Math.min(feitos, total)} de ${total} palavras`}
        progresso={feitos / Math.max(1, total)}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Dica"
              resta={dicas}
              title="Conta como dica: zera o combo"
              data-ajuda="letra"
              onClick={dica}
            />
            <BotaoDeAjuda icone={Volume2} rotulo="Ouvir" title="De graça" data-ajuda="ouvir" onClick={ouvir} />
            <AjudasGerais
              jogo="termo"
              parado={!ativo || finalizou.current}
              resposta={() =>
                j.tabs
                  .filter((t) => !t.ok && !t.falhou)
                  .map((t) => t.w)
                  .join(' · ') || null
              }
              aoVerResposta={() => {
                comDica.current = true;
                for (const t of j.tabs) if (!t.ok) t.dica = true;
                seq.current = 0;
                setSequencia(0);
              }}
            />
          </>
        }
      />
      {instr ? (
        <p className="pj-instr">{instr}</p>
      ) : (
        textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />
      )}
      <div ref={miolo} className="pj-miolo">
        <div className="tabs-termo pj-tabs" data-n={j.tabs.length} style={{ '--tam': tam } as React.CSSProperties}>
          {j.tabs.map((t, k) => (
            <div
              key={`${j.d}-${k}`}
              className={`tab-termo${resolvido(t) ? ' resolvido' : ''}${t.falhou ? ' falhou' : ''}`}
              data-tab={k}
            >
              <header>
                <span className="pista">{t.r.pista}</span>
                {resolvido(t) ? (
                  <span className="selo ok">
                    <Check data-pj-i="" aria-hidden /> certa
                  </span>
                ) : t.falhou ? (
                  <span className="selo erro">{t.w}</span>
                ) : (
                  <span className="revela">{t.revela}</span>
                )}
              </header>
              <div className="grade-termo">
                {Array.from({ length: j.max }, (_, l) => {
                  const feita = t.linhas[l];
                  const escrevendo = !feita && l === j.linha && !t.ok && !t.falhou;
                  return (
                    <div
                      key={l}
                      className={`linha-termo${t.atual === l ? ' atual' : ''}${feita?.venceu ? ' venceu' : ''}`}
                    >
                      {Array.from({ length: t.w.length }, (_, i) => {
                        const letra = feita ? feita.letras[i] : escrevendo ? j.cel[i] : '';
                        const classes = [
                          'letra',
                          letra && 'cheia',
                          feita?.res[i],
                          escrevendo && j.fix[i] && 'pj-fixa',
                        ].filter(Boolean);
                        return (
                          <span key={i} className={classes.join(' ')} style={{ '--i': i } as React.CSSProperties}>
                            {letra}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="teclado">
          {LINHAS_DO_TECLADO.map((l, n) => {
            const fim = n === LINHAS_DO_TECLADO.length - 1;
            return (
              <div className="fila" key={l}>
                {fim && (
                  <button
                    type="button"
                    className="largo"
                    data-tecla="Enter"
                    aria-label="Enviar palpite"
                    onClick={enviar}
                  >
                    <CornerDownLeft data-pj-i="" aria-hidden />
                  </button>
                )}
                {[...l].map(tecla)}
                {fim && (
                  <button type="button" className="largo" data-tecla="Backspace" aria-label="Apagar" onClick={apagar}>
                    <Delete data-pj-i="" aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
