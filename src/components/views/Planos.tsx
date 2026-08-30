import { useEffect, useState } from 'react';
import { Check, Minus, Cloud, Cpu } from 'lucide-react';
import { Abas, PainelDeAba, Barra, Vazio } from '../ui';
import { getEntitlements, onPlanChange, PLAN_LABELS } from '../../lib/entitlements';
import { carregarUso, fracao, duracaoLegivel, type UsoDoMes } from '../../lib/uso';

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
 * NÃO HÁ BOTÃO DE ASSINAR, e isso é deliberado: a cobrança não existe (sem provedor escolhido, sem
 * webhook). Um botão que não cobra seria pior que nenhum. Quando o billing entrar, ele encaixa no
 * lugar marcado abaixo.
 */

/** Uma linha do comparativo. `pro` ausente = igual ao grátis. */
interface Recurso {
  nome: string;
  gratis: string | boolean;
  pro: string | boolean;
  /** De onde saiu o número, quando é medido. Aparece como nota abaixo da tabela. */
  fonte?: string;
}

const RECURSOS: Recurso[] = [
  { nome: 'Captura ao vivo (microfone e áudio do sistema)', gratis: true, pro: true },
  { nome: 'Tradução no seu navegador', gratis: true, pro: true },
  { nome: 'Identificação de falantes', gratis: true, pro: true },
  { nome: 'Jogos, vocabulário e revisão', gratis: true, pro: true },
  {
    nome: 'Erro de transcrição em português falado',
    gratis: '57%',
    pro: '24%',
    fonte: 'WER medido em 48 falas espontâneas do corpus CORAA',
  },
  {
    nome: 'Qualidade de tradução (geral)',
    gratis: '57%',
    pro: '85%',
    fonte: 'chrF++ no gold set de fenômenos de conversa',
  },
  {
    nome: 'Expressões idiomáticas',
    gratis: '27%',
    pro: '83%',
    fonte: '"Break a leg" vira "Boa sorte", não "Quebre uma perna"',
  },
  {
    nome: 'Download inicial de modelos',
    gratis: '230 a 413 MB',
    pro: 'nenhum',
    fonte: 'os modelos rodam no servidor; o navegador não baixa nada',
  },
  { nome: 'Importar do YouTube', gratis: false, pro: true },
  { nome: 'Suas sessões guardadas na conta', gratis: '500 MB', pro: '5 GB' },
  { nome: 'Sua própria chave de IA (BYOK)', gratis: true, pro: true },
];

function Marca({ v }: { v: string | boolean }) {
  if (v === true) return <Check size={16} className="text-good" aria-label="incluído" />;
  if (v === false) return <Minus size={16} className="text-ink-faint" aria-label="não incluído" />;
  return <span className="font-semibold text-ink">{v}</span>;
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
          {formatar(usado)}{teto === null ? ' · sem limite' : ` de ${formatar(teto)}`}
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

  useEffect(() => onPlanChange(() => setEntitlements(getEntitlements())), []);

  useEffect(() => {
    let vivo = true;
    void carregarUso().then((u) => {
      if (!vivo) return;
      setUso(u);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, []);

  const meuPlano = entitlements.plan;

  return (
    <div className="flex-1 overflow-y-auto w-full bg-canvas">
      <div className="p-6 md:p-10 max-w-4xl mx-auto w-full">
        <header className="mb-6">
          <span className="label-mono text-accent">Plano e consumo</span>
          <h1 className="font-display font-black text-2xl md:text-3xl text-ink tracking-tight mt-1 mb-2">
            Seu plano
          </h1>
          <p className="text-ink-muted text-[14px]">
            Você está no plano <strong className="text-ink">{PLAN_LABELS[meuPlano]}</strong>.
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
          <div className="card-panel bg-surface p-5 overflow-x-auto">
            <table className="w-full text-[13px] border-collapse min-w-[520px]">
              <thead>
                <tr className="border-b border-subtle">
                  <th className="text-left font-semibold text-ink-muted pb-3">Recurso</th>
                  <th className="text-center font-semibold text-ink pb-3 px-3 whitespace-nowrap">
                    <Cpu size={14} className="inline mr-1" aria-hidden />Grátis
                  </th>
                  <th className="text-center font-semibold text-accent pb-3 px-3 whitespace-nowrap">
                    <Cloud size={14} className="inline mr-1" aria-hidden />Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {RECURSOS.map((r) => (
                  <tr key={r.nome} className="border-b border-subtle last:border-0">
                    <td className="py-3 pr-3 text-ink">
                      {r.nome}
                      {r.fonte && <span className="block text-[11px] text-ink-faint mt-0.5">{r.fonte}</span>}
                    </td>
                    <td className="py-3 px-3 text-center"><Marca v={r.gratis} /></td>
                    <td className="py-3 px-3 text-center"><Marca v={r.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[12px] text-ink-muted mt-4 leading-relaxed">
            As porcentagens de qualidade são <strong className="text-ink">medidas</strong>, não
            estimadas: taxa de erro de palavra no corpus CORAA de fala espontânea brasileira, e
            chrF++ num conjunto anotado por fenômeno (pronome, gênero, idiomático, registro). O
            método e os números completos estão em <code>docs/auditoria/eval-producao-v1.md</code>.
          </p>

          <p className="text-[12px] text-ink-muted mt-2 leading-relaxed">
            O plano grátis roda tudo <strong className="text-ink">no seu computador</strong>: nada do
            que você fala sai do navegador. O Pro processa no servidor, o que traz a qualidade acima
            e dispensa o download dos modelos.
          </p>

          {/* AQUI ENTRA O BOTÃO DE ASSINAR quando houver provedor de pagamento e webhook. Enquanto
              não houver, um botão que não cobra seria pior que nenhum. */}
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
                <p className="text-[12px] text-ink-muted mb-4">
                  Janela {uso.janela} · zera na virada do mês
                </p>

                <LinhaDeUso
                  titulo="Chamadas à IA de nuvem"
                  usado={uso.chamadas.usado}
                  teto={uso.chamadas.teto}
                  formatar={(n) => n.toLocaleString('pt-BR')}
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
                    {uso.tokensDeLlm.usado.toLocaleString('pt-BR')} tokens de tradução usados neste
                    mês. Não há limite para isso — é registrado só para acompanhar custo.
                  </div>
                )}

                {uso.chamadas.teto === null && (
                  <p className="text-[12px] text-ink-muted mt-2">
                    Rodando no seu computador (self-host): sem limites, e o custo da IA de nuvem é
                    seu, pela sua própria chave.
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
