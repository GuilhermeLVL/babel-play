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
 * publique a porta. Não havendo Docker, o binário oficial de `github.com/grafana/k6/releases`
 * roda igual: `k6 run scripts/perf/carga.k6.js`.
 *
 * O servidor precisa estar de pé em modo self-host (`AUTH_REQUIRED=0`), com
 * `NODE_ENV=production` e `SECRET_KEY` definida (sem ela ele recusa subir em produção), apontando
 * para uma CÓPIA do banco — as rotas de escrita gravam de verdade em `review_logs`,
 * `exercise_results` e `seed_credits`. Nunca contra `data/babel.db`.
 *
 * CÓPIA NOVA A CADA CORRIDA, e isto não é zelo: cada corrida grava ~16 mil linhas em
 * `exercise_results`, e reaproveitar o banco da corrida anterior derruba o resultado da seguinte —
 * medido, 108 req/s numa cópia limpa contra 59 req/s no banco já engordado. Comparar duas corridas
 * sobre bancos de tamanhos diferentes não compara nada.
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
 * OS LIMIARES SÃO O TESTE, e eles são uma CATRACA — não um desejo.
 *
 * A primeira versão deste arquivo levava `p(95)<300ms` da medição de rota isolada com 10 conexões
 * (`openspec/audits/2026-09-08-baseline/latencia.md`). Rodado de verdade, com 50 usuários fazendo a
 * jornada inteira, o servidor não chega perto disso — e um limiar que reprova sempre é tão inútil
 * quanto um que aprova sempre: nos dois casos ninguém olha.
 *
 * Então os números abaixo são os MEDIDOS em 2026-09-09, arredondados para cima, na mesma máquina e
 * no mesmo cenário. É o padrão de catraca que a casa já usa na cobertura e nas órfãs de i18n: o
 * portão pega REGRESSÃO, e o alvo melhor entra quando o número melhorar. A meta continua escrita
 * aqui para não se perder: p(95) de 300 ms na jornada.
 *
 * A corrida que produziu estes números:
 *
 *   | medida | antes do teto de `/api/exercises/results` | depois |
 *   |---|---:|---:|
 *   | tráfego recebido | 1,1 GB | 45 MB |
 *   | requisições | 5.729 | 16.150 |
 *   | req/s | 37,0 | 107,1 |
 *   | p(95) global | 2,81 s | 1,10 s |
 *   | p(95) perfil | 3,31 s | 1,49 s |
 *   | p(95) rodada | 2,19 s | 489 ms |
 *   | 5xx | 0 | 0 |
 *
 * O gargalo que sobra é `GET /api/metrics/profile`: cinco varreduras por usuário agregadas em JS,
 * 2,9 KB de resposta e 467 ms de mediana sob carga. Ele é o próximo, e não foi tocado aqui.
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
    /* Catraca sobre DUAS corridas de copia limpa (p95 global 1,10 / 1,23 / 1,11 s; perfil 1,49 / 1,71 / 1,60 s;
       review 1,14 / 1,02 / 1,27 s), com folga para a variacao entre execucoes, que e larga. Meta: 300 ms. */
    http_req_duration: ['p(95)<1400'],
    'http_req_duration{rota:perfil}': ['p(95)<1900'],
    'http_req_duration{rota:rodada}': ['p(95)<550'],
    'http_req_duration{rota:review}': ['p(95)<1500'],
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
      /* `roundId` e `exerciseKind` sao OBRIGATORIOS no schema da rota, e a primeira versao deste
         arquivo os omitia: a corrida inteira mediu 400 de validacao e reportou "58,82% de falha"
         como se fosse saturacao do servidor. Medir o caminho de erro e chamar de desempenho e o
         jeito mais rapido de tirar a conclusao errada de um teste de carga. */
      roundId: `k6-${__VU}-${__ITER}-${i}`,
      exerciseKind: 'memory',
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
