import '../../../styles/questConta.css';

import {
  ArrowLeft,
  ArrowRight,
  CakeSlice,
  Check,
  CircleAlert,
  CreditCard,
  ExternalLink,
  Hourglass,
  LoaderCircle,
  Lock,
  LogIn,
  Repeat,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { horasDeTranscricao, horasDoUsoJusto, PLAN_MATRIX } from '../../../core/planos';
import { declararNascimento, ehFalha } from '../../../data/rotas/idade';
import {
  type Beneficiario,
  brl,
  carregarStatusDeBilling,
  cobrancaDaForma,
  type Conta,
  dataCurta,
  definirBeneficiario,
  economiaDoAnual,
  type FormaDeAssinar,
  FORMAS_DE_ASSINAR,
  iniciarAssinatura,
  iniciarTeste,
  lerBeneficiario,
  parcelasDoAnual,
  type PlanoPago,
  PLANOS_PAGOS,
  precoAnual,
  precoMensal,
  type SituacaoDoTeste,
  type StatusDeBilling,
  temAssinatura,
} from '../../../lib/assinatura';
import { carregarEntitlements, type Plan } from '../../../lib/entitlements';
import { t } from '../../../lib/i18n';
import { registrarCheckoutIniciado } from '../../../lib/ofertas/instrumentacao';
import { estadoDaProtecao } from '../../../lib/protecaoDoMenor';
import { T } from '../../../lib/T';
import { irSub, PLANO_ICO, PLANO_NOME } from './dados';
import Etapas, { rolarAoTopo } from './Etapas';
import { entrarParaAssinar, useAnualAVenda, useSemConta, useVendaAberta } from './funil';
import { resumoDoPlano } from './quatroPlanos';

/**
 * CHECKOUT — `T.checkout` do protótipo aprovado: dois passos, com o resumo sempre visível.
 *
 * ESTA TELA É O PASSO ANTES DO PAGAMENTO, NÃO O PAGAMENTO. O dinheiro continua no fluxo real que
 * já existia: `POST /api/billing/assinar` cria a assinatura no Asaas e devolve o link da página de
 * pagamento, que abre numa nova aba — é ali que se escolhe Pix, boleto ou cartão e se digita o
 * cartão. O app não vê número de cartão. Quem concede o plano é o webhook, quando o Asaas confirma;
 * esta tela só ESPERA essa confirmação perguntando ao servidor (`/api/billing/status`) e, quando
 * ela chega, leva à confirmação. Nada aqui confia em parâmetro de URL.
 *
 * O PERÍODO (C5, change `planos-v2`): mensal recorrente, anual em uma vez (assinatura `YEARLY`, Pix,
 * boleto ou cartão, renova em um ano) e anual em 12x no cartão (parcelamento, sem renovação
 * automática). Os preços saem da matriz; as parcelas, da mesma conta que o Asaas faz. O checkout abre
 * na forma do período escolhido no seletor Mensal/Anual da tela de Planos (C7, `formaInicial`).
 *
 * O QUE O PROTÓTIPO TEM E O APP NÃO: cupom (não há cupom no servidor) e o QR code do Pix dentro do
 * app (ele está na página do Asaas).
 *
 * QUEM PAGA É ADULTO (Fases 3 e 4 do lançamento): conta de menor não chega ao formulário — a tela
 * explica que o responsável assina por ela; o responsável vinculado assina PELO menor
 * (`paraUsuario`, escolhido na tela de aceite do convite). Com `CHECKOUT_ENABLED=0` no servidor, a
 * venda aparece pausada. O servidor confere tudo de novo; aqui é só não oferecer o que ele recusa.
 *
 * O FUNIL (teste de ponta a ponta com o Asaas sandbox, 2026-09-29): sem conta, a tela pede para
 * entrar e guarda a intenção; a forma de pagamento NÃO se escolhe aqui (o servidor manda
 * `UNDEFINED` e o Asaas pergunta); voltar da aba do Asaas confere o status na hora; e a data de
 * nascimento que faltar (403 `idade_nao_informada`) é pedida ali mesmo, sem modal.
 */

type Campo = 'nome' | 'cpf' | 'email';

const mascaraCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

/** O nome, a linha de preço e a frase de renovação de cada forma de pagar — da matriz, nunca à mão. */
function textosDaForma(plano: PlanoPago, f: FormaDeAssinar) {
  const { padrao, ultima, quantidade } = parcelasDoAnual(plano);
  if (f === 'mensal') {
    const preco = brl(precoMensal(plano));
    return {
      titulo: t('Mensal recorrente'),
      descricao: t('{preco} todo mês. Renova sozinho, cancele quando quiser.', { preco }),
      renova: t('Renova todo mês por {preco}', { preco }),
      linha: [t('1 mês'), preco] as const,
      pagar: t('Assinar e pagar {valor}', { valor: preco }),
    };
  }
  const total = brl(precoAnual(plano));
  if (f === 'anual')
    return {
      titulo: t('Anual em uma vez'),
      descricao: t(
        '{preco} por ano, no Pix, no boleto ou no cartão. Renova sozinho em um ano; cancele quando quiser.',
        {
          preco: total,
        },
      ),
      renova: t('Renova em um ano por {preco}', { preco: total }),
      linha: [t('1 ano'), total] as const,
      pagar: t('Assinar e pagar {valor}', { valor: total }),
    };
  return {
    titulo: t('Anual em 12x no cartão'),
    descricao: t(
      '{n} parcelas no cartão: {m} de {parcela} e a última de {ultima} (total {total}). Não renova sozinho: daqui a um ano você escolhe de novo.',
      { n: quantidade, m: quantidade - 1, parcela: brl(padrao), ultima: brl(ultima), total },
    ),
    renova: t('Não renova sozinho: o ano acaba na última parcela'),
    linha: [t('1 ano em {n} parcelas', { n: quantidade }), total] as const,
    pagar: t('Assinar e pagar em {n}x de {parcela}', { n: quantidade, parcela: brl(padrao) }),
  };
}

/**
 * O TESTE DE 14 DIAS, COM UM TOQUE (C6) — sem nome, CPF nem cartão: nada é cobrado, nem no fim. Só
 * aparece quando o SERVIDOR diz que dá (`teste.estado: 'disponivel'`), ou quando o responsável escolheu
 * o menor vinculado (ele ativa por ele; o servidor confere o vínculo). O perfil protegido recebe o
 * caminho do responsável, não o botão. O destaque do teste é o cartão do Premium na tela de Planos
 * (C7); aqui ele continua para quem chega direto ao checkout.
 */
function TesteDoPremium({ teste, beneficiario }: { teste?: SituacaoDoTeste; beneficiario: Beneficiario | null }) {
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  if (!teste) return null;
  const dias = teste.dias;
  const aviso = { className: 'q-aviso' };

  const comecar = async () => {
    setOcupado(true);
    setErro('');
    const r = await iniciarTeste(beneficiario?.id);
    setOcupado(false);
    if (r.terminaEm === null) {
      setErro(r.erro ?? t('Não consegui começar o teste agora. Tente de novo.'));
      return;
    }
    setFeito(r.terminaEm);
    await carregarEntitlements();
  };

  if (feito !== null)
    return (
      <p {...aviso} role="status">
        <Hourglass aria-hidden />
        <span>
          {t('Pronto: o Premium vale até {data}. No fim a conta volta ao Grátis sozinha, e nada é cobrado.', {
            data: dataCurta(feito),
          })}
        </span>
      </p>
    );

  if (!beneficiario && teste.estado === 'ativo')
    return (
      <p {...aviso}>
        <Hourglass aria-hidden />
        <span>
          {t('Seu teste do Premium vale até {data}. No fim, nada é cobrado.', { data: dataCurta(teste.terminaEm) })}
        </span>
      </p>
    );

  if (!beneficiario && teste.estado === 'indisponivel' && teste.motivo === 'perfil_protegido')
    return (
      <p {...aviso}>
        <UserRound aria-hidden />
        <span>
          {t(
            'Quer testar o Premium? Peça ao seu responsável: pela conta dele, vinculada à sua, ele ativa o teste de {dias} dias para você.',
            { dias },
          )}
        </span>
      </p>
    );

  if (!beneficiario && teste.estado !== 'disponivel') return null;

  return (
    <div {...aviso}>
      <Hourglass aria-hidden />
      <span>
        {beneficiario
          ? t(
              'Teste o Premium na conta de {nome} por {dias} dias, sem cartão. No fim ela volta ao Grátis: nada é cobrado.',
              {
                nome: beneficiario.nome ?? t('quem está vinculado a você'),
                dias,
              },
            )
          : t(
              'Ou teste o Premium por {dias} dias, sem cartão. No fim a conta volta ao Grátis sozinha: nada é cobrado.',
              {
                dias,
              },
            )}
        {erro && (
          <small className="qc-erro-miudo" role="alert">
            <CircleAlert aria-hidden /> {erro}
          </small>
        )}
      </span>
      <button type="button" className="q-ctl" onClick={() => void comecar()} disabled={ocupado}>
        {ocupado ? <LoaderCircle className="qc-gira" aria-hidden /> : <Hourglass aria-hidden />}{' '}
        {beneficiario
          ? t('Ativar o teste de {dias} dias para {nome}', {
              dias,
              nome: beneficiario.nome ?? t('a conta vinculada'),
            })
          : t('Testar {dias} dias grátis', { dias })}
      </button>
    </div>
  );
}

function validar(c: Record<Campo, string>): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  if (c.nome.trim().length < 2) e.nome = 'Escreva o seu nome completo.';
  if (c.cpf.replace(/\D/g, '').length !== 11) e.cpf = 'O CPF tem 11 dígitos.';
  if (!/^\S+@\S+\.\S+$/.test(c.email)) e.email = 'Confira o e-mail.';
  return e;
}

