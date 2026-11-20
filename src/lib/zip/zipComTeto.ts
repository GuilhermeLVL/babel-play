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
 *
 * ENTRADA NÃO PEDIDA NÃO FICA NA MEMÓRIA. O `Unzip` guarda os bytes comprimidos de toda entrada em que
 * ninguém chamou `start()`, à espera de alguém querer. Num `.apkg` com centenas de MB de mídia isso
 * seguraria a mídia inteira só para atravessá-la. Por isso TODA entrada recebe `start()`, e os
 * decodificadores registrados (`criarDecodificadores`) jogam fora os bytes das que não interessam, sem
 * inflar nada, e só avisam o fim.
 */
import { Unzip, type UnzipDecoder, type UnzipFile, UnzipInflate, UnzipPassThrough } from 'fflate';

/** Uma entrada (ou o zip inteiro) descompactou mais que o teto: o arquivo é recusado. */
export class ExpansaoAcimaDoTeto extends Error {
  constructor(nome: string, teto: number) {
    const tamanho = teto < 1048576 ? `${Math.round(teto / 1024)} KB` : `${Math.round(teto / 1048576)} MB`;
    super(`${nome} passou de ${tamanho} ao descompactar; arquivo recusado`);
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

const VAZIO = new Uint8Array(0);

/** O que fazer com uma entrada achada: inflar (o conteúdo chega em `ondata`) ou descartar sem inflar. */
type Destino = 'inflar' | 'descartar';

/**
 * Os decodificadores do `Unzip` para deflate (8) e para entrada guardada sem compressão (0). Cada um é
 * criado pelo `start()` da entrada e pergunta a `inflarAtual()` o destino dela: se for inflar, delega ao
 * decodificador do fflate; se não, descarta cada pedaço e só emite o `ondata` final, vazio. Exportado
 * para o teste conferir que o descarte não entrega byte nenhum.
 */
export function criarDecodificadores(inflarAtual: () => boolean) {
  const criar = (compressao: 0 | 8) =>
    class implements UnzipDecoder {
      static compression = compressao;
      ondata: UnzipDecoder['ondata'] = () => {};
      private real?: UnzipDecoder;
      constructor() {
        if (!inflarAtual()) return;
        this.real = compressao === 8 ? new UnzipInflate() : new UnzipPassThrough();
        this.real.ondata = (err, dados, final) => this.ondata(err, dados, final);
      }
      push(pedaco: Uint8Array, final: boolean) {
        if (this.real) this.real.push(pedaco, final);
        else if (final) this.ondata(null, VAZIO, true);
      }
    };
  return [criar(8), criar(0)];
}

/**
 * Percorre o zip chamando `aoAchar` para cada entrada (na ordem do arquivo); `aoAchar` decide o destino e,
 * se for inflar, já deixa `ondata` pronto. Erro lançado no `ondata` (o teto) interrompe a leitura e é
 * relançado daqui.
 */
async function percorrerZip(
  arquivo: Blob,
  aoAchar: (entrada: UnzipFile, registrarErro: (e: unknown) => void) => Destino,
) {
  let erro: unknown;
  const registrarErro = (e: unknown) => {
    erro ??= e;
  };
  // Lido pelo construtor do decodificador, que roda DENTRO do `start()` logo abaixo (síncrono).
  let inflar = false;
  const unzip = new Unzip((entrada) => {
    try {
      const destino = aoAchar(entrada, registrarErro);
      if (destino === 'descartar') {
        // Compressão que não temos como atravessar (nem o Anki usa) fica retida pelo `Unzip`, como antes.
        if (entrada.compression !== 0 && entrada.compression !== 8) return;
        entrada.ondata = () => {};
      }
      inflar = destino === 'inflar';
      entrada.start();
    } catch (e) {
      registrarErro(e);
    }
  });
  for (const decodificador of criarDecodificadores(() => inflar)) unzip.register(decodificador);

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
 * Extrai SÓ as entradas pedidas em `nomes`. O teto vale para cada uma E para a SOMA delas (três coleções
 * de 300 MB no mesmo arquivo não podem ocupar 900 MB). As outras são atravessadas sem inflar nem guardar. Devolve também todos os nomes vistos no zip (quem lê um `.apkg` precisa
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
  let soma = 0;

  await percorrerZip(arquivo, (entrada, registrarErro) => {
    vistos.push(entrada.name);
    if (!pedidos.has(entrada.name) || pedacosPorNome.has(entrada.name)) return 'descartar';
    const pedacos: Uint8Array[] = [];
    pedacosPorNome.set(entrada.name, pedacos);
    let total = 0;
    entrada.ondata = (err, dados) => {
      if (err) return registrarErro(err);
      total += dados.length;
      soma += dados.length;
      if (total > teto || soma > teto) {
        // Solta o que já foi acumulado: sem isto o pico de memória que o teto evita aconteceria na hora do erro.
        for (const acumulado of pedacosPorNome.values()) acumulado.length = 0;
        throw new ExpansaoAcimaDoTeto(total > teto ? entrada.name : 'o conteúdo extraído', teto);
      }
      if (dados.length) pedacos.push(dados);
    };
    return 'inflar';
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
    return 'inflar';
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
