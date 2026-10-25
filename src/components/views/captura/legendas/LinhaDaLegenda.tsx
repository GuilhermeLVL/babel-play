import { BookmarkPlus, Copy, Languages, Snail, Sparkles, Volume2 } from 'lucide-react';
import { Fragment, memo, type MouseEvent, type ReactNode } from 'react';

import type { MarcaNaLinha } from '../../../../core/assistente/telaDoAssistente';
import type { CorrecaoDaFala } from '../../../../data/apiDoAssistente';
import { palavrasDoPedaco } from '../../../../lib/captura/trechosTocaveis';
import { pedacosDaLegenda } from '../../../../lib/estilosDeLegenda';
import { t } from '../../../../lib/i18n';
import { direcaoDoTexto } from '../../../../lib/languages';
import { rotuloDoNivel, rotuloDoTipo } from '../assistente/copyDoAssistente';
import type { Modo, Traducao } from './aparenciaDaLegenda';

/** Uma fala real da captura, pronta para a legenda. `lado` = de quem é (sistema = eles). */
export interface LegendaAoVivo {
  id: string;
  quem: string;
  original: string;
  traducao: string;
  lado: 'eles' | 'voce';
  /** Idioma declarado da fala (o da linha): ponto de partida do idioma da palavra tocada. */
  lang?: string;
  /** Ainda sendo falada (parcial do streaming): não é anunciada ao leitor de tela. */
  parcial?: boolean;
  /** Deixada sem tradução pela preferência "Tradução" (Só quando eu pedir / Só frases com palavra
   *  nova): no lugar da tradução, o mesmo "Mostrar tradução" da conversa. */
  sobDemanda?: boolean;
}

/** A palavra de um pedaço do texto, sem a pontuação colada ("today?" → "today"). */
function limparPalavra(pedaco: string): string {
  return pedaco.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * O texto em pedaços tocáveis: cada palavra é um `span[data-palavra]`, os espaços ficam como texto.
 * Em chinês e japonês, sem espaço para dividir, cada pedaço vem partido nas palavras dele.
 *
 * AS MARCAS DO ASSISTENTE (Fase C2): os pedaços de um destaque (expressão, termo, palavra acima do nível) ficam
 * dentro de um `span.leg-marca`, sublinhado pontilhado, SILENCIOSO (nenhum anúncio ao leitor de tela), com o sentido
 * no `title` (passar o mouse) e alcançável pelo teclado (Tab, Enter abre o cartão).
 */
function Palavras({
  texto,
  lang,
  aprendidas,
  marcas,
  aoTocarMarca,
}: {
  texto: string;
  lang: string;
  aprendidas?: ReadonlySet<string>;
  marcas?: ReadonlyArray<MarcaNaLinha>;
  aoTocarMarca?: (m: MarcaNaLinha) => void;
}) {
  const marcadas = new Set(
    pedacosDaLegenda(texto, aprendidas)
      .filter((p) => p.aprendida)
      .map((p) => p.texto),
  );
  const pedacos = texto.split(/(\s+)/).flatMap((p) => palavrasDoPedaco(p, lang));
  const palavraDe = (p: string, i: number | string, aprendida = marcadas.has(p)) => {
    const palavra = limparPalavra(p);
    if (!palavra) return p;
    return (
      <span key={i} data-palavra={palavra} data-aprendida={aprendida ? '' : undefined}>
        {p}
      </span>
    );
  };
  if (!marcas?.length) return <>{pedacos.map((p, i) => palavraDe(p, i))}</>;

  /* Corta cada pedaço nas bordas das marcas ("review." → "review" + ".": o fio não passa embaixo da pontuação) e
     agrupa os cortes seguidos que caem na mesma marca (o espaço entre duas palavras da expressão vai junto). */
  const bordas = marcas.flatMap((m) => [m.inicio, m.fim]);
  const grupos: Array<{ marca: MarcaNaLinha | null; itens: ReactNode[] }> = [];
  let pos = 0;
  pedacos.forEach((p, i) => {
    const ini = pos;
    pos += p.length;
    const cortes = [ini, ...bordas.filter((b) => b > ini && b < pos).sort((a, b) => a - b), pos];
    const aprendida = marcadas.has(p);
    for (let k = 0; k + 1 < cortes.length; k++) {
      const a = cortes[k];
      const b = cortes[k + 1];
      const parte = p.slice(a - ini, b - ini);
      const espaco = !parte.trim();
      const marca = marcas.find((m) => (espaco ? m.inicio < a && b < m.fim : a < m.fim && m.inicio < b)) ?? null;
      const item = palavraDe(parte, `${i}.${k}`, aprendida);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.marca === marca) ultimo.itens.push(item);
      else grupos.push({ marca, itens: [item] });
    }
  });
  return (
    <>
      {grupos.map((g, i) => {
        const m = g.marca;
        if (!m) return <Fragment key={i}>{g.itens}</Fragment>;
        const rotulo = m.tipo === 'nivel' ? rotuloDoNivel(m.nivel, m.escala) : rotuloDoTipo(m.tipo);
        return (
          <span
            key={i}
            className="leg-marca"
            data-marca={m.tipo}
            role="button"
            tabIndex={0}
            title={m.sentido ? `${m.texto}: ${m.sentido}` : rotulo}
            aria-label={`${m.texto}, ${rotulo}`}
            onClick={(e) => {
              if (!aoTocarMarca) return;
              e.stopPropagation();
              aoTocarMarca(m);
            }}
            onKeyDown={(e) => {
              if (!aoTocarMarca || (e.key !== 'Enter' && e.key !== ' ')) return;
              e.preventDefault();
              e.stopPropagation();
              aoTocarMarca(m);
            }}
          >
            {g.itens}
          </span>
        );
      })}
    </>
  );
}

