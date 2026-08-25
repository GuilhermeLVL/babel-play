import React, { useRef, useState } from 'react';
import { X, Check, Link2 } from 'lucide-react';
import type { ItemOutcome, RoundReport, RodadaConectores } from '@core';
import { notaConectores, scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, multiplicador } from '../../lib/juice';

/**
 * CAÇA-CONECTORES — marcar as palavras que amarram as ideias da frase.
 *
 * SUBSTITUI o `ContextMining` legado. O núcleo dele era bom e único no app: conectores
 * ("however", "no entanto", "porém") são o que separa quem entende PALAVRAS de quem entende o
 * TEXTO. Dá para conhecer todo o vocabulário de uma frase e ainda perder o sentido dela por não
 * notar um "although" — porque ele inverte tudo o que vem depois.
 *
 * A NOTA É F1, e não "quantos acertou", porque o jogo tem dois jeitos de errar que precisam
 * pesar: deixar conector passar e marcar palavra que não é. Contar só acertos premiaria quem
 * clica em tudo — e clicar em tudo é exatamente o oposto de perceber a estrutura.
 *
 * ERRAR AQUI NÃO MEXE NO AGENDADOR: as frases vêm de fala capturada, não de cartões do baralho.
 */

interface ConectoresGameProps {
  rodadas: RodadaConectores[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function ConectoresGame({ rodadas, ageProfile, onFinish, onExit }: ConectoresGameProps) {
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
  /** Acerto a partir de 70 de F1: exige pegar a maioria sem sair clicando. */
  const LIMIAR = 70;

  const alternar = (i: number) => {
    if (conferido) return;
    setMarcados(prev => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  };

  const conferir = () => {
    if (!rodada || conferido) return;
    const n = notaConectores([...marcados], rodada.alvos);
    setConferido(n);
    const certo = n.f1 >= LIMIAR;

    resultadosRef.current.push({
      // O id da frase acompanha o resultado: anônimo, ele não permite dizer QUAL frase já foi
      // caçada — e é esse histórico que sustenta repetir ou não repetir uma rodada.
      ...(rodada.fala.id ? { itemRef: rodada.fala.id } : {}),
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
      comemorar(mult > 1 ? 'sequencia' : 'acerto', palcoRef.current, { texto: `+${ganho}`, tremer: mult >= 3 });
    } else {
      setSequencia(0);
      comemorar('erro', palcoRef.current);
    }

    setTimeout(() => {
      if (indice + 1 >= rodadas.length) {
        if (encerradoRef.current) return;
        encerradoRef.current = true;
        const todos = resultadosRef.current;
        const impecavel = todos.every(o => o.correct);
        comemorar(impecavel ? 'rodadaPerfeita' : todos.some(o => o.correct) ? 'rodadaBoa' : 'erro', palcoRef.current, { tremer: impecavel });
        setTimeout(() => onFinish({
          gameId: 'conectores',
          items: todos,
          score: scoreRound('conectores', todos),
          durationMs: Date.now() - inicioRodadaRef.current,
        }), 900);
        return;
      }
      setIndice(i => i + 1);
      setMarcados(new Set());
      setConferido(null);
      inicioItemRef.current = Date.now();
    }, certo ? 1300 : 2600);
  };

  if (!rodada) return null;
  const mult = multiplicador(sequencia);

  return (
    <div className="flex-1 flex flex-col items-center p-4 lg:p-8 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      <header className="w-full max-w-2xl flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="font-display font-black text-lg text-ink">
            {ageProfile === 'kids' ? 'Ache as palavras que ligam' : 'Caça-conectores'}
          </h2>
          <p className="text-[12px] text-ink-muted">
            frase {indice + 1} de {rodadas.length}
            {pontos > 0 && <span className="text-accent-ink font-bold"> · {pontos} pts</span>}
            {mult > 1 && <span className="text-warn-ink font-bold"> · ×{mult}</span>}
          </p>
        </div>
        <button onClick={onExit} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Sair do jogo">
          <X className="w-5 h-5" />
        </button>
      </header>

      <div ref={palcoRef} className="w-full max-w-2xl flex flex-col items-center gap-5 my-auto">
        <p className="flex items-center gap-2 text-[13px] text-ink-muted text-center">
          <Link2 className="w-4 h-4 text-accent shrink-0" aria-hidden />
          {ageProfile === 'senior'
            ? 'Toque nas palavras que ligam uma ideia à outra.'
            : 'Marque as palavras que amarram as ideias — as que mudam o rumo da frase.'}
        </p>

        {/* A FRASE, palavra por palavra clicável. */}
        <p data-tour="frase-conectores" className="flex flex-wrap justify-center gap-x-1.5 gap-y-2 text-center">
          {rodada.tokens.map((t, i) => {
            const marcado = marcados.has(i);
            const eraAlvo = rodada.alvos.includes(i);
            return (
              <button
                key={i}
                onClick={() => alternar(i)}
                disabled={!!conferido}
                className={`px-2.5 py-1.5 rounded-lg font-display font-bold text-[16px] transition-all ${
                  conferido
                    // Depois de conferir: verde no que era, vermelho no que foi marcado à toa,
                    // contorno no que passou despercebido. Os três casos precisam ser visíveis.
                    ? eraAlvo && marcado ? 'bg-good text-white'
                      : eraAlvo ? 'border-2 border-good text-good-ink'
                      : marcado ? 'bg-error-soft text-error-ink line-through'
                      : 'text-ink-faint'
                    : marcado ? 'bg-accent text-white cursor-pointer'
                      : 'text-ink hover:bg-surface-hover cursor-pointer'
                }`}
              >
                {t}
              </button>
            );
          })}
        </p>

        {rodada.fala.translation && (
          <p className="text-[12px] text-ink-muted text-center max-w-[52ch]">{rodada.fala.translation}</p>
        )}

        {conferido ? (
          <div className="flex flex-col items-center gap-1 animate-in fade-in">
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
            onClick={conferir}
            className="py-3 px-6 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-[14px] shadow-btn cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> Conferir
          </button>
        )}
      </div>
    </div>
  );
}
