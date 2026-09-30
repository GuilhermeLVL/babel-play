/**
 * BERGAMOT — o que o app sabe do motor e do modelo pt→en ANTES de abrir o worker (puro, sem DOM).
 *
 * POR QUE EXISTE À PARTE. Três lugares precisam da mesma resposta, e nenhum deles pode pagar o
 * worker: o adaptador (`bergamotLocal.ts`) para rotear, a tela da captura para dizer quanto baixa
 * (`sttRouter.tamanhoDoDownloadMb`, `modelCache.expectedModelIds`) e o diálogo "Modelo no
 * dispositivo" para saber a versão. A resposta é uma só — "o Bergamot é oferecido para este par,
 * neste aparelho?" — e mora aqui.
 *
 * OFERECIDO = as quatro coisas juntas:
 *   1. o PAR é o da decisão da bancada (Etapa 5): só pt→en (`bergamotVenceNoPar`);
 *   2. o BUILD tem os modelos: `scripts/baixar-modelos-bergamot.mjs` baixou e conferiu os três
 *      `.gz` em `public/modelos/bergamot/…` (ou `VITE_BERGAMOT_MODELOS_URL` aponta para um CDN) — o
 *      `vite.config.ts` troca `__BERGAMOT_PT_EN__` por `true`. Build sem rede sai com `false` e o app
 *      segue no opus-mt, sem prometer 31 MB que não existem;
 *   3. o NAVEGADOR roda o motor: WebAssembly, Worker, `DecompressionStream` e `crypto.subtle`;
 *   4. o motor NÃO FALHOU neste aparelho nesta versão (o WASM não abriu, o modelo não montou) — a
 *      falha fica lembrada no `localStorage` para a próxima captura não baixar e falhar de novo; a
 *      versão nova do motor ou do modelo tenta outra vez.
 *
 * Os números (bytes, sha256, id da execução de treino) vêm de `modelosDoBergamot.json`, a MESMA
 * fonte que o script de build lê: um só lugar para trocar de modelo.
 */
import { bergamotVenceNoPar } from '../../core/harness/roteadorDeTraducao';
import modelos from './modelosDoBergamot.json';

declare const __BERGAMOT_PT_EN__: boolean | undefined;

export type ParDoBergamot = keyof typeof modelos.pares;
export type ChaveDoArquivo = 'modelo' | 'lex' | 'vocab';

/** Id do modelo no manifesto e no Cache Storage (as URLs sempre contêm `bergamot/<par>`). */
export const idDoBergamot = (par: ParDoBergamot): string => `bergamot/${par}`;
export const ID_DO_BERGAMOT_PT_EN = idDoBergamot('pt-en');

export const VERSAO_DO_MOTOR: string = modelos.motor.versao;

/** O par do Bergamot para esta direção, ou `null` (só pt→en — a decisão da bancada). */
export function parDoBergamot(src: string | null, tgt: string): ParDoBergamot | null {
  return src && bergamotVenceNoPar(src, tgt) ? 'pt-en' : null;
}

/** O id do manifesto quando o `modelId` é de um par do Bergamot; `null` para os outros. */
export function parDoId(modelId: string): ParDoBergamot | null {
  const par = /^bergamot\/(.+)$/.exec(modelId)?.[1];
  return par && par in modelos.pares ? (par as ParDoBergamot) : null;
}

/**
 * Bytes que a PRIMEIRA carga busca: os três `.gz` do par + o WASM e a cola do motor, sem contar
 * compressão de transporte (o WASM vai em brotli do nosso servidor: ~1,4 MB em vez de 5,2). O aviso
 * de download usa o teto, para nunca prometer menos do que baixa — a mesma regra do opus-mt.
 */
export function bytesDoDownload(par: ParDoBergamot): number {
  const arquivos = Object.values(modelos.pares[par].arquivos).reduce((soma, a) => soma + a.bytes, 0);
  return arquivos + modelos.motor.wasm.bytes + modelos.motor.cola.bytes;
}

/** MB decimais (como as tabelas do `sttRouter.ts`), arredondados para cima: 30,85 → 31. */
export const mbDoDownload = (par: ParDoBergamot): number => Math.ceil(bytesDoDownload(par) / 1_000_000);

/** A versão fixada do par (o id da execução de treino): é o que "Procurar atualização" compara. */
export function revisaoFixaDoModelo(modelId: string): string | null {
  const par = parDoId(modelId);
  return par ? modelos.pares[par].execucao : null;
}

/** O build embutiu os modelos (ou um CDN para eles)? Fora do Vite (testes, Node) é `false`. */
export function bergamotNoBuild(): boolean {
  return typeof __BERGAMOT_PT_EN__ === 'boolean' && __BERGAMOT_PT_EN__;
}

/** O navegador tem o que o worker usa. Sem `DecompressionStream` (Safari < 16.4) não há como abrir o `.gz`. */
export function ambienteRodaBergamot(g: typeof globalThis = globalThis): boolean {
  const x = g as unknown as Record<string, unknown> & { crypto?: { subtle?: unknown } };
  return (
    typeof x.WebAssembly === 'object' &&
    typeof x.Worker === 'function' &&
    typeof x.DecompressionStream === 'function' &&
    !!x.crypto?.subtle
  );
}

