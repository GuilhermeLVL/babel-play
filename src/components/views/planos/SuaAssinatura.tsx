import {
  CalendarRange,
  ChevronRight,
  CirclePause,
  CreditCard,
  FileText,
  LoaderCircle,
  type LucideIcon,
  RotateCcw,
  TriangleAlert,
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
import { PLANO_ICO, PLANO_NOME } from './dados';
import FaixaDaConta from './FaixaDaConta';
import { useAnualAVenda } from './funil';

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

/** O tom da etiqueta de cada estado no headset (`.q-tag` em `questConta.css`). */
const TOM_DO_QUEST: Record<Fatura['status'], string> = {
  paga: 'qc-bom',
  falhou: 'qc-atencao',
  pendente: 'off',
  estornada: 'off',
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
  /* `ANUAL_ENABLED=0`: o anual não está à venda, então o mensal não tem para onde "passar". Quem JÁ
     tem o anual não muda: o "Passar para o mensal" dele continua. */
  const anualAVenda = useAnualAVenda();
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
          e === 'ativa' && anualAVenda,
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

  /* QUEST: o resumo, as ações como linhas-alvo, as faturas uma por linha (a tabela de seis colunas não
     cabe na janela estreita) e a zona de cancelar separada no fim. Os mesmos diálogos e a mesma rota. */
  const IconeDoPlano = PLANO_ICO[plano];
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
      <div className="q-grade g2">
        <section className="q-cartao" aria-label={t('Resumo da assinatura')}>
          <div className="qc-plano-topo">
            <span className="q-ic">
              <IconeDoPlano aria-hidden />
            </span>
            <div>
              <span className="q-rotulo">{t('Plano')}</span>
              <h2>{`${p} · ${rotuloDaForma(forma)}`}</h2>
            </div>
          </div>
          <dl className="qc-dados">
            <div>
              <dt>{t('Valor')}</dt>
              <dd>{valor}</dd>
            </div>
            <div>
              <dt>
                {e === 'ativa' && conta.proximaCobranca
                  ? forma === 'anual'
                    ? t('Renova em')
                    : t('Próxima cobrança')
                  : t('Acesso até')}
              </dt>
              <dd>{dataCurta(e === 'ativa' && conta.proximaCobranca ? conta.proximaCobranca : conta.valeAte)}</dd>
            </div>
            <div>
              <dt>{t('Pagamento')}</dt>
              <dd>{forma === 'anual_12x' ? t('Cartão, sem renovação automática') : metodoAtual(faturas)}</dd>
            </div>
            <div>
              <dt>{t('Assinante desde')}</dt>
              <dd>{dataCurta(desde)}</dd>
            </div>
          </dl>
        </section>
        <section className="q-lista" aria-label={t('O que dá para mudar')} style={{ alignContent: 'start' }}>
          {acoes
            .filter((a) => a[4])
            .map(([I, titulo, d, k]) => (
              <button key={titulo} type="button" className="q-linha" onClick={() => abrir(k)}>
                <span className="q-ic">
                  <I aria-hidden />
                </span>
                <span>
                  <b>{titulo}</b>
                  <small>{d}</small>
                </span>
                <span className="q-fim">
                  <ChevronRight aria-hidden style={{ width: 22, height: 22 }} />
                </span>
              </button>
            ))}
        </section>
      </div>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Faturas')}</h2>
            <p>{t('Recibo de cada cobrança. O processador de pagamento avisa também por e-mail.')}</p>
          </div>
        </header>
        {faturas === null || faturas.length === 0 ? (
          carregandoFaturas ? (
            <div className="qc-espera" role="status">
              <LoaderCircle aria-hidden /> {t('Carregando as faturas…')}
            </div>
          ) : faturas === null ? (
            <p className="qc-erro" role="status">
              <TriangleAlert aria-hidden />
              <span>{t('Não consegui buscar as faturas agora. Isto não significa que não haja cobranças.')}</span>
            </p>
          ) : (
            <div className="q-cartao fundo">
              <p className="q-texto">{t('Nenhuma cobrança ainda.')}</p>
            </div>
          )
        ) : (
          <ul className="qc-pilha qc-faturas" aria-label={t('Faturas')}>
            {faturas.map((f) => (
              <li key={f.id} className="q-ajuste">
                <div>
                  <b>{f.descricao}</b>
                  <small>
                    {dataCurta(f.data)} · {f.metodo ? ROTULO_DO_METODO[f.metodo] : '—'}
                  </small>
                </div>
                <b className="qc-valor">{brl(f.valor)}</b>
                <span className={`q-tag ${TOM_DO_QUEST[f.status]}`}>{STATUS[f.status][1]}</span>
                {f.status === 'falhou' && f.link ? (
                  <button type="button" className="q-ctl pri" onClick={() => aoTentarDeNovo(f)}>
                    <RotateCcw aria-hidden /> {t('Tentar de novo')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="q-ctl"
                    aria-label={t('Recibo de {data}', { data: dataCurta(f.data) })}
                    onClick={() => abrir({ fatura: f })}
                  >
                    <FileText aria-hidden /> {t('Recibo')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {e !== 'cancelada' && (
        <section className="q-ajuste qc-perigo">
          <div>
            <b>{t('Cancelar assinatura')}</b>
            <small>
              {conta.valeAte
                ? t('Você mantém o {plano} até {data} e seus dados continuam salvos.', {
                    plano: p,
                    data: dataCurta(conta.valeAte),
                  })
                : t('Você mantém o {plano} até o fim do período pago e seus dados continuam salvos.', { plano: p })}
              {forma === 'anual_12x' ? ` ${t('Depois dos 7 dias, as parcelas que faltam seguem no cartão.')}` : ''}
            </small>
          </div>
          <button type="button" className="q-ctl perigo" onClick={aoCancelar}>
            <X aria-hidden /> {t('Cancelar assinatura')}
          </button>
        </section>
      )}
    </>
  );
}
