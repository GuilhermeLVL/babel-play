import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Turtle, CornerDownLeft, Lightbulb, SkipForward } from 'lucide-react';
import type { ItemOutcome, RoundReport, RodadaDitado } from '@core';
import { conferirDitado, scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, pontosDoElemento, multiplicador } from '../../lib/juice';
import { criarFalante } from '../../lib/falante';
import { playJuicedHit, playJuicedError, playJuicedVictory, triggerHaptic } from '../../lib/gameFeel';

/**
 * DITADO — ouvir e escrever o que foi dito.
 *
 * SUBSTITUI o `WaveformDrill` legado, ficando com o núcleo bom dele (ditado do áudio real) e
 * jogando fora o desenho da onda, que era bonito e não ensinava nada.
 *
 * A DIFERENÇA QUE IMPORTA está na correção. O exercício antigo dava um percentual de distância de
 * edição sobre a frase inteira — "72% parecido" — e isso não diz à pessoa o que fazer a seguir.
 * Aqui a conferência é PALAVRA A PALAVRA e a tela MOSTRA onde errou, com o que ela escreveu ao
 * lado do que era. É a informação que muda a próxima tentativa.
 *
 * PONTUAÇÃO E ACENTO NÃO CONTAM, de propósito: o exercício é de escuta. Punir a vírgula ensinaria
 * a treinar digitação em vez de ouvido.
 */