const CHAVE_DA_FALHA = 'babel.bergamot.falha';

/** A falha vale para ESTA combinação de motor e modelos: uma versão nova merece outra tentativa. */
const assinatura = (): string => [VERSAO_DO_MOTOR, ...Object.values(modelos.pares).map((p) => p.execucao)].join('|');

/** O motor já falhou neste aparelho (WASM que não abre, modelo que não monta)? */
export function bergamotFalhouNesteAparelho(): boolean {
  try {
    const cru = localStorage.getItem(CHAVE_DA_FALHA);
    return !!cru && (JSON.parse(cru) as { assinatura?: string }).assinatura === assinatura();
  } catch {
    return false;
  }
}

/**
 * Lembra a falha do MOTOR. Rede e integridade não entram: sem internet agora, ou um deploy com
 * arquivo quebrado, não dizem nada sobre este navegador — a próxima captura tenta de novo.
 */
export function lembrarFalhaDoBergamot(motivo: string): void {
  try {
    localStorage.setItem(
      CHAVE_DA_FALHA,
      JSON.stringify({ assinatura: assinatura(), motivo: motivo.slice(0, 160), em: Date.now() }),
    );
  } catch {
    /* sem localStorage: a falha vale só para esta sessão (o adaptador também guarda) */
  }
}

/** O Bergamot atende esta direção neste aparelho? (ver o topo do arquivo) */
export function bergamotOferecido(src: string | null, tgt: string): boolean {
  return !!parDoBergamot(src, tgt) && bergamotNoBuild() && ambienteRodaBergamot() && !bergamotFalhouNesteAparelho();
}

export interface ArquivoDaCarga {
  chave: ChaveDoArquivo;
  url: string;
  /** Bytes do `.gz` como o servidor entrega (o que fica no Cache Storage). */
  bytes: number;
  /** sha256 do conteúdo DESCOMPRIMIDO: confere o que o motor recebe, qualquer que seja o transporte. */
  sha256: string;
  /** Alinhamento de memória que o motor exige (`AlignedMemory`): 256 no modelo, 64 no resto. */
  alinhamento: number;
}

/** Tudo que o worker precisa para carregar um par: URLs absolutas, tamanhos e hashes. */
export interface PlanoDeCarga {
  par: ParDoBergamot;
  modelId: string;
  /** Id da execução de treino — a "revisão" gravada no manifesto. */
  revisao: string;
  motor: { wasm: string; cola: string };
  arquivos: ArquivoDaCarga[];
  /** Soma dos `.gz` (a barra de progresso é por bytes reais do modelo). */
  bytesTotais: number;
}

const semBarraNoFim = (u: string): string => u.replace(/\/+$/, '');

/**
 * As URLs de um par. `base` é de onde vêm os MODELOS: `VITE_BERGAMOT_MODELOS_URL` (R2/CDN) ou o
 * próprio domínio (`<BASE_URL>modelos`). O MOTOR (WASM e cola) vem SEMPRE do próprio domínio: é
 * código que o worker executa, e a CSP só libera script de `'self'`. O layout embaixo da base é o
 * mesmo do `public/`: `bergamot/<par>/<execução>/<arquivo>` — e é esse `bergamot/<par>` na URL que
 * deixa "Liberar espaço" (`apagarModelo`) achar os arquivos no cache por qualquer base.
 */
export function planoDeCarga(
  par: ParDoBergamot,
  opcoes: { origem: string; baseDoApp?: string; baseDosModelos?: string },
): PlanoDeCarga {
  const cfg = modelos.pares[par];
  const app = new URL(opcoes.baseDoApp ?? '/', opcoes.origem).href;
  const baseModelos = opcoes.baseDosModelos?.trim()
    ? semBarraNoFim(new URL(opcoes.baseDosModelos.trim(), app).href)
    : semBarraNoFim(new URL('modelos', app).href);
  const motor = new URL(`modelos/bergamot/motor-${VERSAO_DO_MOTOR}/`, app).href;
  const arquivos = (Object.entries(cfg.arquivos) as [ChaveDoArquivo, (typeof cfg.arquivos)['modelo']][]).map(
    ([chave, a]) => ({
      chave,
      url: `${baseModelos}/bergamot/${par}/${cfg.execucao}/${a.nome}`,
      bytes: a.bytes,
      sha256: a.sha256Descomprimido,
      alinhamento: a.alinhamento,
    }),
  );
  return {
    par,
    modelId: idDoBergamot(par),
    revisao: cfg.execucao,
    motor: { wasm: `${motor}${modelos.motor.wasm.nome}`, cola: `${motor}bergamot-translator-worker.mjs` },
    arquivos,
    bytesTotais: arquivos.reduce((s, a) => s + a.bytes, 0),
  };
}

/** O plano da página atual (a janela chama; o worker só recebe o resultado). */
export function planoDaPagina(par: ParDoBergamot): PlanoDeCarga {
  return planoDeCarga(par, {
    origem: typeof location !== 'undefined' ? location.href : 'http://localhost/',
    baseDoApp: import.meta.env?.BASE_URL,
    baseDosModelos: import.meta.env?.VITE_BERGAMOT_MODELOS_URL as string | undefined,
  });
}
