import type { ItemOutcome, RodadaConectores, RoundReport } from '@core';
import { notaConectores, scoreRound } from '@core';
import { Check, Link2 } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { celebrar } from '../../lib/comemoracao';
import { t } from '../../lib/i18n';
import { multiplicador, pontosDoElemento } from '../../lib/juice';
import type { AgeProfileType } from '../../lib/profile';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada from './casca/HudDaRodada';
import { useQuestNovo, VereditoNoQuest } from './noQuest';

/**
 * CAÇA-CONECTORES — marcar as palavras que amarram as ideias da frase.
 */

interface ConectoresGameProps {
  rodadas: RodadaConectores[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function ConectoresGame({ rodadas, ageProfile, onFinish }: ConectoresGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa). */
  const { ativo } = useRodada();
  const [acertos, setAcertos] = useState(0);
  const [indice, setIndice] = useState(0);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [conferido, setConferido] = useState<ReturnType<typeof notaConectores> | null>(null);
  const [pontos, setPontos] = useState(0);
  const [sequencia, setSequencia] = useState(0);

  const resultadosRef = useRef<ItemOutcome[]>([]);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const encerradoRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const rodada = rodadas[indice];
  const LIMIAR = 70;
  /* No Quest cada palavra é uma peça de 56 px, e o resultado de cada uma vem com ícone além da cor. */
  const questNovo = useQuestNovo();

  const alternar = (i: number) => {
    if (conferido) return;
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const conferir = () => {
    if (!rodada || conferido || !ativo) return;
    const n = notaConectores([...marcados], rodada.alvos);
    setConferido(n);
    const certo = n.f1 >= LIMIAR;

    resultadosRef.current.push({
      ...(rodada.fala.id ? { itemRef: rodada.fala.id } : {}),
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioItemRef.current,
    });

    if (certo) {
      const nova = sequencia + 1;
      setAcertos((n) => n + 1);
      const mult = multiplicador(nova);
      const ganho = 10 * mult;
      setSequencia(nova);
      setPontos((p) => p + ganho);
      celebrar({ tipo: 'acerto', combo: nova, el: palcoRef.current, pontos: ganho });
    } else {
      setSequencia(0);
      celebrar({ tipo: 'erro', el: palcoRef.current });
      pontosDoElemento('Revise os conectores', palcoRef.current, 'ruim');
    }

    setTimeout(
      () => {
        if (indice + 1 >= rodadas.length) {
          if (encerradoRef.current) return;
          encerradoRef.current = true;
          const todos = resultadosRef.current;
          setTimeout(
            () =>
              onFinish({
                gameId: 'conectores',
                items: todos,
                score: scoreRound('conectores', todos),
                durationMs: Date.now() - inicioRodadaRef.current,
              }),
            900,
          );
          return;
        }
        setIndice((i) => i + 1);
        setMarcados(new Set());
        setConferido(null);
        inicioItemRef.current = Date.now();
      },
      certo ? 1300 : 2600,
    );
  };

  if (!rodada) return null;
  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o palco
     dos Conectores, que é dele. */
  return (
    <>
      {/* Topo unificado */}

      <HudDaRodada
        pontos={pontos}
        sequencia={sequencia}
        acertos={acertos}
        rotulo={`Frase ${indice + 1} de ${rodadas.length}`}
        progresso={indice / rodadas.length}
      />

      <div ref={palcoRef} data-qj="conectores" className="w-full max-w-2xl mx-auto flex flex-col items-center gap-5">
        <p className="flex items-center gap-2 text-[13px] text-ink-muted text-center" data-qp="apoio">
          <Link2 className="w-4 h-4 text-accent shrink-0" aria-hidden />
          {ageProfile === 'senior'
            ? 'Toque nas palavras que ligam uma ideia à outra.'
            : 'Marque as palavras que amarram as ideias, as que mudam o rumo da frase.'}
        </p>

        {/* A FRASE, palavra por palavra clicável. */}
        <p data-tour="frase-conectores" className="flex flex-wrap justify-center gap-x-1.5 gap-y-2 text-center">
          {rodada.tokens.map((palavra, i) => {
            const marcado = marcados.has(i);
            const eraAlvo = rodada.alvos.includes(i);
            return (
              <button
                key={i}
                data-qp="peca"
                data-estado={
                  conferido
                    ? eraAlvo && marcado
                      ? 'certo'
                      : eraAlvo
                        ? 'faltou'
                        : marcado
                          ? 'errado'
                          : undefined
                    : undefined
                }
                aria-pressed={conferido ? undefined : marcado}
                onClick={() => alternar(i)}
                disabled={!!conferido}
                className={`px-2.5 py-1.5 rounded-lg font-display font-bold text-[16px] transition-all ${
                  conferido
                    ? // Depois de conferir: verde no que era, vermelho no que foi marcado à toa,
                      // contorno no que passou despercebido. Os três casos precisam ser visíveis.
                      eraAlvo && marcado
                      ? 'bg-good text-white'
                      : eraAlvo
                        ? 'border-2 border-good text-good-ink'
                        : marcado
                          ? 'bg-error-soft text-error-ink line-through'
                          : 'text-ink-faint'
                    : marcado
                      ? 'bg-accent text-white cursor-pointer'
                      : 'text-ink hover:bg-surface-hover cursor-pointer'
                }`}
              >
                {palavra}
              </button>
            );
          })}
        </p>

        {rodada.fala.translation && (
          <p className="text-[12px] text-ink-muted text-center max-w-[52ch]">{rodada.fala.translation}</p>
        )}

        {conferido ? (
          <div className="flex flex-col items-center gap-1 animate-in fade-in">
            {questNovo && (
              <VereditoNoQuest certo={conferido.f1 >= LIMIAR}>
                {conferido.f1 >= LIMIAR ? t('Passou!') : t('Ainda não: precisa de 70 pontos.')}
              </VereditoNoQuest>
            )}
            <p className="font-display font-black text-lg text-ink">{conferido.f1} pontos de precisão</p>
            <p className="text-[12px] text-ink-muted">
              {conferido.certos} {conferido.certos === 1 ? 'certo' : 'certos'}
              {conferido.falsos > 0 && ` · ${conferido.falsos} marcado à toa`}
              {conferido.perdidos > 0 && ` · ${conferido.perdidos} passou batido`}
            </p>
          </div>
        ) : (
          <button
            data-tour="conferir"
            data-qp="acao-pri"
            onClick={conferir}
            className="py-3 px-6 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-[14px] shadow-btn cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> Conferir
          </button>
        )}
      </div>
    </>
  );
}
