import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { Briefcase, Check, Eye, Lock, Unlock } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { falar } from '../../../lib/tts';
import AvisoDaJogada from '../casca/AvisoDaJogada';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';

/**
 * A MALA CUMULATIVA — "Ich packe meinen Koffer" jogado com as palavras do baralho.
 *
 * A cada nível uma palavra dos `items` entra na mala; a mala fecha e a pessoa reconstrói de
 * memória tudo o que já está lá dentro, NA ORDEM EM QUE ENTROU. Errar custa uma vida.
 *
 * O outcome é POR PALAVRA e acumulado: a mesma palavra é cobrada em todos os níveis seguintes ao
 * seu, então `attempts` soma os erros cometidos na posição dela ao longo da rodada inteira, e
 * `correct` diz se ela chegou a ser colocada no lugar certo alguma vez. Item nunca cobrado (a
 * rodada acabou antes de ele entrar na mala) não vira outcome.
 */

interface KofferGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Quanto tempo a mala fica aberta mostrando a palavra nova, por perfil (ms). */
const TEMPO_ABERTA: Record<AgeProfileType, number> = { kids: 2600, pro: 2000, senior: 3000 };
const VIDAS: Record<AgeProfileType, number> = { kids: 4, pro: 3, senior: 4 };
/** A espiada mostra a mala por este tempo e marca `hinted` em tudo que for cobrado no nível. */
const TEMPO_ESPIADA = 1200;

interface Registro {
  erros: number;
  colocou: boolean;
  ms: number;
  espiou: boolean;
}

