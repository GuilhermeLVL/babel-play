import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarX,
  Check,
  ChevronRight,
  CircleAlert,
  CirclePause,
  LifeBuoy,
  type LucideIcon,
  RotateCcw,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { brl, cancelarRenovacao, type Conta, dataCurta, type Fatura, precoMensal } from '../../../lib/assinatura';
import { navegarPara } from '../../../lib/rotas';
import { CabecalhoDeTela, IconeEmBloco, Tela } from '../../ui';
import { irAjuda, irSub, PLANO_NOME, planoPorId } from './dados';
import Etapas, { rolarAoTopo } from './Etapas';

/**
 * CANCELAR ASSINATURA — `T.cancelar` do protótipo aprovado: o que muda → motivo → oferta coerente
 * → confirmar → pronto. Cancelar tão fácil quanto assinar, e "Não, quero cancelar" com o mesmo
 * peso da oferta.
 *
 * O CANCELAMENTO É O REAL: `POST /api/billing/cancelar` para a renovação no Asaas, e o que já foi
 * pago vale até o fim do período. As ofertas (Essencial, pausa, suporte) levam ao suporte, porque
 * trocar de plano e pausar não têm rota no servidor. O reembolso dos 7 dias (CDC, art. 49) também
 * é pelo suporte: o servidor não estorna sozinho, então a tela não oferece um botão que estorne.
 *
 * O "protocolo" do protótipo não existe no app; no lugar dele fica a data e a hora do registro.
 */

const MOTIVOS: [string, string][] = [
  ['caro', 'Está caro para mim'],
  ['pouco', 'Não estou usando o suficiente'],
  ['faltou', 'Faltou um recurso que eu preciso'],
  ['tecnico', 'Tive problemas técnicos'],
  ['selfhost', 'Vou usar o Grátis ou o self-host'],
  ['outro', 'Outro motivo'],
];

const SETE_DIAS = 7 * 86_400_000;

