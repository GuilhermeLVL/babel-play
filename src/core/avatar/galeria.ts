/**
 * A GALERIA AO VIVO (ToxSam / Open Source Avatars): só as 3 coleções 100Avatars (autor Polygonal Mind, CC0,
 * hospedadas no Arweave: um host de imagem e de modelo). Este módulo só LÊ o JSON do registro e o filtra com
 * desconfiança: o que o terceiro devolve é dado hostil até prova em contrário.
 *
 *  · coleção fora da lista, licença diferente de CC0 ou autor diferente: ignorada (as coleções de NFT do mesmo
 *    registro usam gateways IPFS de terceiros e não são curadas);
 *  · URL de modelo ou de miniatura que não seja `https://arweave.net/<id>`: o item é descartado;
 *  · o item vira `ItemDaGaleria`, com texto limpo e limitado.
 *
 * A requisição (com opt-in, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`) é de `src/lib/avatar/galeria.ts`.
 * Núcleo puro.
 */

export const COLECOES_DA_GALERIA = ['100avatars-r1', '100avatars-r2', '100avatars-r3'] as const;
export type ColecaoDaGaleria = (typeof COLECOES_DA_GALERIA)[number];

export const AUTOR_DA_GALERIA = 'Polygonal-Mind';
export const LICENCA_DA_GALERIA = 'CC0';
export const MAX_ITENS_DA_GALERIA = 400;

export interface ItemDaGaleria {
  /** Id estável para a chave da lista e para o armazenamento (sem o id do terceiro cru). */
  id: string;
  nome: string;
  numero: string;
  colecao: ColecaoDaGaleria;
  /** `https://arweave.net/<id>`. */
  modelo: string;
  miniatura: string;
}

type Bruto = Record<string, unknown>;
const objeto = (v: unknown): v is Bruto => v !== null && typeof v === 'object' && !Array.isArray(v);
// eslint-disable-next-line no-control-regex -- limpar caractere de controle do texto de terceiros é o ponto
const CONTROLE = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g;
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(CONTROLE, ' ').trim().slice(0, max) : '');
const URL_ARWEAVE = /^https:\/\/arweave\.net\/[A-Za-z0-9_-]{20,64}$/;
const ehColecao = (v: unknown): v is ColecaoDaGaleria => (COLECOES_DA_GALERIA as readonly unknown[]).includes(v);

/** As coleções do registro que passam em TODAS as conferências (id, licença CC0, autor, público, Arweave). */
export function colecoesAceitas(registro: unknown): ColecaoDaGaleria[] {
  if (!Array.isArray(registro)) return [];
  const achadas = new Set<ColecaoDaGaleria>();
  for (const p of registro as unknown[]) {
    if (!objeto(p) || !ehColecao(p.id)) continue;
    if (p.license !== LICENCA_DA_GALERIA || p.creator_id !== AUTOR_DA_GALERIA) continue;
    if (p.is_public !== true || p.storage_type !== 'arweave') continue;
    achadas.add(p.id);
  }
  return COLECOES_DA_GALERIA.filter((c) => achadas.has(c));
}

/** Os avatares de UMA coleção, já filtrados. Lista malformada vira `[]`. */
export function avataresDaColecao(lista: unknown, colecao: ColecaoDaGaleria): ItemDaGaleria[] {
  if (!Array.isArray(lista)) return [];
  const saida: ItemDaGaleria[] = [];
  for (const a of lista as unknown[]) {
    if (saida.length >= MAX_ITENS_DA_GALERIA) break;
    if (!objeto(a)) continue;
    if (a.project_id !== colecao || a.format !== 'VRM' || a.is_public !== true || a.is_draft === true) continue;
    const modelo = a.model_file_url;
    const miniatura = a.thumbnail_url;
    if (typeof modelo !== 'string' || !URL_ARWEAVE.test(modelo)) continue;
    if (typeof miniatura !== 'string' || !URL_ARWEAVE.test(miniatura)) continue;
    const meta = objeto(a.metadata) ? a.metadata : {};
    const numero = texto(meta.number, 6).replace(/[^0-9]/g, '');
    const nome = texto(a.name, 60);
    if (!nome) continue;
    saida.push({
      id: `${colecao}-${numero || String(saida.length + 1)}-${modelo.slice(-8)}`
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, ''),
      nome,
      numero,
      colecao,
      modelo,
      miniatura,
    });
  }
  return saida;
}
