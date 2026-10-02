import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { distractorsFor, makeCloze, MINIGAMES, scoreRound } from '@core';
import { Volume2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { celebrar } from '../../../lib/comemoracao';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { botaoDaAlternativa, useAtalhosDasAlternativas } from '../casca/atalhos';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useQuestNovo, useVozNoJogo } from '../noQuest';

/**
 * VITENDAWILI — o enigma é a SUA PRÓPRIA FRASE com a palavra apagada.
 *
 * Charada autoral seria conteúdo inventado: aqui o enigma é a frase real de onde a palavra veio
 * (`item.sentence`, ou a `prompt` quando `item.clozed` diz que ela já é a frase com lacuna). A
 * frase é narrada com PAUSA na lacuna, e as alternativas são palavras reais da mesma rodada.
 *
 * ITEM SEM FRASE NÃO ENTRA: sem contexto não há enigma, e forjar um seria devolver material que a
 * pessoa nunca viu.
 */

interface VitendawiliGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** A lacuna do cloze do app é `_____`; aceitamos qualquer corrida de 3+ sublinhados. */
const LACUNA = /_{3,}/;
/** Silêncio no lugar da palavra apagada, para a lacuna ser OUVIDA e não só lida (ms). */
const PAUSA_NA_LACUNA = 700;

/** A frase com a lacuna, ou `null` quando este item não tem enigma possível. */
function enigmaDe(item: MinigameItem): string | null {
  if (item.clozed && LACUNA.test(item.prompt)) return item.prompt;
  const frase = item.sentence?.trim();
  if (!frase) return null;
  return makeCloze(frase, item.answer)?.prompt ?? null;
}

function narrarComPausa(texto: string, lang: string): void {
  const partes = texto.split(LACUNA);
  const antes = (partes[0] ?? '').trim();
  const depois = partes.slice(1).join(' ').trim();
  if (!antes) {
    if (depois) falar(depois, lang);
    return;
  }
  falar(antes, lang, {
    onEnd: () => {
      if (depois) setTimeout(() => falar(depois, lang), PAUSA_NA_LACUNA);
    },
  });
}

