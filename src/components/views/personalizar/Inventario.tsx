import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Check,
  Lock,
  MousePointer2,
  Palette,
  PanelLeft,
  Pencil,
  Save,
  ShoppingBag,
  Sparkles,
  Sprout,
  Trash2,
  Trophy,
  Wand2,
  WandSparkles,
} from 'lucide-react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';

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
import { TituloDeSecao } from '../../ui';
import EditorDoItem, { temPersonalizacao } from './EditorDoItem';

/**
 * O INVENTÁRIO — "Meu visual" no desenho do protótipo aprovado (`T.personalizar`, aba visual):
 * o que está equipado num `.cartao.equipados` no topo, e as peças em SEÇÕES (`TituloDeSecao` +
 * `.gauto` de `.cartao.peca`), cada uma com prévia, nome, o que ela é e "Equipar".
 *
 * O protótipo desenha duas seções (Temas; Efeitos e letras). O app tem mais tipos de peça, e
 * cada um ganha a sua seção no MESMO molde, na ordem em que a pessoa pensa neles: cursor e
 * emojis, menu, capacidades e perfis. Seção sem peça nenhuma não aparece.
 *
 * O ACERVO INTEIRO E A ROTA DE AQUISIÇÃO (08/09). "Ver tudo que existe" liga o catálogo todo: a
 * peça trancada aparece com cadeado, e o cartão responde **como se consegue**, com o botão para
 * a tela que entrega. O texto sai de `rotaDeObtencao` e a cor de `ORIGEM` (`lib/loja.ts`): uma
 * régua só.
 *
 * O BOTÃO "PERSONALIZAR" SÓ APARECE ONDE HÁ O QUE PERSONALIZAR (`temPersonalizacao`): oferecer o
 * editor num item sem parâmetro seria abrir uma janela vazia.
 */

/* As seções, na ordem da tela. As duas primeiras são as do protótipo. */
const SECOES: Array<{ id: string; titulo: string; icone: LucideIcon; tipos: string[] }> = [
  { id: 'temas', titulo: 'Temas', icone: Palette, tipos: ['tema'] },
  { id: 'efeitos', titulo: 'Efeitos e letras', icone: WandSparkles, tipos: ['particulas', 'rastro', 'fonte'] },
  { id: 'cursor', titulo: 'Cursor e emojis', icone: MousePointer2, tipos: ['cursor', 'pack'] },
  { id: 'menu', titulo: 'Menu', icone: PanelLeft, tipos: ['posicao'] },
  { id: 'capacidades', titulo: 'Capacidades', icone: Sparkles, tipos: ['galeria', 'estudio', 'aprimoramento'] },
];

/** O ícone da tela para onde a rota manda — o mesmo desenho que a tela de destino usa no menu. */
const DESTINO: Record<DestinoDeObtencao, ReactNode> = {
  conquistas: <Trophy aria-hidden />,
  loja: <ShoppingBag aria-hidden />,
  passe: <Sparkles aria-hidden />,
};

/** As quatro cores de um perfil, quando ele aponta para uma paleta. */
function coresDoPerfil(p: Perfil): string[] | null {
  const pal = p.paleta ? paletaPorId(p.paleta) : null;
  return pal ? [pal.canvas, pal.surface, pal.accent, pal.ink] : null;
}

/** A faixa de cores da prévia (`.paleta` do protótipo): uma coluna por cor. */
function Paleta({ cores }: { cores: string[] }) {
  return (
    <div
      className="paleta"
      style={cores.length === 4 ? undefined : { gridTemplateColumns: `repeat(${cores.length},1fr)` }}
    >
      {cores.map((c, n) => (
        <span key={n} style={{ background: c }} />
      ))}
    </div>
  );
}

