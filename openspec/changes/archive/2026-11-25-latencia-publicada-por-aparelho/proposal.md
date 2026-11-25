> **Latência publicada por aparelho (selo e painel).** Transforma a telemetria de campo que já existe (`rum_latencia`, lote
> `v: 2`) em um número honesto e agregado: "aparelhos como o seu veem a legenda traduzida em ~X s". Sem coleta nova.

## Why

O Frasy promete legenda ao vivo no navegador, mas a pessoa só descobre se o aparelho dela dá conta depois de baixar o modelo e
tentar. A medição de campo existe (`server/routes/metricasCaptura.ts`, histogramas `captura_fim_da_fala_ate_legenda_ms{classe,idioma}`,
famílias `captura_latencia` e `captura_carga` no Analytics Engine; ver `docs/runbook.md` §3.2), mas só o dono a enxerga, em
PromQL/SQL. Três perguntas ficam sem resposta:

1. Quem está em dúvida ("meu celular aguenta?") não tem como saber antes de instalar e baixar centenas de MB.
2. O dono não tem um painel: p75 e taxa de falha por classe só saem de consulta manual.
3. Qualquer afirmação de desempenho no site ou nos planos hoje não tem lastro medido (risco de publicidade enganosa).

Não existe change ativa nem arquivada que publique esse número: `lab-medicao-legenda-traduzida` (arquivada) criou a coleta e a
bancada; `roteador-adaptativo-em-sombra` (ativa) usa as mesmas métricas só para decidir a rota. Esta change é o consumo público
e o painel, sem tocar na coleta.

## What Changes

Tudo atrás da flag NOVA `latencia_publicada` (nasce desligada, sem regra de plano). Só tem efeito se `rum_latencia` já estiver
ligada e o parecer de privacidade existir (hoje pendente, `docs/pendencias-do-dono.md`, `roteador-adaptativo-em-sombra` 5.2).

- **Agregador** (`scripts/producao/publicar-latencia.mjs`, por cron/Action): lê as células `classe x idioma` (5 x 3, mais
  `outro`) dos últimos 28 dias, soma os baldes (nunca média de p75) e grava UM arquivo estático `latencia.json` com p50, p75,
  taxa de falha, `n` de falas e a data. Célula com menos de `N_MIN` falas (200) sai como `insuficiente`, sem número. A fonte é o
  Prometheus (self-host) ou o SQL do Analytics Engine (Worker).
- **Selo no app** (perto do Iniciar da captura e do `ModelPrepPanel`): "Aparelhos do seu tipo (celular bom): metade das
  legendas traduzidas aparece em até 1,5 s." A classe vem de `classificarDispositivo` (local); o app só baixa o JSON estático,
  sem identificador. Sem número suficiente, o selo não aparece.
- **Página pública** `/desempenho` gerada em `scripts/site/` no build, com a tabela por classe, a definição da métrica e as
  ressalvas (aproximação ao balde, só adultos que aceitaram métricas anônimas, janela).
- **Painel do dono** no admin: a mesma tabela mais p95 (só com `n` >= 1.000), carga de modelo por fase e taxa de falha.

## Fora de escopo

- Qualquer coleta nova, id de sessão, série por usuário ou por hora do dia. O contrato `v: 2` não muda.
- Ligar `rum_latencia` ou `latencia_publicada` em produção (decisão do dono, com parecer de privacidade).
- Garantia contratual, SLA ou comparação com concorrente.
- Perfil protegido contribuir com medida: continua nunca contribuindo.

## Riscos

- **Viés de seleção**: só medem adultos com consentimento; o número descreve esse grupo. Selo e página dizem isso.
- **Reidentificação por diferença** (células pequenas): piso `N_MIN`, janela de 28 dias e snapshot semanal tornam a diferença
  entre dois snapshots inútil para isolar uma pessoa. O arquivo não tem hora nem id.
- **Número bom demais vira promessa**: o selo usa "metade das legendas" (p50) e mostra a taxa de falha ao lado. Texto revisado
  pela skill `copy-br-etica`.
- **Carga**: o arquivo é estático e cacheável; nenhuma consulta ao Analytics Engine por pedido.

## Custo

Zero de IA. Uma consulta semanal ao Analytics Engine (token de leitura da API da Cloudflare, segredo do dono). Esforço de código
pequeno.

## Métrica de sucesso

- Em 30 dias com `rum_latencia` ligada: pelo menos 6 das 15 células com `n` >= 200. Se não chegar, a publicação fica
  `insuficiente` e isso já é a resposta (o produto ainda não tem público para publicar).
- Erro de reconstrução do p50/p75 <= meio balde, provado na simulação (tarefa 1.1) antes de qualquer dado real.
- Quem vê o selo antes de baixar o modelo no celular não abandona mais a preparação (comparação interna, direcional).
