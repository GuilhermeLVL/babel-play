import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { distractorsFor, extractKeywords, pontuarRodada, scoreRound } from '@core';
import { AlertTriangle, Lightbulb } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { mascararResposta } from '../../../core/learning/pistaDeJogo';
import { segundosDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import AjudasGerais from '../casca/AjudasGerais';
import { useAtalhosDasAlternativas } from '../casca/atalhos';
import AvisoDaJogada from '../casca/AvisoDaJogada';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';

/**
 * TABU — a definição chega SEM os termos que entregariam a resposta.
 *
 * As proibidas não vêm de baralho nenhum: saem do próprio material. `mascararResposta` tira a
 * palavra-alvo (e as flexões dela) do texto, e `extractKeywords` escolhe, no que sobrou, os
 * termos mais salientes — são esses que aparecem riscados. Item cujo texto não sustenta nenhuma
 * proibida fica fora da rodada: sem termo riscado o jogo é só uma definição comum.
 *
 * A resposta continua sendo ESCOLHA entre `answer` de outros itens. Auto-avaliação seria o único
 * lugar do app onde o resultado é declarado pelo jogador em vez de medido.
 */

interface TabooGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Quantos termos são riscados por carta. Mais que isto e não sobra definição para ler. */
const PROIBIDAS_POR_CARTA = 3;

interface CartaTabu {
  item: MinigameItem;
  /** O texto já sem a palavra-alvo. */
  texto: string;
  /** Os termos riscados, em minúsculas. */
  proibidas: string[];
  opcoes: string[];
  /** O texto veio da FRASE do item (e não de uma definição): a tela chama pelo nome certo. */
  daFrase: boolean;
}

function montarCartas(items: MinigameItem[]): CartaTabu[] {
  return items.flatMap((item) => {
    /* O texto mais longo entre frase e pista: o tabu vive de definição, e uma tradução de uma
       palavra não sustenta nenhum termo riscado. */
    const frase = (item.sentence ?? '').trim();
    const cru = [frase, item.prompt ?? ''].map((x) => x.trim()).sort((a, b) => b.length - a.length)[0];
    if (!cru) return [];
    const texto = mascararResposta(cru, item.answer);
    const proibidas = extractKeywords(texto, { max: PROIBIDAS_POR_CARTA, lang: item.lang }).map((p) => p.toLowerCase());
    if (!proibidas.length) return [];
    const distratores = distractorsFor(item, items, 3);
    if (!distratores.length) return [];
    const opcoes = [...distratores, item.answer];
    for (let i = opcoes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opcoes[i], opcoes[j]] = [opcoes[j], opcoes[i]];
    }
    return [{ item, texto, proibidas, opcoes, daFrase: !!frase && cru === frase }];
  });
}

