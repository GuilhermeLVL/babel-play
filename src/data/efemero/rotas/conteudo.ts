/**
 * ESPELHO SEM CONTA — as contagens do seletor de conteúdo.
 *
 * Metade de `src/data/rotas/conteudo.ts`: a MESMA rota `GET /api/vocab/conteudo`, calculada no
 * aparelho sobre o IndexedDB com a MESMA função pura do servidor (`contarConteudo`). Sem conta não há
 * baralho do Anki nem Trilha ativada (o store local não guarda origens): o catálogo traz Tudo,
 * Difíceis e as sessões.
 *
 * Rota: GET `/api/vocab/conteudo`.
 */
import { contarConteudo } from '../../../core/learning/contagensDeConteudo';
import { json } from '../nucleo';
import { abrirStore } from '../store';

export async function contagensDeConteudoLocal(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const [cartoes, sessoes] = await Promise.all([db.getAll('cartoes'), db.getAll('sessoes')]);
  return json(
    contarConteudo({
      cartoes: cartoes.map((c) => ({
        id: c.id,
        inDeck: c.inDeck,
        dueAt: c.dueAt,
        lapses: c.lapses,
        idioma: c.srcLang,
        sessionId: c.sessionId,
        sentence: c.sentence,
      })),
      origens: [],
      sessoes: sessoes.map((s) => ({
        id: s.id,
        nome: s.title ?? '',
        tipo: s.kind,
        quando: s.createdAt,
        duracaoMs: s.durationMs,
      })),
      baralhos: [],
      idioma: url.searchParams.get('idioma') ?? '',
      /* O fim do minuto, como no servidor: a palavra guardada agora já conta em "para hoje". */
      agora: Math.ceil(Date.now() / 60_000) * 60_000,
    }),
  );
}