/** Por que não dá para pagar aqui — cada caso com a sua frase. `null` = dá. */
function impedimento(
  plan: Plan,
  conta: Conta,
  status: StatusDeBilling | null,
  extra: { vendaAberta: boolean; menor: boolean; paraOutro: boolean; semConta: boolean; anualAVenda?: boolean } = {
    vendaAberta: true,
    menor: false,
    paraOutro: false,
    semConta: plan === 'anonimo',
  },
): [string, string] | null {
  if (!extra.vendaAberta)
    return [
      'As assinaturas estão pausadas',
      'As assinaturas e compras estão pausadas temporariamente. Quem já assina continua com tudo; tente de novo mais tarde.',
    ];
  if (extra.menor)
    return [
      'Quem assina é o seu responsável',
      'Contas de menores de 18 anos não fazem compras. Peça ao seu responsável: pela conta dele, vinculada à sua, ele assina por você.',
    ];
  if (conta.estado === 'selfhost')
    return [
      'Nada a pagar no self-host',
      'O app roda no seu computador e já está tudo liberado. Os planos são para usar na nuvem.',
    ];
  if (extra.semConta)
    return ['Entre na sua conta para assinar', 'A assinatura fica na sua conta: é ela que o pagamento libera.'];
  if (!status?.configurado)
    return [
      'Nesta instalação não há cobrança',
      'Sem cobrança configurada no servidor, não existe o que pagar aqui. O Grátis é o app inteiro.',
    ];
  if (temAssinatura(conta.estado) && !extra.paraOutro)
    return [
      'Você já tem uma assinatura',
      extra.anualAVenda === false
        ? t('Para ver ou mudar a sua assinatura, abra Planos → Sua assinatura.')
        : t(
            'Para passar do mensal para o anual (ou o contrário), veja Planos → Sua assinatura: a troca é no fim do período, sem pagar duas vezes.',
          ),
    ];
  return null;
}

