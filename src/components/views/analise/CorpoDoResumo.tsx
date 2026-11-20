import { makeCloze } from '@core';
import { Cloud, ListChecks, Plus } from 'lucide-react';
import { useState } from 'react';

import { AMOSTRA_DE_IA } from '../../../core/planos';
import { bulkAddCards } from '../../../data/api';
import type { CartaoDoResumo, FalhaDoEstudo, RespostaDoResumo } from '../../../data/apiDoEstudo';
import { useConsentimentoDeNuvem } from '../../../lib/consentimentoDeNuvem';
import { diaQueACotaVolta } from '../../../lib/diaQueACotaVolta';
import { t } from '../../../lib/i18n';
import { perfilProtegido } from '../../../lib/protecaoDoMenor';
import type { VocabCard } from '../../../types';
import NaoAjudou from '../../NaoAjudou';

/* O cliente chega por `import()` UMA vez, e os pedidos seguintes reusam a mesma promessa. */
let apiDoEstudo: Promise<typeof import('../../../data/apiDoEstudo')> | null = null;
const carregarApi = () => (apiDoEstudo ??= import('../../../data/apiDoEstudo'));

type Pedido =
  | { estado: 'carregando' }
  | { estado: 'ok'; valor: RespostaDoResumo }
  | { estado: 'erro'; motivo: FalhaDoEstudo };

/** O que aconteceu com cada cartão que foi ao baralho (pela posição na lista). */
type Destino = { entrou: true } | { entrou: false; motivo: string };

type Adicao =
  | { estado: 'enviando' }
  | { estado: 'feito'; entraram: number; fora: { word: string; motivo: string }[] }
  | { estado: 'erro' };

/**
 * A FRASE de cada recusa. Nenhuma tem preço, urgência nem número; o que continua funcionando entra na frase. O
 * link de Planos (só adulto, só no fim da amostra) é decidido no componente.
 */
function fraseDaFalha(m: FalhaDoEstudo, protegido: boolean): string {
  switch (m) {
    case 'amostra_acabou':
      return protegido
        ? t(
            'O resumo desta semana já foi usado. A transcrição e as palavras seguem funcionando. Volta na segunda-feira.',
          )
        : t(
            'O resumo desta semana já foi usado. A transcrição e as palavras seguem funcionando, e o próximo resumo volta na segunda-feira.',
          );
    case 'cota_do_mes':
      return t('Você usou os resumos deste mês; eles voltam no dia {data}.', { data: diaQueACotaVolta() });
    case 'uso_justo':
      return t('Você chegou ao limite de hoje. Volta amanhã.');
    case 'nuvem_ocupada':
      return t('A nuvem está ocupada agora. Tente de novo em instantes.');
    case 'sem_conta':
      return t('Entre na sua conta para resumir sessões.');
    case 'sem_plano':
      return t('O resumo da sessão não está disponível nesta conta. A transcrição e as palavras seguem funcionando.');
    case 'sessao_curta':
      return t('A sessão precisa de pelo menos 4 falas para virar resumo.');
    default:
      return t('Não deu para resumir agora.');
  }
}

/** O motivo do servidor para um cartão que não entrou, em palavras de gente. */
function motivoDoCartao(motivo: string): string {
  switch (motivo) {
    case 'duplicada':
      return t('Já está no seu baralho');
    case 'gramatical':
      return t('Palavra gramatical');
    case 'traducao-igual':
      return t('Tradução igual à palavra');
    case 'pista-ruim':
      return t('A tradução não explica');
    case 'palavra-curta':
      return t('Curta demais');
    case 'palavra-ruido':
      return t('Ruído da captura');
    case 'sem-pista':
      return t('Sem tradução nem frase');
    case 'idioma-incerto':
      return t('Sem idioma marcado');
    default:
      return t('Não entrou no baralho');
  }
}

const rotuloDeAdicionar = (n: number) => (n === 1 ? t('Adicionar 1 cartão') : t('Adicionar {n} cartões', { n }));

function fraseDaAdicao(a: Adicao): string {
  if (a.estado === 'enviando') return t('Adicionando os cartões…');
  if (a.estado === 'erro') return t('Não deu para adicionar os cartões agora.');
  if (a.entraram === 0) return t('Nenhum cartão entrou no seu baralho.');
  return a.entraram === 1
    ? t('1 cartão entrou no seu baralho.')
    : t('{n} cartões entraram no seu baralho.', { n: a.entraram });
}

