import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  CreditCard,
  Gauge,
  HardDrive,
  Infinity as Infinito,
  Languages,
  ListChecks,
  type LucideIcon,
  Receipt,
  ShieldCheck,
  Star,
  Table2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { armazenamentoEmTexto, horasDeTranscricao, precoDoPlano } from '../../core/planos';
import {
  carregarFaturas,
  carregarStatusDeBilling,
  estadoDaConta,
  type Fatura,
  faturaEmAberto,
  type PlanoPago,
  type StatusDeBilling,
  temAssinatura,
} from '../../lib/assinatura';
import { getEntitlements, onPlanChange, PLAN_LABELS } from '../../lib/entitlements';
import { numero, t } from '../../lib/i18n';
import {
  esquecerPlanosTelaDoBoot,
  EVENTO_SUBTELA_DE_PLANOS,
  lerPlanosTelaDoBoot,
  lerUrlAtual,
  publicarUrl,
  type SubTelaDePlanos,
} from '../../lib/rotas';
import { carregarUso, duracaoLegivel, fracao, type UsoDoMes } from '../../lib/uso';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, PainelDeAba, Tela, TituloDeSecao } from '../ui';
import Assinado from './planos/Assinado';
import Cancelar from './planos/Cancelar';
import Checkout from './planos/Checkout';
import { irAjuda, irSub, type Plano, PLANO_NOME, PLANOS } from './planos/dados';
import { DialogoFatura, DialogoMudarPlano, DialogoPagamento, DialogoPausar } from './planos/DialogosDaAssinatura';
import FaixaDaConta from './planos/FaixaDaConta';
import SuaAssinatura, { type DialogoDaAssinatura, metodoAtual } from './planos/SuaAssinatura';

/**
 * PLANOS E ASSINATURA — o que cada plano dá, quanto do seu já foi usado, e a assinatura inteira:
 * checkout, confirmação, faturas e cancelamento.
 *
 * A FORMA É A DO PROTÓTIPO APROVADO (`T.planos`, `abaSuaAssinatura`, `T.checkout`, `T.assinado`,
 * `T.cancelar` e os diálogos da assinatura em `docs/prototipos/consistencia-telas.html`). As
 * sub-telas têm endereço (`/plano/assinar`, `/plano/assinado`, `/plano/cancelar`,
 * `/plano/assinatura` — ver `lib/rotas`) sem virar views do App: o menu continua em Planos.
 *
 * OS NÚMEROS SÃO DO APP. Preço de `PLAN_MATRIX`, armazenamento da quota, qualidade de
 * `docs/auditoria/eval-producao-v1.md`; o estado da conta de `/api/billing/status` e as faturas
 * de `/api/billing/faturas`. O dinheiro não passa por aqui: o checkout abre a página de pagamento
 * do Asaas, e quem concede o plano é o webhook do servidor.
 *
 * O QUE DO PROTÓTIPO FICOU DE FORA, E POR QUÊ: o seletor Mensal/Anual (o servidor só cobra por
 * mês — não se cria plano novo numa tela), cupom e parcelas (não existem no servidor), e as
 * operações que o servidor não tem — trocar de plano, trocar o cartão, pausar e estornar — que
 * aparecem com a forma do protótipo e o caminho honesto: o suporte.
 */

type Celula = 'ok' | 'nao' | number | string;

/** Uma linha do comparativo: rótulo, um valor por plano, nota e se "menor é melhor". */
type Linha = [rotulo: string, valores: [Celula, Celula, Celula], nota?: string, invertido?: boolean];

