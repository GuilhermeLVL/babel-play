import '../../../styles/questConta.css';

import {
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

import {
  type Arrependimento,
  brl,
  cancelarRenovacao,
  type Conta,
  dataCurta,
  type Fatura,
  formaDaConta,
  parcelasDoAnual,
  precoAnual,
  precoMensal,
  rotuloDaForma,
} from '../../../lib/assinatura';
import { t } from '../../../lib/i18n';
import { navegarPara } from '../../../lib/rotas';
import { T } from '../../../lib/T';
import { irAjuda, irSub, itemCompleto, PLANO_NOME, planoPorId } from './dados';
import Etapas, { rolarAoTopo } from './Etapas';

/**
 * CANCELAR ASSINATURA — `T.cancelar` do protótipo aprovado: o que muda → motivo → oferta coerente
 * → confirmar → pronto. Cancelar tão fácil quanto assinar, e "Não, quero cancelar" com o mesmo
 * peso da oferta.
 *
 * O CANCELAMENTO É O REAL: `POST /api/billing/cancelar` para a renovação no Asaas, e o que já foi
 * pago vale até o fim do período (a data vem do Asaas). As ofertas (pausa, suporte) levam
 * ao suporte, porque trocar de plano e pausar não têm rota no servidor.
 *
 * ARREPENDIMENTO (CDC art. 49; Decreto 7.962/2013 art. 5º): dentro de 7 dias do primeiro pagamento,
 * o MESMO botão faz o servidor cancelar e estornar o valor integral, e o acesso termina na hora. A
 * tela avisa ANTES de confirmar e, depois, confirma o recebimento do pedido na hora, com o protocolo
 * que o servidor registrou. Se o Asaas recusar o estorno, o servidor o põe na fila do admin e a
 * tela diz que o reembolso sai manualmente, com prazo — nunca some.
 *
 * O CICLO E O MEIO (C5/C7, padrão do dono a validar com o jurídico): o arrependimento devolve o ANO
 * inteiro no anual e o PARCELAMENTO inteiro no 12x. Depois dos 7 dias, o anual para a renovação e o
 * 12x não para as parcelas — o servidor não escreve nada no Asaas, e o ano pago vale até o fim. Por
 * isso a confirmação do 12x nunca diz "novas cobranças: nenhuma".
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
  const [arrependimento, setArrependimento] = useState<Arrependimento | null>(null);
  const valeAte = valeAteDoCancelamento ?? conta.valeAte;

  const ir = (n: typeof passo) => {
    setPasso(n);
    rolarAoTopo();
  };

  const plano = conta.plano ?? 'premium';
  const p = PLANO_NOME[plano];
  const ate = valeAte ? dataCurta(valeAte) : 'o fim do período pago';
  const pagas = (faturas ?? []).filter((f) => f.status === 'paga' && f.data);
  const primeira = pagas.length ? pagas[pagas.length - 1].data : null;
  // A mesma régua do servidor (encerramentoDeAssinatura.ts): até o fim do 7º dia após o pagamento.
  const dentro7 = !!primeira && Date.now() - new Date(`${primeira}T00:00:00`).getTime() < SETE_DIAS + 86_400_000;
  const forma = formaDaConta(conta);
  const doze = forma === 'anual_12x';
  const comCiclo = `${p} · ${rotuloDaForma(forma)}`;
  const valorPago =
    pagas.reduce((s, f) => s + f.valor, 0) || (forma === 'mensal' ? precoMensal(plano) : precoAnual(plano));
  /* O 12x depois dos 7 dias: as parcelas que faltam continuam no cartão (nada novo é cobrado). */
  const parcelasSeguem = doze && !dentro7;

  const ofertas: Record<string, [LucideIcon, string, string][]> = {
    /* Matriz v2: não há plano mais barato para onde descer — o "caro" não tem oferta de troca. */
    caro: [],
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
    setArrependimento(r.arrependimento ?? null);
    setRegistradoEm(r.arrependimento ? new Date(r.arrependimento.registradoEm) : new Date());
    ir(5);
    aoCancelado();
  };

  const podeCancelar = conta.estado === 'ativa' || conta.estado === 'falhou';
  const idx = passo === 3 ? 1 : passo === 4 ? 2 : passo - 1;

  /* ── QUEST ─────────────────────────────────────────────────────────────────────────────────────
     Os mesmos cinco passos (o que muda, motivo, oferta, confirmar, pronto), no desenho do headset.
     "Manter" e "cancelar" têm o mesmo tamanho de alvo; o único botão em destaque é o que mantém o
     plano, como na tela de sempre. O cancelamento (`confirmar`) e a régua dos 7 dias são os de cima. */
  const manterDoQuest = (
    <button type="button" className="q-ctl pri" onClick={() => irSub('assinatura')}>
      {t('Manter o {plano}', { plano: p })}
    </button>
  );
  const hora = (quando: Date) =>
    `${dataCurta(quando.getTime())} · ${String(quando.getHours()).padStart(2, '0')}:${String(quando.getMinutes()).padStart(2, '0')}`;

  let corpoDoQuest: React.ReactNode = null;
  if (passo < 5 && !podeCancelar) {
    corpoDoQuest = (
      <div className="q-vazio">
        <span className="q-ic">
          <CalendarX aria-hidden />
        </span>
        <h2>
          {conta.estado === 'cancelada' ? t('Esta assinatura já está cancelada') : t('Não há assinatura para cancelar')}
        </h2>
        <p>
          {conta.estado === 'cancelada'
            ? t('Você continua com o {plano} até {data}. Depois disso, volta para o Grátis, sem cobrança.', {
                plano: p,
                data: ate,
              })
            : t('Quem usa o Grátis ou o self-host não tem cobrança nenhuma.')}
        </p>
        <button type="button" className="q-ctl pri" onClick={() => irSub(null)}>
          <ArrowLeft aria-hidden /> {t('Ver planos')}
        </button>
      </div>
    );
  } else if (passo === 1) {
    corpoDoQuest = (
      <section className="q-cartao">
        <h2 className="qc-titulo-do-passo">{t('Antes de cancelar, veja o que muda')}</h2>
        <div className="qc-duas-colunas">
          <div className="q-cartao">
            <span className="q-rotulo">{t('Você deixa de ter')}</span>
            <ul className="qc-lista qc-perde">
              {planoPorId(plano).itens.map((item) => (
                <li key={item.texto}>
                  <X aria-hidden />
                  {itemCompleto(item)}
                </li>
              ))}
            </ul>
          </div>
          <div className="q-cartao">
            <span className="q-rotulo">{t('Continua com você')}</span>
            <ul className="qc-lista">
              {[
                t('Todas as suas sessões e palavras'),
                t('Seu progresso, XP e conquistas'),
                t('O {plano} até {data}', { plano: p, data: ate }),
                t('O plano Grátis, para sempre'),
              ].map((x) => (
                <li key={x}>
                  <Check aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="q-ajuste qc-no-cartao">
          <div>
            <b>{t('Prefere dar um tempo?')}</b>
            <small>{t('Pause por até 3 meses, sem cobrança, falando com o suporte.')}</small>
          </div>
          <button type="button" className="q-ctl" onClick={irAjuda}>
            <CirclePause aria-hidden /> {t('Pausar a assinatura')}
          </button>
        </div>
        <div className="qc-pe">
          {manterDoQuest}
          <button type="button" className="q-ctl" onClick={() => ir(2)}>
            {t('Continuar cancelamento')} <ArrowRight aria-hidden />
          </button>
        </div>
      </section>
    );
  } else if (passo === 2) {
    const proximo = oferta ? 3 : 4;
    corpoDoQuest = (
      <section className="q-cartao">
        <fieldset className="qc-escolha">
          <legend>
            <h2>{t('Por que você está cancelando?')}</h2>
            <span>{t('Opcional. Ajuda a gente a melhorar.')}</span>
          </legend>
          <div className="qc-opcoes qc-duas">
            {MOTIVOS.map(([v, r]) => (
              <button
                key={v}
                type="button"
                className="qc-opcao"
                aria-pressed={motivo === v}
                onClick={() => setMotivo(v)}
              >
                <span className="qc-bolinha" aria-hidden />
                <span>
                  <b>{t(r)}</b>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        {motivo && (
          <div className="q-campo">
            <label htmlFor="cx-texto">
              {motivo === 'faltou' ? t('Qual recurso faltou?') : t('Quer contar mais? (opcional)')}
            </label>
            <textarea id="cx-texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        )}
        <div className="qc-pe">
          <button type="button" className="q-ctl" onClick={() => ir(1)}>
            <ArrowLeft aria-hidden /> {t('Voltar')}
          </button>
          <span className="q-espaco" />
          <button type="button" className="q-ctl" onClick={() => ir(proximo)}>
            {t('Pular')}
          </button>
          <button type="button" className="q-ctl" onClick={() => ir(proximo)} disabled={!motivo}>
            {t('Continuar')} <ArrowRight aria-hidden />
          </button>
        </div>
      </section>
    );
  } else if (passo === 3 && oferta) {
    corpoDoQuest = (
      <section className="q-cartao">
        <h2 className="qc-titulo-do-passo">
          {motivo === 'caro'
            ? t('Talvez isto caiba melhor no bolso')
            : motivo === 'pouco'
              ? t('Que tal dar um tempo em vez de cancelar?')
              : t('Podemos resolver isso?')}
        </h2>
        <div className="q-lista">
          {oferta.map(([I, titulo, d]) => (
            <button key={titulo} type="button" className="q-linha qc-no-cartao" onClick={irAjuda}>
              <span className="q-ic">
                <I aria-hidden />
              </span>
              <span>
                <b>{t(titulo)}</b>
                <small>{t(d)}</small>
              </span>
              <span className="q-fim">
                <ChevronRight aria-hidden style={{ width: 22, height: 22 }} />
              </span>
            </button>
          ))}
        </div>
        <div className="qc-pe">
          <button type="button" className="q-ctl" onClick={() => ir(2)}>
            <ArrowLeft aria-hidden /> {t('Voltar')}
          </button>
          <span className="q-espaco" />
          <button type="button" className="q-ctl" onClick={() => ir(4)}>
            {t('Não, quero cancelar')} <ArrowRight aria-hidden />
          </button>
        </div>
      </section>
    );
  } else if (passo === 3 || passo === 4) {
    corpoDoQuest = (
      <section className="q-cartao">
        <h2 className="qc-titulo-do-passo">{t('Confirme o cancelamento')}</h2>
        <dl className="qc-dados">
          <div>
            <dt>{t('Plano')}</dt>
            <dd>{comCiclo}</dd>
          </div>
          <div>
            <dt>{t('Acesso ao {plano} até', { plano: p })}</dt>
            <dd>{dentro7 ? t('Termina agora, com o reembolso') : ate}</dd>
          </div>
          {parcelasSeguem ? (
            <div>
              <dt>{t('Parcelas que faltam')}</dt>
              <dd>
                {t('Seguem no cartão até a {n}ª, sem reembolso proporcional', {
                  n: parcelasDoAnual(plano).quantidade,
                })}
              </dd>
            </div>
          ) : (
            <div>
              <dt>{t('Novas cobranças')}</dt>
              <dd>{t('Nenhuma')}</dd>
            </div>
          )}
          <div>
            <dt>{t('Seus dados')}</dt>
            <dd>{t('Continuam salvos')}</dd>
          </div>
        </dl>
        {dentro7 && (
          <div className="q-aviso">
            <BadgeCheck aria-hidden />
            <span>
              {doze ? (
                <T
                  txt="Você assinou há 7 dias ou menos: ao confirmar, o <b>parcelamento inteiro ({valor})</b> é estornado no cartão (CDC, art. 49), as parcelas que faltam são canceladas, sem precisar pedir a ninguém, e o acesso ao {plano} termina agora."
                  val={{ valor: brl(precoAnual(plano)), plano: p }}
                />
              ) : (
                <T
                  txt="Você assinou há 7 dias ou menos: ao confirmar, você recebe o <b>reembolso integral de {valor}</b> no mesmo meio de pagamento (CDC, art. 49), sem precisar pedir a ninguém, e o acesso ao {plano} termina agora."
                  val={{ valor: brl(valorPago), plano: p }}
                />
              )}
            </span>
          </div>
        )}
        {erro && (
          <p className="qc-erro" role="alert">
            <CircleAlert aria-hidden />
            <span>{erro}</span>
          </p>
        )}
        <div className="qc-pe">
          {manterDoQuest}
          <button type="button" className="q-ctl perigo" onClick={() => void confirmar()} disabled={ocupado}>
            <X aria-hidden /> {ocupado ? t('Cancelando…') : t('Confirmar cancelamento')}
          </button>
        </div>
      </section>
    );
  } else if (passo === 5 && arrependimento) {
    corpoDoQuest = (
      <section className="q-cartao qc-sucesso">
        <span className="qc-selo" aria-hidden>
          <BadgeCheck />
        </span>
        <h2>{t('Reembolso solicitado')}</h2>
        <p>
          {arrependimento.estornado
            ? t(
                'Recebemos o seu pedido de arrependimento. O estorno de {valor} já foi enviado ao meio de pagamento; no cartão, ele aparece na fatura em até 10 dias úteis.',
                { valor: brl(arrependimento.valor) },
              )
            : t(
                'Recebemos o seu pedido de arrependimento. O estorno automático não passou agora, então o reembolso de {valor} será feito manualmente em até {dias} dias, no mesmo meio de pagamento.',
                { valor: brl(arrependimento.valor), dias: arrependimento.prazoManualDias ?? 7 },
              )}{' '}
          {t('A assinatura está cancelada e nada mais será cobrado.')}
        </p>
        <dl className="qc-dados">
          <div>
            <dt>{t('Protocolo')}</dt>
            <dd>{arrependimento.protocolo}</dd>
          </div>
          <div>
            <dt>{t('Registrado em')}</dt>
            <dd>{hora(registradoEm ?? new Date())}</dd>
          </div>
          <div>
            <dt>{t('Valor')}</dt>
            <dd>{brl(arrependimento.valor)}</dd>
          </div>
        </dl>
        <div className="q-acoes">
          <button type="button" className="q-ctl pri" onClick={() => navegarPara({ view: 'hub' })}>
            {t('Voltar ao início')}
          </button>
        </div>
        <p className="qc-nota">{t('Guarde o protocolo. Suas sessões e palavras continuam aqui, no plano Grátis.')}</p>
      </section>
    );
  } else if (passo === 5) {
    corpoDoQuest = (
      <section className="q-cartao qc-sucesso">
        <span className="qc-selo qc-neutro" aria-hidden>
          <CalendarX />
        </span>
        <h2>{t('Assinatura cancelada')}</h2>
        <p>
          <T txt="Você continua com o {plano} até <b>{data}</b>." val={{ plano: p, data: ate }} />{' '}
          {doze
            ? t('As parcelas que faltam seguem no cartão; nada novo é cobrado. Depois disso, volta para o Grátis.')
            : t('Depois disso, volta para o Grátis, sem cobrança.')}{' '}
          {t('Suas sessões e palavras continuam aqui.')}
        </p>
        <dl className="qc-dados">
          <div>
            <dt>{t('Registrado em')}</dt>
            <dd>{hora(registradoEm ?? new Date())}</dd>
          </div>
          <div>
            <dt>{doze ? t('Parcelas que faltam') : t('Novas cobranças')}</dt>
            <dd>{doze ? t('Seguem no cartão') : t('Nenhuma')}</dd>
          </div>
        </dl>
        <div className="q-acoes">
          <button type="button" className="q-ctl pri" onClick={aoReativar}>
            <RotateCcw aria-hidden /> {t('Reativar o {plano}', { plano: p })}
          </button>
          <button type="button" className="q-ctl" onClick={() => navegarPara({ view: 'hub' })}>
            {t('Voltar ao início')}
          </button>
        </div>
        <p className="qc-nota">
          {t('Mudou de ideia? Fale com o suporte até {data} para reativar sem pagar de novo.', { data: ate })}
        </p>
      </section>
    );
  }

  return (
    <div className="q-palco qc" data-testid="cancelar-do-quest">
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
          <p className="q-sobre">{t('Sua assinatura')}</p>
          <h1>{passo === 5 ? t('Pronto') : t('Cancelar assinatura')}</h1>
          {passo !== 5 && <p className="qc-sub">{t('Leva menos de um minuto. Você pode voltar atrás até o fim.')}</p>}
        </div>
      </header>
      {passo < 5 && podeCancelar && <Etapas passos={['O que muda', 'Motivo', 'Confirmar']} atual={idx} />}
      {corpoDoQuest}
    </div>
  );
}
