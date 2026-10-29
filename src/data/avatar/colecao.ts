/**
 * A COLEÇÃO CURADA DE AVATARES do Frasy: os modelos que avaliamos um a um e que valem também para o perfil
 * protegido (menor de idade), mesmo com o `meta` do arquivo permissivo (ver `core/avatar/licencaVrm.ts`).
 *
 * Cada modelo carrega a licença LITERAL e o crédito. O arquivo mora no bucket `VITE_AVATARES_URL`
 * (`<base>/colecao/<id>.vrm`, `VITE_AVATARES_URL` apontando para um R2/CDN); sem a variável, do próprio domínio em
 * `/avatares/colecao/<id>.vrm` (`public/avatares/colecao/`, vai no `dist`; licenças e SHA-256 em
 * `public/avatares/colecao/LICENSES.md`). Isto NÃO é parecer jurídico.
 *
 * `suporta` diz quais controles da paleta o modelo permite: os modelos 100Avatars têm UMA textura "assada" e um
 * único material, então pele, cabelo e olhos não se separam e a tela ESCONDE esses controles em vez de fingir.
 * Altura, largura e escala funcionam em qualquer modelo.
 */
import type { SuporteDaPaleta } from '../../core/avatar/aparencia';
import {
  type CamerasDoModelo,
  type MedidasDoModelo,
  passaNoEnquadramento,
} from '../../core/avatar/enquadramento';

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
  /**
   * As câmeras calibradas POR ESTE MODELO: `corpo` (inteiro, braços abertos, sem corte) e `rosto` (busto, para a
   * miniatura). Saem de `medidas` por `enquadrarCaixa` e são conferidas por `tests/avatar-enquadramento.test.ts`.
   */
  camera: CamerasDoModelo;
  /** Caixas do corpo e do rosto, lidas do próprio arquivo (escala 1, metros). */
  medidas: MedidasDoModelo;
}

const REGISTRO = 'https://github.com/ToxSam/open-source-avatars';
const CC0 = 'CC0 1.0 (registro e meta do arquivo: licenseName="CC0")';

