import '../../styles/questConta.css';

import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  CreditCard,
  Gauge,
  HardDrive,
  Hourglass,
  Infinity as Infinito,
  Languages,
  ListChecks,
  LoaderCircle,
  Lock,
  type LucideIcon,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  Target,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { armazenamentoEmTexto, DIAS_DO_TESTE_PREMIUM, horasDeTranscricao, horasDoUsoJusto } from '../../core/planos';
import {
  brl,
  carregarFaturas,
  carregarStatusDeBilling,
  CHAVE_DO_PLANO_DO_CHECKOUT,
  dataCurta,
  economiaDoAnual,
  estadoDaConta,
  type Fatura,
  faturaEmAberto,
  formaDaConta,
  type FormaDeAssinar,
  formaGuardadaDoCheckout,
  iniciarTeste,
  lembrarFormaDoCheckout,
  type PlanoPago,
  planoPagoDe,
  precoAnual,
  precoMensal,
  type StatusDeBilling,
  temAssinatura,
} from '../../lib/assinatura';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { carregarEntitlements, getEntitlements, onPlanChange, PLAN_LABELS } from '../../lib/entitlements';
import { numero, t, tp } from '../../lib/i18n';
import { consumirDestaqueEmPlanos } from '../../lib/ofertas/destaque';
import { alternarPergunta, festejarTeste, planoDeProva, repintarPlanos } from '../../lib/polimento/planos';
import { estadoDaProtecao } from '../../lib/protecaoDoMenor';
import {
  esquecerPlanosTelaDoBoot,
  EVENTO_SUBTELA_DE_PLANOS,
  lerPlanosTelaDoBoot,
  lerUrlAtual,
  navegarPara,
  publicarUrl,
  type SubTelaDePlanos,
} from '../../lib/rotas';
import { carregarUso, duracaoLegivel, fracao, type UsoDoMes } from '../../lib/uso';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, PainelDeAba, Tela, TituloDeSecao } from '../ui';
import Assinado from './planos/Assinado';
import Cancelar from './planos/Cancelar';
import Checkout from './planos/Checkout';
import {
  horasDoAlivio,
  irAjuda,
  irSub,
  notaDoItem,
  notaDoUsoJusto,
  type Plano,
  PLANO_NOME,
  PLANOS,
  textoDoItem,
} from './planos/dados';
import { DialogoCiclo, DialogoFatura, DialogoPagamento, DialogoPausar } from './planos/DialogosDaAssinatura';
import FaixaDaConta from './planos/FaixaDaConta';
import { entrarParaAssinar, useAnualAVenda, useSemConta, useVendaAberta } from './planos/funil';
import SuaAssinatura, { type DialogoDaAssinatura, metodoAtual } from './planos/SuaAssinatura';

/**
 * PLANOS E ASSINATURA — o que cada plano dá, quanto do seu já foi usado, e a assinatura inteira:
 * checkout, confirmação, faturas e cancelamento.
 *
 * A FORMA É A DO PROTÓTIPO APROVADO (`T.planos`, `abaSuaAssinatura`, `T.checkout`, `T.assinado`,
 * `T.cancelar` e os diálogos da assinatura em `docs/prototipos/consistencia-telas.html`): a faixa da
 * conta, o seletor de período (`.periodo-bar`, `.seg.periodo`), os cartões `.plano2`, a tabela
 * `.tabela-planos` e as perguntas `.faq`. As sub-telas têm endereço (`/plano/assinar`,
 * `/plano/assinado`, `/plano/cancelar`, `/plano/assinatura` — ver `lib/rotas`) sem virar views do
 * App: o menu continua em Planos.
 *
 * A TELA NOVA (C7 da change `planos-v2`). O conteúdo foi reorganizado, não o desenho (o dono reprovou
 * um protótipo minimalista — `feedback-design-consistencia-nao-reinventar`):
 *   - o título do produto no alto da aba: "Legenda bilíngue de qualquer coisa que você ouve, em
 *     qualquer aparelho" (o `<h1>` da tela continua "Planos", como em toda tela do app);
 *   - o seletor Mensal/Anual volta, com "equivale a N meses grátis" calculado da matriz;
 *   - Grátis = "Tradução rápida ao vivo"; Premium = "Tradução Nuance", com o "sem limite no dia a dia"
 *     SEMPRE acompanhado da nota do uso justo (CDC: a limitação não se esconde);
 *   - o teste de 14 dias começa com um toque no próprio cartão, para quem o servidor deixa testar;
 *   - SAÍRAM o grupo de qualidade, o medidor e os textos do corpus e da métrica (vender "qualidade"
 *     pega mal): `tests/planos-tela-v2.test.tsx` reprova `%` e "qualidade" na tela.
 *
 * OS NÚMEROS SÃO DO APP. Preço de `PLAN_MATRIX`, horas e armazenamento das quotas; o estado da conta
 * de `/api/billing/status` e as faturas de `/api/billing/faturas`. O dinheiro não passa por aqui: o
 * checkout abre a página de pagamento do Asaas, e quem concede o plano é o webhook do servidor.
 *
 * A TROCA DE CICLO É O CAMINHO HONESTO, sem rota nova (C7): com a assinatura ativa, "Mudar para o
 * anual" explica que se cancela a renovação e se assina o anual no fim do período — uma segunda
 * assinatura cobraria junto com a primeira, e o servidor recusa (409 `ja_assinante`). Ver
 * `DialogoCiclo`.
 *
 * O QUE DO PROTÓTIPO FICOU DE FORA, E POR QUÊ: cupom (não existe no servidor), e as operações que o
 * servidor não tem — trocar o cartão e pausar — que aparecem com a forma do protótipo e o caminho
 * honesto: o suporte.
 */

type Periodo = 'mensal' | 'anual';
/** No desenho novo "Sua assinatura" é aba de todos (`telas2.js:102`); no antigo, só de quem assina. */
type AbaDePlanos = 'planos' | 'assinatura' | 'consumo';
type Celula = 'ok' | 'nao' | string;

/** Uma linha do comparativo: rótulo, um valor por plano (Grátis, Premium) e a nota ao lado. */
type Linha = [rotulo: string, valores: [Celula, Celula], nota?: string];

const TITULO_DA_TELA = 'Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho';

/** As variáveis do uso justo, das quotas do Premium (o dia e o mês). */
const usoJusto = () => ({ dia: horasDoUsoJusto('premium') ?? 0, mes: horasDeTranscricao('premium') ?? 0 });

/** O comparativo, montado na hora (os textos passam por `t()` no idioma da tela). */
function comparativo(): [grupo: string, linhas: Linha[]][] {
  return [
    [
      t('Legenda e tradução'),
      [
        [t('Legenda bilíngue ao vivo (microfone e som do computador)'), ['ok', 'ok']],
        [t('Tradução rápida ao vivo'), ['ok', 'ok']],
        [t('Tradução Nuance: outras formas, formal ou informal, variantes e glossário'), ['nao', 'ok']],
        /* Das quotas e da franquia de alívio: mudar a matriz e esquecer esta linha prometeria outro teto.
           A nota do uso justo fica NA MESMA LINHA do "sem limite" (CDC). */
        [
          t('Nuvem de transcrição e tradução'),
          [
            t('até {horas} h por mês, para aparelho fraco, quando disponível', { horas: horasDoAlivio() }),
            t('sem limite no dia a dia'),
          ],
          t(
            'No Premium, uso justo: até {dia} h de nuvem por dia e {mes} h por mês; passando disso, a legenda segue no aparelho',
            usoJusto(),
          ),
        ],
        [t('Tutor de IA (iChat)'), ['nao', 'ok']],
      ],
    ],
    [
      t('Estudo'),
      [
        [t('Jogos, vocabulário e revisão'), ['ok', 'ok']],
        [t('Sua própria chave de IA (BYOK)'), ['ok', 'ok']],
      ],
    ],
    [
      t('Espaço'),
      [
        /* Derivado da quota, não escrito à mão: mudar `armazenamentoMb` na matriz e esquecer esta
           linha faria a tabela prometer um teto que o servidor não aplica. */
        [t('Armazenamento de sessões'), [armazenamentoEmTexto('free'), armazenamentoEmTexto('premium')]],
      ],
    ],
  ];
}

