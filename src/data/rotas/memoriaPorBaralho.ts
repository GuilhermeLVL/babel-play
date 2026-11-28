/**
 * O cliente de `GET /api/vocab/memoria-por-baralho` (openspec `cartoes` 4.2; flag `estudo_palavras_v2`). Servidor sem a rota
 * ou com a flag desligada responde 404: aqui vira `null`, e a tela simplesmente não mostra a linha.
 */
import type { MemoriaPorBaralho } from '../../core/palavras/memoriaDoBaralho';
import { apiFetch } from '../funil';

export async function lerMemoriaPorBaralho(): Promise<MemoriaPorBaralho | null> {
  const res = await apiFetch('/api/vocab/memoria-por-baralho');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('não consegui ler a memória por baralho');
  return (await res.json()) as MemoriaPorBaralho;
}
