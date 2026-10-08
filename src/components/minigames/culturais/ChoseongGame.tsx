import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { chaveDoTermo, MINIGAMES, scoreRound } from '@core';
import { Delete, Lightbulb } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ajudasDoJogo, segundosDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import AjudasGerais from '../casca/AjudasGerais';
import AvisoDaJogada from '../casca/AvisoDaJogada';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useQuestNovo, VereditoNoQuest } from '../noQuest';

/**
 * CHOSEONG — as consoantes ficam à vista, as vogais somem, e a pessoa escreve a palavra a partir
 * do significado. É o 초성게임 transposto para o alfabeto latino, que é o que o gate garante
 * (`requisitos: { alfabeto: 'latino', escrita: 'teclado' }`).
 */

interface ChoseongGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const VOGAIS = ['A', 'E', 'I', 'O', 'U'];

interface Enigma {
  item: MinigameItem;
  /** A palavra sem acento e em maiúsculas — é nela que os slots e a comparação vivem. */
  alvo: string;
  ocultas: Set<number>;
}

export default function ChoseongGame({ items, ageProfile, onFinish, onExit }: ChoseongGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa); o placar do HUD sai dos resultados. */
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('choseong');
  /* Palavra sem nenhuma vogal não tem o que esconder: sai da rodada em vez de nascer resolvida. */
  const enigmas = useMemo<Enigma[]>(
    () =>
      items.flatMap((item) => {
        const alvo = chaveDoTermo(item.answer);
        const ocultas = new Set(alvo.split('').flatMap((c, i) => (VOGAIS.includes(c) ? [i] : [])));
        return alvo.length >= 2 && ocultas.size > 0 ? [{ item, alvo, ocultas }] : [];
      }),
    [items],
  );

  const suficiente = enigmas.length >= MINIGAMES.choseong.minItems;

  const [indice, setIndice] = useState(0);
  const [letras, setLetras] = useState<string[]>([]);
  /* O relógio declara de que palavra ele é: sem isso o zero da palavra anterior sobrevive um
     render à troca e dá a seguinte por perdida na hora, com um outcome de ms zero. */
  const nivel = useNivelDoJogo('choseong');
  const segundos = segundosDoJogo('choseong', ageProfile, nivel) ?? 15;
  const [relogio, setRelogio] = useState({ palavra: 0, segundos: segundos });
  const tempo = relogio.palavra === indice ? relogio.segundos : segundos;
  const [dicasRestantes, setDicasRestantes] = useState(() => ajudasDoJogo('choseong', 'vogal', nivel));
  const [acabou, setAcabou] = useState(false);
  /** O tempo acabou nesta palavra: ela fica à vista antes da próxima (QA dos jogos, 2026-09-26). */
  const [revelada, setRevelada] = useState(false);
  /* No Quest a tentativa errada também é dita em texto (fora dele, o tremor e o som bastam). As vogais
     são teclas na tela: não há campo, e o teclado do sistema não precisa subir. */
  const questNovo = useQuestNovo();
  const [errouAgora, setErrouAgora] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioItemRef = useRef(Date.now());
  const tentativasRef = useRef(1);
  const comDicaRef = useRef(false);
  const respondidoRef = useRef(false);
  const jaFinalizouRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const enigma: Enigma | undefined = enigmas[indice];

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const finalizar = useCallback(() => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    setAcabou(true);
    const outcomes = outcomesRef.current;
    const report: RoundReport = {
      gameId: 'choseong',
      items: outcomes,
      score: scoreRound('choseong', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    };
    setTimeout(() => onFinish(report), 1100);
  }, [onFinish]);

  const registrar = useCallback(
    (correct: boolean, revealed?: boolean) => {
      if (!enigma) return null;
      outcomesRef.current.push({
        cardId: enigma.item.cardId,
        itemRef: enigma.item.answer,
        correct,
        attempts: tentativasRef.current,
        ms: Date.now() - inicioItemRef.current,
        hinted: comDicaRef.current,
        ...(revealed ? { revealed: true } : {}),
      });
      return recontar(outcomesRef.current);
    },
    [recontar, enigma],
  );

  const avancar = useCallback(() => {
    if (indice + 1 >= enigmas.length) finalizar();
    else setIndice((i) => i + 1);
  }, [indice, enigmas.length, finalizar]);

  // Troca de palavra: as consoantes entram já preenchidas, as vogais nascem vazias.
  useEffect(() => {
    if (!enigma || jaFinalizouRef.current) return;
    inicioItemRef.current = Date.now();
    tentativasRef.current = 1;
    comDicaRef.current = false;
    respondidoRef.current = false;
    setRevelada(false);
    setErrouAgora(false);
    setLetras(enigma.alvo.split('').map((c, i) => (enigma.ocultas.has(i) ? '' : c)));
    setRelogio({ palavra: indice, segundos });
  }, [indice, enigma, segundos]);

  useEffect(() => {
    if (acabou || !enigma || respondidoRef.current) return;
    if (relogio.palavra !== indice) return;
    if (tempo <= 0) {
      /* Antes passava direto para a próxima: quem não lembrou saía sem ver a palavra. Agora as
         vogais se preenchem, a palavra é dita e o aviso fica à vista antes da troca. */
      respondidoRef.current = true;
      registrar(false, true);
      celebrar({ tipo: 'erro', el: palcoRef.current });
      setLetras(enigma.alvo.split(''));
      setRevelada(true);
      falar(enigma.item.answer, enigma.item.lang);
      setTimeout(avancar, 1800);
      return;
    }
    if (tempo <= 3) play('tick');
    if (!ativo) return; // o relógio para na contagem e na pausa
    const tique = setTimeout(
      () => setRelogio((r) => (r.palavra === indice ? { ...r, segundos: r.segundos - 1 } : r)),
      1000,
    );
    return () => clearTimeout(tique);
  }, [relogio, ativo, tempo, indice, acabou, enigma, registrar, avancar]);

  const conferir = useCallback(
    (montada: string[]) => {
      if (!enigma) return;
      if (montada.join('') === enigma.alvo) {
        respondidoRef.current = true;
        const p = registrar(true);
        celebrar({ tipo: 'acerto', combo: p?.sequencia ?? 0, el: palcoRef.current, pontos: p?.ganho });
        falar(enigma.item.answer, enigma.item.lang);
        setTimeout(avancar, 700);
        return;
      }
      tentativasRef.current += 1;
      celebrar({ tipo: 'erro', el: palcoRef.current });
      setErrouAgora(true);
      /* SÓ A VOGAL ERRADA SAI. Antes a palavra inteira esvaziava e a pessoa redigitava as que já tinha
         acertado: trabalho de dedo, não de memória. A tentativa continua contando (a nota cai igual). */
      setLetras(montada.map((l, i) => (enigma.ocultas.has(i) && l !== enigma.alvo[i] ? '' : l)));
    },
    [enigma, registrar, avancar],
  );

  const escrever = useCallback(
    (char: string) => {
      if (acabou || !enigma || respondidoRef.current) return;
      const vazio = letras.findIndex((l, i) => !l && enigma.ocultas.has(i));
      if (vazio === -1) return;
      const novas = [...letras];
      novas[vazio] = char;
      play('click');
      setErrouAgora(false);
      setLetras(novas);
      if (!novas.some((l, i) => !l && enigma.ocultas.has(i))) conferir(novas);
    },
    [acabou, enigma, letras, conferir],
  );

  const apagar = useCallback(() => {
    if (acabou || !enigma || respondidoRef.current) return;
    for (let i = letras.length - 1; i >= 0; i--) {
      if (enigma.ocultas.has(i) && letras[i]) {
        const novas = [...letras];
        novas[i] = '';
        setLetras(novas);
        return;
      }
    }
  }, [acabou, enigma, letras]);

  // Teclado físico: quem sabe a palavra escreve direto, sem caçar botão.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      // Na contagem e na pausa a tecla não é do tabuleiro (os outros jogos já respeitavam isto).
      if (!ativo || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        apagar();
        return;
      }
      const letra = e.key.toUpperCase();
      if (VOGAIS.includes(letra)) {
        e.preventDefault();
        escrever(letra);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [escrever, apagar, ativo]);

  const usarDica = () => {
    if (acabou || !enigma || respondidoRef.current || dicasRestantes <= 0) return;
    const vazio = letras.findIndex((l, i) => !l && enigma.ocultas.has(i));
    if (vazio === -1) return;
    setDicasRestantes((d) => d - 1);
    comDicaRef.current = true;
    play('timeBonus');
    const novas = [...letras];
    novas[vazio] = enigma.alvo[vazio];
    setLetras(novas);
    if (!novas.some((l, i) => !l && enigma.ocultas.has(i))) conferir(novas);
  };

  if (!suficiente) return null;

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o tabuleiro,
     que é deste jogo. */
  return (
    <div ref={palcoRef}>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={placar.sequencia}
        acertos={placar.acertos}
        rotulo={`Palavra ${indice + 1} de ${enigmas.length}`}
        tempo={tempo}
        progresso={tempo / segundos}
        pouco={tempo <= 3}
        ajudas={
          <>
            <BotaoDeAjuda icone={Lightbulb} rotulo="Abrir uma vogal" resta={dicasRestantes} onClick={usarDica} />
            <AjudasGerais
              jogo="choseong"
              parado={!ativo || acabou || revelada}
              aoGanharTempo={(s) => setRelogio((r) => (r.palavra === indice ? { ...r, segundos: r.segundos + s } : r))}
              resposta={() => enigma?.item.answer ?? null}
              aoVerResposta={() => {
                comDicaRef.current = true;
              }}
            />
          </>
        }
      />

      <div data-qj="choseong" className="flex flex-col items-center justify-center gap-6 w-full max-w-2xl mx-auto">
        <p data-tour="pista" className="text-base sm:text-lg font-bold text-ink text-center">
          {enigma?.item.prompt}
        </p>

        <div
          dir={direcaoDoTexto(enigma?.item.lang)}
          lang={enigma?.item.lang}
          data-qp="casas"
          className="flex flex-wrap justify-center gap-2 sm:gap-3"
        >
          {letras.map((letra, i) => {
            const oculta = enigma?.ocultas.has(i) ?? false;
            return (
              <span
                key={i}
                className={`w-12 h-14 sm:w-14 sm:h-16 rounded-2xl flex items-center justify-center font-display font-black text-2xl sm:text-3xl border-2 shadow-card
                  ${
                    !oculta
                      ? 'border-border-subtle bg-surface-hover text-ink-muted'
                      : letra
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-dashed border-border-subtle bg-surface text-ink-faint'
                  }`}
              >
                {letra}
              </span>
            );
          })}
        </div>

        <div data-tour="teclado" className="flex flex-wrap justify-center gap-2">
          {VOGAIS.map((v) => (
            <button
              key={v}
              data-qp="tecla"
              onClick={() => escrever(v)}
              className="px-4 py-3 rounded-xl border border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft hover:text-accent-ink font-display font-black text-lg shadow-card active:scale-95 transition-all cursor-pointer"
            >
              {v}
            </button>
          ))}
          <button
            data-qp="tecla"
            onClick={apagar}
            aria-label="Apagar a última vogal"
            className="px-4 py-3 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle text-ink-muted hover:text-ink shadow-card active:scale-95 transition-all cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {questNovo && errouAgora && !revelada && (
          <VereditoNoQuest certo={false}>
            {t('Não é essa. As vogais certas ficaram: troque as outras.')}
          </VereditoNoQuest>
        )}

        {revelada && enigma && (
          <AvisoDaJogada
            tom="erro"
            rotulo={t('O tempo acabou. Era:')}
            resposta={enigma.item.answer}
            lang={enigma.item.lang}
          />
        )}
      </div>
    </div>
  );
}
