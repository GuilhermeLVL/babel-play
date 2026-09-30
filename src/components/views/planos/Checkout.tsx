import {
  ArrowLeft,
  ArrowRight,
  CakeSlice,
  Check,
  CircleAlert,
  CreditCard,
  LoaderCircle,
  Lock,
  LogIn,
  Repeat,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { armazenamentoEmTexto, horasDeTranscricao, horasDoUsoJusto } from '../../../core/planos';
import { declararNascimento, ehFalha } from '../../../data/rotas/idade';
import {
  type Beneficiario,
  brl,
  carregarStatusDeBilling,
  cobrancaDaForma,
  type Conta,
  definirBeneficiario,
  type FormaDeAssinar,
  FORMAS_DE_ASSINAR,
  iniciarAssinatura,
  lerBeneficiario,
  parcelasDoAnual,
  type PlanoPago,
  PLANOS_PAGOS,
  precoAnual,
  precoMensal,
  type StatusDeBilling,
  temAssinatura,
} from '../../../lib/assinatura';
import { carregarEntitlements, type Plan } from '../../../lib/entitlements';
import { t } from '../../../lib/i18n';
import { registrarCheckoutIniciado } from '../../../lib/ofertas/instrumentacao';
import { estadoDaProtecao } from '../../../lib/protecaoDoMenor';
import { CabecalhoDeTela, IconeEmBloco, Tela } from '../../ui';
import { irSub, PLANO_ICO, PLANO_NOME } from './dados';
import Etapas, { rolarAoTopo } from './Etapas';
import { entrarParaAssinar, useSemConta, useVendaAberta } from './funil';

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
 * automática). Os preços saem da matriz; as parcelas, da mesma conta que o Asaas faz. A tela de Planos
 * nova, com o seletor Mensal/Anual e o "equivale a 3 meses grátis", é o C7.
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
  extra: { vendaAberta: boolean; menor: boolean; paraOutro: boolean; semConta: boolean } = {
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
      'Para trocar de plano ou de forma de pagamento, use Planos → Sua assinatura.',
    ];
  return null;
}

