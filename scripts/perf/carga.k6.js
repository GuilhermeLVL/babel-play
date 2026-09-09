/**
 * CARGA COM PERFIL DE USUÁRIO DE VERDADE — a pergunta que `latencia.mjs` não responde.
 *
 * `scripts/perf/latencia.mjs` mede UMA rota por vez com 10 conexões: é o número de partida da
 * rodada de saneamento e serve para comparar antes e depois. Ele não diz o que acontece quando
 * cinquenta pessoas fazem a JORNADA inteira ao mesmo tempo — abrir o lobby, montar rodada, revisar
 * cartão, ver estatísticas —, que é onde uma consulta cara de uma tela come o orçamento das outras.
 *
 * Este arquivo mede isso. Não substitui `latencia.mjs`; a comparação linha a linha da fase continua
 * sendo com ele, mesmo comando, mesmo banco.
 *
 * COMO RODAR (o k6 não é instalado no host — vem em container):
 *
 *   docker run --rm -i --network host \
 *     -e BASE=http://127.0.0.1:3101 -e CARTAO=<id de vocab_cards> \
 *     grafana/k6 run - < scripts/perf/carga.k6.js
 *
 * No Windows, onde `--network host` não vale, use `-e BASE=http://host.docker.internal:3101` e
 * publique a porta. O servidor precisa estar de pé em modo self-host (`AUTH_REQUIRED=0`) e
 * apontando para uma CÓPIA do banco — as rotas de escrita gravam de verdade em `review_logs`,
 * `exercise_results` e `seed_credits`. Nunca contra `data/babel.db`.
 *
 * `127.0.0.1` e nunca `localhost`: no Windows a resolução tenta IPv6 primeiro e some ~200 ms
 * fantasma em cada requisição (medido, e documentado em `scripts/perf/medir-rotas.mjs`).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://127.0.0.1:3101';
const CARTAO = __ENV.CARTAO || '';
/** Quantas rodadas cada usuário virtual joga por iteração — o comprimento da sessão típica. */
const RODADAS = Number(__ENV.RODADAS || 10);

/**
 * OS LIMIARES SÃO O TESTE. Sem eles isto é um gerador de tráfego que sempre "passa"; com eles o
 * comando falha (exit != 0) e serve de portão.
 *
 * `p(95)<300` sai da medição de 2026-09-08 (`openspec/audits/2026-09-08-baseline/latencia.md`):
 * das doze rotas medidas, dez ficaram abaixo de 45 ms de p95, e as duas que não ficaram são
 * conhecidas e nomeadas — `GET /api/metrics/profile` (p95 372 ms) e `GET /api/vocab` do deck
 * inteiro (p95 1.576 ms). O limiar global vale para a JORNADA, que não inclui o deck inteiro; as
 * duas rotas caras têm limiar próprio, no valor que hoje elas entregam, para que uma piora apareça
 * mesmo que o número absoluto já seja ruim.
 */
export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
    'http_req_duration{rota:perfil}': ['p(95)<600'],
    'http_req_duration{rota:rodada}': ['p(95)<300'],
    'http_req_duration{rota:review}': ['p(95)<200'],
    // Erro de servidor não tem orçamento: um único 5xx reprova a corrida.
    erros_5xx: ['count==0'],
  },
};

const erros5xx = new Counter('erros_5xx');
const jornada = new Trend('jornada_completa_ms', true);

/** Marca 5xx separado de 4xx: um 429 sob 50 VUs é o limitador funcionando, não defeito. */
function conferir(res, nome) {
  if (res.status >= 500) erros5xx.add(1, { rota: nome });
  return check(res, { [`${nome} não é 5xx`]: (r) => r.status < 500 });
}

const json = { headers: { 'content-type': 'application/json' } };

export default function () {
  const t0 = Date.now();

  conferir(http.get(`${BASE}/api/health`, { tags: { rota: 'health' } }), 'health');
  conferir(http.get(`${BASE}/api/me`, { tags: { rota: 'me' } }), 'me');

  // O lobby: o baralho de jogo e o perfil (a tela que a auditoria mediu em 11 consultas).
  conferir(
    http.get(`${BASE}/api/vocab/para-jogo?fonte=baralho&limite=40&estrategia=equilibrado`, {
      tags: { rota: 'para-jogo' },
    }),
    'para-jogo',
  );
  conferir(http.get(`${BASE}/api/metrics/profile`, { tags: { rota: 'perfil' } }), 'perfil');

  for (let i = 0; i < RODADAS; i++) {
    const corpo = JSON.stringify({
      origem: 'k6',
      // `sessionId` ÚNICO por VU e iteração: a rota é idempotente por `(sessionId, itemRef)`, e um
      // id repetido faria o servidor devolver o resultado guardado em vez de fazer o trabalho —
      // o teste mediria o cache e chamaria isso de desempenho.
      sessionId: `k6-${__VU}-${__ITER}`,
      score: 100,
      itens: [
        {
          cardId: CARTAO || 'k6',
          itemRef: `k6-${__VU}-${__ITER}-${i}`,
          correct: 1,
          attempts: 1,
          ms: 1200,
          kind: 'memory',
        },
      ],
    });
    conferir(http.post(`${BASE}/api/exercises/rodada`, corpo, { ...json, tags: { rota: 'rodada' } }), 'rodada');
  }

  if (CARTAO) {
    conferir(
      http.post(`${BASE}/api/vocab/${CARTAO}/review`, JSON.stringify({ grade: 3 }), {
        ...json,
        tags: { rota: 'review' },
      }),
      'review',
    );
  }

  // Estatísticas ao fim da sessão, como a tela faz.
  conferir(http.get(`${BASE}/api/metrics/xp`, { tags: { rota: 'xp' } }), 'xp');
  conferir(http.get(`${BASE}/api/exercises/results?limite=20`, { tags: { rota: 'resultados' } }), 'resultados');

  jornada.add(Date.now() - t0);

  // Pausa curta entre jornadas: sem ela o teste vira benchmark de laço fechado, que não é o que se
  // quer medir — ninguém joga sem intervalo entre uma rodada e outra.
  sleep(1);
}
