import { Check, GraduationCap, List, Map as MapIcon, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';

import { data, numero, t } from '../../lib/i18n';
import type { AgeProfileType } from '../../lib/profile';
import { CabecalhoDeTela, IconeEmBloco, Tela, TituloDeSecao } from '../ui';

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
  /** "Trocar a fonte": volta aos jogos com a gaveta "O que você vai praticar" aberta. */
  onTrocarFonte?: () => void;
}

/** O rótulo do chip começa em maiúscula, como no protótipo ("Inéditos"), em qualquer idioma. */
const maiuscula = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

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
 * tela leem igual. As variantes são as de `.badge` do protótipo (o `ROT` de `T.mapa`).
 */
const SELO: Record<Estado, { texto: string; variante: string }> = {
  vencido: { texto: 'vencida', variante: 'acc' },
  errado: { texto: 'errei', variante: 'warn' },
  novo: { texto: 'nunca caiu', variante: 'neu' },
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
interface Anotado {
  it: ItemDoMapa;
  estado: Estado;
}

const PASSA_NO_FILTRO: Record<Filtro, (a: Anotado) => boolean> = {
  todos: () => true,
  novos: (a) => a.it.vezes === 0,
  errados: (a) => a.estado === 'errado',
  vistos: (a) => a.it.vezes > 0,
  vencidos: (a) => a.it.vencido,
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
  onTrocarFonte,
}: MapaProps) {
  const [filtro, setFiltro] = useState<Filtro>('todos');

  /**
   * Estado calculado UMA vez por item e reaproveitado pelo saldo, pelas contagens dos filtros e
   * pela lista. Antes de existir este passo, cada uma dessas três leituras reclassificaria os 827
   * itens do A1 por conta própria a cada render.
   */
  const anotados = useMemo(() => itens.map((it) => ({ it, estado: estadoDoItem(it) })), [itens]);

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
    return [...base].sort((a, b) => PESO[a.estado] - PESO[b.estado] || a.it.titulo.localeCompare(b.it.titulo));
  }, [anotados, filtro]);

  const visiveis = ordenados.slice(0, MAX_VISIVEL);

  const subtitulo: Record<AgeProfileType, string> = {
    kids: 'Tudo que dá para jogar aqui, e como você foi em cada um.',
    pro: 'O que já caiu nas suas rodadas, o que está vencendo e o que nunca apareceu. Filtre para ver cada grupo.',
    senior: 'Veja o que já apareceu para você e o que ainda falta.',
  };
  // Rótulos dos ladrilhos: os do perfil `pro` são os do protótipo.
  const rotuloTotal: Record<AgeProfileType, string> = {
    kids: 'para jogar',
    pro: 'No conjunto',
    senior: 'palavras ao todo',
  };
  const rotuloNunca: Record<AgeProfileType, string> = {
    kids: 'nunca caíram',
    pro: 'Nunca entraram',
    senior: 'ainda não apareceram',
  };
  const rotuloVistos: Record<AgeProfileType, string> = {
    kids: 'você já jogou',
    pro: 'Já vistos',
    senior: 'você já viu',
  };
  const rotuloErros: Record<AgeProfileType, string> = {
    kids: 'você errou',
    pro: 'Erro pendente',
    senior: 'você errou',
  };
  const rotuloVencidos: Record<AgeProfileType, string> = {
    kids: 'pedindo revisão',
    pro: 'Vencidos',
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
    pro: 'Troque o filtro acima.',
    senior: 'Nada aqui com este filtro. Escolha outro acima.',
  };

  /* Marcação do protótipo aprovado (`T.mapa` em docs/prototipos/consistencia-telas.html): o
     cabeçalho com "Mapa do conteúdo", os cinco ladrilhos do saldo, a linha de cobertura, os níveis
     da trilha em `.niveis` e a lista em `.cartao.p5.secao` com os chips e a `.lista-mapa`. */
  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        voltar={{ rotulo: t('Jogar'), aoClicar: onVoltar }}
        sobrancelha="Mapa do conteúdo"
        icone={MapIcon}
        titulo={titulo}
        sub={subtitulo[ageProfile]}
        acoes={
          onTrocarFonte ? (
            <button type="button" className="btn btn-outline" onClick={onTrocarFonte}>
              <SlidersHorizontal aria-hidden /> Trocar a fonte
            </button>
          ) : undefined
        }
      />

      {/* O SALDO. São estes ladrilhos — não a lista — que respondem "quanto falta"; a lista serve
          para achar um item específico. Por isso vêm antes e são lidos sem rolar. */}
      <div className="ladrilhos">
        <div className="cartao ladrilho">
          <span className="label-mono">{rotuloTotal[ageProfile]}</span>
          <span className="v">{numero(saldo.total)}</span>
        </div>
        <div className="cartao ladrilho">
          <span className="label-mono">{rotuloNunca[ageProfile]}</span>
          <span className="v">{numero(saldo.nunca)}</span>
        </div>
        <div className="cartao ladrilho">
          <span className="label-mono">{rotuloVistos[ageProfile]}</span>
          <span className="v good">{numero(saldo.jaCairam)}</span>
        </div>
        <div className="cartao ladrilho">
          <span className="label-mono">{rotuloErros[ageProfile]}</span>
          <span className="v warn">{numero(saldo.porEstado.errado)}</span>
        </div>
        <div className="cartao ladrilho">
          <span className="label-mono">{rotuloVencidos[ageProfile]}</span>
          <span className="v acc">{numero(saldo.porEstado.vencido)}</span>
        </div>
      </div>

      {/* A COBERTURA e o HISTÓRICO PARCIAL, ditos em voz alta. Sem a segunda frase o mapa afirmaria
          "nunca caiu" sobre palavras que a pessoa já jogou: o registro por item (`item_ref`) só
          passou a existir na data abaixo, e rodadas anteriores não deixaram rastro de QUAL item caiu. */}
      {(saldo.total > 0 || typeof historicoDesde === 'number') && (
        <p className="mut" style={{ fontSize: 12.5, marginTop: 10 }}>
          {saldo.total > 0 && `${saldo.pct}% ${rotuloCobertura[ageProfile]} numa rodada.`}
          {typeof historicoDesde === 'number' &&
            ` O registro do que caiu em cada rodada começou em ${data(new Date(historicoDesde))}.`}
        </p>
      )}

      {/* OS NÍVEIS (só na trilha). Mesmo padrão do PainelTrilha, com um número diferente por baixo:
          lá a barra mede quanto do nível está NO BARALHO, aqui quanto do nível já APARECEU numa rodada. */}
      {niveis && niveis.length > 0 && onEscolherNivel && (
        <section className="secao">
          <TituloDeSecao
            icone={GraduationCap}
            titulo="Níveis da trilha"
            desc="Um nível fica completo quando 80% das palavras já caíram numa rodada."
          />
          <div className="niveis" role="radiogroup" aria-label="Nível da trilha">
            {niveis.map((n) => {
              const completo = n.pct >= 80;
              return (
                <button
                  key={n.nivel}
                  type="button"
                  className="cartao nivel-trilha"
                  role="radio"
                  aria-checked={n.nivel === nivelAtivo}
                  onClick={() => onEscolherNivel(n.nivel)}
                  title={`${n.jaCairam} de ${n.total} palavras do ${n.nivel} já apareceram em alguma rodada`}
                >
                  <span className="linha" style={{ justifyContent: 'space-between' }}>
                    <b>{n.nivel}</b>
                    {completo ? (
                      <span className="badge ok">
                        <Check aria-hidden /> feito
                      </span>
                    ) : (
                      <span className="mut tn" style={{ fontSize: 12 }}>
                        {n.pct}%
                      </span>
                    )}
                  </span>
                  <span className="barra" aria-hidden="true">
                    <span style={{ width: `${n.pct}%` }} />
                  </span>
                  <small className="mut tn">{numero(n.total)} palavras</small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="cartao p5 secao">
        <TituloDeSecao
          icone={List}
          titulo="Palavras do conjunto"
          direita={
            <span className="mut tn" style={{ fontSize: 12.5 }}>
              mostrando {numero(visiveis.length)} de {numero(saldo.total)}
            </span>
          }
        />
        {/* OS FILTROS, com a contagem colada. Um filtro que daria zero fica VISÍVEL e desabilitado
            mostrando o 0: sumir com ele esconderia a informação mais útil da tela — "não errei
            nenhuma" e "não existe esse filtro" viram a mesma coisa quando o chip desaparece. */}
        <div className="chips" role="radiogroup" aria-label="Filtrar o mapa">
          {FILTROS.map((f) => {
            const n = contagemDoFiltro[f];
            const ativo = f === filtro;
            return (
              <button
                key={f}
                type="button"
                className="pill"
                role="radio"
                aria-checked={ativo}
                onClick={() => setFiltro(f)}
                disabled={n === 0 && !ativo}
              >
                {maiuscula(t(ROTULO_FILTRO[f][ageProfile]))} <span className="n">{numero(n)}</span>
              </button>
            );
          })}
        </div>

        {saldo.total === 0 ? (
          <div className="vazio">
            <IconeEmBloco icone={Search} />
            <h3>Nada a mapear</h3>
            <p>{txtVazio[ageProfile]}</p>
          </div>
        ) : visiveis.length === 0 ? (
          /* Chip desabilitado impede escolher um filtro vazio, mas a lista pode esvaziar DEPOIS —
             trocar de nível troca `itens` sem mexer no filtro em vigor. Sem esta saída, a tela
             ficaria em branco e pareceria quebrada. */
          <div className="vazio">
            <IconeEmBloco icone={Search} />
            <h3>Nenhum item satisfaz este filtro</h3>
            <p>{txtFiltroVazio[ageProfile]}</p>
          </div>
        ) : (
          <ul className="lista-mapa">
            {visiveis.map(({ it, estado }) => (
              <li key={it.ref}>
                <div style={{ minWidth: 0 }}>
                  <b>{it.titulo}</b>
                  {/* A pista trunca na tela e fica inteira no `title`: em jogo de frase ela é uma
                      fala completa, e cortá-la sem saída esconderia o conteúdo do próprio item. */}
                  {it.pista && (
                    <small className="mut" title={it.pista}>
                      {it.pista}
                    </small>
                  )}
                </div>
                {/* A contagem fica FORA do selo: o selo diz o estado, o número diz o quanto. */}
                <span className="mut tn" style={{ fontSize: 12 }}>
                  {it.vezes}× · {it.erros} erro{it.erros === 1 ? '' : 's'}
                </span>
                <span className={`badge ${SELO[estado].variante}`}>{SELO[estado].texto}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Excedente ANUNCIADO, com a saída junto: sem isto a pessoa concluiria que o A1 tem 60
            palavras. O filtro é o que faz o resto aparecer, então ele é dito na mesma frase. */}
        {visiveis.length < saldo.total && (
          <p className="mut" style={{ fontSize: 12.5, marginTop: 12 }}>
            Mostrando {numero(visiveis.length)} de {numero(saldo.total)}
            {ordenados.length > MAX_VISIVEL ? '. Filtre para ver o resto.' : ''}
          </p>
        )}
      </section>
    </Tela>
  );
}
