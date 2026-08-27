import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Info } from 'lucide-react';
import type { AgeProfileType } from '../../lib/profile';

/**
 * MAPA DO CONTEÚDO — o que já caiu, o que nunca caiu, o que eu errei.
 *
 * POR QUE ESTA TELA EXISTE. A queixa que chegou foi "não tenho noção do que já vi, do que falta,
 * nem de progressão; fico preso nas mesmas questões". Até pouco tempo o app não tinha COMO
 * responder isso: `exercise_results` guardava a nota da rodada e mais nada — qual palavra tinha
 * caído não era gravado em lugar nenhum. As colunas `item_ref`/`round_id` (migração 0001)
 * consertaram o registro, e a antessala passou a mostrar o que vem na PRÓXIMA rodada. Faltava a
 * visão do CONJUNTO, que é onde a sensação de progressão mora: uma rodada de 7 palavras não diz
 * nada sobre as 827 do A1.
 *
 * ESTA TELA NÃO CALCULA NADA SOBRE O BARALHO. Ela recebe `itens` já cruzados (cartão × histórico ×
 * agendador) por quem a monta. É de propósito: o mesmo mapa serve à trilha, a uma sessão e ao
 * baralho inteiro, e a única diferença entre os três é a lista que chega — não a régua.
 *
 * O RISCO DE MENTIR. "Nunca caiu" só é verdade a partir do dia em que o registro por item começou.
 * Quem jogava antes disso tem rodadas que não existem no banco, e sem aviso este mapa apagaria o
 * percurso da pessoa e ainda a mandaria repetir o que ela já fez. Daí `historicoDesde`.
 */

export interface ItemDoMapa {
  /** O `item_ref`: a palavra, ou o id da fala. */
  ref: string;
  /** O que se lê: a palavra, ou o texto da fala. */
  titulo: string;
  /** Apoio: a tradução. */
  pista?: string;
  /** Vencido no agendador (revisão espaçada pedindo). */
  vencido: boolean;
  /** Quantas vezes já caiu. 0 = nunca. */
  vezes: number;
  /** Em quantas dessas a pessoa errou. */
  erros: number;
  /** Na última vez, acertou? */
  ultimoAcerto: boolean;
}

/** Só existe no modo trilha. */
interface NivelDoMapa {
  nivel: string;
  total: number;
  jaCairam: number;
  pct: number;
}

interface MapaProps {
  /** Já formatado pelo chamador: "Trilha A1", "Sessão: Captura de 28/07", "Minhas palavras". */
  titulo: string;
  itens: ItemDoMapa[];
  ageProfile: AgeProfileType;
  onVoltar: () => void;
  niveis?: NivelDoMapa[];
  nivelAtivo?: string;
  onEscolherNivel?: (n: string) => void;
  /** Avisa que o histórico começou depois; sem isso o mapa fingiria que o percurso começou do zero. */
  historicoDesde?: number | null;
}

/**
 * Teto da lista. O A1 da trilha tem 827 palavras: renderizar tudo faz o navegador montar ~800 nós
 * que ninguém vai ler de cima a baixo, e a rolagem passa a ser o oposto de uma "visão do conjunto"
 * — quem responde "quanto falta" é a faixa de saldo, não o item 613. 60 é o bastante para a lista
 * parecer uma lista e não uma amostra. O excedente é ANUNCIADO logo abaixo, porque lista cortada em
 * silêncio mente sobre o tamanho do conjunto — mesmo padrão da Curadoria e da antessala.
 */
const MAX_VISIVEL = 60;

/** Os quatro estados possíveis de um item no mapa. São excludentes por construção. */
type Estado = 'vencido' | 'errado' | 'novo' | 'visto';

/**
 * Fora do componente de propósito: é chamada uma vez por item (até ~900) dentro de um `useMemo`, e
 * recriá-la a cada render só para fechar sobre nada custaria alocação por render.
 *
 * A ORDEM DOS TESTES É A REGRA. `vencido` ganha de tudo porque é a única marca que fala de PRAZO:
 * um item pode ser "já visto" E estar vencido, e mostrar "já vi" aí esconderia justamente o motivo
 * de ele estar voltando. E "errei" exige `!ultimoAcerto`: a marca de erro vale enquanto o erro não
 * foi resolvido, senão quem errou uma vez em janeiro carrega "você errou" para sempre.
 */
