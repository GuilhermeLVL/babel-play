import type { ItemOutcome, RodadaFrase, RoundReport } from '@core';
import { acertosPosicionais, checkOrder, scoreRound } from '@core';
import { Check, Eraser, Lightbulb, Volume2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { juntarPalavras } from '../../core/minigames/palavrasDaFrase';
import { celebrar } from '../../lib/comemoracao';
import { t } from '../../lib/i18n';
import { multiplicador, pontosDoElemento } from '../../lib/juice';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda } from './casca/HudDaRodada';
import { falarNoJogo as falar, useQuestNovo, useVozNoJogo, VereditoNoQuest } from './noQuest';

/**
 * FRASE EMBARALHADA — reordenar as palavras de uma frase real da sua sessão.
 */

interface ScrambleGameProps {
  rodadas: RodadaFrase[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function ScrambleGame({ rodadas, ageProfile, onFinish }: ScrambleGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa). */
  const { ativo } = useRodada();
  const [acertos, setAcertos] = useState(0);
  const [indice, setIndice] = useState(0);
  const [montada, setMontada] = useState<number[]>([]); // índices na ordem escolhida
  const [conferido, setConferido] = useState<'certo' | 'errado' | null>(null);
  const [sequencia, setSequencia] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [usouDica, setUsouDica] = useState(false);
  const tentativasRef = useRef(1);
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioItemRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);

  const rodada = rodadas[indice];
  /* No Quest as palavras são peças de 56 px; "Ouvir" só aparece com voz para o idioma da frase (o
     significado está sempre escrito), e o acerto também vem dito em texto. */
  const questNovo = useQuestNovo();
  const haVoz = useVozNoJogo(rodada?.lang);
  const disponiveis = rodada ? rodada.embaralhada.map((_, i) => i).filter((i) => !montada.includes(i)) : [];
  const completa = rodada && montada.length === rodada.embaralhada.length;

  useEffect(() => {
    setMontada([]);
    setConferido(null);
    setUsouDica(false);
    tentativasRef.current = 1;
    inicioItemRef.current = Date.now();
  }, [indice]);

