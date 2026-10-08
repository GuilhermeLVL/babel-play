import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { Check, Lightbulb, Sprout } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { vidasDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import AvisoDaJogada from '../casca/AvisoDaJogada';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useQuestNovo } from '../noQuest';
import BaoDoPrototipo from './BaoDoPrototipo';

/**
 * BAO — semear os pedaços da palavra nas covas, na ordem certa.
 *
 * A pista (`item.prompt`) fica sempre visível; a `answer` é partida em pedaços contíguos,
 * embaralhados nas covas, e a pessoa remonta a palavra semeando um pedaço por vez.
 *
 * POR QUE PEDAÇOS DE LETRAS, E NÃO SÍLABAS: silabação é regra DE CADA IDIOMA, e a única régua que
 * o app tem (`core/learning/text-stats`) é declaradamente uma heurística de inglês. Aplicá-la a
 * uma palavra alemã ou espanhola produziria uma divisão errada — e uma divisão errada ENSINA uma
 * segmentação falsa. Blocos contíguos não afirmam nada sobre fonologia: são pedaços da palavra
 * escrita, que é exatamente o que a mecânica pede para remontar.
 */

interface BaoGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Quantas covas o tabuleiro comporta sem virar caça-pedaço. */
const MIN_PECAS = 2;
const MAX_PECAS = 6;
/** Letras por pedaço, em média: 2,5 dá 3 pedaços numa palavra de 7 letras. */
const LETRAS_POR_PECA = 2.5;
/** Palavra curta demais não tem o que remontar. */
const MIN_LETRAS = 3;

/** Parte a palavra em blocos contíguos de tamanho quase igual. */
function partirPalavra(palavra: string): string[] {
  const letras = [...palavra];
  if (letras.length < 2) return [palavra];
  const quantas = Math.min(MAX_PECAS, Math.max(MIN_PECAS, Math.round(letras.length / LETRAS_POR_PECA)));
  const base = Math.floor(letras.length / quantas);
  const resto = letras.length % quantas;
  const pecas: string[] = [];
  let i = 0;
  for (let p = 0; p < quantas; p++) {
    const tamanho = base + (p < resto ? 1 : 0);
    pecas.push(letras.slice(i, i + tamanho).join(''));
    i += tamanho;
  }
  return pecas;
}

/** Embaralha GARANTINDO ordem diferente da original — semear na ordem dada seria vitória de graça. */
function embaralharPecas(pecas: string[]): string[] {
  if (pecas.length < 2) return [...pecas];
  const original = pecas.join('\u0000');
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    const a = [...pecas];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.join('\u0000') !== original) return a;
  }
  return [...pecas.slice(1), pecas[0]];
}

/** Quanto tempo a cova errada fica marcada antes de voltar ao normal. */
const MARCA_DO_ERRO_MS = 700;

/** No desenho novo o Bao é a cena do protótipo (`BaoDoPrototipo.tsx`); fora dele, o de sempre. */
export default function BaoGame(props: BaoGameProps) {
  return useQuestNovo() ? <BaoDoPrototipo {...props} /> : <BaoDeSempre {...props} />;
}

