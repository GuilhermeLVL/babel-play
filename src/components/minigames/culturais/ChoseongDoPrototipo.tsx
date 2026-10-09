import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { chaveDoTermo, MINIGAMES, scoreRound } from '@core';
import { Delete, Lightbulb } from 'lucide-react';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { regrasDoJogo, vezesDaAjuda } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { flutuar, palcoDaRodada } from '../../../lib/polimento/jogos';
import { sentir } from '../../../lib/polimento/sentidos';
import AjudasGerais from '../casca/AjudasGerais';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar } from '../noQuest';
import { textosDoJogo } from '../polimento/textos';

/**
 * CHOSEONG — o tabuleiro do protótipo (`jogos4.js:517-609`): o significado, a palavra só com as
 * consoantes, as vogais como caixas vazias e o teclado A E I O U. Ao preencher a última caixa a palavra é
 * conferida sozinha: as vogais certas ficam presas, só as erradas piscam em vermelho e saem.
 *
 * As regras e os números são os do protótipo. O que é do app: as palavras (as suas, sem acento nas
 * caixas, como o jogo sempre fez), a nota de revisão de cada uma e o placar comum.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const VOGAIS = 'AEIOU';

interface Enigma {
  item: MinigameItem;
  /** A palavra sem acento e em maiúsculas: é nela que as caixas e a comparação vivem. */
  alvo: string;
  /** Onde ficam as vogais. */
  pos: number[];
}

