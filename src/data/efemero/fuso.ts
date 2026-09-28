/**
 * ESPELHO SEM CONTA — o fuso do usuário, gravado (metade de `server/lib/fusoDoUsuario.ts`).
 *
 * A régua é a do core (`decidirFuso`): o fuso pedido vale no primeiro uso e, depois, só troca uma
 * vez a cada 24 h. Mora no `localStorage`, como as configurações deste modo (`rotas/settings.ts`):
 * é um registro só, lido a cada pedido.
 */
import { decidirFuso, FUSO_PADRAO, type FusoGravado, fusoOuPadrao } from '../../core/learning/economia';

const CHAVE_DO_FUSO = 'babel.efemero.fuso';

function lerGravado(): FusoGravado {
  try {
    const bruto = localStorage.getItem(CHAVE_DO_FUSO);
    if (bruto) {
      const g = JSON.parse(bruto) as Partial<FusoGravado>;
      return { fuso: typeof g.fuso === 'string' ? g.fuso : null, desde: typeof g.desde === 'number' ? g.desde : null };
    }
  } catch { /* sem localStorage → nada gravado */ }
  return { fuso: null, desde: null };
}

/** O fuso que vale; grava o pedido quando `decidirFuso` manda. */
export function fusoDoUsuarioLocal(pedido: string | null | undefined): string {
  const { fuso, gravar } = decidirFuso(lerGravado(), pedido, Date.now());
  if (gravar) {
    try { localStorage.setItem(CHAVE_DO_FUSO, JSON.stringify(gravar)); } catch { /* best-effort */ }
  }
  return fuso;
}

/** Só leitura: o fuso gravado, ou o padrão — o que o perfil (ofensiva, marcos) usa. */
export function fusoGravadoLocal(): string {
  const { fuso } = lerGravado();
  return fuso ? fusoOuPadrao(fuso) : FUSO_PADRAO;
}
