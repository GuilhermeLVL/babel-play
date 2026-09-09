/**
 * SERVIDOR EM MEMÓRIA do modo anônimo.
 *
 * `apiFetch` chama isto em vez de `fetch` quando a identidade é `anonimo`. Cada rota devolve uma
 * `Response` com a MESMA forma que o servidor real devolve — então as ~40 funções de `data/api.ts`
 * e as telas que as consomem não sabem (nem precisam saber) que o banco é o navegador.
 *
 * Nada aqui toca a rede. Rota sem suporte responde 501 `EXIGE_CONTA` e dispara o evento
 * `babel_exige_conta`, que o App escuta para abrir o convite de conta — é o mesmo "mostra, explica,
 * não esconde" do gate de YouTube em `Library.tsx`.
 *
 * Regras do servidor que valem a pena imitar estão imitadas (contagem de palavras, dedup de cartão
 * por palavra+idioma, revisão FSRS-5 via `@core`, idempotência de `spendId`). As que dependem de
 * recursos do servidor (régua CEFR, wordlist, reconciliação) ficam para a migração — o servidor
 * reaplica tudo quando os dados sobem.
 *
 * ─── O QUE FICA AQUI, E POR QUÊ ───
 *
 * Os HANDLERS moram em `./rotas/<domínio>.ts`, com o MESMO recorte por domínio do cliente
 * (`src/data/rotas/`): este contrato tem dois lados, e enquanto cada lado era um arquivo de
 * ~1000 linhas não havia como comparar `sessoes` com `sessoes`. Agora há — arquivo a arquivo.
 *
 * Aqui fica só o ROTEADOR: a tabela `ROTAS` e o ponto de entrada. Os helpers compartilhados
 * (`json`, `uuid`, leitura de corpo, coerção, `naoDisponivelSemConta`) estão em `./nucleo.ts` —
 * uma FOLHA — porque este arquivo importa os `rotas/*` e eles importavam os helpers DE VOLTA
 * daqui: sete ciclos de importação, com `npm run morto:ciclos` (madge) como portão de CI. É o
 * mesmo desenho do cliente, onde o funil saiu de `src/data/api.ts` para `src/data/funil.ts`.
 *
 * Este arquivo REEXPORTA o núcleo: quem já importava `EVENTO_EXIGE_CONTA`, `json` ou `chaveDedup`
 * de `efemero/servidor` (telas e testes) continua valendo, sem nenhum símbolo mudando de nome.
 */
import { json, naoDisponivelSemConta, PASSAM_DIRETO } from './nucleo';
import * as conta from './rotas/conta';
import * as economia from './rotas/economia';
import * as exercicios from './rotas/exercicios';
import * as metricas from './rotas/metricas';
import * as sessoes from './rotas/sessoes';
import * as settings from './rotas/settings';
import * as vocabulario from './rotas/vocabulario';

/* O núcleo inteiro segue alcançável por `efemero/servidor`: a divisão em `nucleo.ts` é sobre o
   grafo de importação, não sobre a superfície pública deste módulo. */
export * from './nucleo';

/* A chave de dedup continua alcançável POR AQUI: `tests/paridade-anonima.test.ts` a importa deste
   módulo para provar que ela é a MESMA do servidor real. O corpo (e o porquê) está em
   `./rotas/vocabulario.ts`, junto do único código que a usa. */
export { chaveDedup } from './rotas/vocabulario';

type Handler = (m: RegExpMatchArray, url: URL, init: RequestInit) => Promise<Response>;

// ───────────────────────────── Tabela de rotas ─────────────────────────────