export default function Checkout({
  plano,
  aoTrocarPlano,
  plan,
  conta,
  status,
  aoEntrar,
}: {
  plano: PlanoPago;
  aoTrocarPlano: (p: PlanoPago) => void;
  plan: Plan;
  conta: Conta;
  status: StatusDeBilling | null;
  /** Abre o login (o mesmo `navigateTo('login')` do menu da conta). */
  aoEntrar?: () => void;
}) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [forma, setForma] = useState<FormaDeAssinar>('mensal');
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
  const bloqueio = impedimento(plan, conta, status, { vendaAberta, menor, paraOutro: !!beneficiario, semConta });
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
    if (!r.link) {
      setErroServidor(r.erro ?? 'A assinatura foi criada, mas o link de pagamento não veio. Tente de novo.');
      return;
    }
    window.open(r.link, '_blank', 'noopener');
    setLink(r.link);
    // Funil das ofertas (Fase 8): anônimo, atribuído à última oferta clicada ou `nenhum`.
    registrarCheckoutIniciado(plano);
  };

  const campo = (k: Campo, rotulo: string, ph: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`form-l ${erros[k] ? 'com-erro' : ''}`}>
      <label htmlFor={`co-${k}`}>{rotulo}</label>
      <input
        className="campo"
        id={`co-${k}`}
        placeholder={ph}
        value={campos[k]}
        onChange={(e) => mudar(k, e.target.value)}
        aria-invalid={erros[k] ? true : undefined}
        aria-describedby={erros[k] ? `e-${k}` : undefined}
        {...extra}
      />
      {erros[k] && (
        <small className="erro" id={`e-${k}`}>
          <CircleAlert aria-hidden /> {erros[k]}
        </small>
      )}
    </div>
  );

  const passo1 = (
    <section className="cartao p6">
      <fieldset className="escolha">
        <legend className="label-mono">Plano</legend>
        <div className="opcoes">
          {PLANOS_PAGOS.map((id) => (
            <button
              key={id}
              type="button"
              className={`cartao opcao ${plano === id ? 'sel' : ''}`}
              aria-pressed={plano === id}
              onClick={() => aoTrocarPlano(id)}
            >
              <span className="radio" aria-hidden />
              <IconeEmBloco icone={PLANO_ICO[id]} />
              <span style={{ flex: 1 }}>
                <h3>{PLANO_NOME[id]}</h3>
                <p>
                  {`Tradução e ${horasDeTranscricao(id)} h de transcrição de nuvem por mês (uso justo de ${horasDoUsoJusto(id)} h por dia), ${armazenamentoEmTexto(id)}`}
                </p>
              </span>
              <b className="tn">
                {brl(precoMensal(id))}
                <small className="mut">/mês</small>
              </b>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="escolha">
        <legend className="label-mono">Como você quer pagar</legend>
        <div className="opcoes">
          {FORMAS_DE_ASSINAR.map((f) => {
            const x = textosDaForma(plano, f);
            return (
              <button
                key={f}
                type="button"
                className={`cartao opcao ${forma === f ? 'sel' : ''}`}
                aria-pressed={forma === f}
                onClick={() => setForma(f)}
              >
                <span className="radio" aria-hidden />
                <span style={{ flex: 1 }}>
                  <h3>{x.titulo}</h3>
                  <p>{x.descricao}</p>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="linha" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-solid" onClick={() => irPasso(2)}>
          <ArrowRight aria-hidden /> Ir para o pagamento
        </button>
      </div>
    </section>
  );

  const aguardando = link && (
    <div className="entra">
      <p className="aguarda">
        <LoaderCircle className="gira" aria-hidden /> Aguardando a confirmação do pagamento…
      </p>
      <p className="mut" style={{ fontSize: 13.5, margin: '4px 0 10px' }}>
        Abrimos a página de pagamento do Asaas numa nova aba. Assim que o pagamento confirmar, o {P} libera sozinho e
        esta tela avança. Boleto pode levar até 2 dias úteis.
      </p>
      <button type="button" className="link" onClick={() => window.open(link, '_blank', 'noopener')}>
        Abrir a página de pagamento de novo
      </button>
    </div>
  );

  const rotuloPagar = link ? 'Aguardando o pagamento…' : ocupado ? 'Processando…' : daForma.pagar;

  const passo2 = bloqueio ? (
    <section className="cartao p6">
      <div className="vazio">
        <IconeEmBloco icone={semConta ? UserRound : CreditCard} />
        <h3>{bloqueio[0]}</h3>
        <p>{bloqueio[1]}</p>
      </div>
      <div className="linha" style={{ justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" onClick={() => irPasso(1)}>
          <ArrowLeft aria-hidden /> Voltar
        </button>
        {temAssinatura(conta.estado) && (
          <button type="button" className="btn btn-solid" onClick={() => irSub('assinatura')}>
            Ver minha assinatura
          </button>
        )}
        {bloqueio[0] === 'Entre na sua conta para assinar' && (
          <button type="button" className="btn btn-solid" onClick={() => entrarParaAssinar(plano, aoEntrar)}>
            <LogIn aria-hidden /> {t('Entrar ou criar conta')}
          </button>
        )}
      </div>
    </section>
  ) : (
    <section className="cartao p6">
      {beneficiario && (
        <p className="aviso-info" style={{ marginBottom: 12 }}>
          <UserRound aria-hidden />
          <span>
            Você está assinando para <b>{beneficiario.nome ?? 'a conta vinculada a você'}</b>, como responsável. O plano
            vale na conta dele.{' '}
            <button type="button" className="link" onClick={assinarParaMim} disabled={!!link}>
              Assinar para mim
            </button>
          </span>
        </p>
      )}
      {/* Sem seletor de forma de pagamento: o servidor cria a cobrança com `billingType: 'UNDEFINED'`
          e é a página do Asaas que pergunta Pix, cartão ou boleto. Um seletor aqui seria enfeite. */}
      <div className="metodo-corpo">
        {aguardando || (
          <>
            <p className="mut" style={{ fontSize: 13.5 }}>
              {t('Você escolhe Pix, cartão ou boleto na página segura do Asaas.')}
            </p>
            <p className="nota-seg">
              <Lock aria-hidden /> O número do cartão você digita na página segura do Asaas, que abre quando você
              continuar. O Babel Play não vê nem guarda esses dados.
            </p>
          </>
        )}
      </div>
      <div className="grid-form" style={{ marginTop: 6 }}>
        {campo('nome', 'Nome completo', 'Como está no documento', { autoComplete: 'name', readOnly: !!link })}
        {campo('cpf', 'CPF', '000.000.000-00', { inputMode: 'numeric', maxLength: 14, readOnly: !!link })}
        {campo('email', 'E-mail para o recibo', 'voce@exemplo.com', {
          type: 'email',
          autoComplete: 'email',
          readOnly: !!link,
        })}
      </div>
      <p className="mut" style={{ fontSize: 12, marginTop: -6 }}>
        O CPF é exigido para emitir a cobrança. Ele vai direto para o processador de pagamento, não fica no nosso banco.
      </p>
      {pedirIdade && (
        <div className="entra" style={{ marginTop: 12 }}>
          <p className="aviso-info">
            <CakeSlice aria-hidden />
            <span>
              {t(
                'Antes de pagar, falta a sua data de nascimento. Pedimos uma vez só: quem assina precisa ter 18 anos ou mais. Depois de confirmada, a data só muda pelo suporte.',
              )}
            </span>
          </p>
          <div className={`form-l ${erroIdade ? 'com-erro' : ''}`} style={{ marginTop: 10 }}>
            <label htmlFor="co-nascimento">{t('Data de nascimento')}</label>
            <input
              ref={campoDaIdade}
              className="campo"
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
              <small className="erro" id="e-nascimento">
                <CircleAlert aria-hidden /> {erroIdade}
              </small>
            )}
          </div>
        </div>
      )}
      {erroServidor && (
        <p className="erro-auth" role="alert">
          <CircleAlert aria-hidden /> {erroServidor}
        </p>
      )}
      <div className="linha" style={{ justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" onClick={() => irPasso(1)} disabled={!!link}>
          <ArrowLeft aria-hidden /> Voltar
        </button>
        <button
          type="button"
          className="btn btn-solid grande"
          onClick={() => void pagar()}
          disabled={ocupado || !!link}
        >
          {ocupado || link ? <LoaderCircle className="gira" aria-hidden /> : <Lock aria-hidden />} {rotuloPagar}
        </button>
      </div>
      <p className="legal">
        {/* O que cada forma AUTORIZA. Depois dos 7 dias, o anual e o 12x não devolvem o proporcional do
            ano: é o padrão que o dono aprovou para o C5, a validar com o jurídico (C9). */}
        {forma === 'mensal' ? (
          <>
            Ao assinar, você autoriza a cobrança de <b>{brl(preco)}</b> por mês, renovada todo mês até você cancelar.
          </>
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
        Cancele quando quiser em Planos → Sua assinatura. Você tem <b>7 dias</b> para desistir com reembolso integral
        (CDC, art. 49). Veja os{' '}
        <a className="link" href="/termos.html" target="_blank" rel="noopener">
          Termos de uso
        </a>
        .
      </p>
    </section>
  );

  const resumo = (
    <aside className="cartao p6 resumo-pedido" aria-label="Resumo do pedido">
      <span className="label-mono">Resumo</span>
      <div className="linha" style={{ gap: 12, marginTop: 10 }}>
        <IconeEmBloco icone={PLANO_ICO[plano]} />
        <div>
          <b style={{ font: '800 17px var(--font-display)' }}>Babel Play {P}</b>
          <p className="mut" style={{ fontSize: 13 }}>
            {daForma.titulo}
          </p>
        </div>
      </div>
      <dl className="linhas-preco">
        <div>
          <dt>{daForma.linha[0]}</dt>
          <dd className="tn">{daForma.linha[1]}</dd>
        </div>
        {forma === 'anual_12x' ? (
          <div className="total">
            <dt>{t('Por mês no cartão')}</dt>
            <dd className="tn">{brl(parcelasDoAnual(plano).padrao)}</dd>
          </div>
        ) : (
          <div className="total">
            <dt>Total hoje</dt>
            <dd className="tn">{daForma.linha[1]}</dd>
          </div>
        )}
      </dl>
      <p className="mut renova">
        <Repeat aria-hidden style={{ width: 14, height: 14 }} /> {daForma.renova}
      </p>
      {/* No lugar do cupom do protótipo (não há cupom no servidor): onde o pagamento acontece. */}
      <div className="cupom">
        <p className="mut renova">
          <Lock aria-hidden style={{ width: 14, height: 14 }} /> Você paga na página segura do Asaas
        </p>
      </div>
      <ul className="lista-check garantias">
        {[
          '7 dias para desistir, com reembolso',
          'Cancele quando quiser, em poucos cliques',
          'Pagamento processado com segurança',
        ].map((x) => (
          <li key={x}>
            <Check aria-hidden />
            {x}
          </li>
        ))}
      </ul>
    </aside>
  );

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        voltar={{ rotulo: 'Planos', aoClicar: () => irSub(null) }}
        sobrancelha="Assinatura"
        icone={Lock}
        titulo={`Assinar o ${P}`}
        sub="Dois passos. Você vê o total e como a cobrança se renova antes de pagar."
      />
      <Etapas passos={['Plano e período', 'Pagamento']} atual={passo - 1} />
      <div className="checkout-grade">
        <div>{passo === 1 ? passo1 : passo2}</div>
        {resumo}
      </div>
    </Tela>
  );
}
