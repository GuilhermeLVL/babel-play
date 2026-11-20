/**
 * Carrega o alfabeto manual e os limites articulares. Cada JSON é um CHUNK DINÂMICO (nada de fetch e nada no
 * arranque do app): só quem monta o avatar que soletra paga. O dado é validado ao carregar; inválido = erro.
 */
import type { Alfabeto, Limites, Lingua } from '../../../core/avatar/sinais/tipos';
import { validarAlfabeto } from '../../../core/avatar/sinais/validar';

export interface DadosDeSinais {
  alfabeto: Alfabeto;
  limites: Limites;
}

const cache = new Map<Lingua, Promise<DadosDeSinais>>();

async function ler(lingua: Lingua): Promise<DadosDeSinais> {
  const [alfabeto, limites] = await Promise.all([
    lingua === 'libras' ? import('./alfabeto-libras.json') : import('./alfabeto-asl.json'),
    import('./limites.json'),
  ]);
  const lim = limites.default as unknown as Limites;
  const bruto: unknown = alfabeto.default;
  const v = validarAlfabeto(bruto, lingua, lim);
  if (!v.ok) throw new Error(`alfabeto ${lingua} inválido: ${v.erros.slice(0, 3).join('; ')}`);
  return { alfabeto: bruto as Alfabeto, limites: lim };
}

export function carregarSinais(lingua: Lingua): Promise<DadosDeSinais> {
  let p = cache.get(lingua);
  if (!p) {
    p = ler(lingua);
    p.catch(() => cache.delete(lingua));
    cache.set(lingua, p);
  }
  return p;
}
