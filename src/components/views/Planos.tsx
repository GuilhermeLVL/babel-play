import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  Cloud,
  Cpu,
  CreditCard,
  Download,
  Gauge,
  HardDrive,
  Infinity as Infinito,
  Languages,
  ListChecks,
  type LucideIcon,
  MessageSquareQuote,
  Mic,
  Server,
  Settings as Engrenagem,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  Youtube,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { armazenamentoEmTexto, type PlanoDeAssinatura, precoDoPlano } from '../../core/planos';
import { getEntitlements, onPlanChange, PLAN_LABELS } from '../../lib/entitlements';
import { numero, t } from '../../lib/i18n';
import { carregarUso, duracaoLegivel, fracao, type UsoDoMes } from '../../lib/uso';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, PainelDeAba, Tela, TituloDeSecao } from '../ui';
import Assinar from './planos/Assinar';

/**
 * PLANOS E USO — o que cada plano dá, e quanto do seu já foi usado.
 *
 * A FORMA É A DO PROTÓTIPO APROVADO (`T.planos` em `docs/prototipos/consistencia-telas.html`):
 * faixa "Seu plano agora", três cartões `.plano2` com o Pro em destaque escuro, "Tudo do anterior,
 * e:", tabela "Comparar em detalhe" agrupada com barras de qualidade e perguntas frequentes.
 *
 * OS NÚMEROS SÃO DO APP, NÃO DO PROTÓTIPO. Preço vem de `PLAN_MATRIX` (`precoDoPlano`),
 * armazenamento da quota (`armazenamentoEmTexto`) e qualidade de `docs/auditoria/eval-producao-v1.md`
 * (WER no CORAA, chrF++ no gold set). O protótipo tinha números ilustrativos (880 MB, faturas,
 * datas de renovação) que aqui não entram.
 *
 * O QUE FICOU DE FORA, DE PROPÓSITO. Período anual (o app só tem preço mensal), a aba "Sua
 * assinatura" com faturas, pausa e troca de plano, o checkout e a promessa de reembolso em 7 dias:
 * nada disso existe no app, e desenhar o controle sem a função seria vender o que não há. A compra
 * e o cancelamento de verdade continuam no bloco `#assinar` (`planos/Assinar`).
 *
 * O BOTÃO DO CARTÃO NÃO COBRA — ele LEVA ao `#assinar`, que ou tem o formulário real (modo público
 * com billing) ou diz por que não há o que assinar nesta instalação.
 */

type Coluna = 'gratis' | 'essencial' | 'pro';
type Celula = 'ok' | 'nao' | number | string;

/** Uma linha do comparativo: rótulo, um valor por plano, nota e se "menor é melhor". */
type Linha = [rotulo: string, valores: [Celula, Celula, Celula], nota?: string, invertido?: boolean];

const MODELOS: Record<Coluna, string> = { gratis: '230–413 MB', essencial: '230–300 MB', pro: 'nenhum' };

/*
 * O ESSENCIAL vende UMA coisa, e é a maior queixa medida: tradução contextualizada (idiomático
 * 27%→83%). A transcrição continua local — é isso que o deixa a R$ 9,90.
 */
const COMPARA: [grupo: string, linhas: Linha[]][] = [
  [
    'Captura e estudo',
    [
      ['Captura ao vivo (mic + sistema)', ['ok', 'ok', 'ok']],
      ['Identificação de falantes', ['ok', 'ok', 'ok']],
      ['Jogos, vocabulário e revisão', ['ok', 'ok', 'ok']],
      ['Importar do YouTube', ['nao', 'nao', 'ok']],
      ['Sua própria chave de IA (BYOK)', ['ok', 'ok', 'ok']],
    ],
  ],
  [
    'Qualidade da IA · medida, não estimada',
    [
      ['Qualidade de tradução (geral)', [57, 85, 85], 'maior é melhor'],
      ['Expressões idiomáticas', [27, 83, 83], 'maior é melhor'],
      ['Erro de transcrição em PT falado', [57, 57, 24], 'menor é melhor', true],
    ],
  ],
  [
    'Espaço e download',
    [
      ['Modelos para baixar no primeiro uso', [MODELOS.gratis, MODELOS.essencial, MODELOS.pro]],
      /* Derivado da quota, não escrito à mão: mudar `armazenamentoMb` na matriz e esquecer esta
         linha faria a tabela prometer um teto que o servidor não aplica. */
      [
        'Armazenamento de sessões',
        [armazenamentoEmTexto('free'), armazenamentoEmTexto('essencial'), armazenamentoEmTexto('pro')],
      ],
    ],
  ],
];

