import { Lock, Palette, Pencil, Save, ShoppingBag, Sparkles, Sprout, Trash2, Trophy, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { comprarPecaComSeeds } from '../../../lib/galeria/comprarPeca';
import { cromaEquipado } from '../../../lib/galeria/cromas';
import { type ContextoDeEquipar, equiparItem, equipavel } from '../../../lib/galeria/equipar';
import { paletaPorId } from '../../../lib/galeria/paletas';
import type { Perfil } from '../../../lib/galeria/perfis';
import { estadoDaColecao } from '../../../lib/galeria/progressao';
import { comemorar } from '../../../lib/juice';
import {
  CATALOGO_DA_LOJA,
  COR_DA_RARIDADE,
  type DestinoDeObtencao,
  estadoDoItem,
  type ItemDaLoja,
  ORIGEM,
  type OrigemDoItem,
  rotaDeObtencao,
} from '../../../lib/loja';
import { possuidos } from '../../../lib/loja';
import MiniaturaDoItem from '../../MiniaturaDoItem';
import { toast } from '../../Toast';
import EditorDoItem, { temPersonalizacao } from './EditorDoItem';

/**
 * O INVENTÁRIO (protótipo aprovado 01/09) — a arrumação que jogos usam há vinte anos: **o que
 * está vestido no topo, o acervo no meio, o item escolhido na lateral**.
 *
 * O QUE ISTO SUBSTITUI, e por quê:
 *
 * · A fila de chips "paleta: X · fonte: Y" dizia o que estava equipado em texto corrido. Vira um
 *   LOADOUT de caixas: a mesma informação, mas com o formato que se reconhece de relance — e
 *   cada caixa é o atalho para trocar aquela peça.
 * · Os três baldes por origem ("ganhei / comprei / conquistei") mostravam no máximo 5 nomes por
 *   caixa e escondiam o resto atrás de um "+N" que ia para a Loja. O acervo inteiro agora está
 *   na grade, e a ORIGEM virou etiqueta do item — some a caixa, fica a informação.
 * · Equipar exigia caçar a peça no acordeão certo. Aqui é um clique na grade e um botão na
 *   prévia, pelo MESMO `equiparItem` de sempre — nenhum caminho novo de equipar nasceu aqui.
 * · **PERFIS viraram uma categoria** (pedido do dono, 01/09). Eram uma grade de 19 cartões
 *   soltos embaixo da tela, com layout próprio — o último pedaço de "conteúdo legado" fora do
 *   inventário. Perfil é um loadout inteiro em vez de uma peça, e é exatamente assim que jogo
 *   trata: uma aba ao lado das peças, não uma seção à parte.
 *
 * O ACERVO INTEIRO E A ROTA DE AQUISIÇÃO (08/09). O inventário respondia "o que é meu" e parava
 * ali: uma peça que ainda não fosse sua não existia nesta tela, e as de conquista e de nível não
 * existiam em tela nenhuma antes de serem obtidas — a Loja só mostra o que se compra. Agora a
 * grade tem dois estados ("meu acervo" e "tudo que existe"), a peça trancada aparece com cadeado,
 * e o cartão dela responde **como se consegue**, com o botão para a tela que entrega. O texto sai
 * de `rotaDeObtencao` e a cor de `ORIGEM`, os dois em `lib/loja.ts`, pelo mesmo motivo de sempre:
 * uma régua só. A versão anterior desta tela escrevia os quatro caminhos à mão e mostrava o ID da
 * conquista onde devia mostrar o nome.
 *
 * O BOTÃO "PERSONALIZAR" SÓ APARECE ONDE HÁ O QUE PERSONALIZAR (`temPersonalizacao`): oferecer o
 * editor num item sem parâmetro seria abrir uma janela vazia — a versão do controle falso que a
 * casa proíbe.
 */

/* Perfis logo depois de "Tudo": é o caminho mais curto para mudar tudo, e vem antes das peças
   pela mesma razão que um jogo põe loadouts antes do arsenal. */
const CATEGORIAS: Array<{ id: string; nome: string }> = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'perfis', nome: 'Perfis' },
  { id: 'tema', nome: 'Temas' },
  { id: 'particulas', nome: 'Partículas' },
  { id: 'rastro', nome: 'Rastros' },
  { id: 'cursor', nome: 'Cursores' },
  { id: 'pack', nome: 'Emojis' },
  { id: 'fonte', nome: 'Fontes' },
  { id: 'posicao', nome: 'Layout' },
  { id: 'galeria', nome: 'Capacidades' },
];

