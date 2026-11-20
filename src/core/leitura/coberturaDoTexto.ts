/**
 * QUANTO DE UM TEXTO A PESSOA JÁ SABE (spec `leitura-ativa-acervo`; LingQ, faixas de Schmitt, Jiang & Grabe 2011).
 *
 * A cobertura é a fração das palavras do texto (as que têm letra) que a pessoa conhece: a palavra está
 * `dominada`/`aprendendo` no caderno (o conjunto `conhecidas`, de chaves, que a tela monta do índice de etiquetas),
 * é funcional do idioma (`PALAVRAS_FUNCIONAIS`) ou é nome próprio. A flexão conta como a palavra: "apples" vale
 * "apple". Roda no aparelho, por listas: o caderno e o texto não saem daqui.
 *
 * O NÚMERO SÓ APARECE QUANDO É HONESTO: com menos de `SESSOES_MINIMAS_PARA_NOVA` sessões no idioma (ou sem conta),
 * quase tudo parece novo, e "Você já sabe 40%" seria um número errado. Nesses casos a tela mostra só o nível.
 */
import { PALAVRAS_FUNCIONAIS } from '../harness/palavrasConhecidas';
import { baseLang } from '../texto/idioma';
import { chaveDaPalavra } from '../texto/palavra';
import { SESSOES_MINIMAS_PARA_NOVA } from '../vocabulario/etiquetas';
import type { FichaDeTexto } from './fichaDeTexto';
import { chavesDeLema, dividirTexto } from './textoDaLeitura';

export interface CoberturaDoTexto {
  /** Palavras contadas (as que têm letra). */
  total: number;
  conhecidas: number;
  /** Arredondada PARA BAIXO: 97,9% é "Bom desafio", não "Leitura tranquila". */
  porcentagem: number;
  /** As chaves desconhecidas, uma vez cada, na ordem do texto ("cerca de N palavras novas"). */
  desconhecidas: string[];
}

const funcionaisPorIdioma = new Map<string, ReadonlySet<string>>();
function funcionais(lang: string): ReadonlySet<string> {
  const idioma = baseLang(lang);
  let s = funcionaisPorIdioma.get(idioma);
  if (!s) funcionaisPorIdioma.set(idioma, (s = new Set((PALAVRAS_FUNCIONAIS[idioma] ?? []).map(chaveDaPalavra))));
  return s;
}

export function coberturaDoTexto(texto: string, lang: string, conhecidas: ReadonlySet<string>): CoberturaDoTexto {
  const { palavras } = dividirTexto(texto, lang);
  const sabidas = funcionais(lang);
  const novas: string[] = [];
  let ok = 0;
  for (const p of palavras) {
    const conhece = p.nomeProprio || sabidas.has(p.chave) || chavesDeLema(p.texto, lang).some((c) => conhecidas.has(c));
    if (conhece) ok++;
    else if (!novas.includes(p.chave)) novas.push(p.chave);
  }
  const total = palavras.length;
  return {
    total,
    conhecidas: ok,
    porcentagem: total ? Math.floor((ok * 100) / total) : 100,
    desconhecidas: novas,
  };
}

export type RotuloDaCobertura = 'tranquila' | 'desafio' | 'puxado';

/** A faixa de "bom desafio": de 95% a 97%. */
export const FAIXA_DO_DESAFIO = { de: 95, ate: 98 } as const;

/** O rótulo do cartão, ou `null` quando o número não seria honesto (conta nova ou sem conta). */
export function rotuloDaCobertura(o: {
  porcentagem: number;
  sessoes: number;
  temConta: boolean;
}): { porcentagem: number; rotulo: RotuloDaCobertura } | null {
  if (!o.temConta || o.sessoes < SESSOES_MINIMAS_PARA_NOVA) return null;
  const rotulo: RotuloDaCobertura =
    o.porcentagem >= FAIXA_DO_DESAFIO.ate ? 'tranquila' : o.porcentagem >= FAIXA_DO_DESAFIO.de ? 'desafio' : 'puxado';
  return { porcentagem: o.porcentagem, rotulo };
}

/**
 * A seção do topo do catálogo. Sem cobertura (`null`: conta nova ou sem conta), "Comece por aqui" com 3 textos de
 * A1 ainda não lidos. Com cobertura, "Para você agora": até 3 não lidos na faixa de bom desafio, em ordem de
 * cobertura; sem nenhum na faixa, os 3 não lidos de maior cobertura abaixo de 98%.
 */
export function sugestoesDoCatalogo(
  fichas: readonly Pick<FichaDeTexto, 'id' | 'nivel'>[],
  cobertura: ReadonlyMap<string, number> | null,
  lidos: ReadonlySet<string>,
): { titulo: 'comece' | 'paraVoce'; ids: string[] } {
  const naoLidas = fichas.filter((f) => !lidos.has(f.id));
  if (!cobertura) {
    return {
      titulo: 'comece',
      ids: naoLidas
        .filter((f) => f.nivel === 'A1')
        .slice(0, 3)
        .map((f) => f.id),
    };
  }
  const comNumero = naoLidas
    .map((f) => ({ id: f.id, c: cobertura.get(f.id) ?? 0 }))
    .filter((x) => x.c < FAIXA_DO_DESAFIO.ate)
    .sort((a, b) => b.c - a.c);
  const naFaixa = comNumero.filter((x) => x.c >= FAIXA_DO_DESAFIO.de);
  return { titulo: 'paraVoce', ids: (naFaixa.length ? naFaixa : comNumero).slice(0, 3).map((x) => x.id) };
}