interface Plano {
  id: Coluna;
  /** A chave do plano na matriz do servidor. */
  chave: PlanoDeAssinatura;
  icone: LucideIcon;
  nome: string;
  tag: string;
  para: string;
  base: string | null;
  itens: [LucideIcon, string][];
  destaque?: boolean;
}

const PLANOS: Plano[] = [
  {
    id: 'gratis',
    chave: 'free',
    icone: Cpu,
    nome: 'Grátis',
    tag: 'Tudo local, sem custo',
    para: 'Para estudar no seu computador, sem conta e sem pagar.',
    base: null,
    itens: [
      [Cpu, 'Tudo roda no seu aparelho'],
      [ShieldCheck, 'Nada do que você fala sai do computador'],
      [Download, `Baixa ${MODELOS.gratis} de modelos uma vez`],
      [HardDrive, `${armazenamentoEmTexto('free')} para sessões`],
    ],
  },
  {
    id: 'essencial',
    chave: 'essencial',
    icone: Sparkles,
    nome: 'Essencial',
    tag: 'Tradução com IA de nuvem',
    para: 'Para quem quer traduções melhores sem trocar de computador.',
    base: 'Grátis',
    itens: [
      [Languages, 'Tradução com IA de nuvem: 85% de qualidade'],
      [MessageSquareQuote, 'Expressões idiomáticas: 83%'],
      [Download, `Download menor: ${MODELOS.essencial}`],
      [HardDrive, `${armazenamentoEmTexto('essencial')} para sessões`],
    ],
  },
  {
    id: 'pro',
    chave: 'pro',
    icone: Cloud,
    nome: 'Pro',
    tag: 'Tudo processado no servidor',
    para: 'Para quem estuda todo dia, em qualquer aparelho.',
    base: 'Essencial',
    itens: [
      [Cloud, 'Nada para baixar: roda no servidor'],
      [Mic, 'Transcrição com menos erro: 24% no português falado'],
      [Youtube, 'Importar do YouTube'],
      [HardDrive, `${armazenamentoEmTexto('pro')} para sessões`],
    ],
    destaque: true,
  },
];

const precoMensal = (p: Plano) => (p.id === 'gratis' ? '0' : (precoDoPlano(p.chave) ?? '—'));

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

