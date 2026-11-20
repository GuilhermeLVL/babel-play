/**
 * BACKUP E RESTAURAÇÃO DA ESTANTE, no navegador (nada vai ao servidor): um `.zip` (fflate) com `estante.json`
 * (versão, livros, posições, status, anotações) e os arquivos dos livros trazidos. Os livros do catálogo não
 * entram: voltam do catálogo. Livros de artigo por link (sem arquivo) também não.
 *
 * A restauração trata o zip como conteúdo NÃO confiável: tetos de tamanho, de entradas e de razão de compressão
 * e caminhos seguros ANTES de descompactar; só o `estante.json` e os arquivos pedidos são descompactados, um de
 * cada vez; cada livro passa de novo por `lerArquivoTrazido` (formato pelo conteúdo, DRM, limites). Nada é
 * executado.
 */
import {
  conflitosDoBackup,
  type EstanteNoBackup,
  FORMATO_DO_BACKUP,
  type LivroNoBackup,
  NOME_DO_JSON,
  TETO_DO_BACKUP,
  validarEstante,
  VERSAO_DO_BACKUP,
} from '../../core/livros/backup';
import { problemaDoZip, TETOS_DO_ZIP } from '../../core/livros/zipSeguro';
import { type AnotacaoLocal, estante } from './armazem';
import { copiaFielDoLivro } from './copiaDoArquivo';
import { guardarConteudo, guardarMeuLivro, lerMeusLivros, type MeuLivro, removerMeuLivro } from './meusLivros';
import { posicoes } from './posicoesDoAparelho';
import { lerArquivoTrazido } from './trazer';

export interface ResultadoDoBackup {
  blob: Blob;
  livros: number;
  /** Livros trazidos cujo arquivo não está mais neste aparelho (ficam de fora). */
  semArquivo: number;
}

const extensaoDe = (l: MeuLivro) => (l.formato && l.formato !== 'web' ? l.formato : 'bin');

/** Monta o backup de tudo o que a pessoa trouxe. `null` se não há nada a salvar. */
export async function criarBackup(agora = Date.now()): Promise<ResultadoDoBackup | null> {
  const { zipSync, strToU8 } = await import('fflate');
  const trazidos = lerMeusLivros().filter((l) => l.origem !== 'catalogo' && l.formato && l.formato !== 'web');
  const arquivos: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const livros: LivroNoBackup[] = [];
  const anotacoes: AnotacaoLocal[] = [];
  let semArquivo = 0;
  let n = 0;
  for (const l of trazidos.slice(0, TETO_DO_BACKUP.livros)) {
    const copia = await copiaFielDoLivro(l);
    if (!copia) {
      semArquivo++;
      continue;
    }
    const caminho = `livros/${n++}.${extensaoDe(l)}`;
    arquivos[caminho] = [new Uint8Array(await copia.blob.arrayBuffer()), { level: 0 }];
    const posicao = posicoes.ler(l.id) ?? undefined;
    livros.push({
      id: l.id,
      titulo: l.titulo,
      ...(l.autor ? { autor: l.autor } : {}),
      ...(l.idioma ? { idioma: l.idioma } : {}),
      formato: l.formato as LivroNoBackup['formato'],
      status: l.status,
      etiquetas: l.etiquetas,
      adicionadoEm: l.adicionadoEm,
      ...(l.abertoEm ? { abertoEm: l.abertoEm } : {}),
      nomeDoArquivo: copia.nome,
      arquivo: caminho,
      ...(posicao ? { posicao } : {}),
    });
    anotacoes.push(...(await estante.anotacoes(l.id)));
  }
  if (!livros.length) return null;
  const json: EstanteNoBackup = {
    formato: FORMATO_DO_BACKUP,
    versao: VERSAO_DO_BACKUP,
    criadoEm: agora,
    livros,
    anotacoes: anotacoes.map(({ pendente: _p, ...a }) => {
      void _p;
      return a;
    }),
  };
  arquivos[NOME_DO_JSON] = strToU8(JSON.stringify(json));
  const zip = zipSync(arquivos as never);
  return { blob: new Blob([zip as BlobPart], { type: 'application/zip' }), livros: livros.length, semArquivo };
}

export interface PlanoDeRestauracao {
  estante: EstanteNoBackup;
  /** Os livros do backup que já estão na estante (mesmo id). */
  conflitos: LivroNoBackup[];
  /** Guarda o zip para ler os arquivos um a um na hora de restaurar. */
  zip: Uint8Array;
}

export type ErroDaRestauracao = 'invalido' | 'versao-desconhecida' | 'grande' | 'corrompido';

export class ErroDeRestauracao extends Error {
  constructor(readonly motivo: ErroDaRestauracao) {
    super(motivo);
    this.name = 'ErroDeRestauracao';
  }
}

