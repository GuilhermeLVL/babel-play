import React, { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Check, Lightbulb } from 'lucide-react';
import type { ItemOutcome, RoundReport, RodadaFrase } from '@core';
import { checkOrder, acertosPosicionais, scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, pontosDoElemento, multiplicador } from '../../lib/juice';

/**
 * FRASE EMBARALHADA — reordenar as palavras de uma frase real da sua sessão.
 *
 * Treina ORDEM DAS PALAVRAS, a única habilidade que nenhum exercício do app cobria. A tradução
 * fica visível de propósito: é o significado que guia a ordem, e sem ela o jogo viraria
 * tentativa e erro cego.
 *
 * Montagem por CLIQUE (e não arrastar): arrastar é frágil no toque, quebra com leitor de tela e
 * é impossível pelo teclado. Clicar na palavra a manda para a linha; clicar na linha a devolve.
 *
 * A DICA põe a PRÓXIMA palavra certa no lugar. É a ajuda que destrava sem resolver: quem empacou
 * na primeira palavra recebe o começo e segue sozinho. Custa nota 2 (`hinted`) naquela frase.
 */

interface ScrambleGameProps {
  rodadas: RodadaFrase[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function ScrambleGame({ rodadas, ageProfile, onFinish, onExit }: ScrambleGameProps) {
  const [indice, setIndice] = useState(0);
  const [montada, setMontada] = useState<number[]>([]);   // índices na ordem escolhida
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
  const disponiveis = rodada ? rodada.embaralhada.map((_, i) => i).filter(i => !montada.includes(i)) : [];
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
    const impecavel = todos.length > 0 && todos.every(o => o.correct && o.attempts <= 1 && !o.hinted);
    comemorar(impecavel ? 'rodadaPerfeita' : todos.some(o => o.correct) ? 'rodadaBoa' : 'erro', palcoRef.current, { tremer: impecavel });
    setTimeout(() => onFinish({
      gameId: 'scramble',
      items: todos,
      score: scoreRound('scramble', todos),
      durationMs: Date.now() - inicioRodadaRef.current,
    }), 900);
  };

  const conferir = (el: HTMLElement | null) => {
    if (!rodada || !completa || conferido === 'certo') return;
    const palavras = montada.map(i => rodada.embaralhada[i]);
    if (checkOrder(palavras, rodada.correta)) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const ganho = 10 * (usouDica ? 1 : mult);
      setSequencia(nova);
      setPontos(p => p + ganho);
      comemorar(mult > 1 && !usouDica ? 'sequencia' : 'acerto', el, {
        texto: '+' + ganho + (mult > 1 && !usouDica ? ' \u00d7' + mult : ''),
        tremer: mult >= 3,
      });
      setConferido('certo');
      resultadosRef.current.push({
        // A identidade da fala vai junto porque sem ela o outcome é anônimo: não dá para saber
        // QUAL frase caiu nesta rodada, e é disso que dependem "o que já veio" e não repetir.
        ...(rodada.sentenceId ? { itemRef: rodada.sentenceId } : {}),
        correct: true,
        attempts: tentativasRef.current,
        ms: Date.now() - inicioItemRef.current,
        hinted: usouDica,
      });
      setTimeout(() => {
        if (indice + 1 >= rodadas.length) finalizarTudo();
        else setIndice(i => i + 1);
      }, 1200);
      return;
    }
    // Errou: mostra QUANTAS estão no lugar (feedback parcial), sem entregar quais.
    setSequencia(0);
    comemorar('erro', el);
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
    else setIndice(i => i + 1);
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
    const escolhidas = montada.map(i => rodada.embaralhada[i]);
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

  const acertosParciais = conferido === 'errado'
    ? acertosPosicionais(montada.map(i => rodada.embaralhada[i]), rodada.correta)
    : 0;

  return (
    <div className="flex-1 flex flex-col items-center p-4 lg:p-8 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      <header className="w-full max-w-2xl flex items-center justify-between mb-5 shrink-0">
        <div>
          <h2 className="font-display font-black text-lg text-ink">
            {ageProfile === 'kids' ? 'Monte a frase' : 'Frase embaralhada'}
          </h2>
          <p className="text-[12px] text-ink-muted">
            frase {indice + 1} de {rodadas.length}
            {pontos > 0 && <span className="text-accent-ink font-bold"> · {pontos} pts</span>}
            {multiplicador(sequencia) > 1 && <span className="text-warn-ink font-bold"> · ×{multiplicador(sequencia)}</span>}
          </p>
        </div>
        <span className="flex items-center gap-0.5">
          <button
            onClick={(e) => pedirDica(e.currentTarget)}
            disabled={conferido === 'certo'}
            className="p-2 rounded-lg text-ink-muted hover:text-warn-ink hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            title="Dica: encaixar a próxima palavra (conta como dica)"
            data-tour="dica-scramble"
            aria-label="Pedir dica"
          >
            <Lightbulb className="w-4 h-4" />
          </button>
          <button onClick={onExit} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Sair do jogo">
            <X className="w-5 h-5" />
          </button>
        </span>
      </header>

      <div ref={palcoRef} className="w-full max-w-2xl flex flex-col gap-5 my-auto">
        {/* O SIGNIFICADO guia a ordem — sem ele o jogo vira tentativa e erro. */}
        <div className="text-center">
          <p className="label-mono mb-1">{ageProfile === 'senior' ? 'Monte a frase que quer dizer' : 'Esta frase significa'}</p>
          <p data-tour="traducao" className="font-display font-extrabold text-[17px] text-accent-ink leading-snug">{rodada.traducao}</p>
        </div>

        {/* A LINHA que a pessoa monta */}
        <div
          className={`min-h-[4.5rem] rounded-2xl border-2 border-dashed p-3 flex flex-wrap gap-2 items-start content-start transition-colors ${
            conferido === 'certo' ? 'border-good bg-good-soft/30'
            : conferido === 'errado' ? 'border-error bg-error-soft/20'
            : 'border-border-subtle bg-surface'
          }`}
        >
          {montada.length === 0 && (
            <span className="text-[13px] text-ink-faint py-2 px-1">
              {ageProfile === 'senior' ? 'Toque nas palavras abaixo, na ordem certa.' : 'Clique nas palavras na ordem certa.'}
            </span>
          )}
          {montada.map((idx, pos) => (
            <button
              key={`${idx}-${pos}`}
              onClick={() => setMontada(m => m.filter((_, k) => k !== pos))}
              disabled={conferido === 'certo'}
              className="px-3 py-2 rounded-xl bg-accent-soft border border-accent/30 text-accent-ink font-bold text-[15px] cursor-pointer hover:brightness-95"
              title="Clique para tirar da frase"
            >
              {rodada.embaralhada[idx]}
            </button>
          ))}
        </div>

        {/* Feedback PARCIAL: diz quantas estão no lugar, sem entregar quais. */}
        {conferido === 'errado' && (
          <p className="text-center text-[13px] text-warn-ink animate-in fade-in">
            {acertosParciais > 0
              ? `${acertosParciais} ${acertosParciais === 1 ? 'palavra está' : 'palavras estão'} no lugar certo — continue.`
              : 'Ainda não. Tente começar por outra palavra.'}
          </p>
        )}

        {/* As PEÇAS disponíveis */}
        <div data-tour="pecas" className="flex flex-wrap gap-2 justify-center">
          {disponiveis.map(i => (
            <button
              key={i}
              onClick={() => setMontada(m => [...m, i])}
              disabled={conferido === 'certo'}
              className="px-3 py-2 rounded-xl bg-surface border border-border-subtle text-ink font-bold text-[15px] cursor-pointer hover:border-accent hover:-translate-y-0.5 transition-all"
            >
              {rodada.embaralhada[i]}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setMontada([])}
            disabled={!montada.length || conferido === 'certo'}
            className="py-2.5 px-4 rounded-xl bg-canvas border border-border-subtle text-ink-muted hover:text-ink font-bold text-[13px] disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Recomeçar
          </button>
          <button
            data-tour="conferir"
            onClick={(e) => conferir(e.currentTarget)}
            disabled={!completa || conferido === 'certo'}
            className="py-2.5 px-6 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-[13px] shadow-btn disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Conferir
          </button>
        </div>

        <button onClick={desistir} className="text-[11px] text-ink-faint hover:text-warn-ink underline cursor-pointer mx-auto">
          pular esta frase
        </button>
      </div>
    </div>
  );
}