  const finalizarTudo = () => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    const todos = resultadosRef.current;
    setTimeout(
      () =>
        onFinish({
          gameId: 'scramble',
          items: todos,
          score: scoreRound('scramble', todos),
          durationMs: Date.now() - inicioRodadaRef.current,
        }),
      900,
    );
  };

  const conferir = (el: HTMLElement | null) => {
    if (!rodada || !completa || conferido === 'certo') return;
    const palavras = montada.map((i) => rodada.embaralhada[i]);
    if (checkOrder(palavras, rodada.correta)) {
      const nova = sequencia + 1;
      setAcertos((n) => n + 1);
      const mult = multiplicador(nova);
      const ganho = 10 * (usouDica ? 1 : mult);
      setSequencia(nova);
      setPontos((p) => p + ganho);
      celebrar({ tipo: 'acerto', combo: nova, el, pontos: ganho });
      setConferido('certo');

      // Fala a frase inteira montada com sucesso
      falar(juntarPalavras(rodada.correta, rodada.lang), rodada.lang);

      resultadosRef.current.push({
        ...(rodada.sentenceId ? { itemRef: rodada.sentenceId } : {}),
        correct: true,
        attempts: tentativasRef.current,
        ms: Date.now() - inicioItemRef.current,
        hinted: usouDica,
      });
      setTimeout(() => {
        if (indice + 1 >= rodadas.length) finalizarTudo();
        else setIndice((i) => i + 1);
      }, 1400);
      return;
    }
    // Errou: feedback sensorial com tremor
    setSequencia(0);
    celebrar({ tipo: 'erro', el: el ?? palcoRef.current });
    pontosDoElemento('Ordem incorreta', el, 'ruim');
    setConferido('errado');
    tentativasRef.current++;
    setTimeout(() => setConferido(null), 1400);
  };

  const desistir = () => {
    if (!rodada) return;
    resultadosRef.current.push({
      // Mesma razão do acerto: a frase PULADA é justamente a que o histórico precisa reconhecer.
      ...(rodada.sentenceId ? { itemRef: rodada.sentenceId } : {}),
      correct: false,
      attempts: tentativasRef.current,
      ms: Date.now() - inicioItemRef.current,
      hinted: usouDica,
      revealed: true,
    });
    setSequencia(0);
    if (indice + 1 >= rodadas.length) finalizarTudo();
    else setIndice((i) => i + 1);
  };

  /**
   * DICA: encaixa a PRÓXIMA palavra certa na linha.
   *
   * Só faz sentido se o começo da linha já estiver correto — encaixar a palavra da posição 3
   * numa linha errada desde a 1 não ajudaria ninguém. Então a dica primeiro DESFAZ até o último
   * prefixo correto e só depois acrescenta a palavra seguinte.
   */
  const pedirDica = (el: HTMLElement | null) => {
    if (!rodada || conferido === 'certo') return;
    const escolhidas = montada.map((i) => rodada.embaralhada[i]);
    let prefixo = 0;
    while (prefixo < escolhidas.length && escolhidas[prefixo] === rodada.correta[prefixo]) prefixo++;
    if (prefixo >= rodada.correta.length) return;
    const alvo = rodada.correta[prefixo];
    // A peça a encaixar precisa ser uma que ainda não está no prefixo bom.
    const usadas = montada.slice(0, prefixo);
    const idx = rodada.embaralhada.findIndex((w, i) => w === alvo && !usadas.includes(i));
    if (idx < 0) return;
    setUsouDica(true);
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    setMontada([...usadas, idx]);
    setConferido(null);
    pontosDoElemento('palavra ' + (prefixo + 1), el, 'neutro');
  };

  if (!rodada) return null;

  const acertosParciais =
    conferido === 'errado'
      ? acertosPosicionais(
          montada.map((i) => rodada.embaralhada[i]),
          rodada.correta,
        )
      : 0;

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o palco
     da Frase embaralhada, que é dele. */
  return (
    <>
      {/* Topo unificado */}

      <HudDaRodada
        pontos={pontos}
        sequencia={sequencia}
        acertos={acertos}
        rotulo={`Frase ${indice + 1} de ${rodadas.length}`}
        progresso={indice / rodadas.length}
        ajudas={
          <>
            {rodada.lang && haVoz && (
              <BotaoDeAjuda
                icone={Volume2}
                rotulo="Ouvir"
                onClick={() => falar(juntarPalavras(rodada.correta, rodada.lang), rodada.lang)}
                title="Ouvir a frase completa"
              />
            )}
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Próxima palavra"
              data-tour="dica-scramble"
              disabled={conferido === 'certo' || !ativo}
              onClick={(e) => pedirDica(e.currentTarget)}
              title="Dica: encaixar a próxima palavra"
              custo={t('limita a nota a "difícil"')}
            />
          </>
        }
      />

      <div ref={palcoRef} data-qj="scramble" className="w-full max-w-2xl mx-auto flex flex-col gap-5">
        {/* O SIGNIFICADO guia a ordem — sem ele o jogo vira tentativa e erro. */}
        <div className="text-center">
          <p className="label-mono mb-1">
            {ageProfile === 'senior' ? 'Monte a frase que quer dizer' : 'Esta frase significa'}
          </p>
          <p
            data-tour="traducao"
            data-qp="enunciado"
            className="font-display font-extrabold text-[17px] text-accent-ink leading-snug"
          >
            {rodada.traducao}
          </p>
        </div>

        {/* A LINHA que a pessoa monta */}
        <div
          data-qp="linha"
          data-estado={conferido === 'certo' ? 'certo' : conferido === 'errado' ? 'errado' : undefined}
          className={`min-h-[4.5rem] rounded-2xl border-2 border-dashed p-3 flex flex-wrap gap-2 items-start content-start transition-all ${
            conferido === 'certo'
              ? 'border-good bg-good-soft/30 shadow-md ring-2 ring-good/20'
              : conferido === 'errado'
                ? 'border-error bg-error-soft/20 animate-shake'
                : 'border-border-subtle bg-surface hover:border-accent/40'
          }`}
        >
          {montada.length === 0 && (
            <span className="text-[13px] text-ink-faint py-2 px-1">
              {ageProfile === 'senior'
                ? 'Toque nas palavras abaixo, na ordem certa.'
                : 'Clique nas palavras na ordem certa.'}
            </span>
          )}
          {montada.map((idx, pos) => (
            <button
              key={`${idx}-${pos}`}
              data-qp="peca"
              data-posta="true"
              onClick={() => {
                play('click');
                setMontada((m) => m.filter((_, k) => k !== pos));
              }}
              disabled={conferido === 'certo'}
              className="px-3.5 py-2 rounded-xl bg-accent-soft border border-accent/40 text-accent-ink font-bold text-[15px] cursor-pointer hover:brightness-95 active:scale-95 transition-all shadow-sm flex items-center gap-1 animate-scaleIn"
              title="Clique para tirar da frase"
            >
              {rodada.embaralhada[idx]}
            </button>
          ))}
        </div>

        {/* Feedback PARCIAL: diz quantas estão no lugar, sem entregar quais. */}
        {/* No headset o acerto vem escrito (fora dele, a borda verde e o som). E como tirar uma palavra
            da linha fica dito: o `title` só aparece com o ponteiro parado. */}
        {questNovo && conferido === 'certo' && <VereditoNoQuest certo>{t('Frase certa!')}</VereditoNoQuest>}
        {questNovo && !conferido && montada.length > 0 && (
          <p data-qp="apoio">{t('Toque numa palavra da linha para tirá-la.')}</p>
        )}
        {conferido === 'errado' && (
          <p className="text-center text-[13px] text-warn-ink animate-in fade-in font-bold">
            {acertosParciais > 0
              ? `${acertosParciais} ${acertosParciais === 1 ? 'palavra está' : 'palavras estão'} no lugar certo, continue.`
              : 'Ainda não. Tente começar por outra palavra.'}
          </p>
        )}

        {/* As PEÇAS disponíveis */}
        <div data-tour="pecas" className="flex flex-wrap gap-2 justify-center">
          {disponiveis.map((i) => (
            <button
              key={i}
              data-qp="peca"
              onClick={() => {
                play('add');
                falar(rodada.embaralhada[i], rodada.lang);
                setMontada((m) => [...m, i]);
              }}
              disabled={conferido === 'certo'}
              className="px-4 py-2.5 rounded-xl bg-surface border-2 border-border-subtle hover:border-accent text-ink font-bold text-[15px] cursor-pointer hover:-translate-y-1 active:scale-95 transition-all shadow-sm hover:shadow-md"
            >
              {rodada.embaralhada[i]}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3" data-qp="acoes">
          <button
            data-qp="acao"
            onClick={() => {
              play('click');
              setMontada([]);
            }}
            disabled={!montada.length || conferido === 'certo'}
            className="py-2.5 px-4 rounded-xl bg-canvas border border-border-subtle text-ink-muted hover:text-ink font-bold text-[13px] disabled:opacity-40 cursor-pointer flex items-center gap-1.5 transition-colors"
          >
            {/* "Limpar", e não "Recomeçar": o topo da rodada já tem um Recomeçar que refaz a RODADA
                inteira — dois botões com o mesmo nome e efeitos diferentes (QA, 2026-09-26). */}
            <Eraser className="w-3.5 h-3.5" aria-hidden /> {t('Limpar a linha')}
          </button>
          <button
            data-tour="conferir"
            data-qp="acao-pri"
            onClick={(e) => conferir(e.currentTarget)}
            disabled={!completa || conferido === 'certo'}
            className="py-2.5 px-6 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-[13px] shadow-btn disabled:opacity-40 cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <Check className="w-4 h-4" /> Conferir
          </button>
        </div>

        <button
          data-qp="acao"
          onClick={desistir}
          className="text-[11px] text-ink-faint hover:text-warn-ink underline cursor-pointer mx-auto"
        >
          pular esta frase
        </button>
      </div>
    </>
  );
}
