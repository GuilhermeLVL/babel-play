## ADDED Requirements

### Requirement: A métrica principal tem uma definição única

A métrica `fimDaFalaAteLegendaMs` SHALL ser, por fala, o tempo em ms (`performance.now()` da mesma aba) entre o último quadro de
voz da fala segundo o VAD (`frasy:fala:fim`) e o primeiro quadro pintado em que o balão mostra a tradução FINAL daquela fala
(`frasy:legenda:traduzida`). Parciais NÃO SHALL encerrar a medida. Fala sem tradução (idioma igual ao destino, tradução sob
demanda) SHALL ficar fora do percentil e ser contada em `semTraducao`; fala com falha SHALL ficar fora do percentil e ser contada
em `falhas`. Todo relatório SHALL trazer p50, p75, p95 e a taxa de falha juntos, por classe de aparelho e por idioma de origem.

#### Scenario: Fala traduzida pela nuvem

- **WHEN** o VAD vê o último quadro de voz em t = 10 000 ms e o balão pinta a tradução final em t = 11 350 ms
- **THEN** a fala entra com 1 350 ms, com `origem` `nuvem`

#### Scenario: Parcial já traduzido na tela

- **WHEN** um parcial traduzido está na tela e a tradução final chega depois
- **THEN** o fim é o quadro em que a tradução final aparece, não o do parcial

#### Scenario: Fala sem tradução ou com falha

- **WHEN** a fala não é traduzida por ser do idioma de destino, ou a tradução dá erro ou esgota o tempo
- **THEN** ela não entra no percentil e soma em `semTraducao` ou em `falhas`, e a taxa de falha aparece ao lado do p75

### Requirement: As marcas de desempenho não levam texto nem identificador

As marcas `frasy:*` SHALL levar apenas números, o id de motor da lista fechada do registro, a fase (`download`, `compilacao`,
`aquecimento`), a origem da tradução (lista fechada) e o id local do balão. NENHUMA marca SHALL levar texto, áudio, id de conta ou
de sessão. O tempo de carga de cada modelo SHALL ser medido nas três fases, para STT e MT.

#### Scenario: Carga de um modelo

- **WHEN** o tradutor local carrega com o cache frio
- **THEN** existem as marcas de início e fim de download, compilação e aquecimento daquele `modelo`, nessa ordem

### Requirement: A bancada de captura diz por que uma rodada é inválida

A bancada SHALL distinguir os motivos de rodada inválida (`sem-sonda`, `sem-audio`, `sem-2khz`, `bipe-antes-da-sonda`) em vez de
"bipe não encontrado". Rodada inválida NÃO SHALL gerar número de latência, entrar em mediana nem ser gravada como linha de base.
O erro do marcador de campo (`t_fim` do VAD) contra o fim real da voz no arquivo SHALL ser medido, e SHALL ser ≤ 50 ms (mediana e
p95) para o campo ser chamado de "fim da fala → legenda"; acima disso o relatório SHALL declarar "VAD → tela".

#### Scenario: Sonda sem energia a 2 kHz

- **WHEN** a sonda registra áudio, mas nenhuma janela passa de 0,5 de razão a 2 kHz
- **THEN** a rodada é inválida com o motivo `sem-2khz` e nenhuma latência é calculada

#### Scenario: Marcador dentro do erro

- **WHEN** em 3 rodadas válidas a mediana e o p95 do erro do marcador são ≤ 50 ms
- **THEN** o relatório registra o erro e libera a métrica de campo com a definição do marcador

### Requirement: A instrumentação tem overhead desprezível

Cada marca SHALL custar ≤ 0,2 ms (p95) na thread principal; a métrica medida na bancada com as marcas SHALL ficar ≤ 5 ms acima da
mesma bancada sem elas (diferença pareada, IC 95%); frames longos e CPU no silêncio SHALL ficar dentro das tolerâncias de
`slo-captura.json`; a instrumentação SHALL reter ≤ 50 KB por sessão e limpar as marcas consumidas.

#### Scenario: Sessão longa

- **WHEN** uma sessão de 200 falas termina
- **THEN** a memória retida pela instrumentação é ≤ 50 KB e a linha do tempo do `performance` não guarda as marcas já consumidas

### Requirement: A linha de base oficial é versionada e diz de onde veio

