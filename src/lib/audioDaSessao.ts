import { useEffect, useState } from 'react';
import { apiFetch } from '../data/api';

/**
 * O ÁUDIO DA SESSÃO, BUSCADO COM AUTENTICAÇÃO.
 *
 * O DEFEITO QUE ISTO CONSERTA — e ele impedia a aplicação de funcionar em modo público.
 *
 * `audioUrl` é `/api/sessions/:id/audio`, e essa rota está atrás do `authMiddleware`. Mas ela era
 * consumida por `<audio src>` e `fetch()` CRUS, que não mandam o cabeçalho `Authorization`. Com
 * `AUTH_REQUIRED=1`, o player da sessão, a forma de onda, o download e os minijogos de áudio
 * (Karaokê e Qual foi?) recebiam 401 — quatro superfícies mortas de uma vez. No self-host nada
 * disso aparecia, porque sem login a rota é aberta: o defeito só existia exatamente no cenário
 * para o qual o app está sendo preparado.
 *
 * POR QUE BLOB, E NÃO COOKIE NEM URL ASSINADA:
 *  - Cookie `httpOnly` tornaria todo `/api/*` autoridade ambiente e ABRIRIA CSRF, que hoje não
 *    existe porque a sessão é Bearer. Caro demais para consertar uma rota de arquivo.
 *  - URL assinada exigiria segredo novo, política de expiração e recodificar o TENANT na
 *    assinatura — a rota resolve dono por `sessionsRepo.get(req.userId, id)`, e errar isso é
 *    leitura entre contas.
 *  - Blob mantém UM caminho de autenticação (`apiFetch` já injeta o Bearer e já trata 401 com
 *    refresh e repetição) e conserta os quatro consumidores de uma vez, porque todos recebem uma
 *    string de URL. `blob:` é navegável e permite busca por tempo — para o Karaokê e o Qual foi?,
 *    que recortam trechos, o salto passa a ser local em vez de um 206 por vez: melhor que antes.
 *
 * O CUSTO, dito na cara: o arquivo inteiro vai para a memória antes de tocar (o teto de upload de
 * áudio é 120 MB). Se isso incomodar, a saída é a URL assinada — mas depois de o app estar no ar,
 * não antes.
 *
 * O FETCH É A PARTE FÁCIL. A entrega deste módulo é a CONTABILIDADE DE REFERÊNCIAS: sem o cache,
 * a aba de análise, o Karaokê e o Qual foi? baixariam o mesmo arquivo três vezes; sem o `revoke`,
 * cada sessão aberta vazaria o áudio pelo resto da vida da aba.
 */

interface Entrada {
  /** A promessa é guardada, não o resultado: dois pedidos simultâneos compartilham um fetch só. */
  url: Promise<string>;
  /** Quantos componentes vivos dependem desta URL. Zerou, revoga. */
  refs: number;
}

const cache = new Map<string, Entrada>();

/** O caminho da API para o áudio de uma sessão. Uma definição só, para o cache não errar a chave. */
export function caminhoDoAudio(sessionId: string): string {
  return `/api/sessions/${sessionId}/audio`;
}

/**
 * Pede o áudio e devolve uma URL de blob utilizável em `<audio src>`.
 *
 * Incrementa a contagem de referências: quem chama é responsável por `liberar` depois.
 */
export function urlDeAudio(sessionId: string): Promise<string> {
  const existente = cache.get(sessionId);
  if (existente) {
    existente.refs += 1;
    return existente.url;
  }

  const url = (async () => {
    /* O teto padrão do `apiFetch` é 30 s, dimensionado para JSON. Um áudio de sessão pode ter até
       120 MB (o limite de upload da rota), e cortar o download no meio devolveria "áudio
       indisponível" para uma gravação que existe. Cinco minutos cobre a conexão ruim sem virar
       espera infinita. */
    const res = await apiFetch(caminhoDoAudio(sessionId), { timeoutMs: 300_000 });
    if (!res.ok) throw new Error(`áudio indisponível (${res.status})`);
    return URL.createObjectURL(await res.blob());
  })();

  /* A entrada entra no cache ANTES de a promessa resolver. É isso que faz dois componentes montados
     no mesmo instante compartilharem um download em vez de disparar dois. */
  cache.set(sessionId, { url, refs: 1 });

  // Falhou: sai do cache, senão o erro fica grudado e a próxima tentativa nunca acontece.
  url.catch(() => { cache.delete(sessionId); });

  return url;
}

/** Devolve uma referência. Na última, revoga a URL e esquece a sessão. */
export function liberar(sessionId: string): void {
  const entrada = cache.get(sessionId);
  if (!entrada) return;

  entrada.refs -= 1;
  if (entrada.refs > 0) return;

  cache.delete(sessionId);
  // A revogação espera a promessa: revogar uma URL que ainda não existe não faria nada.
  entrada.url.then(URL.revokeObjectURL).catch(() => { /* nunca chegou a existir */ });
}

export interface AudioDaSessao {
  /** `null` enquanto carrega, ou quando a sessão não tem áudio. Vai direto no `<audio src>`. */
  url: string | null;
  carregando: boolean;
  /** Mensagem legível, quando falhou. A tela decide se mostra. */
  erro: string | null;
}

/**
 * O hook que as telas consomem.
 *
 * Recebe o `sessionId`, e não a `audioUrl`: a URL da API é derivável do id, e amarrar o cache a
 * uma string que vem de fora convidaria duas telas a usarem chaves diferentes para o mesmo áudio.
 *
 * `temAudio` existe para a chamada não precisar ser condicional — hooks não podem sê-lo. Sessões
 * de documento e gravações sem áudio passam `false` e o hook não busca nada.
 */
export function useAudioDaSessao(sessionId: string | null | undefined, temAudio: boolean): AudioDaSessao {
  const [url, setUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !temAudio) { setUrl(null); setCarregando(false); setErro(null); return; }

    let vivo = true;
    setCarregando(true);
    setErro(null);

    urlDeAudio(sessionId)
      .then(u => { if (vivo) { setUrl(u); setCarregando(false); } })
      .catch(e => { if (vivo) { setErro(String(e?.message ?? e)); setCarregando(false); } });

    /* A limpeza devolve a referência SEMPRE, inclusive quando o efeito foi cancelado antes de
       resolver — a referência foi tomada em `urlDeAudio`, não em `then`. */
    return () => { vivo = false; liberar(sessionId); };
  }, [sessionId, temAudio]);

  return { url, carregando, erro };
}
