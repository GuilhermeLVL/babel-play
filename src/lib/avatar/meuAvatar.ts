/**
 * O AVATAR DA PESSOA, guardado SÓ neste aparelho: a receita (e o modelo trazido, se houver) no IndexedDB
 * `frasy-avatar` (`armazem.ts`) e a MINIATURA estática de 192 px no `localStorage`, como `fotoDoPerfil.ts`.
 * Nada vai ao servidor. Sem login (self-host) a chave é a neutra `local`.
 *
 * O `<AvatarDoUsuario/>` das molduras lê só a miniatura (síncrono, sem `three` e sem WebGL); a tela de Ajustes é
 * a única que abre o motor ao vivo. Apagar volta à foto e às iniciais e limpa receita, modelo, crédito e miniatura.
 */
import { useEffect, useState } from 'react';

import { type CreditoDoModelo } from '../../core/avatar/importador/validar';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import { apagar, apagarModelo, lerReceita, lerReceitaLocal, salvarModeloImportado, salvarReceita } from './armazem';

/** A chave neutra: o mesmo avatar para quem usa sem conta. */
export const USUARIO_NEUTRO = 'local';

export function chaveDoUsuario(usuario: string | null | undefined): string {
  const limpo = (usuario ?? '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  return limpo || USUARIO_NEUTRO;
}

const chaveMiniatura = (chave: string) => `frasy.avatar.miniatura.${chave}`;
const chaveCredito = (chave: string) => `frasy.avatar.credito.${chave}`;
const MINIATURA_VALIDA = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
const MAX_MINIATURA = 120_000;

const inscritos = new Set<() => void>();
const avisar = () => inscritos.forEach((f) => f());

export function assinarMeuAvatar(cb: () => void): () => void {
  inscritos.add(cb);
  return () => {
    inscritos.delete(cb);
  };
}

export function lerMiniatura(usuario: string | null | undefined): string | null {
  try {
    const v = localStorage.getItem(chaveMiniatura(chaveDoUsuario(usuario)));
    return v && v.length <= MAX_MINIATURA && MINIATURA_VALIDA.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function lerCreditoGuardado(usuario: string | null | undefined): CreditoDoModelo | null {
  try {
    const bruto = localStorage.getItem(chaveCredito(chaveDoUsuario(usuario)));
    if (!bruto) return null;
    const c = JSON.parse(bruto) as Partial<CreditoDoModelo>;
    const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    return {
      titulo: txt(c.titulo, 80),
      autores: Array.isArray(c.autores) ? c.autores.slice(0, 5).map((a) => txt(a, 80)) : [],
      licenca: txt(c.licenca, 60),
      urlDaLicenca: /^https?:\/\//i.test(txt(c.urlDaLicenca, 500)) ? txt(c.urlDaLicenca, 500) : '',
    };
  } catch {
    return null;
  }
}

/** A receita guardada, de forma síncrona (o espelho do `localStorage`). */
export const lerMeuAvatarLocal = (usuario: string | null | undefined): ReceitaDeAvatar | null =>
  lerReceitaLocal(chaveDoUsuario(usuario));

/** A receita guardada, pelo IndexedDB (com o espelho como reserva). */
export const lerMeuAvatar = (usuario: string | null | undefined): Promise<ReceitaDeAvatar | null> =>
  lerReceita(chaveDoUsuario(usuario));

function gravarLocal(chave: string, valor: string | null): boolean {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda a escolha. `miniatura`: `undefined` mantém a atual, `null` apaga, texto grava (precisa ser data URL de
 * imagem). `credito`: igual (só o modelo trazido tem). Devolve `false` se nada conseguiu gravar a receita.
 */
export async function salvarMeuAvatar(
  usuario: string | null | undefined,
  receita: ReceitaDeAvatar,
  extras: {
    miniatura?: string | null;
    credito?: CreditoDoModelo | null;
    /** O arquivo trazido pela pessoa (só quando a base é `importado`): vai para o IndexedDB e nunca ao servidor. */
    modelo?: Blob;
  } = {},
): Promise<boolean> {
  const chave = chaveDoUsuario(usuario);
  const antes = await lerReceita(chave);
  if (extras.modelo && !(await salvarModeloImportado(receita.base.id, extras.modelo))) return false;
  const ok = await salvarReceita(chave, receita);
  if (!ok) return false;
  // Trocou o modelo trazido por outro (ou por um da coleção): o arquivo antigo não fica esquecido no aparelho.
  if (antes?.base.origem === 'importado' && antes.base.id !== receita.base.id) await apagarModelo(antes.base.id);
  if (extras.miniatura !== undefined) {
    const m = extras.miniatura;
    gravarLocal(chaveMiniatura(chave), m && m.length <= MAX_MINIATURA && MINIATURA_VALIDA.test(m) ? m : null);
  }
  if (extras.credito !== undefined) {
    gravarLocal(chaveCredito(chave), extras.credito ? JSON.stringify(extras.credito) : null);
  }
  avisar();
  return true;
}

/** "Apagar meu avatar": receita, modelo trazido, crédito e miniatura. Volta à foto e às iniciais. */
export async function apagarMeuAvatar(usuario: string | null | undefined): Promise<void> {
  const chave = chaveDoUsuario(usuario);
  await apagar(chave);
  gravarLocal(chaveMiniatura(chave), null);
  gravarLocal(chaveCredito(chave), null);
  avisar();
}

/** A miniatura do avatar, atualizada quando a pessoa salva ou apaga. `null` = sem avatar (foto ou iniciais). */
export function useMiniaturaDoAvatar(usuario: string | null | undefined): string | null {
  const [m, setM] = useState(() => lerMiniatura(usuario));
  useEffect(() => {
    const reler = () => setM(lerMiniatura(usuario));
    reler();
    return assinarMeuAvatar(reler);
  }, [usuario]);
  return m;
}
