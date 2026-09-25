import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  Check,
  CircleAlert,
  CreditCard,
  LoaderCircle,
  Lock,
  QrCode,
  Repeat,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { armazenamentoEmTexto, horasDeTranscricao } from '../../../core/planos';
import { lerAbertura } from '../../../data/rotas/idade';
import {
  type Beneficiario,
  brl,
  carregarStatusDeBilling,
  type Conta,
  definirBeneficiario,
  iniciarAssinatura,
  lerBeneficiario,
  type PlanoPago,
  PLANOS_PAGOS,
  precoMensal,
  type StatusDeBilling,
  temAssinatura,
} from '../../../lib/assinatura';
import { carregarEntitlements, type Plan } from '../../../lib/entitlements';
import { registrarCheckoutIniciado } from '../../../lib/ofertas/instrumentacao';
import { estadoDaProtecao } from '../../../lib/protecaoDoMenor';
import { CabecalhoDeTela, IconeEmBloco, Tela } from '../../ui';
import { irSub, PLANO_ICO, PLANO_NOME } from './dados';
import Etapas, { rolarAoTopo } from './Etapas';

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
 * O QUE O PROTÓTIPO TEM E O APP NÃO: período anual e parcelas (o servidor só cobra por mês), cupom
 * (não há cupom no servidor) e o QR code do Pix dentro do app (ele está na página do Asaas).
 *
 * QUEM PAGA É ADULTO (Fases 3 e 4 do lançamento): conta de menor não chega ao formulário — a tela
 * explica que o responsável assina por ela; o responsável vinculado assina PELO menor
 * (`paraUsuario`, escolhido na tela de aceite do convite). Com `CHECKOUT_ENABLED=0` no servidor, a
 * venda aparece pausada. O servidor confere tudo de novo; aqui é só não oferecer o que ele recusa.
 */

type Metodo = 'cartao' | 'pix' | 'boleto';
type Campo = 'nome' | 'cpf' | 'email';

const mascaraCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

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
  extra: { vendaAberta: boolean; menor: boolean; paraOutro: boolean } = {
    vendaAberta: true,
    menor: false,
    paraOutro: false,
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
  if (plan === 'anonimo')
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
}: {
  plano: PlanoPago;
  aoTrocarPlano: (p: PlanoPago) => void;
  plan: Plan;
  conta: Conta;
  status: StatusDeBilling | null;
}) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [metodo, setMetodo] = useState<Metodo>('cartao');
  const [campos, setCampos] = useState<Record<Campo, string>>({ nome: '', cpf: '', email: '' });
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [ocupado, setOcupado] = useState(false);
  const [erroServidor, setErroServidor] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [vendaAberta, setVendaAberta] = useState(true);
  const [beneficiario, setBeneficiario] = useState<Beneficiario | null>(lerBeneficiario);

  useEffect(() => {
    let vivo = true;
    void lerAbertura().then((a) => {
      if (vivo) setVendaAberta(a.checkout);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const preco = precoMensal(plano);
  const P = PLANO_NOME[plano];
  const protecao = estadoDaProtecao();
  const menor = !!protecao && protecao.faixa !== 'adulto' && protecao.nascimentoInformado;
  const bloqueio = impedimento(plan, conta, status, { vendaAberta, menor, paraOutro: !!beneficiario });
  const assinarParaMim = () => {
    definirBeneficiario(null);
    setBeneficiario(null);
  };

  /* Espera a CONFIRMAÇÃO DO SERVIDOR: o webhook promove o plano quando o Asaas avisa o pagamento. */
  useEffect(() => {
    if (!link) return;
    let vivo = true;
    const id = window.setInterval(() => {
      void carregarStatusDeBilling().then(async (s) => {
        if (!vivo || s?.assinatura?.status !== 'active') return;
        await carregarEntitlements();
        irSub('assinado');
      });
    }, 5000);
    return () => {
      vivo = false;
      window.clearInterval(id);
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
    setOcupado(true);
    const r = await iniciarAssinatura({
      plano,
      nome: campos.nome.trim(),
      cpfCnpj: campos.cpf.replace(/\D/g, ''),
      email: campos.email.trim(),
      ...(beneficiario ? { paraUsuario: beneficiario.id } : {}),
    });
    setOcupado(false);
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
                  {id === 'pro'
                    ? `${horasDeTranscricao('pro')} h de transcrição de nuvem, limite maior de IA, ${armazenamentoEmTexto('pro')}`
                    : `Tradução e ${horasDeTranscricao('essencial')} h de transcrição de nuvem, ${armazenamentoEmTexto('essencial')}`}
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
          <button type="button" className="cartao opcao sel" aria-pressed>
            <span className="radio" aria-hidden />
            <span style={{ flex: 1 }}>
              <h3>Mensal recorrente</h3>
              <p>{brl(preco)} todo mês. Renova sozinho, cancele quando quiser.</p>
            </span>
          </button>
        </div>
      </fieldset>
      <div className="linha" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-solid" onClick={() => irPasso(2)}>
          <ArrowRight aria-hidden /> Ir para o pagamento
        </button>
      </div>
    </section>
  );

  const corpoDoMetodo =
    metodo === 'cartao' ? (
      <p className="nota-seg">
        <Lock aria-hidden /> O número do cartão você digita na página segura do Asaas, que abre quando você continuar. O
        Babel Play não vê nem guarda esses dados.
      </p>
    ) : metodo === 'pix' ? (
      <p className="mut" style={{ fontSize: 13.5 }}>
        O QR code aparece na página segura do Asaas depois que você confirmar. Todo mês chega uma nova cobrança por
        e-mail.
      </p>
    ) : (
      <p className="mut" style={{ fontSize: 13.5 }}>
        O boleto sai na página segura do Asaas e é compensado em até 2 dias úteis depois do pagamento. O acesso ao {P}{' '}
        libera quando o banco confirmar. Todo mês chega um novo boleto por e-mail.
      </p>
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

  const rotuloPagar = link
    ? 'Aguardando o pagamento…'
    : ocupado
      ? 'Processando…'
      : metodo === 'pix'
        ? `Gerar Pix de ${brl(preco)}`
        : metodo === 'boleto'
          ? `Gerar boleto de ${brl(preco)}`
          : `Assinar e pagar ${brl(preco)}`;

  const passo2 = bloqueio ? (
    <section className="cartao p6">
      <div className="vazio">
        <IconeEmBloco icone={plan === 'anonimo' ? UserRound : CreditCard} />
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
      <fieldset className="escolha">
        <legend className="label-mono">Forma de pagamento</legend>
        <div className="seg metodos" role="radiogroup" aria-label="Forma de pagamento">
          {(
            [
              ['cartao', 'Cartão', CreditCard],
              ['pix', 'Pix', QrCode],
              ['boleto', 'Boleto', Barcode],
            ] as const
          ).map(([v, r, I]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={metodo === v}
              disabled={!!link}
              onClick={() => setMetodo(v)}
            >
              <I aria-hidden style={{ width: 15, height: 15 }} /> {r}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="metodo-corpo">{aguardando || corpoDoMetodo}</div>
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
        Ao assinar, você autoriza a cobrança de <b>{brl(preco)}</b> por mês, renovada todo mês até você cancelar.
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
            Mensal recorrente
          </p>
        </div>
      </div>
      <dl className="linhas-preco">
        <div>
          <dt>1 mês</dt>
          <dd className="tn">{brl(preco)}</dd>
        </div>
        <div className="total">
          <dt>Total hoje</dt>
          <dd className="tn">{brl(preco)}</dd>
        </div>
      </dl>
      <p className="mut renova">
        <Repeat aria-hidden style={{ width: 14, height: 14 }} /> Renova todo mês por {brl(preco)}
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