interface DitadoGameProps {
  rodadas: RodadaDitado[];
  audioUrl: string;
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function DitadoGame({ rodadas, audioUrl, ageProfile, onFinish, onExit }: DitadoGameProps) {
  const [indice, setIndice] = useState(0);
  const [texto, setTexto] = useState('');
  const [conferido, setConferido] = useState<ReturnType<typeof conferirDitado> | null>(null);
  const [tocando, setTocando] = useState(false);
  const [dicas, setDicas] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [sequencia, setSequencia] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pararRef = useRef<number | null>(null);
  const entradaRef = useRef<HTMLInputElement | null>(null);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const encerradoRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const rodada = rodadas[indice];
  /** Acerto a partir de 80%: ditado exige mais que reconhecer, e menos que transcrever perfeito. */
  const LIMIAR = 80;

  /**
   * Clipe da gravação quando ela existe; voz sintetizada quando não — a decisão mora em
   * `lib/falante.ts`. Antes o `<audio>` estava cravado aqui, e por isso o ditado não existia na
   * TRILHA (palavras curadas, zero áudio): ele anunciava falas prontas e tocava a gravação de
   * outra fonte. Na trilha o exercício vira ouvir e escrever a PALAVRA, que é ditado clássico.
   */
  const falante = useMemo(() => criarFalante(audioRef, audioUrl), [audioUrl]);
  const ouvir = (velocidade = 1) => {
    if (!rodada || !falante.disponivel) return;
    triggerHaptic('soft');
    falante.ouvir({
      texto: rodada.fala.text, lang: rodada.fala.lang,
      startMs: rodada.fala.startMs, endMs: rodada.fala.endMs,
    }, velocidade);
    setTocando(true);
    if (pararRef.current) window.clearTimeout(pararRef.current);
    // A voz sintetizada não avisa o fim por este caminho: sem o relógio, o indicador ficaria preso.
    const duracao = rodada.fala.endMs > rodada.fala.startMs
      ? Math.max(300, rodada.fala.endMs - rodada.fala.startMs) / velocidade
      : Math.max(900, rodada.fala.text.length * 90) / velocidade;
    pararRef.current = window.setTimeout(() => setTocando(false), duracao);
  };

  useEffect(() => {
    if (rodada) { ouvir(1); entradaRef.current?.focus(); }
    return () => { if (pararRef.current) window.clearTimeout(pararRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const avancar = (r: ReturnType<typeof conferirDitado>, pulou: boolean) => {
    const certo = !pulou && r.precisao >= LIMIAR;
    resultadosRef.current.push({
      // Leva a identidade da fala ditada: outcome sem id não diz QUAL frase caiu, e sem isso não
      // há como mostrar o que já veio, repetir a rodada nem evitar que ela se repita.
      ...(rodada.fala.id ? { itemRef: rodada.fala.id } : {}),
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioItemRef.current,
      hinted: dicas > 0,
      revealed: pulou,
    });

    if (certo) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const ganho = 10 * (dicas ? 1 : mult);
      setSequencia(nova);
      setPontos(p => p + ganho);
      triggerHaptic('success');
      playJuicedHit(nova, undefined, `+${ganho}${mult > 1 && !dicas ? ` ×${mult}` : ''}`);
    } else {
      setSequencia(0);
      triggerHaptic('error');
      playJuicedError(palcoRef.current, undefined, 'Abaixo de 80%');
    }

    // Pausa maior quando errou: é onde a correção palavra a palavra é lida.
    setTimeout(() => {
      if (indice + 1 >= rodadas.length) {
        if (encerradoRef.current) return;
        encerradoRef.current = true;
        const todos = resultadosRef.current;
        const impecavel = todos.every(o => o.correct && !o.hinted);
        if (impecavel) playJuicedVictory();
        else comemorar(todos.some(o => o.correct) ? 'rodadaBoa' : 'erro', palcoRef.current, { tremer: impecavel });
        setTimeout(() => onFinish({
          gameId: 'ditado',
          items: todos,
          score: scoreRound('ditado', todos),
          durationMs: Date.now() - inicioRodadaRef.current,
        }), 900);
        return;
      }
      setIndice(i => i + 1);
      setTexto('');
      setConferido(null);
      setDicas(0);
      inicioItemRef.current = Date.now();
    }, certo ? 1200 : 3200);
  };

  const conferir = () => {
    if (!rodada || conferido) return;
    const r = conferirDitado(rodada.fala.text, texto);
    setConferido(r);
    avancar(r, false);
  };

  /** DICA: revela a próxima palavra ainda não escrita. Custa a nota (`hinted`). */
  const pedirDica = (el: HTMLElement | null) => {
    if (!rodada || conferido) return;
    const alvo = rodada.fala.text.split(/\s+/).filter(Boolean);
    const jaEscritas = texto.split(/\s+/).filter(Boolean).length;
    if (jaEscritas >= alvo.length) return;
    setDicas(d => d + 1);
    setSequencia(0);
    triggerHaptic('soft');
    setTexto(t => (t.trim() ? `${t.trim()} ` : '') + alvo[jaEscritas]);
    pontosDoElemento(`palavra ${jaEscritas + 1}`, el, 'neutro');
    entradaRef.current?.focus();
  };

  if (!rodada) return null;
  const mult = multiplicador(sequencia);
  const progressoPct = rodadas.length > 0 ? Math.round((indice / rodadas.length) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col items-center p-4 lg:p-8 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />

      <header className="w-full max-w-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-black text-lg text-ink">
              {ageProfile === 'kids' ? 'Escreva o que ouviu' : 'Ditado'}
            </h2>
            {mult > 1 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-warn/20 text-warn-ink font-black text-xs border border-warn/40 animate-pulse">
                ×{mult}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1 max-w-[200px] h-2 rounded-full bg-border-subtle/60 overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${progressoPct}%` }}
              />
            </div>
            <p className="text-[12px] text-ink-muted tabular-nums">
              {indice + 1} de {rodadas.length} · {rodada.palavras} palavras
              {pontos > 0 && <span className="text-accent-ink font-bold"> · {pontos} pts</span>}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
          <button
            data-tour="dica-ditado"
            onClick={(e) => pedirDica(e.currentTarget)}
            disabled={!!conferido}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface text-ink-muted hover:text-warn-ink hover:border-warn/40 disabled:opacity-40 cursor-pointer font-bold text-xs shadow-sm transition-all"
            title="Revelar a próxima palavra (conta como dica)"
            aria-label="Pedir dica"
          >
            <Lightbulb className="w-4 h-4 text-warn" />
            <span>Dica</span>
          </button>
          <button
            onClick={onExit}
            className="p-2 rounded-xl text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer border border-border-subtle transition-colors"
            aria-label="Sair do jogo"
          >
            <X className="w-4 h-4" />
          </button>
        </span>
      </header>

      <div ref={palcoRef} className="w-full max-w-2xl flex flex-col items-center gap-5 my-auto">
        <div className="flex items-center gap-3">
          <button
            data-tour="ouvir"
            onClick={() => ouvir(1)}
            className={`py-3.5 px-7 rounded-2xl bg-accent hover:bg-accent-ink text-white font-bold text-[15px] shadow-btn cursor-pointer flex items-center gap-2.5 transition-all ${tocando ? 'scale-105 ring-4 ring-accent/30' : 'hover:-translate-y-0.5'}`}
          >
            <Play className={`w-5 h-5 ${tocando ? 'animate-pulse' : ''}`} /> {tocando ? 'Tocando áudio…' : 'Ouvir fala'}
          </button>
          <button
            onClick={() => ouvir(0.6)}
            className="py-3.5 px-4 rounded-2xl bg-canvas border border-border-subtle text-ink-muted hover:text-ink hover:border-accent font-bold text-[13px] cursor-pointer flex items-center gap-1.5 transition-colors"
            title="Toca mais devagar, sem mudar o tom da voz"
          >
            <Turtle className="w-4 h-4" /> devagar
          </button>
        </div>

        {/* A LINHA DE ESCRITA. Uma caixa só: dividir em campos por palavra entregaria onde cada
            uma começa e termina, que é metade do que o ditado treina. */}
        <div className="w-full flex items-center gap-2">
          <input
            ref={entradaRef}
            data-tour="entrada"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') conferir(); }}
            disabled={!!conferido}
            placeholder={ageProfile === 'senior' ? 'Escreva aqui o que você ouviu' : 'escreva o que ouviu…'}
            className="flex-1 px-4 py-3.5 rounded-xl bg-surface border border-border-subtle text-ink text-[15px] focus:border-accent outline-none disabled:opacity-60 shadow-sm"
          />
          <button
            data-tour="conferir"
            onClick={conferir}
            disabled={!texto.trim() || !!conferido}
            className="py-3.5 px-5 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-[13px] shadow-btn disabled:opacity-40 cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <CornerDownLeft className="w-4 h-4" /> Conferir
          </button>
        </div>

        {/* A CORREÇÃO PALAVRA A PALAVRA — o que o exercício antigo não fazia e que é o que ensina. */}
        {conferido && (
          <div className="w-full flex flex-col gap-2 animate-in fade-in">
            <p className="text-[12px] text-ink-muted">
              {conferido.acertos} de {conferido.total} palavras, {conferido.precisao}%
            </p>
            <p className="flex flex-wrap gap-x-2 gap-y-1.5">
              {/* `palavras` — o campo real de `ResultadoDitado`. Estava `itemRefs`, resíduo da
                  renomeação `ItemOutcome.palavra`→`itemRef`, que varreu este componente por engano:
                  `undefined.map()` dentro do render, ou seja, o Ditado QUEBRAVA ao clicar em
                  "Conferir", justo a correção palavra a palavra, que é o que ensina. Passou porque
                  `@types/react` não estava instalado e `conferido` era `any`. */}
              {conferido.palavras.map((p, i) => (
                <span key={i} className="flex flex-col items-center">
                  <span className={`font-display font-bold text-[15px] ${p.certa ? 'text-good-ink' : 'text-error-ink'}`}>
                    {p.esperada}
                  </span>
                  {/* O que ELA escreveu fica embaixo, riscado: é a comparação que faz entender. */}
                  {!p.certa && p.escrita && (
                    <span className="text-[11px] text-ink-faint line-through">{p.escrita}</span>
                  )}
                  {!p.certa && !p.escrita && <span className="text-[11px] text-ink-faint">-</span>}
                </span>
              ))}
            </p>
            {rodada.fala.translation && (
              <p className="text-[12px] text-ink-muted">{rodada.fala.translation}</p>
            )}
          </div>
        )}

        {!conferido && (
          <button
            onClick={() => { const r = conferirDitado(rodada.fala.text, texto); setConferido(r); avancar(r, true); }}
            className="flex items-center gap-1.5 text-[11px] text-ink-faint hover:text-warn-ink cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" /> não consigo, pular
          </button>
        )}
      </div>
    </div>
  );
}