async function descompactar(zip: Uint8Array, nome: string): Promise<Uint8Array | null> {
  const { unzip } = await import('fflate');
  return new Promise((resolve, reject) =>
    unzip(zip, { filter: (f) => f.name === nome }, (err, arquivos) =>
      err ? reject(err) : resolve(arquivos[nome] ?? null),
    ),
  );
}

/** Lê e valida o backup SEM gravar nada. Falha fechada com `ErroDeRestauracao`. */
export async function lerBackup(arquivo: Blob): Promise<PlanoDeRestauracao> {
  if (arquivo.size > TETO_DO_BACKUP.bytesDoZip) throw new ErroDeRestauracao('grande');
  const zip = new Uint8Array(await arquivo.arrayBuffer());
  const { unzip } = await import('fflate');
  const entradas: Array<{ nome: string; tamanho: number }> = [];
  try {
    await new Promise<void>((resolve, reject) =>
      unzip(
        zip,
        {
          filter: (f) => {
            entradas.push({ nome: f.name, tamanho: f.originalSize });
            return false;
          },
        },
        (err) => (err ? reject(err) : resolve()),
      ),
    );
  } catch {
    throw new ErroDeRestauracao('corrompido');
  }
  const problema = problemaDoZip(entradas, zip.length);
  if (problema) throw new ErroDeRestauracao(problema);
  const json = entradas.find((e) => e.nome === NOME_DO_JSON);
  if (!json) throw new ErroDeRestauracao('invalido');
  if (json.tamanho > TETO_DO_BACKUP.bytesDoJson || json.tamanho > TETOS_DO_ZIP.porEntrada) {
    throw new ErroDeRestauracao('grande');
  }
  let bruto: unknown;
  try {
    const bytes = await descompactar(zip, NOME_DO_JSON);
    bruto = JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array()));
  } catch {
    throw new ErroDeRestauracao('invalido');
  }
  const r = validarEstante(bruto);
  if (!r.ok || !r.estante) throw new ErroDeRestauracao(r.erro ?? 'invalido');
  const nomes = new Set(entradas.map((e) => e.nome));
  if (r.estante.livros.some((l) => !nomes.has(l.arquivo))) throw new ErroDeRestauracao('invalido');
  return {
    estante: r.estante,
    conflitos: conflitosDoBackup(
      r.estante,
      lerMeusLivros().map((l) => l.id),
    ),
    zip,
  };
}

export interface ResultadoDaRestauracao {
  restaurados: number;
  mantidos: number;
  falhas: Array<{ titulo: string; motivo: string }>;
}

/**
 * Restaura. `conflito`: o que fazer com o livro que já existe: `manter` (fica o que está) ou `substituir`.
 * Cada livro é um passo independente: o que falha entra em `falhas` e os outros seguem.
 */
export async function restaurarBackup(
  plano: PlanoDeRestauracao,
  conflito: 'manter' | 'substituir',
  rotulo: (i: number) => string = (i) => `Parte ${i + 1}`,
): Promise<ResultadoDaRestauracao> {
  const res: ResultadoDaRestauracao = { restaurados: 0, mantidos: 0, falhas: [] };
  const existentes = new Set(plano.conflitos.map((c) => c.id));
  for (const l of plano.estante.livros) {
    if (existentes.has(l.id) && conflito === 'manter') {
      res.mantidos++;
      continue;
    }
    try {
      const bytes = await descompactar(plano.zip, l.arquivo);
      if (!bytes) throw new Error('arquivo ausente no backup');
      const lido = await lerArquivoTrazido(new File([bytes as BlobPart], l.nomeDoArquivo), rotulo);
      if (existentes.has(l.id)) await removerMeuLivro(l.id);
      const guarda = await guardarConteudo({
        id: l.id,
        capitulos: lido.capitulos,
        ...(lido.arquivo ? { arquivo: lido.arquivo } : {}),
        ...(lido.copia ? { copia: lido.copia } : {}),
        nomeDoArquivo: l.nomeDoArquivo,
      });
      if (!guarda.guardado) throw new Error('não coube neste aparelho');
      guardarMeuLivro({
        id: l.id,
        titulo: l.titulo,
        autor: l.autor ?? lido.autor,
        idioma: l.idioma ?? lido.idioma,
        origem: 'arquivo',
        formato: lido.formato,
        status: l.status,
        etiquetas: l.etiquetas,
        adicionadoEm: l.adicionadoEm,
        ...(l.abertoEm ? { abertoEm: l.abertoEm } : {}),
      });
      if (l.posicao) posicoes.gravar(l.posicao);
      await estante.gravarAnotacoes(
        plano.estante.anotacoes.filter((a) => a.livroId === l.id).map((a) => ({ ...a, pendente: 1 as const })),
      );
      res.restaurados++;
    } catch (e) {
      res.falhas.push({ titulo: l.titulo, motivo: e instanceof Error ? e.message : String(e) });
    }
  }
  return res;
}
