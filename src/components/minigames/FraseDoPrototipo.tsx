import type { ItemOutcome, RodadaFrase, RoundReport } from '@core';
import { scoreRound } from '@core';
import { Check, Lightbulb, RotateCcw, Volume2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { juntarPalavras } from '../../core/minigames/palavrasDaFrase';
import { regrasDoJogo, vezesDaAjuda } from '../../core/minigames/regras';
import { celebrar } from '../../lib/comemoracao';
import { t, tp } from '../../lib/i18n';
import { useNivelDoJogo } from '../../lib/jogos/nivelDoJogo';
import { anima, MOLA_SUAVE, polido, reduz } from '../../lib/polimento/base';
import { flutuar } from '../../lib/polimento/jogos';
import { sentir } from '../../lib/polimento/sentidos';
import AjudasGerais from './casca/AjudasGerais';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from './casca/HudDaRodada';
import { falarNoJogo as falar } from './noQuest';
import { textosDoJogo } from './polimento/textos';

/**
 * FRASE EMBARALHADA — o tabuleiro do protótipo (`jogos4.js:415-514`): o significado, a linha que a pessoa
 * monta, o banco de palavras (cada uma guarda o seu lugar), "Recomeçar", "Conferir" e "pular esta frase".
 * Ao conferir errado, o começo certo fica verde e preso; o resto fica vermelho e volta sozinho ao banco.
 *
 * As regras e os números são os do protótipo. O que é do app: as frases (as suas), a nota de cada uma e
 * o placar comum.
 */

interface Props {
  rodadas: RodadaFrase[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function FraseDoPrototipo({ rodadas, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('scramble');
  const nivel = useNivelDoJogo('scramble');
  const regras = regrasDoJogo('scramble', nivel);
  const textos = textosDoJogo('scramble');

  /** No Fácil a primeira palavra já vem no lugar (`jogos4.js:445-447`). */
  const linhaInicial = (n: number): number[] => {
    const r = rodadas[n];
    if (!r || !regras.primeiraPalavraNoLugar) return [];
    const k = r.embaralhada.findIndex((p) => p === r.correta[0]);
    return k < 0 ? [] : [k];
  };

  const [i, setI] = useState(0);
  /** As peças na linha, na ordem escolhida: cada uma é o seu índice em `embaralhada` (`data-k`). */
  const [linha, desenharLinha] = useState<number[]>(() => linhaInicial(0));
  /** Quantas do começo estão presas, em verde. */
  const [certas, desenharCertas] = useState(() => linhaInicial(0).length);
  const [aviso, setAviso] = useState('');
  /** `certa`: a frase fechou. `errada`: conferiu errado, e as peças de `errouDe` em diante estão em vermelho. */
  const [estado, setEstado] = useState<'certa' | 'errada' | null>(null);
  const [errouDe, setErrouDe] = useState(-1);
  const [sequencia, setSequencia] = useState(0);
  const [dicas, setDicas] = useState(() => vezesDaAjuda('scramble', 'dica', nivel));
  const [acabou, setAcabou] = useState(false);

  const rodada = rodadas[i] as RodadaFrase | undefined;
  const pal = rodada?.correta ?? [];
  const pecas = rodada?.embaralhada ?? [];

  const miolo = useRef<HTMLDivElement>(null);
  const linhaEl = useRef<HTMLDivElement>(null);
  const antes = useRef<Map<string, DOMRect> | null>(null);
  const trava = useRef(false);
  /* A linha e as presas vivem em `ref`; o estado só espelha para desenhar. Dois toques no mesmo instante
     leriam a mesma linha antiga do desenho anterior, e uma das palavras se perdia. */
  const linhaRef = useRef(linha);
  const certasRef = useRef(certas);
  const setLinha = (l: number[]) => {
    linhaRef.current = l;
    desenharLinha(l);
  };
  const setCertas = (n: number) => {
    certasRef.current = n;
    desenharCertas(n);
  };
  const seq = useRef(0);
  const comDica = useRef(false);
  const usouDica = useRef(false);
  const tentativas = useRef(1);
  const inicio = useRef(Date.now());
  const inicioDaFrase = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  /** Antes de mexer nas peças: onde cada uma está (o começo do FLIP de `desenhar`, `jogos4.js:420`). */
  const fotografar = () => {
    antes.current = new Map(
      [...(miolo.current?.querySelectorAll<HTMLElement>('[data-k]') ?? [])].map((x) => [
        x.dataset.k ?? '',
        x.getBoundingClientRect(),
      ]),
    );
  };
  /* FLIP: cada palavra parte de onde estava e pousa no lugar novo (`jogos4.js:425-432`). */
  useLayoutEffect(() => {
    const de = antes.current;
    antes.current = null;
    if (!de || !polido() || reduz()) return;
    for (const x of miolo.current?.querySelectorAll<HTMLElement>('[data-k]') ?? []) {
      const a = de.get(x.dataset.k ?? '');
      if (!a) continue;
      const para = x.getBoundingClientRect();
      const [dx, dy] = [a.left - para.left, a.top - para.top];
      if (Math.abs(dx) + Math.abs(dy) > 2)
        anima(x, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
          d: 460,
          e: MOLA_SUAVE,
        });
    }
  }, [linha, certas]);

  const prefixo = (l: number[]) => {
    let n = 0;
    while (n < l.length && pecas[l[n]] === pal[n]) n++;
    return n;
  };

  const encerrar = () => {
    if (finalizou.current) return;
    finalizou.current = true;
    trava.current = true;
    setAcabou(true);
    const todos = outcomes.current;
    depois(900, () =>
      onFinish({
        gameId: 'scramble',
        items: todos,
        score: scoreRound('scramble', todos),
        durationMs: Date.now() - inicio.current,
      }),
    );
  };
  /* `prox`, `jogos4.js:439-453`. */
  const proxima = () => {
    if (i + 1 >= rodadas.length) return encerrar();
    const inicial = linhaInicial(i + 1);
    tentativas.current = 1;
    usouDica.current = false;
    inicioDaFrase.current = Date.now();
    setLinha(inicial);
    setCertas(inicial.length);
    setAviso('');
    setEstado(null);
    setErrouDe(-1);
    setI(i + 1);
  };
  const registrar = (correct: boolean) => {
    if (!rodada) return null;
    outcomes.current.push({
      ...(rodada.sentenceId ? { itemRef: rodada.sentenceId } : {}),
      correct,
      attempts: tentativas.current,
      ms: Date.now() - inicioDaFrase.current,
      hinted: usouDica.current,
      ...(correct ? {} : { revealed: true }),
    });
    return recontar(outcomes.current);
  };

  /* `pj.clique` numa peça, `jogos4.js:458-467`: entra na linha, ou sai dela. */
  const tocar = (k: number) => {
    if (trava.current || !ativo) return;
    const atual = linhaRef.current;
    const naLinha = atual.includes(k);
    const nova = naLinha ? atual.filter((y) => y !== k) : [...atual, k];
    fotografar();
    setLinha(nova);
    setCertas(Math.min(certasRef.current, prefixo(nova)));
    sentir(naLinha ? 'solta' : 'encaixa', naLinha ? 'remove' : 'add');
    setEstado(null);
    setAviso('');
  };
  const limpar = () => {
    if (trava.current) return;
    fotografar();
    setLinha([]);
    setCertas(0);
  };
  /* Pular conta erro (`jogos4.js:469-473`). */
  const pular = () => {
    if (trava.current || !ativo) return;
    seq.current = 0;
    comDica.current = false;
    setSequencia(0);
    registrar(false);
    celebrar({ tipo: 'erro', el: null });
    proxima();
  };
  /* `conferir`, `jogos4.js:474-499`. */
  const conferir = () => {
    const linha = linhaRef.current;
    if (trava.current || !rodada || linha.length < pecas.length) return;
    const l = linhaEl.current;
    if (linha.map((k) => pecas[k]).join(' ') === pal.join(' ')) {
      trava.current = true;
      fotografar();
      setCertas(linha.length);
      setEstado('certa');
      const dica = comDica.current;
      comDica.current = false;
      seq.current = dica ? 0 : seq.current + 1;
      setSequencia(seq.current);
      const p = registrar(true);
      celebrar({ tipo: 'acerto', combo: seq.current, el: l, pontos: p?.ganho });
      falar(juntarPalavras(rodada.correta, rodada.lang), rodada.lang);
      depois(1400, () => {
        trava.current = false;
        proxima();
      });
      return;
    }
    /* Errou a ordem: o começo certo fica verde e preso; o resto volta sozinho para baixo. */
    const n = prefixo(linha);
    trava.current = true;
    tentativas.current++;
    setEstado('errada');
    setErrouDe(n);
    setAviso(
      !regras.dizQuantasCertas
        ? t('Ainda não. As que estavam fora de lugar voltaram.')
        : n
          ? tp(
              n,
              '{n} palavra ficou no lugar certo. As outras voltaram: continue daqui.',
              '{n} palavras ficaram no lugar certo. As outras voltaram: continue daqui.',
            )
          : t('Ainda não. As palavras voltaram: tente começar por outra.'),
    );
    seq.current = 0;
    comDica.current = false;
    setSequencia(0);
    celebrar({ tipo: 'erro', el: l });
    flutuar(l, t('Ordem incorreta'), 'erro');
    depois(750, () => {
      fotografar();
      setLinha(linhaRef.current.slice(0, n));
      setCertas(regras.dizQuantasCertas ? n : 0);
      setEstado(null);
      setErrouDe(-1);
      trava.current = false;
    });
  };

  /* `pj.ajuda`, `jogos4.js:501-511`: a Dica mantém o começo certo e encaixa a próxima palavra. Custa. */
  const dica = () => {
    if (trava.current || !ativo || !rodada || dicas <= 0) return;
    const linha = linhaRef.current;
    const n = prefixo(linha);
    if (n >= pal.length) return;
    const base = linha.slice(0, n);
    const k = pecas.findIndex((p, x) => p === pal[n] && !base.includes(x));
    if (k < 0) return;
    fotografar();
    setLinha([...base, k]);
    setCertas(n + 1);
    sentir('encaixa', 'add');
    flutuar(linhaEl.current, t('palavra {n}', { n: n + 1 }), '');
    seq.current = 0;
    comDica.current = true;
    usouDica.current = true;
    setSequencia(0);
    setDicas((x) => x - 1);
  };

  if (!rodada) return null;

  const feitos = outcomes.current.length;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={sequencia}
        acertos={placar.acertos}
        rotulo={`${Math.min(feitos, rodadas.length)} de ${rodadas.length} frases`}
        progresso={feitos / Math.max(1, rodadas.length)}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Dica"
              resta={dicas}
              title="Conta como dica: zera o combo"
              data-ajuda="dica"
              onClick={dica}
            />
            <BotaoDeAjuda
              icone={Volume2}
              rotulo="Ouvir"
              title="De graça"
              data-ajuda="ouvir"
              onClick={() => falar(juntarPalavras(rodada.correta, rodada.lang), rodada.lang)}
            />
            <AjudasGerais
              jogo="scramble"
              parado={!ativo || acabou}
              resposta={() => (rodada ? juntarPalavras(rodada.correta, rodada.lang) : null)}
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
      <div ref={miolo} className="pj-miolo">
        <div className="pj-centro">
          <span className="label-mono">{t('Esta frase significa')}</span>
          <p className="pj-traducao">{rodada.traducao}</p>
        </div>
        <div ref={linhaEl} className={`pj-linha${estado ? ` ${estado}` : ''}`} data-linha="">
          {linha.length ? (
            linha.map((k, n) => (
              <button
                key={k}
                type="button"
                className={`pj-peca na-linha${n < certas ? ' fixa' : ''}${errouDe >= 0 && n >= errouDe ? ' errou' : ''}`}
                data-k={k}
                title={t('Toque para tirar da frase')}
                lang={rodada.lang}
                onClick={() => tocar(k)}
              >
                {pecas[k]}
              </button>
            ))
          ) : (
            <span className="pj-vazio">{t('Toque nas palavras na ordem certa.')}</span>
          )}
        </div>
        <p className="pj-aviso" role="status">
          {aviso}
        </p>
        <div className="pj-pecas" data-banco="">
          {pecas.map((p, k) =>
            linha.includes(k) ? (
              <button key={`f${k}`} type="button" className="pj-peca fantasma" disabled aria-hidden="true">
                {p}
              </button>
            ) : (
              <button key={k} type="button" className="pj-peca" data-k={k} lang={rodada.lang} onClick={() => tocar(k)}>
                {p}
              </button>
            ),
          )}
        </div>
        <div className="pj-acoes">
          <button type="button" className="btn btn-outline" data-pj="limpar" disabled={!linha.length} onClick={limpar}>
            <RotateCcw data-pj-i="" aria-hidden /> {t('Recomeçar')}
          </button>
          <button
            type="button"
            className="btn btn-solid"
            data-pj="conferir"
            disabled={linha.length < pecas.length}
            onClick={conferir}
          >
            <Check data-pj-i="" aria-hidden /> {t('Conferir')}
          </button>
        </div>
        <button type="button" className="pj-link" data-pj="pular" onClick={pular}>
          {t('pular esta frase')}
        </button>
      </div>
    </>
  );
}