export default function Cancelar({
  conta,
  faturas,
  aoCancelado,
  aoReativar,
}: {
  conta: Conta;
  faturas: Fatura[] | null;
  aoCancelado: () => void;
  aoReativar: () => void;
}) {
  const [passo, setPasso] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [registradoEm, setRegistradoEm] = useState<Date | null>(null);
  // O fim do período que o servidor devolveu ao cancelar vence o do status (que pode ainda não ter chegado).
  const [valeAteDoCancelamento, setValeAte] = useState<number | null>(null);
  const valeAte = valeAteDoCancelamento ?? conta.valeAte;

  const ir = (n: typeof passo) => {
    setPasso(n);
    rolarAoTopo();
  };

  const plano = conta.plano ?? 'pro';
  const p = PLANO_NOME[plano];
  const ate = valeAte ? dataCurta(valeAte) : 'o fim do período pago';
  const pagas = (faturas ?? []).filter((f) => f.status === 'paga' && f.data);
  const primeira = pagas.length ? pagas[pagas.length - 1].data : null;
  const dentro7 = !!primeira && Date.now() - new Date(`${primeira}T00:00:00`).getTime() < SETE_DIAS;

  const ofertas: Record<string, [LucideIcon, string, string][]> = {
    caro:
      plano === 'pro'
        ? [
            [
              ArrowDownRight,
              `Mudar para o Essencial por ${brl(precoMensal('essencial'))}/mês`,
              'Você mantém a tradução com IA de nuvem. O suporte faz a troca.',
            ],
          ]
        : [],
    pouco: [[CirclePause, 'Pausar por 1, 2 ou 3 meses', 'Sem cobrança nesse período. O suporte faz a pausa.']],
    tecnico: [[LifeBuoy, 'Falar com o suporte', 'Conte o que aconteceu: dá para resolver antes de cancelar.']],
  };
  const oferta = motivo && ofertas[motivo]?.length ? ofertas[motivo] : null;

  const confirmar = async () => {
    setErro('');
    setOcupado(true);
    const r = await cancelarRenovacao();
    setOcupado(false);
    if (!r.ok) {
      setErro(`Não consegui cancelar agora (${r.erro}). Tente de novo; nada foi cobrado a mais.`);
      return;
    }
    if (r.valeAte) setValeAte(r.valeAte);
    setRegistradoEm(new Date());
    ir(5);
    aoCancelado();
  };

  const podeCancelar = conta.estado === 'ativa' || conta.estado === 'falhou';
  const idx = passo === 3 ? 1 : passo === 4 ? 2 : passo - 1;
  const manter = (
    <button type="button" className="btn btn-solid" onClick={() => irSub('assinatura')}>
      Manter o {p}
    </button>
  );

  let corpo: React.ReactNode = null;
  if (passo < 5 && !podeCancelar) {
    corpo = (
      <section className="cartao p6">
        <div className="vazio">
          <IconeEmBloco icone={CalendarX} />
          <h3>
            {conta.estado === 'cancelada' ? 'Esta assinatura já está cancelada' : 'Não há assinatura para cancelar'}
          </h3>
          <p>
            {conta.estado === 'cancelada'
              ? `Você continua com o ${p} até ${ate}. Depois disso, volta para o Grátis, sem cobrança.`
              : 'Quem usa o Grátis ou o self-host não tem cobrança nenhuma.'}
          </p>
        </div>
        <div className="linha botoes-cx">
          <button type="button" className="btn btn-outline" onClick={() => irSub(null)}>
            <ArrowLeft aria-hidden /> Ver planos
          </button>
        </div>
      </section>
    );
  } else if (passo === 1) {
    corpo = (
      <section className="cartao p6">
        <h2 className="tit-passo">Antes de cancelar, veja o que muda</h2>
        <div className="g2 muda">
          <div className="cartao p5">
            <span className="label-mono">Você deixa de ter</span>
            <ul className="lista-x">
              {planoPorId(plano).itens.map(([, t]) => (
                <li key={t}>
                  <X aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="cartao p5">
            <span className="label-mono">Continua com você</span>
            <ul className="lista-check">
              {[
                'Todas as suas sessões e palavras',
                'Seu progresso, XP e conquistas',
                `O ${p} até ${ate}`,
                'O plano Grátis, para sempre',
              ].map((t) => (
                <li key={t}>
                  <Check aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mut" style={{ fontSize: 13.5, marginTop: 14 }}>
          Prefere dar um tempo?{' '}
          <button type="button" className="link" onClick={irAjuda}>
            Pausar a assinatura
          </button>{' '}
          por até 3 meses, sem cobrança, falando com o suporte.
        </p>
        <div className="linha botoes-cx">
          {manter}
          <button type="button" className="btn btn-outline" onClick={() => ir(2)}>
            Continuar cancelamento <ArrowRight aria-hidden />
          </button>
        </div>
      </section>
    );
  } else if (passo === 2) {
    const proximo = oferta ? 3 : 4;
    corpo = (
      <section className="cartao p6">
        <fieldset className="escolha">
          <legend>
            <h2 className="tit-passo">Por que você está cancelando?</h2>
            <span className="mut" style={{ fontSize: 13.5 }}>
              Opcional. Ajuda a gente a melhorar.
            </span>
          </legend>
          <div className="opcoes motivos">
            {MOTIVOS.map(([v, r]) => (
              <button
                key={v}
                type="button"
                className={`cartao opcao ${motivo === v ? 'sel' : ''}`}
                aria-pressed={motivo === v}
                onClick={() => setMotivo(v)}
              >
                <span className="radio" aria-hidden />
                <span>{r}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {motivo && (
          <div className="form-l entra" style={{ marginTop: 12 }}>
            <label htmlFor="cx-texto">
              {motivo === 'faltou' ? 'Qual recurso faltou?' : 'Quer contar mais? (opcional)'}
            </label>
            <textarea className="campo" id="cx-texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        )}
        <div className="linha botoes-cx">
          <button type="button" className="btn btn-outline" onClick={() => ir(1)}>
            <ArrowLeft aria-hidden /> Voltar
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="link" onClick={() => ir(proximo)}>
            Pular
          </button>
          <button type="button" className="btn btn-outline" onClick={() => ir(proximo)} disabled={!motivo}>
            Continuar <ArrowRight aria-hidden />
          </button>
        </div>
      </section>
    );
  } else if (passo === 3 && oferta) {
    corpo = (
      <section className="cartao p6">
        <h2 className="tit-passo">
          {motivo === 'caro'
            ? 'Talvez isto caiba melhor no bolso'
            : motivo === 'pouco'
              ? 'Que tal dar um tempo em vez de cancelar?'
              : 'Podemos resolver isso?'}
        </h2>
        <div className="pilha">
          {oferta.map(([I, t, d]) => (
            <button key={t} type="button" className="cartao clicavel acao-assin" onClick={irAjuda}>
              <IconeEmBloco icone={I} tom="good" />
              <span style={{ flex: 1 }}>
                <b>{t}</b>
                <small className="mut">{d}</small>
              </span>
              <ChevronRight aria-hidden style={{ width: 16, height: 16 }} />
            </button>
          ))}
        </div>
        <div className="linha botoes-cx">
          <button type="button" className="btn btn-outline" onClick={() => ir(2)}>
            <ArrowLeft aria-hidden /> Voltar
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-outline" onClick={() => ir(4)}>
            Não, quero cancelar <ArrowRight aria-hidden />
          </button>
        </div>
      </section>
    );
  } else if (passo === 3 || passo === 4) {
    corpo = (
      <section className="cartao p6">
        <h2 className="tit-passo">Confirme o cancelamento</h2>
        <dl className="dados">
          <div>
            <dt>Plano</dt>
            <dd>{p} · mensal</dd>
          </div>
          <div>
            <dt>Acesso ao {p} até</dt>
            <dd className="tn">{ate}</dd>
          </div>
          <div>
            <dt>Novas cobranças</dt>
            <dd>Nenhuma</dd>
          </div>
          <div>
            <dt>Seus dados</dt>
            <dd>Continuam salvos</dd>
          </div>
        </dl>
        {dentro7 && (
          <div className="aviso-info reembolso">
            <BadgeCheck aria-hidden />
            <span>
              Você assinou há menos de 7 dias. Se preferir, peça ao suporte o{' '}
              <b>reembolso de {brl(precoMensal(plano))}</b> no mesmo meio de pagamento (CDC, art. 49); aí o acesso ao{' '}
              {p} termina quando o reembolso sair.
            </span>
          </div>
        )}
        {erro && (
          <p className="erro-auth" role="alert">
            <CircleAlert aria-hidden /> {erro}
          </p>
        )}
        <div className="linha botoes-cx">
          {manter}
          <button type="button" className="btn btn-outline perigo" onClick={() => void confirmar()} disabled={ocupado}>
            <X aria-hidden /> {ocupado ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </div>
      </section>
    );
  } else if (passo === 5) {
    const quando = registradoEm ?? new Date();
    corpo = (
      <section className="cartao p6 sucesso entra">
        <div className="selo-ok neutro" aria-hidden>
          <CalendarX />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '8px 0 6px' }}>Assinatura cancelada</h1>
        <p className="mut" style={{ maxWidth: '54ch', margin: '0 auto' }}>
          Você continua com o {p} até <b>{ate}</b>. Depois disso, volta para o Grátis, sem cobrança. Suas sessões e
          palavras continuam aqui.
        </p>
        <dl className="dados centro">
          <div>
            <dt>Registrado em</dt>
            <dd className="tn">
              {dataCurta(quando.getTime())} · {String(quando.getHours()).padStart(2, '0')}:
              {String(quando.getMinutes()).padStart(2, '0')}
            </dd>
          </div>
          <div>
            <dt>Novas cobranças</dt>
            <dd>Nenhuma</dd>
          </div>
        </dl>
        <div className="linha" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
          <button type="button" className="btn btn-solid" onClick={aoReativar}>
            <RotateCcw aria-hidden /> Reativar o {p}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navegarPara({ view: 'hub' })}>
            Voltar ao início
          </button>
        </div>
        <p className="mut" style={{ fontSize: 12.5, marginTop: 14 }}>
          Mudou de ideia? Fale com o suporte até {ate} para reativar sem pagar de novo.
        </p>
      </section>
    );
  }

  return (
    <Tela largura="estreita">
      <CabecalhoDeTela
        voltar={{ rotulo: 'Planos', aoClicar: () => irSub(null) }}
        sobrancelha="Sua assinatura"
        icone={CalendarX}
        titulo={passo === 5 ? 'Pronto' : 'Cancelar assinatura'}
        sub={passo === 5 ? undefined : 'Leva menos de um minuto. Você pode voltar atrás até o fim.'}
      />
      {passo < 5 && podeCancelar && <Etapas passos={['O que muda', 'Motivo', 'Confirmar']} atual={idx} />}
      {corpo}
    </Tela>
  );
}
