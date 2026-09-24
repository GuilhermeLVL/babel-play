import {
  ArrowLeftRight,
  ChevronRight,
  CirclePause,
  CreditCard,
  FileText,
  type LucideIcon,
  Receipt,
  RotateCcw,
  X,
} from 'lucide-react';

import { brl, type Conta, dataCurta, type Fatura, precoMensal, ROTULO_DO_METODO } from '../../../lib/assinatura';
import { IconeEmBloco, TituloDeSecao } from '../../ui';
import { PLANO_ICO, PLANO_NOME } from './dados';
import FaixaDaConta from './FaixaDaConta';

/**
 * SUA ASSINATURA — a aba de Planos para quem assina (`abaSuaAssinatura()` do protótipo).
 *
 * Resumo, ações, faturas e a zona de cancelar, na marcação do protótipo. Os dados são do
 * servidor: status e fim do período de `/api/billing/status`, faturas de `/api/billing/faturas`.
 * "Passar para anual" não aparece: o servidor só cobra por mês.
 */

export type DialogoDaAssinatura = 'mudar-plano' | 'pagamento' | 'pausar' | { fatura: Fatura };

const STATUS: Record<Fatura['status'], [string, string]> = {
  paga: ['ok', 'Paga'],
  falhou: ['warn', 'Falhou'],
  pendente: ['neu', 'Pendente'],
  estornada: ['rare', 'Estornada'],
};

/** O meio da última fatura paga — é o que a pessoa usou. Sem fatura paga, os meios aceitos. */
export function metodoAtual(faturas: Fatura[] | null): string {
  const paga = faturas?.find((f) => f.status === 'paga' && f.metodo);
  return paga?.metodo ? ROTULO_DO_METODO[paga.metodo] : 'Pix, boleto ou cartão';
}

export default function SuaAssinatura({
  conta,
  faturas,
  carregandoFaturas,
  abrir,
  aoCancelar,
  aoTentarDeNovo,
  aoReativar,
}: {
  conta: Conta;
  faturas: Fatura[] | null;
  carregandoFaturas: boolean;
  abrir: (d: DialogoDaAssinatura) => void;
  aoCancelar: () => void;
  aoTentarDeNovo: (f: Fatura) => void;
  aoReativar: () => void;
}) {
  const e = conta.estado;
  const plano = conta.plano ?? 'pro';
  const p = PLANO_NOME[plano];
  const pagas = (faturas ?? []).filter((f) => f.status === 'paga');
  const desde = pagas.length ? pagas[pagas.length - 1].data : null;

  const acoes: [LucideIcon, string, string, DialogoDaAssinatura, boolean][] = [
    [
      ArrowLeftRight,
      'Mudar de plano',
      'Suba ou desça de plano, com a ajuda do suporte.',
      'mudar-plano',
      e !== 'cancelada',
    ],
    [CreditCard, 'Forma de pagamento', `${metodoAtual(faturas)} · você escolhe a cada cobrança`, 'pagamento', true],
    [CirclePause, 'Pausar a assinatura', 'De 1 a 3 meses, pelo suporte.', 'pausar', e !== 'cancelada'],
  ];

  return (
    <>
      {(e === 'falhou' || e === 'cancelada') && (
        <FaixaDaConta
          conta={conta}
          naAssinatura
          aoGerenciar={() => {}}
          aoAtualizarPagamento={() => abrir('pagamento')}
          aoReativar={aoReativar}
        />
      )}
      <div className="g2 assin" style={{ alignItems: 'start' }}>
        <section className="cartao p6 resumo-assin">
          <div className="linha" style={{ gap: 12 }}>
            <IconeEmBloco icone={PLANO_ICO[plano]} />
            <div>
              <span className="label-mono">Plano</span>
              <h2 style={{ fontSize: 20, fontWeight: 900 }}>{p} · mensal</h2>
            </div>
          </div>
          <dl className="dados">
            <div>
              <dt>Valor</dt>
              <dd className="tn">{brl(precoMensal(plano))} por mês</dd>
            </div>
            <div>
              <dt>{e === 'ativa' ? 'Próxima cobrança' : 'Acesso até'}</dt>
              <dd className="tn">{dataCurta(conta.valeAte)}</dd>
            </div>
            <div>
              <dt>Pagamento</dt>
              <dd>{metodoAtual(faturas)}</dd>
            </div>
            <div>
              <dt>Assinante desde</dt>
              <dd className="tn">{dataCurta(desde)}</dd>
            </div>
          </dl>
        </section>
        <section className="acoes-assin">
          {acoes
            .filter((a) => a[4])
            .map(([I, t, d, k]) => (
              <button key={t} type="button" className="cartao clicavel acao-assin" onClick={() => abrir(k)}>
                <IconeEmBloco icone={I} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{t}</b>
                  <small className="mut">{d}</small>
                </span>
                <ChevronRight aria-hidden style={{ width: 16, height: 16, color: 'var(--ink-muted)' }} />
              </button>
            ))}
        </section>
      </div>

      <section className="secao">
        <TituloDeSecao
          icone={Receipt}
          titulo="Faturas"
          desc="Recibo de cada cobrança. O processador de pagamento avisa também por e-mail."
        />
        <div className="cartao compara" tabIndex={0} aria-label="Faturas">
          <table className="tabela faturas">
            <thead>
              <tr>
                <th className="label-mono">Data</th>
                <th className="label-mono">Descrição</th>
                <th className="label-mono">Valor</th>
                <th className="label-mono col-extra">Pagamento</th>
                <th className="label-mono">Status</th>
                <th>
                  <span className="sr">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {faturas === null || faturas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="mut">
                    {carregandoFaturas
                      ? 'Carregando as faturas…'
                      : faturas === null
                        ? 'Não consegui buscar as faturas agora. Isto não significa que não haja cobranças.'
                        : 'Nenhuma cobrança ainda.'}
                  </td>
                </tr>
              ) : (
                faturas.map((f) => (
                  <tr key={f.id}>
                    <td className="tn">{dataCurta(f.data)}</td>
                    <td>{f.descricao}</td>
                    <td className="tn">
                      <b>{brl(f.valor)}</b>
                    </td>
                    <td className="col-extra mut">{f.metodo ? ROTULO_DO_METODO[f.metodo] : '—'}</td>
                    <td>
                      <span className={`badge ${STATUS[f.status][0]}`}>{STATUS[f.status][1]}</span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {f.status === 'falhou' && f.link ? (
                        <button type="button" className="btn btn-solid peq" onClick={() => aoTentarDeNovo(f)}>
                          <RotateCcw aria-hidden /> Tentar de novo
                        </button>
                      ) : (
                        <button type="button" className="btn btn-outline peq" onClick={() => abrir({ fatura: f })}>
                          <FileText aria-hidden /> Recibo
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {e !== 'cancelada' && (
        <section className="secao cancelar-zona">
          <div>
            <b>Cancelar assinatura</b>
            <p className="mut">
              Você mantém o {p}
              {conta.valeAte ? ` até ${dataCurta(conta.valeAte)}` : ' até o fim do período pago'} e seus dados continuam
              salvos.
            </p>
          </div>
          <button type="button" className="btn btn-outline perigo" onClick={aoCancelar}>
            <X aria-hidden /> Cancelar assinatura
          </button>
        </section>
      )}
    </>
  );
}
