/**
 * PEÇAS DA MEMÓRIA V2 (flag `estudo_palavras_v2`; openspec `modelo-do-aluno-e-dados` 4.1 e 4.3, `cartoes` 4.2):
 *  - `DefinicaoDaMetrica`: o "?" ao lado de cada número, com a definição por escrito para o leitor de tela e para o toque;
 *  - `MemoriaPorFonte`: as sessões, os baralhos do Anki e a Trilha, com as MESMAS contagens do catálogo de conteúdo, a
 *    retenção (só com 20 ou mais revisões) e quando o baralho volta a pedir revisão.
 */
import { CircleHelp } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ContagensDeConteudo } from '../../../core/learning/contagensDeConteudo';
import { definicaoDaMetrica, type MetricaDaMemoria } from '../../../core/palavras/definicoesDasMetricas';
import { type MemoriaPorBaralho, MINIMO_DE_REVISOES } from '../../../core/palavras/memoriaDoBaralho';
import { agruparPorFonte, type LinhaPorFonte } from '../../../core/palavras/porFonte';
import { lerMemoriaPorBaralho } from '../../../data/rotas/memoriaPorBaralho';
import { numero, t } from '../../../lib/i18n';
import { toast } from '../../Toast';
import { CabecaDoCartao } from './pecas';

/** O "?" de um número: o nome e a definição viram o nome acessível do botão, e o toque mostra o texto. */
export function DefinicaoDaMetrica({ id }: { id: MetricaDaMemoria }) {
  const d = definicaoDaMetrica(id);
  const nome = t(d.nome);
  const texto = t(d.definicao);
  return (
    <button
      type="button"
      className="ct-dica"
      data-testid={`definicao-${id}`}
      title={texto}
      aria-label={`${nome}: ${texto}`}
      onClick={() => toast.info(texto, { duration: 6000 })}
    >
      <CircleHelp aria-hidden />
    </button>
  );
}

function quandoVoltaPorExtenso(l: LinhaPorFonte): string {
  const v = l.volta;
  if (v.quando === 'em') return t('em {n} dias', { n: v.dias });
  if (v.quando === 'agora') return t('agora');
  if (v.quando === 'hoje') return t('hoje');
  if (v.quando === 'amanha') return t('amanhã');
  return '—';
}

const TITULO_DO_GRUPO = () => ({
  sessao: t('Sessões'),
  anki: t('Baralhos do Anki'),
  trilha: t('Trilha'),
});

export function MemoriaPorFonte({
  contagens,
  inicioDoDia,
}: {
  /** As contagens do catálogo de conteúdo (as mesmas da ficha); `null` enquanto não chegaram. */
  contagens: ContagensDeConteudo | null;
  inicioDoDia: number;
}) {
  const [memoria, setMemoria] = useState<MemoriaPorBaralho | null>(null);
  useEffect(() => {
    let vivo = true;
    lerMemoriaPorBaralho()
      .then((m) => vivo && setMemoria(m))
      .catch(() => vivo && setMemoria(null));
    return () => {
      vivo = false;
    };
  }, []);
  if (!contagens) return null;
  const grupos = agruparPorFonte(contagens, memoria, inicioDoDia);
  if (!grupos.length) return null;
  const nomes = TITULO_DO_GRUPO();
  return (
    <section className="q-cartao ct-mem-fontes" data-testid="memoria-por-fonte">
      <CabecaDoCartao
        titulo={t('Por fonte')}
        sub={t('Cada sessão, baralho do Anki e a Trilha: quantas palavras, quanto você lembra e quando voltam.')}
        extra={<DefinicaoDaMetrica id="retencaoPorFonte" />}
      />
      {grupos.map((g) => (
        <div key={g.grupo} className="q-tabela-caixa">
          <table className="q-tabela" aria-label={nomes[g.grupo]}>
            <thead>
              <tr>
                <th>{nomes[g.grupo]}</th>
                <th>{t('Palavras')}</th>
                <th>{t('Lembradas')}</th>
                <th>{t('Volta')}</th>
              </tr>
            </thead>
            <tbody>
              {g.linhas.map((l) => (
                <tr key={`${l.grupo}:${l.id}`} data-fonte={`${l.grupo}:${l.id}`}>
                  <td>{l.grupo === 'trilha' ? t('Trilha de vocabulário') : l.nome || t('Sem nome')}</td>
                  <td>{numero(l.palavras)}</td>
                  <td>
                    {l.retencao !== null ? (
                      `${l.retencao}%`
                    ) : (
                      <span
                        className="qv-apagado"
                        title={t('Com menos de {n} revisões o número ainda não diz nada.', { n: MINIMO_DE_REVISOES })}
                      >
                        {l.revisoes > 0 ? t('poucas revisões ainda') : '—'}
                      </span>
                    )}
                  </td>
                  <td>{quandoVoltaPorExtenso(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="qv-nota">
        {t('A retenção só aparece com {n} ou mais revisões nos últimos 90 dias.', { n: MINIMO_DE_REVISOES })}
      </p>
    </section>
  );
}