const COMPARA: [grupo: string, linhas: Linha[]][] = [
  [
    'Captura e estudo',
    [
      ['Captura ao vivo (mic + sistema)', ['ok', 'ok', 'ok']],
      ['Jogos, vocabulário e revisão', ['ok', 'ok', 'ok']],
      ['Tutor de IA (iChat)', ['nao', 'ok', 'ok']],
      /* Derivado da quota: mudar `sttSegundosMes` e esquecer esta linha prometeria outro teto. */
      [
        'Transcrição de nuvem por mês',
        ['nao', `${horasDeTranscricao('essencial')} h`, `${horasDeTranscricao('pro')} h`],
      ],
      ['Sua própria chave de IA (BYOK)', ['ok', 'ok', 'ok']],
    ],
  ],
  [
    'Qualidade da IA · medida, não estimada',
    [
      ['Qualidade de tradução (geral)', [57, 85, 85], 'maior é melhor'],
      ['Expressões idiomáticas', [27, 83, 83], 'maior é melhor'],
      ['Erro de transcrição em PT falado', [57, 24, 24], 'menor é melhor', true],
    ],
  ],
  [
    'Espaço',
    [
      /* Derivado da quota, não escrito à mão: mudar `armazenamentoMb` na matriz e esquecer esta
         linha faria a tabela prometer um teto que o servidor não aplica. */
      [
        'Armazenamento de sessões',
        [armazenamentoEmTexto('free'), armazenamentoEmTexto('essencial'), armazenamentoEmTexto('pro')],
      ],
    ],
  ],
];

const precoDoCartao = (p: Plano) => (p.id === 'gratis' ? '0' : (precoDoPlano(p.chave) ?? '—'));

/** Barra de qualidade da tabela (`medidor` do protótipo). */
function Medidor({ v, invertido }: { v: number; invertido?: boolean }) {
  const bom = invertido ? v <= 30 : v >= 80;
  return (
    <span className={`medidor ${bom ? 'bom' : ''}`} role="img" aria-label={`${v}%`}>
      <span className="medidor-trilho">
        <span style={{ width: `${v}%` }} />
      </span>
      <b className="tn">{v}%</b>
    </span>
  );
}

function CelulaDaTabela({ x, invertido }: { x: Celula; invertido?: boolean }) {
  if (typeof x === 'number') return <Medidor v={x} invertido={invertido} />;
  if (x === 'ok')
    return (
      <span className="sim">
        <Check aria-hidden />
        <span className="sr">Incluído</span>
      </span>
    );
  if (x === 'nao')
    return (
      <>
        <span className="nao" aria-hidden>
          —
        </span>
        <span className="sr">Não incluído</span>
      </>
    );
  return <b className="tn">{x}</b>;
}

/**
 * As perguntas do protótipo, com as respostas que o app cumpre. Onde o protótipo promete o que o
 * servidor ainda não faz (anual, troca de plano na hora, estorno automático), a resposta diz como
 * é hoje.
 */
const FAQ: [string, string][] = [
  [
    'Qual a diferença entre mensal e anual?',
    'Por enquanto só existe o mensal: você paga todo mês e pode cancelar a qualquer momento. O plano anual ainda não está à venda.',
  ],
  [
    'Posso trocar de plano depois?',
    'Sim. Por enquanto a troca é feita pelo suporte, que ajusta a sua assinatura para o outro plano sem você perder o que já pagou.',
  ],
  [
    'Posso cancelar quando quiser?',
    'Sim, em Planos → Sua assinatura, em poucos cliques. Você mantém o acesso até o fim do período pago e seus dados continuam salvos.',
  ],
  [
    'E se eu me arrepender?',
    'Nos primeiros 7 dias depois de assinar, você tem direito ao valor de volta, inteiro, no mesmo meio de pagamento (CDC, art. 49). Cancele em Planos → Sua assinatura e peça o reembolso ao suporte.',
  ],
  [
    'Como cada número foi medido?',
    'Transcrição: taxa de erro de palavras (WER) no corpus CORAA de fala espontânea brasileira. Tradução: chrF++ num conjunto anotado por fenômeno. Os números são medidos, não estimados.',
  ],
  ['O que é o self-host?', 'É o Babel Play rodando no seu próprio computador. Ali tudo fica liberado e não há cota.'],
];

const CHAVE_DO_CHECKOUT = 'babel.checkout.plano';
function planoGuardado(): PlanoPago {
  try {
    return sessionStorage.getItem(CHAVE_DO_CHECKOUT) === 'essencial' ? 'essencial' : 'pro';
  } catch {
    return 'pro';
  }
}