function BaoDeSempre({ items, ageProfile, onFinish, onExit }: BaoGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa); o placar do HUD sai dos resultados. */
  const { ativo } = useRodada();
  const nivel = useNivelDoJogo('bao');
  /** Toques errados tolerados por palavra antes de a palavra ser dada por não lembrada. */
  const errosTolerados = vidasDoJogo('bao', ageProfile, nivel) ?? 3;
  const [placar, recontar] = usePlacarDaRodada('bao');
  const def = MINIGAMES.bao;

  const rodada = useMemo(
    () => items.filter((it) => [...it.answer.trim()].length >= MIN_LETRAS).slice(0, def.maxItems),
    [items, def.maxItems],
  );
  const suficiente = rodada.length >= def.minItems;

  const [indice, setIndice] = useState(0);
  const [semeadas, setSemeadas] = useState<number[]>([]);
  const [erros, setErros] = useState(0);
  const [covaErrada, setCovaErrada] = useState<number | null>(null);
  /** A cova que está com a marca de erro agora. Some sozinha; o aviso escrito (`covaErrada`) fica. */
  const [covaMarcada, setCovaMarcada] = useState<number | null>(null);
  const [encerrado, setEncerrado] = useState(false);
  const [dicaUsada, setDicaUsada] = useState(false);
  /** Os toques acabaram nesta palavra: ela aparece inteira antes da próxima (QA dos jogos, 2026-09-26). */
  const [revelada, setRevelada] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioItemRef = useRef(Date.now());
  const dicaUsadaRef = useRef(false);
  /** A palavra corrente já fechou (acertada ou dada por perdida): as covas param de responder. */
  const palavraFechadaRef = useRef(false);
  const encerradoRef = useRef(false);
  const tabuleiroRef = useRef<HTMLDivElement | null>(null);

  const item = rodada[indice];

  /** Os pedaços na ORDEM CERTA e as covas (os mesmos pedaços, fora de ordem). */
  const pecas = useMemo(() => (item ? partirPalavra(item.answer) : []), [item]);
  const [covas, setCovas] = useState<string[]>([]);
  useEffect(() => {
    setCovas(embaralharPecas(pecas));
  }, [pecas]);

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const finalizar = (outcomes: ItemOutcome[], espera = 900) => {
    if (encerradoRef.current) return;
    encerradoRef.current = true;
    setEncerrado(true);
    setTimeout(
      () =>
        onFinish({
          gameId: 'bao',
          items: outcomes,
          score: scoreRound('bao', outcomes),
          durationMs: Date.now() - inicioRodadaRef.current,
        }),
      espera,
    );
  };

  const encerrarPalavra = (correct: boolean, errosDaPalavra: number) => {
    if (!item || palavraFechadaRef.current) return null;
    palavraFechadaRef.current = true;
    outcomesRef.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct,
      attempts: 1 + errosDaPalavra,
      ms: Date.now() - inicioItemRef.current,
      ...(dicaUsadaRef.current ? { hinted: true } : {}),
    });
    const placarNovo = recontar(outcomesRef.current);
    // Perdeu a palavra: ela aparece inteira e é dita — quem não lembrou sai sabendo.
    if (!correct) {
      setRevelada(true);
      falar(item.answer, item.lang);
    }

    if (indice + 1 >= rodada.length) {
      finalizar(outcomesRef.current, correct ? 900 : 1800);
      return placarNovo;
    }
    setTimeout(
      () => {
        setIndice((i) => i + 1);
        setSemeadas([]);
        setErros(0);
        setCovaErrada(null);
        setCovaMarcada(null);
        setRevelada(false);
        dicaUsadaRef.current = false;
        palavraFechadaRef.current = false;
        setDicaUsada(false);
        inicioItemRef.current = Date.now();
      },
      correct ? 800 : 1800,
    );
    return placarNovo;
  };

  const semear = (posicaoDaCova: number, el: HTMLElement | null) => {
    if (!ativo) return;
    if (encerradoRef.current || palavraFechadaRef.current || !item) return;
    if (semeadas.includes(posicaoDaCova) || semeadas.length >= pecas.length) return;

    /* Comparação por TEXTO e não por cova: palavras como "banana" repetem o mesmo pedaço, e
       qualquer cova que o contenha serve para a posição esperada. */
    if (covas[posicaoDaCova] !== pecas[semeadas.length]) {
      const total = erros + 1;
      setErros(total);
      setCovaErrada(posicaoDaCova);
      /* A COVA DESMARCA SOZINHA: a marca de erro ficava acesa até o próximo acerto, e uma cova vermelha
         parada lê como "esta não serve nunca", quando ela só não era a da vez. */
      setCovaMarcada(posicaoDaCova);
      setTimeout(() => setCovaMarcada((c) => (c === posicaoDaCova ? null : c)), MARCA_DO_ERRO_MS);
      celebrar({ tipo: 'erro', el });
      if (total >= errosTolerados) encerrarPalavra(false, total);
      return;
    }

    setCovaErrada(null);
    setCovaMarcada(null);
    const agora = [...semeadas, posicaoDaCova];
    setSemeadas(agora);
    if (agora.length >= pecas.length) {
      falar(item.answer, item.lang);
      // A palavra fechou: o acerto leva o que ela valeu na conta da rodada.
      const p = encerrarPalavra(true, erros);
      celebrar({ tipo: 'acerto', combo: p?.sequencia ?? placar.sequencia, el, ...(p ? { pontos: p.ganho } : {}) });
    } else {
      celebrar({ tipo: 'acerto', combo: placar.sequencia, el });
    }
  };

  /** A dica semeia o próximo pedaço por você — e rebaixa a nota da palavra inteira. */
  const usarDica = () => {
    if (encerradoRef.current || palavraFechadaRef.current || !item) return;
    if (dicaUsadaRef.current || semeadas.length >= pecas.length) return;
    dicaUsadaRef.current = true;
    setDicaUsada(true);
    const alvo = covas.findIndex((texto, i) => texto === pecas[semeadas.length] && !semeadas.includes(i));
    if (alvo >= 0) semear(alvo, null);
  };

  if (!suficiente || !item) return null;

  const montada = revelada ? item.answer : semeadas.map((i) => covas[i]).join('');
  const alvoGrande = ageProfile === 'kids' || ageProfile === 'senior';

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o tabuleiro,
     que é deste jogo. */
  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={placar.sequencia}
        acertos={placar.acertos}
        rotulo={`Palavra ${indice + 1} de ${rodada.length}`}
        progresso={indice / Math.max(1, rodada.length)}
        ajudas={<BotaoDeAjuda icone={Lightbulb} rotulo="Dica" disabled={encerrado || dicaUsada} onClick={usarDica} />}
      />

      <div data-qj="bao" className="flex flex-col items-center justify-center gap-6 w-full max-w-2xl mx-auto">
        {/* A PISTA — fica visível a rodada inteira. */}
        <div
          data-qp="pista"
          className="w-full text-center px-4 py-3 rounded-2xl bg-surface border border-border-subtle"
        >
          <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted font-bold mb-1">Pista</p>
          <p className="font-display font-black text-xl sm:text-2xl text-ink">{item.prompt}</p>
        </div>

        {/* O TABULEIRO */}
        <div
          data-tour="tabuleiro"
          ref={tabuleiroRef}
          className="w-full rounded-2xl border-2 border-border-subtle bg-surface p-5 sm:p-7 shadow-card flex flex-col items-center gap-5"
        >
          {/* A casa: a palavra sendo remontada. */}
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-ink-muted font-bold">
              <Sprout className="w-3.5 h-3.5 text-accent" /> Palavra montada
            </span>
            <div
              dir={direcaoDoTexto(item.lang)}
              className="font-display font-black text-3xl sm:text-4xl tracking-widest text-ink min-h-[1.2em]"
            >
              {montada}
              {!revelada && (
                <span className="text-ink-faint">{'·'.repeat(Math.max(0, pecas.length - semeadas.length))}</span>
              )}
            </div>
            <span className="text-[11px] font-mono text-ink-muted">
              {semeadas.length} de {pecas.length} {pecas.length === 1 ? 'pedaço' : 'pedaços'}
            </span>
          </div>

          {/* As covas. */}
          <div className={`grid gap-3 w-full ${pecas.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {covas.map((texto, i) => {
              const jaSemeada = semeadas.includes(i);
              return (
                <button
                  key={i}
                  data-tour={i === 0 ? 'cova' : undefined}
                  data-qp="peca-alta"
                  data-estado={jaSemeada ? 'certo' : covaMarcada === i ? 'errado' : undefined}
                  onClick={(e) => semear(i, e.currentTarget)}
                  disabled={jaSemeada || encerrado}
                  dir={direcaoDoTexto(item.lang)}
                  className={`rounded-2xl border-2 font-display font-black tracking-widest transition-colors ${
                    alvoGrande ? 'py-6 text-2xl' : 'py-5 text-xl'
                  } ${
                    jaSemeada
                      ? 'border-good bg-good-soft text-good-ink cursor-not-allowed'
                      : covaMarcada === i
                        ? 'border-error bg-error-soft text-error-ink'
                        : 'border-border-subtle bg-surface-hover text-ink hover:border-accent hover:bg-accent-soft/30 cursor-pointer'
                  }`}
                >
                  {jaSemeada ? <Check className="w-5 h-5 mx-auto text-good" /> : texto}
                </button>
              );
            })}
          </div>

          {revelada ? (
            <AvisoDaJogada
              tom="erro"
              rotulo={t('Acabaram as tentativas. Era:')}
              resposta={item.answer}
              lang={item.lang}
            />
          ) : (
            covaErrada !== null && (
              <p
                role="status"
                data-qp="veredito"
                data-estado="errado"
                className="text-sm font-bold text-error-ink px-3 py-1.5 rounded-xl bg-error-soft"
              >
                {t('Este pedaço não abre a palavra aqui. Restam {n}.', {
                  n: Math.max(0, errosTolerados - erros),
                })}
              </p>
            )
          )}
        </div>
      </div>
    </>
  );
}