export const COLECAO_CURADA: readonly ModeloDaColecao[] = [
  {
    id: 'milk',
    origem: 'colecao',
    nome: 'Milk',
    autor: 'Polygonal Mind',
    licenca: CC0,
    credito: 'Milk (100Avatars R1, nº 084), Polygonal Mind, CC0 1.0',
    fonteUrl: REGISTRO,
    descricao: 'Personagem estilizado de poucos polígonos',
    suporta: { pele: false, cabelo: false, olhos: false },
    triangulos: 9000,
    medidas: { caixa: { min: [-1.064, 0, -0.185], max: [1.064, 1.601, 0.2] }, caixaDoRosto: { min: [-0.184, 1.129, -0.186], max: [0.185, 1.601, 0.199] }, rosto: { cabecaY: 1.188 } },
    camera: { corpo: { alvo: [0, 0.801, 0.008], distancia: 5.434 }, rosto: { alvo: [0.001, 1.365, 0.007], distancia: 1.588 } },
  },
  {
    id: 'bullidan',
    origem: 'colecao',
    nome: 'Bullidan',
    autor: 'Polygonal Mind',
    licenca: CC0,
    credito: 'Bullidan (100Avatars R1, nº 028), Polygonal Mind, CC0 1.0',
    fonteUrl: REGISTRO,
    descricao: 'Personagem estilizado de poucos polígonos',
    suporta: { pele: false, cabelo: false, olhos: false },
    triangulos: 9000,
    medidas: { caixa: { min: [-1.064, 0, -0.412], max: [1.064, 2.146, 0.226] }, caixaDoRosto: { min: [-0.177, 1.38, -0.413], max: [0.178, 2.145, 0.226] }, rosto: { cabecaY: 1.399 } },
    camera: { corpo: { alvo: [0, 1.073, -0.093], distancia: 5.605 }, rosto: { alvo: [0.001, 1.763, -0.093], distancia: 2.582 } },
  },
  {
    id: '100avatars-r1-devil',
    origem: 'colecao',
    nome: 'Devil',
    autor: 'Polygonal Mind',
    licenca: CC0,
    credito: 'Devil (100Avatars R1, nº 031), Polygonal Mind, CC0 1.0',
    fonteUrl: REGISTRO,
    descricao: 'Personagem estilizado de poucos polígonos',
    suporta: { pele: false, cabelo: false, olhos: false },
    triangulos: 3944,
    medidas: { caixa: { min: [-0.894, 0, -0.55], max: [0.894, 1.741, 0.28] }, caixaDoRosto: { min: [-0.189, 1.278, -0.116], max: [0.19, 1.742, 0.278] }, rosto: { cabecaY: 1.313 } },
    camera: { corpo: { alvo: [0, 0.871, -0.135], distancia: 4.82 }, rosto: { alvo: [0.001, 1.51, 0.081], distancia: 1.569 } },
  },
  {
    id: '100avatars-r1-dinokid',
    origem: 'colecao',
    nome: 'DinoKid',
    autor: 'Polygonal Mind',
    licenca: CC0,
    credito: 'DinoKid (100Avatars R1, nº 045), Polygonal Mind, CC0 1.0',
    fonteUrl: REGISTRO,
    descricao: 'Personagem estilizado de poucos polígonos',
    suporta: { pele: false, cabelo: false, olhos: false },
    triangulos: 4576,
    medidas: { caixa: { min: [-0.755, 0, -0.314], max: [0.756, 1.235, 0.355] }, caixaDoRosto: { min: [-0.26, 0.675, -0.314], max: [0.261, 1.235, 0.354] }, rosto: { cabecaY: 0.717 } },
    camera: { corpo: { alvo: [0.001, 0.618, 0.02], distancia: 4.057 }, rosto: { alvo: [0.001, 0.955, 0.02], distancia: 1.991 } },
  },
  {
    id: '100avatars-r2-coolbunny',
    origem: 'colecao',
    nome: 'CoolBunny',
    autor: 'Polygonal Mind',
    licenca: CC0,
    credito: 'CoolBunny (100Avatars R2, nº 179), Polygonal Mind, CC0 1.0',
    fonteUrl: REGISTRO,
    descricao: 'Personagem estilizado de poucos polígonos',
    suporta: { pele: false, cabelo: false, olhos: false },
    triangulos: 3754,
    medidas: { caixa: { min: [-1.091, 0.002, -0.187], max: [1.091, 2.386, 0.181] }, caixaDoRosto: { min: [-0.222, 1.594, -0.188], max: [0.223, 2.387, 0.18] }, rosto: { cabecaY: 1.6 } },
    camera: { corpo: { alvo: [0, 1.194, -0.003], distancia: 6.056 }, rosto: { alvo: [0.001, 1.991, -0.004], distancia: 2.528 } },
  },
  {
    id: '100avatars-r2-coolhydrant',
    origem: 'colecao',
    nome: 'CoolHydrant',
    autor: 'Polygonal Mind',
    licenca: CC0,
    credito: 'CoolHydrant (100Avatars R2, nº 139), Polygonal Mind, CC0 1.0',
    fonteUrl: REGISTRO,
    descricao: 'Personagem estilizado de poucos polígonos',
    suporta: { pele: false, cabelo: false, olhos: false },
    triangulos: 5128,
    medidas: { caixa: { min: [-1.223, 0, -0.305], max: [1.223, 2.201, 0.393] }, caixaDoRosto: { min: [-0.42, 1.47, -0.305], max: [0.42, 2.201, 0.393] }, rosto: { cabecaY: 1.593 } },
    camera: { corpo: { alvo: [0, 1.101, 0.044], distancia: 6.374 }, rosto: { alvo: [0, 1.836, 0.044], distancia: 2.833 } },
  },
];

export const modeloDaColecao = (id: string): ModeloDaColecao | undefined => COLECAO_CURADA.find((m) => m.id === id);

/**
 * Os modelos que PODEM ser sorteados ("Sugerido para você", "Escolher para mim"): só os que passam no teste de
 * enquadramento (corpo inteiro e rosto dentro do quadro, com margem). Um modelo novo que não passa continua na
 * grade, mas ninguém o recebe de surpresa cortado.
 */
export const COLECAO_SUGERIVEL: readonly ModeloDaColecao[] = COLECAO_CURADA.filter(
  (m) => passaNoEnquadramento(m.medidas, m.camera).passa,
);