export default function Planos() {
  const [entitlements, setEntitlements] = useState(() => getEntitlements());
  const [status, setStatus] = useState<StatusDeBilling | null>(null);
  const [faturas, setFaturas] = useState<Fatura[] | null>(null);
  const [carregandoFaturas, setCarregandoFaturas] = useState(false);
  const [uso, setUso] = useState<UsoDoMes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sub, setSub] = useState<SubTelaDePlanos | null>(() => lerUrlAtual().planosTela ?? lerPlanosTelaDoBoot());
  const [abaLocal, setAbaLocal] = useState<'planos' | 'consumo'>('planos');
  const [planoDoCheckout, setPlanoDoCheckout] = useState<PlanoPago>(planoGuardado);
  const [dialogo, setDialogo] = useState<DialogoDaAssinatura | null>(null);

  useEffect(() => onPlanChange(() => setEntitlements(getEntitlements())), []);

  /* A sub-tela segue a URL: o "voltar" do navegador e os botões das sub-telas passam por ela. Se
     ela veio do boot (o App já tinha reescrito a barra para /plano), devolve-a à barra. */
  useEffect(() => {
    esquecerPlanosTelaDoBoot();
    if (sub && lerUrlAtual().planosTela !== sub) publicarUrl({ view: 'planos', planosTela: sub }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const aoMudar = () => setSub(lerUrlAtual().planosTela ?? null);
    window.addEventListener('popstate', aoMudar);
    window.addEventListener(EVENTO_SUBTELA_DE_PLANOS, aoMudar);
    return () => {
      window.removeEventListener('popstate', aoMudar);
      window.removeEventListener(EVENTO_SUBTELA_DE_PLANOS, aoMudar);
    };
  }, []);

  const recarregarStatus = useCallback(() => {
    void carregarStatusDeBilling().then(setStatus);
  }, []);
  useEffect(recarregarStatus, [recarregarStatus]);

  useEffect(() => {
    let vivo = true;
    void carregarUso().then((u) => {
      if (!vivo) return;
      setUso(u);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const meuPlano = entitlements.plan;
  const conta = estadoDaConta(meuPlano, status);
  const assina = temAssinatura(conta.estado);

  /* Faturas só para quem assina — e só depois de saber que assina. */
  useEffect(() => {
    if (!assina) return;
    let vivo = true;
    setCarregandoFaturas(true);
    void carregarFaturas().then((f) => {
      if (!vivo) return;
      setFaturas(f);
      setCarregandoFaturas(false);
    });
    return () => {
      vivo = false;
    };
  }, [assina]);

  const escolherPlano = (p: PlanoPago) => {
    setPlanoDoCheckout(p);
    try {
      sessionStorage.setItem(CHAVE_DO_CHECKOUT, p);
    } catch {
      /* sem armazenamento, o checkout só não lembra a escolha ao recarregar */
    }
  };

  const reativar = () => {
    toast.info(
      `Para reativar o ${conta.plano ? PLANO_NOME[conta.plano] : 'plano'} sem pagar duas vezes, fale com o suporte.`,
    );
    irAjuda();
  };

  const aberta = faturaEmAberto(faturas);
  const dialogos = dialogo && (
    <>
      {dialogo === 'mudar-plano' && <DialogoMudarPlano conta={conta} aoFechar={() => setDialogo(null)} />}
      {dialogo === 'pagamento' && (
        <DialogoPagamento
          conta={conta}
          aberta={aberta}
          metodoAtual={metodoAtual(faturas)}
          aoFechar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'pausar' && <DialogoPausar conta={conta} aoFechar={() => setDialogo(null)} />}
      {typeof dialogo === 'object' && <DialogoFatura fatura={dialogo.fatura} aoFechar={() => setDialogo(null)} />}
    </>
  );

  /* ── Sub-telas ── */
  if (sub === 'assinar')
    return (
      <Checkout plano={planoDoCheckout} aoTrocarPlano={escolherPlano} plan={meuPlano} conta={conta} status={status} />
    );
  if (sub === 'assinado') return <Assinado />;
  if (sub === 'cancelar')
    return <Cancelar conta={conta} faturas={faturas} aoCancelado={recarregarStatus} aoReativar={reativar} />;

  /* A aba "Sua assinatura" só existe para quem assina (como no protótipo). */
  const aba = sub === 'assinatura' && assina ? 'assinatura' : abaLocal;
  const trocarAba = (id: string) => {
    if (id === 'assinatura') {
      irSub('assinatura');
      return;
    }
    setAbaLocal(id as 'planos' | 'consumo');
    if (sub === 'assinatura') irSub(null);
  };

  /* ── O botão de cada cartão (`ctaDe` do protótipo) ── */
  const cta = (p: Plano): { rot: string; solido: boolean; off?: boolean; acao: () => void } => {
    if (!assina) {
      if (p.id === 'gratis')
        return { rot: 'Continuar grátis', solido: false, acao: () => toast.ok('Você continua no Grátis. Nada muda.') };
      return {
        rot: `Assinar ${p.nome}`,
        solido: !!p.destaque,
        acao: () => {
          escolherPlano(p.id as PlanoPago);
          irSub('assinar');
        },
      };
    }
    if (p.id === conta.plano) return { rot: 'Seu plano', solido: false, off: true, acao: () => {} };
    if (p.id === 'gratis') return { rot: 'Voltar ao Grátis', solido: false, acao: () => irSub('cancelar') };
    const sobe = p.id === 'pro' && conta.plano === 'essencial';
    return {
      rot: `${sobe ? 'Subir' : 'Mudar'} para ${p.nome}`,
      solido: !!p.destaque,
      acao: () => setDialogo('mudar-plano'),
    };
  };

  const cartao = (p: Plano) => {
    const atual = assina && p.id === conta.plano;
    const Icone = p.icone;
    const c = cta(p);
    return (
      <article key={p.id} className={`cartao plano2 ${p.destaque ? 'escuro destaque' : ''} ${atual ? 'atual' : ''}`}>
        {p.destaque && (
          <span className="badge acc fita2">
            <Star aria-hidden /> Recomendado
          </span>
        )}
        {atual && (
          <span className="badge ok fita2 dir">
            <Check aria-hidden /> Seu plano
          </span>
        )}
        <div className="linha" style={{ gap: 12 }}>
          <IconeEmBloco icone={Icone} />
          <div>
            <h2>{p.nome}</h2>
            <p className="mut">{p.tag}</p>
          </div>
        </div>
        <div className="preco2">
          <span className="moeda">R$</span>
          <span className="valor tn">{precoDoCartao(p)}</span>
          <span className="per mut">{p.id === 'gratis' ? 'para sempre' : 'por mês'}</span>
        </div>
        <p className="cobranca mut">
          {p.id === 'gratis' ? 'Sem cartão, sem conta.' : 'cobrado todo mês, cancele quando quiser'}
        </p>
        <p className="para mut">{p.para}</p>
        <button
          type="button"
          className={`btn ${c.solido ? 'btn-solid' : 'btn-outline'} bloco`}
          disabled={c.off}
          onClick={c.acao}
        >
          {c.rot}
          {c.solido && <ArrowRight aria-hidden />}
        </button>
        <div className="inclui">
          <span className="label-mono">{p.base ? `Tudo do ${p.base}, e:` : 'O que você tem'}</span>
          <ul>
            {p.itens.map(([I, texto]) => (
              <li key={texto}>
                <I aria-hidden />
                <span>{texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </article>
    );
  };

  /* ── Consumo do mês: os contadores reais do servidor (`GET /api/me/uso`) ── */
  const semTeto = !!uso && uso.chamadas.teto === null;
  const mb = (bytes: number) => `${numero(Math.round(bytes / 1_048_576))} MB`;
  const arm = entitlements.armazenamento;
  const consumo: [LucideIcon, string, string, number | null, string][] = uso
    ? [
        [
          Clock,
          'Áudio transcrito na nuvem',
          duracaoLegivel(uso.segundosDeAudio.usado),
          fracao(uso.segundosDeAudio),
          uso.segundosDeAudio.teto === null ? 'de áudio' : `de ${duracaoLegivel(uso.segundosDeAudio.teto)}`,
        ],
        [
          Languages,
          'Chamadas à IA de nuvem',
          numero(uso.chamadas.usado),
          fracao(uso.chamadas),
          uso.chamadas.teto === null ? 'chamadas' : `de ${numero(uso.chamadas.teto)}`,
        ],
        /* Os tokens viraram TETO na Fase 2 do lançamento (antes só eram contados): a linha mostra o
           limite como as outras, em vez de "registrados só para acompanhar custo". */
        [
          Languages,
          'Tokens de IA (tradução e tutor)',
          numero(uso.tokensDeLlm.usado),
          fracao(uso.tokensDeLlm),
          uso.tokensDeLlm.teto === null ? 'tokens' : `de ${numero(uso.tokensDeLlm.teto)}`,
        ],
        ...(arm
          ? [
              [
                HardDrive,
                'Armazenamento',
                mb(arm.usados),
                fracao({ usado: arm.usados, teto: arm.teto }),
                arm.teto === null ? 'usados' : `de ${mb(arm.teto)}`,
              ] as [LucideIcon, string, string, number | null, string],
            ]
          : []),
      ]
    : [];

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        sobrancelha="Assinatura"
        icone={CreditCard}
        titulo="Planos"
        sub="Escolha como a IA roda para você. Estudar e jogar é igual em todos."
        abas={
          <Abas
            itens={[
              { id: 'planos', rotulo: 'Planos', icone: <ListChecks aria-hidden /> },
              ...(assina ? [{ id: 'assinatura', rotulo: 'Sua assinatura', icone: <Receipt aria-hidden /> }] : []),
              { id: 'consumo', rotulo: 'Consumo do mês', icone: <Gauge aria-hidden /> },
            ]}
            ativo={aba}
            aoTrocar={trocarAba}
            rotuloDoGrupo="Seções de Planos"
          />
        }
      />

      <PainelDeAba id="planos" ativo={aba}>
        <FaixaDaConta
          conta={conta}
          rotuloGratis={meuPlano === 'anonimo' ? t(PLAN_LABELS[meuPlano]) : 'Grátis'}
          aoGerenciar={() => irSub('assinatura')}
          aoAtualizarPagamento={() => setDialogo('pagamento')}
          aoReativar={reativar}
        />
        {/* Sem o seletor Mensal/Anual do protótipo: o servidor só cobra por mês. */}
        <div className="planos-grade">{PLANOS.map(cartao)}</div>
        <p className="mut garantia">
          <ShieldCheck aria-hidden /> Pagamento seguro · 7 dias para desistir com reembolso · cancele quando quiser
        </p>

        <section className="secao">
          <TituloDeSecao
            icone={Table2}
            titulo="Comparar em detalhe"
            desc="Todos os números, lado a lado. Qualidade medida no corpus CORAA e com chrF++."
          />
          <section className="cartao compara secao" aria-label="Comparação completa" tabIndex={0}>
            <table className="tabela-planos">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr">Recurso</span>
                  </th>
                  {PLANOS.map((p) => {
                    const I = p.icone;
                    return (
                      <th key={p.id} scope="col" className={p.destaque ? 'col-destaque' : ''}>
                        <span className="linha" style={{ gap: 8, justifyContent: 'center' }}>
                          <I aria-hidden style={{ width: 15, height: 15 }} />
                          {p.nome}
                        </span>
                        <small className="mut tn">{p.id === 'gratis' ? 'R$ 0' : `R$ ${precoDoCartao(p)}/mês`}</small>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {COMPARA.map(([grupo, linhas]) => (
                <tbody key={grupo}>
                  <tr className="grupo">
                    <th colSpan={4} scope="colgroup">
                      {grupo}
                    </th>
                  </tr>
                  {linhas.map(([rotulo, valores, nota, invertido]) => (
                    <tr key={rotulo}>
                      <th scope="row">
                        {rotulo}
                        {nota && <small className="mut">{nota}</small>}
                      </th>
                      {valores.map((x, k) => (
                        <td key={k} className={PLANOS[k].destaque ? 'col-destaque' : ''}>
                          <CelulaDaTabela x={x} invertido={invertido} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </section>
        </section>

        <section className="secao">
          <TituloDeSecao icone={CircleHelp} titulo="Perguntas frequentes" />
          <div className="faq">
            {FAQ.map(([q, r], i) => (
              <details key={q} className="cartao" open={i === 0}>
                <summary>
                  {q}
                  <ChevronDown aria-hidden />
                </summary>
                <p className="mut">{r}</p>
              </details>
            ))}
          </div>
        </section>
      </PainelDeAba>

      <PainelDeAba id="assinatura" ativo={aba}>
        <SuaAssinatura
          conta={conta}
          faturas={faturas}
          carregandoFaturas={carregandoFaturas}
          abrir={setDialogo}
          aoCancelar={() => irSub('cancelar')}
          aoTentarDeNovo={(f) => window.open(f.link!, '_blank', 'noopener')}
          aoReativar={reativar}
        />
      </PainelDeAba>

      <PainelDeAba id="consumo" ativo={aba}>
        {carregando ? (
          <div className="cartao">
            <div className="vazio">
              <IconeEmBloco icone={Gauge} />
              <h3>Carregando…</h3>
              <p>Buscando os contadores deste mês no servidor.</p>
            </div>
          </div>
        ) : !uso ? (
          <div className="cartao">
            <div className="vazio">
              <IconeEmBloco icone={Gauge} tom="warn" />
              <h3>Consumo indisponível</h3>
              <p>
                Não consegui falar com o servidor agora. Isto NÃO significa consumo zero — significa que não sei o
                número.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="ladrilhos">
              {consumo.map(([I, titulo, valor, f, unidade]) => (
                <div key={titulo} className="cartao p5 consumo">
                  <TituloDeSecao icone={I} titulo={<span style={{ fontWeight: 700 }}>{titulo}</span>} nivel="h3" />
                  <div className="linha" style={{ alignItems: 'baseline', gap: 6 }}>
                    <b className="tn" style={{ font: '900 28px var(--font-display)' }}>
                      {valor}
                    </b>
                    <span className="mut">
                      {unidade} · {f === null ? 'sem limite' : 'do limite do plano'}
                    </span>
                  </div>
                  {/* Sem teto NÃO vira barra vazia: uma barra a 0% pareceria "nada usado". */}
                  {f !== null && (
                    <div
                      className="barra"
                      style={{ marginTop: 12 }}
                      role="progressbar"
                      aria-valuenow={Math.round(f * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${titulo}: ${Math.round(f * 100)}% do limite`}
                    >
                      <span style={{ width: `${f * 100}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="cartao secao">
              <div className="vazio">
                <IconeEmBloco icone={semTeto ? Infinito : Gauge} />
                <h3>{semTeto ? 'No self-host não há cota' : `Janela ${uso.janela}`}</h3>
                <p>
                  {semTeto
                    ? 'Os números acima são só para você acompanhar; o custo da IA de nuvem é seu, pela sua própria chave. Os limites valem nos planos em nuvem.'
                    : 'Zera na virada do mês. Transcrição, tradução e tutor dividem o limite de chamadas: cada fala transcrita e traduzida usa duas. Tradução e tutor também dividem o limite de tokens. O provedor cobra no mínimo 10 segundos por trecho de áudio enviado.'}
                </p>
                {/* O portão GLOBAL (chave de emergência ou orçamento do mês): sem esta linha, a nuvem
                    fechada parecia defeito do plano do assinante. */}
                {uso.iaDeNuvem && !uso.iaDeNuvem.disponivel && uso.iaDeNuvem.mensagem && (
                  <p role="status" style={{ marginTop: 8 }}>
                    <b>{uso.iaDeNuvem.mensagem}</b>
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </PainelDeAba>
      {dialogos}
    </Tela>
  );
}
