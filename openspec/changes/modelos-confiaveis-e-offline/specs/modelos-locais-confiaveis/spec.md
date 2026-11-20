## ADDED Requirements

### Requirement: Peso corrompido não fica no cache

O app MUST NOT gravar no cache de pesos um arquivo cujo tamanho ou sha256 não confira com o manifesto da revisão fixada.
Um arquivo fora do manifesto SHALL ser gravado só se o tamanho bater com o `content-length`, quando ele vier.

#### Scenario: Corpo truncado com status 200 (DISP-01)

- **WHEN** um `.onnx` do moonshine chega pela metade, com status 200 e sem `content-length` (cenário
  `CORTE=trunc ALVO=hf` de `disponibilidade/cenario.mjs`)
- **THEN** o arquivo não é gravado no Cache Storage (o teste lista as chaves do cache e não acha o arquivo)
- **AND** a tela mostra "A conexão caiu enquanto baixávamos o modelo." com "Baixar de novo"

#### Scenario: Manifesto preso às revisões

- **WHEN** uma revisão de `revisoesDosModelos.ts` muda sem o manifesto ser regenerado
- **THEN** o teste do manifesto falha

### Requirement: Modelo do cache que não carrega se cura sozinho

Se a sessão de um modelo carregado do cache falhar ao abrir, o app SHALL apagar do cache as entradas daquele modelo e
refazer a carga da rede uma vez. Se falhar de novo, SHALL rebaixar para o modelo menor e avisar em pt-BR.

#### Scenario: Cache envenenado e navegador reaberto

- **WHEN** a rodada `disponibilidade/rodar-envenenado.sh` envenena o cache, fecha e reabre o navegador com rede normal
- **THEN** a fase "reaberto" tem pelo menos 80 falas em 90 s (a auditoria mediu 0; o controle `primeiro-uso`, 95)
- **AND** nenhum texto visível contém "protobuf" nem "ERROR_CODE"

#### Scenario: Falha persistente

- **WHEN** a carga da rede também falha ao abrir a sessão
- **THEN** a captura segue com o modelo menor e mostra uma mensagem em pt-BR sobre a troca, sem entrar em laço (no máximo 1
  nova tentativa por modelo por página)

### Requirement: O app já visitado abre e legenda sem rede

Depois de uma sessão de legenda com rede, o app SHALL abrir `/app` e iniciar a legenda local sem rede, no mesmo navegador.
A promessa "a legenda roda no aparelho" MUST aparecer offline só quando o worker e o modelo estiverem disponíveis sem rede.

#### Scenario: Iniciar offline (DISP-02)

- **WHEN** o cenário `offline` de `disponibilidade/cenario.mjs` deixa o navegador offline com os modelos em cache e clica em
  Iniciar
- **THEN** a legenda produz falas (pelo menos 1 fala em 60 s com o áudio da rodada), e a tela não mostra "Worker error"

#### Scenario: Recarregar offline

- **WHEN** a página é recarregada offline
- **THEN** a casca do app aparece (o seletor `main` está visível e não há tela em branco) e Legendar abre

#### Scenario: Sem condições de legendar offline

- **WHEN** a pessoa está offline e o modelo nunca foi baixado
- **THEN** a tela diz "Sem internet. Para legendar sem rede, abra a legenda uma vez com internet." e não mostra a promessa

#### Scenario: Atualização não quebra a captura

- **WHEN** um deploy novo sai durante uma captura
- **THEN** a captura em curso continua, e a versão nova entra na próxima abertura do app

### Requirement: Em produção, os pesos e o runtime vêm do domínio próprio

O build de produção MUST buscar pesos de modelo e o runtime ONNX só de origens do Frasy. A CSP de produção MUST NOT liberar
`huggingface.co`, `*.huggingface.co`, `*.hf.co` nem `cdn.jsdelivr.net`. Dev, testes e self-host PODEM continuar usando o Hub.

#### Scenario: Primeiro uso sem terceiros (DISP-05)

- **WHEN** o cenário `primeiro-uso` de `disponibilidade/cenario.mjs` roda contra produção com EN→PT
- **THEN** o log de rede tem 0 requisições a `huggingface.co`, `*.hf.co` e `cdn.jsdelivr.net` (a auditoria contou cerca de
  176 MB do HF e o `.wasm` do jsDelivr)
- **AND** a legenda produz pelo menos 90 falas, como o controle da auditoria

#### Scenario: Portão do deploy

- **WHEN** um arquivo do manifesto não responde 200 no bucket
- **THEN** o workflow de deploy falha antes de publicar
