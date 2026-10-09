import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { PenLine, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { vazaResposta } from '../../../core/learning/pistaDeJogo';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { sentir } from '../../../lib/polimento/sentidos';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useVozNoJogo } from '../noQuest';
import { textosDoJogo, unidadeDoPlacar } from '../polimento/textos';

/**
 * CADAVRE EXQUIS — a cena do protótipo (`jogos2.js:483-523`, `jogos.css:118-127`): quatro cartões de
 * palavra, o campo da frase e "Conferir". Enquanto a pessoa escreve, cada palavra já usada acende.
 *
 * É produção livre, sem níveis nem ajudas, e não agenda revisão (`MINIGAMES.cadavre.writesSrs` é falso).
 * O que é do app: as quatro palavras e a régua de "usou a palavra" (`vazaResposta`, que reconhece a
 * flexão: "abandoned" conta para "abandon"). O relatório é o do jogo de sempre: um resultado por palavra,
 * `correct` quando ela entrou na frase.
 */

interface Props {
  items: MinigameItem[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** A rodada é exatamente quatro: é o que `MINIGAMES.cadavre` declara nos dois extremos. */
const PALAVRAS = MINIGAMES.cadavre.maxItems;

export default function CadavreDoPrototipo({ items, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('cadavre');
  const textos = textosDoJogo('cadavre');
  const pal = useMemo(() => items.slice(0, PALAVRAS), [items]);
  const suficiente = pal.length >= PALAVRAS;
  /* No headset sem voz para este idioma o botão de ouvir não aparece (seria um botão mudo); fora dele, sempre. */
  const haVoz = useVozNoJogo(pal[0]?.lang);

  const [frase, setFrase] = useState('');
  const [resultado, setResultado] = useState<RoundReport | null>(null);
  const [feitos, setFeitos] = useState(0);
  const [seq, setSeq] = useState(0);

  const cartoes = useRef<HTMLDivElement>(null);
  const inicio = useRef(Date.now());
  const esperas = useRef<number[]>([]);
  const acesas = useRef(0);
  const saiu = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };

  /* `marcar` de `jogos2.js:494-504`: a palavra usada acende enquanto a pessoa escreve. */
  const usadas = useMemo(() => pal.map((it) => vazaResposta(frase, it.answer)), [pal, frase]);
  useEffect(() => {
    const n = usadas.filter(Boolean).length;
    if (n > acesas.current && !resultado) sentir('encaixa', 'select');
    acesas.current = n;
  }, [usadas, resultado]);

  /* `pj.clique` de `jogos2.js:506-520`: um acerto por palavra usada, a cada 220 ms. */
  const conferir = () => {
    if (resultado || !ativo || !frase.trim()) return;
    const ms = Date.now() - inicio.current;
    const outcomes: ItemOutcome[] = pal.map((it, k) => ({
      cardId: it.cardId,
      itemRef: it.answer,
      correct: usadas[k],
      attempts: 1,
      ms,
    }));
    setResultado({ gameId: 'cadavre', items: outcomes, score: scoreRound('cadavre', outcomes), durationMs: ms });
    const certas = outcomes.filter((o) => o.correct);
    setFeitos(PALAVRAS - certas.length);
    if (!certas.length) recontar(outcomes);
    const indices = usadas.flatMap((u, k) => (u ? [k] : []));
    indices.forEach((k, n) =>
      depois(n * 220, () => {
        /* Os pontos sobem palavra por palavra; no fim, valem os do relatório inteiro. */
        const p = recontar(n === indices.length - 1 ? outcomes : certas.slice(0, n + 1));
        setFeitos((f) => f + 1);
        setSeq(n + 1);
        celebrar({
          tipo: 'acerto',
          combo: n + 1,
          el: cartoes.current?.querySelectorAll('.pj-cartao')[k] ?? null,
          pontos: p.ganho,
        });
      }),
    );
  };

  /* "Continuar" encerra a rodada na hora (`pjFim({ ja: true })`: 200 ms). */
  const continuar = () => {
    if (!resultado || saiu.current) return;
    saiu.current = true;
    depois(200, () => onFinish(resultado));
  };

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  if (!suficiente) return null;

  const quantas = resultado ? resultado.items.filter((o) => o.correct).length : 0;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${PALAVRAS} ${unidadeDoPlacar('cadavre')}`}
        progresso={feitos / PALAVRAS}
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <div ref={cartoes} className="pj-quatro">
          {pal.map((it, k) => (
            <div
              key={k}
              className={`pj-cartao${usadas[k] ? ' usada' : ''}${resultado && !usadas[k] ? ' faltou' : ''}`}
              data-w={it.answer}
            >
              <b lang={it.lang}>{it.answer}</b>
              <small>{it.prompt}</small>
            </div>
          ))}
        </div>
        <span className="label-mono">{t('Escreva UMA frase que use as quatro palavras')}</span>
        <textarea
          className="pj-texto"
          rows={3}
          aria-label={t('Sua frase')}
          placeholder={t('A sua frase pode ser absurda, só precisa usar as quatro.')}
          lang={pal[0].lang}
          value={frase}
          disabled={!!resultado}
          onChange={(e) => setFrase(e.target.value)}
        />
        <div className="pj-acoes">
          <button
            type="button"
            className="btn btn-solid"
            data-pj="conferir"
            disabled={!frase.trim()}
            hidden={!!resultado}
            onClick={conferir}
          >
            <PenLine data-pj-i="" aria-hidden /> {t('Conferir')}
          </button>
        </div>
        <div className="pj-correcao">
          {resultado && (
            <>
              <p>
                {t('palavras usadas:')}{' '}
                <b>
                  {quantas}/{PALAVRAS}
                </b>
                . {t('Produção livre: esta rodada não agenda revisão.')}
              </p>
              <div className="pj-acoes">
                {haVoz && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    data-pj="ouvir-frase"
                    onClick={() => falar(frase, pal[0].lang)}
                  >
                    <Volume2 data-pj-i="" aria-hidden /> {t('Ouvir')}
                  </button>
                )}
                <button type="button" className="btn btn-solid" data-pj="continuar" onClick={continuar}>
                  {t('Continuar')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
