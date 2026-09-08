import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Briefcase, Heart, Lock, Unlock, Eye, Check } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { comemorar } from '../../../lib/juice';
import { speak } from '../../../lib/tts';

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
  const malaRef = useRef<HTMLDivElement | null>(null);

  const naMala = rodada.slice(0, nivel);
  const esperado = naMala[posicao];

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const finalizar = () => {
    if (encerradoRef.current) return;
    encerradoRef.current = true;
    setEncerrado(true);

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

    const perfeita = outcomes.length > 0 && outcomes.every(o => o.correct && o.attempts === 1);
    comemorar(perfeita ? 'rodadaPerfeita' : 'rodadaBoa', malaRef.current);

    setTimeout(() => onFinish({
      gameId: 'koffer',
      items: outcomes,
      score: scoreRound('koffer', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    }), 900);
  };

  // A mala abre com a palavra nova, é falada, e depois fecha para a reconstrução.
  useEffect(() => {
    if (!suficiente || encerradoRef.current) return;
    setFase('entrando');
    setPosicao(0);
    setErrou(false);
    setPalheta(embaralhar(rodada));
    espiouNoNivelRef.current = false;
    const nova = rodada[nivel - 1];
    if (nova) speak(nova.answer, { lang: nova.lang });
    const t = setTimeout(() => {
      setFase('lembrando');
      inicioPosicaoRef.current = Date.now();
    }, TEMPO_ABERTA[ageProfile]);
    return () => clearTimeout(t);
  }, [nivel, suficiente, rodada, ageProfile]);

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
    if (fase !== 'lembrando' || encerradoRef.current || !esperado) return;

    const reg = registro(posicao);
    if (espiouNoNivelRef.current) reg.espiou = true;

    if (escolhido.answer !== esperado.answer) {
      reg.erros += 1;
      setErrou(true);
      comemorar('erro', el);
      const restantes = vidas - 1;
      setVidas(restantes);
      if (restantes <= 0) finalizar();
      return;
    }

    reg.colocou = true;
    reg.ms = Date.now() - inicioPosicaoRef.current;
    setErrou(false);
    comemorar('acerto', el);
    speak(esperado.answer, { lang: esperado.lang });

    const proxima = posicao + 1;
    if (proxima < naMala.length) {
      setPosicao(proxima);
      inicioPosicaoRef.current = Date.now();
      return;
    }
    if (nivel >= rodada.length) { finalizar(); return; }
    setNivel(n => n + 1);
  };

  if (!suficiente) return null;

  const malaAberta = fase === 'entrando' || espiando;
  const alvoGrande = ageProfile === 'kids' || ageProfile === 'senior';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-y-auto">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            aria-label="Sair do jogo"
            title="Sair da Mala"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Ich packe meinen Koffer</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">🧳 A mala cresce</span>
            </div>
            <p className="text-xs text-ink-muted">A cada nível entra uma palavra. Reconstrua a mala na ordem em que ela foi feita.</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={espiar}
            disabled={fase !== 'lembrando' || espiouNoNivelRef.current}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Espiar a mala por um instante (limita a nota a difícil)"
          >
            <Eye className="w-4 h-4 text-accent" />
            <span>Espiar</span>
          </button>

          <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface" aria-label={`${vidas} vidas`}>
            {Array.from({ length: VIDAS[ageProfile] }).map((_, i) => (
              <Heart key={i} className={`w-4 h-4 ${i < vidas ? 'text-error fill-current' : 'text-ink-faint'}`} />
            ))}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <span className="font-mono font-bold text-base text-ink">{nivel}/{rodada.length}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-6 w-full max-w-3xl mx-auto">
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
            <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold ${
              malaAberta ? 'bg-good-soft text-good-ink' : 'bg-error-soft text-error-ink'
            }`}>
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
                  <li key={it.answer} dir={direcaoDoTexto(it.lang)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-good-soft text-good-ink text-sm font-bold">
                    <Check className="w-3.5 h-3.5 text-good" />
                    <span className="font-mono text-[11px]">{i + 1}</span>
                    {it.answer}
                  </li>
                ))}
              </ol>
              {errou && (
                <p className="text-sm font-bold text-error-ink px-3 py-1.5 rounded-xl bg-error-soft">
                  Não foi esta. A ordem conta — e a tentativa custou uma vida.
                </p>
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
            {palheta.map(it => (
              <button
                key={it.answer}
                data-palavra={it.answer}
                onClick={e => tocar(it, e.currentTarget)}
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
      </main>
    </div>
  );
}
