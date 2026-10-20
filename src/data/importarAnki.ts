/**
 * TRAZER UM BARALHO DO ANKI — a importação orquestrada no navegador.
 *
 * Morava dentro de `BaralhoAnki.tsx`. A tela Cartões (aba "Trazer e levar") faz a mesma importação com
 * outro desenho, então o fluxo e a forma da resposta ficam num lugar só.
 *
 * QUEM LÊ O ARQUIVO É O NAVEGADOR (`lib/anki/lerBaralho`); o servidor recebe as notas em lotes
 * (`/api/anki/imports`: abrir, notas × N, fechar), aplica a régua de qualidade e grava. Quando
 * `importarBaralhoAnki` resolve, a importação JÁ aconteceu. O que a tela
 * decide depois é quantas dessas notas viram cartão agora (`ativarNotasDoBaralho`, `apiAnki.ts`).
 */
import type { NotaAnki } from '../core/anki';
import { lerBaralhoNoNavegador } from '../lib/anki/lerBaralho';
import { abrirImportAnki, enviarNotasDoImport, fecharImportAnki, LimiteDeLotes, notaParaOFio } from './apiAnki';

/** O saldo do import, como o fechamento o devolve — o import já aconteceu quando isto chega. */
export interface ResumoImportAnki {
  notas: number;
  novas: number;
  atualizadas: number;
  iguais: number;
  descartadas: number;
  porMotivo: Record<string, number>;
  /** Quantas notas desta leitura já viraram cartão: o servidor ativa o primeiro lote ao importar. */
  ativadas?: number;
}

export interface ImportAnkiResposta {
  importId: string;
  deckId: string;
  resumo: ResumoImportAnki;
  campos: string[];
  notetype: string | null;
  /** Só o `.apkg` declara nomes de baralho; texto e CSV não trazem. */
  baralhos?: string[];
  formato: string;
  truncado: boolean;
  totalNoArquivo: number;
  amostra: Array<{ frente: string; verso: string; exemplo: string | null }>;
  /** Só quando o idioma declarado e a escrita das frentes se contradisseram. */
  avisoIdioma?: string;
  /** A primeira leva não virou cartão jogável; o import em si NÃO foi desfeito. */
  erroDeAtivacao?: string;
}

/** Notas por lote (o teto do servidor) e bytes por lote (abaixo dos 5 MB do corpo, com folga). */
export const LOTE = 500;
export const BYTES_POR_LOTE = 3 * 1024 * 1024;

const codificador = new TextEncoder();
const AMOSTRA_DO_IDIOMA = 200;
const AMOSTRA_DA_TELA = 4;
const ESPERA_PADRAO_S = 5;
const ESPERA_MAXIMA_S = 60;

export interface ProgressoDaImportacao {
  etapa: 'lendo' | 'enviando' | 'concluindo';
  feitas: number;
  total: number;
}

/**
 * Fatia por quantidade E por bytes. Uma nota sozinha acima do teto (o schema do servidor impede) vai
 * sozinha em vez de travar o laço.
 */
function fatiar(notas: NotaAnki[]): NotaAnki[][] {
  const lotes: NotaAnki[][] = [];
  let atual: NotaAnki[] = [];
  let bytes = 2; // os colchetes do array
  for (const n of notas) {
    const tamanho = codificador.encode(JSON.stringify(notaParaOFio(n))).length + 1; // BYTES em UTF-8 (o teto do corpo é em bytes) + a vírgula
    if (atual.length > 0 && (atual.length >= LOTE || bytes + tamanho > BYTES_POR_LOTE)) {
      lotes.push(atual);
      atual = [];
      bytes = 2;
    }
    atual.push(n);
    bytes += tamanho;
  }
  if (atual.length > 0) lotes.push(atual);
  return lotes;
}

/** 429: espera o `Retry-After` (teto de 1 min; sem cabeçalho, 5 s) e repete o MESMO lote uma vez. */
async function enviarLote(importId: string, notas: NotaAnki[]) {
  try {
    return await enviarNotasDoImport(importId, notas);
  } catch (e) {
    if (!(e instanceof LimiteDeLotes)) throw e;
    const segundos = Math.min(e.segundos ?? ESPERA_PADRAO_S, ESPERA_MAXIMA_S);
    await new Promise((r) => setTimeout(r, segundos * 1000));
    return enviarNotasDoImport(importId, notas);
  }
}

/**
 * LÊ no navegador e GRAVA o acervo no servidor, em lotes sequenciais — não é "ler e depois confirmar".
 *
 * O IDIOMA VIAJA JUNTO, e sem ele o baralho entra e não chega a jogo nenhum: o cartão nasce com
 * `srcLang` vazio, a triagem o marca `idioma-incerto` e ele cai na pilha "de outro idioma" assim
 * que há um idioma selecionado no lobby. Medido importando 3.600 notas: acervo cheio, tela ainda
 * dizendo "3 palavras". O `.apkg` não declara idioma de forma confiável — quem sabe é a tela.
 *
 * Erro depois da abertura lança com a mensagem do servidor e NÃO tenta desfazer: o import fica
 * `gravando` e a limpeza diária o marca `falhou` em 24 h.
 */
export async function importarBaralhoAnki(
  arquivo: File,
  idioma: string,
  idiomaNativo: string,
  aoProgredir?: (p: ProgressoDaImportacao) => void,
): Promise<ImportAnkiResposta> {
  const leitura = await lerBaralhoNoNavegador(arquivo, (p) =>
    aoProgredir?.({ etapa: 'lendo', feitas: p.notas ?? 0, total: p.total ?? 0 }),
  );
  const { notas } = leitura;

  const aberto = await abrirImportAnki({
    arquivo: arquivo.name,
    bytes: arquivo.size,
    formato: leitura.formato,
    nomeNoArquivo: leitura.baralhos?.[0] ?? null,
    baralhos: leitura.baralhos?.slice(0, 200),
    campos: leitura.campos,
    totalNoArquivo: leitura.totalNoArquivo ?? notas.length,
    truncado: leitura.truncado ?? false,
    idiomaOrigem: idioma || null,
    idiomaAlvo: idiomaNativo || null,
    amostra: notas.slice(0, AMOSTRA_DO_IDIOMA).map((n) => ({ frente: n.frente.slice(0, 2000), verso: n.verso.slice(0, 2000) })),
  });

  let feitas = 0;
  for (const lote of fatiar(notas)) {
    await enviarLote(aberto.importId, lote);
    feitas += lote.length;
    aoProgredir?.({ etapa: 'enviando', feitas, total: notas.length });
  }

  aoProgredir?.({ etapa: 'concluindo', feitas, total: notas.length });
  const fim = await fecharImportAnki(aberto.importId);

  return {
    importId: fim.importId,
    deckId: fim.deckId,
    resumo: fim.resumo,
    campos: leitura.campos,
    notetype: notas[0]?.notetype ?? null,
    baralhos: leitura.baralhos,
    formato: leitura.formato,
    truncado: leitura.truncado ?? false,
    totalNoArquivo: leitura.totalNoArquivo ?? notas.length,
    amostra: notas.slice(0, AMOSTRA_DA_TELA).map((n) => ({
      frente: n.frente.slice(0, 80),
      verso: n.verso.slice(0, 80),
      exemplo: n.exemplo ? n.exemplo.slice(0, 80) : null,
    })),
    ...(aberto.avisoIdioma ? { avisoIdioma: aberto.avisoIdioma } : {}),
    ...(fim.erroDeAtivacao ? { erroDeAtivacao: fim.erroDeAtivacao } : {}),
  };
}