/**
 * UMA FALA DA JANELINHA: o original com as palavras tocáveis, a tradução (conforme o modo e a
 * troca desta fala) e as ações da fala — ouvir (normal e devagar, a voz do navegador, não o áudio
 * original), tradução só desta fala, copiar e salvar a frase. As ações aparecem ao passar o mouse
 * ou ao focar; na fala em foco elas ficam sempre à vista (é o que funciona no toque).
 */
function LinhaDaLegenda({
  fala,
  modo,
  modoDaTraducao,
  traducaoVisivel,
  emFoco,
  aprendidas,
  aoTocarPalavra,
  aoAlternarTraducao,
  aoRevelarTraducao,
  aoOuvir,
  aoCopiar,
  aoSalvarFrase,
  soTraducao = false,
  marcas,
  marcasSutis = false,
  aoTocarMarca,
  correcao,
}: {
  fala: LegendaAoVivo;
  modo: Modo;
  modoDaTraducao: Traducao;
  traducaoVisivel: boolean;
  emFoco: boolean;
  aprendidas?: ReadonlySet<string>;
  aoTocarPalavra: (palavra: string, fala: LegendaAoVivo) => void;
  /** Ausente = a fala não tem tradução para trocar (mesmo idioma, sem "sob demanda"). */
  aoAlternarTraducao?: (fala: LegendaAoVivo) => void;
  aoRevelarTraducao?: (id: string) => void;
  aoOuvir?: (fala: LegendaAoVivo, lenta: boolean) => void;
  aoCopiar: (fala: LegendaAoVivo) => void;
  aoSalvarFrase?: (fala: LegendaAoVivo) => void;
  /** "Só a tradução": a fala traduzida aparece no lugar do original (se ainda não há tradução, o original). */
  soTraducao?: boolean;
  /** Os destaques do assistente nesta linha (Fase C2). */
  marcas?: ReadonlyArray<MarcaNaLinha>;
  /** Na faixa (jogo): só a marca, mais apagada. */
  marcasSutis?: boolean;
  aoTocarMarca?: (marca: MarcaNaLinha, fala: LegendaAoVivo) => void;
  /** A correção gentil da própria fala (opt-in). Só aparece quando há o que melhorar. */
  correcao?: CorrecaoDaFala;
}) {
  const tocar = (e: MouseEvent<HTMLElement>) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>('[data-palavra]');
    if (alvo?.dataset.palavra) {
      e.stopPropagation();
      aoTocarPalavra(alvo.dataset.palavra, fala);
    }
  };
  /* "Ao tocar": tocar a fala fora de uma palavra mostra (ou esconde) a tradução dela. */
  const tocarNaFala =
    modoDaTraducao === 'toque' && aoAlternarTraducao
      ? (e: MouseEvent<HTMLElement>) => {
          if (!(e.target as HTMLElement).closest('button,[data-palavra]')) aoAlternarTraducao(fala);
        }
      : undefined;
  const classeDoLado = modo === 'conversa' ? (fala.lado === 'eles' ? 'eles' : 'eles b') : '';

  return (
    <div
      data-fala={fala.id}
      className={`leg-fala ${classeDoLado} ${emFoco ? 'atual' : 'anterior'}${marcasSutis ? ' marcas-sutis' : ''}`}
      aria-current={emFoco ? 'true' : undefined}
      onClick={tocarNaFala}
    >
      {modo === 'conversa' && <span className="leg-quem">{fala.quem}</span>}
      {soTraducao && fala.traducao ? (
        <span className="leg-o leg-o-traducao">{fala.traducao}</span>
      ) : (
        <span
          className="leg-o"
          lang={fala.lang || undefined}
          dir={fala.lang ? direcaoDoTexto(fala.lang) : undefined}
          onClick={tocar}
        >
          <Palavras
            texto={fala.original}
            lang={fala.lang ?? ''}
            aprendidas={aprendidas}
            marcas={marcas}
            aoTocarMarca={aoTocarMarca ? (m) => aoTocarMarca(m, fala) : undefined}
          />
        </span>
      )}
      {soTraducao && fala.traducao ? null : modoDaTraducao !== 'oculta' &&
        !fala.traducao &&
        fala.sobDemanda &&
        aoRevelarTraducao ? (
        /* Compacto, na cor e no tamanho da linha de tradução que ele substitui. */
        <button
          type="button"
          className={`leg-t ${modoDaTraducao} link leg-revelar`}
          onClick={() => aoRevelarTraducao(fala.id)}
        >
          <Languages aria-hidden /> {t('Mostrar tradução')}
        </button>
      ) : (
        traducaoVisivel &&
        fala.traducao && (
          <span className={`leg-t ${modoDaTraducao === 'discreta' ? 'discreta' : 'sempre'}`}>{fala.traducao}</span>
        )
      )}
      {correcao && !correcao.ok && correcao.corrigida.trim() && (
        <span className="leg-correcao" title={correcao.dica || undefined}>
          <Sparkles aria-hidden /> {t('Mais natural:')} <span lang={fala.lang || undefined}>{correcao.corrigida}</span>
          {correcao.dica && <span className="leg-correcao-dica"> · {correcao.dica}</span>}
        </span>
      )}
      <div className="leg-acoes" role="group" aria-label={t('Ações da fala')}>
        {aoOuvir && (
          <>
            <button
              type="button"
              aria-label={t('Ouvir a frase')}
              title={t('Ouvir a frase')}
              onClick={() => aoOuvir(fala, false)}
            >
              <Volume2 aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t('Ouvir devagar')}
              title={t('Ouvir devagar')}
              onClick={() => aoOuvir(fala, true)}
            >
              <Snail aria-hidden />
            </button>
          </>
        )}
        {aoAlternarTraducao && (
          <button
            type="button"
            aria-pressed={traducaoVisivel && !!fala.traducao}
            aria-label={t('Tradução desta fala')}
            title={t('Tradução desta fala')}
            onClick={() => aoAlternarTraducao(fala)}
          >
            <Languages aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-label={t('Copiar o texto')}
          title={t('Copiar o texto')}
          onClick={() => aoCopiar(fala)}
        >
          <Copy aria-hidden />
        </button>
        {aoSalvarFrase && (
          <button
            type="button"
            aria-label={t('Salvar a frase')}
            title={t('Salvar a frase')}
            onClick={() => aoSalvarFrase(fala)}
          >
            <BookmarkPlus aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(LinhaDaLegenda);
