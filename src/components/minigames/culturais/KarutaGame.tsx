import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { distractorsFor, MINIGAMES, scoreRound } from '@core';
import { Eye, Volume2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { segundosDoJogo } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
import { idiomaDaInterface, t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { hasVoiceFor, isTtsSupported, vozesCarregadas } from '../../../lib/tts';
import AjudasGerais from '../casca/AjudasGerais';
import { botaoDaAlternativa, useAtalhosDasAlternativas } from '../casca/atalhos';
import AvisoDaJogada from '../casca/AvisoDaJogada';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useNoHeadset, useVozNoJogo } from '../noQuest';

/**
 * KARUTA — o narrador declama a PISTA e as cartas na mesa trazem as palavras candidatas.
 *
 * A inversão é o jogo inteiro. Declamar a RESPOSTA e espalhar respostas escritas casava som com
 * grafia: a pessoa achava a carta sem lembrar de nada. Ouvindo o SIGNIFICADO e tocando na palavra,
 * a rodada volta a ser recuperação — a mesma pergunta do Duelo, feita pelo ouvido.
 */

interface KarutaGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Teto de cartas na mesa: acima disso a varredura vira sorte. */
const CARTAS_NA_MESA = 6;

function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function KarutaGame({ items, ageProfile, onFinish, onExit }: KarutaGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa); o placar do HUD sai dos resultados. */
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('karuta');
  const suficiente = items.length >= MINIGAMES.karuta.minItems;

  const [indice, setIndice] = useState(0);
  /**
   * O relógio DECLARA de que carta ele é.
   *
   * Com `tempo` solto, o zero da carta anterior sobrevivia um render à troca: o efeito de reset
   * zera a guarda de "já respondeu" antes do efeito do relógio rodar, e o relógio — ainda em 0,
   * porque o `setTempo` do reset só chega no render seguinte — dava a carta NOVA por perdida na
   * hora, com um outcome de ms zero. Amarrar o relógio ao índice fecha a janela.
   */
  const nivel = useNivelDoJogo('karuta');
  const segundos = segundosDoJogo('karuta', ageProfile, nivel) ?? 8;
  const [relogio, setRelogio] = useState({ carta: 0, segundos: segundos });
  const tempo = relogio.carta === indice ? relogio.segundos : segundos;
  const [acertada, setAcertada] = useState<string | null>(null);
  const [errada, setErrada] = useState<string | null>(null);
  const [acabou, setAcabou] = useState(false);
  /** O tempo desta carta acabou: a certa fica marcada e dita antes da próxima. */
  const [revelada, setRevelada] = useState<string | null>(null);
  /** A pessoa pediu para LER a pista (vale como dica). */
  const [pistaAberta, setPistaAberta] = useState(false);
  /** A pessoa pediu para ver a resposta: o aviso não fala em tempo esgotado. */
  const [desistiu, setDesistiu] = useState(false);
  const pistaLidaRef = useRef(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioItemRef = useRef(Date.now());
  const tentativasRef = useRef(0);
  const respondidoRef = useRef(false);
  const jaFinalizouRef = useRef(false);
  const mesaRef = useRef<HTMLDivElement | null>(null);

  const item: MinigameItem | undefined = items[indice];

  /* A pista é a TRADUÇÃO, e tradução está no idioma de quem joga — não no de `item.lang`. Falar a
     pista com a voz da língua praticada leria "casa" com sotaque inglês. A exceção é a pista
     `clozed`, que é a frase real: essa sim está em `item.lang`. */
  const idiomaDaFala = item?.clozed ? item.lang : idiomaDaInterface();

  /** A mesa: a carta certa mais os distratores que os OUTROS itens da rodada derem. */
  const mesa = useMemo(() => {
    if (!item) return [];
    const quantos = Math.min(CARTAS_NA_MESA, items.length) - 1;
    return embaralhar([item.answer, ...distractorsFor(item, items, quantos)]);
  }, [item, items]);

  /**
   * SEM VOZ PARA A PISTA, A PISTA É ESCRITA (QA dos jogos, 2026-09-26). A regra antiga só olhava
   * se o navegador TEM síntese de voz, e quase todos têm. Com a lista de vozes carregada e nenhuma
   * no idioma da pista, a fala é omitida (`falar` avisa em vez de ler com voz estrangeira) e a
   * rodada ficava insolúvel: nada falado, nada escrito.
   */
  /* NO QUEST a conta é outra: o navegador tem a API de voz e NENHUMA voz, e a lista nunca "chega".
     Ali quem responde é `haVozPara` (a voz do site lê alguns idiomas com a nuvem ligada). Sem voz
     para o idioma da pista, ela aparece escrita, sem custar dica, e "Ouvir de novo" não aparece. */
  /* É do APARELHO: no computador com o desenho novo vale a regra de sempre (a lista de vozes do navegador). */
  const noHeadsetAqui = useNoHeadset();
  const haVozDaPista = useVozNoJogo(idiomaDaFala);
  const semVozParaAPista = noHeadsetAqui
    ? !haVozDaPista
    : !isTtsSupported() || (vozesCarregadas() && !hasVoiceFor(idiomaDaFala));
  const pistaVisivel = semVozParaAPista || pistaAberta;

  const narrar = useCallback(() => {
    if (!item) return;
    falar(item.prompt, idiomaDaFala);
  }, [item, idiomaDaFala]);

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const finalizar = useCallback(() => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    setAcabou(true);
    const outcomes = outcomesRef.current;
    const report: RoundReport = {
      gameId: 'karuta',
      items: outcomes,
      score: scoreRound('karuta', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    };
    setTimeout(() => onFinish(report), 1100);
  }, [onFinish]);

  const registrar = useCallback(
    (correct: boolean, revealed?: boolean) => {
      if (!item) return null;
      outcomesRef.current.push({
        cardId: item.cardId,
        itemRef: item.answer,
        correct,
        attempts: Math.max(1, tentativasRef.current),
        ms: Date.now() - inicioItemRef.current,
        ...(pistaLidaRef.current ? { hinted: true } : {}),
        ...(revealed ? { revealed: true } : {}),
      });
      return recontar(outcomesRef.current);
    },
    [recontar, item],
  );

  const avancar = useCallback(() => {
    if (indice + 1 >= items.length) finalizar();
    else setIndice((i) => i + 1);
  }, [indice, items.length, finalizar]);

  // Troca de carta: zera o relógio e as tentativas, e o narrador declama de novo.
  useEffect(() => {
    if (!item || jaFinalizouRef.current) return;
    inicioItemRef.current = Date.now();
    tentativasRef.current = 0;
    respondidoRef.current = false;
    pistaLidaRef.current = false;
    setAcertada(null);
    setErrada(null);
    setRevelada(null);
    setPistaAberta(false);
    setDesistiu(false);
    setRelogio({ carta: indice, segundos });
    narrar();
  }, [indice, item, segundos, narrar]);

  // O relógio da carta. Um `setTimeout` por segundo, como no Duelo.
  useEffect(() => {
    if (acabou || !item || respondidoRef.current) return;
    if (relogio.carta !== indice) return;
    if (tempo <= 0) {
      // A carta certa acende e é dita antes da próxima: quem não achou sai sabendo qual era.
      respondidoRef.current = true;
      registrar(false, true);
      celebrar({ tipo: 'erro', el: mesaRef.current });
      setRevelada(item.answer);
      falar(item.answer, item.lang);
      setTimeout(avancar, 1800);
      return;
    }
    if (tempo <= 3) play('tick');
    if (!ativo) return; // o relógio para na contagem e na pausa
    const tique = setTimeout(
      () => setRelogio((r) => (r.carta === indice ? { ...r, segundos: r.segundos - 1 } : r)),
      1000,
    );
    return () => clearTimeout(tique);
  }, [relogio, ativo, tempo, indice, acabou, item, registrar, avancar]);

  const golpear = (carta: string, el: HTMLElement | null) => {
    if (acabou || !item || respondidoRef.current || !ativo) return;
    tentativasRef.current += 1;

    if (carta !== item.answer) {
      // "Otetsuki": a carta errada volta para a mesa e a rodada continua — só a nota cai.
      setErrada(carta);
      setTimeout(() => setErrada(null), 420);
      celebrar({ tipo: 'erro', el: el ?? mesaRef.current });
      return;
    }

    respondidoRef.current = true;
    setAcertada(carta);
    const p = registrar(true);
    celebrar({ tipo: 'acerto', combo: p?.sequencia ?? 0, el, pontos: p?.ganho });
    falar(item.answer, item.lang);
    setTimeout(avancar, 700);
  };

  useAtalhosDasAlternativas(
    mesa.length,
    (i) => {
      const carta = mesa[i];
      if (carta) golpear(carta, botaoDaAlternativa(mesaRef.current, 'cartas', i));
    },
    suficiente && ativo && !acabou && !revelada,
  );

  if (!suficiente) return null;

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o tabuleiro,
     que é deste jogo. */
  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={placar.sequencia}
        acertos={placar.acertos}
        rotulo={`Carta ${indice + 1} de ${items.length}`}
        tempo={tempo}
        progresso={tempo / segundos}
        pouco={tempo <= 3}
        ajudas={
          <>
            {!(noHeadsetAqui && semVozParaAPista) && (
              <BotaoDeAjuda icone={Volume2} rotulo={t('Ouvir de novo')} data-tour="placar" onClick={narrar} />
            )}
            {!semVozParaAPista && (
              <BotaoDeAjuda
                icone={Eye}
                rotulo={t('Ler a pista')}
                disabled={pistaAberta || !!revelada}
                title={t('Mostra a pista escrita (conta como dica)')}
                onClick={() => {
                  pistaLidaRef.current = true;
                  setPistaAberta(true);
                }}
              />
            )}
            <AjudasGerais
              jogo="karuta"
              parado={!ativo || acabou || !!revelada || !!acertada}
              aoGanharTempo={(s) => setRelogio((r) => (r.carta === indice ? { ...r, segundos: r.segundos + s } : r))}
              aoVerResposta={() => {
                setDesistiu(true);
                setRelogio((r) => (r.carta === indice ? { ...r, segundos: 0 } : r));
              }}
            />
          </>
        }
      />

      <div
        data-qj="karuta"
        data-qp="faixa-da-pista"
        className="px-6 py-3 border-b border-border-subtle bg-surface/60 flex items-center justify-between gap-3"
      >
        {/* Sem voz para a pista o jogo seria insolúvel: aí a pista aparece escrita. Com voz, ler é
            uma dica que a pessoa pede. */}
        {pistaVisivel ? (
          <p data-tour="pista" className="text-sm font-bold text-ink">
            {item?.prompt}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">{t('O narrador já declamou a pista. Repita quando quiser.')}</p>
        )}
      </div>

      <div ref={mesaRef} className="flex items-start justify-center">
        <div data-tour="cartas" className="w-full max-w-4xl grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
          {mesa.map((carta, posicao) => {
            const certa = carta === acertada || carta === revelada;
            const furada = carta === errada;
            return (
              <button
                key={carta}
                onClick={(e) => golpear(carta, e.currentTarget)}
                disabled={acabou || certa || !!revelada}
                aria-keyshortcuts={String(posicao + 1)}
                dir={direcaoDoTexto(item?.lang)}
                lang={item?.lang}
                className={`aspect-[4/3] rounded-2xl border-2 px-4 py-3 flex items-center justify-center text-center font-display font-black text-xl sm:text-2xl shadow-card transition-all cursor-pointer
                  ${
                    certa
                      ? 'border-good bg-good-soft text-good-ink'
                      : furada
                        ? 'border-error bg-error-soft text-error-ink'
                        : 'border-border-subtle bg-surface text-ink hover:border-accent hover:text-accent hover:-translate-y-1'
                  }`}
              >
                {carta}
              </button>
            );
          })}
        </div>
      </div>
      {revelada && (
        <div className="max-w-4xl mx-auto w-full mt-4">
          <AvisoDaJogada
            tom="erro"
            rotulo={desistiu ? t('A resposta era:') : t('O tempo acabou. Era:')}
            resposta={revelada}
            lang={item?.lang}
          />
        </div>
      )}
    </>
  );
}