export default function Checkout({
  plano,
  planos = PLANOS_PAGOS,
  aoTrocarPlano,
  formaInicial = 'mensal',
  plan,
  conta,
  status,
  aoEntrar,
}: {
  plano: PlanoPago;
  /** Os planos que o seletor oferece: os À VENDA para esta conta (planos v3). Sem dizer, só o Premium. */
  planos?: readonly PlanoPago[];
  aoTrocarPlano: (p: PlanoPago) => void;
  /** O período escolhido na tela de Planos (C7): o anual abre no anual em uma vez. */
  formaInicial?: FormaDeAssinar;
  plan: Plan;
  conta: Conta;
  status: StatusDeBilling | null;
  /** Abre o login (o mesmo `navigateTo('login')` do menu da conta). */
  aoEntrar?: () => void;
}) {
  const [passo, setPasso] = useState<1 | 2>(1);
  /* `ANUAL_ENABLED=0` (o MVP vende só o mensal): as formas do anual somem, e quem chegou com o anual
     escolhido (a aba lembra) paga o mensal. O servidor recusa o anual de todo jeito (503
     `anual_indisponivel`): essa recusa também vale como "desligado" aqui. */
  const anualNoCliente = useAnualAVenda();
  const [anualRecusado, setAnualRecusado] = useState(false);
  /* Plano sem preço de ano na matriz (o Ao Vivo, só mensal no início): não há anual para escolher. */
  const anualAVenda = anualNoCliente && !anualRecusado && PLAN_MATRIX[plano].precoAnualBrl !== null;
  const [formaEscolhida, setForma] = useState<FormaDeAssinar>(formaInicial);
  const forma: FormaDeAssinar = anualAVenda ? formaEscolhida : 'mensal';
  const formas: readonly FormaDeAssinar[] = anualAVenda ? FORMAS_DE_ASSINAR : ['mensal'];
  const [campos, setCampos] = useState<Record<Campo, string>>({ nome: '', cpf: '', email: '' });
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [ocupado, setOcupado] = useState(false);
  const [erroServidor, setErroServidor] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [beneficiario, setBeneficiario] = useState<Beneficiario | null>(lerBeneficiario);
  /* O servidor tem a última palavra: 503 `checkout_desligado` pausa a venda e 403 `menor_nao_compra`
     mostra o responsável, mesmo que o cliente ainda não soubesse. */
  const vendaAbertaNoCliente = useVendaAberta();
  const [recusa, setRecusa] = useState<'pausada' | 'menor' | null>(null);
  const semConta = useSemConta(plan);
  /* A IDADE ALI MESMO: `pedirIdade` abre o campo quando o servidor responde 403
     `idade_nao_informada`; o próximo clique declara a data e tenta de novo. */
  const [pedirIdade, setPedirIdade] = useState(false);
  const [nascimento, setNascimento] = useState('');
  const [erroIdade, setErroIdade] = useState('');
  const [protecao, setProtecao] = useState(estadoDaProtecao);
  const campoDaIdade = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pedirIdade) campoDaIdade.current?.focus();
  }, [pedirIdade]);

  const preco = precoMensal(plano);
  const daForma = textosDaForma(plano, forma);
  const P = PLANO_NOME[plano];
  const menor = recusa === 'menor' || (!!protecao && protecao.faixa !== 'adulto' && protecao.nascimentoInformado);
  const vendaAberta = vendaAbertaNoCliente && recusa !== 'pausada';
  const bloqueio = impedimento(plan, conta, status, {
    vendaAberta,
    menor,
    paraOutro: !!beneficiario,
    semConta,
    anualAVenda,
  });
  const assinarParaMim = () => {
    definirBeneficiario(null);
    setBeneficiario(null);
  };

  /* Espera a CONFIRMAÇÃO DO SERVIDOR: o webhook promove o plano quando o Asaas avisa o pagamento.
     Pergunta a cada 5 s e, também, NA HORA em que a pessoa volta da aba do Asaas (foco ou aba
     visível) — é quando ela acabou de pagar e espera ver a tela andar. */
  useEffect(() => {
    if (!link) return;
    let vivo = true;
    let foi = false;
    const conferir = () => {
      void carregarStatusDeBilling().then(async (s) => {
        if (!vivo || foi || s?.assinatura?.status !== 'active') return;
        foi = true;
        await carregarEntitlements();
        irSub('assinado');
      });
    };
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') conferir();
    };
    const id = window.setInterval(conferir, 5000);
    window.addEventListener('focus', aoVoltar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      window.clearInterval(id);
      window.removeEventListener('focus', aoVoltar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [link]);

  const irPasso = (n: 1 | 2) => {
    setPasso(n);
    rolarAoTopo();
  };

  const mudar = (k: Campo, v: string) => {
    setCampos((c) => ({ ...c, [k]: k === 'cpf' ? mascaraCpf(v) : v }));
    if (erros[k]) setErros((e) => ({ ...e, [k]: undefined }));
  };

  const pagar = async () => {
    const e = validar(campos);
    setErros(e);
    if (Object.keys(e).length) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setErroServidor('');
    if (pedirIdade) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
        setErroIdade(t('Escolha a sua data de nascimento.'));
        campoDaIdade.current?.focus();
        return;
      }
      setErroIdade('');
      setOcupado(true);
      const d = await declararNascimento(nascimento);
      if (ehFalha(d) && d.code !== 'nascimento_ja_informado') {
        setOcupado(false);
        setErroIdade(
          d.code === 'nascimento_invalido'
            ? t('Essa data não parece certa. Confira o dia, o mês e o ano.')
            : t('Não consegui salvar a data agora ({erro}). Tente de novo.', { erro: d.error }),
        );
        return;
      }
      setPedirIdade(false);
      if (!ehFalha(d)) {
        setProtecao(d.estado);
        // Menor de 18: a tela troca para "quem assina é o seu responsável" e não tenta pagar.
        if (d.estado.faixa !== 'adulto') {
          setOcupado(false);
          return;
        }
      }
    }
    setOcupado(true);
    const r = await iniciarAssinatura({
      plano,
      nome: campos.nome.trim(),
      cpfCnpj: campos.cpf.replace(/\D/g, ''),
      email: campos.email.trim(),
      ...(beneficiario ? { paraUsuario: beneficiario.id } : {}),
      ...cobrancaDaForma(forma),
    });
    setOcupado(false);
    if (r.codigo === 'idade_nao_informada') {
      setPedirIdade(true);
      return;
    }
    if (r.codigo === 'checkout_desligado' || r.codigo === 'menor_nao_compra') {
      setRecusa(r.codigo === 'checkout_desligado' ? 'pausada' : 'menor');
      return;
    }
    /* O servidor desligou o anual depois que a tela abriu: a forma volta ao mensal, e a frase dele
       ("O plano anual ainda não está à venda. Você pode assinar o mensal.") fica à vista. */
    if (r.codigo === 'anual_indisponivel') setAnualRecusado(true);
    if (!r.link) {
      setErroServidor(r.erro ?? 'A assinatura foi criada, mas o link de pagamento não veio. Tente de novo.');
      return;
    }
    window.open(r.link, '_blank', 'noopener');
    setLink(r.link);
    // Funil das ofertas (Fase 8): anônimo, atribuído à última oferta clicada ou `nenhum`.
    registrarCheckoutIniciado(plano);
  };

  /* ── QUEST ─────────────────────────────────────────────────────────────────────────────────────
     Os mesmos dois passos e o mesmo resumo, no desenho do headset: cada escolha é um cartão-alvo, os
     campos têm 60 px (o teclado do sistema sobe no foco) e há UM botão principal por passo. Nada de
     cobrança muda: `pagar`, `irPasso`, a espera pela confirmação e as recusas são os de cima. */
  const campoDoQuest = (
    k: Campo,
    rotulo: string,
    ph: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
    inteiro = false,
  ) => (
    <div className={inteiro ? 'q-campo qc-inteiro' : 'q-campo'}>
      <label htmlFor={`co-${k}`}>{rotulo}</label>
      <input
        id={`co-${k}`}
        placeholder={ph}
        value={campos[k]}
        onChange={(e) => mudar(k, e.target.value)}
        aria-invalid={erros[k] ? true : undefined}
        aria-describedby={erros[k] ? `e-${k}` : undefined}
        {...extra}
      />
      {erros[k] && (
        <small className="qc-campo-erro" id={`e-${k}`}>
          <CircleAlert aria-hidden /> {erros[k]}
        </small>
      )}
    </div>
  );

  const passo1DoQuest = (
    <section className="q-cartao" aria-label={t('Plano e período')}>
      <TesteDoPremium teste={status?.teste} beneficiario={beneficiario} />
      <fieldset className="qc-escolha">
        <legend>{t('Plano')}</legend>
        <div className="qc-opcoes">
          {(planos.includes(plano) ? planos : [...planos, plano]).map((id) => {
            const IconeDoPlano = PLANO_ICO[id];
            return (
              <button
                key={id}
                type="button"
                className="qc-opcao"
                aria-pressed={plano === id}
                onClick={() => aoTrocarPlano(id)}
              >
                <span className="qc-bolinha" aria-hidden />
                <span className="q-ic">
                  <IconeDoPlano aria-hidden />
                </span>
                <span>
                  <b>{PLANO_NOME[id]}</b>
                  {/* O "sem limite" com a nota do uso justo AO LADO (CDC), o dia e o mês das quotas. */}
                  <small>
                    {/* planos-v3: os planos novos dizem o que têm pelas linhas do cartão de Planos (da matriz). */}
                    {id === 'premium'
                      ? t(
                          'Tradução Nuance e nuvem sem limite no dia a dia (uso justo: até {dia} h de nuvem por dia e {mes} h por mês; passando disso, a legenda segue no aparelho)',
                          {
                            dia: horasDoUsoJusto(id) ?? 0,
                            mes: horasDeTranscricao(id) ?? 0,
                          },
                        )
                      : resumoDoPlano(id)}
                  </small>
                </span>
                <span className="qc-valor">
                  {forma === 'mensal' ? brl(precoMensal(id)) : brl(precoAnual(id))}
                  <small>{forma === 'mensal' ? t('/mês') : t('/ano')}</small>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="qc-escolha">
        <legend>{t('Como você quer pagar')}</legend>
        <div className="qc-opcoes">
          {formas.map((f) => {
            const x = textosDaForma(plano, f);
            return (
              <button key={f} type="button" className="qc-opcao" aria-pressed={forma === f} onClick={() => setForma(f)}>
                <span className="qc-bolinha" aria-hidden />
                <span>
                  <b>
                    {x.titulo}
                    {f !== 'mensal' && (
                      <span className="q-tag qc-bom">
                        {t('equivale a {n} meses grátis', { n: economiaDoAnual(plano).meses })}
                      </span>
                    )}
                  </b>
                  <small>{x.descricao}</small>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="qc-pe">
        <button type="button" className="q-ctl pri" onClick={() => irPasso(2)}>
          {t('Ir para o pagamento')} <ArrowRight aria-hidden />
        </button>
      </div>
    </section>
  );

  const IconeDoBloqueio = semConta ? UserRound : CreditCard;
  const passo2DoQuest = bloqueio ? (
    <section className="q-cartao" aria-label={t('Pagamento')}>
      <div className="q-vazio">
        <span className="q-ic">
          <IconeDoBloqueio aria-hidden />
        </span>
        <h3>{t(bloqueio[0])}</h3>
        <p>{t(bloqueio[1])}</p>
      </div>
      <div className="qc-pe">
        <button type="button" className="q-ctl" onClick={() => irPasso(1)}>
          <ArrowLeft aria-hidden /> {t('Voltar')}
        </button>
        <span className="q-espaco" />
        {temAssinatura(conta.estado) && (
          <button type="button" className="q-ctl pri" onClick={() => irSub('assinatura')}>
            {t('Ver minha assinatura')}
          </button>
        )}
        {bloqueio[0] === 'Entre na sua conta para assinar' && (
          <button type="button" className="q-ctl pri" onClick={() => entrarParaAssinar(plano, aoEntrar)}>
            <LogIn aria-hidden /> {t('Entrar ou criar conta')}
          </button>
        )}
      </div>
    </section>
  ) : (
    <section className="q-cartao" aria-label={t('Pagamento')}>
      {beneficiario && (
        <div className="q-aviso">
          <UserRound aria-hidden />
          <span>
            <T
              txt="Você está assinando para <b>{nome}</b>, como responsável. O plano vale na conta dele."
              val={{ nome: beneficiario.nome ?? t('a conta vinculada a você') }}
            />
          </span>
          <button type="button" className="q-ctl" onClick={assinarParaMim} disabled={!!link}>
            {t('Assinar para mim')}
          </button>
        </div>
      )}
      {/* Sem seletor de forma de pagamento: é a página do Asaas que pergunta Pix, cartão ou boleto. */}
      {link ? (
        <div className="q-cartao fundo" role="status">
          <div className="qc-consumo-titulo">
            <LoaderCircle className="qc-gira" aria-hidden />
            <h3>{t('Aguardando a confirmação do pagamento…')}</h3>
          </div>
          <p className="q-texto">
            {t(
              'Abrimos a página de pagamento do Asaas numa nova aba. Assim que o pagamento confirmar, o {plano} libera sozinho e esta tela avança. Boleto pode levar até 2 dias úteis.',
              { plano: P },
            )}
          </p>
          <div className="q-acoes">
            <button type="button" className="q-ctl" onClick={() => window.open(link, '_blank', 'noopener')}>
              <ExternalLink aria-hidden /> {t('Abrir a página de pagamento de novo')}
            </button>
          </div>
        </div>
      ) : (
        <div className="qc-grupo">
          <p className="q-texto">{t('Você escolhe Pix, cartão ou boleto na página segura do Asaas.')}</p>
          <p className="qc-nota">
            <Lock aria-hidden />
            {t(
              'O número do cartão você digita na página segura do Asaas, que abre quando você continuar. O Babel Play não vê nem guarda esses dados.',
            )}
          </p>
        </div>
      )}
      <div className="qc-form">
        {campoDoQuest(
          'nome',
          t('Nome completo'),
          t('Como está no documento'),
          { autoComplete: 'name', readOnly: !!link },
          true,
        )}
        {campoDoQuest('cpf', t('CPF'), '000.000.000-00', {
          inputMode: 'numeric',
          maxLength: 14,
          readOnly: !!link,
        })}
        {campoDoQuest('email', t('E-mail para o recibo'), t('voce@exemplo.com'), {
          type: 'email',
          autoComplete: 'email',
          readOnly: !!link,
        })}
      </div>
      <p className="qc-nota">
        {t(
          'O CPF é exigido para emitir a cobrança. Ele vai direto para o processador de pagamento, não fica no nosso banco.',
        )}
      </p>
      {pedirIdade && (
        <>
          <div className="q-aviso">
            <CakeSlice aria-hidden />
            <span>
              {t(
                'Antes de pagar, falta a sua data de nascimento. Pedimos uma vez só: quem assina precisa ter 18 anos ou mais. Depois de confirmada, a data só muda pelo suporte.',
              )}
            </span>
          </div>
          <div className="q-campo">
            <label htmlFor="co-nascimento">{t('Data de nascimento')}</label>
            <input
              ref={campoDaIdade}
              id="co-nascimento"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={nascimento}
              onChange={(e) => {
                setNascimento(e.target.value);
                if (erroIdade) setErroIdade('');
              }}
              aria-invalid={erroIdade ? true : undefined}
              aria-describedby={erroIdade ? 'e-nascimento' : undefined}
            />
            {erroIdade && (
              <small className="qc-campo-erro" id="e-nascimento">
                <CircleAlert aria-hidden /> {erroIdade}
              </small>
            )}
          </div>
        </>
      )}
      {erroServidor && (
        <p className="qc-erro" role="alert">
          <CircleAlert aria-hidden />
          <span>{erroServidor}</span>
        </p>
      )}
      <div className="qc-pe">
        <button type="button" className="q-ctl" onClick={() => irPasso(1)} disabled={!!link}>
          <ArrowLeft aria-hidden /> {t('Voltar')}
        </button>
        <span className="q-espaco" />
        <button type="button" className="q-ctl pri" onClick={() => void pagar()} disabled={ocupado || !!link}>
          {ocupado || link ? <LoaderCircle className="qc-gira" aria-hidden /> : <Lock aria-hidden />}{' '}
          {link ? t('Aguardando o pagamento…') : ocupado ? t('Processando…') : daForma.pagar}
        </button>
      </div>
      <p className="qc-legal">
        {/* O que cada forma AUTORIZA: os mesmos três textos da tela de sempre. */}
        {forma === 'mensal' ? (
          <T
            txt="Ao assinar, você autoriza a cobrança de <b>{preco}</b> por mês, renovada todo mês até você cancelar."
            val={{ preco: brl(preco) }}
          />
        ) : forma === 'anual' ? (
          t(
            'Ao assinar, você autoriza a cobrança de {preco} por ano, renovada todo ano até você cancelar. Depois dos 7 dias, cancelar para a renovação e o acesso vale até o fim do ano pago, sem reembolso proporcional.',
            { preco: brl(precoAnual(plano)) },
          )
        ) : (
          t(
            'Ao assinar, você autoriza {n} parcelas no cartão, no total de {total}, sem renovação automática. Depois dos 7 dias, cancelar não interrompe as parcelas: o acesso vale até o fim do ano pago, sem reembolso proporcional.',
            { n: parcelasDoAnual(plano).quantidade, total: brl(precoAnual(plano)) },
          )
        )}{' '}
        <T
          txt="Cancele quando quiser em Planos → Sua assinatura. Você tem <b>7 dias</b> para desistir com reembolso integral (CDC, art. 49). Veja os <termos>Termos de uso</termos>."
          tags={{ termos: <a href="/termos.html" target="_blank" rel="noopener" /> }}
        />
      </p>
    </section>
  );

  const IconeDoResumo = PLANO_ICO[plano];
  return (
    <div className="q-palco qc" data-testid="checkout-do-quest">
      <header className="q-cab">
        <button
          type="button"
          className="q-ctl q-voltar"
          aria-label={t('Voltar para Planos')}
          onClick={() => irSub(null)}
        >
          <ArrowLeft aria-hidden /> {t('Planos')}
        </button>
        <div>
          <p className="q-sobre">{t('Assinatura')}</p>
          <h1>{t('Assinar o {plano}', { plano: P })}</h1>
          <p className="qc-sub">{t('Dois passos. Você vê o total e como a cobrança se renova antes de pagar.')}</p>
        </div>
      </header>
      <Etapas passos={['Plano e período', 'Pagamento']} atual={passo - 1} />
      <div className="qc-checkout">
        {passo === 1 ? passo1DoQuest : passo2DoQuest}
        <aside className="q-cartao qc-resumo" aria-label={t('Resumo do pedido')}>
          <span className="q-rotulo">{t('Resumo')}</span>
          <div className="qc-resumo-plano">
            <span className="q-ic">
              <IconeDoResumo aria-hidden />
            </span>
            <div>
              <b>Babel Play {P}</b>
              <small>{daForma.titulo}</small>
            </div>
          </div>
          <dl className="qc-dados">
            <div>
              <dt>{daForma.linha[0]}</dt>
              <dd>{daForma.linha[1]}</dd>
            </div>
            {forma === 'anual_12x' ? (
              <div className="qc-total">
                <dt>{t('Por mês no cartão')}</dt>
                <dd>{brl(parcelasDoAnual(plano).padrao)}</dd>
              </div>
            ) : (
              <div className="qc-total">
                <dt>{t('Total hoje')}</dt>
                <dd>{daForma.linha[1]}</dd>
              </div>
            )}
          </dl>
          <p className="qc-nota">
            <Repeat aria-hidden />
            {daForma.renova}
          </p>
          {/* No lugar do cupom do protótipo (não há cupom no servidor): onde o pagamento acontece. */}
          <p className="qc-nota">
            <Lock aria-hidden />
            {t('Você paga na página segura do Asaas')}
          </p>
          <ul className="qc-lista">
            {[
              t('7 dias para desistir, com reembolso'),
              t('Cancele quando quiser, em poucos cliques'),
              t('Pagamento processado com segurança'),
            ].map((x) => (
              <li key={x}>
                <Check aria-hidden />
                {x}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