function CelulaDaTabela({ x }: { x: Celula }) {
  if (x === 'ok')
    return (
      <span className="sim">
        <Check aria-hidden />
        <span className="sr">{t('Incluído')}</span>
      </span>
    );
  if (x === 'nao')
    return (
      <>
        <span className="nao" aria-hidden>
          —
        </span>
        <span className="sr">{t('Não incluído')}</span>
      </>
    );
  return <b className="tn">{x}</b>;
}

/**
 * As perguntas do protótipo, com as respostas que o app cumpre (os números da matriz). A troca de
 * ciclo responde o caminho de hoje; o cancelamento do anual e do 12x diz o padrão do dono, a validar
 * com o jurídico (C9).
 *
 * `anualAVenda === false` (`ANUAL_ENABLED=0`, o MVP só com o mensal): saem as duas perguntas do anual,
 * e as respostas de cancelar e de arrependimento ficam sem as frases do anual e do 12x — a tela não
 * promete o que o servidor não vende.
 */
function perguntas(anualAVenda: boolean): [string, string][] {
  const e = economiaDoAnual('premium');
  const dias = DIAS_DO_TESTE_PREMIUM;
  const todas: ([string, string] | false)[] = [
    anualAVenda && [
      t('Qual a diferença entre mensal e anual?'),
      t(
        'No mensal, você paga {mensal} todo mês e cancela quando quiser. No anual, paga {anual} por ano, à vista (Pix, boleto ou cartão, renovando sozinho em um ano) ou em 12x no cartão (sem renovação automática), e economiza {economia}: o equivalente a {meses} meses grátis.',
        {
          mensal: brl(precoMensal('premium')),
          anual: brl(precoAnual('premium')),
          economia: brl(e.reais),
          meses: e.meses,
        },
      ),
    ],
    [
      t('Como funciona o teste de {dias} dias?', { dias }),
      t(
        'Um toque e o Premium fica liberado por {dias} dias, sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado. É um teste por pessoa; para menores de 18, quem ativa é o responsável, pela conta dele.',
        { dias },
      ),
    ],
    [
      t('Tem limite no dia a dia?'),
      t(
        'Não no dia a dia: o Premium tem um uso justo de até {dia} h de nuvem por dia e {mes} h por mês. Passando disso, a legenda segue no aparelho até a nuvem voltar, sem cobrança a mais e sem oferta.',
        usoJusto(),
      ),
    ],
    [
      t('O que é a Tradução Nuance?'),
      t(
        'É a tradução do Premium que olha o jeito de dizer. Ao tocar numa frase, você vê outras formas de dizer e escolhe entre formal e informal; a tradução segue a variante que você escolher (português do Brasil ou de Portugal, espanhol da América Latina ou da Espanha) e o seu glossário. A legenda ao vivo usa a Tradução rápida, nos dois planos.',
      ),
    ],
    anualAVenda && [
      t('Posso passar do mensal para o anual?'),
      t(
        'Pode, sem pagar duas vezes. Em Planos → Sua assinatura, cancele a renovação do mensal: você continua com o Premium até o fim do mês pago e, nesse dia, assina o anual aqui. Nos primeiros 7 dias, cancelar devolve o valor inteiro e você já pode assinar o anual na hora.',
      ),
    ],
    [
      t('Posso cancelar quando quiser?'),
      anualAVenda
        ? t(
            'Sim, em Planos → Sua assinatura, em poucos cliques. A renovação para na hora e você mantém o acesso até o último dia do período já pago; seus dados continuam salvos. No anual e no 12x, depois dos 7 dias não há reembolso proporcional: o acesso vale até o fim do ano pago, e as parcelas do 12x seguem no cartão.',
          )
        : t(
            'Sim, em Planos → Sua assinatura, em poucos cliques. A renovação para na hora e você mantém o acesso até o último dia do período já pago; seus dados continuam salvos.',
          ),
    ],
    [
      t('E se eu me arrepender?'),
      anualAVenda
        ? t(
            'Nos primeiros 7 dias depois do primeiro pagamento, cancelar em Planos → Sua assinatura devolve o valor inteiro, no mesmo meio de pagamento (CDC, art. 49), sem precisar pedir a ninguém: no anual, o ano inteiro; no 12x, o parcelamento inteiro. A tela confirma o pedido na hora, com protocolo, e o acesso ao plano termina ali.',
          )
        : t(
            'Nos primeiros 7 dias depois do primeiro pagamento, cancelar em Planos → Sua assinatura devolve o valor inteiro, no mesmo meio de pagamento (CDC, art. 49), sem precisar pedir a ninguém. A tela confirma o pedido na hora, com protocolo, e o acesso ao plano termina ali.',
          ),
    ],
    [
      t('O que é o self-host?'),
      t('É o Babel Play rodando no seu próprio computador. Ali tudo fica liberado e não há cota.'),
    ],
  ];
  return todas.filter((x): x is [string, string] => !!x);
}

const CHAVE_DO_CHECKOUT = CHAVE_DO_PLANO_DO_CHECKOUT;
/** O plano do checkout desta aba; o nome antigo guardado antes do deploy é o Premium, e o padrão também. */
function planoGuardado(): PlanoPago {
  try {
    return planoPagoDe(sessionStorage.getItem(CHAVE_DO_CHECKOUT)) ?? 'premium';
  } catch {
    return 'premium';
  }
}

/** "19,90" / "179,00" — o número grande do cartão. */
const valorDoCartao = (v: number) => v.toFixed(2).replace('.', ',');

/** O botão (ou os botões) de um cartão, e a frase curta embaixo dele. */
interface AcaoDoCartao {
  rot: string;
  solido: boolean;
  off?: boolean;
  ocupado?: boolean;
  icone?: LucideIcon;
  acao: () => void;
  secundario?: { rot: string; acao: () => void };
  nota?: string;
}

