# legenda-parcial-incremental Specification

## Purpose
Parciais vivos incrementais (LocalAgreement-2, acrescenta-decode) na rota pt/Parakeet atrás de flags. Criada pela change `parciais-incrementais` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-parciais-incrementais/proposal.md` para o porquê.

## Requirements

### Requirement: O laboratório mede o atraso por palavra e o flicker

A bancada e o cliente SHALL calcular `atrasoDePalavraMs` (p50 e p90, original e tradução), `erasureOriginal` e `erasureTraducao`
com as mesmas funções puras de `src/core/`. O roteiro da bancada SHALL trazer o tempo por palavra obtido por alinhamento forçado
offline sem dependência nova. A tradução SHALL usar referência proporcional declarada como PROXY. A linha de base SHALL ser
gravada antes de qualquer variante.

#### Scenario: Palavra revista

- **WHEN** uma palavra aparece, é trocada por outra e a nova fica no texto final
- **THEN** o atraso conta a primeira aparição da forma final e a erasure soma 1 palavra trocada

#### Scenario: Fala mal alinhada

- **WHEN** menos de 90% das palavras alinhadas casam com o texto de referência
- **THEN** a fala sai do cálculo e é contada à parte no relatório

### Requirement: A marca de parcial não leva texto

A marca `frasy:parcial` SHALL levar apenas números e o id de motor da lista fechada, e SHALL custar ≤ 0,2 ms (p95) na thread principal.

#### Scenario: Parcial emitido

- **WHEN** um parcial é pintado
- **THEN** a marca existe, sem texto, identificador de pessoa ou de fala

### Requirement: Parciais vivos nascem desligados

A flag `parciais_vivos` SHALL nascer DESLIGADA (migrações PG 0029 e SQLite 0069). Desligada, o parcial SHALL se comportar como hoje (tique de 2 s, no máximo 3 por fala). Ligada, o parcial vivo SHALL valer SÓ na rota do Parakeet (pt/es, com `parciais_parakeet` ligada e o Parakeet ativo na cadeia); nela, a cadência SHALL ser adaptativa por RTF e ocupação do worker, a tela SHALL ser atualizada no máximo a cada 125 ms, o modo de exibição padrão SHALL ser `acrescenta-decode` (só acrescenta, máscara 2) e a parte confirmada por LocalAgreement-2 SHALL NOT regredir na tela. A chave de laboratório `babel.lab.parciaisModo` SHALL ser apenas um override. Em qualquer outra rota (inglês, Whisper, Moonshine, Web Speech, nuvem), o comportamento SHALL ser IDÊNTICO ao de `parciais_vivos` desligada.

#### Scenario: Flag desligada

- **WHEN** `parciais_vivos` está desligada
- **THEN** o intervalo é de 2 s, o teto é de 3 parciais por fala e nenhuma marca nova de cadência é emitida

#### Scenario: Rota fora do Parakeet com a flag ligada

- **WHEN** `parciais_vivos` está ligada e a fala é em inglês, ou o motor é o Whisper/Moonshine, ou `parciais_parakeet` está desligada
- **THEN** o parcial é o de flag desligada: mesma cadência de 2 s, sem limitador, sem LocalAgreement, sem armazém do parcial vivo e mesmos pedidos ao motor

#### Scenario: Hipóteses concordam

- **WHEN** duas hipóteses seguidas concordam nas 5 primeiras palavras
- **THEN** essas 5 ficam firmes e nunca são trocadas ou apagadas depois, e o resto aparece com estilo provisório

### Requirement: O final nunca espera o parcial

Com qualquer flag desta mudança ligada, o final da fala SHALL manter prioridade sobre o parcial e SHALL cancelar o parcial em andamento, e o parcial SHALL NOT atrasar `fimDaFalaAteLegendaMs`.

#### Scenario: Final chega com parcial rodando

- **WHEN** o VAD fecha a fala enquanto um parcial está decodificando
- **THEN** o parcial é cancelado e o final entra na frente na fila do worker

### Requirement: A cauda provisória é acessível

A parte não confirmada SHALL ser distinguida por estilo que não dependa só de cor, e leitores de tela SHALL anunciar apenas o texto confirmado.

#### Scenario: Leitor de tela

- **WHEN** há texto confirmado e cauda provisória no balão
- **THEN** só o confirmado entra na região anunciada

### Requirement: Parcial do Parakeet vive em flag própria

A flag `parciais_parakeet` SHALL nascer DESLIGADA (PG 0030 e SQLite 0070), só ter efeito com `parciais_vivos` ligada e só onde o Parakeet já é o motor do perfil, sem baixar modelo novo.

#### Scenario: Perfil sem Parakeet

- **WHEN** o motor do perfil é o Whisper
- **THEN** `parciais_parakeet` não muda nada

### Requirement: Tradução incremental só local e só do confirmado

A flag `traducao_incremental` SHALL nascer DESLIGADA (PG 0031 e SQLite 0071) e SHALL permanecer desligada: a variante foi REPROVADA no A/B (V3) e o código só fica atrás da flag. Só tem efeito com `parciais_vivos`. Ligada, o parcial SHALL traduzir apenas o prefixo confirmado, esconder as k últimas palavras da tradução (mask-k) e usar só motor local já carregado; SHALL NOT enviar texto de parcial à nuvem; a tradução final SHALL ser a mesma de hoje.

#### Scenario: Sem motor local carregado

- **WHEN** nenhum motor de tradução local está carregado
- **THEN** o parcial aparece sem tradução e nada é enviado à rede

#### Scenario: Final chega

- **WHEN** a tradução final fica pronta
- **THEN** ela substitui a provisória por `traducaoProvisoria`, idêntica à do app sem a flag

### Requirement: Cada variante só liga com A/B aprovado

Cada flag SHALL ter A/B próprio com `criterio.md` commitado antes da 1ª rodada, ≥ 10 rodadas por lado e IC 95% pareado por bootstrap. A métrica primária SHALL ser `atrasoDePalavraMs` p50 (efeito mínimo provisório −20%, confirmado pelo dono). As guardas SHALL ser: `fimDaFalaAteLegendaMs` p75 sem piora (IC), `erasure` ≤ 0,2, WER final sem piora, frames longos, CPU e memória dentro de `slo-captura.json`. Resultado do perfil fraco emulado SHALL NOT aprovar celular.

#### Scenario: Atraso final piora

- **WHEN** o limite superior do IC da diferença de `fimDaFalaAteLegendaMs` p75 é maior que 0
- **THEN** a variante é reprovada, mesmo com ganho no atraso por palavra

#### Scenario: Ganho só no emulado

- **WHEN** a variante aprova no fraco emulado
- **THEN** o relatório diz que o ganho de celular depende da rodada [R] em aparelho real
