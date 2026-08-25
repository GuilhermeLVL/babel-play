import { useEffect, useState } from 'react';
import { fetchPerfil, patchPerfil, type Perfil, type PatchDePerfil } from '../data/me';

/**
 * O PERFIL, COMPARTILHADO ENTRE AS TELAS — com store de módulo, não Context.
 *
 * Dois lugares precisam do mesmo perfil ao mesmo tempo: o botão de avatar no shell (que aparece em
 * TODA tela) e a tela de perfil. Sem estado compartilhado, cada montagem faria a sua requisição, e
 * salvar o nome numa tela deixaria o avatar da outra desatualizado até um recarregamento.
 *
 * POR QUE NÃO CONTEXT: um provider no `App` obrigaria a árvore inteira a re-renderizar a cada
 * mudança de perfil, e o `App` já é o componente mais caro do app. O precedente é `Toast.tsx`, que
 * escolheu store de módulo pela mesma razão. E é o oposto do que aconteceu com `session`: um estado
 * que mora no `App`, que ninguém consome, e que por isso nunca chegou a lugar nenhum.
 *
 * O CARREGAMENTO É ÚNICO. A primeira montagem busca; as seguintes leem o cache e se inscrevem.
 */

let cache: Perfil | null = null;
let carregando: Promise<Perfil | null> | null = null;
const inscritos = new Set<(p: Perfil | null) => void>();

function publicar(p: Perfil | null): void {
  cache = p;
  for (const avisar of inscritos) avisar(p);
}

/** Força uma releitura do servidor. Usado depois de trocar de conta. */
export function invalidarPerfil(): void {
  cache = null;
  carregando = null;
  publicar(null);
}

/** Grava e propaga para todos os inscritos. Devolve `false` quando o servidor recusou. */
export async function salvarPerfil(patch: PatchDePerfil): Promise<boolean> {
  const salvo = await patchPerfil(patch);
  if (!salvo) return false;
  publicar(salvo);
  return true;
}

export interface EstadoDoPerfil {
  perfil: Perfil | null;
  carregando: boolean;
  /** As iniciais para o avatar. `''` quando não há nome nem e-mail conhecidos. */
  iniciais: string;
}

/**
 * As INICIAIS que substituem a foto.
 *
 * "Guilherme Cruz" → GC · "guilherme" → G · "guigui@exemplo.com" → G.
 *
 * Duas letras no máximo: três já não cabem legíveis num círculo de 32px, que é o tamanho do avatar
 * no shell. Pega a primeira e a ÚLTIMA palavra, não as duas primeiras — em "Ana Maria Cruz" o que
 * identifica é AC, não AM.
 */
export function iniciaisDe(nome: string | null | undefined, email?: string | null): string {
  const limpo = (nome ?? '').trim();
  if (limpo) {
    const partes = limpo.split(/\s+/).filter(Boolean);
    const primeira = partes[0]?.[0] ?? '';
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeira + ultima).toUpperCase();
  }
  // Sem nome, a inicial do e-mail é melhor que um boneco genérico — e some se nem isso existir.
  const doEmail = (email ?? '').trim();
  return doEmail ? doEmail[0].toUpperCase() : '';
}

export function usePerfil(): EstadoDoPerfil {
  const [perfil, setPerfil] = useState<Perfil | null>(cache);
  const [buscando, setBuscando] = useState(!cache);

  useEffect(() => {
    inscritos.add(setPerfil);

    if (!cache) {
      // `carregando` guarda a PROMESSA: duas montagens simultâneas compartilham uma requisição.
      carregando ??= fetchPerfil();
      let vivo = true;
      void carregando.then(p => {
        carregando = null;
        if (p) publicar(p);
        if (vivo) setBuscando(false);
      });
      return () => { vivo = false; inscritos.delete(setPerfil); };
    }

    setBuscando(false);
    return () => { inscritos.delete(setPerfil); };
  }, []);

  return { perfil, carregando: buscando, iniciais: iniciaisDe(perfil?.displayName, perfil?.email) };
}
