import { Users } from 'lucide-react';
import { useMemo } from 'react';

import { type Conta, lerOrcamentoDeIa, lerResumo, listarContas, listarPendencias } from '../../../lib/admin';
import { t } from '../../../lib/i18n';
import Barra from '../../ui/Barra';
import { dataHora, dolar } from './formatar';
import { Estado, Etiqueta, Kpi, Secao } from './pecas';
import { useCarga } from './useCarga';

/** Resumo: números do dono, contas por papel e estado, pendências de cobrança e o gasto de IA do mês. */
export default function PainelResumo({ aoPedirCodigo }: { aoPedirCodigo: () => void }) {
  const resumo = useCarga(lerResumo, aoPedirCodigo);
  const ia = useCarga(lerOrcamentoDeIa, aoPedirCodigo);
  const contas = useCarga(listarContas, aoPedirCodigo);
  const pendencias = useCarga(listarPendencias, aoPedirCodigo);

  const porPapel = useMemo(() => contar(contas.dados ?? [], (c) => c.role), [contas.dados]);
  const porEstado = useMemo(() => contar(contas.dados ?? [], (c) => c.status), [contas.dados]);

  return (
    <div className="ad-painel">
      <Secao
        titulo={t('Em números')}
        sub={resumo.dados ? t('Gerado em {quando}', { quando: dataHora(resumo.dados.geradoEm) }) : undefined}
      >
        <Estado carga={resumo}>
          {(r) => (
            <div className="ad-grade">
              <Kpi rotulo={t('Contas')} valor={r.usuarios} />
              <Kpi rotulo={t('Contas novas em 7 dias')} valor={r.usuariosNovos7d} />
              <Kpi rotulo={t('Sessões')} valor={r.sessoes} />
              <Kpi rotulo={t('Sessões em 7 dias')} valor={r.sessoes7d} />
              <Kpi rotulo={t('Falas')} valor={r.falas} />
              <Kpi rotulo={t('Cartões de vocabulário')} valor={r.cartoesDeVocabulario} />
            </div>
          )}
        </Estado>
      </Secao>

      <Secao
        titulo={t('Gasto de IA do mês')}
        sub={
          ia.dados
            ? t('Mês {mes}. Estimativa em dólares; o teto vem da configuração do servidor.', { mes: ia.dados.mes })
            : undefined
        }
      >
        <Estado carga={ia}>
          {(o) => {
            const tom = !o.portao.ok ? 'error' : (o.percentual ?? 0) >= 80 ? 'warn' : 'good';
            return (
              <>
                <div className="ad-grade">
                  <Kpi
                    rotulo={t('Gasto no mês')}
                    valor={dolar(o.gastoUsd)}
                    nota={o.tetoUsd === null ? t('Sem teto definido') : t('Teto: {teto}', { teto: dolar(o.tetoUsd) })}
                    tom={tom}
                  />
                  <Kpi
                    rotulo={t('Do teto do mês')}
                    valor={o.percentual === null ? '—' : `${o.percentual}%`}
                    nota={t('{n} chamadas', { n: o.chamadas })}
                    tom={tom}
                  />
                  <Kpi
                    rotulo={t('Gasto hoje (UTC)')}
                    valor={dolar(o.dia.gastoUsd)}
                    nota={
                      o.dia.tetoUsd === null
                        ? t('Sem teto diário')
                        : t('Teto do dia: {teto}', { teto: dolar(o.dia.tetoUsd) })
                    }
                  />
                </div>
                {o.percentual !== null && (
                  <Barra
                    pct={o.percentual}
                    tom={tom === 'good' ? 'good' : tom}
                    rotuloAcessivel={t('Gasto de IA do mês contra o teto')}
                    className="ad-barra"
                  />
                )}
                <p className="ad-linha-de-estado">
                  {o.ligada ? (
                    <Etiqueta tom="bom">{t('IA de nuvem ligada')}</Etiqueta>
                  ) : (
                    <Etiqueta tom="erro">{t('IA de nuvem desligada')}</Etiqueta>
                  )}{' '}
                  {o.portao.ok ? (
                    <Etiqueta tom="bom">{t('Portão aberto')}</Etiqueta>
                  ) : (
                    <Etiqueta tom="erro">{t('Portão fechado')}</Etiqueta>
                  )}
                  {o.portao.mensagem && <span className="ad-nota">{o.portao.mensagem}</span>}
                </p>
                {(o.alerta80Em || o.esgotadoEm) && (
                  <p className="ad-nota">
                    {o.alerta80Em ? t('80% cruzado em {quando}.', { quando: dataHora(o.alerta80Em) }) : ''}{' '}
                    {o.esgotadoEm ? t('Teto esgotado em {quando}.', { quando: dataHora(o.esgotadoEm) }) : ''}
                  </p>
                )}
              </>
            );
          }}
        </Estado>
      </Secao>

      <Secao titulo={t('Cobrança')}>
        <Estado carga={pendencias}>
          {(p) => (
            <div className="ad-grade">
              <Kpi
                rotulo={t('Eventos de cobrança pendentes')}
                valor={p.length}
                nota={p.length ? t('Veja a aba Cobrança') : t('Nada à espera')}
                tom={p.length ? 'warn' : 'good'}
              />
            </div>
          )}
        </Estado>
      </Secao>

      <Secao
        titulo={t('Contas por papel e estado')}
        sub={t('Contado nas contas mais recentes que a rota devolve (no máximo 200).')}
      >
        <Estado
          carga={contas}
          estaVazio={(c) => c.length === 0}
          vazio={{
            icone: <Users aria-hidden />,
            titulo: t('Nenhuma conta ainda'),
            explicacao: t('Quando alguém criar uma conta, ela aparece aqui.'),
          }}
        >
          {(c) => (
            <div className="ad-grade">
              <Kpi rotulo={t('Contas listadas')} valor={c.length} />
              <Kpi rotulo={t('Papel: usuário')} valor={porPapel.user ?? 0} />
              <Kpi rotulo={t('Papel: suporte')} valor={porPapel.support ?? 0} />
              <Kpi rotulo={t('Papel: admin')} valor={porPapel.admin ?? 0} />
              <Kpi rotulo={t('Ativas')} valor={porEstado.active ?? 0} />
              <Kpi
                rotulo={t('Suspensas')}
                valor={porEstado.suspended ?? 0}
                tom={porEstado.suspended ? 'warn' : undefined}
              />
            </div>
          )}
        </Estado>
      </Secao>
    </div>
  );
}

function contar(contas: Conta[], chave: (c: Conta) => string): Record<string, number> {
  const r: Record<string, number> = {};
  for (const c of contas) r[chave(c)] = (r[chave(c)] ?? 0) + 1;
  return r;
}