/** O ícone da tela para onde a rota manda — o mesmo desenho que a tela de destino usa no menu. */
const DESTINO: Record<DestinoDeObtencao, React.ReactNode> = {
  conquistas: <Trophy className="w-3.5 h-3.5" aria-hidden />,
  loja: <ShoppingBag className="w-3.5 h-3.5" aria-hidden />,
  passe: <Sparkles className="w-3.5 h-3.5" aria-hidden />,
};

/** As quatro cores de um perfil, quando ele aponta para uma paleta. */
function coresDoPerfil(p: Perfil): string[] | null {
  const pal = p.paleta ? paletaPorId(p.paleta) : null;
  return pal ? [pal.canvas, pal.surface, pal.accent, pal.ink] : null;
}

export default function Inventario({
  nivel,
  saldo,
  ctx,
  equipadoAtual,
  loadout,
  onIrParaLoja,
  onIrParaPasse,
  onIrParaConquistas,
  aoMudar,
  perfis,
  faltaDoPerfil,
  aoAplicarPerfil,
  aoRenomearPerfil,
  aoApagarPerfil,
  aoSalvarPerfil,
}: {
  nivel: number;
  saldo: number;
  ctx: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
  /** As peças vestidas agora, na ordem em que a pessoa pensa nelas. */
  loadout: Array<{ chave: string; rotulo: string; valor: string; icone: string; categoria: string }>;
  onIrParaLoja: () => void;
  /* Os outros dois destinos de uma rota de obtenção. Opcionais porque nem toda tela que monta o
     inventário tem para onde mandar — sem o callback, o cartão explica a rota e não oferece o
     botão, que é melhor do que um botão que não leva a lugar nenhum. */
  onIrParaPasse?: () => void;
  onIrParaConquistas?: () => void;
  /** Avisa a tela de fora que algo foi equipado/comprado — ela relê posse e saldo. */
  aoMudar: () => void;
  /** Os perfis, na ordem em que aparecem (os seus primeiro). */
  perfis: Perfil[];
  /** O que falta liberar para o perfil poder ser aplicado — vazio = dá para aplicar. */
  faltaDoPerfil: (p: Perfil) => string[];
  aoAplicarPerfil: (p: Perfil, el?: HTMLElement | null) => void;
  aoRenomearPerfil: (p: Perfil) => void;
  aoApagarPerfil: (p: Perfil) => void;
  aoSalvarPerfil: (nome: string) => void;
}) {
  const [categoria, setCategoria] = useState('tudo');
  /* O ACERVO INTEIRO, e não só o meu. O inventário respondia "o que é seu" muito bem e não
     respondia "o que existe" de jeito nenhum: para ver o resto era preciso ir à Loja, que só
     mostra o que se compra — os itens de conquista e os de nível não aparecem em lugar nenhum
     antes de serem seus. Com o segundo botão ligado, a grade mostra o catálogo todo, os seus
     primeiro, e o cartão de cada trancado diz a rota. `false` é o padrão porque a pergunta mais
     frequente na tela de Personalizar continua sendo "o que eu tenho". */
  const [verTudo, setVerTudo] = useState(false);
  const [editando, setEditando] = useState<ItemDaLoja | null>(null);
  /** Id da peça em compra — o botão vira "Comprando…" e não aceita um segundo clique. */
  const [comprando, setComprando] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState('');
  const [, force] = useState(0);
  const rerender = () => {
    force((n) => n + 1);
    aoMudar();
  };

  const colecao = useMemo(() => estadoDaColecao(nivel, saldo), [nivel, saldo, comprando]); // eslint-disable-line react-hooks/exhaustive-deps -- `comprando` força reler a posse depois da compra
  const comprados = useMemo(() => possuidos(), [colecao]); // eslint-disable-line react-hooks/exhaustive-deps -- a posse é lida junto com a coleção

  /** A origem de um item que JÁ é seu: como ele chegou até aqui. */
  const origemDe = (i: ItemDaLoja): OrigemDoItem =>
    i.exclusivoDe ? 'conquista' : comprados.has(i.id) ? 'seeds' : 'nivel';

  const emPerfis = categoria === 'perfis';
  const meus = colecao.possuidos;
  const meusIds = useMemo(() => new Set(meus.map((m) => m.id)), [meus]);
  const acervo = verTudo ? CATALOGO_DA_LOJA : meus;
  const lista = useMemo(() => {
    const filtrados = categoria === 'tudo' ? acervo : acervo.filter((i) => i.tipo === categoria);
    if (!verTudo) return filtrados;
    /* Os meus na frente: quem liga o catálogo completo quer ver o que falta SEM perder de vista o
       que já tem, e uma grade em ordem de arquivo enterraria as peças próprias no meio. */
    return [...filtrados].sort((a, b) => Number(meusIds.has(b.id)) - Number(meusIds.has(a.id)));
  }, [acervo, categoria, verTudo, meusIds]);
  const equipar = (i: ItemDaLoja, el?: HTMLElement | null) => {
    if (!equipavel(i)) {
      toast.ok(
        `${i.nome} é uma capacidade: ela já está ativa e abre opções no botão Personalizar da peça que ela destrava.`,
      );
      return;
    }
    if (equiparItem(i, ctx)) {
      comemorar('acerto', el ?? null, { texto: i.nome });
      rerender();
    } else {
      const { motivo } = estadoDoItem(i, nivel, saldo);
      toast.warn(`${i.nome}: ${motivo ?? 'ainda trancado'}.`);
    }
  };

  /**
   * COMPRAR A PEÇA AQUI MESMO — o botão "Comprar · N" do design.
   *
   * A transação é a de `lib/galeria/comprarPeca`, a MESMA que a Loja chama, com o mesmo
   * `spendId`: o débito é idempotente por item, então clicar duas vezes ou comprar o mesmo item
   * nas duas telas cobra uma vez. Aqui fica só a reação — festa, aviso e reler a posse.
   */
  const comprar = async (i: ItemDaLoja, el?: HTMLElement | null) => {
    setComprando(i.id);
    try {
      const compra = await comprarPecaComSeeds(i);
      if (!compra.ok) {
        /* Recusa NÃO celebra e NÃO marca posse — ver a guarda em `comprarPecaComSeeds`. Com o
           motivo na mão, "faltam 12 Seeds" é acionável onde "tente de novo" não era. */
        toast.warn(
          compra.faltam > 0
            ? `Faltam ${compra.faltam} Seeds para levar ${i.nome}. Nada foi cobrado.`
            : 'Não deu para completar a compra agora. Nada foi cobrado.',
        );
        return;
      }
      comemorar('subiuNivel', el ?? null, { texto: 'Seu!' });
      toast.ok(`${i.nome} é seu!`);
      /* `rerender` relê a POSSE (é o que faz a peça comprada virar "Equipar"). O SALDO não: ele
         chega por prop, derivado de `progress`, e só muda quando o App recarrega as métricas —
         mesma limitação que a Loja sempre teve. Enquanto isso, um segundo cartão pode oferecer
         "Comprar" com Seeds que já não existem; quem decide é o servidor, e a recusa agora diz
         quantas faltam em vez de "tente de novo". É o motivo de a mensagem acima ser específica. */
      rerender();
    } finally {
      setComprando(null);
    }
  };

  return (
    <section className="space-y-4">
      {/* ── LOADOUT: o que está vestido agora ─────────────────────────────────────────────
             UMA FAIXA DE CHIPS, não uma grade de blocos. No design esta linha é
             "🎨 Tema · Babel Atelier" em sequência, do tamanho de um chip; aqui eram seis caixas
             de ~130px de altura com o miolo vazio, gastando meia tela para dizer seis palavras.
             Mesma informação, mesmo clique (vai para a categoria daquela peça), um terço da altura. */}
      <div className="card-panel bg-surface p-4 flex flex-wrap gap-2">
        {loadout.map((s) => (
          <button
            key={s.chave}
            onClick={() => setCategoria(s.categoria)}
            title={`Trocar ${s.rotulo.toLowerCase()}`}
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-canvas px-3 py-2 cursor-pointer hover:border-accent transition-colors"
          >
            <span className="text-[15px] leading-none" aria-hidden>
              {s.icone}
            </span>
            <span className="text-[11.5px] text-ink-muted">{s.rotulo}</span>
            <span className="text-[12px] font-bold text-ink">{s.valor}</span>
          </button>
        ))}
      </div>

      {/* ── CATEGORIAS: abas em pílula, na horizontal ───────────────────────────────────────
             Era um trilho VERTICAL de 150px, que comia largura em toda sessão e obrigava a grade
             a caber em três colunas de ladrilhos de ~100px — foi isso que deixou o acervo
             ilegível, não o tamanho da tela. Na horizontal (como o design e como o resto do app),
             a grade recebe a largura de volta e o cartão pode ter prévia, nome e ação. */}
      {/* `aria-pressed` em botões simples, e NÃO `role="tab"`.
          A primeira versão anunciou `role="tablist"`/`role="tab"` sem `role="tabpanel"` nem
          `aria-controls` — um tablist que não aponta para painel nenhum promete ao leitor de tela
          uma navegação que não existe, e é pior do que o `aria-pressed` que havia antes. Estes
          botões filtram uma grade que já está na tela: é estado de alternância, não aba. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Categorias do inventário">
        {CATEGORIAS.map((c) => {
          /* A contagem segue o ACERVO em exibição, não a posse: contando só o que é meu, ligar
             "catálogo completo" deixava sumidas justamente as categorias em que ainda não tenho
             nada — que são as únicas que o catálogo completo existe para mostrar. */
          const n =
            c.id === 'tudo'
              ? acervo.length
              : c.id === 'perfis'
                ? perfis.length
                : acervo.filter((i) => i.tipo === c.id).length;
          if (n === 0 && c.id !== 'tudo') return null;
          const ativa = categoria === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCategoria(c.id)}
              aria-pressed={ativa}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 font-bold text-[12.5px] cursor-pointer inline-flex items-center gap-2 transition-colors ${
                ativa
                  ? 'bg-ink border-ink text-ink-contrast'
                  : 'bg-surface border-border-subtle text-ink-muted hover:border-accent hover:text-ink'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {c.id === 'perfis' && <Wand2 className="w-3.5 h-3.5 shrink-0" aria-hidden />}
                {c.nome}
              </span>
              <span
                className={`font-mono text-[11px] tabular-nums ${ativa ? 'text-ink-contrast/60' : 'text-ink-faint'}`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── O ACERVO EM EXIBIÇÃO — um par de links, não um segmentado ──────────────────────
             O design não tem este controle (ele mostra só o que existe). Ele fica porque responde
             uma pergunta real ("o que eu tenho" vs "o que existe"), mas como TEXTO: um segmentado
             com dois botões e duas contagens disputava atenção com as abas de categoria logo
             acima, e são dois níveis de filtro diferentes na mesma altura. */}
      {!emPerfis && (
        <div className="flex items-center gap-3 text-[12px]">
          <button
            onClick={() => setVerTudo(!verTudo)}
            className="text-accent-ink font-bold hover:underline cursor-pointer"
          >
            {verTudo ? `Ver só o meu acervo (${meus.length})` : `Ver tudo que existe (${CATALOGO_DA_LOJA.length})`}
          </button>
          <span className="text-ink-faint">
            {verTudo ? 'mostrando o catálogo inteiro' : `mostrando as ${meus.length} peças que já são suas`}
          </span>
        </div>
      )}

      {emPerfis ? (
        <>
          {/* Salvar mora AQUI, e não numa barra global: guardar o visual atual é uma ação
              sobre perfis, e é nesta categoria que ela é procurada. */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              placeholder="Nome para salvar o visual de agora"
              className="flex-1 min-w-[12rem] px-3 py-2 rounded-xl bg-surface border border-border-subtle text-[13px] text-ink outline-none focus:border-accent"
            />
            <button
              onClick={() => {
                aoSalvarPerfil(nomeNovo);
                setNomeNovo('');
                rerender();
              }}
              className="btn-outline"
            >
              <Save className="w-4 h-4" aria-hidden /> Salvar este visual
            </button>
          </div>

          {/* O CARTÃO DE PERFIL DO DESIGN: emoji, nome, o que ele é, e "Aplicar perfil" em
              laranja cheio. Aqui o laranja é certo — é a única ação da aba, e é a que o design
              destaca (nas abas de peça o botão é de contorno, e continua de contorno). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {perfis.map((p) => {
              const falta = faltaDoPerfil(p);
              const cores = coresDoPerfil(p);
              return (
                <div
                  key={p.id}
                  /* Mesmo atalho do cartão de peça: duplo-clique aplica, e o botão continua sendo
                     o caminho acessível. */
                  onDoubleClick={(e) => aoAplicarPerfil(p, e.currentTarget)}
                  className="rounded-[14px] border border-border-subtle bg-surface p-4 flex flex-col gap-2 hover:border-accent transition-colors"
                >
                  <span className="flex items-center gap-2" aria-hidden>
                    <span className="text-[20px] leading-none">{p.emoji}</span>
                    {cores && (
                      <span className="flex gap-1">
                        {cores.map((c, i) => (
                          <span
                            key={i}
                            className="w-3 h-3 rounded-full border border-border-subtle"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </span>
                    )}
                    {p.proprio && <span className="label-mono text-[9px] text-ink-faint ms-auto">seu</span>}
                  </span>

                  <p className="font-display font-bold text-[13px] text-ink leading-tight">{p.nome}</p>
                  <p className="text-[11px] text-ink-muted leading-snug">{p.desc}</p>

                  {falta.length > 0 && (
                    <p className="label-mono text-[9.5px] text-ink-faint leading-tight">
                      falta liberar {falta.length === 1 ? '1 peça' : `${falta.length} peças`}
                    </p>
                  )}

                  <button
                    onClick={(e) => {
                      aoAplicarPerfil(p, e.currentTarget);
                      rerender();
                    }}
                    className={`mt-auto w-full rounded-lg py-2 text-[12.5px] font-bold cursor-pointer ${
                      falta.length
                        ? 'border border-border-subtle bg-canvas text-ink-muted hover:border-accent hover:text-accent-ink'
                        : 'bg-accent text-accent-contrast hover:brightness-110'
                    }`}
                  >
                    {/* Trancado o botão continua clicável de propósito: `aoAplicarPerfil` diz
                        EXATAMENTE o que falta liberar. Um botão morto não diria nada. */}
                    {falta.length ? 'Faltam peças' : 'Aplicar perfil'}
                  </button>

                  {p.proprio && (
                    <span className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => {
                          aoRenomearPerfil(p);
                          rerender();
                        }}
                        className="text-[11px] text-ink-faint hover:text-ink inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" aria-hidden /> renomear
                      </button>
                      <button
                        onClick={() => {
                          aoApagarPerfil(p);
                          rerender();
                        }}
                        className="text-[11px] text-ink-faint hover:text-error inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden /> apagar
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : lista.length === 0 ? (
        /* O "SEU" É A PALAVRA QUE IMPORTA quando os dois acervos convivem na mesma grade:
           sem ela, a mesma frase serviria para "você não tem nada aqui" e para "não existe
           nada aqui", que são notícias opostas. */
        <p className="text-[13px] text-ink-muted py-8 text-center">
          {verTudo ? (
            'Esta categoria ainda não tem peça nenhuma no catálogo.'
          ) : (
            <>
              Nada seu nesta categoria ainda.{' '}
              <button onClick={() => setVerTudo(true)} className="underline text-accent-ink cursor-pointer">
                Ver o que existe
              </button>
              .
            </>
          )}
        </p>
      ) : (
        /* ── O CARTÃO DE PEÇA, no formato do design ───────────────────────────────────────
           Prévia larga no topo, nome, o que a peça é, e a ação num botão de contorno da largura
           do cartão. O que mudou nesta rodada, e por quê:

           · SAIU O PAINEL LATERAL de 280px. Ele era a única forma de saber o que uma peça é e a
             única forma de equipar — então a grade tinha de ser um mosaico de ladrilhos de 100px
             ao lado dele, e o design não tem nada disso. Tudo o que o painel dizia mora agora no
             cartão: descrição, origem, raridade, requisito, e os dois botões (equipar/comprar e
             o editor). Nada se perdeu, e a grade ganhou a largura inteira.
           · SAIU A COR DE RARIDADE DA BORDA. Quatro cores de borda (roxo, dourado, azul, neutro)
             espalhadas por 130 cartões era o que sobrava de "colorido" numa tela que o design
             desenhou inteira em bege e creme. A raridade continua escrita, na linha mono.
           · O BOTÃO "COMPRAR · N" É O DO DESIGN E COMPRA DE VERDADE: a transação saiu para
             `lib/galeria/comprarPeca`, com o MESMO `spendId` da Loja (compra dobrada não cobra
             duas vezes). Ele só aparece quando dá para comprar; quando falta nível ou é exclusivo
             de conquista, o cartão diz o requisito e o botão leva à tela que entrega. */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lista.map((i) => {
            // A MESMA RÉGUA de sempre decide o cadeado: a grade não tem opinião própria sobre
            // o que está liberado. No acervo próprio ela responde 'equipavel' para todos.
            const est = estadoDoItem(i, nivel, saldo);
            const liberado = est.estado === 'equipavel';
            const eq = liberado && equipadoAtual(i);
            const podeComprar = est.estado === 'compravel' && i.precoSeeds !== undefined;
            // O croma equipado aparece na grade: sem isso a peça personalizada some no meio
            // das iguais, e o gasto de Seeds não teria como se mostrar.
            const croma = cromaEquipado(i.id);
            const origem = origemDe(i);
            /* A ROTA vale para toda peça que ainda não é minha — inclusive a que dá para comprar
               agora, porque é ela que diz de onde a peça vem. Só o BOTÃO de destino é que some
               quando há "Comprar · N", para não competir com a compra. */
            const rota = liberado ? null : rotaDeObtencao(i, saldo);
            const legenda = liberado
              ? i.raridade !== 'comum' || origem !== 'nivel'
                ? `${COR_DA_RARIDADE[i.raridade].rotulo} · ${ORIGEM[origem].rotulo}`
                : null
              : (rota?.titulo ?? est.motivo);
            const irPara =
              !rota || podeComprar
                ? undefined
                : rota.destino === 'conquistas'
                  ? onIrParaConquistas
                  : rota.destino === 'passe'
                    ? onIrParaPasse
                    : onIrParaLoja;
            return (
              <div
                key={i.id}
                /* O DUPLO-CLIQUE PARA EQUIPAR, de volta. Ele existia no ladrilho antigo e sumiu na
                   troca por cartão — atalho de quem usa a tela toda semana. É ADICIONAL: o botão
                   "Equipar" continua sendo o caminho pelo teclado e pelo leitor de tela, então o
                   cartão não precisa (nem deve) virar um alvo clicável por si. */
                onDoubleClick={(e) => {
                  if (liberado) equipar(i, e.currentTarget);
                }}
                className="rounded-[14px] border border-border-subtle bg-surface p-4 flex flex-col gap-2 hover:border-accent transition-colors"
              >
                {/* PEÇA DE COR: faixas na largura inteira, como no design — é assim que um tema
                    se lê de relance ("claro e terracota", "escuro e verde"). Peça sem cor própria
                    (fonte, cursor, pack, rastro) segue com a miniatura real, que é o que mostra
                    o que ela desenha. */}
                <span className="h-10 rounded-lg overflow-hidden flex border border-border-subtle/60" aria-hidden>
                  {i.previa?.length ? (
                    i.previa.map((c, n) => <span key={n} className="flex-1" style={{ backgroundColor: c }} />)
                  ) : (
                    <span className="flex-1 bg-canvas flex items-center justify-center">
                      <MiniaturaDoItem item={i} />
                    </span>
                  )}
                </span>

                <p className="font-display font-bold text-[13px] text-ink leading-tight flex items-start gap-1.5">
                  {/* O CADEADO, de volta. Ele saiu na troca por cartão e o único sinal de peça
                      trancada virou a linha de requisito em mono de 9,5px — fácil demais de não
                      ver numa grade de 130 cartões. `aria-label` porque aqui ele carrega
                      informação que nenhum outro elemento do cartão repete. */}
                  {!liberado && <Lock className="w-3 h-3 shrink-0 mt-0.5 text-ink-faint" aria-label="trancada" />}
                  <span className="min-w-0">{i.nome}</span>
                  {croma && (
                    <Palette className="w-3 h-3 shrink-0 mt-0.5 text-ink-faint" aria-label="com cor personalizada" />
                  )}
                </p>
                <p className="text-[11px] text-ink-muted leading-snug">{i.desc}</p>

                {/* COMO SE CONSEGUE, em frase inteira — de volta.
                    A primeira versão do cartão trocou isto pelo resumo de `est.motivo` ("Nível 6
                    ou 130 Seeds"), que diz o requisito e não diz o que falta. `rota.texto` diz:
                    "Chega de graça no nível 6, ou agora por 130 Seeds. Faltam 81 Seeds para o
                    atalho." A diferença entre as duas é a pessoa saber se está perto. O texto sai
                    de `rotaDeObtencao` (lib/loja.ts) — a tela não tem régua própria. */}
                {rota && <p className="text-[11px] text-ink-muted leading-snug">{rota.texto}</p>}

                {/* Raridade e origem (ou o requisito, quando trancada) em UMA linha mono — é o
                    que o painel lateral dizia em dois blocos coloridos.
                    SÓ QUANDO DIZ ALGO: "Comum · Nível" é o caso de quase todo o acervo, então a
                    linha aparecia em ~90% dos cartões sem informar nada — virava textura, que é o
                    oposto do que o design faz aqui (ele não tem legenda nenhuma). Peça rara, peça
                    comprada com Seeds, peça de conquista e peça trancada continuam dizendo. */}
                {legenda && (
                  <p className="label-mono text-[9.5px] text-ink-faint leading-tight">
                    {legenda}
                    {/* "chega estudando", "só fazendo — não se compra": a meia-frase que diz a
                        NATUREZA do canal. Vive em `ORIGEM` (lib/loja.ts) e tinha ficado sem
                        nenhum consumidor de UI no repo quando o painel lateral saiu. */}
                    {liberado && (
                      <span className="font-sans normal-case tracking-normal"> · {ORIGEM[origem].comoSeGanha}</span>
                    )}
                  </p>
                )}

                <span className="mt-auto flex flex-col gap-1.5 pt-1">
                  {podeComprar ? (
                    <button
                      onClick={(e) => void comprar(i, e.currentTarget)}
                      disabled={comprando === i.id}
                      className="w-full rounded-lg border border-border-subtle bg-canvas py-2 text-[12.5px] font-bold text-ink hover:border-accent hover:text-accent-ink cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      <Sprout className="w-3.5 h-3.5 text-good" aria-hidden />
                      {comprando === i.id ? 'Comprando…' : `Comprar · ${i.precoSeeds}`}
                    </button>
                  ) : liberado ? (
                    <button
                      onClick={(e) => equipar(i, e.currentTarget)}
                      disabled={eq}
                      className={`w-full rounded-lg border py-2 text-[12.5px] font-bold cursor-pointer ${
                        eq
                          ? 'border-border-subtle bg-good-soft text-good-ink cursor-default'
                          : 'border-border-subtle bg-canvas text-ink hover:border-accent hover:text-accent-ink'
                      }`}
                    >
                      {eq ? 'Equipado' : equipavel(i) ? 'Equipar' : 'Ativa'}
                    </button>
                  ) : rota && irPara ? (
                    <button
                      onClick={irPara}
                      className="w-full rounded-lg border border-border-subtle bg-canvas py-2 text-[12.5px] font-bold text-ink-muted hover:border-accent hover:text-accent-ink cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      {DESTINO[rota.destino]} {rota.rotuloDoBotao}
                    </button>
                  ) : null}

                  {/* O EDITOR DA PEÇA (paletas, pack próprio, croma) só aparece onde há o que
                      editar — oferecê-lo num item sem parâmetro abriria uma janela vazia. */}
                  {liberado && temPersonalizacao(i) && (
                    <button
                      onClick={() => setEditando(i)}
                      className="self-start text-[11px] text-ink-faint hover:text-accent-ink inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" aria-hidden /> personalizar
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── O QUE FALTA — atalho honesto: o acervo mostra o que é seu, e diz onde vê o resto ── */}
      <p className="text-[12px] text-ink-muted flex items-center gap-2 flex-wrap">
        <Lock className="w-3.5 h-3.5 text-ink-faint" aria-hidden />
        Faltam {colecao.compraveis.length + colecao.porNivel.length} peças na Loja e {colecao.porConquista.length} só
        por conquista.
        <button
          onClick={onIrParaLoja}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle hover:border-accent text-ink font-bold text-[11.5px] cursor-pointer"
        >
          <ShoppingBag className="w-3.5 h-3.5" aria-hidden /> Ir à Loja
        </button>
      </p>

      {editando && (
        <EditorDoItem
          item={editando}
          nivel={nivel}
          saldo={saldo}
          setTheme={ctx.setTheme}
          onIrParaLoja={onIrParaLoja}
          aoFechar={() => {
            setEditando(null);
            rerender();
          }}
          aoEquipar={() => equipar(editando)}
          aoComprar={rerender}
        />
      )}
    </section>
  );
}