export default function TabooGame({ items, ageProfile, onFinish, onExit }: TabooGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa); o placar do HUD sai dos resultados. */
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('taboo');
  const cartas = useMemo(() => montarCartas(items), [items]);

  const [idx, setIdx] = useState(0);
  const [liberadas, setLiberadas] = useState<string[]>([]);
  const nivel = useNivelDoJogo('taboo');
  const segundos = segundosDoJogo('taboo', ageProfile, nivel) ?? 30;
  const [restante, setRestante] = useState(segundos);
  const [resultado, setResultado] = useState<RoundReport | null>(null);
  /**
   * A carta respondida (ou vencida pelo tempo) fica na tela um instante com a certa marcada — antes
   * ela trocava na hora e quem errou nunca via qual era (QA dos jogos, 2026-09-26).
   */
  const [revelando, setRevelando] = useState<{ escolhida: string | null; certo: boolean } | null>(null);

  /** A pessoa viu a resposta desta carta: o acerto que vier conta como "com dica". */
  const comDicaRef = useRef(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioCartaRef = useRef(Date.now());
  const acabouRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cartas.length) onExit();
  }, [cartas, onExit]);

  const finalizar = (outcomes: ItemOutcome[]) => {
    if (acabouRef.current) return;
    acabouRef.current = true;
    /* Direto para o fim de rodada COMUM, como os outros jogos: a tela própria repetia os pontos e os
       acertos que `ResultadoDaRodada` mostra logo em seguida. */
    const relatorio: RoundReport = {
      gameId: 'taboo',
      items: outcomes,
      score: scoreRound('taboo', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    };
    setResultado(relatorio);
    setTimeout(() => onFinish(relatorio), 900);
  };

  const avancar = (outcome: ItemOutcome) => {
    const outcomes = outcomesRef.current;
    outcomes.push(outcome);
    recontar(outcomes);
    if (idx + 1 >= cartas.length) {
      finalizar(outcomes);
      return;
    }
    setIdx(idx + 1);
    setLiberadas([]);
    setRevelando(null);
    comDicaRef.current = false;
    setRestante(segundos);
    inicioCartaRef.current = Date.now();
  };

  useEffect(() => {
    if (!cartas.length || acabouRef.current || resultado || revelando) return;
    if (restante <= 0) {
      const carta = cartas[idx];
      celebrar({ tipo: 'erro', el: palcoRef.current });
      setRevelando({ escolhida: null, certo: false });
      const outcome: ItemOutcome = {
        cardId: carta.item.cardId,
        itemRef: carta.item.answer,
        correct: false,
        attempts: 1,
        ms: Date.now() - inicioCartaRef.current,
        revealed: true,
      };
      setTimeout(() => avancar(outcome), 1800);
      return;
    }
    if (!ativo) return; // o relógio para na contagem e na pausa
    const tique = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(tique);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante, ativo, idx, resultado, cartas, revelando]);

  /* A tecla escolhe pela posição; a função de verdade (`responder`) é definida abaixo, depois do
     retorno antecipado, por isso passa por um ref. */
  const porTeclaRef = useRef<(i: number) => void>(() => {});
  useAtalhosDasAlternativas(
    cartas[idx]?.opcoes.length ?? 0,
    (i) => porTeclaRef.current(i),
    !!cartas.length && ativo && !revelando && !resultado,
  );

  if (!cartas.length) return null;

  const carta = cartas[idx];
  const riscadas = carta.proibidas.filter((p) => !liberadas.includes(p));
  /* A definição vira pedaços para que só as proibidas saiam riscadas — o resto do texto fica
     exatamente como está, pontuação inclusive. */
  const pedacos = carta.texto.split(/([\p{L}\p{N}'’-]+)/gu);

  const responder = (op: string) => {
    if (acabouRef.current || revelando || !ativo) return;
    const certo = op === carta.item.answer;
    setRevelando({ escolhida: op, certo });
    const outcome: ItemOutcome = {
      cardId: carta.item.cardId,
      itemRef: carta.item.answer,
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioCartaRef.current,
      hinted: liberadas.length > 0 || comDicaRef.current,
    };
    if (certo) {
      /* O acerto comemora NA HORA, com o que a carta vale — a mesma conta que o placar vai fazer
         quando a carta sair da mesa (o resultado só entra depois da pausa de leitura). */
      const p = pontuarRodada('taboo', [...outcomesRef.current, outcome]);
      celebrar({ tipo: 'acerto', combo: p.sequenciaFinal, el: palcoRef.current, pontos: p.total - placar.pontos });
    } else {
      celebrar({ tipo: 'erro', el: palcoRef.current });
    }
    setTimeout(() => avancar(outcome), certo ? 700 : 1800);
  };
  porTeclaRef.current = (i) => {
    const op = carta.opcoes[i];
    if (op) responder(op);
  };

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o tabuleiro,
     que é deste jogo. */
  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={placar.sequencia}
        acertos={placar.acertos}
        rotulo={`Carta ${idx + 1} de ${cartas.length}`}
        tempo={restante}
        progresso={restante / segundos}
        pouco={restante <= 5}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Liberar 1"
              disabled={riscadas.length <= 1 || !!revelando}
              onClick={() => riscadas.length > 1 && setLiberadas((xs) => [...xs, riscadas[0]])}
            />
            <AjudasGerais
              jogo="taboo"
              parado={!ativo || !!revelando || !!resultado}
              aoGanharTempo={(s) => setRestante((r) => r + s)}
              resposta={() => carta.item.answer}
              aoVerResposta={() => {
                comDicaRef.current = true;
              }}
            />
          </>
        }
      />

      <div
        ref={palcoRef}
        data-qj="taboo"
        className="flex flex-col items-center justify-center gap-6 max-w-2xl mx-auto w-full"
      >
        <div data-tour="alvo" className="w-full rounded-2xl border-2 border-border-subtle bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="label-mono">
              {carta.daFrase ? t('Frase') : t('Definição')} ({idx + 1} de {cartas.length})
            </p>
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-error-ink">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
              {riscadas.length} proibida{riscadas.length === 1 ? '' : 's'}
            </span>
          </div>
          <p
            dir={direcaoDoTexto(carta.item.lang)}
            data-qp="leitura"
            className="text-[17px] sm:text-[19px] leading-relaxed text-ink"
          >
            {pedacos.map((p, i) =>
              riscadas.includes(p.toLowerCase()) ? (
                <s key={i} className="text-ink-faint decoration-error decoration-2">
                  {p}
                </s>
              ) : (
                <React.Fragment key={i}>{p}</React.Fragment>
              ),
            )}
          </p>
        </div>

        <div data-tour="alternativas" className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {carta.opcoes.map((op, posicao) => {
            const ehACerta = op === carta.item.answer;
            const foiEscolhida = revelando?.escolhida === op;
            return (
              <button
                key={op}
                onClick={() => responder(op)}
                disabled={!!revelando}
                aria-keyshortcuts={String(posicao + 1)}
                dir={direcaoDoTexto(carta.item.lang)}
                className={`py-4 px-4 rounded-2xl border-2 font-bold text-[16px] transition-colors ${
                  revelando && ehACerta
                    ? 'border-good bg-good-soft text-good-ink'
                    : revelando && foiEscolhida
                      ? 'border-error bg-error-soft text-error-ink'
                      : revelando
                        ? 'border-border-subtle bg-surface text-ink-faint'
                        : 'border-border-subtle bg-surface text-ink hover:border-accent cursor-pointer'
                }`}
              >
                {op}
              </button>
            );
          })}
        </div>
        {revelando && !revelando.certo && (
          <AvisoDaJogada
            tom="erro"
            rotulo={revelando.escolhida ? t('Não era essa. Era:') : t('O tempo acabou. Era:')}
            resposta={carta.item.answer}
            lang={carta.item.lang}
          />
        )}
      </div>
    </>
  );
}