function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function KofferGame({ items, ageProfile, onFinish, onExit }: KofferGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa); o placar do HUD sai dos resultados. */
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('koffer');
  const def = MINIGAMES.koffer;

  /* Duas palavras iguais na mala tornariam a ordem impossível de conferir por toque. */
  const rodada = useMemo(() => {
    const vistas = new Set<string>();
    const unicos: MinigameItem[] = [];
    for (const it of items) {
      const chave = it.answer.trim().toLowerCase();
      if (!chave || vistas.has(chave)) continue;
      vistas.add(chave);
      unicos.push(it);
    }
    return unicos.slice(0, def.maxItems);
  }, [items, def.maxItems]);

  const suficiente = rodada.length >= def.minItems;

  const [nivel, setNivel] = useState(1);
  const [fase, setFase] = useState<'entrando' | 'lembrando'>('entrando');
  const [posicao, setPosicao] = useState(0);
  const [vidas, setVidas] = useState(VIDAS[ageProfile]);
  const [espiando, setEspiando] = useState(false);
  const [errou, setErrou] = useState(false);
  const [encerrado, setEncerrado] = useState(false);
  /** Palheta embaralhada uma vez por nível: reembaralhar a cada toque entregaria a ordem. */
  const [palheta, setPalheta] = useState<MinigameItem[]>(() => embaralhar(items));

  const registrosRef = useRef<Map<number, Registro>>(new Map());
  const inicioRodadaRef = useRef(Date.now());
  const inicioPosicaoRef = useRef(Date.now());
  const espiouNoNivelRef = useRef(false);
  const encerradoRef = useRef(false);
  /** Quanto falta de mala aberta NESTE nível — o relógio só anda com a rodada ativa. */
  const abertaRestanteRef = useRef(TEMPO_ABERTA[ageProfile]);
  /** O nível cuja palavra nova já foi falada (a fala espera a contagem acabar). */
  const faladoNoNivelRef = useRef(0);
  /** Acabaram as vidas: a palavra que era a certa naquela posição, para a pessoa sair sabendo. */
  const [perdida, setPerdida] = useState<MinigameItem | null>(null);
  const malaRef = useRef<HTMLDivElement | null>(null);

  const naMala = rodada.slice(0, nivel);
  const esperado = naMala[posicao];

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  /** Os resultados até agora, por palavra — o relatório final e o placar ao vivo são a mesma conta. */
  const resultadosAteAqui = (): ItemOutcome[] => {
    const outcomes: ItemOutcome[] = [];
    rodada.forEach((item, i) => {
      const reg = registrosRef.current.get(i);
      if (!reg) return; // nunca cobrado: quem não foi perguntado não errou
      outcomes.push({
        cardId: item.cardId,
        itemRef: item.answer,
        correct: reg.colocou,
        attempts: 1 + reg.erros,
        ms: reg.ms,
        ...(reg.espiou ? { hinted: true } : {}),
      });
    });
    return outcomes;
  };

  const finalizar = (espera = 900) => {
    if (encerradoRef.current) return;
    encerradoRef.current = true;
    setEncerrado(true);

    const outcomes = resultadosAteAqui();

    setTimeout(
      () =>
        onFinish({
          gameId: 'koffer',
          items: outcomes,
          score: scoreRound('koffer', outcomes),
          durationMs: Date.now() - inicioRodadaRef.current,
        }),
      espera,
    );
  };

  // A mala abre com a palavra nova…
  useEffect(() => {
    if (!suficiente || encerradoRef.current) return;
    setFase('entrando');
    setPosicao(0);
    setErrou(false);
    setPalheta(embaralhar(rodada));
    espiouNoNivelRef.current = false;
    abertaRestanteRef.current = TEMPO_ABERTA[ageProfile];
  }, [nivel, suficiente, rodada, ageProfile]);

  /**
   * …e o tempo de mala aberta só corre com a RODADA ATIVA (QA dos jogos, 2026-09-26). O primeiro
   * nível abria durante a contagem 3-2-1, com o palco inerte, e fechava antes de a rodada começar: a
   * primeira pergunta era sobre uma palavra que ninguém viu. A pausa também não segurava a mala. Aqui
   * o relógio para quando a casca para, e retoma de onde estava; a palavra nova é falada quando a
   * mala abre DE VERDADE para quem joga.
   */
  useEffect(() => {
    if (fase !== 'entrando' || !ativo || !suficiente || encerradoRef.current) return;
    if (faladoNoNivelRef.current !== nivel) {
      faladoNoNivelRef.current = nivel;
      const nova = rodada[nivel - 1];
      if (nova) falar(nova.answer, nova.lang);
    }
    // Em passos de 100 ms: parar e retomar não perde nem ganha tempo de mala aberta.
    const PASSO = 100;
    const relogio = setInterval(() => {
      abertaRestanteRef.current -= PASSO;
      if (abertaRestanteRef.current > 0) return;
      clearInterval(relogio);
      setFase('lembrando');
      inicioPosicaoRef.current = Date.now();
    }, PASSO);
    return () => clearInterval(relogio);
  }, [fase, ativo, nivel, suficiente, rodada]);

  const registro = (i: number): Registro => {
    const atual = registrosRef.current.get(i);
    if (atual) return atual;
    const novo: Registro = { erros: 0, colocou: false, ms: 0, espiou: false };
    registrosRef.current.set(i, novo);
    return novo;
  };

  const espiar = () => {
    if (fase !== 'lembrando' || espiando || espiouNoNivelRef.current) return;
    espiouNoNivelRef.current = true;
    setEspiando(true);
    setTimeout(() => setEspiando(false), TEMPO_ESPIADA);
  };

  const tocar = (escolhido: MinigameItem, el: HTMLElement | null) => {
    if (fase !== 'lembrando' || encerradoRef.current || !esperado || !ativo) return;

    const reg = registro(posicao);
    if (espiouNoNivelRef.current) reg.espiou = true;

    if (escolhido.answer !== esperado.answer) {
      reg.erros += 1;
      setErrou(true);
      celebrar({ tipo: 'erro', el });
      recontar(resultadosAteAqui());
      const restantes = vidas - 1;
      setVidas(restantes);
      if (restantes <= 0) {
        // Sem vidas: a rodada acaba, mas não sem dizer qual era a palavra daquela posição.
        setPerdida(esperado);
        finalizar(2200);
      }
      return;
    }

    reg.colocou = true;
    reg.ms = Date.now() - inicioPosicaoRef.current;
    setErrou(false);
    const p = recontar(resultadosAteAqui());
    // A mala guarda os resultados por posição: o que a peça valeu é a diferença no placar.
    celebrar({ tipo: 'acerto', combo: p.sequencia, el, pontos: p.pontos - placar.pontos });
    falar(esperado.answer, esperado.lang);

    const proxima = posicao + 1;
    if (proxima < naMala.length) {
      setPosicao(proxima);
      inicioPosicaoRef.current = Date.now();
      return;
    }
    if (nivel >= rodada.length) {
      finalizar();
      return;
    }
    setNivel((n) => n + 1);
  };

  if (!suficiente) return null;

  const malaAberta = fase === 'entrando' || espiando;
  const alvoGrande = ageProfile === 'kids' || ageProfile === 'senior';

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o tabuleiro,
     que é deste jogo. */
  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={placar.sequencia}
        acertos={placar.acertos}
        rotulo={`Nível ${nivel} de ${rodada.length} · ${vidas} ${vidas === 1 ? 'vida' : 'vidas'}`}
        progresso={(nivel - 1) / Math.max(1, rodada.length)}
        ajudas={
          <BotaoDeAjuda
            icone={Eye}
            rotulo="Espiar"
            disabled={fase !== 'lembrando' || espiouNoNivelRef.current}
            onClick={espiar}
          />
        }
      />

      <div className="flex flex-col items-center justify-center gap-6 w-full max-w-3xl mx-auto">
        {/* A MALA */}
        <div
          data-tour="mala"
          ref={malaRef}
          className="w-full rounded-2xl border-2 border-border-subtle bg-surface p-5 sm:p-7 shadow-card"
        >
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle">
            <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-ink-muted font-bold">
              <Briefcase className="w-4 h-4 text-accent" />
              {naMala.length} {naMala.length === 1 ? 'palavra' : 'palavras'} na mala
            </span>
            <span
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold ${
                malaAberta ? 'bg-good-soft text-good-ink' : 'bg-error-soft text-error-ink'
              }`}
            >
              {malaAberta ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {malaAberta ? 'Mala aberta' : 'Mala fechada'}
            </span>
          </div>

          {malaAberta ? (
            <ol className="flex flex-wrap gap-2.5">
              {naMala.map((it, i) => (
                <li
                  key={it.answer}
                  dir={direcaoDoTexto(it.lang)}
                  className={`px-3.5 py-2 rounded-xl border font-display font-bold ${
                    i === nivel - 1 && fase === 'entrando'
                      ? 'border-accent bg-accent-soft text-accent-ink'
                      : 'border-border-subtle bg-surface-hover text-ink'
                  }`}
                >
                  <span className="font-mono text-[11px] text-ink-faint mr-1.5">{i + 1}</span>
                  {it.answer}
                  <span className="block text-[11px] font-sans font-medium text-ink-muted">{it.prompt}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <p className="font-display font-black text-xl text-ink">
                Passo {posicao + 1} de {naMala.length}: qual palavra entrou nesta posição?
              </p>
              <ol className="flex flex-wrap gap-2 justify-center">
                {naMala.slice(0, posicao).map((it, i) => (
                  <li
                    key={it.answer}
                    dir={direcaoDoTexto(it.lang)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-good-soft text-good-ink text-sm font-bold"
                  >
                    <Check className="w-3.5 h-3.5 text-good" />
                    <span className="font-mono text-[11px]">{i + 1}</span>
                    {it.answer}
                  </li>
                ))}
              </ol>
              {perdida ? (
                <AvisoDaJogada tom="erro" rotulo={t('Acabaram as vidas. Nesta posição estava:')} resposta={perdida.answer} lang={perdida.lang} />
              ) : (
                errou && (
                  <p className="text-sm font-bold text-error-ink px-3 py-1.5 rounded-xl bg-error-soft">
                    {t('Não foi esta. A ordem conta, e a tentativa custou uma vida.')}
                  </p>
                )
              )}
            </div>
          )}
        </div>

        {/* A PALHETA DE ENTRADA */}
        <div data-tour="entrada" className="w-full">
          <p className="text-xs font-mono uppercase tracking-widest text-ink-muted font-bold text-center mb-3">
            {fase === 'entrando' ? 'Guarde a ordem…' : 'Toque na palavra desta posição'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {palheta.map((it) => (
              <button
                key={it.answer}
                data-palavra={it.answer}
                onClick={(e) => tocar(it, e.currentTarget)}
                disabled={fase !== 'lembrando' || encerrado}
                dir={direcaoDoTexto(it.lang)}
                className={`rounded-xl border-2 border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft/30 transition-colors text-center font-display font-bold text-ink disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                  alvoGrande ? 'px-4 py-5 text-xl' : 'px-3 py-4 text-lg'
                }`}
              >
                {it.answer}
                <span className="block text-[11px] font-sans font-medium text-ink-muted">{it.prompt}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
