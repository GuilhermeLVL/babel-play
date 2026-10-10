import '../../styles/questConta.css';
import '../../styles/polimentoPlanos4.css';

import {
  ArrowLeftRight,
  CalendarClock,
  Check,
  ChevronDown,
  Gauge,
  Info,
  LoaderCircle,
  Lock,
  Sparkles,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  DIAS_DO_TESTE_PREMIUM,
  ehPlanoPago,
  FLAG_STT_AO_VIVO,
  FLAG_VENDA_PLANOS_V3,
  PLAN_MATRIX,
  PLANO_DO_TESTE,
  planosAVenda,
} from '../../core/planos';
import {
  brl,
  carregarFaturas,
  carregarStatusDeBilling,
  CHAVE_DO_PLANO_DO_CHECKOUT,
  type Conta,
  dataCurta,
  desistirDaTroca,
  estadoDaConta,
  type Fatura,
  faturaEmAberto,
  formaDaConta,
  type FormaDeAssinar,
  formaGuardadaDoCheckout,
  iniciarTeste,
  lembrarFormaDoCheckout,
  parcelasDoAnual,
  type PlanoPago,
  planoPagoDe,
  precoAnual,
  precoMensal,
  type StatusDeBilling,
  temAssinatura,
} from '../../lib/assinatura';
import { carregarEntitlements, getEntitlements, onPlanChange, PLAN_LABELS } from '../../lib/entitlements';
import { useFlag } from '../../lib/flags';
import { numero, t, tp } from '../../lib/i18n';
import { consumirDestaqueEmPlanos } from '../../lib/ofertas/destaque';
import {
  alternarPergunta,
  arrumarPlanos,
  festejarTeste,
  provaDosPlanos,
  repintarPlanos,
} from '../../lib/polimento/planos';
import { sentir } from '../../lib/polimento/sentidos';
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
import { carregarUso, type Contador, duracaoLegivel, fracao, type UsoDoMes } from '../../lib/uso';
import { toast } from '../Toast';
import Assinado from './planos/Assinado';
import Cancelar from './planos/Cancelar';
import Checkout from './planos/Checkout';
import { irAjuda, irSub, notaDoUsoJusto } from './planos/dados';
import { DialogoCiclo, DialogoFatura, DialogoPagamento, DialogoPausar } from './planos/DialogosDaAssinatura';
import { DialogoTrocar } from './planos/DialogoTrocar';
import { entrarParaAssinar, useAnualAVenda, useSemConta, useVendaAberta } from './planos/funil';
import {
  aparelhoAtual,
  cartaoDoPlano,
  type Celula,
  type ContextoDosPlanos,
  horasEmTexto,
  horasPorDia,
  linhasDaComparacao,
  maiorEconomia,
  nomeDoPlano,
  notaDaComparacao,
  notaDoAparelho,
  ORDEM_DOS_PLANOS,
  ordemDoPlano,
  perguntasDosPlanos,
  type PlanoDaTela,
  recomendadoPara,
  type Sinal,
} from './planos/quatroPlanos';
import SuaAssinatura, { type DialogoDaAssinatura, metodoAtual } from './planos/SuaAssinatura';

/**
 * PLANOS E ASSINATURA — o que cada plano dá, quanto do seu já foi usado, e a assinatura inteira:
 * checkout, confirmação, faturas e cancelamento.
 *
 * A FORMA É A DO PROTÓTIPO DOS QUATRO PLANOS (`docs/prototipos/anuncios-no-gratis.html`, fonte
 * `anuncios-no-gratis-src/planos4.js:571-721`): o cartão "Você está num…", o seletor Mensal/Anual, um
 * cartão por plano com "para quem" e o que entra, o "Recomendado aqui" pelo aparelho, a comparação linha
 * a linha (no celular, o seu plano contra um de cada vez), as perguntas, "Sua assinatura" e o "Consumo
 * do mês" por nível. O CSS é o do protótipo, copiado por `scripts/polimento/trazer-css.mjs`
 * (`src/styles/polimento/planos4.css`); os textos e as contas estão em `planos/quatroPlanos.ts`.
 *
 * OS NÚMEROS SÃO DO APP. Preço, horas e capacidades da `PLAN_MATRIX`; o estado da conta de
 * `/api/billing/status`; o consumo por nível de `/api/me/uso` (`porNivel`); o aparelho de
 * `lib/dispositivo/perfil`. O dinheiro não passa por aqui: o checkout abre a página de pagamento do
 * Asaas, e quem concede o plano é o webhook do servidor.
 *
 * SÓ APARECE O QUE ESTÁ À VENDA PARA A PESSOA. Os cartões e as colunas são o Grátis, os planos que o
 * servidor vende agora (`planosAVenda` de `/api/billing/status`; sem ele, as flags `venda_planos_v3` e
 * `stt_ao_vivo` do cache) e o plano que a pessoa já tem, mesmo fora de venda (concedido pelo admin). Com
 * as duas flags desligadas, o estado de fábrica, são dois cartões: Grátis e Premium.
 *
 * AS SUB-TELAS têm endereço (`/plano/assinar`, `/plano/assinado`, `/plano/cancelar`,
 * `/plano/assinatura` — ver `lib/rotas`) sem virar views do App: o menu continua em Planos.
 *
 * QUEM JÁ ASSINA TROCA DE PLANO pelo botão do cartão ("Mudar para o…" / "Assinar…"), que confirma e
 * chama `POST /api/billing/trocar` (`DialogoTrocar`): vale no próximo ciclo, sem pro-rata. A troca de
 * CICLO (mensal ↔ anual) continua sendo o caminho honesto do `DialogoCiclo`: o servidor só troca de
 * plano no mensal.
 *
 * O MODO DE PROVA (só em desenvolvimento) simula o plano, a venda e o aparelho: as chaves estão no topo
 * de `src/lib/polimento/planos.ts`.
 */