const ROTAS: Array<{ metodo: string; padrao: RegExp; handler: Handler }> = [
  { metodo: 'GET', padrao: /^\/api\/sessions$/, handler: sessoes.listarSessoes },
  { metodo: 'GET', padrao: /^\/api\/sessions\/utterances\/all$/, handler: sessoes.todasAsFalas },
  { metodo: 'POST', padrao: /^\/api\/sessions$/, handler: sessoes.criarSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/utterances\/([^/]+)$/, handler: sessoes.atualizarFala },
  { metodo: 'GET', padrao: /^\/api\/sessions\/([^/]+)$/, handler: sessoes.obterSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/([^/]+)$/, handler: sessoes.atualizarSessao },
  { metodo: 'DELETE', padrao: /^\/api\/sessions\/([^/]+)$/, handler: sessoes.apagarSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/([^/]+)\/meta$/, handler: sessoes.atualizarMeta },
  { metodo: 'PUT', padrao: /^\/api\/sessions\/([^/]+)\/utterances$/, handler: sessoes.substituirFalas },
  { metodo: 'POST', padrao: /^\/api\/sessions\/([^/]+)\/audio$/, handler: sessoes.guardarAudio },
  { metodo: 'GET', padrao: /^\/api\/sessions\/([^/]+)\/audio$/, handler: sessoes.lerAudio },
  { metodo: 'GET', padrao: /^\/api\/vocab$/, handler: vocabulario.listarCartoes },
  { metodo: 'GET', padrao: /^\/api\/vocab\/pagina$/, handler: vocabulario.paginaDeCartoes },
  { metodo: 'GET', padrao: /^\/api\/vocab\/inicio-da-contagem$/, handler: vocabulario.inicioDaContagemLocal },
  { metodo: 'POST', padrao: /^\/api\/vocab\/bulk-add$/, handler: vocabulario.adicionarCartoes },
  { metodo: 'PATCH', padrao: /^\/api\/vocab\/([^/]+)$/, handler: vocabulario.editarCartao },
  { metodo: 'DELETE', padrao: /^\/api\/vocab\/([^/]+)$/, handler: vocabulario.apagarCartao },
  { metodo: 'POST', padrao: /^\/api\/vocab\/([^/]+)\/review$/, handler: vocabulario.revisarCartao },
  { metodo: 'GET', padrao: /^\/api\/metrics\/profile$/, handler: metricas.metricas },
  { metodo: 'GET', padrao: /^\/api\/metrics\/xp$/, handler: metricas.historicoDeXpLocal },
  { metodo: 'POST', padrao: /^\/api\/metrics\/seeds\/gastar$/, handler: economia.gastarSeeds },
  { metodo: 'POST', padrao: /^\/api\/metrics\/seeds\/creditar$/, handler: economia.creditarSeeds },
  { metodo: 'POST', padrao: /^\/api\/metrics\/presenca$/, handler: economia.registrarPresenca },
  { metodo: 'POST', padrao: /^\/api\/exercises\/rodada$/, handler: exercicios.gravarRodada },
  { metodo: 'GET', padrao: /^\/api\/exercises\/results$/, handler: exercicios.listarResultados },
  { metodo: 'GET', padrao: /^\/api\/exercises\/historico$/, handler: exercicios.historicoPorItem },
  { metodo: 'GET', padrao: /^\/api\/exercises\/recordes$/, handler: exercicios.recordes },
  { metodo: 'GET', padrao: /^\/api\/settings$/, handler: settings.obterSettings },
  { metodo: 'PUT', padrao: /^\/api\/settings$/, handler: settings.gravarSettings },
  { metodo: 'GET', padrao: /^\/api\/me\/entitlements$/, handler: conta.entitlementsAnonimos },
];

/** Ponto de entrada: mesmo contrato de `fetch(input, init)`, nunca sai do navegador. */
export async function servidorEfemero(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, 'http://efemero.local');
  const metodo = (init.method ?? 'GET').toUpperCase();
  if (PASSAM_DIRETO.some((r) => r.test(url.pathname))) return fetch(input, init);
  for (const rota of ROTAS) {
    if (rota.metodo !== metodo) continue;
    const m = url.pathname.match(rota.padrao);
    if (!m) continue;
    try {
      return await rota.handler(m, url, init);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
  return naoDisponivelSemConta(`${metodo} ${url.pathname}`);
}