function estadoDoItem(it: ItemDoMapa): Estado {
  if (it.vencido) return 'vencido';
  if (it.vezes === 0) return 'novo';
  if (it.erros > 0 && !it.ultimoAcerto) return 'errado';
  return 'visto';
}

/**
 * Selo por estado. Cada um tem TEXTO, não só cor — daltônico, tema de alto contraste e leitor de
 * tela leem igual. As variantes são as de `.badge-tag` em index.css.
 */
const SELO: Record<Estado, { texto: string; variante: string }> = {
  vencido: { texto: 'vencida', variante: 'warn' },
  errado: { texto: 'errei', variante: 'err' },
  novo: { texto: 'nunca caiu', variante: '' },
  visto: { texto: 'já vi', variante: 'ok' },
};

/**
 * Ordem de leitura da lista. Não é alfabética porque alfabética não responde nenhuma pergunta: o
 * que a pessoa quer ver primeiro é o que pede ação (vencido), depois o que resistiu (errado),
 * depois o buraco (nunca caiu). O que já está resolvido vai para o fim.
 */
const PESO: Record<Estado, number> = { vencido: 0, errado: 1, novo: 2, visto: 3 };

const FILTROS = ['todos', 'novos', 'errados', 'vistos', 'vencidos'] as const;
type Filtro = (typeof FILTROS)[number];

/**
 * O QUE CADA FILTRO DEIXA PASSAR — e ele NÃO é o estado exclusivo do selo.
 *
 * O selo é exclusivo por necessidade (uma palavra tem um rótulo só, e "vencida" ganha), mas o
 * filtro precisa casar com o que a faixa de saldo diz, senão a mesma tela mostra dois números
 * para a mesma ideia: "485 nunca entraram em rodada" no resumo e "49 inéditos" no filtro. Quem
 * lê os dois conclui, com razão, que um deles está errado.
 *
 * Por isso "inéditos" e "já vistos" são definidos pelo DADO (`vezes`), não pelo selo — e por isso
 * os filtros se sobrepõem: uma palavra vencida que nunca caiu aparece nos dois. Sobreposição é
 * honesta; número que não fecha, não.
 */
interface Anotado { it: ItemDoMapa; estado: Estado }

const PASSA_NO_FILTRO: Record<Filtro, (a: Anotado) => boolean> = {
  todos: () => true,
  novos: a => a.it.vezes === 0,
  errados: a => a.estado === 'errado',
  vistos: a => a.it.vezes > 0,
  vencidos: a => a.it.vencido,
};

const ROTULO_FILTRO: Record<Filtro, Record<AgeProfileType, string>> = {
  todos: { kids: 'tudo', pro: 'todos', senior: 'todas' },
  novos: { kids: 'nunca caiu', pro: 'inéditos', senior: 'ainda não apareceram' },
  errados: { kids: 'eu errei', pro: 'com erro pendente', senior: 'que você errou' },
  vistos: { kids: 'já joguei', pro: 'já vistos', senior: 'que você já viu' },
  vencidos: { kids: 'pedindo revisão', pro: 'vencidos', senior: 'para repetir hoje' },
};