type Periodo = 'mensal' | 'anual';
type AbaDePlanos = 'planos' | 'assinatura' | 'consumo';

const TITULO_DA_TELA = 'Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho';

const CHAVE_DO_CHECKOUT = CHAVE_DO_PLANO_DO_CHECKOUT;
/** O plano do checkout desta aba; o nome antigo guardado antes do deploy é o Premium, e o padrão também. */
function planoGuardado(): PlanoPago {
  try {
    return planoPagoDe(sessionStorage.getItem(CHAVE_DO_CHECKOUT)) ?? 'premium';
  } catch {
    return 'premium';
  }
}

/** "Dois planos: arraste para o lado" (`planos4.js:668`), pela quantidade de cartões. */
const dicaDeArraste = (n: number): string =>
  n === 2
    ? t('Dois planos: arraste para o lado')
    : n === 3
      ? t('Três planos: arraste para o lado')
      : t('Quatro planos: arraste para o lado');

/** O tom do medidor (`planos4.js:637-638`): acabou, está no fim (85% ou mais), ou nada. */
const tomDoMedidor = (pct: number, acabou: boolean): string => (acabou ? 'fim' : pct >= 85 ? 'pouco' : '');

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
  /* O cartão que a oferta pediu para destacar (`PL.destaque`, `planos4.js:129`), e quantos pedidos já vieram. */
  const destaque = useRef<PlanoDaTela | null>(null);
  const [pedidosDeDestaque, setPedidosDeDestaque] = useState(0);
  /* A OFERTA (Fase 8) não tem comparação própria: abre ESTA tela com o plano sugerido destacado,
     ou direto no consumo do mês (`lib/ofertas/destaque.ts`). O pedido é lido ao montar e quando o
     menu leva a Planos com a tela já aberta (o mesmo evento da sub-tela). */
  useEffect(() => {
    const ler = () => {
      const p = consumirDestaqueEmPlanos();
      if (!p) return;
      if ('aba' in p) {
        setAbaLocal('consumo');
        return;
      }
      /* A oferta sugere o Premium (ou o teste dele): é o cartão que a tela aponta. */
      destaque.current = PLANO_DO_TESTE;
      setPedidosDeDestaque((n) => n + 1);
      setAbaLocal('planos');
    };
    ler();
    window.addEventListener(EVENTO_SUBTELA_DE_PLANOS, ler);
    return () => window.removeEventListener(EVENTO_SUBTELA_DE_PLANOS, ler);
  }, []);
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

  /* O MODO DE PROVA (só em desenvolvimento): o plano, o teste, a venda, o aparelho e os anúncios podem
     ser simulados — as chaves estão no topo de `lib/polimento/planos.ts`. Fora dele, tudo vazio. */
  const prova = provaDosPlanos();
  const meuPlano = prova.plano ?? entitlements.plan;
  const contaReal = estadoDaConta(meuPlano, status, Date.now(), entitlements.teste);
  const conta: Conta = prova.teste
    ? { estado: 'teste', plano: PLANO_DO_TESTE, valeAte: Date.now() + DIAS_DO_TESTE_PREMIUM * 86_400_000 - 60_000 }
    : contaReal;
  const assina = temAssinatura(conta.estado);
  const formaAtual = assina ? formaDaConta(conta) : null;
  const semConta = useSemConta(meuPlano);
  const vendaAberta = useVendaAberta();
  /* `ANUAL_ENABLED=0` no servidor: o MVP vende só o mensal e o teste. Some o seletor, o preço do ano e
     as frases do anual; quem JÁ assina o anual continua vendo o plano dele como é. */
  const anualAVenda = useAnualAVenda();
  const jaTemOAnual = formaAtual === 'anual' || formaAtual === 'anual_12x';
  /* OS PLANOS À VENDA: o servidor diz (`planosAVenda` do status); sem ele, as duas chaves da venda no
     cache de flags. Com tudo desligado sobra o que nunca teve chave: o Premium. */
  const vendaV3 = useFlag(FLAG_VENDA_PLANOS_V3);
  const aoVivoExiste = useFlag(FLAG_STT_AO_VIVO);
  const anunciosLigados = useFlag('anuncios');
  const comAnuncios = anunciosLigados || prova.anuncios;
  const aVenda: readonly PlanoPago[] =
    prova.aVenda ??
    status?.planosAVenda?.filter(ehPlanoPago) ??
    planosAVenda((chave) => (chave === FLAG_VENDA_PLANOS_V3 ? vendaV3 : chave === FLAG_STT_AO_VIVO && aoVivoExiste));
  /* `meu`: o plano da pessoa entre os da tela (`conta.plano` do protótipo). No self-host não há. Quem
     acabou de tocar em "Testar" já está em teste, antes de o servidor responder de novo. */
  const selfhost = conta.estado === 'selfhost';
  const testando = conta.estado === 'teste' || testeFeito !== null;
  const meu: PlanoDaTela | null = selfhost ? null : testando ? PLANO_DO_TESTE : (conta.plano ?? 'gratis');
  const meuPago: PlanoPago | null = meu !== null && meu !== 'gratis' ? meu : null;
  const pago = meuPago !== null;
  /* SÓ O QUE ESTÁ À VENDA, mais o plano que a pessoa já tem (mesmo fora de venda). */
  const visiveis = ORDEM_DOS_PLANOS.filter((id) => id === 'gratis' || aVenda.includes(id) || id === meu);
  const aparelho = prova.aparelho ?? aparelhoAtual();
  const recomendado = recomendadoPara(aparelho, visiveis);
  /* O que o protótipo guarda em `PL` (`planos4.js:122-131`): com quem a tabela compara no celular, e o
     cartão que a oferta pediu para destacar. */
  const [comparar, setComparar] = useState<PlanoDaTela | null>(null);
  const [trocarPara, setTrocarPara] = useState<PlanoPago | null>(null);
  const refDoPalco = useRef<HTMLDivElement>(null);

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
        plano: conta.plano ? nomeDoPlano(conta.plano) : t('plano'),
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
    await carregarEntitlements();
    recarregarStatus();
  };

  const aberta = faturaEmAberto(faturas);
  const dialogos = (dialogo || trocarPara) && (
    <>
      {trocarPara && (
        <DialogoTrocar
          conta={conta}
          para={trocarPara}
          aoFechar={() => setTrocarPara(null)}
          aoTrocado={recarregarStatus}
        />
      )}
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
      {dialogo !== null && typeof dialogo === 'object' && (
        <DialogoFatura fatura={dialogo.fatura} aoFechar={() => setDialogo(null)} />
      )}
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

  /* DEPOIS DE PINTAR A ABA PLANOS (`arrumarPlanos`, `planos4.js:685-704`): no celular o carrossel para
     no cartão recomendado; o cartão que a oferta pediu é apontado. */
  useLayoutEffect(() => {
    if (abaNaTela !== 'planos' || sub === 'assinar' || sub === 'assinado' || sub === 'cancelar') return;
    const pedido = destaque.current;
    destaque.current = null;
    arrumarPlanos(refDoPalco.current, pedido ?? recomendado, pedido !== null);
  }, [abaNaTela, sub, recomendado, pedidosDeDestaque]);

  /* ── Sub-telas ── */
  if (sub === 'assinar')
    return (
      <Checkout
        plano={planoDoCheckout}
        planos={aVenda}
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
  const diasDoTeste = teste?.dias ?? DIAS_DO_TESTE_PREMIUM;
  /* PERFIL PROTEGIDO: quem assina e quem ativa o teste é o responsável. O servidor diz pelo teste
     (`perfil_protegido`); a idade já declarada de menor também basta. A tela não oferece o que o
     servidor recusaria. */
  const protecao = estadoDaProtecao();
  const menor =
    (teste?.estado === 'indisponivel' && teste.motivo === 'perfil_protegido') ||
    (!!protecao && protecao.nascimentoInformado && protecao.faixa !== 'adulto');
  /* O servidor deixa esta pessoa começar o teste agora. */
  const podeTestar =
    !assina && vendaAberta && !menor && !semConta && teste?.estado === 'disponivel' && testeFeito === null;
  const fimDoTeste = testeFeito ?? conta.valeAte;
  const diasQueFaltam =
    fimDoTeste === null ? diasDoTeste : Math.max(1, Math.ceil((fimDoTeste - Date.now()) / 86_400_000));

  /* ── O QUE A TELA MOSTRA (`planos4.js:594-683`) ───────────────────────────────────────────────── */
  const contexto: ContextoDosPlanos = { visiveis, comAnuncios };
  const nota = notaDoAparelho(aparelho, contexto);
  const IconeDoAparelho = nota.icone;
  const temAnual = (id: PlanoDaTela): boolean => id !== 'gratis' && PLAN_MATRIX[id].precoAnualBrl !== null;
  const comCiclo = !selfhost && anualAVenda && visiveis.some(temAnual);
  const anual = periodo === 'anual' && comCiclo;
  const nomeDoGratis = meuPlano === 'anonimo' ? t(PLAN_LABELS[meuPlano]) : nomeDoPlano('gratis');
  const nome = (id: PlanoDaTela): string => (id === 'gratis' ? nomeDoGratis : nomeDoPlano(id));
  /* `textoDoMeuPlano` (`planos4.js:629`) e o selo do cabeçalho (`planos4.js:679`). */
  const seloDoPlano = meuPago
    ? `${nome(meuPago)}${testando ? ` · ${t('em teste')}` : ''}`
    : t('Seu plano: {plano}', { plano: selfhost ? 'Self-host' : nomeDoGratis });
  const IconeDoPlano = pago || selfhost ? Sparkles : UserRound;

  const assinar = (id: PlanoPago) => {
    escolherPlano(id);
    escolherForma(anual && temAnual(id) ? 'anual' : 'mensal');
    irSub('assinar');
  };
  const rotuloDeAssinar = (id: PlanoDaTela): string =>
    meu && ordemDoPlano(id) < ordemDoPlano(meu)
      ? t('Mudar para o {plano}', { plano: nome(id) })
      : t('Assinar {plano}', { plano: nome(id) });

  /* ── Os botões de cada cartão (`acoes`, `planos4.js:601-605`), com os estados que o app tem e o
     protótipo não: venda pausada, perfil protegido, sem conta e assinante que troca de plano. ── */
  const parado = (rotulo: string, notaDoBotao?: string) => (
    <>
      <button type="button" className="q-ctl" disabled>
        {rotulo}
      </button>
      {notaDoBotao && <p className="px-nota">{notaDoBotao}</p>}
    </>
  );
  const acoesDoCartao = (id: PlanoDaTela): ReactNode => {
    const pri = recomendado === id ? ' pri' : '';
    if (id === meu) {
      if (id === 'gratis')
        return (
          <button type="button" className="q-ctl" onClick={() => navegarPara({ view: 'hub' })}>
            {t('Continuar grátis')}
          </button>
        );
      if (!testando) return parado(t('Este é o seu plano'));
      const notaDoTeste = tp(
        diasQueFaltam,
        'Seu teste termina em {n} dia. Depois dele a conta volta ao Grátis sozinha.',
        'Seu teste termina em {n} dias. Depois dele a conta volta ao Grátis sozinha.',
      );
      if (!vendaAberta) return parado(t('Vendas reabrem em breve'), notaDoTeste);
      return (
        <>
          <button type="button" className="q-ctl pri" onClick={() => assinar(PLANO_DO_TESTE)}>
            {t('Assinar {plano}', { plano: nome(id) })}
          </button>
          <p className="px-nota">{notaDoTeste}</p>
        </>
      );
    }
    if (id === 'gratis') {
      if (selfhost) return null;
      /* O teste não se encerra por aqui: não existe rota para isso, ele acaba sozinho. */
      if (testando) return parado(t('Volta sozinho no fim do teste'));
      return (
        <button type="button" className="q-ctl" onClick={() => irSub('cancelar')}>
          {t('Voltar ao Grátis')}
        </button>
      );
    }
    /* Venda pausada (`CHECKOUT_ENABLED=0` ou a flag `vender_planos` desligada): o cartão continua
       mostrando o plano, sem um botão que levaria a um checkout fechado. O teste pausa junto. */
    if (!vendaAberta) return parado(t('Vendas reabrem em breve'));
    if (menor)
      return parado(
        t('Quem assina é o seu responsável'),
        id === PLANO_DO_TESTE
          ? t(
              'Quer testar? Peça ao seu responsável: pela conta dele, vinculada à sua, ele ativa o teste de {dias} dias para você.',
              { dias: diasDoTeste },
            )
          : undefined,
      );
    /* Sem conta: direto ao login, com a intenção guardada — o checkout só diria "entre primeiro". */
    if (semConta)
      return (
        <button
          type="button"
          className={`q-ctl${pri}`}
          onClick={() => {
            escolherPlano(id);
            escolherForma(anual && temAnual(id) ? 'anual' : 'mensal');
            entrarParaAssinar(id, onEntrar);
          }}
        >
          {t('Entrar e assinar o {plano}', { plano: nome(id) })}
        </button>
      );
    /* Quem já assina não abre outro checkout (seriam duas cobranças): pede a troca. */
    if (assina)
      return (
        <button type="button" className={`q-ctl${pri}`} onClick={() => setTrocarPara(id)}>
          {rotuloDeAssinar(id)}
        </button>
      );
    /* O TESTE no cartão do plano que ele concede, para quem o servidor deixa testar (`planos4.js:604`). */
    if (id === PLANO_DO_TESTE && podeTestar)
      return (
        <>
          <button type="button" className={`q-ctl${pri}`} disabled={testeOcupado} onClick={() => void comecarTeste()}>
            {testeOcupado && <LoaderCircle className="qc-gira" aria-hidden />}
            {t('Testar {dias} dias grátis', { dias: diasDoTeste })}
          </button>
          <button type="button" className="q-ctl" onClick={() => assinar(id)}>
            {t('Assinar {plano}', { plano: nome(id) })}
          </button>
          <p className="px-nota">{t('Sem cartão. No fim, volta ao Grátis sozinha.')}</p>
        </>
      );
    return (
      <button type="button" className={`q-ctl${pri}`} onClick={() => assinar(id)}>
        {rotuloDeAssinar(id)}
      </button>
    );
  };

  /* ── Um cartão (`cartaoDoPlano`, `planos4.js:594-611`) ── */
  const cartao = (id: PlanoDaTela) => {
    const p = cartaoDoPlano(id, contexto);
    const rec = recomendado === id;
    const souEu = meu === id;
    const noAnual = anual && p.preco.anual !== null;
    return (
      <section
        key={id}
        className={`q-cartao px-plano pl-plano${rec ? ' px-premium' : ''}${souEu ? ' pl-meu' : ''}`}
        data-pl-plano={id}
        aria-label={t('Plano {plano}', { plano: nome(id) })}
      >
        <p className="q-rotulo">
          {souEu ? (
            `${t('Seu plano')}${testando ? ` · ${t('em teste')}` : ''}${rec ? ` · ${t('indicado aqui')}` : ''}`
          ) : rec ? (
            <span className="q-tag">{t('Recomendado aqui')}</span>
          ) : (
            p.rotulo
          )}
        </p>
        <h3>{nome(id)}</h3>
        {noAnual ? (
          <>
            <p className="px-preco">
              <b>{p.preco.anual}</b>
              <span>{t('por ano')}</span>
            </p>
            <p className="pl-preco-nota">
              {t('dá {valor} por mês · {pct}% a menos', {
                valor: p.preco.porMesNoAnual ?? '',
                pct: p.preco.economia ?? 0,
              })}
            </p>
          </>
        ) : (
          <>
            <p className="px-preco">
              <b>{p.preco.mensal}</b>
              <span>{id === 'gratis' ? t('para sempre') : t('por mês')}</span>
            </p>
            {id === 'gratis' ? (
              <p className="pl-preco-nota">{t('sem cartão, sem conta')}</p>
            ) : p.preco.anual === null ? (
              <p className="pl-preco-nota">{t('só mensal, por enquanto')}</p>
            ) : (
              comCiclo && <p className="pl-preco-nota">{t('ou {valor} por ano', { valor: p.preco.anual })}</p>
            )}
          </>
        )}
        <p className="q-d pl-quem">{p.quem}</p>
        {p.base && <p className="px-tudo">{p.base}</p>}
        <ul>
          {p.itens.map((i) => (
            <li key={i.texto}>
              <Check aria-hidden />
              <span>
                {i.texto}
                {i.nota && <small>{i.nota}</small>}
              </span>
            </li>
          ))}
        </ul>
        <div className="pl-plano-pe">
          {acoesDoCartao(id)}
          {id === PLANO_DO_TESTE && testeErro && (
            <p className="qc-erro" role="alert">
              <TriangleAlert aria-hidden />
              <span>{testeErro}</span>
            </p>
          )}
        </div>
      </section>
    );
  };

  /* ── A comparação (`comparacao`, `planos4.js:619-628`) ── */
  const outro = visiveis.find((x) => x !== meu) ?? null;
  const ver =
    comparar && comparar !== meu && visiveis.includes(comparar)
      ? comparar
      : recomendado && recomendado !== meu
        ? recomendado
        : outro;
  const celula = (v: Celula): ReactNode =>
    v === 1 ? (
      <span className="px-sim">
        <Check aria-hidden />
        <span className="sr">{t('Incluído')}</span>
      </span>
    ) : v === 0 ? (
      <span className="px-nao">
        —<span className="sr">{t('Não incluído')}</span>
      </span>
    ) : (
      v
    );
  const precos = visiveis.map((id) => cartaoDoPlano(id, contexto).preco);

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

  /* ── Sua assinatura (`suaAssinatura`, `planos4.js:644-662`) ── */
  const planoPago: PlanoPago = conta.plano ?? PLANO_DO_TESTE;
  const parcelas = parcelasDoAnual(planoPago);
  const valorDaAssinatura =
    formaAtual === 'anual'
      ? t('{valor} por ano', { valor: brl(precoAnual(planoPago)) })
      : formaAtual === 'anual_12x'
        ? t('{m} × {parcela} + {ultima} no cartão (total {total})', {
            m: parcelas.quantidade - 1,
            parcela: brl(parcelas.padrao),
            ultima: brl(parcelas.ultima),
            total: brl(precoAnual(planoPago)),
          })
        : formaAtual === 'concedido'
          ? t('Sem cobrança')
          : t('{valor} por mês', { valor: brl(precoMensal(planoPago)) });
  const quandoRenova =
    conta.estado === 'ativa' && conta.proximaCobranca
      ? formaAtual === 'mensal'
        ? t('renovado no dia {dia}', { dia: Number(conta.proximaCobranca.slice(8, 10)) })
        : t('renova em {data}', { data: dataCurta(conta.proximaCobranca) })
      : conta.valeAte
        ? t('acesso até {data}', { data: dataCurta(conta.valeAte) })
        : '';
  const trocaPendente = assina ? (status?.trocaPendente ?? null) : null;
  const textoDaAssinatura = [
    `${valorDaAssinatura}${quandoRenova ? `, ${quandoRenova}` : ''}.`,
    cartaoDoPlano(planoPago, contexto).quem,
    conta.estado === 'cancelada'
      ? t('A renovação está cancelada: o plano vale até o fim do período pago.')
      : t('Cancele quando quiser: o plano vale até o fim do período pago.'),
    trocaPendente
      ? trocaPendente.aPartirDe
        ? t('Troca pedida: o {plano} passa a valer em {data}.', {
            plano: nomeDoPlano(trocaPendente.plano),
            data: dataCurta(trocaPendente.aPartirDe),
          })
        : t('Troca pedida: o {plano} passa a valer no próximo ciclo.', { plano: nomeDoPlano(trocaPendente.plano) })
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const desistir = async () => {
    const r = await desistirDaTroca();
    if (r.ok) toast.ok(t('Troca desfeita: o seu plano continua o mesmo.'));
    else if (r.indisponivel) {
      toast.info(t('Desfazer a troca por aqui ainda não está disponível. Fale com o suporte.'));
      irAjuda();
    } else toast.info(r.erro ?? t('Não consegui desfazer a troca agora. Tente de novo.'));
    recarregarStatus();
  };

  /* ── Consumo do mês (`consumoDoMes`, `planos4.js:630-643`): um medidor por nível, do servidor. ── */
  const mb = (bytes: number) => `${numero(Math.round(bytes / 1_048_576))} MB`;
  /* Na bancada o servidor é self-host (sem teto): com um plano de prova, os tetos são os da matriz. */
  const tetosDeProva = prova.plano ? PLAN_MATRIX[prova.plano].quotas : null;
  const arm =
    tetosDeProva && tetosDeProva.armazenamentoMb !== null
      ? { usados: entitlements.armazenamento?.usados ?? 0, teto: tetosDeProva.armazenamentoMb * 1_048_576 }
      : entitlements.armazenamento;
  const trechos: Contador | null = uso
    ? tetosDeProva
      ? { usado: uso.segundosDeAudio.usado, teto: tetosDeProva.sttSegundosMes }
      : (uso.porNivel?.trechos ?? uso.segundosDeAudio)
    : null;
  const aoVivo: Contador | null = uso
    ? tetosDeProva
      ? { usado: uso.porNivel?.aovivo.usado ?? 0, teto: tetosDeProva.sttAoVivoSegundosMes }
      : (uso.porNivel?.aovivo ?? { usado: 0, teto: 0 })
    : null;
  const comAoVivoNaTela = visiveis.some((id) => id !== 'gratis' && PLAN_MATRIX[id].entitlements.sttAoVivo);
  const primeiroComNuance = visiveis.find((id) => id !== 'gratis' && PLAN_MATRIX[id].entitlements.traducaoNuance);
  const temNuance = meuPago ? PLAN_MATRIX[meuPago].entitlements.traducaoNuance : selfhost;
  const cartaoDeConsumo = (titulo: string, valor: string, sub: string, pct: number | null, tom = '') => (
    <div key={titulo} className="q-cartao q-num px-consumo" data-tom={tom}>
      <span className="q-rotulo">{titulo}</span>
      <b>{valor}</b>
      {/* Sem teto NÃO vira barra vazia: uma barra a 0 pareceria "nada usado". */}
      {pct !== null && (
        <span
          className="q-barra"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={titulo}
          aria-valuetext={`${valor} ${sub}`}
        >
          <span style={{ width: `${Math.max(pct, 2)}%` }} />
        </span>
      )}
      <span>{sub}</span>
    </div>
  );
  /** O medidor de um nível: horas usadas, o teto do plano e o que resta. `acabou` é a frase de quando zera. */
  const medidorDoNivel = (titulo: string, c: Contador | null, fora: string, acabou: string, doPlano = true) => {
    if (!c || c.teto === 0) return cartaoDeConsumo(titulo, '—', fora, null);
    if (c.teto === null) return cartaoDeConsumo(titulo, horasEmTexto(c.usado), t('sem limite'), null);
    const fim = c.usado >= c.teto;
    const pct = Math.round(Math.min(1, c.usado / c.teto) * 100);
    const numeros = { total: horasEmTexto(c.teto), resta: horasEmTexto(Math.max(0, c.teto - c.usado)) };
    return cartaoDeConsumo(
      titulo,
      horasEmTexto(c.usado),
      fim
        ? t('de {total} · acabou: {depois}', { total: numeros.total, depois: acabou })
        : doPlano
          ? t('de {total} do plano · restam {resta}', numeros)
          : t('de {total} para aparelho fraco · restam {resta}', numeros),
      pct,
      tomDoMedidor(pct, fim),
    );
  };
  /* No Grátis, a nuvem que existe é a de alívio do aparelho fraco (decisão 8): é ela que o medidor
     mostra, quando o servidor a manda. */
  const alivio = !pago && uso?.alivio?.segundosDeAudio.teto ? uso.alivio.segundosDeAudio : null;
  const diaDoMeuPlano = meuPago ? horasPorDia(meuPago) : null;
  /* HOJE (o uso justo do dia). O protótipo não tem estes medidores; ficam porque o teto do dia não pode
     ser descoberto na recusa, e levam a nota do uso justo ao lado, com as horas da matriz (CDC;
     `tests/consumo-hoje-e-aviso-do-dia.test.tsx`). O servidor manda `hoje` só para plano com teto no dia. */
  const medidorDoDia = (titulo: string, valor: string, unidade: string, c: Contador, comNota: boolean) => {
    const f = fracao(c);
    const pct = f === null ? null : Math.round(Math.max(0, Math.min(1, f)) * 100);
    const notaDoDia = comNota ? notaDoUsoJusto() : '';
    return (
      <div key={titulo} className="q-cartao q-num px-consumo" data-tom="">
        <span className="q-rotulo">{titulo}</span>
        <b>{valor}</b>
        {pct !== null && (
          <span
            className="q-barra"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={titulo}
            aria-valuetext={`${valor} ${unidade}`}
          >
            <span style={{ width: `${Math.max(pct, 2)}%` }} />
          </span>
        )}
        <span>{f === null ? t('sem limite') : t('{valor} do limite de hoje', { valor: unidade })}</span>
        {notaDoDia && <small data-testid="uso-justo-do-dia">{notaDoDia}</small>}
      </div>
    );
  };

  return (
    <div className="q-palco px-planos-tela pl-planos-tela" data-testid="planos-do-quest" ref={refDoPalco}>
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
          {/* `notaDoAparelho` (`planos4.js:612-618`): o que o Grátis consegue NESTE aparelho. */}
          <section className="q-cartao pl-aparelho" data-pl-aparelho={nota.aparelho}>
            <div className="pl-aparelho-topo">
              <span className="q-ic">
                <IconeDoAparelho aria-hidden />
              </span>
              <div>
                <p className="q-rotulo">{nota.titulo}</p>
                <p className="pl-aparelho-frase">{nota.frase}</p>
              </div>
            </div>
            <details className="pl-aparelho-det">
              <summary>
                {t('O que o Grátis consegue neste aparelho')}
                <ChevronDown aria-hidden />
              </summary>
              <ul>
                {nota.linhas.map(([titulo, texto, sinal]) => (
                  <li key={titulo}>
                    <span className={`pl-sinal ${CLASSE_DO_SINAL[sinal]}`}>
                      {sinal === 1 ? <Check aria-hidden /> : sinal === 2 ? <Info aria-hidden /> : <X aria-hidden />}
                    </span>
                    <span>
                      <b>{titulo}.</b> {texto}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <div className="pl-ciclo-linha">
            {/* O ciclo (`planos4.js:667`) só existe com o anual à venda (`ANUAL_ENABLED`). */}
            {comCiclo && (
              <div className="q-abas q-seg pl-ciclo" role="radiogroup" aria-label={t('Cobrança')}>
                <button
                  type="button"
                  role="radio"
                  className="q-aba"
                  aria-checked={!anual}
                  onClick={() => trocarPeriodo('mensal')}
                >
                  {t('Mensal')}
                </button>
                <button
                  type="button"
                  role="radio"
                  className="q-aba"
                  aria-checked={anual}
                  onClick={() => trocarPeriodo('anual')}
                >
                  {t('Anual')}{' '}
                  <span className="ad-mini-tag">{t('até {pct}% a menos', { pct: maiorEconomia(visiveis) })}</span>
                </button>
              </div>
            )}
            <p className="pl-dica-arraste">
              <ArrowLeftRight aria-hidden /> {dicaDeArraste(visiveis.length)}
            </p>
          </div>
          <div className={`q-grade g${visiveis.length} px-planos-grade pl-planos-grade`} data-pl-n={visiveis.length}>
            {visiveis.map(cartao)}
          </div>
          <p className="px-garantia">
            <Lock aria-hidden /> {t('Pagamento seguro · 7 dias para desistir com reembolso · cancele quando quiser')}
          </p>
          <section className="q-secao pl-comparar">
            <header>
              <div>
                <h2>{t('Comparar em detalhe')}</h2>
              </div>
            </header>
            {/* No celular a tabela mostra o seu plano contra um de cada vez (`planos4.css:256-261`). */}
            <div
              className="q-abas q-seg pl-compara-escolha"
              role="radiogroup"
              aria-label={t('Comparar o seu plano com')}
            >
              {visiveis.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  className="q-aba"
                  aria-checked={id === ver}
                  disabled={id === meu}
                  onClick={() => {
                    sentir('aba');
                    setComparar(id);
                  }}
                >
                  {nome(id)}
                </button>
              ))}
            </div>
            <div className="q-tabela-caixa">
              <table className="q-tabela pl-compara" data-meu={meu ?? ''} data-ver={ver ?? ''}>
                <thead>
                  <tr>
                    <th scope="col">&nbsp;</th>
                    {visiveis.map((id) => (
                      <th key={id} scope="col" data-c={id}>
                        {nome(id)}
                        {id === meu && <small>{t('seu plano')}</small>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasDaComparacao(contexto).map(([rotulo, celulas]) => (
                    <tr key={rotulo}>
                      <th scope="row">{rotulo}</th>
                      {celulas.map((v, i) => (
                        <td key={visiveis[i]} data-c={visiveis[i]}>
                          {celula(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="pl-compara-preco">
                    <th scope="row">{t('Por mês')}</th>
                    {visiveis.map((id, i) => (
                      <td key={id} data-c={id}>
                        <b>{precos[i].mensal}</b>
                      </td>
                    ))}
                  </tr>
                  {comCiclo && (
                    <tr className="pl-compara-preco">
                      <th scope="row">{t('Por ano')}</th>
                      {visiveis.map((id, i) => (
                        <td key={id} data-c={id}>
                          {precos[i].anual ?? (id === 'gratis' ? celula(0) : t('só mensal'))}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="px-nota">{notaDaComparacao(contexto)}</p>
          </section>
          <section className="q-secao pl-faq">
            <header>
              <div>
                <h2>{t('Perguntas frequentes')}</h2>
              </div>
            </header>
            {/* O clique é do <summary>, que o teclado já aciona; aqui só a altura é animada. */}
            <div className="px-faq" onClick={alternarPergunta}>
              {perguntasDosPlanos(contexto, diasDoTeste).map(([q, r]) => (
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

      {aba === 'assinatura' && (
        <>
          <section className="q-cartao px-assinatura">
            <span className="q-ic">
              <IconeDoPlano aria-hidden />
            </span>
            <div>
              <p className="q-rotulo">{t('Sua assinatura')}</p>
              <h2>
                {selfhost
                  ? 'Self-host'
                  : testando
                    ? t('{plano}, em teste', { plano: nome(PLANO_DO_TESTE) })
                    : assina
                      ? t('Plano {plano}', { plano: nome(planoPago) })
                      : t('Você está no Grátis')}
              </h2>
              <p className="q-d">
                {selfhost
                  ? t('É o Babel Play rodando no seu próprio computador. Ali tudo fica liberado e não há cota.')
                  : testando
                    ? `${tp(diasQueFaltam, 'O teste termina em {n} dia.', 'O teste termina em {n} dias.')} ${t(
                        'Depois dele a conta volta ao Grátis sozinha e nada é cobrado. A legenda no aparelho continua sem limite.',
                      )}`
                    : assina
                      ? textoDaAssinatura
                      : `${t('Ele continua inteiro: legenda no aparelho sem limite, jogos, vocabulário e revisão.')}${
                          podeTestar
                            ? ` ${t('Quando quiser ir além, o Premium tem teste de {dias} dias, sem cartão.', {
                                dias: diasDoTeste,
                              })}`
                            : ''
                        }`}
              </p>
              <div className="q-acoes">
                {assina && (
                  <>
                    <button type="button" className="q-ctl pri" onClick={() => irAba('planos', -1)}>
                      {t('Mudar de plano')}
                    </button>
                    {conta.estado === 'ativa' && formaAtual === 'mensal' && comCiclo && temAnual(planoPago) && (
                      <button type="button" className="q-ctl" onClick={() => setDialogo('ciclo')}>
                        {t('Passar para o anual · {valor}', { valor: brl(precoAnual(planoPago)) })}
                      </button>
                    )}
                    {trocaPendente && (
                      <button type="button" className="q-ctl" onClick={() => void desistir()}>
                        {t('Desistir da troca')}
                      </button>
                    )}
                    {conta.estado !== 'cancelada' && (
                      <button type="button" className="q-ctl" onClick={() => irSub('cancelar')}>
                        {t('Cancelar a assinatura')}
                      </button>
                    )}
                  </>
                )}
                {!assina && testando && vendaAberta && (
                  <button type="button" className="q-ctl pri" onClick={() => assinar(PLANO_DO_TESTE)}>
                    {t('Assinar {plano}', { plano: nome(PLANO_DO_TESTE) })}
                  </button>
                )}
                {!assina && !testando && !selfhost && (
                  <>
                    {podeTestar && (
                      <button
                        type="button"
                        className="q-ctl pri"
                        disabled={testeOcupado}
                        onClick={() => void comecarTeste()}
                      >
                        {testeOcupado && <LoaderCircle className="qc-gira" aria-hidden />}
                        {t('Testar {dias} dias grátis', { dias: diasDoTeste })}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`q-ctl${podeTestar ? '' : ' pri'}`}
                      onClick={() => irAba('planos', -1)}
                    >
                      {t('Comparar os planos')}
                    </button>
                  </>
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
          {/* O que o cartão do protótipo não tem e é da cobrança: pagamento que falhou, forma de
              pagamento, pausa e faturas. */}
          {assina && (
            <SuaAssinatura
              soOResto
              conta={conta}
              faturas={faturas}
              carregandoFaturas={carregandoFaturas}
              abrir={setDialogo}
              aoCancelar={() => irSub('cancelar')}
              aoTentarDeNovo={(f) => window.open(f.link!, '_blank', 'noopener')}
              aoReativar={reativar}
            />
          )}
        </>
      )}

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
            <div className="q-grade g2 pl-consumo">
              {alivio
                ? medidorDoNivel(
                    t('Nuvem · Precisão'),
                    alivio,
                    t('não faz parte do Grátis'),
                    t('a legenda segue no aparelho'),
                    false,
                  )
                : medidorDoNivel(
                    t('Nuvem · Precisão'),
                    trechos,
                    t('não faz parte do Grátis'),
                    t('a legenda segue no aparelho'),
                  )}
              {/* O nível Ao vivo só aparece com o plano Ao Vivo à vista: nada do que não se vende. */}
              {(comAoVivoNaTela || (aoVivo?.teto ?? 0) !== 0) &&
                medidorDoNivel(
                  t('Nuvem · Ao vivo'),
                  aoVivo,
                  t('faz parte do plano {plano}', { plano: nomeDoPlano('aovivo') }),
                  t('voltou para a Precisão'),
                )}
              {/* O servidor não conta as consultas da Nuance: o cartão diz só se o plano a tem. */}
              {cartaoDeConsumo(
                t('Tradução Nuance'),
                temNuance ? t('Incluída') : '—',
                temNuance
                  ? t('incluída no plano')
                  : primeiroComNuance
                    ? t('faz parte do {plano}', { plano: nomeDoPlano(primeiroComNuance) })
                    : t('não incluído no seu plano'),
                null,
              )}
              {arm &&
                cartaoDeConsumo(
                  t('Armazenamento'),
                  mb(arm.usados),
                  arm.teto === null ? t('sem limite') : t('de {valor} do limite do plano', { valor: mb(arm.teto) }),
                  arm.teto ? Math.round(Math.min(1, arm.usados / arm.teto) * 100) : null,
                )}
              {uso.hoje &&
                medidorDoDia(
                  t('Nuvem hoje'),
                  duracaoLegivel(uso.hoje.segundosDeAudio.usado),
                  uso.hoje.segundosDeAudio.teto === null
                    ? t('de áudio')
                    : t('de {valor}', { valor: duracaoLegivel(uso.hoje.segundosDeAudio.teto) }),
                  uso.hoje.segundosDeAudio,
                  true,
                )}
              {uso.hoje &&
                medidorDoDia(
                  t('IA hoje (tradução e tutor)'),
                  numero(uso.hoje.tokensDeLlm.usado),
                  uso.hoje.tokensDeLlm.teto === null
                    ? t('tokens')
                    : t('de {valor}', { valor: numero(uso.hoje.tokensDeLlm.teto) }),
                  uso.hoje.tokensDeLlm,
                  false,
                )}
            </div>
            {pago || selfhost ? (
              <p className="px-nota pl-renova">
                {/* A cor é a do ícone no protótipo (`text-accent`, vindo da captura de produção). */}
                <CalendarClock className="text-accent" aria-hidden />{' '}
                {t('As horas de nuvem voltam no dia 1º. O que roda no aparelho não entra nesta conta.')}
                {diaDoMeuPlano !== null && !uso.hoje
                  ? ` ${t('Por dia, a nuvem por trechos vai até {dia} h.', { dia: numero(diaDoMeuPlano) })}`
                  : ''}
              </p>
            ) : (
              <div className="q-aviso pl-aviso-linha">
                <span>
                  <Lock aria-hidden />
                  <span>
                    {t('As horas de nuvem fazem parte dos planos pagos. A legenda no aparelho continua sem limite.')}
                  </span>
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

const CLASSE_DO_SINAL: Record<Sinal, string> = { 0: 'nao', 1: 'ok', 2: 'meio' };
