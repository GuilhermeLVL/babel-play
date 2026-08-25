import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, RotateCcw, Turtle } from 'lucide-react';
import type { ItemOutcome, RoundReport, RodadaEscuta } from '@core';
import { scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, multiplicador } from '../../lib/juice';
import { criarFalante } from '../../lib/falante';

/**
 * QUAL FOI? — ouvir um trecho real e escolher a legenda certa.
 *
 * SUBSTITUI o `CaptionSync` legado, e existe porque ESCUTA era a habilidade sem jogo nenhum: dos
 * seis atuais, cinco são de leitura/escrita e o karaokê é de produção. Nenhum treinava só ouvir.
 *
 * O QUE FAZ ELE FUNCIONAR são as alternativas: outras falas DA MESMA gravação, com comprimento
 * parecido. Mesmo assunto, mesmo sotaque, mesmo vocabulário — não dá para eliminar por dedução,
 * é preciso ouvir. Alternativa inventada denunciaria a certa pela cara.
 *
 * O ÁUDIO PODE SER OUVIDO QUANTAS VEZES QUISER, e isso não é frouxidão: o exercício é
 * discriminação auditiva, não memória de curto prazo. Cobrar por reouvir treinaria a coisa errada.
 */

interface EscutaGameProps {
  rodadas: RodadaEscuta[];
  audioUrl: string;
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function EscutaGame({ rodadas, audioUrl, ageProfile, onFinish, onExit }: EscutaGameProps) {
  const [indice, setIndice] = useState(0);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const [sequencia, setSequencia] = useState(0);
  const [pontos, setPontos] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pararRef = useRef<number | null>(null);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const encerradoRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const rodada = rodadas[indice];

  /**
   * Faz o item soar — clipe da gravação quando ela existe, voz sintetizada quando não.
   *
   * Antes isto era `<audio>` + `currentTime` + `setTimeout` direto aqui, e por isso o jogo só
   * existia com uma gravação carregada: na trilha, que tem palavras curadas e nenhum áudio, ele
   * anunciava falas prontas e tocava a gravação de outra fonte. Agora a decisão de COMO soar mora
   * em `lib/falante.ts` e o jogo não sabe qual dos dois caminhos foi usado.
   *
   * Tocar só o trecho continua sendo obrigatório na gravação: sem o corte, o áudio seguinte
   * entregaria a resposta.
   */
  const falante = useMemo(() => criarFalante(audioRef, audioUrl), [audioUrl]);
  const ouvir = (velocidade = 1) => {
    if (!rodada || !falante.disponivel) return;
    falante.ouvir({
      texto: rodada.correta.text,
      lang: rodada.correta.lang,
      startMs: rodada.correta.startMs,
      endMs: rodada.correta.endMs,
    }, velocidade);
    setTocando(true);
    if (pararRef.current) window.clearTimeout(pararRef.current);
    /* O indicador de "tocando" tem de apagar sozinho: a voz sintetizada não avisa quando termina
       por este caminho, e um botão preso em "tocando" parece travado. */
    const duracao = rodada.correta.endMs > rodada.correta.startMs
      ? Math.max(300, rodada.correta.endMs - rodada.correta.startMs) / velocidade
      : Math.max(900, rodada.correta.text.length * 90) / velocidade;
    pararRef.current = window.setTimeout(() => setTocando(false), duracao);
  };

  // Toca sozinho ao entrar em cada rodada: o jogo é de escuta, e fazer clicar antes é atrito puro.
  useEffect(() => {
    if (rodada) ouvir(1);
    return () => { if (pararRef.current) window.clearTimeout(pararRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const responder = (id: string | undefined, el: HTMLElement | null) => {
    if (escolhido || !rodada) return;
    const certo = id === rodada.correta.id;
    setEscolhido(id ?? '');
    audioRef.current?.pause();

    resultadosRef.current.push({
      // Sem o id da fala o outcome é anônimo e o histórico não sabe QUAL trecho tocou — é o que
      // impede saber o que já veio, repetir uma rodada ou evitar a repetição.
      ...(rodada.correta.id ? { itemRef: rodada.correta.id } : {}),
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioItemRef.current,
    });

    if (certo) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const ganho = 10 * mult;
      setSequencia(nova);
      setPontos(p => p + ganho);
      comemorar(mult > 1 ? 'sequencia' : 'acerto', el, { texto: `+${ganho}${mult > 1 ? ` ×${mult}` : ''}`, tremer: mult >= 3 });
    } else {
      setSequencia(0);
      comemorar('erro', el);
    }

    // Pausa para LER a resposta certa antes de trocar — errar sem ver o certo não ensina nada.
    setTimeout(() => {
      if (indice + 1 >= rodadas.length) {
        if (encerradoRef.current) return;
        encerradoRef.current = true;
        const todos = resultadosRef.current;
        const impecavel = todos.every(o => o.correct);
        comemorar(impecavel ? 'rodadaPerfeita' : todos.some(o => o.correct) ? 'rodadaBoa' : 'erro', palcoRef.current, { tremer: impecavel });
        setTimeout(() => onFinish({
          gameId: 'escuta',
          items: todos,
          score: scoreRound('escuta', todos),
          durationMs: Date.now() - inicioRodadaRef.current,
        }), 900);
        return;
      }
      setIndice(i => i + 1);
      setEscolhido(null);
      inicioItemRef.current = Date.now();
    }, certo ? 900 : 2000);
  };

  if (!rodada) return null;
  const mult = multiplicador(sequencia);

  return (
    <div className="flex-1 flex flex-col items-center p-4 lg:p-8 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />

      <header className="w-full max-w-2xl flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="font-display font-black text-lg text-ink">
            {ageProfile === 'kids' ? 'Qual foi?' : 'Qual foi a fala?'}
          </h2>
          <p className="text-[12px] text-ink-muted">
            {indice + 1} de {rodadas.length}
            {pontos > 0 && <span className="text-accent-ink font-bold"> · {pontos} pts</span>}
            {mult > 1 && <span className="text-warn-ink font-bold"> · ×{mult}</span>}
          </p>
        </div>
        <button onClick={onExit} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Sair do jogo">
          <X className="w-5 h-5" />
        </button>
      </header>

      <div ref={palcoRef} className="w-full max-w-2xl flex flex-col items-center gap-6 my-auto">
        {/* O BOTÃO DE OUVIR é o centro da tela: é o que a pessoa veio fazer aqui. */}
        <div className="flex items-center gap-3">
          <button
            data-tour="ouvir"
            onClick={() => ouvir(1)}
            className={`py-4 px-8 rounded-2xl bg-accent hover:bg-accent-ink text-white font-bold text-[15px] shadow-btn cursor-pointer flex items-center gap-2.5 transition-transform ${
              tocando ? 'scale-105' : ''
            }`}
          >
            {tocando ? <RotateCcw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {tocando ? 'tocando…' : 'Ouvir de novo'}
          </button>
          <button
            data-tour="devagar"
            onClick={() => ouvir(0.6)}
            className="py-4 px-4 rounded-2xl bg-canvas border border-border-subtle text-ink-muted hover:text-ink hover:border-accent font-bold text-[13px] cursor-pointer flex items-center gap-1.5"
            title="Toca mais devagar, sem mudar o tom da voz"
          >
            <Turtle className="w-4 h-4" /> devagar
          </button>
        </div>
        <p className="text-[12px] text-ink-faint">Ouça quantas vezes quiser — isso não tira ponto.</p>

        {/* AS ALTERNATIVAS */}
        <div data-tour="alternativas" className="w-full flex flex-col gap-2">
          {rodada.opcoes.map(op => {
            const certa = op.id === rodada.correta.id;
            const escolhida = escolhido === op.id;
            const revelando = escolhido !== null;
            return (
              <button
                key={op.id}
                onClick={(e) => responder(op.id, e.currentTarget)}
                disabled={revelando}
                className={`py-3.5 px-4 rounded-xl border text-left font-medium text-[14px] leading-snug transition-all ${
                  revelando
                    ? certa
                      ? 'bg-good-soft border-good text-good-ink font-bold'
                      : escolhida
                        ? 'bg-error-soft border-error text-error-ink'
                        : 'bg-surface border-border-subtle text-ink-faint'
                    : 'bg-surface border-border-subtle text-ink hover:border-accent hover:-translate-y-0.5 cursor-pointer'
                }`}
              >
                {op.text}
              </button>
            );
          })}
        </div>

        {/* A tradução só aparece DEPOIS: antes, ela entregaria a resposta. */}
        {escolhido !== null && rodada.correta.translation && (
          <p className="text-[13px] text-ink-muted text-center animate-in fade-in">
            {rodada.correta.translation}
          </p>
        )}
      </div>
    </div>
  );
}
