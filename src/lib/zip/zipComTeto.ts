/**
 * LER UM ZIP DE TERCEIROS SEM DEIXAR ELE ESTOURAR A MEMÓRIA (o F4-01 da auditoria, agora no navegador).
 *
 * Um zip pequeno pode virar centenas de MB: deflate chega a ~1000:1 (medido em `audit/scripts/midia.mjs`,
 * 200 KB viraram 200 MB). O `uncompressedSize` declarado no cabeçalho é escrito por quem gerou o arquivo, e
 * um zip malicioso mente, então ele não é usado para nada aqui: o que vale é a CONTAGEM dos bytes que saem
 * da inflação, pedaço a pedaço, e o teto é aplicado no meio do caminho, não depois.
 *
 * O arquivo é lido por `Blob.stream()` e empurrado no `fflate.Unzip` em fatias pequenas (`FATIA`): a
 * inflação de uma fatia sai inteira de uma vez, então o tamanho da fatia é o que limita quanto passa do
 * teto antes de a contagem perceber (16 KB × ~1000 ≈ 16 MB, transitório).
 */
import { Unzip, type UnzipFile, UnzipInflate } from 'fflate';

/** Uma entrada (ou o zip inteiro) descompactou mais que o teto: o arquivo é recusado. */
export class ExpansaoAcimaDoTeto extends Error {
  constructor(nome: string, teto: number) {
    super(`${nome} passou de ${Math.round(teto / 1048576)} MB ao descompactar; arquivo recusado`);
    this.name = 'ExpansaoAcimaDoTeto';
  }
}

const ZIP_INVALIDO = 'não consegui abrir este arquivo (não é um zip válido)';

/** Tamanho da fatia empurrada no `Unzip` (ver o comentário de topo). */
const FATIA = 16 * 1024;

/** Assinaturas que podem abrir um zip: cabeçalho local de entrada ou fim de diretório (zip vazio). */
const ABRE_ZIP = [0x04034b50, 0x06054b50];

/** O primeiro erro vence; erro que não é o teto vira "não é um zip válido", com a causa guardada. */
function comoErroDoZip(e: unknown): Error {
  if (e instanceof ExpansaoAcimaDoTeto) return e;
  return new Error(ZIP_INVALIDO, { cause: e });
}

/**
 * Percorre o zip chamando `aoAchar` para cada entrada (na ordem do arquivo). Quem quiser o conteúdo
 * chama `arquivo.start()` dentro de `aoAchar` e trata `ondata`; erro lançado ali (o teto) interrompe a
 * leitura e é relançado daqui.
 */
async function percorrerZip(arquivo: Blob, aoAchar: (entrada: UnzipFile, registrarErro: (e: unknown) => void) => void) {
  let erro: unknown;
  const registrarErro = (e: unknown) => {
    erro ??= e;
  };
  const unzip = new Unzip((entrada) => {
    try {
      aoAchar(entrada, registrarErro);
    } catch (e) {
      registrarErro(e);
    }
  });
  unzip.register(UnzipInflate);

  const leitor = arquivo.stream().getReader();
  let primeiro = true;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      const pedaco = value ?? new Uint8Array(0);
      if (primeiro) {
        primeiro = false;
        const assinatura = pedaco.length >= 4 ? new DataView(pedaco.buffer, pedaco.byteOffset).getUint32(0, true) : -1;
        if (!ABRE_ZIP.includes(assinatura)) throw new Error(ZIP_INVALIDO);
      }
      for (let i = 0; i < pedaco.length && erro === undefined; i += FATIA) {
        try {
          unzip.push(pedaco.subarray(i, i + FATIA), false);
        } catch (e) {
          registrarErro(e);
        }
      }
      if (done && erro === undefined) {
        try {
          unzip.push(new Uint8Array(0), true);
        } catch (e) {
          registrarErro(e);
        }
      }
      if (erro !== undefined) throw comoErroDoZip(erro);
      if (done) return;
    }
  } catch (e) {
    await leitor.cancel().catch(() => {
      /* o fluxo já foi fechado; nada a soltar */
    });
    throw comoErroDoZip(e);
  }
}

/**
 * Extrai SÓ as entradas pedidas em `nomes`, cada uma com teto de `teto` bytes descompactados. As outras
 * são atravessadas sem inflar. Devolve também todos os nomes vistos no zip (quem lê um `.apkg` precisa
 * saber se há mídia, que mora em entradas de nome numérico).
 */
export async function extrairDoZip(
  arquivo: Blob,
  nomes: string[],
  teto: number,
): Promise<{ entradas: Map<string, Uint8Array>; nomes: string[] }> {
  const pedidos = new Set(nomes);
  const vistos: string[] = [];
  const pedacosPorNome = new Map<string, Uint8Array[]>();

  await percorrerZip(arquivo, (entrada, registrarErro) => {
    vistos.push(entrada.name);
    if (!pedidos.has(entrada.name) || pedacosPorNome.has(entrada.name)) return;
    const pedacos: Uint8Array[] = [];
    pedacosPorNome.set(entrada.name, pedacos);
    let total = 0;
    entrada.ondata = (err, dados) => {
      if (err) return registrarErro(err);
      total += dados.length;
      if (total > teto) {
        // Solta o que já foi acumulado: sem isto o pico de memória que o teto evita aconteceria na hora do erro.
        pedacos.length = 0;
        throw new ExpansaoAcimaDoTeto(entrada.name, teto);
      }
      if (dados.length) pedacos.push(dados);
    };
    entrada.start();
  });

  const entradas = new Map<string, Uint8Array>();
  for (const [nome, pedacos] of pedacosPorNome) entradas.set(nome, juntarPedacos(pedacos));
  return { entradas, nomes: vistos };
}

/**
 * Infla TODAS as entradas contando e descartando os bytes: mede quanto o zip ocupa aberto, sem guardar
 * nada. Lança `ExpansaoAcimaDoTeto` quando uma entrada passa de `tetoPorEntrada` ou a soma passa de
 * `tetoTotal`; senão devolve a soma.
 */
export async function medirExpansaoDoZip(arquivo: Blob, tetoPorEntrada: number, tetoTotal: number): Promise<number> {
  let soma = 0;
  await percorrerZip(arquivo, (entrada, registrarErro) => {
    let total = 0;
    entrada.ondata = (err, dados) => {
      if (err) return registrarErro(err);
      total += dados.length;
      soma += dados.length;
      if (total > tetoPorEntrada) throw new ExpansaoAcimaDoTeto(entrada.name, tetoPorEntrada);
      if (soma > tetoTotal) throw new ExpansaoAcimaDoTeto('o arquivo', tetoTotal);
    };
    entrada.start();
  });
  return soma;
}

/** Concatena os pedaços de uma saída em fluxo (sem copiar quando há um só). */
export function juntarPedacos(pedacos: Uint8Array[]): Uint8Array {
  if (pedacos.length === 1) return pedacos[0];
  const total = pedacos.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of pedacos) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}
