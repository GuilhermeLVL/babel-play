/**
 * O ARMAZÉM DO AVATAR (IndexedDB `frasy-avatar`): a receita e o modelo que a pessoa trouxe.
 *
 * NADA daqui vai ao servidor. Banco PRÓPRIO (não divide nome com `frasy-leitor` nem `frasy-livros`, para
 * nenhum dos dois falhar com `VersionError`). O modelo vai como `ArrayBuffer` + tipo, e não como `Blob`: o
 * WebKit recusa `Blob` no IndexedDB em vários cenários (mesma razão da estante do leitor).
 *
 * A receita também é espelhada no `localStorage` (`frasy.avatar.receita.<id>`, o padrão de
 * `babel.fotoDoPerfil.<id>`): é pequena, e o avatar aparece de primeira mesmo se o IndexedDB não abrir (modo
 * privado, cota). Todo acesso é em `try/catch`; falha vira `false`/`null`, nunca exceção. O que se lê passa de
 * novo por `validarReceita`: o disco não é confiável.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import { type ReceitaDeAvatar, validarReceita } from '../../core/avatar/receita';
import { TETO_DO_MODELO_BYTES } from '../../core/avatar/tiers';

interface ModeloNoDisco {
  id: string;
  bytes: ArrayBuffer;
  tipo: string;
  criadoEm: number;
}

interface EsquemaDoAvatar extends DBSchema {
  receitas: { key: string; value: { id: string; receita: unknown } };
  modelos: { key: string; value: ModeloNoDisco };
}

const NOME = 'frasy-avatar';
let conexao: Promise<IDBPDatabase<EsquemaDoAvatar>> | null = null;

function abrir() {
  conexao ??= openDB<EsquemaDoAvatar>(NOME, 1, {
    upgrade(db) {
      db.createObjectStore('receitas', { keyPath: 'id' });
      db.createObjectStore('modelos', { keyPath: 'id' });
    },
  });
  // Uma abertura que falha não pode ficar presa: a próxima chamada tenta de novo.
  conexao.catch(() => {
    conexao = null;
  });
  return conexao;
}

/** Para os testes: fecha e esquece a conexão (para o banco poder ser apagado entre casos). */
export async function esquecerConexaoDoAvatar(): Promise<void> {
  const c = conexao;
  conexao = null;
  if (c) (await c.catch(() => null))?.close();
}

const chaveLocal = (id: string) => `frasy.avatar.receita.${id}`;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const idDoArmazemValido = (id: unknown): id is string => typeof id === 'string' && ID.test(id);

function espelhar(id: string, receita: ReceitaDeAvatar | null): void {
  try {
    if (receita) localStorage.setItem(chaveLocal(id), JSON.stringify(receita));
    else localStorage.removeItem(chaveLocal(id));
  } catch {
    /* cota cheia, modo privado ou armazenamento bloqueado: o IndexedDB segue valendo */
  }
}

/** Lê a receita do espelho do `localStorage`, de forma SÍNCRONA (o que aparece de primeira, sem esperar o IndexedDB). */
export function lerReceitaLocal(id: string): ReceitaDeAvatar | null {
  return idDoArmazemValido(id) ? lerEspelho(id) : null;
}

function lerEspelho(id: string): ReceitaDeAvatar | null {
  try {
    const bruto = localStorage.getItem(chaveLocal(id));
    if (!bruto) return null;
    const r = validarReceita(JSON.parse(bruto));
    return r.ok ? r.receita : null;
  } catch {
    return null;
  }
}

/** Valida e grava a receita (IndexedDB + espelho). `false` se for inválida ou se nada conseguiu gravar. */
export async function salvarReceita(id: string, receita: unknown): Promise<boolean> {
  if (!idDoArmazemValido(id)) return false;
  const r = validarReceita(receita);
  if (!r.ok) return false;
  let noDisco = false;
  try {
    const db = await abrir();
    await db.put('receitas', { id, receita: r.receita });
    noDisco = true;
  } catch {
    /* segue para o espelho */
  }
  espelhar(id, r.receita);
  return noDisco || lerEspelho(id) !== null;
}

export async function lerReceita(id: string): Promise<ReceitaDeAvatar | null> {
  if (!idDoArmazemValido(id)) return null;
  try {
    const db = await abrir();
    const reg = await db.get('receitas', id);
    if (reg) {
      const r = validarReceita(reg.receita);
      if (r.ok) return r.receita;
    }
  } catch {
    /* cai no espelho */
  }
  return lerEspelho(id);
}

/** Apaga a receita e, se ela usava um modelo trazido pela pessoa, o modelo também. */
export async function apagar(id: string): Promise<void> {
  if (!idDoArmazemValido(id)) return;
  const receita = await lerReceita(id);
  espelhar(id, null);
  try {
    const db = await abrir();
    await db.delete('receitas', id);
  } catch {
    /* nada a apagar ou banco indisponível */
  }
  if (receita?.base.origem === 'importado') await apagarModelo(receita.base.id);
}

/** Guarda o arquivo VRM/GLB da pessoa. Recusa o que passa do teto SEM ler o conteúdo. */
export async function salvarModeloImportado(id: string, arquivo: Blob): Promise<boolean> {
  if (!idDoArmazemValido(id) || arquivo.size <= 0 || arquivo.size > TETO_DO_MODELO_BYTES) return false;
  try {
    const bytes = await arquivo.arrayBuffer();
    const db = await abrir();
    await db.put('modelos', { id, bytes, tipo: arquivo.type, criadoEm: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export async function lerModeloImportado(id: string): Promise<Blob | null> {
  if (!idDoArmazemValido(id)) return null;
  try {
    const db = await abrir();
    const m = await db.get('modelos', id);
    return m ? new Blob([m.bytes], m.tipo ? { type: m.tipo } : undefined) : null;
  } catch {
    return null;
  }
}

export async function apagarModelo(id: string): Promise<void> {
  if (!idDoArmazemValido(id)) return;
  try {
    const db = await abrir();
    await db.delete('modelos', id);
  } catch {
    /* indisponível */
  }
}
