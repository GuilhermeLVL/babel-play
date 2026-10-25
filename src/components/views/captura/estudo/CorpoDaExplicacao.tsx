import { Cloud, Lightbulb } from 'lucide-react';
import { useState } from 'react';

import { AMOSTRA_DE_IA } from '../../../../core/planos';
import type { FalhaDoEstudo, RespostaDaExplicacao } from '../../../../data/apiDoEstudo';
import { useConsentimentoDeNuvem } from '../../../../lib/consentimentoDeNuvem';
import { diaQueACotaVolta } from '../../../../lib/diaQueACotaVolta';
import { t } from '../../../../lib/i18n';
import { perfilProtegido } from '../../../../lib/protecaoDoMenor';
import NaoAjudou from '../../../NaoAjudou';

/** A fala tocada, no que a explicação precisa. */
export interface FalaDaExplicacao {
  texto: string;
  traducao: string;
  /** O idioma da fala (BCP-47). */
  lang: string;
}

/* O cliente chega por `import()` UMA vez, e os pedidos seguintes reusam a mesma promessa. */
let apiDoEstudo: Promise<typeof import('../../../../data/apiDoEstudo')> | null = null;
const carregarApi = () => (apiDoEstudo ??= import('../../../../data/apiDoEstudo'));

type Pedido =
  | { estado: 'carregando' }
  | { estado: 'ok'; valor: RespostaDaExplicacao }
  | { estado: 'erro'; motivo: FalhaDoEstudo };

/**
 * A FRASE de cada recusa. Nenhuma tem preço, urgência nem contagem do pool; o que continua funcionando
 * entra na frase. O link de Planos (só adulto, só no fim da amostra) é decidido no componente.
 */
function fraseDaFalha(m: FalhaDoEstudo, protegido: boolean): string {
  switch (m) {
    case 'amostra_acabou':
      return protegido
        ? t('A amostra de hoje acabou. A legenda e as palavras seguem funcionando. Volta amanhã.')
        : t('A amostra de hoje acabou. A legenda e as palavras seguem funcionando, e as explicações voltam amanhã.');
    case 'cota_do_mes':
      return t('Você usou as explicações deste mês; elas voltam no dia {data}.', { data: diaQueACotaVolta() });
    case 'uso_justo':
      return t('Você chegou ao limite de hoje. Volta amanhã.');
    case 'nuvem_ocupada':
      return t('A nuvem está ocupada agora. Tente de novo em instantes.');
    case 'sem_conta':
      return t('Entre na sua conta para explicar frases.');
    case 'sem_plano':
      return t('A explicação da frase não está disponível nesta conta. A legenda e as palavras seguem funcionando.');
    default:
      return t('Não deu para explicar agora.');
  }
}

/**
 * "EXPLICAR ESTA FRASE" — quatro blocos curtos (por que essa tradução, gramática, registro e, só se houver,
 * gíria) escritos por uma IA. Molde: `NuanceDaFrase`. Sem a IA de nuvem autorizada nenhum pedido sai; a
 * explicação é sempre sob pedido (cada uma gasta a cota ou a amostra), e o resultado fica na tela até a
 * frase mudar (quem chama põe `key` na frase).
 */
export default function CorpoDaExplicacao({
  fala,
  destino,
  contexto,
  aoConhecer,
}: {
  fala: FalaDaExplicacao;
  destino: string;
  contexto?: ReadonlyArray<string>;
  aoConhecer?: () => void;
}) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const protegido = perfilProtegido();

  const explicar = async () => {
    setPedido({ estado: 'carregando' });
    const { explicarFrase } = await carregarApi();
    const res = await explicarFrase({
      texto: fala.texto,
      traducao: fala.traducao,
      lang: fala.lang,
      langDaTraducao: destino,
      contexto,
    });
    setPedido(res.ok === false ? { estado: 'erro', motivo: res.motivo } : { estado: 'ok', valor: res.valor });
  };

  /* A flag do cliente era um cache velho: o servidor diz que o recurso não existe, e a seção some. */
  if (pedido?.estado === 'erro' && pedido.motivo === 'fora') return null;

  const rotulo = t('Explicar esta frase');
  if (!consentiu) {
    return (
      <section className="explicacao-da-frase" aria-label={rotulo} style={{ display: 'grid', gap: 10 }}>
        <p className="folha-rotulo">{rotulo}</p>
        <p className="folha-def">{t('A explicação usa a IA de nuvem, que você ainda não autorizou.')}</p>
        <button type="button" className="folha-acao" onClick={() => void autorizar()}>
          <Cloud aria-hidden /> {t('Autorizar IA de nuvem')}
        </button>
      </section>
    );
  }

  const ok = pedido?.estado === 'ok' ? pedido.valor : null;
  const usadas =
    ok && ok.origem === 'amostra' && ok.restanteNaAmostra !== null
      ? Math.max(0, AMOSTRA_DE_IA.explicacoesDia - ok.restanteNaAmostra)
      : null;
  const bloco = (titulo: string, texto: string) => (
    <div className="explicacao-bloco" key={titulo}>
      <p className="folha-rotulo">{titulo}</p>
      <p className="folha-def">{texto}</p>
    </div>
  );

  return (
    <section className="explicacao-da-frase" aria-label={rotulo} style={{ display: 'grid', gap: 10 }}>
      <p className="folha-rotulo">{rotulo}</p>
      {!ok && (
        <button
          type="button"
          className="folha-acao"
          disabled={pedido?.estado === 'carregando'}
          onClick={() => void explicar()}
        >
          <Lightbulb aria-hidden /> {rotulo}
        </button>
      )}
      {/* O aviso fica SEMPRE montado (vazio em repouso) e só o texto troca: um `role="status"` que nasce junto com a
          frase pode não ser anunciado pelo leitor de tela. */}
      <p className="folha-status" role="status">
        {pedido?.estado === 'carregando'
          ? t('Explicando a frase…')
          : pedido?.estado === 'erro'
            ? fraseDaFalha(pedido.motivo, protegido)
            : ''}
      </p>
      {pedido?.estado === 'erro' && pedido.motivo === 'amostra_acabou' && aoConhecer && !protegido && (
        <button type="button" className="folha-acao" onClick={aoConhecer}>
          {t('Ver os planos')}
        </button>
      )}
      {ok && (
        <div className="explicacao-blocos" data-testid="explicacao-da-frase" style={{ display: 'grid', gap: 8 }}>
          {bloco(t('Por que essa tradução'), ok.explicacao.porQue)}
          {ok.explicacao.gramatica && bloco(t('Gramática'), ok.explicacao.gramatica)}
          {ok.explicacao.registro && bloco(t('Registro'), ok.explicacao.registro)}
          {ok.explicacao.girias.length > 0 && (
            <div className="explicacao-bloco">
              <p className="folha-rotulo">{t('Gíria')}</p>
              {ok.explicacao.girias.map((g) => (
                <p className="folha-def" key={g.termo}>
                  <b>{g.termo}</b>: {g.sentido}
                </p>
              ))}
            </div>
          )}
          <p className="folha-status" style={{ fontSize: 12 }}>
            {t('Isto é uma IA e pode errar.')}
            {usadas !== null &&
              ' ' + t('Você usou {n} de {total} explicações hoje.', { n: usadas, total: AMOSTRA_DE_IA.explicacoesDia })}
          </p>
          <NaoAjudou funcao="explicacao" modelo={ok.modelo} />
        </div>
      )}
    </section>
  );
}
