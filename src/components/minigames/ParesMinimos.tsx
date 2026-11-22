import '../../styles/paresMinimos.css';

import type { ItemOutcome, RodadaDePar } from '@core';
import { conferirPar, resumirContrastes, scoreRound } from '@core';
import { Check, Gauge, Play, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { celebrar } from '../../lib/comemoracao';
import { t, tp } from '../../lib/i18n';
import { flutuar, tremer } from '../../lib/polimento/jogos';
import type { PropsDeJogo } from '../views/play/componentesDosJogos';
import { useAtalhosDasAlternativas } from './casca/atalhos';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { usePlacarDaRodada } from './casca/HudDaRodada';
import { falarNoJogo, SemVozNoQuest, useVozNoJogo } from './noQuest';

/**
 * PARES MÍNIMOS — treinar o OUVIDO antes de decorar palavras (Wyner, Fluent Forever).
 *
 * Toca UMA palavra de um par que só difere num som (ship/sheep, pero/perro) e a pessoa escolhe qual ouviu.
 * Depois da resposta o feedback mostra o contraste (os dois sons) e deixa ouvir as duas palavras. No fim,
 * um resumo diz quais contrastes o ouvido confundiu. Tudo corrigido no aparelho: sem IA, sem rede, sem custo.
 *
 * NADA vale por tempo (Decreto 12.880, art. 9º): não há relógio, e a rapidez não rende ponto
 * (`grade.ts`). A pessoa avança no próprio passo, com o botão "Próximo par".
 */

const VELOCIDADE_LENTA = 0.6;

type Escolha = 0 | 1;

export function ParesMinimos({ items, onFinish, onExit }: PropsDeJogo) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('paresMinimos');
  const rodadas = useMemo(() => items.flatMap((x) => (x.par ? [{ par: x.par, lang: x.lang }] : [])), [items]);

  const [i, setI] = useState(0);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [seq, setSeq] = useState(0);
  const [feitos, setFeitos] = useState(0);
  const [resumindo, setResumindo] = useState(false);

  const outcomes = useRef<ItemOutcome[]>([]);
  const erradas = useRef<RodadaDePar[]>([]);
  const inicioDoItem = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const tocouEm = useRef(-1);
  const finalizou = useRef(false);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const proxima = useRef<HTMLButtonElement>(null);

  const atual = rodadas[i];
  const par = atual?.par;
  const lang = atual?.lang ?? '';
  const haVoz = useVozNoJogo(lang);

  const falar = (palavra: string, devagar = false) => {
    falarNoJogo(palavra, lang, devagar ? { rate: VELOCIDADE_LENTA } : {});
  };

  /* A palavra toca sozinha ao entrar (uma vez por par); o botão repete, normal ou devagar. */
  useEffect(() => {
    if (!par || !ativo || !haVoz || escolha !== null || tocouEm.current === i) return;
    const x = window.setTimeout(() => {
      tocouEm.current = i;
      falar(par.opcoes[par.tocada].palavra);
    }, 350);
    return () => window.clearTimeout(x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, ativo, haVoz]);

  useEffect(() => {
    if (escolha !== null || resumindo) proxima.current?.focus({ preventScroll: true });
  }, [escolha, resumindo]);

  const responder = (k: Escolha) => {
    if (!par || escolha !== null || !ativo) return;
    const certo = conferirPar(par, k);
    setEscolha(k);
    outcomes.current.push({
      itemRef: par.id,
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioDoItem.current,
    });
    const p = recontar(outcomes.current);
    setFeitos((n) => n + 1);
    const botao = lista.current?.querySelectorAll<HTMLElement>('button')[k] ?? caixa.current;
    if (certo) {
      setSeq((n) => n + 1);
      celebrar({ tipo: 'acerto', combo: seq + 1, el: botao, pontos: p.ganho });
    } else {
      erradas.current.push(par);
      setSeq(0);
      celebrar({ tipo: 'erro', el: botao });
      tremer(caixa.current);
      flutuar(botao, t('Ouça de novo'), 'erro');
    }
  };

  const avancar = () => {
    if (i + 1 >= rodadas.length) {
      setResumindo(true);
      return;
    }
    inicioDoItem.current = Date.now();
    setEscolha(null);
    setI(i + 1);
  };

  const concluir = () => {
    if (finalizou.current) return;
    finalizou.current = true;
    const todos = outcomes.current;
    onFinish({
      gameId: 'paresMinimos',
      items: todos,
      score: scoreRound('paresMinimos', todos),
      durationMs: Date.now() - inicioDaRodada.current,
    });
  };

  useAtalhosDasAlternativas(2, (k) => responder(k as Escolha), !!par && ativo && escolha === null && !resumindo);

  if (!rodadas.length) {
    return (
      <div className="ef-vazio" role="status">
        <p>
          <b>{t('Ainda não há pares de sons para este idioma.')}</b>
        </p>
        <button type="button" className="btn btn-solid" onClick={onExit}>
          {t('Voltar')}
        </button>
      </div>
    );
  }

  const total = rodadas.length;
  const certas = outcomes.current.filter((o) => o.correct).length;

  if (resumindo) {
    const confundidos = resumirContrastes(erradas.current);
    return (
      <div className="pm-miolo" ref={caixa}>
        <HudDaRodada
          pontos={placar.pontos}
          sequencia={seq}
          acertos={placar.acertos}
          rotulo={t('{feitos} de {total} pares', { feitos, total })}
          progresso={1}
        />
        <div aria-live="polite">
          <p className="pj-instr">
            <b>{t('Você acertou {certas} de {total}.', { certas, total })}</b>
          </p>
          {confundidos.length === 0 ? (
            <p>{t('Seu ouvido separou todos os sons desta rodada.')}</p>
          ) : (
            <>
              <p>{t('Onde o ouvido ainda confunde:')}</p>
              <ul className="pm-resumo">
                {confundidos.map((c) => (
                  <li key={c.contraste}>
                    <b>{t('Seu ouvido confunde {a} e {b}', { a: `/${c.sons[0]}/`, b: `/${c.sons[1]}/` })}</b>
                    {' · '}
                    {tp(c.erros, '{n} erro', '{n} erros')}
                    <br />
                    <span lang={lang}>{c.pares.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="pj-acoes">
          <button ref={proxima} type="button" className="btn btn-solid" data-pj="proxima" onClick={concluir}>
            {t('Ver resultado')}
          </button>
        </div>
      </div>
    );
  }

  if (!par) return null;
  const tocada = par.opcoes[par.tocada];
  const ultima = i + 1 >= total;
  const acertou = escolha !== null && conferirPar(par, escolha);

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={t('{feitos} de {total} pares', { feitos, total })}
        progresso={feitos / Math.max(1, total)}
      />
      <p className="pj-instr">{t('Ouça a palavra e escolha qual das duas você ouviu.')}</p>
      <div className="pj-miolo pm-miolo" ref={caixa}>
        {haVoz ? (
          <div className="pj-acoes">
            <button
              type="button"
              className="btn btn-solid pj-grande"
              data-pj="ouvir"
              onClick={() => falar(tocada.palavra)}
            >
              <Play aria-hidden /> {t('Ouvir')}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              data-pj="devagar"
              onClick={() => falar(tocada.palavra, true)}
            >
              <Gauge aria-hidden /> {t('Ouvir devagar')}
            </button>
          </div>
        ) : (
          <SemVozNoQuest idioma={lang} />
        )}
        <ul className="pm-duas" ref={lista} aria-label={t('As duas palavras')}>
          {par.opcoes.map((op, k) => {
            const foiTocada = k === par.tocada;
            const foiEscolhida = escolha === k;
            const classe = escolha === null ? '' : foiTocada ? ' pm-tocou' : foiEscolhida ? ' pm-errou' : '';
            return (
              <li key={op.palavra}>
                <button
                  type="button"
                  className={`pm-opcao${classe}`}
                  data-op={op.palavra}
                  lang={lang}
                  disabled={escolha !== null}
                  onClick={() => responder(k as Escolha)}
                >
                  <span className="pm-tecla" aria-hidden="true">
                    {k + 1}
                  </span>
                  <span>{op.palavra}</span>
                  {escolha !== null && <span className="pm-som">/{op.som}/</span>}
                  {escolha !== null && (
                    <span className="pm-selo">
                      {foiTocada ? <Check aria-hidden size={14} /> : foiEscolhida ? <X aria-hidden size={14} /> : null}{' '}
                      {foiTocada ? t('Tocou') : foiEscolhida ? t('Sua escolha') : ''}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="pm-resultado" aria-live="polite">
          {escolha !== null && (
            <>
              <p>
                <b>{acertou ? t('Acertou!') : t('Não foi essa.')}</b>{' '}
                {t('Tocou {palavra}.', { palavra: tocada.palavra })}
              </p>
              <p className="pm-contraste">
                <span className="label-mono">{t('Contraste')}</span> {par.contraste}
              </p>
              <div className="pj-acoes">
                {haVoz &&
                  par.opcoes.map((op) => (
                    <button
                      key={op.palavra}
                      type="button"
                      className="btn btn-outline"
                      data-pj="ouvir-opcao"
                      onClick={() => falar(op.palavra)}
                    >
                      <Play aria-hidden /> {t('Ouvir {palavra}', { palavra: op.palavra })}
                    </button>
                  ))}
                <button ref={proxima} type="button" className="btn btn-solid" data-pj="proxima" onClick={avancar}>
                  {ultima ? t('Ver resumo') : t('Próximo par')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default ParesMinimos;