export default function Planos({ onEntrar }: { onEntrar?: () => void } = {}) {
  const [entitlements, setEntitlements] = useState(() => getEntitlements());
  const [status, setStatus] = useState<StatusDeBilling | null>(null);
  const [faturas, setFaturas] = useState<Fatura[] | null>(null);
  const [carregandoFaturas, setCarregandoFaturas] = useState(false);
  const [uso, setUso] = useState<UsoDoMes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sub, setSub] = useState<SubTelaDePlanos | null>(() => lerUrlAtual().planosTela ?? lerPlanosTelaDoBoot());
  const [abaLocal, setAbaLocal] = useState<AbaDePlanos>('planos');
  const [planoDoCheckout, setPlanoDoCheckout] = useState<PlanoPago>(planoGuardado);
  const [formaDoCheckout, setFormaDoCheckout] = useState<FormaDeAssinar>(() => formaGuardadaDoCheckout() ?? 'mensal');
  /* O PERÍODO do seletor. Abre no que a aba escolheu por último; quem assina o anual o vê no anual
     (é o "Seu plano" dele), até tocar no seletor. */
  const [periodo, setPeriodo] = useState<Periodo>(() => (formaDoCheckout === 'mensal' ? 'mensal' : 'anual'));
  const periodoTocado = useRef(false);
  const [dialogo, setDialogo] = useState<DialogoDaAssinatura | null>(null);
  /* O TOQUE DO TESTE (C6/C7): sem cartão, sem formulário. */
  const [testeOcupado, setTesteOcupado] = useState(false);
  const [testeErro, setTesteErro] = useState('');
  const [testeFeito, setTesteFeito] = useState<number | null>(null);
  /* A OFERTA (Fase 8) não tem comparação própria: abre ESTA tela com o plano sugerido destacado,
     ou direto no consumo do mês (`lib/ofertas/destaque.ts`). O pedido é lido ao montar e quando o
     menu leva a Planos com a tela já aberta (o mesmo evento da sub-tela). */
  const [sugerido, setSugerido] = useState<'premium' | null>(null);
  const questNovo = useQuestNovo();
  useEffect(() => {
    const ler = () => {
      const p = consumirDestaqueEmPlanos();
      if (!p) return;
      if ('aba' in p) {
        setAbaLocal('consumo');
        return;
      }
      setAbaLocal('planos');
      /* O teste sugerido (C8) destaca o cartão do Premium: o toque do teste já é o botão dele. */
      setSugerido('premium');
    };
    ler();
    window.addEventListener(EVENTO_SUBTELA_DE_PLANOS, ler);
    return () => window.removeEventListener(EVENTO_SUBTELA_DE_PLANOS, ler);
  }, []);
  useEffect(() => {
    /* No desenho novo a oferta só abre a tela (`telas.js:513`): sem destaque e sem rolar até o cartão. */
    if (!sugerido || questNovo) return;
    document.querySelector(`[data-plano="${sugerido}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [sugerido, questNovo]);

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
  /* Relido quando o PLANO muda e a cada troca de sub-tela: o checkout é uma sub-tela DESTA tela, então o
     estado lido ao montar era o de antes de pagar, e "Sua assinatura" abria sem data ("Acesso até —"). */
  useEffect(recarregarStatus, [recarregarStatus, entitlements.plan, sub]);

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
    /* Relido quando o PLANO muda (assinou, começou o teste, cancelou) e a cada abertura da aba: lido só
       ao montar, o consumo continuava com os tetos do plano de antes ("não incluído" para quem acabou de
       virar Premium) até a pessoa recarregar a página. */
  }, [entitlements.plan, entitlements.teste?.terminaEm, abaLocal]);

  /* Na bancada (só em desenvolvimento) a tela pode ser vista como o Grátis a vê: `planoDeProva`. */
  const meuPlano = planoDeProva() ?? entitlements.plan;
  const conta = estadoDaConta(meuPlano, status, Date.now(), entitlements.teste);
  const assina = temAssinatura(conta.estado);
  const formaAtual = assina ? formaDaConta(conta) : null;
  const semConta = useSemConta(meuPlano);
  const vendaAberta = useVendaAberta();
  /* `ANUAL_ENABLED=0` no servidor: o MVP vende só o mensal e o teste. Some o seletor, o preço do ano e
     as frases do anual; quem JÁ assina o anual continua vendo o plano dele como é. */
  const anualAVenda = useAnualAVenda();
  const jaTemOAnual = formaAtual === 'anual' || formaAtual === 'anual_12x';

  /* Quem assina o anual abre no anual (o cartão dele diz "Seu plano"), até mexer no seletor. */
  useEffect(() => {
    if (periodoTocado.current || !formaAtual || formaAtual === 'concedido') return;
    setPeriodo(formaAtual === 'mensal' ? 'mensal' : 'anual');
  }, [formaAtual]);

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
  /* O período do seletor é a forma com que o checkout abre (lá se escolhe entre à vista e 12x). */
  const escolherForma = (f: FormaDeAssinar) => {
    setFormaDoCheckout(f);
    lembrarFormaDoCheckout(f);
  };
  const trocarPeriodo = (p: Periodo) => {
    periodoTocado.current = true;
    setPeriodo(p);
  };

  const reativar = () => {
    toast.info(
      t('Para reativar o {plano} sem pagar duas vezes, fale com o suporte.', {
        plano: conta.plano ? PLANO_NOME[conta.plano] : t('plano'),
      }),
    );
    irAjuda();
  };

  /* UM TOQUE, e o teste começa: nada de nome, CPF nem cartão (o servidor não fala com o Asaas). */
  const comecarTeste = async () => {
    setTesteOcupado(true);
    setTesteErro('');
    const r = await iniciarTeste();
    setTesteOcupado(false);
    if (r.terminaEm === null) {
      setTesteErro(r.erro ?? t('Não consegui começar o teste agora. Tente de novo.'));
      return;
    }
    setTesteFeito(r.terminaEm);
    if (questNovo) {
      /* `ativarTeste()` de `telas2.js:108-117`: a tela vai para "Sua assinatura", o aviso confirma e cai
         o confete. Os cadeados (Nuance, intérprete automático) abrem com os entitlements relidos abaixo. */
      dirDaAba.current = 1;
      setAbaLocal('assinatura');
      toast.ok(
        t('Premium ativado por {dias} dias. Sem cartão; no fim volta ao Grátis sozinho.', {
          dias: status?.teste?.dias ?? DIAS_DO_TESTE_PREMIUM,
        }),
      );
      festejarTeste();
    }
    await carregarEntitlements();
    recarregarStatus();
  };

  const aberta = faturaEmAberto(faturas);
  const dialogos = dialogo && (
    <>
      {dialogo === 'pagamento' && (
        <DialogoPagamento
          conta={conta}
          aberta={aberta}
          metodoAtual={metodoAtual(faturas)}
          aoFechar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'pausar' && <DialogoPausar conta={conta} aoFechar={() => setDialogo(null)} />}
      {dialogo === 'ciclo' && (anualAVenda || jaTemOAnual) && (
        <DialogoCiclo conta={conta} aoFechar={() => setDialogo(null)} />
      )}
      {typeof dialogo === 'object' && <DialogoFatura fatura={dialogo.fatura} aoFechar={() => setDialogo(null)} />}
    </>
  );

  /* A TROCA DE ABA do desenho novo (`repintar`, `telas2.js:10-25`): o miolo entra pelo lado. */
  const dirDaAba = useRef(1);
  const refDasAbas = useRef<HTMLDivElement>(null);
  const abaNaTela = sub === 'assinatura' && assina ? 'assinatura' : abaLocal;
  const abaAnterior = useRef(abaNaTela);
  useLayoutEffect(() => {
    if (abaAnterior.current === abaNaTela) return;
    abaAnterior.current = abaNaTela;
    repintarPlanos(refDasAbas.current, dirDaAba.current);
    dirDaAba.current = 1;
  }, [abaNaTela]);

  /* ── Sub-telas ── */
  if (sub === 'assinar')
    return (
      <Checkout
        plano={planoDoCheckout}
        aoTrocarPlano={escolherPlano}
        formaInicial={formaDoCheckout}
        plan={meuPlano}
        conta={conta}
        status={status}
        aoEntrar={onEntrar}
      />
    );
  if (sub === 'assinado') return <Assinado />;
  if (sub === 'cancelar')
    return <Cancelar conta={conta} faturas={faturas} aoCancelado={recarregarStatus} aoReativar={reativar} />;

  /* A aba "Sua assinatura" só existe para quem assina (como no protótipo). */
  const aba = abaNaTela;
  const trocarAba = (id: string) => {
    /* Quem assina tem endereço para a aba (`/plano/assinatura`); para os outros ela é só desta tela. */
    if (id === 'assinatura' && assina) {
      irSub('assinatura');
      return;
    }
    setAbaLocal(id as AbaDePlanos);
    if (sub === 'assinatura') irSub(null);
  };

  const teste = status?.teste;
  const emTeste = conta.estado === 'teste';
  /* PERFIL PROTEGIDO: quem assina e quem ativa o teste é o responsável. O servidor diz pelo teste
     (`perfil_protegido`); a idade já declarada de menor também basta. A tela não oferece o que o
     servidor recusaria. */
  const protecao = estadoDaProtecao();
  const menor =
    (teste?.estado === 'indisponivel' && teste.motivo === 'perfil_protegido') ||
    (!!protecao && protecao.nascimentoInformado && protecao.faixa !== 'adulto');
  /* O desenho novo não tem o seletor de período (`telas2.js:60-73`): o cartão é o mensal, e só quem JÁ
     assina o anual vê o ano (é o plano dele). */
  const anual = questNovo ? jaTemOAnual : periodo === 'anual' && (anualAVenda || jaTemOAnual);
  /* O servidor deixa esta pessoa começar o teste agora (as mesmas condições do botão, em `cta`). */
  const podeTestar =
    !assina && vendaAberta && !menor && !semConta && teste?.estado === 'disponivel' && testeFeito === null;
  const economia = economiaDoAnual('premium');

  const assinar = (p: Plano) => {
    escolherPlano(p.id as PlanoPago);
    escolherForma(anual ? 'anual' : 'mensal');
    irSub('assinar');
  };

  /* ── O botão de cada cartão (`ctaDe` do protótipo) ── */
  const cta = (p: Plano): AcaoDoCartao => {
    if (!assina) {
      if (p.id === 'gratis')
        return emTeste
          ? { rot: t('Volta sozinho no fim do teste'), solido: false, off: true, acao: () => {} }
          : {
              rot: t('Continuar grátis'),
              solido: false,
              acao: () => toast.ok(t('Você continua no Grátis. Nada muda.')),
            };
      /* Venda pausada (`CHECKOUT_ENABLED=0` ou a flag `vender_planos` desligada): o cartão continua
         mostrando o plano, sem um botão que levaria a um checkout fechado. O teste pausa junto. */
      if (!vendaAberta) return { rot: t('Vendas reabrem em breve'), solido: false, off: true, acao: () => {} };
      if (menor)
        return {
          rot: t('Quem assina é o seu responsável'),
          solido: false,
          off: true,
          acao: () => {},
          nota: t(
            'Quer testar? Peça ao seu responsável: pela conta dele, vinculada à sua, ele ativa o teste de {dias} dias para você.',
            { dias: teste?.dias ?? DIAS_DO_TESTE_PREMIUM },
          ),
        };
      /* Sem conta: direto ao login, com a intenção guardada — o checkout só diria "entre primeiro". */
      if (semConta)
        return {
          rot: t('Entrar e assinar o {plano}', { plano: p.nome }),
          solido: !!p.destaque,
          acao: () => {
            escolherPlano(p.id as PlanoPago);
            escolherForma(anual ? 'anual' : 'mensal');
            entrarParaAssinar(p.id as PlanoPago, onEntrar);
          },
        };
      /* O TESTE EM DESTAQUE para quem o servidor deixa testar; assinar direto continua ao lado. */
      if (teste?.estado === 'disponivel' && testeFeito === null)
        return {
          rot: t('Testar {dias} dias grátis', { dias: teste.dias }),
          solido: true,
          icone: Hourglass,
          ocupado: testeOcupado,
          acao: () => void comecarTeste(),
          secundario: { rot: t('Assinar {plano}', { plano: p.nome }), acao: () => assinar(p) },
          nota: t('Sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.'),
        };
      return { rot: t('Assinar {plano}', { plano: p.nome }), solido: !!p.destaque, acao: () => assinar(p) };
    }
    if (p.id === 'gratis') return { rot: t('Voltar ao Grátis'), solido: false, acao: () => irSub('cancelar') };
    /* Um plano pago só: o cartão pago de quem assina é o dele — no período dele. No outro período, a
       troca de ciclo (o caminho honesto, `DialogoCiclo`). */
    const noMeuPeriodo = formaAtual === 'concedido' || (formaAtual === 'mensal') === !anual;
    if (noMeuPeriodo || conta.estado !== 'ativa')
      return { rot: t('Seu plano'), solido: false, off: true, acao: () => {} };
    return {
      rot: anual ? t('Mudar para o anual') : t('Mudar para o mensal'),
      solido: false,
      acao: () => setDialogo('ciclo'),
    };
  };

  const preco = (p: Plano) => {
    if (p.id === 'gratis') return { valor: '0', per: t('para sempre'), cobranca: t('Sem cartão, sem conta.') };
    if (!anual)
      return {
        valor: valorDoCartao(precoMensal('premium')),
        per: t('por mês'),
        cobranca: t('cobrado todo mês, cancele quando quiser'),
      };
    return {
      valor: valorDoCartao(precoAnual('premium')),
      per: t('por ano'),
      cobranca: (
        <>
          <s>{brl(economia.dozeMeses)}</s> · {t('à vista ou em 12x no cartão')} ·{' '}
          <b className="economia">{t('economize {valor}', { valor: brl(economia.reais) })}</b>
        </>
      ),
    };
  };

  const cartao = (p: Plano) => {
    const atual = assina && p.id === conta.plano;
    const testando = emTeste && p.id === 'premium';
    const Icone = p.icone;
    const c = cta(p);
    const pr = preco(p);
    const IconeDaAcao = c.ocupado ? LoaderCircle : c.icone;
    return (
      <article
        key={p.id}
        data-plano={p.id}
        className={`cartao plano2 ${p.destaque ? 'escuro destaque' : ''} ${atual ? 'atual' : ''}`}
        /* O plano que a oferta sugeriu: o contorno de acento, sem mudar o desenho do cartão. */
        style={sugerido === p.id && !atual ? { outline: '2px solid var(--accent)', outlineOffset: 3 } : undefined}
      >
        {p.destaque && (
          <span className="badge acc fita2">
            <Star aria-hidden /> {t('Recomendado')}
          </span>
        )}
        {sugerido === p.id && !atual && !testando && (
          <span className="badge acc fita2 dir">
            <Target aria-hidden /> {t('Sugerido para você')}
          </span>
        )}
        {atual && (
          <span className="badge ok fita2 dir">
            <Check aria-hidden /> {t('Seu plano')}
          </span>
        )}
        {testando && (
          <span className="badge ok fita2 dir">
            <Hourglass aria-hidden /> {t('Em teste')}
          </span>
        )}
        <div className="linha" style={{ gap: 12 }}>
          <IconeEmBloco icone={Icone} />
          <div>
            <h2>{p.nome}</h2>
            <p className="mut">{t(p.tag)}</p>
          </div>
        </div>
        <div className="preco2">
          <span className="moeda">R$</span>
          <span className="valor tn">{pr.valor}</span>
          <span className="per mut">{pr.per}</span>
        </div>
        <p className="cobranca mut">{pr.cobranca}</p>
        <p className="para mut">{t(p.para)}</p>
        {testeFeito !== null && p.id === 'premium' ? (
          <p className="aviso-info" role="status">
            <Hourglass aria-hidden />
            <span>
              {t('Pronto: o Premium vale até {data}. No fim a conta volta ao Grátis sozinha, e nada é cobrado.', {
                data: dataCurta(testeFeito),
              })}
            </span>
          </p>
        ) : (
          <button
            type="button"
            className={`btn ${c.solido ? 'btn-solid' : 'btn-outline'} bloco`}
            disabled={c.off || c.ocupado}
            onClick={c.acao}
          >
            {IconeDaAcao && <IconeDaAcao className={c.ocupado ? 'gira' : undefined} aria-hidden />}
            {c.rot}
            {c.solido && !IconeDaAcao && <ArrowRight aria-hidden />}
          </button>
        )}
        {c.secundario && (
          <button type="button" className="btn btn-outline bloco" onClick={c.secundario.acao}>
            {c.secundario.rot}
          </button>
        )}
        {c.nota && (
          <p className="mut" style={{ fontSize: 12.5, marginTop: -6 }}>
            {menor && p.id === 'premium' && (
              <UserRound aria-hidden style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
            )}
            {c.nota}
          </p>
        )}
        {testeErro && p.id === 'premium' && (
          <p className="erro" role="alert" style={{ fontSize: 12.5, marginTop: -6 }}>
            {testeErro}
          </p>
        )}
        <div className="inclui">
          <span className="label-mono">
            {p.base ? t('Tudo do {plano}, e:', { plano: p.base }) : t('O que você tem')}
          </span>
          <ul>
            {p.itens.map((item) => {
              const I = item.icone;
              const nota = notaDoItem(item);
              return (
                <li key={item.texto}>
                  <I aria-hidden />
                  <span>
                    {textoDoItem(item)}
                    {/* A nota do uso justo AO LADO do "sem limite" — nunca num rodapé à parte (CDC). */}
                    {nota && (
                      <small className="mut" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>
                        {nota}
                      </small>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </article>
    );
  };

  /* ── Consumo do mês: os contadores reais do servidor (`GET /api/me/uso`) ── */
  const semTeto = !!uso && uso.chamadas.teto === null;
  const mb = (bytes: number) => `${numero(Math.round(bytes / 1_048_576))} MB`;
  const arm = entitlements.armazenamento;
  /* Cada linha: ícone, título, valor, fração do teto (`null` = sem teto), a unidade, e se é do DIA. As
     unidades passam por `t()` aqui, no ponto de uso (a lista é montada a cada render, no idioma da tela). */
  type LinhaDeConsumo = [LucideIcon, string, string, number | null, string, boolean];
  /* TETO ZERO não é "sem limite": é o que o plano não inclui (a nuvem no Grátis). Antes saía "0 de 0 · sem limite". */
  const foraDoPlano = t('não incluído no seu plano');
  const de = (valor: string, teto?: number | null) => (teto === 0 ? foraDoPlano : t('de {valor}', { valor }));
  const consumo: LinhaDeConsumo[] = uso
    ? [
        [
          Clock,
          'Áudio transcrito na nuvem',
          duracaoLegivel(uso.segundosDeAudio.usado),
          fracao(uso.segundosDeAudio),
          uso.segundosDeAudio.teto === null
            ? t('de áudio')
            : de(duracaoLegivel(uso.segundosDeAudio.teto), uso.segundosDeAudio.teto),
          false,
        ],
        [
          Languages,
          'Chamadas à IA de nuvem',
          numero(uso.chamadas.usado),
          fracao(uso.chamadas),
          uso.chamadas.teto === null ? t('chamadas') : de(numero(uso.chamadas.teto), uso.chamadas.teto),
          false,
        ],
        /* Os tokens viraram TETO na Fase 2 do lançamento (antes só eram contados): a linha mostra o
           limite como as outras, em vez de "registrados só para acompanhar custo". */
        [
          Languages,
          'Tokens de IA (tradução e tutor)',
          numero(uso.tokensDeLlm.usado),
          fracao(uso.tokensDeLlm),
          uso.tokensDeLlm.teto === null ? t('tokens') : de(numero(uso.tokensDeLlm.teto), uso.tokensDeLlm.teto),
          false,
        ],
        ...(arm
          ? [
              [
                HardDrive,
                'Armazenamento',
                mb(arm.usados),
                fracao({ usado: arm.usados, teto: arm.teto }),
                arm.teto === null ? t('usados') : de(mb(arm.teto)),
                false,
              ] as LinhaDeConsumo,
            ]
          : []),
        /* HOJE (o uso justo do dia, matriz v2): o servidor manda `hoje` só para plano com teto no dia
           (o Premium). Ao lado dos do mês, com o mesmo medidor; a nota do uso justo vem junto, abaixo. */
        ...(uso.hoje
          ? [
              [
                Clock,
                'Nuvem hoje',
                duracaoLegivel(uso.hoje.segundosDeAudio.usado),
                fracao(uso.hoje.segundosDeAudio),
                uso.hoje.segundosDeAudio.teto === null
                  ? t('de áudio')
                  : de(duracaoLegivel(uso.hoje.segundosDeAudio.teto)),
                true,
              ] as LinhaDeConsumo,
              [
                Languages,
                'IA hoje (tradução e tutor)',
                numero(uso.hoje.tokensDeLlm.usado),
                fracao(uso.hoje.tokensDeLlm),
                uso.hoje.tokensDeLlm.teto === null ? t('tokens') : de(numero(uso.hoje.tokensDeLlm.teto)),
                true,
              ] as LinhaDeConsumo,
            ]
          : []),
      ]
    : [];
  /* A nota do uso justo, com a primeira letra em maiúscula (nos planos ela é a legenda de um item). */
  const notaDoDia = uso?.hoje ? notaDoUsoJusto() : '';
  const notaDoDiaTexto = notaDoDia ? notaDoDia.charAt(0).toLocaleUpperCase() + notaDoDia.slice(1) : '';

  const selfhost = conta.estado === 'selfhost';

  /* ── O DESENHO NOVO: A TELA DE PLANOS DO PROTÓTIPO (`telas2.js:39-117`) ─────────────────────────
     A marcação é a de `htmlDosPlanos()`: cabeçalho com o selo do plano, três abas sempre à vista e o
     miolo solto no palco (sem painel em volta: é o que a camada anima). Os NÚMEROS são do app: preço e
     horas da matriz, o estado da conta e o consumo do servidor. O botão de cada cartão continua sendo
     o de `cta()`: venda pausada, perfil protegido, sem conta e assinante têm o rótulo de sempre. */
  if (questNovo) {
    const premium = PLANOS.find((p) => p.id === 'premium')!;
    const c = cta(premium);
    /* Quem acabou de tocar em "Testar" já está em teste, antes de o servidor responder de novo. */
    const testando = emTeste || testeFeito !== null;
    const fimDoTeste = testeFeito ?? conta.valeAte;
    const diasQueFaltam =
      fimDoTeste === null
        ? (teste?.dias ?? DIAS_DO_TESTE_PREMIUM)
        : Math.max(1, Math.ceil((fimDoTeste - Date.now()) / 86_400_000));
    const noGratis = conta.estado === 'gratis' && !testando;
    const nomeDoGratis = meuPlano === 'anonimo' ? t(PLAN_LABELS[meuPlano]) : t('Grátis');
    const seloDoPlano = testando
      ? t('Premium · em teste')
      : t('Seu plano: {plano}', {
          plano: selfhost ? 'Self-host' : assina && conta.plano ? PLANO_NOME[conta.plano] : nomeDoGratis,
        });
    const IconeDoPlano = noGratis ? UserRound : Sparkles;
    const justo = usoJusto();
    const item = (texto: string, nota?: string | null) => (
      <li key={texto}>
        <Check aria-hidden />
        <span>
          {texto}
          {/* A nota do uso justo AO LADO do "sem limite", no mesmo item (CDC). */}
          {nota && <small>{nota}</small>}
        </span>
      </li>
    );
    const sim = (
      <span className="px-sim">
        <Check aria-hidden />
        <span className="sr">{t('Incluído')}</span>
      </span>
    );
    const nao = (
      <span className="px-nao">
        —<span className="sr">{t('Não incluído')}</span>
      </span>
    );
    /* `TABELA` de `telas2.js:43-52`, com as horas e o espaço da matriz. */
    const tabela: [string, ReactNode, ReactNode][] = [
      [t('Legenda bilíngue ao vivo, no aparelho'), t('sem limite'), t('sem limite')],
      [t('Tradução rápida ao vivo'), sim, sim],
      [t('Tradução Nuance'), nao, sim],
      [
        t('Transcrição e tradução na nuvem'),
        t('até {horas} h por mês', { horas: horasDoAlivio() }),
        t('sem limite no dia a dia*'),
      ],
      [t('Tutor de IA (iChat)'), nao, sim],
      [t('Intérprete'), t('cada um toca o seu lado'), t('automático')],
      [t('Jogos, vocabulário e revisão'), sim, sim],
      [t('Armazenamento'), armazenamentoEmTexto('free'), armazenamentoEmTexto('premium')],
    ];
    /* `FAQ` de `telas2.js:53-58`, com os números da matriz. */
    const faq: [string, string][] = [
      [
        t('O teste cobra sozinho no fim?'),
        t('Não. São {dias} dias, sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.', {
          dias: teste?.dias ?? DIAS_DO_TESTE_PREMIUM,
        }),
      ],
      [t('Posso cancelar?'), t('Pode, quando quiser. E há 7 dias para desistir com reembolso.')],
      [
        t('O Grátis tem limite?'),
        t(
          'A legenda no aparelho não tem limite. A nuvem grátis é de até {horas} h por mês, para aparelho fraco, quando disponível.',
          { horas: horasDoAlivio() },
        ),
      ],
      [
        t('O que é "uso justo"?'),
        t('Até {dia} h de nuvem por dia e {mes} h por mês. Passando disso, a legenda segue no aparelho.', justo),
      ],
    ];
    const irAba = (id: AbaDePlanos, dir: number) => {
      dirDaAba.current = dir;
      trocarAba(id);
    };
    const ordemDasAbas = ['planos', 'assinatura', 'consumo'] as const;
    const aoTeclarNaAba = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
      const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!passo && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const n = ordemDasAbas.length;
      const destino = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (indice + passo + n) % n;
      irAba(ordemDasAbas[destino], 1);
      (e.currentTarget.parentElement?.querySelectorAll('.q-aba')[destino] as HTMLElement | undefined)?.focus();
    };
    const rotuloDaAba = { planos: t('Planos'), assinatura: t('Sua assinatura'), consumo: t('Consumo do mês') };

    /* Os botões do Premium: os de `cta()`, com a forma do protótipo (`telas2.js:71`). */
    const principalDoPremium = (
      <button type="button" className={`q-ctl${c.solido ? ' pri' : ''}`} disabled={c.off || c.ocupado} onClick={c.acao}>
        {c.ocupado && <LoaderCircle className="qc-gira" aria-hidden />}
        {c.rot}
      </button>
    );
    const notaDoPremium =
      c.nota ??
      (testando
        ? tp(
            diasQueFaltam,
            'Seu teste termina em {n} dia. Depois dele a conta volta ao Grátis sozinha e nada é cobrado.',
            'Seu teste termina em {n} dias. Depois dele a conta volta ao Grátis sozinha e nada é cobrado.',
          )
        : null);

    /* ── Consumo: os contadores do servidor na forma de `telas2.js:89-97`. ── */
    const semIaDeNuvem = !!uso && uso.chamadas.teto === 0 && uso.tokensDeLlm.teto === 0;
    const cartaoDeConsumo = ([, titulo, valor, f, unidade, dia]: LinhaDeConsumo) => {
      const fora = unidade === foraDoPlano;
      const pct = f === null ? null : Math.round(Math.max(0, Math.min(1, f)) * 100);
      return (
        <div key={titulo} className="q-cartao q-num px-consumo">
          <span className="q-rotulo">{t(titulo)}</span>
          <b>{fora ? '—' : valor}</b>
          {/* Sem teto NÃO vira barra vazia: uma barra a 0 pareceria "nada usado". */}
          {!fora && pct !== null && (
            <span
              className="q-barra"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={t(titulo)}
              aria-valuetext={`${valor} ${unidade}`}
            >
              <span style={{ width: `${Math.max(pct, 2)}%` }} />
            </span>
          )}
          <span>
            {fora
              ? foraDoPlano
              : f === null
                ? t('sem limite')
                : dia
                  ? t('{valor} do limite de hoje', { valor: unidade })
                  : t('{valor} do limite do plano', { valor: unidade })}
          </span>
        </div>
      );
    };

    return (
      <div className="q-palco px-planos-tela" data-testid="planos-do-quest">
        <header className="q-cab">
          <div>
            <p className="q-sobre">{t('Planos')}</p>
            <h1>{t(TITULO_DA_TELA)}</h1>
          </div>
          <span className="q-chip px-meu-plano">
            <IconeDoPlano aria-hidden /> {seloDoPlano}
          </span>
        </header>
        <div className="q-abas px-abas-planos" role="tablist" aria-label={t('Planos')} ref={refDasAbas}>
          {ordemDasAbas.map((id, i) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="q-aba"
              aria-selected={aba === id}
              tabIndex={aba === id ? 0 : -1}
              onClick={() => irAba(id, 1)}
              onKeyDown={(e) => aoTeclarNaAba(e, i)}
            >
              {rotuloDaAba[id]}
            </button>
          ))}
        </div>

        {aba === 'planos' && (
          <>
            <div className="q-grade g2 px-planos-grade">
              <section className="q-cartao px-plano" data-plano="gratis">
                <p className="q-rotulo">{noGratis ? t('Seu plano') : ' '}</p>
                <h3>{nomeDoGratis}</h3>
                <p className="px-preco">
                  <b>R$ 0</b>
                  <span>{t('para sempre')}</span>
                </p>
                <p className="q-d">{t('Sem cartão, sem conta.')}</p>
                <ul>
                  {item(t('Legenda bilíngue ao vivo, no aparelho, sem limite'))}
                  {item(t('Tradução rápida ao vivo'))}
                  {item(t('Jogos, vocabulário e revisão'))}
                  {item(
                    t('Nuvem: até {horas} h por mês, para aparelho fraco, quando disponível', {
                      horas: horasDoAlivio(),
                    }),
                  )}
                </ul>
                {noGratis && (
                  <button type="button" className="q-ctl" onClick={() => navegarPara({ view: 'hub' })}>
                    {t('Continuar grátis')}
                  </button>
                )}
              </section>
              <section className="q-cartao px-plano px-premium" data-plano="premium">
                <p className="q-rotulo">
                  <span className="q-tag">{testando ? t('Em teste') : assina ? t('Seu plano') : t('Recomendado')}</span>{' '}
                  {t(premium.tag)}
                </p>
                <h3>{premium.nome}</h3>
                <p className="px-preco">
                  <b>{brl(anual ? precoAnual('premium') : precoMensal('premium'))}</b>
                  <span>{anual ? t('por ano') : t('por mês')}</span>
                </p>
                <p className="q-d">{t(premium.para)}</p>
                <p className="px-tudo">{t('Tudo do {plano}, e:', { plano: premium.base ?? '' })}</p>
                <ul>{premium.itens.map((i) => item(textoDoItem(i), notaDoItem(i)))}</ul>
                {principalDoPremium}
                {c.secundario && (
                  <button type="button" className="q-ctl" onClick={c.secundario.acao}>
                    {c.secundario.rot}
                  </button>
                )}
                {notaDoPremium && <p className="px-nota">{notaDoPremium}</p>}
                {testeErro && (
                  <p className="qc-erro" role="alert">
                    <TriangleAlert aria-hidden />
                    <span>{testeErro}</span>
                  </p>
                )}
              </section>
            </div>
            <p className="px-garantia">
              <Lock aria-hidden /> {t('Pagamento seguro · 7 dias para desistir com reembolso · cancele quando quiser')}
            </p>
            <section className="q-secao">
              <header>
                <div>
                  <h2>{t('Comparar em detalhe')}</h2>
                </div>
              </header>
              <div className="q-tabela-caixa">
                <table className="q-tabela px-compara">
                  <thead>
                    <tr>
                      <th scope="col">&nbsp;</th>
                      <th scope="col">{nomeDoGratis}</th>
                      <th scope="col">{premium.nome}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabela.map(([rotulo, g, pr]) => (
                      <tr key={rotulo}>
                        <th scope="row">{rotulo}</th>
                        <td>{g}</td>
                        <td>{pr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-nota">
                {t(
                  '* uso justo: até {dia} h de nuvem por dia e {mes} h por mês; passando disso, a legenda segue no aparelho.',
                  justo,
                )}
              </p>
            </section>
            <section className="q-secao">
              <header>
                <div>
                  <h2>{t('Perguntas frequentes')}</h2>
                </div>
              </header>
              {/* O clique é do <summary>, que o teclado já aciona; aqui só a altura é animada. */}
              <div className="px-faq" onClick={alternarPergunta}>
                {faq.map(([q, r]) => (
                  <details key={q} className="q-cartao">
                    <summary>
                      {q}
                      <ChevronDown aria-hidden />
                    </summary>
                    <p>{r}</p>
                  </details>
                ))}
              </div>
            </section>
          </>
        )}

        {aba === 'assinatura' &&
          (assina ? (
            <SuaAssinatura
              conta={conta}
              faturas={faturas}
              carregandoFaturas={carregandoFaturas}
              abrir={setDialogo}
              aoCancelar={() => irSub('cancelar')}
              aoTentarDeNovo={(f) => window.open(f.link!, '_blank', 'noopener')}
              aoReativar={reativar}
            />
          ) : (
            <section className="q-cartao px-assinatura">
              <span className="q-ic">
                <IconeDoPlano aria-hidden />
              </span>
              <div>
                <p className="q-rotulo">{t('Sua assinatura')}</p>
                <h2>{selfhost ? 'Self-host' : testando ? t('Premium, em teste') : t('Você está no Grátis')}</h2>
                <p className="q-d">
                  {selfhost
                    ? t('É o Babel Play rodando no seu próprio computador. Ali tudo fica liberado e não há cota.')
                    : testando
                      ? `${tp(diasQueFaltam, 'O teste termina em {n} dia.', 'O teste termina em {n} dias.')} ${t(
                          'Depois dele a conta volta ao Grátis sozinha e nada é cobrado. A legenda no aparelho continua sem limite.',
                        )}`
                      : `${t('Ele continua inteiro: legenda no aparelho sem limite, jogos, vocabulário e revisão.')}${
                          podeTestar
                            ? ` ${t('Quando quiser ir além, o Premium tem teste de {dias} dias, sem cartão.', {
                                dias: teste?.dias ?? DIAS_DO_TESTE_PREMIUM,
                              })}`
                            : ''
                        }`}
                </p>
                <div className="q-acoes">
                  {/* Só o botão principal (`telas2.js:88`): assinar direto fica no cartão do Premium. */}
                  {!selfhost && principalDoPremium}
                  {!testando && (
                    <button type="button" className="q-ctl" onClick={() => irAba('planos', -1)}>
                      {t('Comparar os planos')}
                    </button>
                  )}
                </div>
                {testeErro && (
                  <p className="qc-erro" role="alert">
                    <TriangleAlert aria-hidden />
                    <span>{testeErro}</span>
                  </p>
                )}
              </div>
            </section>
          ))}

        {aba === 'consumo' &&
          (carregando ? (
            <>
              <div className="qc-espera" role="status">
                <LoaderCircle aria-hidden />
                <span>
                  {t('Carregando…')} {t('Buscando os contadores deste mês no servidor.')}
                </span>
              </div>
              <div className="q-grade g2" aria-hidden>
                <div className="q-esqueleto" style={{ minHeight: 150 }} />
                <div className="q-esqueleto" style={{ minHeight: 150 }} />
              </div>
            </>
          ) : !uso ? (
            <div className="q-vazio" role="status">
              <span className="q-ic">
                <Gauge aria-hidden />
              </span>
              <h3>{t('Consumo indisponível')}</h3>
              <p>
                {t(
                  'Não consegui falar com o servidor agora. Isto NÃO significa consumo zero — significa que não sei o número.',
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="q-grade g2">{consumo.map(cartaoDeConsumo)}</div>
              {semIaDeNuvem && (
                <div className="q-aviso">
                  <span>
                    <Lock aria-hidden />{' '}
                    {t(
                      'Chamadas e tokens de IA de nuvem fazem parte do Premium. A legenda no aparelho continua sem limite.',
                    )}
                  </span>
                  <button type="button" className="q-ctl" onClick={() => irAba('planos', -1)}>
                    {t('Ver planos')}
                  </button>
                </div>
              )}
              {/* O portão GLOBAL da nuvem (chave de emergência ou orçamento do mês): sem esta linha, a
                  nuvem fechada parecia defeito do plano. */}
              {uso.iaDeNuvem && !uso.iaDeNuvem.disponivel && uso.iaDeNuvem.mensagem && (
                <div className="q-aviso" role="status">
                  <span>{uso.iaDeNuvem.mensagem}</span>
                </div>
              )}
            </>
          ))}
        {dialogos}
      </div>
    );
  }

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        sobrancelha={t('Assinatura')}
        icone={CreditCard}
        titulo={t('Planos')}
        sub={t('O que cada plano inclui, a sua assinatura e o consumo do mês.')}
        abas={
          <Abas
            itens={[
              { id: 'planos', rotulo: t('Planos'), icone: <ListChecks aria-hidden /> },
              ...(assina ? [{ id: 'assinatura', rotulo: t('Sua assinatura'), icone: <Receipt aria-hidden /> }] : []),
              { id: 'consumo', rotulo: t('Consumo do mês'), icone: <Gauge aria-hidden /> },
            ]}
            ativo={aba}
            aoTrocar={trocarAba}
            rotuloDoGrupo={t('Seções de Planos')}
          />
        }
      />

      <PainelDeAba id="planos" ativo={aba}>
        <FaixaDaConta
          conta={conta}
          rotuloGratis={meuPlano === 'anonimo' ? t(PLAN_LABELS[meuPlano]) : t('Grátis')}
          aoGerenciar={() => irSub('assinatura')}
          aoAtualizarPagamento={() => setDialogo('pagamento')}
          aoReativar={reativar}
        />
        {/* O TÍTULO DO PRODUTO e o período (`.periodo-bar` do protótipo). O self-host não compra nada:
            sem seletor ali. */}
        <div
          className="periodo-bar"
          style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, margin: '0 0 18px' }}
        >
          <h2 style={{ font: '900 26px/1.2 var(--font-display)', letterSpacing: '-.01em', maxWidth: '32ch' }}>
            {t(TITULO_DA_TELA)}
          </h2>
          <p className="mut" style={{ fontSize: 14.5, maxWidth: '62ch' }}>
            {t(
              'Do microfone ou do som do computador, a legenda aparece nos dois idiomas enquanto você ouve. Estudar e jogar é igual nos dois planos.',
            )}
          </p>
          {!selfhost && anualAVenda && (
            <div className="seg periodo" role="radiogroup" aria-label={t('Período de cobrança')}>
              <button type="button" role="radio" aria-checked={!anual} onClick={() => trocarPeriodo('mensal')}>
                {t('Mensal')}
              </button>
              <button type="button" role="radio" aria-checked={anual} onClick={() => trocarPeriodo('anual')}>
                {t('Anual')} <span className="badge ok">{t('equivale a {n} meses grátis', { n: economia.meses })}</span>
              </button>
            </div>
          )}
        </div>
        <div className="planos-grade" style={{ '--planos': PLANOS.length } as CSSProperties}>
          {PLANOS.map(cartao)}
        </div>
        <p className="mut garantia">
          <ShieldCheck aria-hidden />{' '}
          {t('Pagamento seguro · 7 dias para desistir com reembolso · cancele quando quiser')}
        </p>

        <section className="secao">
          <TituloDeSecao
            icone={Table2}
            titulo={t('Comparar em detalhe')}
            desc={t('Tudo o que cada plano inclui, lado a lado.')}
          />
          <section className="cartao compara secao" aria-label={t('Comparação completa')} tabIndex={0}>
            <table className="tabela-planos">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr">{t('Recurso')}</span>
                  </th>
                  {PLANOS.map((p) => {
                    const I = p.icone;
                    return (
                      <th key={p.id} scope="col" className={p.destaque ? 'col-destaque' : ''}>
                        <span className="linha" style={{ gap: 8, justifyContent: 'center' }}>
                          <I aria-hidden style={{ width: 15, height: 15 }} />
                          {p.nome}
                        </span>
                        <small className="mut tn">
                          {p.id === 'gratis'
                            ? brl(0)
                            : anual
                              ? t('{preco}/ano', { preco: brl(precoAnual('premium')) })
                              : t('{preco}/mês', { preco: brl(precoMensal('premium')) })}
                        </small>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {comparativo().map(([grupo, linhas]) => (
                <tbody key={grupo}>
                  <tr className="grupo">
                    <th colSpan={PLANOS.length + 1} scope="colgroup">
                      {grupo}
                    </th>
                  </tr>
                  {linhas.map(([rotulo, valores, nota]) => (
                    <tr key={rotulo}>
                      <th scope="row">
                        {rotulo}
                        {nota && <small className="mut">{nota}</small>}
                      </th>
                      {valores.map((x, k) => (
                        <td key={k} className={PLANOS[k].destaque ? 'col-destaque' : ''}>
                          <CelulaDaTabela x={x} />
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
          <TituloDeSecao icone={CircleHelp} titulo={t('Perguntas frequentes')} />
          <div className="faq">
            {perguntas(anualAVenda).map(([q, r], i) => (
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
              <h3>{t('Carregando…')}</h3>
              <p>{t('Buscando os contadores deste mês no servidor.')}</p>
            </div>
          </div>
        ) : !uso ? (
          <div className="cartao">
            <div className="vazio">
              <IconeEmBloco icone={Gauge} tom="warn" />
              <h3>{t('Consumo indisponível')}</h3>
              <p>
                {t(
                  'Não consegui falar com o servidor agora. Isto NÃO significa consumo zero — significa que não sei o número.',
                )}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* O mês primeiro; o DIA (uso justo) logo abaixo, com o mesmo medidor. */}
            {[false, true].map((doDia) => {
              const linhas = consumo.filter((l) => l[5] === doDia);
              if (!linhas.length) return null;
              return (
                <div key={String(doDia)} className="pilha" style={doDia ? { marginTop: 18 } : undefined}>
                  {doDia && <span className="label-mono">{t('Hoje')}</span>}
                  <div className="ladrilhos">
                    {linhas.map(([I, titulo, valor, f, unidade, dia]) => (
                      <div key={titulo} className="cartao p5 consumo">
                        <TituloDeSecao
                          icone={I}
                          titulo={<span style={{ fontWeight: 700 }}>{t(titulo)}</span>}
                          nivel="h3"
                        />
                        <div className="linha" style={{ alignItems: 'baseline', gap: 6 }}>
                          <b className="tn" style={{ font: '900 28px var(--font-display)' }}>
                            {valor}
                          </b>
                          <span className="mut">
                            {unidade}
                            {unidade !== foraDoPlano &&
                              ` · ${f === null ? t('sem limite') : dia ? t('do limite de hoje') : t('do limite do plano')}`}
                          </span>
                        </div>
                        {/* Sem teto NÃO vira barra vazia: uma barra a 0 pareceria "nada usado". O nome
                      acessível diz o número, não uma porcentagem (a barra já anuncia o valor). */}
                        {f !== null && (
                          <div
                            className="barra"
                            style={{ marginTop: 12 }}
                            role="progressbar"
                            aria-valuenow={Math.round(f * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={t(titulo)}
                            aria-valuetext={`${valor} ${unidade}`}
                          >
                            <span style={{ width: `${f * 100}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="cartao secao">
              <div className="vazio">
                <IconeEmBloco icone={semTeto ? Infinito : Gauge} />
                <h3>{semTeto ? t('No self-host não há cota') : t('Janela {janela}', { janela: uso.janela })}</h3>
                <p>
                  {semTeto
                    ? t(
                        'Os números acima são só para você acompanhar; o custo da IA de nuvem é seu, pela sua própria chave. Os limites valem nos planos em nuvem.',
                      )
                    : t(
                        'Zera na virada do mês. Transcrição, tradução e tutor dividem o limite de chamadas: cada fala transcrita e traduzida usa duas. Tradução e tutor também dividem o limite de tokens. A cota de transcrição conta os segundos reais de fala.',
                      )}
                </p>
                {notaDoDiaTexto && (
                  <p data-testid="uso-justo-do-dia">
                    {notaDoDiaTexto}. {t('O uso do dia zera à meia-noite, no fuso da sua conta.')}
                  </p>
                )}
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
