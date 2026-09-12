import { ArrowRight, Check, ChevronUp, Cloud, Cpu, Minus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { armazenamentoEmTexto, precoDoPlano } from '../../core/planos';
import { getEntitlements, onPlanChange, PLAN_LABELS } from '../../lib/entitlements';
import { numero, t } from '../../lib/i18n';
import { carregarUso, duracaoLegivel, fracao, type UsoDoMes } from '../../lib/uso';
import { Abas, Barra, PainelDeAba, Vazio } from '../ui';
import Assinar from './planos/Assinar';

/**
 * PLANOS E USO — o que cada plano dá, e quanto do seu já foi usado.
 *
 * O QUE ESTA TELA CONSERTA. O plano existia inteiro no servidor (`subscriptions`, entitlements,
 * quotas com reserva atômica) e a interface mostrava um parágrafo em Ajustes. Não havia comparativo
 * entre planos, e o consumo do mês — que os contadores já registravam — não aparecia em lugar
 * nenhum. Um assinante descobria o teto ao ser recusado no meio de uma conversa.
 *
 * OS NÚMEROS DE QUALIDADE SÃO MEDIDOS, NÃO PROMETIDOS. A coluna do plano pago cita WER e chrF++ de
 * `docs/auditoria/eval-producao-v1.md`, apurados no corpus CORAA e no gold set do projeto. Vender
 * "IA melhor" sem número é a mesma promessa vaga que este projeto passou o mês desmontando — e um
 * número que o próprio dono pode conferir é o oposto disso.
 *
 * O BOTÃO DO CARTÃO NÃO COBRA — ele LEVA (revisão de 2026-09-12). Até aqui o cartão não tinha
 * botão nenhum, pelo motivo certo (a cobrança não existe sem provedor, e um botão que não cobra é
 * pior que nenhum) e com um efeito colateral: o cartão terminava no ar, e o destaque do Pro não
 * tinha onde pousar. Agora o botão existe em todos os três e aponta para `#assinar`, o bloco que
 * ou tem o formulário de verdade (modo público com billing) ou diz por que não há o que assinar
 * nesta instalação. No plano atual ele é um selo desativado, não um link.
 */

/** Uma linha do comparativo, com uma célula por plano vendável. */
interface Recurso {
  nome: string;
  gratis: string | boolean;
  essencial: string | boolean;
  pro: string | boolean;
  /** De onde saiu o número, quando é medido. Aparece como nota abaixo da tabela. */
  fonte?: string;
}

/*
 * O ESSENCIAL vende UMA coisa, e é a maior queixa medida: tradução contextualizada (idiomático
 * 27%→83%). A transcrição continua local — é isso que o deixa a R$ 9,90. Números de
 * docs/auditoria/eval-producao-v1.md; a fonte de cada um fica visível na própria tabela.
 */
const RECURSOS: Recurso[] = [
  { nome: 'Captura ao vivo (mic + áudio do sistema)', gratis: true, essencial: true, pro: true },
  { nome: 'Identificação de falantes', gratis: true, essencial: true, pro: true },
  { nome: 'Jogos, vocabulário e revisão', gratis: true, essencial: true, pro: true },
  {
    nome: 'Qualidade de tradução (geral)',
    gratis: '57%',
    essencial: '85%',
    pro: '85%',
    fonte: 'chrF++ no gold set de fenômenos de conversa',
  },
  {
    nome: 'Expressões idiomáticas',
    gratis: '27%',
    essencial: '83%',
    pro: '83%',
    fonte: '"Break a leg" vira "Boa sorte", não "Quebre uma perna"',
  },
  {
    nome: 'Erro de transcrição em PT falado',
    gratis: '57%',
    essencial: '57%',
    pro: '24%',
    fonte: 'WER medido em 48 falas espontâneas do corpus CORAA',
  },
  {
    nome: 'Modelos para baixar no primeiro uso',
    gratis: '230–413 MB',
    essencial: '230–300 MB',
    pro: 'nenhum',
    fonte: 'no Pro a transcrição também roda no servidor; o navegador não baixa nada',
  },
  { nome: 'Importar do YouTube', gratis: false, essencial: false, pro: true },
  /* Derivado da quota, não escrito à mão: mudar `armazenamentoMb` na matriz e esquecer esta
     linha faria a tabela prometer um teto que o servidor não aplica. */
  {
    nome: 'Armazenamento de sessões',
    gratis: armazenamentoEmTexto('free'),
    essencial: armazenamentoEmTexto('essencial'),
    pro: armazenamentoEmTexto('pro'),
  },
  { nome: 'Sua própria chave de IA (BYOK)', gratis: true, essencial: true, pro: true },
];

/**
 * A CÉLULA DE UM RECURSO — ✓, — ou um valor medido.
 *
 * A LANE TEM LARGURA FIXA E CONTEÚDO À DIREITA, e é o conserto do "descentralizado" que o dono
 * apontou: os valores têm larguras muito diferentes ("85%", "230–413 MB", "nenhum", "5 GB"),
 * então com a lane crescendo junto com o conteúdo cada linha começava o texto num x diferente —
 * dez linhas, oito alinhamentos. Encostando tudo à direita, os rótulos partem todos do mesmo
 * lugar e os números viram uma coluna, como numa tabela de verdade.
 */
function Marca({ v }: { v: string | boolean }) {
  return (
    <span className="w-[54px] shrink-0 flex items-start justify-end pt-px" aria-hidden={typeof v !== 'string'}>
      {v === true ? (
        <Check size={15} className="text-good" aria-label="incluído" />
      ) : v === false ? (
        <Minus size={15} className="text-border-subtle" aria-label="não incluído" />
      ) : (
        <span className="text-[11px] font-extrabold text-ink whitespace-nowrap leading-[1.35]">{v}</span>
      )}
    </span>
  );
}

/**
 * UM CARTÃO POR PLANO (referência de design) — a MESMA `RECURSOS`, só lida em coluna em vez de
 * em linha. Nenhum dado novo: cada cartão lista as mesmas linhas que a tabela já mostrava,
 * filtradas para a chave do próprio plano.
 */
function CartaoDePlano({
  planoId,
  nome,
  icone,
  tagline,
  preco,
  sufixo,
  destaque,
  atual,
}: {
  planoId: 'gratis' | 'essencial' | 'pro';
  nome: string;
  icone: React.ReactNode;
  /** A frase que diz ONDE o plano processa — é o que separa um do outro. */
  tagline: string;
  preco: string;
  sufixo: string;
  destaque?: boolean;
  atual?: boolean;
}) {
  const chave = planoId === 'gratis' ? 'gratis' : planoId;
  return (
    /* `overflow-visible` é obrigatório aqui: `.card-panel` recorta o conteúdo, e era isso que
       cortava a fita "Recomendado" ao meio (ela fica meio corpo acima da borda, como no design).
       A grade reserva o espaço com um `pt-3`. */
    <div
      className={`card-panel bg-surface overflow-visible p-5 flex flex-col gap-4 relative ${
        destaque ? 'border-accent' : ''
      }`}
    >
      {destaque && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 badge-tag acc whitespace-nowrap px-3 py-1 shadow-btn">
          Recomendado
        </span>
      )}

      <div>
        <span
          className={`flex items-center gap-1.5 font-display font-bold text-[15px] ${destaque ? 'text-accent-ink' : 'text-ink'}`}
        >
          {icone} {nome}
        </span>
        <p className="text-[12px] text-ink-muted mt-0.5">{tagline}</p>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="font-display font-black text-[25px] text-ink tracking-tight whitespace-nowrap">{preco}</span>
        <span className="text-ink-muted text-[12.5px] whitespace-nowrap">{sufixo}</span>
      </div>

      <div className="h-px bg-border-subtle" aria-hidden />

      <ul className="flex flex-col gap-2.5 flex-1">
        {RECURSOS.map((r) => (
          <li key={r.nome} className="flex items-start gap-2.5 text-[12.5px] text-ink-muted" title={r.fonte}>
            <Marca v={r[chave]} />
            <span className="leading-snug">{r.nome}</span>
          </li>
        ))}
      </ul>

      {/* O BOTÃO EXISTE SEMPRE, e é ele que fecha o cartão (sem ele o cartão terminava no ar, e
          o destaque do Pro não tinha onde pousar). No plano atual ele é um selo desativado; nos
          outros, leva ao bloco de assinatura no fim da página — que é onde a assinatura acontece
          de verdade, ou onde está dito por que ela não existe nesta instalação. Um botão que
          COBRASSE daqui seria promessa sem provedor; um que leva a quem responde, não é. */}
      {atual || planoId === 'gratis' ? (
        /* Plano GRÁTIS nunca ganha "Assinar": não há o que assinar, e o botão dizia
           "Assinar Grátis". Quando não é o plano em uso, ele afirma o que de fato é — a base que
           não expira e não cobra. */
        <span className="w-full rounded-xl border border-border-subtle bg-canvas py-2.5 text-center text-[13px] font-bold text-ink-muted">
          {atual ? 'Plano atual' : 'Sempre disponível'}
        </span>
      ) : (
        <a
          href="#assinar"
          className={`w-full rounded-xl py-2.5 text-center text-[13px] font-bold cursor-pointer transition-opacity hover:opacity-90 ${
            destaque
              ? 'bg-accent text-accent-contrast'
              : 'border border-border-subtle bg-canvas text-ink hover:border-accent'
          }`}
        >
          Assinar {nome}
        </a>
      )}
    </div>
  );
}