export default function ChoseongDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('choseong');
  const nivel = useNivelDoJogo('choseong');
  const regras = regrasDoJogo('choseong', nivel);
  const textos = textosDoJogo('choseong');
  const duracao = regras.segundos * 1000;

  /* Palavra sem nenhuma vogal não tem o que esconder: sai da rodada em vez de nascer resolvida. */
  const fila = useMemo<Enigma[]>(
    () =>
      items.flatMap((item) => {
        const alvo = chaveDoTermo(item.answer);
        const pos = [...alvo].flatMap((c, k) => (VOGAIS.includes(c) ? [k] : []));
        return alvo.length >= 2 && pos.length > 0 ? [{ item, alvo, pos }] : [];
      }),
    [items],
  );
  const suficiente = fila.length >= MINIGAMES.choseong.minItems;
  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const [, pintar] = useReducer((n: number) => n + 1, 0);
  const [i, setI] = useState(0);
  const [sequencia, setSequencia] = useState(0);
  const [resto, setResto] = useState(duracao);
  const [total, setTotal] = useState(duracao);
  const [dicas, setDicas] = useState(() => vezesDaAjuda('choseong', 'vogal', nivel));
  const [acabou, setAcabou] = useState(false);
  /** O primeiro relógio já começou (antes disso o placar não mostra tempo, como no protótipo). */
  const [comRelogio, setComRelogio] = useState(false);

  /* O estado da palavra é o do protótipo, mexido à mão; `pintar()` redesenha. */
  const j = useRef({
    de: -1,
    vog: [] as string[],
    presa: [] as boolean[],
    /** `certa` (acertou), `no` (as erradas, por 520 ms) ou `lugar` (o tempo acabou: a palavra aparece). */
    marca: null as null | 'certa' | 'no' | 'lugar',
    erradas: [] as boolean[],
  }).current;
  const enigma = fila[i] as Enigma | undefined;
  /* `prox`, `jogos4.js:528-538`: as caixas da palavra nova; no Fácil a primeira vogal já vem aberta. */
  if (enigma && j.de !== i) {
    j.de = i;
    j.vog = enigma.pos.map(() => '');
    j.presa = enigma.pos.map(() => false);
    j.marca = null;
    j.erradas = [];
    if (regras.primeiraVogalAberta && enigma.pos.length > 1) {
      j.vog[0] = enigma.alvo[enigma.pos[0]];
      j.presa[0] = true;
    }
  }

  const cho = useRef<HTMLDivElement>(null);
  const trava = useRef(false);
  const rodando = useRef(false);
  const relogioDe = useRef(-1);
  const fim = useRef(0);
  const totalRef = useRef(duracao);
  const restoRef = useRef(duracao);
  const ultimoTique = useRef(99);
  const seq = useRef(0);
  const comDica = useRef(false);
  const usouDica = useRef(false);
  const tentativas = useRef(1);
  const inicio = useRef(Date.now());
  const inicioDaPalavra = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };
  useEffect(
    () => () => {
      esperas.current.forEach((x) => window.clearTimeout(x));
      palcoDaRodada()?.classList.remove('tenso');
    },
    [],
  );

  const pararRelogio = () => {
    rodando.current = false;
    palcoDaRodada()?.classList.remove('tenso');
  };
  const registrar = (correct: boolean, revealed = false) => {
    if (!enigma) return null;
    outcomes.current.push({
      cardId: enigma.item.cardId,
      itemRef: enigma.item.answer,
      correct,
      attempts: tentativas.current,
      ms: Date.now() - inicioDaPalavra.current,
      hinted: usouDica.current,
      ...(revealed ? { revealed: true } : {}),
    });
    return recontar(outcomes.current);
  };
  const proxima = () => {
    if (i + 1 >= fila.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'choseong',
          items: todos,
          score: scoreRound('choseong', todos),
          durationMs: Date.now() - inicio.current,
        }),
      );
      return;
    }
    trava.current = false;
    setI(i + 1);
  };

  /* O relógio de cada palavra (`pjRelogio(pjSeg(15))`, `jogos4.js:543`): começa com a palavra, para com a rodada. */
  useEffect(() => {
    if (!suficiente || !enigma || acabou) return;
    if (!ativo) {
      if (!rodando.current) return;
      restoRef.current = Math.max(0, fim.current - performance.now());
      return () => {
        fim.current = performance.now() + restoRef.current;
      };
    }
    if (relogioDe.current !== i) {
      relogioDe.current = i;
      trava.current = false;
      comDica.current = false;
      usouDica.current = false;
      tentativas.current = 1;
      inicioDaPalavra.current = Date.now();
      fim.current = performance.now() + duracao;
      totalRef.current = duracao;
      ultimoTique.current = 99;
      rodando.current = true;
      setComRelogio(true);
      setTotal(duracao);
      setResto(duracao);
    }
    const passo = window.setInterval(() => {
      if (!rodando.current) return;
      const r = Math.max(0, fim.current - performance.now());
      restoRef.current = r;
      setResto(r);
      const s = Math.ceil(r / 1000);
      const pouco = r <= Math.min(10000, totalRef.current * 0.34);
      palcoDaRodada()?.classList.toggle('tenso', pouco);
      if (pouco && s < ultimoTique.current && r > 0) sentir('tique', 'tick');
      ultimoTique.current = pouco ? s : 99;
      if (r > 0) return;
      /* O tempo acabou (`jogos4.js:543-552`): a palavra aparece, conta erro, e vem a próxima em 1,3 s. */
      pararRelogio();
      trava.current = true;
      j.marca = 'lugar';
      seq.current = 0;
      setSequencia(0);
      registrar(false, true);
      celebrar({ tipo: 'erro', el: cho.current });
      flutuar(cho.current, t('o tempo acabou'), 'erro');
      pintar();
      depois(1300, proxima);
    }, 100);
    return () => window.clearInterval(passo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, i, acabou, suficiente]);

  /* `por`, `jogos4.js:554-581`: a vogal entra na primeira caixa vazia; na última, a palavra é conferida. */
  const por = (v: string) => {
    const k = j.vog.indexOf('');
    if (trava.current || !enigma || k < 0) return;
    j.vog[k] = v;
    sentir('tecla', 'click');
    pintar();
    if (j.vog.includes('')) return;
    trava.current = true;
    const erradas = j.vog.map((x, n) => x !== enigma.alvo[enigma.pos[n]]);
    if (!erradas.includes(true)) {
      pararRelogio();
      j.marca = 'certa';
      const dica = comDica.current;
      comDica.current = false;
      seq.current = dica ? 0 : seq.current + 1;
      setSequencia(seq.current);
      const p = registrar(true);
      celebrar({ tipo: 'acerto', combo: seq.current, el: cho.current, pontos: p?.ganho });
      falar(enigma.item.answer, enigma.item.lang);
      pintar();
      depois(1100, proxima);
      return;
    }
    /* As vogais certas ficam presas; só as erradas piscam em vermelho e saem. */
    j.marca = 'no';
    j.erradas = erradas;
    tentativas.current++;
    seq.current = 0;
    comDica.current = false;
    setSequencia(0);
    celebrar({ tipo: 'erro', el: cho.current });
    pintar();
    depois(520, () => {
      erradas.forEach((e, n) => {
        if (e) j.vog[n] = '';
        else j.presa[n] = true;
      });
      j.marca = null;
      j.erradas = [];
      trava.current = false;
      pintar();
    });
  };
  /* Apagar pula as vogais presas (`jogos4.js:582-590`). */
  const apagar = () => {
    if (trava.current) return;
    let k = j.vog.length - 1;
    while (k >= 0 && (!j.vog[k] || j.presa[k])) k--;
    if (k < 0) return;
    j.vog[k] = '';
    sentir('solta', 'remove');
    pintar();
  };

  /* `pj.tecla`, `jogos4.js:593-596`. Sem dependências: o ouvinte enxerga sempre o estado de agora. */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!ativo || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace') return apagar();
      if (/^[aeiouAEIOU]$/.test(e.key)) por(e.key.toUpperCase());
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  /* `pj.ajuda`, `jogos4.js:597-606`: abre a primeira vogal que ainda não está certa, e ela fica presa. Custa. */
  const abrirVogal = () => {
    if (!enigma || !ativo || dicas <= 0) return;
    const k = j.vog.findIndex((x, n) => x !== enigma.alvo[enigma.pos[n]]);
    if (trava.current || k < 0) return;
    j.vog[k] = '';
    seq.current = 0;
    comDica.current = true;
    usouDica.current = true;
    setSequencia(0);
    setDicas((n) => n - 1);
    depois(0, () => {
      j.presa[k] = true;
      por(enigma.alvo[enigma.pos[k]]);
    });
  };

  if (!suficiente || !enigma) return null;

  const feitos = outcomes.current.length;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={sequencia}
        acertos={placar.acertos}
        rotulo={`${Math.min(feitos, fila.length)} de ${fila.length} palavras`}
        tempo={comRelogio && !acabou ? resto / 1000 : undefined}
        progresso={comRelogio && !acabou ? resto / Math.max(1, total) : feitos / Math.max(1, fila.length)}
        feito={feitos / Math.max(1, fila.length)}
        pouco={resto <= Math.min(10000, total * 0.34)}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Abrir uma vogal"
              resta={dicas}
              title="Conta como dica: zera o combo"
              data-ajuda="vogal"
              onClick={abrirVogal}
            />
            <AjudasGerais
              jogo="choseong"
              parado={!ativo || acabou}
              aoGanharTempo={(s) => {
                if (!rodando.current) return false;
                fim.current += s * 1000;
                totalRef.current = Math.max(totalRef.current, fim.current - performance.now());
                setTotal(totalRef.current);
                setResto(Math.max(0, fim.current - performance.now()));
              }}
              resposta={() => enigma.item.answer}
              aoVerResposta={() => {
                comDica.current = true;
                usouDica.current = true;
                seq.current = 0;
                setSequencia(0);
              }}
            />
          </>
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <div className="termo-dica">
          <span className="label-mono">{t('Significa')}</span>
          <b>{enigma.item.prompt}</b>
        </div>
        <div
          key={i}
          ref={cho}
          className={`linha-termo pj-cho${j.marca === 'certa' ? ' venceu' : ''}`}
          lang={enigma.item.lang}
        >
          {[...enigma.alvo].map((c, k) => {
            const n = enigma.pos.indexOf(k);
            if (n < 0)
              return (
                <span key={k} className="letra pj-cons" style={{ '--i': k } as React.CSSProperties}>
                  {c}
                </span>
              );
            const revelada = j.marca === 'lugar';
            const classes = [
              'letra pj-vaga',
              j.vog[n] && 'cheia',
              j.presa[n] && j.marca !== 'certa' && 'pj-fixa',
              j.marca === 'certa' && 'certa',
              j.marca === 'no' && j.erradas[n] && 'pj-no',
              revelada && 'lugar',
            ].filter(Boolean);
            return (
              <span key={k} className={classes.join(' ')} style={{ '--i': k } as React.CSSProperties}>
                {revelada ? c : j.vog[n]}
              </span>
            );
          })}
        </div>
        <div className="teclado vogais">
          <div className="fila">
            {[...VOGAIS].map((v) => (
              <button key={v} type="button" data-tecla={v} onClick={() => por(v)}>
                {v}
              </button>
            ))}
            <button type="button" className="largo" data-tecla="Backspace" aria-label="Apagar" onClick={apagar}>
              <Delete data-pj-i="" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
