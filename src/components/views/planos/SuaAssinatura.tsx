import {
  CalendarRange,
  ChevronRight,
  CirclePause,
  CreditCard,
  FileText,
  type LucideIcon,
  Receipt,
  RotateCcw,
  X,
} from 'lucide-react';

import {
  brl,
  type Conta,
  dataCurta,
  economiaDoAnual,
  type Fatura,
  formaDaConta,
  parcelasDoAnual,
  precoAnual,
  precoMensal,
  ROTULO_DO_METODO,
  rotuloDaForma,
} from '../../../lib/assinatura';
import { t } from '../../../lib/i18n';
import { IconeEmBloco, TituloDeSecao } from '../../ui';
import { PLANO_ICO, PLANO_NOME } from './dados';
import FaixaDaConta from './FaixaDaConta';

/**
 * SUA ASSINATURA — a aba de Planos para quem assina (`abaSuaAssinatura()` do protótipo).
 *
 * Resumo, ações, faturas e a zona de cancelar, na marcação do protótipo. Os dados são do
 * servidor: status e fim do período de `/api/billing/status`, faturas de `/api/billing/faturas`.
 * "Mudar de plano" saiu com a matriz v2 — há um plano pago só.
 *
 * O CICLO E O MEIO (C7): o resumo diz mensal, anual ou anual em 12x, com o valor de cada um.
 * "Passar para o anual" (e "para o mensal") é a ação do protótipo com o caminho HONESTO de hoje —
 * cancelar a renovação e assinar o outro ciclo no fim do período (`DialogoCiclo`): uma segunda
 * assinatura cobraria junto com a primeira, e o servidor recusa (409 `ja_assinante`). O 12x não tem
 * troca (não renova: no fim do ano escolhe-se de novo) e nem pausa (as parcelas são do cartão).
 */

export type DialogoDaAssinatura = 'pagamento' | 'pausar' | 'ciclo' | { fatura: Fatura };

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
  const plano = conta.plano ?? 'premium';
  const p = PLANO_NOME[plano];
  const forma = formaDaConta(conta);
  const parcelas = parcelasDoAnual(plano);
  const pagas = (faturas ?? []).filter((f) => f.status === 'paga');
  const desde = pagas.length ? pagas[pagas.length - 1].data : null;

  const valor =
    forma === 'anual'
      ? t('{valor} por ano', { valor: brl(precoAnual(plano)) })
      : forma === 'anual_12x'
        ? t('{m} × {parcela} + {ultima} no cartão (total {total})', {
            m: parcelas.quantidade - 1,
            parcela: brl(parcelas.padrao),
            ultima: brl(parcelas.ultima),
            total: brl(precoAnual(plano)),
          })
        : forma === 'concedido'
          ? t('Sem cobrança')
          : t('{valor} por mês', { valor: brl(precoMensal(plano)) });

  /* A TROCA DE CICLO só existe para a assinatura ATIVA que renova (mensal ou anual à vista). */
  const trocaDeCiclo: [LucideIcon, string, string, DialogoDaAssinatura, boolean] =
    forma === 'mensal'
      ? [
          CalendarRange,
          t('Passar para o anual'),
          t('Economize {valor} por ano.', { valor: brl(economiaDoAnual(plano).reais) }),
          'ciclo',
          e === 'ativa',
        ]
      : [
          CalendarRange,
          t('Passar para o mensal'),
          t('Pague mês a mês depois do fim do ano pago.'),
          'ciclo',
          e === 'ativa' && forma === 'anual',
        ];
  const acoes: [LucideIcon, string, string, DialogoDaAssinatura, boolean][] = [
    trocaDeCiclo,
    [
      CreditCard,
      t('Forma de pagamento'),
      forma === 'anual_12x'
        ? t('Cartão · {n} parcelas', { n: parcelas.quantidade })
        : t('{metodo} · você escolhe a cada cobrança', { metodo: metodoAtual(faturas) }),
      'pagamento',
      forma !== 'concedido',
    ],
    [
      CirclePause,
      t('Pausar a assinatura'),
      t('De 1 a 3 meses, pelo suporte.'),
      'pausar',
      e !== 'cancelada' && forma !== 'anual_12x' && forma !== 'concedido',
    ],
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
              <span className="label-mono">{t('Plano')}</span>
              <h2 style={{ fontSize: 20, fontWeight: 900 }}>{`${p} · ${rotuloDaForma(forma)}`}</h2>
            </div>
          </div>
          <dl className="dados">
            <div>
              <dt>{t('Valor')}</dt>
              <dd className="tn">{valor}</dd>
            </div>
            {/* "Próxima cobrança" só com a data do Asaas; sem ela, o que se sabe é até quando o acesso
                vale (`valeAte`, que inclui a graça de atraso) — e a tela diz isso, não "cobrança". O
                anual chama a data de "Renova em"; o 12x não tem próxima cobrança do plano. */}
            <div>
              <dt>
                {e === 'ativa' && conta.proximaCobranca
                  ? forma === 'anual'
                    ? t('Renova em')
                    : t('Próxima cobrança')
                  : t('Acesso até')}
              </dt>
              <dd className="tn">
                {dataCurta(e === 'ativa' && conta.proximaCobranca ? conta.proximaCobranca : conta.valeAte)}
              </dd>
            </div>
            <div>
              <dt>{t('Pagamento')}</dt>
              <dd>{forma === 'anual_12x' ? t('Cartão, sem renovação automática') : metodoAtual(faturas)}</dd>
            </div>
            <div>
              <dt>{t('Assinante desde')}</dt>
              <dd className="tn">{dataCurta(desde)}</dd>
            </div>
          </dl>
        </section>
        <section className="acoes-assin">
          {acoes
            .filter((a) => a[4])
            .map(([I, titulo, d, k]) => (
              <button key={titulo} type="button" className="cartao clicavel acao-assin" onClick={() => abrir(k)}>
                <IconeEmBloco icone={I} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{titulo}</b>
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
            <b>{t('Cancelar assinatura')}</b>
            <p className="mut">
              {conta.valeAte
                ? t('Você mantém o {plano} até {data} e seus dados continuam salvos.', {
                    plano: p,
                    data: dataCurta(conta.valeAte),
                  })
                : t('Você mantém o {plano} até o fim do período pago e seus dados continuam salvos.', { plano: p })}
              {forma === 'anual_12x' ? ` ${t('Depois dos 7 dias, as parcelas que faltam seguem no cartão.')}` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-outline perigo" onClick={aoCancelar}>
            <X aria-hidden /> {t('Cancelar assinatura')}
          </button>
        </section>
      )}
    </>
  );
}
