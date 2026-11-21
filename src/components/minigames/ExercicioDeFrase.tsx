import '../../styles/exercicioDeFrase.css';

import type { ItemOutcome, MinigameId, MinigameItem, ResultadoDaFrase, TokenComparado } from '@core';
import { compararFrase, dicaDaFrase, scoreRound } from '@core';
import { CornerDownLeft, Eye, Lightbulb, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { celebrar } from '../../lib/comemoracao';
import { t } from '../../lib/i18n';
import { flutuar, tremer } from '../../lib/polimento/jogos';
import type { AgeProfileType } from '../../lib/profile';
import type { PropsDeJogo } from '../views/play/componentesDosJogos';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from './casca/HudDaRodada';
import { falarNoJogo, SemVozNoQuest, useVozNoJogo } from './noQuest';

/**
 * RETRADUÇÃO E DITADO DE FRASE — os dois exercícios em que a pessoa ESCREVE a frase inteira, corrigida
 * no aparelho por `compararFrase` (sem IA, sem custo, sem rede).
 *
 *  · Retradução (Lampariello): vê a tradução, na língua dela, de uma frase que já encontrou e a reescreve
 *    no idioma que estuda; depois compara com o original.
 *  · Ditado de frase (Kaufmann/LingQ): ouve a frase inteira (voz sintetizada) e a digita.
 *
 * A nota é só do RESULTADO da escrita. Não há relógio, nem bônus por rapidez (Decreto 12.880, art. 9º): o
 * tempo só vai para o relatório como medida, e a pessoa avança no próprio passo, com o botão "Próxima".
 */

/** A partir de quantos pontos a frase conta como acertada. */
const LIMIAR_DE_ACERTO = 80;
const CHAVE_ACENTOS = 'babel.frase.ignorarAcentos';

const lerAcentos = (): boolean => {
  try {
    return localStorage.getItem(CHAVE_ACENTOS) !== '0';
  } catch {
    return true;
  }
};
const guardarAcentos = (v: boolean) => {
  try {
    localStorage.setItem(CHAVE_ACENTOS, v ? '1' : '0');
  } catch {
    /* sem armazenamento: vale só nesta tela */
  }
};

/** O texto alternativo de cada palavra: o diff não pode depender só de cor. */
function descricaoDoToken(tk: TokenComparado): string {
  switch (tk.status) {
    case 'certa':
      return t('certa: {palavra}', { palavra: tk.alvo ?? '' });
    case 'trocada':
      return t('trocada: você escreveu {escrita}, o certo é {palavra}', {
        escrita: tk.resposta ?? '',
        palavra: tk.alvo ?? '',
      });
    case 'faltando':
      return t('faltou: {palavra}', { palavra: tk.alvo ?? '' });
    case 'sobrando':
      return t('a mais: {escrita}', { escrita: tk.resposta ?? '' });
  }
}

const MARCA: Record<TokenComparado['status'], string> = { certa: '✓', trocada: '≠', faltando: '+', sobrando: '−' };

function resumoDoResultado(r: ResultadoDaFrase): string {
  return t('{certas} certas, {trocadas} trocadas, {faltando} faltando, {sobrando} a mais', {
    certas: r.certas,
    trocadas: r.trocadas,
    faltando: r.faltando,
    sobrando: r.sobrando,
  });
}

interface Props extends PropsDeJogo {
  modo: Extract<MinigameId, 'retraducao' | 'ditadoDeFrase'>;
}

const instrucao = (modo: Props['modo'], perfil: AgeProfileType): string => {
  if (modo === 'retraducao') {
    return perfil === 'kids'
      ? t('Leia na sua língua e escreva a frase no idioma que você aprende.')
      : perfil === 'senior'
        ? t('Leia a frase na sua língua e escreva-a, com calma, no idioma que você estuda.')
        : t('Reescreva no idioma-alvo a frase que a tradução abaixo diz.');
  }
  return perfil === 'kids'
    ? t('Ouça a frase e escreva tudo o que ouviu.')
    : perfil === 'senior'
      ? t('Ouça a frase quantas vezes quiser e escreva o que ouviu, com calma.')
      : t('Ouça a frase inteira e digite o que ouviu.');
};

export function ExercicioDeFrase({ modo, items, ageProfile, onFinish, onExit }: Props) {
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada(modo);
  const [i, setI] = useState(0);
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<ResultadoDaFrase | null>(null);
  const [comDica, setComDica] = useState(false);
  const [ignorarAcentos, setIgnorarAcentos] = useState(lerAcentos);
  const [ouviu, setOuviu] = useState(false);
  const [seq, setSeq] = useState(0);
  const [feitos, setFeitos] = useState(0);

  const outcomes = useRef<ItemOutcome[]>([]);
  const inicioDoItem = useRef(Date.now());
  const inicioDaRodada = useRef(Date.now());
  const finalizou = useRef(false);
  const campo = useRef<HTMLInputElement>(null);
  const proxima = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const item: MinigameItem | undefined = items[i];
  const lang = item?.lang ?? '';
  const haVoz = useVozNoJogo(lang);
  const dica = useMemo(() => (item ? dicaDaFrase(item.answer, lang) : ''), [item, lang]);

  /* Sem frase nenhuma não há o que jogar: tela amigável com a saída, em vez de um tabuleiro vazio. */
  const vazio = items.length === 0;

  useEffect(() => {
    if (item && ativo && !resultado) campo.current?.focus({ preventScroll: true });
  }, [i, ativo, item, resultado]);
  useEffect(() => {
    if (resultado) proxima.current?.focus({ preventScroll: true });
  }, [resultado]);

  const ouvir = () => {
    if (!item) return;
    falarNoJogo(item.answer, item.lang);
    setOuviu(true);
  };

  const conferir = (desistiu: boolean) => {
    if (!item || resultado || !ativo) return;
    const r = compararFrase(item.answer, texto, lang, { ignorarAcentos });
    const certo = !desistiu && r.nota >= LIMIAR_DE_ACERTO;
    setResultado(r);
    outcomes.current.push({
      ...(item.itemRef ? { itemRef: item.itemRef } : {}),
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioDoItem.current,
      hinted: comDica,
      revealed: desistiu,
    });
    const p = recontar(outcomes.current);
    setFeitos((n) => n + 1);
    if (certo) {
      setSeq((n) => n + 1);
      celebrar({ tipo: 'acerto', combo: seq + 1, el: caixa.current, pontos: p.ganho });
    } else {
      setSeq(0);
      celebrar({ tipo: 'erro', el: caixa.current });
      tremer(caixa.current);
      flutuar(caixa.current, t('Abaixo de {limiar}%', { limiar: LIMIAR_DE_ACERTO }), 'erro');
    }
  };

  const avancar = () => {
    if (i + 1 >= items.length) {
      if (finalizou.current) return;
      finalizou.current = true;
      const todos = outcomes.current;
      onFinish({
        gameId: modo,
        items: todos,
        score: scoreRound(modo, todos),
        durationMs: Date.now() - inicioDaRodada.current,
      });
      return;
    }
    inicioDoItem.current = Date.now();
    setTexto('');
    setResultado(null);
    setComDica(false);
    setOuviu(false);
    setI(i + 1);
  };

  const pedirDica = () => {
    if (resultado || comDica) return;
    setComDica(true);
    setSeq(0);
    campo.current?.focus({ preventScroll: true });
  };

  if (vazio) {
    return (
      <div className="ef-vazio" role="status">
        <p>
          <b>{t('Ainda não há frases para este exercício.')}</b>
        </p>
        <p>
          {modo === 'retraducao'
            ? t('A retradução usa frases que você já encontrou e que têm tradução. Capture mais conteúdo e volte aqui.')
            : t('O ditado de frase usa frases que você já encontrou. Capture mais conteúdo e volte aqui.')}
        </p>
        <button type="button" className="btn btn-solid" onClick={onExit}>
          {t('Voltar')}
        </button>
      </div>
    );
  }
  if (!item) return null;

  const ultima = i + 1 >= items.length;
  const idCampo = `ef-campo-${modo}`;
  const ouvirPrimeiro = modo === 'ditadoDeFrase';

  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={seq}
        acertos={placar.acertos}
        rotulo={t('{feitos} de {total} frases', { feitos, total: items.length })}
        progresso={feitos / Math.max(1, items.length)}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo={t('Mostrar dica')}
              title={t('Conta como dica: zera o combo')}
              data-ajuda="dica"
              disabled={!ativo || !!resultado || comDica}
              onClick={pedirDica}
            />
            <BotaoDeAjuda
              icone={Eye}
              rotulo={t('Ver o original')}
              title={t('Encerra a frase: conta como não consegui')}
              data-ajuda="original"
              disabled={!ativo || !!resultado}
              onClick={() => conferir(true)}
            />
          </>
        }
      />
      <p className="pj-instr">{instrucao(modo, ageProfile)}</p>
      <div className="pj-miolo ef-miolo" ref={caixa}>
        {ouvirPrimeiro &&
          (haVoz ? (
            <div className="pj-acoes">
              <button type="button" className="btn btn-solid pj-grande" data-pj="ouvir" onClick={ouvir}>
                <Play aria-hidden /> {ouviu ? t('Ouvir de novo') : t('Ouvir a frase')}
              </button>
            </div>
          ) : (
            <SemVozNoQuest idioma={lang} />
          ))}
        {!ouvirPrimeiro && (
          <p className="ef-pista" lang="">
            <span className="label-mono">{t('Tradução')}</span>
            <span className="ef-pista-texto">{item.prompt}</span>
          </p>
        )}
        {comDica && (
          <p className="ef-dica" lang={lang}>
            <span className="label-mono">{t('Dica')}</span>{' '}
            <span aria-label={t('Dica: primeira letra de cada palavra')}>{dica}</span>
          </p>
        )}
        <div className="pj-entrada">
          <label className="ef-rotulo" htmlFor={idCampo}>
            {ouvirPrimeiro ? t('O que você ouviu') : t('Sua frase no idioma que você estuda')}
          </label>
          <input
            id={idCampo}
            ref={campo}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            lang={lang}
            value={texto}
            disabled={!!resultado}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                conferir(false);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-solid"
            data-pj="conferir"
            disabled={!!resultado}
            onClick={() => conferir(false)}
          >
            <CornerDownLeft aria-hidden /> {t('Conferir')}
          </button>
        </div>
        <label className="ef-opcao">
          <input
            type="checkbox"
            checked={ignorarAcentos}
            disabled={!!resultado}
            onChange={(e) => {
              setIgnorarAcentos(e.target.checked);
              guardarAcentos(e.target.checked);
            }}
          />{' '}
          {t('Não contar acentos como erro')}
        </label>
        <div className="ef-resultado" aria-live="polite">
          {resultado && (
            <>
              <p className="ef-nota">
                <b>{t('Nota {nota} de 100', { nota: resultado.nota })}</b>
                {' · '}
                {resultado.igual ? t('Igual ao original.') : resumoDoResultado(resultado)}
              </p>
              <ul className="ef-tokens" aria-label={t('Comparação palavra por palavra')} lang={lang}>
                {resultado.tokens.map((tk, k) => (
                  <li key={k} className={`ef-tok ef-${tk.status}`} aria-label={descricaoDoToken(tk)}>
                    <span aria-hidden="true">
                      <span className="ef-marca">{MARCA[tk.status]}</span>
                      <span className={tk.status === 'sobrando' ? 'ef-risca' : undefined}>
                        {tk.status === 'sobrando' ? tk.resposta : tk.alvo}
                      </span>
                      {tk.status === 'trocada' && <small>{tk.resposta}</small>}
                    </span>
                  </li>
                ))}
              </ul>
              {modo === 'retraducao' && (
                <p className="ef-original" lang={lang}>
                  <span className="label-mono">{t('Original')}</span> {item.answer}
                </p>
              )}
              {modo === 'ditadoDeFrase' && item.prompt && (
                <p className="ef-original">
                  <span className="label-mono">{t('Tradução')}</span> {item.prompt}
                </p>
              )}
              <div className="pj-acoes">
                {haVoz && (
                  <button type="button" className="btn btn-outline" onClick={ouvir}>
                    <Play aria-hidden /> {t('Ouvir o original')}
                  </button>
                )}
                <button ref={proxima} type="button" className="btn btn-solid" data-pj="proxima" onClick={avancar}>
                  {ultima ? t('Ver resultado') : t('Próxima frase')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function Retraducao(props: PropsDeJogo) {
  return <ExercicioDeFrase {...props} modo="retraducao" />;
}

export function DitadoDeFrase(props: PropsDeJogo) {
  return <ExercicioDeFrase {...props} modo="ditadoDeFrase" />;
}