function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function VitendawiliGame({ items, ageProfile, onFinish, onExit }: VitendawiliGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa); o placar do HUD sai dos resultados. */
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('vitendawili');
  const def = MINIGAMES.vitendawili;

  /** Só os itens que têm frase: o enigma nasce dela ou não nasce. */
  const rodada = useMemo(() => {
    const comFrase: { item: MinigameItem; enigma: string }[] = [];
    for (const item of items) {
      const enigma = enigmaDe(item);
      if (enigma) comFrase.push({ item, enigma });
      if (comFrase.length >= def.maxItems) break;
    }
    return comFrase;
  }, [items, def.maxItems]);

  const suficiente = rodada.length >= def.minItems;

  const [indice, setIndice] = useState(0);
  const [eliminadas, setEliminadas] = useState<string[]>([]);
  const [encerrado, setEncerrado] = useState(false);
  /* NO QUEST a palavra certa fica marcada (cor e ícone) no instante antes do próximo enigma, e a errada
     ganha o ícone além do risco. "Ouvir" só aparece com voz para o idioma da frase: o enigma está
     sempre escrito. */
  const questNovo = useQuestNovo();
  const [acertada, setAcertada] = useState<string | null>(null);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioEnigmaRef = useRef(Date.now());
  const encerradoRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const atual = rodada[indice];
  const haVoz = useVozNoJogo(atual?.item.lang);

  const alternativas = useMemo(() => {
    if (!atual) return [];
    const outros = rodada.map((r) => r.item);
    return embaralhar([...distractorsFor(atual.item, outros, 3), atual.item.answer]);
  }, [atual, rodada]);

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  // Cada enigma é narrado ao entrar: a lacuna precisa ser ouvida, não só lida.
  useEffect(() => {
    if (!suficiente || !atual) return;
    setEliminadas([]);
    setAcertada(null);
    inicioEnigmaRef.current = Date.now();
    narrarComPausa(atual.enigma, atual.item.lang);
  }, [atual, suficiente]);

  const finalizar = (outcomes: ItemOutcome[]) => {
    if (encerradoRef.current) return;
    encerradoRef.current = true;
    setEncerrado(true);
    setTimeout(
      () =>
        onFinish({
          gameId: 'vitendawili',
          items: outcomes,
          score: scoreRound('vitendawili', outcomes),
          durationMs: Date.now() - inicioRodadaRef.current,
        }),
      900,
    );
  };

  const escolher = (palavra: string, el: HTMLElement | null) => {
    if (encerradoRef.current || !atual || eliminadas.includes(palavra) || !ativo) return;

    if (palavra !== atual.item.answer) {
      setEliminadas((prev) => [...prev, palavra]);
      celebrar({ tipo: 'erro', el });
      return;
    }

    outcomesRef.current.push({
      cardId: atual.item.cardId,
      itemRef: atual.item.answer,
      correct: true,
      attempts: 1 + eliminadas.length,
      ms: Date.now() - inicioEnigmaRef.current,
    });
    const p = recontar(outcomesRef.current);
    celebrar({ tipo: 'acerto', combo: p.sequencia, el, pontos: p.ganho });
    falar(atual.item.answer, atual.item.lang);
    setAcertada(palavra);

    if (indice + 1 >= rodada.length) {
      finalizar(outcomesRef.current);
      return;
    }
    setTimeout(() => setIndice((i) => i + 1), 800);
  };

  useAtalhosDasAlternativas(
    alternativas.length,
    (i) => {
      const palavra = alternativas[i];
      if (palavra) escolher(palavra, botaoDaAlternativa(palcoRef.current, 'alternativas', i));
    },
    suficiente && !!atual && ativo && !encerrado,
  );

  if (!suficiente || !atual) return null;

  const dir = direcaoDoTexto(atual.item.lang);
  const alvoGrande = ageProfile === 'kids' || ageProfile === 'senior';
  const [antes, ...resto] = atual.enigma.split(LACUNA);

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o tabuleiro,
     que é deste jogo. */
  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={placar.sequencia}
        acertos={placar.acertos}
        rotulo={`Enigma ${indice + 1} de ${rodada.length}`}
        progresso={indice / Math.max(1, rodada.length)}
        ajudas={
          haVoz ? (
            <BotaoDeAjuda
              icone={Volume2}
              rotulo="Ouvir"
              disabled={encerrado}
              onClick={() => narrarComPausa(atual.enigma, atual.item.lang)}
            />
          ) : undefined
        }
      />

      <div
        ref={palcoRef}
        data-qj="vitendawili"
        className="flex flex-col items-center justify-center gap-7 w-full max-w-2xl mx-auto"
      >
        <p
          data-tour="enigma"
          dir={dir}
          className="text-center font-display font-black text-2xl sm:text-3xl leading-snug text-ink"
        >
          {antes}
          <span
            className="inline-block align-baseline mx-1.5 px-6 border-b-4 border-accent"
            aria-label="palavra apagada"
          >
            &nbsp;
          </span>
          {resto.join(' ')}
        </p>

        <div data-tour="alternativas" className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {alternativas.map((palavra, posicao) => {
            const fora = eliminadas.includes(palavra);
            const certa = questNovo && acertada === palavra;
            return (
              <button
                key={palavra}
                data-estado={certa ? 'certo' : fora ? 'errado' : undefined}
                onClick={(e) => escolher(palavra, e.currentTarget)}
                disabled={fora || encerrado}
                aria-keyshortcuts={String(posicao + 1)}
                dir={dir}
                className={`rounded-2xl border-2 font-display font-black transition-colors ${
                  alvoGrande ? 'py-6 text-2xl' : 'py-5 text-xl'
                } ${
                  certa
                    ? 'border-good bg-good-soft text-good-ink'
                    : fora
                      ? 'border-border-subtle bg-surface text-ink-faint line-through cursor-not-allowed'
                      : 'border-border-subtle bg-surface text-ink hover:border-accent hover:bg-accent-soft/30 cursor-pointer'
                }`}
              >
                {palavra}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