A linha de base de `fimDaFalaAteLegendaMs` (p50, p75, p95) SHALL ficar em `slo-captura.json`, por ambiente e perfil, com `origem`
(`medido` ou `emulado`), `aparelho`, `commit` e `data`. Só uma rodada válida SHALL substituir um valor provisório. Resultado
`emulado` NÃO SHALL ser usado para aprovar ganho de celular, Quest ou iPhone, nem para declarar cumprida a meta desses aparelhos.

#### Scenario: Perfil de celular simulado

- **WHEN** o perfil `celular-fraco` roda no desktop com CPU limitada
- **THEN** o resultado é gravado com `origem: emulado` e nenhum relatório o usa para aprovar uma mudança

#### Scenario: Regressão contra a base

- **WHEN** uma rodada válida tem p75 acima da base mais a tolerância
- **THEN** `comparar.mjs` reprova e aponta a métrica e o perfil

### Requirement: Toda comparação A/B segue o protocolo e decide por critério escrito antes

Um A/B SHALL usar as mesmas falas e o mesmo aparelho, ao menos 10 rodadas válidas por variante em ordem intercalada, diferença
pareada por fala e IC 95% por bootstrap. O critério (hipótese, métrica primária, guardas, efeito mínimo, regra de decisão) SHALL
estar commitado ANTES da primeira rodada. A variante SHALL ser aprovada só se o IC exclui 0 no sentido esperado, o efeito mínimo
é atingido e nenhuma guarda piora; IC que cruza 0 SHALL ser registrado como "sem diferença provada".

#### Scenario: Ganho sem prova

- **WHEN** a variante B tem p75 menor, mas o IC 95% da diferença cruza 0
- **THEN** o relatório conclui "sem diferença provada" e a mudança não é aprovada por latência

#### Scenario: A/B sem critério prévio

- **WHEN** `ab.mjs` recebe rodadas sem `criterio.md` commitado antes delas
- **THEN** a comparação é recusada

### Requirement: A telemetria de campo é agregada, anônima e desligada por padrão

A flag `rum_latencia` SHALL nascer DESLIGADA, sem regra de plano. Desligada, o cliente SHALL mandar só o contrato `v: 1` atual.
Ligada, o lote `v: 2` SHALL conter só baldes fixos e contagens por classe de aparelho (os 5 perfis), idioma-base e motor/fase de
lista fechada, e NUNCA texto, áudio, id de conta, de sessão ou de balão, hora exata, IP ou User-Agent. O envio SHALL respeitar a
mesma porta de hoje (consentimento "Métricas de uso anônimas", conta ou self-host, menor não restrito) e SHALL excluir o perfil
protegido (menor ou idade não declarada). O servidor SHALL só incrementar histogramas e NÃO SHALL gravar o lote.

#### Scenario: Flag desligada

- **WHEN** `rum_latencia` está desligada
- **THEN** nenhum lote `v: 2` é montado e o `v: 1` segue como antes

#### Scenario: Perfil protegido

- **WHEN** a flag está ligada e o perfil é de menor ou de idade não declarada
- **THEN** nada é enviado e os números ficam só no aparelho

#### Scenario: Sem consentimento ou sem conta

- **WHEN** "Métricas de uso anônimas" está desligada, ou não há conta
- **THEN** nada é enviado, com a flag ligada ou não

### Requirement: Ligar o campo em produção depende do parecer de privacidade do dono

A flag `rum_latencia` NÃO SHALL ser ligada em produção sem o parecer de privacidade do dono (LGPD art. 14, ECA Digital, política
vigente) registrado em `docs/`. A migração e a documentação da flag SHALL dizer isso. Se o parecer exigir consentimento do
responsável para menores, o campo SHALL ficar restrito a adultos ou ser desfeito, e o laboratório SHALL continuar só com a bancada.

#### Scenario: Flag ligada sem parecer

- **WHEN** alguém tenta ligar `rum_latencia` em produção e não há parecer registrado
- **THEN** `docs/flags.md` e o runbook dizem que a ligação é bloqueada até o parecer, e a tarefa 5.7 segue aberta

### Requirement: A matriz de aparelhos reais é explícita

O laboratório SHALL manter uma matriz com Android de entrada (~4 GB), iPhone ≥ 12, Quest 3 e as classes de desktop, cada linha com
classe de `perfil.ts`, aparelho, navegador e `origem`. Enquanto o aparelho real não existir, a linha SHALL ser rodada emulada e
marcada `emulado`.

#### Scenario: Linha sem aparelho real

- **WHEN** não há iPhone real para a rodada
- **THEN** a linha existe como `emulado` e o relatório declara que a meta de celular ainda não pode ser fechada
