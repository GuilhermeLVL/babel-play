/**
 * REVISÃO FIXADA DE CADA MODELO LOCAL — GAP-014 da auditoria pré-deploy (2026-09-13).
 *
 * O transformers.js baixa os pesos de `huggingface.co/<modelo>/resolve/main/<arquivo>`. `main` é um
 * ponteiro que o dono do repositório no Hub move quando quiser: um commit novo — por engano, por
 * conta comprometida ou por mudança de formato — chegaria a todo navegador na visita seguinte, sem
 * deploy nosso e sem ninguém revisar (OWASP LLM05, cadeia de suprimentos).
 *
 * Cada modelo que o app carrega aponta para o COMMIT abaixo. No Hub, `resolve/<sha>` é imutável:
 * o conteúdo de cada arquivo está amarrado ao commit (os pesos grandes pelo sha256 do LFS). A troca
 * de `main` pelo commit acontece num lugar só, o `fetch` do transformers.js
 * (`adapters/transformersEnv.ts`), então nenhum worker precisou mudar.
 *
 * ATUALIZAR UM MODELO é uma decisão com revisão: rodar `node scripts/modelos/revisoes.mjs` (consulta
 * o Hub e mostra o que mudou), conferir, trocar o sha aqui e, com o bucket R2, republicar os pesos
 * (`scripts/modelos/publicar-no-r2.ts`). Consultado em 2026-09-24.
 */
export const REVISOES_DOS_MODELOS: Readonly<Record<string, string>> = {
  'onnx-community/whisper-tiny': 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7',
  'onnx-community/whisper-base': '1846881b6b3a3024392c1eea3ad983695bc23925',
  'onnx-community/whisper-small': '36050c46d777d46dc4b5f43f6d90574fc38f8732',
  // Moonshine (STT local de inglês, MIT) — `main` conferido em 2026-09-24 (último commit: jan/2025).
  'onnx-community/moonshine-base-ONNX': 'b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad',
  'onnx-community/moonshine-tiny-ONNX': 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95',
  'Xenova/opus-mt-en-es': '4b002a4c7edd54a7ced58877258b87f7efd3f892',
  'Xenova/opus-mt-en-fr': '28726206f80896b90035bd99cccd5cc1e151f916',
  'Xenova/opus-mt-en-it': '075406e3c8c2c30634d4a1bd8f00c21d9e162011',
  'Xenova/opus-mt-en-de': '1ca130c44c4c5441ef16d48aae521a424ab644f7',
  'Xenova/opus-mt-es-en': 'eadfd7c658a9d8929ac3b8e996b68a68e2c7d480',
  'Xenova/opus-mt-fr-en': '6b166a182780e118c997879d0ad5be4b53671644',
  'Xenova/opus-mt-it-en': 'fd0b89b9c052adc1f2f64152f555aa17353728be',
  'Xenova/opus-mt-de-en': '399dfd68706739fffd503f876093e455ae268a06',
  'Xenova/opus-mt-en-ROMANCE': '9d2ba69ac80c8e8453c3d9a1e2323a0e7b8ca3cd',
  'Xenova/opus-mt-ROMANCE-en': 'f60feaabe8bb435a5871e7702b25f53a01e770f8',
  // Chinês → inglês (pivô do zh→pt/es/fr/it/de), `main` conferido em 2026-10-17 (último commit: jul/2025).
  'Xenova/opus-mt-zh-en': '39d480d52a9ea3065a1f117adfe4dbc55de10e6f',
  // Os demais idiomas que passam pelo inglês (`core/traducao/viaIngles.ts`), `main` conferido em 2026-10-17.
  'Xenova/opus-mt-ja-en': '1a906cfaaf7c8f4193f67f5885c082aa6dbd9d16',
  'Xenova/opus-mt-ko-en': 'd9fa1ac6008242100fecb4fff9b0a5917a1be81f',
  'Xenova/opus-mt-ru-en': 'afe8c6c738ec81b6d033fd8f44f9678a639a7c67',
  'Xenova/opus-mt-ar-en': '09c7556866400dcc53562ba8d7035119e7d9a2c1',
  'Xenova/opus-mt-tr-en': '78247f41f354af036d24e6f0f8a3d02c6806f96e',
  'Xenova/opus-mt-pl-en': 'aeaf0e003b045248c28a559a5ce6027b54ebdaba',
  'Xenova/opus-mt-nl-en': '82c42d95d1508037cbe7172d85fd4e940a2f3584',
  'Xenova/opus-mt-uk-en': 'b2ad6afa424aaeff8913ff350860b7a7b7c0a607',
  'Xenova/opus-mt-sv-en': '63a40256869b6a2b29a84e47aa7f03524fa5f3a2',
  'Xenova/opus-mt-fi-en': 'a623e4812687be788e3ab720c8a950ab64704793',
  'Xenova/opus-mt-cs-en': 'c9f7336d1cf49ba5b7a412cba3b86999fa781716',
  'Xenova/opus-mt-hu-en': 'c9e8a7617fb4cb4fca3785c5bb22cfe457cde00b',
  'Xenova/opus-mt-id-en': 'c38ef36c843b71177da903442835c3c870975fd6',
  'Xenova/opus-mt-th-en': '7f0406b972f742985cfbe3be8f61dead9f1bc0e3',
  'onnx-community/wespeaker-voxceleb-resnet34-LM': '6a61a1833ff2583aabeba044f5c8221f00b67ceb',
};

const HUB = 'https://huggingface.co/';
const PADRAO_DO_HUB = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/;

/**
 * Reescreve uma URL de peso do Hub.
 *
 *  - modelo conhecido pedido em `main` → o mesmo arquivo no commit fixado;
 *  - com `origemDoBucket` (VITE_SELF_HOST_MODELS=<url>) → `<bucket>/<modelo>/<sha>/<arquivo>`, o
 *    layout que `scripts/modelos/publicar-no-r2.ts` grava;
 *  - modelo fora da lista, ou URL que não é de peso do Hub → intocada. Um modelo novo que alguém
 *    esqueça de fixar continua funcionando (em `main`), e o teste da lista acusa a ausência.
 */
export function urlFixadaDoModelo(url: string, origemDoBucket?: string): string {
  if (!url.startsWith(HUB)) return url;
  const m = PADRAO_DO_HUB.exec(url);
  if (!m) return url;
  const [, modelo, revisao, arquivo] = m;
  const sha = REVISOES_DOS_MODELOS[modelo];
  if (!sha || (revisao !== 'main' && revisao !== sha)) return url;
  if (origemDoBucket) return `${origemDoBucket.replace(/\/+$/, '')}/${modelo}/${sha}/${arquivo}`;
  return `${HUB}${modelo}/resolve/${sha}/${arquivo}`;
}