/** Leva a Ajustes sem depender de prop do App: a navegação do app escuta a URL (`popstate`). */
function irParaAjustes() {
  window.history.pushState({}, '', '/ajustes');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const FAQ: [string, React.ReactNode][] = [
  [
    'Onde cada plano processa?',
    'O Grátis roda tudo no seu computador: nada do que você fala sai do navegador. O Essencial manda só a tradução para a nuvem, e a fala continua transcrita localmente. O Pro processa tudo no servidor, o que traz a qualidade acima e dispensa o download dos modelos.',
  ],
  [
    'Posso cancelar quando quiser?',
    'Sim. Cancelar para a renovação; o que já foi pago vale até o fim do período, e seus dados continuam salvos.',
  ],
  [
    'Como cada número foi medido?',
    'Transcrição: taxa de erro de palavras (WER) medida em 48 falas espontâneas do corpus CORAA de fala brasileira. Tradução: chrF++ num conjunto anotado por fenômeno (pronome, gênero, idiomático, registro). Os números são medidos, não estimados; o método completo está publicado no repositório do projeto, com o link na tela Sobre.',
  ],
  [
    'O que é o self-host?',
    'É o Babel Play rodando no seu próprio computador. Ali tudo fica liberado e não há cota; o custo da IA de nuvem, se usar, é seu, pela sua própria chave.',
  ],
];

export default function Planos() {
  const [entitlements, setEntitlements] = useState(() => getEntitlements());
  const [uso, setUso] = useState<UsoDoMes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('planos');

  useEffect(() => onPlanChange(() => setEntitlements(getEntitlements())), []);

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
  /** Só um plano PAGO ganha o selo "Seu plano" no cartão — como no protótipo. */
  const pago = meuPlano === 'essencial' || meuPlano === 'pro' ? meuPlano : null;

  /* ── Faixa "Seu plano agora" ── */
  const faixa =
    meuPlano === 'selfhost' ? (
      <section className="cartao agora" aria-label="Seu plano agora">
        <IconeEmBloco icone={Server} tom="good" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="label-mono">Seu plano agora</span>
          <h2>
            Self-host{' '}
            <span className="badge ok">
              <Check aria-hidden /> Tudo liberado
            </span>
          </h2>
          <p className="mut">
            O app roda no seu computador: nada de cota, nada de cobrança. Os planos abaixo são para usar na nuvem.
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={irParaAjustes}>
          <Engrenagem aria-hidden /> Onde as contas rodam
        </button>
      </section>
    ) : pago ? (
      <section className="cartao agora" aria-label="Seu plano agora">
        <IconeEmBloco icone={pago === 'pro' ? Cloud : Sparkles} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="label-mono">Seu plano agora</span>
          <h2>
            {t(PLAN_LABELS[meuPlano])} · mensal{' '}
            <span className="badge ok">
              <Check aria-hidden /> Ativa
            </span>
          </h2>
          <p className="mut">R$ {precoDoPlano(pago)} por mês. O status da cobrança está logo abaixo dos planos.</p>
        </div>
        <a className="btn btn-outline" href="#assinar">
          <Engrenagem aria-hidden /> Gerenciar
        </a>
      </section>
    ) : (
      <section className="cartao agora" aria-label="Seu plano agora">
        <IconeEmBloco icone={Cpu} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="label-mono">Seu plano agora</span>
          <h2>
            {meuPlano === 'anonimo' ? t(PLAN_LABELS[meuPlano]) : 'Grátis'}{' '}
            <span className="badge neu">Plano atual</span>
          </h2>
          <p className="mut">Tudo roda no seu aparelho. Assine para usar a IA de nuvem e estudar em qualquer lugar.</p>
        </div>
      </section>
    );

  const cartao = (p: Plano) => {
    const atual = pago === p.chave;
    const Icone = p.icone;
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
          <span className="valor tn">{precoMensal(p)}</span>
          <span className="per mut">{p.id === 'gratis' ? 'para sempre' : 'por mês'}</span>
        </div>
        <p className="cobranca mut">
          {p.id === 'gratis' ? 'Sem cartão, sem conta.' : 'cobrado todo mês, cancele quando quiser'}
        </p>
        <p className="para mut">{p.para}</p>
        {atual ? (
          <button type="button" className="btn btn-outline bloco" disabled>
            Seu plano
          </button>
        ) : p.id === 'gratis' ? (
          pago ? (
            <a className="btn btn-outline bloco" href="#assinar">
              Voltar ao Grátis
            </a>
          ) : (
            <button
              type="button"
              className="btn btn-outline bloco"
              onClick={() => toast.ok('Você continua no Grátis. Nada muda.')}
            >
              Continuar grátis
            </button>
          )
        ) : (
          <a className={`btn ${p.destaque ? 'btn-solid' : 'btn-outline'} bloco`} href="#assinar">
            {pago ? `Mudar para ${p.nome}` : `Assinar ${p.nome}`}
            {p.destaque && <ArrowRight aria-hidden />}
          </a>
        )}
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
          : [
              [Languages, 'Tokens de tradução', numero(uso.tokensDeLlm.usado), null, 'tokens'] as [
                LucideIcon,
                string,
                string,
                number | null,
                string,
              ],
            ]),
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
              { id: 'consumo', rotulo: 'Consumo do mês', icone: <Gauge aria-hidden /> },
            ]}
            ativo={aba}
            aoTrocar={setAba}
            rotuloDoGrupo="Seções de Planos"
          />
        }
      />

      <PainelDeAba id="planos" ativo={aba}>
        {faixa}
        <div className="planos-grade">{PLANOS.map(cartao)}</div>
        <p className="mut garantia">
          <ShieldCheck aria-hidden /> Pagamento pelo Asaas, por Pix ou cartão · cancele a renovação quando quiser
        </p>

        {/* Destino do "Assinar" dos cartões — a compra e o cancelamento de verdade. */}
        <div id="assinar" className="secao" style={{ scrollMarginTop: 16 }}>
          <Assinar />
        </div>

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
                        <small className="mut tn">{p.id === 'gratis' ? 'R$ 0' : `R$ ${precoMensal(p)}/mês`}</small>
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
                    : 'Zera na virada do mês. Transcrição, tradução e tutor dividem o limite de chamadas: cada fala ao microfone usa duas. O provedor cobra no mínimo 10 segundos por trecho de áudio enviado.'}
                  {arm &&
                    uso.tokensDeLlm.usado > 0 &&
                    ` ${numero(uso.tokensDeLlm.usado)} tokens de tradução usados neste mês, registrados só para acompanhar custo.`}
                </p>
              </div>
            </div>
          </>
        )}
      </PainelDeAba>
    </Tela>
  );
}
