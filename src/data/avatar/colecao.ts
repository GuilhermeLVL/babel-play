/**
 * A COLEÇÃO CURADA DE AVATARES do Frasy: os modelos que avaliamos um a um e que valem também para o perfil
 * protegido (menor de idade), mesmo com o `meta` do arquivo permissivo (ver `core/avatar/licencaVrm.ts`).
 *
 * Cada modelo carrega a licença LITERAL e o crédito. O arquivo mora no bucket `VITE_AVATARES_URL`
 * (`<base>/colecao/<id>.vrm`); em desenvolvimento, sem a variável, cai em `public/avatares/dev/<id>.vrm`
 * (fora do `dist`, ver `public/avatares/dev/LICENSES.md`). Isto NÃO é parecer jurídico.
 *
 * `suporta` diz quais controles da paleta o modelo permite: os modelos 100Avatars têm UMA textura "assada" e um
 * único material, então pele, cabelo e olhos não se separam e a tela ESCONDE esses controles em vez de fingir.
 * Altura, largura e escala funcionam em qualquer modelo.
 */
import type { SuporteDaPaleta } from '../../core/avatar/aparencia';

export interface ModeloDaColecao {
  id: string;
  origem: 'colecao';
  /** Nome para mostrar (nome próprio do modelo, não se traduz). */
  nome: string;
  autor: string;
  /** A licença como o registro e o `meta` do arquivo a escrevem. */
  licenca: string;
  /** O crédito que a tela mostra onde o avatar aparece. */
  credito: string;
  /** Onde o modelo foi publicado (registro de origem). */
  fonteUrl: string;
  /** Texto alternativo curto, sem estereótipo. */
  descricao: string;
  suporta: SuporteDaPaleta;
  /** Triângulos aproximados, para o tier. */
  triangulos: number;
}

const REGISTRO = 'https://github.com/ToxSam/open-source-avatars';

export const COLECAO_CURADA: readonly ModeloDaColecao[] = [
  {
    id: 'milk',
    origem: 'colecao',
    nome: 'Milk',
    autor: 'Polygonal Mind',
    licenca: 'CC0 1.0 (registro e meta do arquivo: licenseName="CC0")',
    credito: 'Milk (100Avatars R1, nº 084), Polygonal Mind, CC0 1.0',
    fonteUrl: REGISTRO,
    descricao: 'Personagem estilizado de poucos polígonos',
    suporta: { pele: false, cabelo: false, olhos: false },
    triangulos: 9000,
  },
  {
    id: 'bullidan',
    origem: 'colecao',
    nome: 'Bullidan',
    autor: 'Polygonal Mind',
    licenca: 'CC0 1.0 (registro e meta do arquivo: licenseName="CC0")',
    credito: 'Bullidan (100Avatars R1, nº 028), Polygonal Mind, CC0 1.0',
    fonteUrl: REGISTRO,
    descricao: 'Personagem estilizado de poucos polígonos',
    suporta: { pele: false, cabelo: false, olhos: false },
    triangulos: 9000,
  },
];

export const modeloDaColecao = (id: string): ModeloDaColecao | undefined => COLECAO_CURADA.find((m) => m.id === id);