function LinhaDeUso({
  titulo,
  usado,
  teto,
  formatar,
  explicacao,
}: {
  titulo: string;
  usado: number;
  teto: number | null;
  formatar: (n: number) => string;
  explicacao: string;
}) {
  const f = fracao({ usado, teto });
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] font-semibold text-ink">{titulo}</span>
        <span className="text-[13px] text-ink-muted">
          {/* Sem teto NÃO vira barra vazia: uma barra a 0% pareceria "nada usado". */}
          {formatar(usado)}
          {teto === null ? ' · sem limite' : ` de ${formatar(teto)}`}
        </span>
      </div>
      {f !== null && (
        <Barra
          pct={f * 100}
          tom={f > 0.9 ? 'warn' : 'accent'}
          rotuloAcessivel={`${titulo}: ${formatar(usado)} de ${formatar(teto ?? 0)}`}
          tamanho="fina"
        />
      )}
      <p className="text-[12px] text-ink-muted mt-1">{explicacao}</p>
    </div>
  );
}

export default function Planos() {
  const [entitlements, setEntitlements] = useState(() => getEntitlements());
  const [uso, setUso] = useState<UsoDoMes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('planos');
  const [verMetodo, setVerMetodo] = useState(false);

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

  return (
    <div className="flex-1 overflow-y-auto w-full bg-canvas">
      <div className="p-6 md:p-10 max-w-6xl mx-auto w-full">
        {/* Sem o rótulo "PLANO E CONSUMO" em cima do título: o item de menu já se chama Planos e
            o título já diz "Seu plano" — era a terceira vez que a mesma palavra aparecia antes de
            qualquer conteúdo. O design abre direto no título. */}
        <header className="mb-6">
          <h1 className="font-display font-black text-2xl md:text-3xl text-ink tracking-tight mb-1.5">Seu plano</h1>
          <p className="text-ink-muted text-[14px]">
            Você está no plano <strong className="text-ink">{t(PLAN_LABELS[meuPlano])}</strong>.
          </p>
        </header>

        <Abas
          itens={[
            { id: 'planos', rotulo: 'O que cada plano dá' },
            { id: 'uso', rotulo: 'Consumo do mês' },
          ]}
          ativo={aba}
          aoTrocar={setAba}
          rotuloDoGrupo="Seções do plano"
        />

        <PainelDeAba id="planos" ativo={aba}>
          {/* `pt-3` abre o espaço da fita "Recomendado", que fica meio corpo acima da borda do
              cartão. `items-stretch` mantém os três da mesma altura, com o botão no mesmo y. */}
          <div className="grid sm:grid-cols-3 gap-4 pt-3 items-stretch">
            <CartaoDePlano
              planoId="gratis"
              nome="Grátis"
              icone={<Cpu size={16} aria-hidden />}
              tagline="Tudo local, sem custo"
              preco="R$ 0"
              sufixo="/sempre"
              /* `selfhost` entra aqui porque é o Grátis rodando na sua máquina — é o que o bloco de
                 assinatura afirma no fim da página. Sem ele, nenhum dos três cartões se reconhecia
                 como o plano em uso no self-host, que é justamente a instalação mais comum. */
              atual={meuPlano === 'free' || meuPlano === 'anonimo' || meuPlano === 'selfhost'}
            />
            <CartaoDePlano
              planoId="essencial"
              nome="Essencial"
              icone={<Sparkles size={16} aria-hidden />}
              tagline="Tradução com IA de nuvem"
              preco={`R$ ${precoDoPlano('essencial')}`}
              sufixo="/mês"
              atual={meuPlano === 'essencial'}
            />
            <CartaoDePlano
              planoId="pro"
              nome="Pro"
              icone={<Cloud size={16} aria-hidden />}
              tagline="Tudo processado no servidor"
              preco={`R$ ${precoDoPlano('pro')}`}
              sufixo="/mês"
              destaque
              atual={meuPlano === 'pro'}
            />
          </div>
          {/* UM PARÁGRAFO DE RODAPÉ, como no design. Eram quatro linhas de fonte mais dois
              parágrafos longos: seis blocos de texto miúdo embaixo de três cartões, que é o que
              deixava a tela com cara de documento e não de comparativo.
              A informação não saiu: a fonte de cada número agora é o `title` da própria linha
              (onde a dúvida nasce) e o detalhe do método abre no link abaixo. */}
          <p className="text-[11.5px] text-ink-muted mt-5 leading-relaxed max-w-[80ch]">
            As porcentagens são <strong className="text-ink">medidas</strong> (WER no corpus CORAA de fala espontânea
            brasileira e chrF++ em conjunto anotado), não estimadas. O Grátis roda tudo no seu computador; o Essencial
            manda só a tradução para a nuvem; o Pro processa tudo no servidor. Rodando no seu computador (self-host):
            sem limites.
          </p>

          <button
            onClick={() => setVerMetodo((v) => !v)}
            aria-expanded={verMetodo}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold text-accent-ink hover:underline cursor-pointer"
          >
            Como cada número foi medido{' '}
            {verMetodo ? <ChevronUp className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
          </button>

          {verMetodo && (
            <ul className="mt-2 space-y-1 animate-in fade-in duration-200">
              {RECURSOS.filter((r) => r.fonte).map((r) => (
                <li key={r.nome} className="text-[11px] text-ink-faint">
                  <span className="font-semibold text-ink-muted">{r.nome}:</span> {r.fonte}
                </li>
              ))}
              <li className="text-[11px] text-ink-faint">
                {/* Sem caminho de repositório na tela (ux-v2 §1.10): o leigo não tem onde clicar num
                    path de arquivo; o método publicado é alcançável pelo GitHub do projeto (Sobre). */}
                O método e os números completos estão publicados no repositório do projeto — o link fica na tela Sobre.
              </li>
            </ul>
          )}

          {/* Destino do "Assinar" dos cartões. Só renderiza a compra no modo público com billing
              configurado; sem isso, diz por que não há o que assinar aqui — ver o cabeçalho do
              componente. */}
          <div id="assinar" className="mt-6 scroll-mt-4">
            <Assinar />
          </div>
        </PainelDeAba>

        <PainelDeAba id="uso" ativo={aba}>
          <div className="card-panel bg-surface p-5">
            {carregando && <p className="text-[13px] text-ink-muted">Carregando…</p>}

            {!carregando && !uso && (
              <Vazio
                titulo="Consumo indisponível"
                explicacao="Não consegui falar com o servidor agora. Isto NÃO significa consumo zero — significa que não sei o número."
              />
            )}

            {uso && (
              <>
                <p className="text-[12px] text-ink-muted mb-4">Janela {uso.janela} · zera na virada do mês</p>

                <LinhaDeUso
                  titulo="Chamadas à IA de nuvem"
                  usado={uso.chamadas.usado}
                  teto={uso.chamadas.teto}
                  formatar={(n) => numero(n)}
                  explicacao="Transcrição, tradução e tutor dividem este limite. Cada fala ao microfone usa duas: uma para transcrever, outra para traduzir."
                />

                <LinhaDeUso
                  titulo="Áudio transcrito na nuvem"
                  usado={uso.segundosDeAudio.usado}
                  teto={uso.segundosDeAudio.teto}
                  formatar={duracaoLegivel}
                  explicacao="O provedor cobra no mínimo 10 segundos por trecho enviado, então falas curtas contam como 10."
                />

                {uso.tokensDeLlm.usado > 0 && (
                  <div className="text-[12px] text-ink-muted pt-2 border-t border-subtle">
                    {numero(uso.tokensDeLlm.usado)} tokens de tradução usados neste mês. Não há limite para isso — é
                    registrado só para acompanhar custo.
                  </div>
                )}

                {uso.chamadas.teto === null && (
                  <p className="text-[12px] text-ink-muted mt-2">
                    Rodando no seu computador (self-host): sem limites, e o custo da IA de nuvem é seu, pela sua própria
                    chave.
                  </p>
                )}
              </>
            )}
          </div>
        </PainelDeAba>
      </div>
    </div>
  );
}