/**
 * "RESUMIR A SESSÃO" — 3 pontos curtos e a lista de cartões propostos (o servidor já filtrou o que o bulk-add
 * recusaria), todos marcados. "Adicionar N cartões" manda SÓ os marcados e diz quantos entraram e, um a um, quais
 * ficaram de fora e por quê. Molde: `CorpoDaExplicacao` (consentimento, amostra, protegido, aviso sempre montado).
 */
export default function CorpoDoResumo({
  sessionId,
  lang,
  aoConhecer,
  aoAdicionar,
}: {
  sessionId: string;
  lang: string;
  aoConhecer?: () => void;
  aoAdicionar?: (criados: VocabCard[]) => void;
}) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [marcados, setMarcados] = useState<boolean[]>([]);
  const [destinos, setDestinos] = useState<(Destino | null)[]>([]);
  const [adicao, setAdicao] = useState<Adicao | null>(null);
  const protegido = perfilProtegido();

  const resumir = async () => {
    setPedido({ estado: 'carregando' });
    setAdicao(null);
    const { resumirSessao } = await carregarApi();
    const res = await resumirSessao({ sessionId, lang });
    if (res.ok === false) {
      setPedido({ estado: 'erro', motivo: res.motivo });
      return;
    }
    setMarcados(res.valor.cartoes.map(() => true));
    setDestinos(res.valor.cartoes.map(() => null));
    setPedido({ estado: 'ok', valor: res.valor });
  };

  /* A flag do cliente era um cache velho: o servidor diz que o recurso não existe, e a seção some. */
  if (pedido?.estado === 'erro' && pedido.motivo === 'fora') return null;

  const titulo = t('Resumo da sessão');
  const cabecalho = (
    <div>
      <h2 id="resumo-da-sessao-titulo">{titulo}</h2>
      <p>{t('Três pontos da sessão e cartões com as frases dela, para revisar depois.')}</p>
    </div>
  );

  if (!consentiu) {
    return (
      <section className="q-cartao q-secao resumo-da-sessao" aria-labelledby="resumo-da-sessao-titulo">
        <header>{cabecalho}</header>
        <p className="q-texto">{t('O resumo usa a IA de nuvem, que você ainda não autorizou.')}</p>
        <div className="q-acoes">
          <button type="button" className="q-ctl" onClick={() => void autorizar()}>
            <Cloud aria-hidden /> {t('Autorizar IA de nuvem')}
          </button>
        </div>
      </section>
    );
  }

  const ok = pedido?.estado === 'ok' ? pedido.valor : null;
  const cartoes = ok?.cartoes ?? [];
  const escolhiveis = cartoes.map((_, i) => destinos[i] == null);
  const escolhidos = cartoes.filter((_, i) => escolhiveis[i] && marcados[i]);
  const usados =
    ok && ok.origem === 'amostra' && ok.restanteNaAmostra !== null
      ? Math.max(0, AMOSTRA_DE_IA.resumosSemana - ok.restanteNaAmostra)
      : null;

  const adicionar = async () => {
    const indices = cartoes.map((_, i) => i).filter((i) => escolhiveis[i] && marcados[i]);
    if (!indices.length) return;
    setAdicao({ estado: 'enviando' });
    const lote = indices.map((i) => cartoes[i]);
    try {
      const { cards, skipped } = await bulkAddCards(
        lote.map((c: CartaoDoResumo) => {
          const cloze = makeCloze(c.sentence, c.word);
          return {
            word: c.word,
            back: c.back,
            sentence: c.sentence,
            srcLang: c.srcLang,
            tgtLang: c.tgtLang,
            clozePrompt: cloze?.prompt,
            clozeAnswer: cloze?.answer,
            sessionId,
          };
        }),
      );
      const foraPorPalavra = new Map(skipped.map((s) => [s.word.trim().toLowerCase(), s.motivo]));
      setDestinos((antes) => {
        const depois = [...antes];
        for (const i of indices) {
          const motivo = foraPorPalavra.get(cartoes[i].word.trim().toLowerCase());
          depois[i] = motivo === undefined ? { entrou: true } : { entrou: false, motivo };
        }
        return depois;
      });
      setAdicao({ estado: 'feito', entraram: cards.length, fora: skipped });
      if (cards.length) aoAdicionar?.(cards);
    } catch {
      setAdicao({ estado: 'erro' });
    }
  };

  /* O AVISO fica SEMPRE montado e só o texto troca (um `role="status"` que nasce junto com a frase pode não ser
     anunciado). Ele diz o estado do pedido e, depois, o do baralho. */
  const aviso =
    pedido?.estado === 'carregando'
      ? t('Resumindo a sessão…')
      : pedido?.estado === 'erro'
        ? fraseDaFalha(pedido.motivo, protegido)
        : adicao
          ? fraseDaAdicao(adicao)
          : '';

  return (
    <section className="q-cartao q-secao resumo-da-sessao" aria-labelledby="resumo-da-sessao-titulo">
      <header>
        {cabecalho}
        {!ok && (
          <button
            type="button"
            className="q-ctl pri"
            disabled={pedido?.estado === 'carregando'}
            onClick={() => void resumir()}
          >
            <ListChecks aria-hidden /> {t('Resumir a sessão')}
          </button>
        )}
      </header>
      <p className="q-texto resumo-aviso" role="status">
        {aviso}
      </p>
      {pedido?.estado === 'erro' && pedido.motivo === 'amostra_acabou' && aoConhecer && !protegido && (
        <div className="q-acoes">
          <button type="button" className="q-ctl" onClick={aoConhecer}>
            {t('Ver os planos')}
          </button>
        </div>
      )}
      {adicao?.estado === 'feito' && adicao.fora.length > 0 && (
        <div className="resumo-fora">
          <p className="q-rotulo">{t('Ficaram de fora')}</p>
          <ul>
            {adicao.fora.map((f) => (
              <li key={f.word}>
                <b>{f.word}</b>: {motivoDoCartao(f.motivo)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ok && (
        <div className="resumo-corpo" data-testid="resumo-da-sessao">
          <ol className="resumo-pontos">
            {ok.pontos.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
          {cartoes.length === 0 ? (
            <p className="q-texto">{t('Nenhuma frase desta sessão virou cartão desta vez.')}</p>
          ) : (
            <fieldset className="resumo-cartoes">
              <legend className="q-rotulo">{t('Cartões para revisar')}</legend>
              {cartoes.map((c, i) => {
                const destino = destinos[i];
                return (
                  <label key={`${c.word}-${i}`} className="resumo-cartao" data-tratado={destino ? '' : undefined}>
                    <input
                      type="checkbox"
                      checked={destino ? destino.entrou : marcados[i]}
                      disabled={!!destino || adicao?.estado === 'enviando'}
                      onChange={(e) => {
                        const v = e.currentTarget.checked;
                        setMarcados((m) => m.map((x, k) => (k === i ? v : x)));
                      }}
                    />
                    <span className="resumo-cartao-texto">
                      <span className="resumo-cartao-frente">
                        <b lang={c.srcLang}>{c.word}</b> · <span lang={c.tgtLang}>{c.back}</span>
                        {destino?.entrou && <span className="q-tag">{t('No baralho')}</span>}
                        {destino && 'motivo' in destino && (
                          <span className="q-tag">{motivoDoCartao(destino.motivo)}</span>
                        )}
                      </span>
                      <span className="resumo-cartao-frase" lang={c.srcLang}>
                        {c.sentence}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {cartoes.length > 0 && (
            <div className="q-acoes">
              <button
                type="button"
                className="q-ctl pri"
                disabled={escolhidos.length === 0 || adicao?.estado === 'enviando'}
                onClick={() => void adicionar()}
              >
                <Plus aria-hidden /> {rotuloDeAdicionar(escolhidos.length)}
              </button>
            </div>
          )}
          <p className="resumo-nota">
            {t('Isto é uma IA e pode errar.')}
            {usados !== null &&
              ' ' +
                (AMOSTRA_DE_IA.resumosSemana === 1
                  ? t('Você usou {n} de {total} resumo nesta semana.', {
                      n: usados,
                      total: AMOSTRA_DE_IA.resumosSemana,
                    })
                  : t('Você usou {n} de {total} resumos nesta semana.', {
                      n: usados,
                      total: AMOSTRA_DE_IA.resumosSemana,
                    }))}
          </p>
          <NaoAjudou funcao="resumo" modelo={ok.modelo} className="q-ctl" />
        </div>
      )}
    </section>
  );
}