interface ItemDoLoadout {
  chave: string;
  rotulo: string;
  valor: string;
  icone: LucideIcon;
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
  acaoDosPerfis,
}: {
  nivel: number;
  saldo: number;
  ctx: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
  /** As peças vestidas agora, na ordem em que a pessoa pensa nelas. */
  loadout: ItemDoLoadout[];
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
  /** O que vai à direita do título de Perfis (o "voltar ao visual original"). */
  acaoDosPerfis?: ReactNode;
}) {
  /* O ACERVO INTEIRO, e não só o meu. `false` é o padrão porque a pergunta mais frequente na
     tela de Personalizar continua sendo "o que eu tenho". */
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

  const meus = colecao.possuidos;
  const meusIds = useMemo(() => new Set(meus.map((m) => m.id)), [meus]);
  const acervo = verTudo ? CATALOGO_DA_LOJA : meus;
  const daSecao = (tipos: string[]) => {
    /* Na ordem dos tipos da seção (partículas antes de fontes, como no protótipo), e não na do
       catálogo. `sort` é estável: dentro do tipo fica a ordem do catálogo. */
    const filtrados = acervo
      .filter((i) => tipos.includes(i.tipo))
      .sort((a, b) => tipos.indexOf(a.tipo) - tipos.indexOf(b.tipo));
    if (!verTudo) return filtrados;
    /* Os meus na frente: quem liga o catálogo completo quer ver o que falta SEM perder de vista o
       que já tem. */
    return [...filtrados].sort((a, b) => Number(meusIds.has(b.id)) - Number(meusIds.has(a.id)));
  };

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
   * COMPRAR A PEÇA AQUI MESMO. A transação é a de `lib/galeria/comprarPeca`, a MESMA que a Loja
   * chama, com o mesmo `spendId`: o débito é idempotente por item.
   */
  const comprar = async (i: ItemDaLoja, el?: HTMLElement | null) => {
    setComprando(i.id);
    try {
      const compra = await comprarPecaComSeeds(i);
      if (!compra.ok) {
        toast.warn(
          compra.faltam > 0
            ? `Faltam ${compra.faltam} Seeds para levar ${i.nome}. Nada foi cobrado.`
            : 'Não deu para completar a compra agora. Nada foi cobrado.',
        );
        return;
      }
      comemorar('subiuNivel', el ?? null, { texto: 'Seu!' });
      toast.ok(`${i.nome} é seu!`);
      rerender();
    } finally {
      setComprando(null);
    }
  };

  /** O `.cartao.peca` do protótipo: prévia, nome, o que ela é, e a ação. */
  const peca = (i: ItemDaLoja) => {
    // A MESMA RÉGUA de sempre decide o cadeado: a grade não tem opinião própria sobre o que
    // está liberado. No acervo próprio ela responde 'equipavel' para todos.
    const est = estadoDoItem(i, nivel, saldo);
    const liberado = est.estado === 'equipavel';
    const eq = liberado && equipadoAtual(i);
    const podeComprar = est.estado === 'compravel' && i.precoSeeds !== undefined;
    // O croma equipado aparece: sem isso a peça personalizada some no meio das iguais.
    const croma = cromaEquipado(i.id);
    const origem = origemDe(i);
    const rota = liberado ? null : rotaDeObtencao(i, saldo);
    /* Raridade e origem (ou o requisito, quando trancada) numa linha mono, SÓ QUANDO DIZ ALGO:
       "Comum · Nível" é o caso de quase todo o acervo e viraria textura. */
    const legenda = liberado
      ? i.raridade !== 'comum' || origem !== 'nivel'
        ? `${COR_DA_RARIDADE[i.raridade].rotulo} · ${ORIGEM[origem].rotulo} · ${ORIGEM[origem].comoSeGanha}`
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
      <article
        className="cartao peca"
        /* Duplo-clique equipa: atalho de quem usa a tela toda semana. O botão continua sendo o
           caminho pelo teclado e pelo leitor de tela. */
        onDoubleClick={(e) => {
          if (liberado) equipar(i, e.currentTarget);
        }}
      >
        <div className="vis">
          {i.previa?.length ? <Paleta cores={i.previa} /> : <MiniaturaDoItem item={i} tam="grande" />}
        </div>
        <h3>
          {/* O cadeado carrega informação que nenhum outro elemento do cartão repete. */}
          {!liberado && (
            <Lock
              aria-label="trancada"
              style={{ width: 13, height: 13, marginRight: 6, verticalAlign: -1, color: 'var(--ink-muted)' }}
            />
          )}
          {i.nome}
          {croma && (
            <Palette
              aria-label="com cor personalizada"
              style={{ width: 13, height: 13, marginLeft: 6, verticalAlign: -1, color: 'var(--ink-muted)' }}
            />
          )}
        </h3>
        <p>
          {i.desc}
          {/* COMO SE CONSEGUE, em frase inteira: "Chega de graça no nível 6, ou agora por 130
              Seeds. Faltam 81 Seeds para o atalho." diz se a pessoa está perto. */}
          {rota && (
            <>
              <br />
              {rota.texto}
            </>
          )}
        </p>
        {legenda && <span className="label-mono">{legenda}</span>}

        {podeComprar ? (
          <button
            type="button"
            className="btn btn-outline bloco"
            onClick={(e) => void comprar(i, e.currentTarget)}
            disabled={comprando === i.id}
          >
            <Sprout aria-hidden style={{ color: 'var(--good)' }} />
            {comprando === i.id ? 'Comprando…' : `Comprar · ${i.precoSeeds}`}
          </button>
        ) : liberado ? (
          equipavel(i) ? (
            <button
              type="button"
              className={`btn ${eq ? 'equipado' : 'btn-outline'} bloco`}
              aria-pressed={eq || undefined}
              onClick={(e) => equipar(i, e.currentTarget)}
            >
              {eq ? (
                <>
                  <Check aria-hidden /> Equipado
                </>
              ) : (
                'Equipar'
              )}
            </button>
          ) : (
            <button type="button" className="btn btn-outline bloco" onClick={(e) => equipar(i, e.currentTarget)}>
              Ativa
            </button>
          )
        ) : rota && irPara ? (
          <button type="button" className="btn btn-outline bloco" onClick={irPara}>
            {DESTINO[rota.destino]} {rota.rotuloDoBotao}
          </button>
        ) : null}

        {/* O EDITOR DA PEÇA (paletas, pack próprio, croma) só aparece onde há o que editar. */}
        {liberado && temPersonalizacao(i) && (
          <button type="button" className="link editar" onClick={() => setEditando(i)}>
            <Pencil aria-hidden /> personalizar
          </button>
        )}
      </article>
    );
  };

  const alternarAcervo = (
    <button type="button" className="link" onClick={() => setVerTudo(!verTudo)}>
      {verTudo ? `Ver só o meu acervo (${meus.length})` : `Ver tudo que existe (${CATALOGO_DA_LOJA.length})`}{' '}
      <ArrowRight aria-hidden />
    </button>
  );

  return (
    <>
      {/* ── O QUE ESTÁ EQUIPADO ── */}
      <section className="cartao equipados" aria-label="O que está equipado">
        {loadout.map(({ chave, rotulo, valor, icone: Icone }) => (
          <span key={chave} className="equip">
            <Icone aria-hidden style={{ width: 16, height: 16, color: 'var(--ink-muted)' }} />
            <small>{rotulo}</small>
            <b>{valor}</b>
          </span>
        ))}
      </section>

      {SECOES.map((s, k) => {
        const lista = daSecao(s.tipos);
        /* A primeira seção carrega o "Ver tudo que existe" (como no protótipo) e aparece mesmo
           vazia, para o controle nunca sumir. As outras só aparecem com peça. */
        if (!lista.length && k > 0) return null;
        return (
          <section key={s.id} className="secao">
            <TituloDeSecao icone={s.icone} titulo={s.titulo} direita={k === 0 ? alternarAcervo : undefined} />
            {lista.length ? (
              <div className="gauto">
                {lista.map((i) => (
                  <Fragment key={i.id}>{peca(i)}</Fragment>
                ))}
              </div>
            ) : (
              <p className="mut" style={{ fontSize: 13 }}>
                Nenhum tema seu ainda.
              </p>
            )}
          </section>
        );
      })}

      {/* ── PERFIS: um visual inteiro de uma vez. Salvar mora AQUI: guardar o visual atual é uma
             ação sobre perfis, e é nesta seção que ela é procurada. */}
      <section className="secao">
        <TituloDeSecao
          icone={Wand2}
          titulo="Perfis"
          desc="Um visual inteiro de uma vez: tema, fonte, partículas, emojis, cursor e rastro."
          direita={acaoDosPerfis}
        />
        <div className="linha" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            className="campo"
            style={{ flex: 1, minWidth: '12rem', width: 'auto' }}
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            placeholder="Nome para salvar o visual de agora"
            aria-label="Nome do perfil"
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              aoSalvarPerfil(nomeNovo);
              setNomeNovo('');
              rerender();
            }}
          >
            <Save aria-hidden /> Salvar este visual
          </button>
        </div>
        <div className="gauto">
          {perfis.map((p) => {
            const falta = faltaDoPerfil(p);
            const cores = coresDoPerfil(p);
            return (
              <article key={p.id} className="cartao peca" onDoubleClick={(e) => aoAplicarPerfil(p, e.currentTarget)}>
                <div className="vis" aria-hidden>
                  {cores ? <Paleta cores={cores} /> : <span style={{ fontSize: 28, lineHeight: 1 }}>{p.emoji}</span>}
                </div>
                <h3>
                  {cores && <span aria-hidden>{p.emoji} </span>}
                  {p.nome}
                </h3>
                <p>{p.desc}</p>
                {(p.proprio || falta.length > 0) && (
                  <span className="label-mono">
                    {[
                      p.proprio && 'seu',
                      falta.length > 0 && `falta liberar ${falta.length === 1 ? '1 peça' : `${falta.length} peças`}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                {/* Trancado o botão continua clicável de propósito: `aoAplicarPerfil` diz
                    EXATAMENTE o que falta liberar. Um botão morto não diria nada. */}
                <button
                  type="button"
                  className="btn btn-outline bloco"
                  onClick={(e) => {
                    aoAplicarPerfil(p, e.currentTarget);
                    rerender();
                  }}
                >
                  {falta.length ? 'Faltam peças' : 'Aplicar perfil'}
                </button>
                {p.proprio && (
                  <span className="linha" style={{ gap: 14 }}>
                    <button
                      type="button"
                      className="link editar"
                      onClick={() => {
                        aoRenomearPerfil(p);
                        rerender();
                      }}
                    >
                      <Pencil aria-hidden /> renomear
                    </button>
                    <button
                      type="button"
                      className="link editar"
                      onClick={() => {
                        aoApagarPerfil(p);
                        rerender();
                      }}
                    >
                      <Trash2 aria-hidden /> apagar
                    </button>
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* ── O QUE FALTA — atalho honesto: o acervo mostra o que é seu, e diz onde vê o resto ── */}
      <p className="mut linha secao" style={{ gap: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
        <Lock aria-hidden style={{ width: 14, height: 14 }} />
        Faltam {colecao.compraveis.length + colecao.porNivel.length} peças na Loja e {colecao.porConquista.length} só
        por conquista.
        <button type="button" className="link" onClick={onIrParaLoja}>
          Ir à Loja <ArrowRight aria-hidden />
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
    </>
  );
}
