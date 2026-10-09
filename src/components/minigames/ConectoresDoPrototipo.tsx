import type { ItemOutcome, RodadaConectores, RoundReport } from '@core';
import { notaConectores, scoreRound } from '@core';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { regrasDoJogo } from '../../core/minigames/regras';
import { celebrar } from '../../lib/comemoracao';
import { t } from '../../lib/i18n';
import { useNivelDoJogo } from '../../lib/jogos/nivelDoJogo';
import { flutuar } from '../../lib/polimento/jogos';
import { sentir } from '../../lib/polimento/sentidos';
import AjudasGerais from './casca/AjudasGerais';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { usePlacarDaRodada } from './casca/HudDaRodada';
import { textosDoJogo } from './polimento/textos';

/**
 * CAÇA-CONECTORES — a cena do protótipo (`jogos2.js:766-814`, `jogos.css:155-162`): a frase com cada
 * palavra num botão, a tradução, "Conferir" e a nota de precisão.
 *
 * As regras e os números são os do protótipo: a nota pesa igual deixar passar e marcar à toa, o limiar
 * é 60, 70 ou 80 conforme o nível, e no Fácil a tela diz quantos conectores procurar. O que é do app: as
 * frases (as da sua gravação) com os conectores do idioma, e a nota de cada frase.
 */

interface Props {
  rodadas: RodadaConectores[];
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function ConectoresDoPrototipo({ rodadas, onFinish }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('conectores');
  const nivel = useNivelDoJogo('conectores');
  const regras = regrasDoJogo('conectores', nivel);
  const textos = textosDoJogo('conectores');

  const [i, setI] = useState(0);
  const [marcados, setMarcados] = useState<ReadonlySet<number>>(new Set());
  const [conferido, setConferido] = useState<ReturnType<typeof notaConectores> | null>(null);
  const [seq, setSeq] = useState(0);
  const [feitos, setFeitos] = useState(0);
  const [acabou, setAcabou] = useState(false);

  const rodada = rodadas[i] as RodadaConectores | undefined;

  const frase = useRef<HTMLParagraphElement>(null);
  const trava = useRef(false);
  const comDica = useRef(false);
  const inicioDaFrase = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const outcomes = useRef<ItemOutcome[]>([]);
  const esperas = useRef<number[]>([]);
  const finalizou = useRef(false);

  const depois = (ms: number, f: () => void) => {
    esperas.current.push(window.setTimeout(f, ms));
  };
  useEffect(() => () => esperas.current.forEach((x) => window.clearTimeout(x)), []);

  /* `prox` de `jogos2.js:779-784`. */
  const prox = () => {
    if (i + 1 >= rodadas.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      setAcabou(true);
      const todos = outcomes.current;
      depois(900, () =>
        onFinish({
          gameId: 'conectores',
          items: todos,
          score: scoreRound('conectores', todos),
          durationMs: Date.now() - inicioDaRodada.current,
        }),
      );
      return;
    }
    trava.current = false;
    comDica.current = false;
    inicioDaFrase.current = Date.now();
    setMarcados(new Set());
    setConferido(null);
    setI(i + 1);
  };

  /* Marcar e desmarcar à vontade (`jogos2.js:787-791`). */
  const alternar = (k: number) => {
    if (trava.current) return;
    const ligou = !marcados.has(k);
    const novo = new Set(marcados);
    if (ligou) novo.add(k);
    else novo.delete(k);
    setMarcados(novo);
    sentir(ligou ? 'encaixa' : 'solta', ligou ? 'toggleOn' : 'toggleOff');
  };

  /* "Conferir" (`jogos2.js:792-810`). */
  const conferir = () => {
    if (trava.current || !rodada || !ativo) return;
    trava.current = true;
    const n = notaConectores([...marcados], rodada.alvos);
    const certo = n.f1 >= regras.limiar;
    setConferido(n);
    outcomes.current.push({
      ...(rodada.fala.id ? { itemRef: rodada.fala.id } : {}),
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioDaFrase.current,
      ...(comDica.current ? { hinted: true } : {}),
    });
    const p = recontar(outcomes.current);
    setFeitos((x) => x + 1);
    if (certo) {
      setSeq((x) => x + 1);
      celebrar({ tipo: 'acerto', combo: seq + 1, el: frase.current, pontos: p.ganho });
    } else {
      setSeq(0);
      celebrar({ tipo: 'erro', el: frase.current });
      flutuar(frase.current, t('Revise os conectores'), 'erro');
    }
    depois(certo ? 1500 : 2800, prox);
  };

  if (!rodada) return null;

  const alvos = rodada.alvos.length;

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={`${feitos} de ${rodadas.length} frases`}
        progresso={feitos / Math.max(1, rodadas.length)}
        ajudas={
          <AjudasGerais
            jogo="conectores"
            parado={!ativo || acabou}
            resposta={() => rodada.alvos.map((k) => rodada.tokens[k]).join(', ') || null}
            aoVerResposta={() => {
              comDica.current = true;
              setSeq(0);
            }}
          />
        }
      />
      {textos && <p className="pj-instr" dangerouslySetInnerHTML={{ __html: textos.instr }} />}
      <div className="pj-miolo">
        <p ref={frase} className="pj-conect" lang={rodada.fala.lang} data-tour="frase-conectores">
          {rodada.tokens.map((palavra, k) => {
            const alvo = rodada.alvos.includes(k);
            const on = marcados.has(k);
            return (
              <button
                key={k}
                type="button"
                data-w={palavra.toLowerCase()}
                /* Depois de conferir todas voltam a "não marcada": o resultado vem na classe (`jogos2.js:800-803`). */
                aria-pressed={conferido ? false : on}
                className={
                  conferido ? (alvo && on ? 'alvo-ok' : alvo ? 'alvo-perdido' : on ? 'a-toa' : undefined) : undefined
                }
                disabled={!!conferido}
                onClick={() => alternar(k)}
              >
                {palavra}
              </button>
            );
          })}
        </p>
        {rodada.fala.translation && (
          <p className="mut" style={{ textAlign: 'center', maxWidth: '52ch' }}>
            {rodada.fala.translation}
          </p>
        )}
        {/* No Fácil a tela diz quantos conectores procurar (`jogos2.js:782`). */}
        {regras.dizQuantos && (
          <span className="label-mono">
            {alvos} {alvos === 1 ? t('conector') : t('conectores')} {t('nesta frase')}
          </span>
        )}
        <div className="pj-acoes">
          <button
            type="button"
            className="btn btn-solid"
            data-pj="conferir"
            data-tour="conferir"
            hidden={!!conferido}
            onClick={conferir}
          >
            <Check data-pj-i="" aria-hidden /> {t('Conferir')}
          </button>
        </div>
        <div className="pj-nota" role="status" style={{ minHeight: 56 }}>
          {conferido && (
            <>
              <p style={{ font: '900 19px var(--font-display)' }}>
                {conferido.f1} {t('pontos de precisão')}
              </p>
              <small>
                {conferido.certos} {conferido.certos === 1 ? t('certo') : t('certos')}
                {conferido.falsos ? ` · ${conferido.falsos} ${t('marcado à toa')}` : ''}
                {conferido.perdidos ? ` · ${conferido.perdidos} ${t('passou batido')}` : ''}
              </small>
            </>
          )}
        </div>
      </div>
    </>
  );
}
