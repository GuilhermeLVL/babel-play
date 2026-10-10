/**
 * PARAKEET TDT 0.6b v3 (int8, WASM) — o que a rota e o gateway sabem do modelo SEM abrir nada (puro,
 * sem DOM, e pequeno de propósito: este é o único pedaço do Parakeet que entra no JS do arranque).
 *
 * É o "preciso no aparelho" de português e espanhol NO COMPUTADOR, atrás da chave `babel.stt.parakeet`
 * (DESLIGADA de fábrica). Medido em 09/10/2026 (`docs/auditoria/2026-10-09-medicoes-no-aparelho.md`,
 * Chrome 154, FLEURS, 100 falas por idioma, 4 threads):
 *
 *   português   Parakeet int8 WASM  5,8% [4,6–7,1]   Whisper small (GPU) 10,8%   Whisper base 18,2%
 *   espanhol    Parakeet int8 WASM  4,5% [3,6–5,6]   Whisper small (GPU)  9,3%   Whisper base 15,5%
 *   fator de tempo real 0,089 (11× mais rápido que a fala), 672 MB de download, 2,0 GB de RAM do Chrome
 *
 * A biblioteca (`@huggingface/transformers` 4.2.0) não tem a arquitetura TDT: o modelo roda no
 * `onnxruntime-web` direto, num worker próprio (`parakeetWorker.ts`), com o laço de decodificação de
 * `parakeetTdt.ts`. Os arquivos (commits fixados e sha256) estão em `parakeetArquivos.ts`.
 *
 * LICENÇA: os pesos são CC-BY-4.0 (NVIDIA; export ONNX de istupakov). A atribuição está em `FONTES.md`.
 */

/** Chave local que liga a rota (`localStorage`); só o valor `'1'` liga. Nada de flag de servidor. */
export const CHAVE_DO_PARAKEET = 'babel.stt.parakeet';

/**
 * Id do modelo na rota, no manifesto e no Cache Storage. Não é um repositório do Hub: é o trecho que
 * os DOIS repositórios dos pesos têm no nome, e por isso está em toda URL de peso — é o que deixa
 * "Liberar espaço" (`apagarModelo`) e o manifesto (`modeloDisponivel`) acharem os arquivos por `includes`.
 */
export const ID_DO_PARAKEET = 'parakeet-tdt-0.6b-v3';

/** O `adapterId` do motor no registro (`core/harness/registroDeMotores.ts`) e no `engine` da fala. */
export const ADAPTADOR_DO_PARAKEET = 'parakeet-local';

/** Quantização e backend medidos: é a chave do manifesto (`<id>|int8|wasm`). */
export const DTYPE_DO_PARAKEET = 'int8';
export const DEVICE_DO_PARAKEET = 'wasm' as const;

/**
 * Os idiomas em que a ROTA usa o Parakeet: os dois medidos contra o Whisper small. O modelo cobre 25
 * idiomas europeus e detecta sozinho; francês e alemão não foram medidos, e o inglês ficou
 * inconclusivo contra o Moonshine — por isso ficam como estão.
 */
export const IDIOMAS_DO_PARAKEET: readonly string[] = ['pt', 'es'];

/**
 * Janela do encoder exportado: cerca de 35 s. Trecho maior é DIVIDIDO no ponto mais silencioso dos
 * últimos segundos da janela (`parakeetTdt.dividirEmJanelas`); 30 s deixa folga, e a fala mais longa
 * medida na bancada tem 29,9 s.
 */
export const JANELA_DO_PARAKEET_S = 30;

/**
 * MB decimais do download, como as tabelas do `sttRouter.ts`: os quatro arquivos somam 671,67 MB
 * (`BYTES_DO_PARAKEET` em `parakeetArquivos.ts`; o teste cobra que este número seja o teto dele).
 */
export const MB_DO_PARAKEET = 672;

/**
 * A "revisão" gravada no manifesto: o começo dos dois commits fixados (istupakov + striimit). É o que
 * "Procurar atualização" compara; o teste cobra que bata com `parakeetArquivos.ts`.
 */
export const REVISAO_DO_PARAKEET = '8f23f0c03c87+d233168ffeab';

/** O id é o do Parakeet? */
export function ehParakeet(modelId?: string | null): boolean {
  return modelId === ID_DO_PARAKEET;
}

/** A versão fixada quando o `modelId` é o do Parakeet; `null` para os outros. */
export function revisaoFixaDoParakeet(modelId: string): string | null {
  return ehParakeet(modelId) ? REVISAO_DO_PARAKEET : null;
}

/**
 * O Parakeet pode decodificar um trecho com esta dica de idioma? Só português e espanhol EXPLÍCITOS.
 * Sem dica ("Detectar") ou em outro idioma, o adaptador recusa e a cadeia cai no Whisper: a rota não
 * escolhe o Parakeet nesses casos, mas quem vê a dica de CADA trecho é o adaptador.
 */
export function parakeetAceita(languageHint?: string): boolean {
  return IDIOMAS_DO_PARAKEET.includes((languageHint || '').toLowerCase().split('-')[0]);
}

/** A chave local está ligada? Sem `localStorage` (worker, teste, modo privado restrito): desligada. */
export function parakeetLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE_DO_PARAKEET) === '1';
  } catch {
    return false;
  }
}