export default function MapaDoConteudo({
  titulo,
  itens,
  ageProfile,
  onVoltar,
  niveis,
  nivelAtivo,
  onEscolherNivel,
  historicoDesde,
}: MapaProps) {
  const [filtro, setFiltro] = useState<Filtro>('todos');

  /**
   * Estado calculado UMA vez por item e reaproveitado pelo saldo, pelas contagens dos filtros e
   * pela lista. Antes de existir este passo, cada uma dessas três leituras reclassificaria os 827
   * itens do A1 por conta própria a cada render.
   */
  const anotados = useMemo(
    () => itens.map(it => ({ it, estado: estadoDoItem(it) })),
    [itens],
  );

  /** Uma passada só: o saldo do topo e as contagens dos chips saem da mesma varredura. */
  const saldo = useMemo(() => {
    const porEstado: Record<Estado, number> = { vencido: 0, errado: 0, novo: 0, visto: 0 };
    for (const a of anotados) porEstado[a.estado]++;
    const total = anotados.length;
    // "Já caiu" é vezes > 0, e NÃO é o complemento de `novo`: um item vencido também já caiu.
    // Contar cobertura pelos selos daria número menor que a verdade.
    let jaCairam = 0;
    for (const a of anotados) if (a.it.vezes > 0) jaCairam++;
    return {
      total,
      jaCairam,
      /**
       * NUNCA CAIU DE VERDADE — e não `porEstado.novo`.
       *
       * Os estados são exclusivos e "vencido" ganha de "novo", então uma palavra vencida que
       * nunca entrou em rodada conta como vencida. Usar `porEstado.novo` na faixa de saldo
       * produzia números que não fecham: "505 no conjunto · 49 nunca entraram · 20 já vistos" —
       * quando o real é 485 nunca entraram. Número de resumo que não fecha destrói a confiança
       * na tela inteira; o filtro pode continuar exclusivo, o RESUMO não pode.
       */
      nunca: total - jaCairam,
      porEstado,
      pct: total > 0 ? Math.round((jaCairam / total) * 100) : 0,
    };
  }, [anotados]);

  const contagemDoFiltro = useMemo<Record<Filtro, number>>(
    () => ({
      todos: saldo.total,
      // Contadas pela MESMA regra do filtro — ver `PASSA_NO_FILTRO`.
      novos: saldo.nunca,
      errados: saldo.porEstado.errado,
      vistos: saldo.jaCairam,
      vencidos: saldo.porEstado.vencido,
    }),
    [saldo],
  );

  /** Filtro e ordenação juntos, e só quando a lista ou o filtro mudam — não a cada render. */
  const ordenados = useMemo(() => {
    const passa = PASSA_NO_FILTRO[filtro];
    const base = filtro === 'todos' ? anotados : anotados.filter(passa);
    // Cópia antes de ordenar: `anotados` é memoizado e ordenar no lugar corromperia o cache.
    return [...base].sort((a, b) =>
      PESO[a.estado] - PESO[b.estado] || a.it.titulo.localeCompare(b.it.titulo),
    );
  }, [anotados, filtro]);

  const visiveis = ordenados.slice(0, MAX_VISIVEL);

  const subtitulo: Record<AgeProfileType, string> = {
    kids: 'Tudo que dá para jogar aqui, e como você foi em cada um.',
    pro: 'Cobertura do conjunto: o que já entrou em rodada, o que nunca entrou e o que ficou errado.',
    senior: 'Veja o que já apareceu para você e o que ainda falta.',
  };
  const rotuloTotal: Record<AgeProfileType, string> = {
    kids: 'para jogar',
    pro: 'itens no conjunto',
    senior: 'palavras ao todo',
  };
  const rotuloNunca: Record<AgeProfileType, string> = {
    kids: 'nunca caíram',
    pro: 'nunca entraram em rodada',
    senior: 'ainda não apareceram',
  };
  const rotuloVistos: Record<AgeProfileType, string> = {
    kids: 'você já jogou',
    pro: 'já vistos',
    senior: 'você já viu',
  };
  const rotuloErros: Record<AgeProfileType, string> = {
    kids: 'você errou',
    pro: 'com erro pendente',
    senior: 'você errou',
  };
  const rotuloVencidos: Record<AgeProfileType, string> = {
    kids: 'pedindo revisão',
    pro: 'vencidos no agendador',
    senior: 'para repetir hoje',
  };
  const rotuloCobertura: Record<AgeProfileType, string> = {
    kids: 'deste monte você já viu',
    pro: 'deste conjunto já apareceu',
    senior: 'deste total já apareceu',
  };
  const txtVazio: Record<AgeProfileType, string> = {
    kids: 'Não tem nada aqui ainda. Capture palavras ou traga da trilha.',
    pro: 'Nenhum item neste conjunto, nada a mapear.',
    senior: 'Este conjunto está vazio. Guarde palavras primeiro.',
  };
  const txtFiltroVazio: Record<AgeProfileType, string> = {
    kids: 'Nada nesta seleção. Troque o filtro acima.',
    pro: 'Nenhum item satisfaz este filtro.',
    senior: 'Nada aqui com este filtro. Escolha outro acima.',
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 pb-28 animate-in fade-in duration-200">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          {/* Mesmo botão de volta da Curadoria: o `py-1` existe para o alvo de toque passar de 24px —
              a linha de texto sozinha tem ~17px e já foi motivo de correção neste projeto. */}
          <button
            onClick={onVoltar}
            className="flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink mb-3 py-1 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar aos jogos
          </button>
          <h1 className="font-display font-black text-2xl text-ink tracking-tight truncate" title={titulo}>
            {titulo}
          </h1>
          <p className="text-[13px] text-ink-muted mt-1 max-w-[70ch]">{subtitulo[ageProfile]}</p>
        </header>

        {/* O SALDO. É esta faixa — não a lista — que responde "quanto falta"; a lista serve para
            achar um item específico. Por isso ela vem antes e é lida sem rolar. */}
        <section className="card-panel bg-surface p-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          <span className="font-bold text-ink">
            {saldo.total} <span className="font-semibold text-ink-muted">{rotuloTotal[ageProfile]}</span>
          </span>
          <span className="text-ink-muted">
            <b className="text-ink">{saldo.nunca}</b> {rotuloNunca[ageProfile]}
          </span>
          <span className="text-ink-muted">
            <b className="text-ink">{saldo.jaCairam}</b> {rotuloVistos[ageProfile]}
          </span>
          {saldo.porEstado.errado > 0 && (
            <span className="text-error-ink font-semibold">
              {saldo.porEstado.errado} {rotuloErros[ageProfile]}
            </span>
          )}
          {saldo.porEstado.vencido > 0 && (
            <span className="text-warn-ink font-semibold">
              {saldo.porEstado.vencido} {rotuloVencidos[ageProfile]}
            </span>
          )}
          {saldo.total > 0 && (
            <span className="text-ink-faint ml-auto">
              {saldo.pct}% {rotuloCobertura[ageProfile]}
            </span>
          )}
        </section>

        {/* HISTÓRICO PARCIAL, dito em voz alta. Sem esta linha o mapa afirmaria "nunca caiu" sobre
            palavras que a pessoa já jogou, o registro por item (`item_ref`) só passou a existir na
            data abaixo, e rodadas anteriores a ela não deixaram rastro de QUAL item caiu. */}
        {typeof historicoDesde === 'number' && (
          <p className="flex items-start gap-1.5 text-[11.5px] text-ink-faint mb-5 max-w-[70ch]">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
            O registro do que caiu em cada rodada começou em{' '}
            {new Date(historicoDesde).toLocaleDateString('pt-BR')}. O que você jogou antes disso não
            aparece aqui, pode haver palavra marcada como "nunca caiu" que você já viu.
          </p>
        )}

        {/* OS NÍVEIS. Mesmo padrão do PainelTrilha, com um número diferente por baixo: lá a barra
            mede quanto do nível está NO BARALHO, aqui mede quanto do nível já APARECEU numa rodada.
            São perguntas distintas, ter a palavra e ter jogado a palavra. */}
        {niveis && niveis.length > 0 && onEscolherNivel && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {niveis.map(n => {
              const ativo = n.nivel === nivelAtivo;
              const completo = n.pct >= 80;
              return (
                <button
                  key={n.nivel}
                  onClick={() => onEscolherNivel(n.nivel)}
                  className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                    ativo ? 'border-accent bg-accent-soft' : 'border-border-subtle hover:border-accent'
                  }`}
                  title={`${n.jaCairam} de ${n.total} palavras do ${n.nivel} já apareceram em alguma rodada`}
                >
                  <span className="flex items-center gap-1.5 font-display font-black text-[13px] text-ink">
                    {n.nivel}
                    {completo && <Check className="w-3.5 h-3.5 text-good-ink" aria-hidden />}
                  </span>
                  <span className="block text-[10px] text-ink-muted font-mono">{n.pct}%</span>
                  <span className="block h-1 w-12 bg-canvas rounded-full mt-1 overflow-hidden">
                    <span
                      className={`block h-full rounded-full ${completo ? 'bg-good' : 'bg-accent'}`}
                      style={{ width: `${n.pct}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* OS FILTROS, com a contagem colada. Um filtro que daria zero fica VISÍVEL e desabilitado
            mostrando o 0: some-lo esconderia a informação mais útil da tela, "não errei nenhuma"
            e "não existe esse filtro" viram a mesma coisa quando o chip desaparece.
            `py-2` sobre texto de 12px passa de 24px de alvo. */}
        <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Filtrar o mapa">
          {FILTROS.map(f => {
            const n = contagemDoFiltro[f];
            const ativo = f === filtro;
            return (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                disabled={n === 0}
                aria-pressed={ativo}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                  ativo
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-border-subtle text-ink-muted hover:border-accent hover:text-ink'
                }`}
              >
                {ROTULO_FILTRO[f][ageProfile]}
                <span className="font-mono font-bold text-[11px]">{n}</span>
              </button>
            );
          })}
        </div>

        {saldo.total === 0 ? (
          <section className="card-panel bg-surface p-8 text-center">
            <p className="text-[13px] text-ink-muted">{txtVazio[ageProfile]}</p>
          </section>
        ) : visiveis.length === 0 ? (
          /* Chip desabilitado impede escolher um filtro vazio, mas a lista pode esvaziar DEPOIS —
             trocar de nível troca `itens` sem mexer no filtro em vigor. Sem esta saída, a tela
             ficaria em branco e pareceria quebrada. */
          <section className="card-panel bg-surface p-8 text-center">
            <p className="text-[13px] text-ink-muted">{txtFiltroVazio[ageProfile]}</p>
          </section>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visiveis.map(({ it, estado }) => (
              <li
                key={it.ref}
                className="card-panel bg-surface p-3 flex flex-wrap items-center gap-x-3 gap-y-1.5"
              >
                <span className="font-display font-bold text-[14px] text-ink min-w-[8rem]">
                  {it.titulo}
                </span>
                {/* A pista trunca na tela e fica inteira no `title`: em jogo de frase ela é uma fala
                    completa, e cortá-la sem saída esconderia o conteúdo do próprio item. */}
                {it.pista && (
                  <span className="text-[12px] text-ink-muted flex-1 min-w-[10rem] truncate" title={it.pista}>
                    {it.pista}
                  </span>
                )}
                <span className="flex items-center gap-2 ml-auto shrink-0">
                  {/* A contagem fica FORA do selo: o selo diz o estado, o número diz o quanto —
                      juntos num badge só, "já vi" e "já vi 9x" pareceriam o mesmo item. */}
                  <span className="text-[11px] font-mono text-ink-faint">
                    {it.vezes === 0 ? '0x' : `${it.vezes}x`}
                    {it.erros > 0 && ` · ${it.erros} erro${it.erros > 1 ? 's' : ''}`}
                  </span>
                  <span className={`badge-tag ${SELO[estado].variante}`}>{SELO[estado].texto}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Excedente ANUNCIADO, com a saída junto: sem isto a pessoa concluiria que o A1 tem 60
            palavras. O filtro é o que faz o resto aparecer, então ele é dito na mesma frase. */}
        {ordenados.length > MAX_VISIVEL && (
          <p className="text-[12px] text-ink-faint mt-3">
            mostrando {MAX_VISIVEL} de {ordenados.length}, filtre para ver o resto
          </p>
        )}
      </div>
    </div>
  );
}
