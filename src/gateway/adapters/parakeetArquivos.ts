/**
 * PARAKEET — os ARQUIVOS fixados (commit + sha256) e o plano de carga. Fora do JS do arranque: só o
 * adaptador (`parakeetLocal.ts`, que entra por `import()`) e o worker leem isto; a rota e o gateway
 * ficam com o pedaço leve (`parakeetModelo.ts`).
 *
 * Os arquivos vêm de DOIS repositórios de terceiros no Hugging Face, cada um no COMMIT fixado
 * (`resolve/<sha>` é imutável), e cada arquivo tem o tamanho e o sha256 conferidos no navegador antes
 * de ir ao cache e antes de cada carga (como o Bergamot):
 *   - `istupakov/parakeet-tdt-0.6b-v3-onnx`: o encoder int8, o decoder+joint int8 e o vocabulário;
 *   - `striimit/parakeet-tdt-0.6b-v3-webgpu`: só o `nemo128_conv.onnx`, o extrator de áudio escrito
 *     com convolução (do projeto onnx-asr). O `nemo128.onnx` do export original usa o operador STFT e
 *     NÃO abre no onnxruntime-web ("Could not find an implementation for Cast(13)").
 * Os sha256 abaixo são os `lfs.oid` que o Hub publica para esses commits (API `tree/<sha>`, consultada
 * em 09/10/2026), conferidos contra os arquivos que a bancada mediu
 * (`docs/auditoria/2026-10-09-medicoes-no-aparelho.md`).
 *
 * TROCAR DE VERSÃO é uma decisão com medição: trocar commit, bytes e sha256 aqui, o total e a revisão
 * em `parakeetModelo.ts` (o teste cobra que batam) e repetir a bancada.
 */
import { ID_DO_PARAKEET, REVISAO_DO_PARAKEET } from './parakeetModelo';

export type PapelDoArquivo = 'pre' | 'encoder' | 'decoder' | 'vocab';

interface ArquivoFixado {
  papel: PapelDoArquivo;
  repo: string;
  /** Commit do repositório (40 hex): `resolve/<sha>` no Hub é imutável. */
  revisao: string;
  nome: string;
  bytes: number;
  sha256: string;
}

const ISTUPAKOV = {
  repo: 'istupakov/parakeet-tdt-0.6b-v3-onnx',
  revisao: '8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce',
};
const STRIIMIT = {
  repo: 'striimit/parakeet-tdt-0.6b-v3-webgpu',
  revisao: 'd233168ffeab292a6b3d2379a5b2d5934e1df8a7',
};

/** Na ordem da carga: os pequenos primeiro, o encoder (652 MB) por último. */
export const ARQUIVOS_DO_PARAKEET: readonly ArquivoFixado[] = [
  {
    papel: 'vocab',
    ...ISTUPAKOV,
    nome: 'vocab.txt',
    bytes: 93_939,
    sha256: 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d',
  },
  {
    papel: 'pre',
    ...STRIIMIT,
    nome: 'nemo128_conv.onnx',
    bytes: 1_190_298,
    sha256: '5bbdc98847c3153c54e7b58f2c8668d0c19a22d07ed16204a058d26880985c6c',
  },
  {
    papel: 'decoder',
    ...ISTUPAKOV,
    nome: 'decoder_joint-model.int8.onnx',
    bytes: 18_202_004,
    sha256: 'eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70',
  },
  {
    papel: 'encoder',
    ...ISTUPAKOV,
    nome: 'encoder-model.int8.onnx',
    bytes: 652_183_999,
    sha256: '6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09',
  },
];

/** Bytes da primeira carga (os quatro arquivos; o runtime do ORT o app já serve para o VAD). */
export const BYTES_DO_PARAKEET = ARQUIVOS_DO_PARAKEET.reduce((soma, a) => soma + a.bytes, 0);

export interface ArquivoDaCargaDoParakeet {
  papel: PapelDoArquivo;
  url: string;
  bytes: number;
  sha256: string;
}

/** Tudo que o worker precisa para carregar: URLs absolutas, tamanhos e hashes. */
export interface PlanoDeCargaDoParakeet {
  modelId: string;
  revisao: string;
  arquivos: ArquivoDaCargaDoParakeet[];
  bytesTotais: number;
}

const semBarraNoFim = (u: string): string => u.replace(/\/+$/, '');

/**
 * As URLs dos pesos, pela MESMA variável dos outros modelos (`VITE_SELF_HOST_MODELS`, ver
 * `transformersEnv.ts`) e no MESMO layout de `scripts/modelos/publicar-no-r2.ts`:
 *
 *  - ausente → o Hub, no commit fixado: `huggingface.co/<repo>/resolve/<sha>/<arquivo>`;
 *  - `1`     → o próprio domínio: `/models/<repo>/<arquivo>` (o layout do `public/models`);
 *  - URL     → o bucket: `<url>/<repo>/<sha>/<arquivo>`. `https://`, ou `http://` só para o próprio
 *              computador (bancada e testes).
 *
 * De onde quer que venha, o arquivo só é usado se o tamanho e o sha256 conferirem: a origem não é a prova.
 */
export function planoDeCargaDoParakeet(opcoes: { origem: string; entrega?: string }): PlanoDeCargaDoParakeet {
  const entrega = (opcoes.entrega ?? '').trim();
  const mesmoDominio = entrega === '1' || entrega === 'true';
  const bucket = /^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$))/i.test(entrega)
    ? semBarraNoFim(entrega)
    : null;
  const url = (a: ArquivoFixado): string => {
    if (bucket) return `${bucket}/${a.repo}/${a.revisao}/${a.nome}`;
    if (mesmoDominio) return new URL(`/models/${a.repo}/${a.nome}`, opcoes.origem).href;
    return `https://huggingface.co/${a.repo}/resolve/${a.revisao}/${a.nome}`;
  };
  return {
    modelId: ID_DO_PARAKEET,
    revisao: REVISAO_DO_PARAKEET,
    arquivos: ARQUIVOS_DO_PARAKEET.map((a) => ({ papel: a.papel, url: url(a), bytes: a.bytes, sha256: a.sha256 })),
    bytesTotais: BYTES_DO_PARAKEET,
  };
}

/** O plano da página atual (a janela chama; o worker só recebe o resultado). */
export function planoDaPaginaDoParakeet(): PlanoDeCargaDoParakeet {
  return planoDeCargaDoParakeet({
    origem: typeof location !== 'undefined' ? location.href : 'http://localhost/',
    entrega: import.meta.env?.VITE_SELF_HOST_MODELS as string | undefined,
  });
}
