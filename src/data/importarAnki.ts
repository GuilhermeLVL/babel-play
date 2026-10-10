/**
 * TRAZER UM BARALHO DO ANKI — o envio do arquivo para `POST /api/import/anki`.
 *
 * Morava dentro de `BaralhoAnki.tsx`. A tela Cartões (aba "Trazer e levar") faz o mesmo envio com
 * outro desenho, então o envio e a forma da resposta ficam num lugar só.
 *
 * A IMPORTAÇÃO GRAVA O ACERVO DE UMA VEZ: a rota lê, aplica a régua de qualidade e grava o baralho,
 * as notas e o registro do import; quando a resposta chega, a importação JÁ aconteceu. O que a tela
 * decide depois é quantas dessas notas viram cartão agora (`ativarNotasDoBaralho`, `apiAnki.ts`).
 */
import JSZip from 'jszip';

import { apiFetch } from './api';

/** O que a rota `POST /api/import/anki` devolve — o import já aconteceu quando isto chega. */
export interface ResumoImportAnki {
  notas: number;
  novas: number;
  atualizadas: number;
  iguais: number;
  descartadas: number;
  porMotivo: Record<string, number>;
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
}

/** Timeout folgado: o `.apkg` reempacotado ainda pode ter dezenas de milhares de notas. */
const IMPORT_TIMEOUT_MS = 600_000;

/**
 * MANDA SÓ A COLEÇÃO — sem isto, baralhos reais nem chegam ao servidor.
 *
 * O DEFEITO, com o "4000 Essential English Words" do AnkiWeb: o `.apkg` tem **214 MB**, a rota
 * aceita 200, e o estouro acontece no middleware `raw()` — ANTES do `try/catch` do handler —,
 * então virava um 500 "erro interno" que não dizia nada. Do lado de quem usa: "tentei subir e
 * não deu".
 *
 * Mas o tamanho é quase todo MÍDIA que o importador joga fora: aquele arquivo tem 14.948
 * entradas, das quais 14.946 são áudio e imagem. O que o parser lê é uma só —
 * `collection.anki2x` — e ela tem 630 KB. Medido: **224.592.115 → 629.713 bytes, 356× menor.**
 *
 * Reempacotar em vez de mandar a coleção crua mantém o servidor intacto: ele continua
 * recebendo um `.apkg` legítimo, com o mesmo nome de entrada que já procura, e o caminho do
 * `.anki21b` (zstd dentro do zip) segue funcionando porque os bytes são copiados como estão.
 *
 * Em caso de dúvida, manda o arquivo original: um zip que não abre aqui pode abrir lá, e a
 * mensagem do servidor explica melhor do que um erro inventado no cliente.
 */
export async function soAColecao(arquivo: File): Promise<File> {
  if (!/\.apkg$/i.test(arquivo.name)) return arquivo;
  try {
    const zip = await JSZip.loadAsync(arquivo);
    const nome = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find((n) => zip.file(n));
    if (!nome) return arquivo;
    const dados = await zip.file(nome)!.async('uint8array');
    const enxuto = new JSZip();
    enxuto.file(nome, dados);
    const blob = await enxuto.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    // Só vale a pena se de fato encolheu; senão o original já era enxuto.
    if (blob.size >= arquivo.size) return arquivo;
    return new File([blob], arquivo.name, { type: 'application/octet-stream' });
  } catch {
    return arquivo;
  }
}

/**
 * GRAVA o acervo no servidor — não é "ler e depois confirmar".
 *
 * O IDIOMA VIAJA JUNTO, e sem ele o baralho entra e não chega a jogo nenhum: o cartão nasce com
 * `srcLang` vazio, a triagem o marca `idioma-incerto` e ele cai na pilha "de outro idioma" assim
 * que há um idioma selecionado no lobby. Medido importando 3.600 notas: acervo cheio, tela ainda
 * dizendo "3 palavras". O `.apkg` não declara idioma de forma confiável — quem sabe é a tela.
 */
export async function importarBaralhoAnki(
  arquivo: File,
  idioma: string,
  idiomaNativo: string,
): Promise<ImportAnkiResposta> {
  const res = await apiFetch('/api/import/anki', {
    timeoutMs: IMPORT_TIMEOUT_MS,
    method: 'POST',
    headers: {
      'X-Filename': encodeURIComponent(arquivo.name),
      ...(idioma ? { 'X-Src-Lang': idioma } : {}),
      ...(idiomaNativo ? { 'X-Tgt-Lang': idiomaNativo } : {}),
    },
    body: arquivo,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: 'falha ao importar o baralho' }));
    throw new Error(e.error ?? 'falha ao importar o baralho');
  }
  return (await res.json()) as ImportAnkiResposta;
}
