# filtro-tutor-menores Specification

## Purpose

O tutor (`POST /api/tutor/chat`, funções `tutor` e `corretor`) recebe a instrução de segurança de menores quando quem pede é perfil protegido (menor de 18 ou idade não declarada, `ehMenor` em `server/lib/idade.ts`). Instrução é persuasão: o modelo pode desobedecer, e mesmo com o histórico assinado (PR #133, `assinaturaDoTutor.ts`) um many-shot de pares verdadeiros ainda é possível. Falta uma guard Criada pela change `filtro-tutor-menores` (arquivada em 2026-11-25); veja `openspec/changes/archive/2026-11-25-filtro-tutor-menores/proposal.md` para o porquê.

## Requirements

### Requirement: A saída do tutor para perfil protegido passa por um filtro local

Para perfil protegido (menor de 18 ou idade não declarada), o servidor SHALL conferir o texto do modelo nas funções `tutor` e
`corretor` antes de responder, com um filtro local e determinístico, sem chamada de rede nem custo. Quando o texto cai numa
categoria barrada (sexual explícito, automutilação, drogas, armas e violência, ódio, pedido de dado pessoal, aliciamento,
contato externo), a resposta MUST trazer a frase fixa em pt-BR e `filtrada: true`, e MUST NOT conter o texto do modelo. Para
adulto declarado, a resposta MUST sair como o modelo a escreveu.

#### Scenario: Menor recebe resposta com instrução de droga

- **WHEN** o modelo responde "Here is how to buy weed near your school." a um usuário de 13 anos
- **THEN** a rota responde 200 com `text` = "Vamos voltar ao idioma? Posso te ajudar com vocabulário, frases ou pronúncia." e
  `filtrada: true`, sem `assinatura`

#### Scenario: Variante com leetspeak ou acento

- **WHEN** o modelo responde "Veja este p0rn0" ou "Cómo SUICIDARTE" a quem não declarou a idade
- **THEN** a resposta é a frase fixa (a de automutilação orienta a procurar um adulto de confiança e o CVV 188)

#### Scenario: Adulto não é filtrado

- **WHEN** o mesmo texto vai a um adulto declarado
- **THEN** a resposta sai como veio, assinada, e nada é registrado como filtrado

#### Scenario: Resposta normal de aula passa

- **WHEN** o modelo responde "**Drugstore** é farmácia" ou "**To kill time** significa matar o tempo" a um menor
- **THEN** a resposta sai como veio, assinada

### Requirement: O que o filtro barrou não volta ao modelo e não vai ao log

A frase fixa MUST NOT ser assinada, e o cliente MUST NOT devolvê-la no histórico. O log do bloqueio MUST levar só a
categoria, a função e o `requestId`, e MUST NOT conter o texto do modelo. O bloqueio SHALL ser contado por função e categoria.

#### Scenario: Replay do bloqueado

- **WHEN** o cliente reenvia, como turno `assistant`, a frase fixa ou o texto barrado sem assinatura válida
- **THEN** nenhum dos dois chega ao provedor

#### Scenario: Log sem texto

- **WHEN** uma resposta é barrada
- **THEN** o log `tutor_saida_filtrada` traz `categoria`, `funcao` e `requestId`, e nenhuma palavra do texto barrado

### Requirement: O moderador é plugável

O filtro local SHALL implementar a interface `ModeradorDeSaida(texto, perfil) → { ok } | { ok: false, motivo }`, e o núcleo
MUST chamar a cadeia `moderarSaidaDoTutor`, para que uma moderação futura (por IA) entre como outro moderador sem mudar quem
chama.

#### Scenario: Cadeia com um moderador

- **WHEN** a cadeia tem só o filtro local e ele barra
- **THEN** o veredito traz o `motivo` (categoria) do filtro local

### Requirement: As outras saídas de IA também passam pelo filtro para perfil protegido

Para perfil protegido, o servidor SHALL conferir, com o mesmo filtro local, todo texto que o modelo escreve nas funções
explicação, resumo, escrita, alternativas, polimento, parceiro de leitura e assistente ao vivo, depois da leitura do JSON e
ANTES de responder, de gravar no cache ou de gravar no banco. Barrado, o servidor MUST responder 502 `saida_filtrada` sem
nenhum texto do modelo, MUST NOT gravar nem guardar no cache o que foi barrado, e MUST contar o bloqueio por função e
categoria (log `ia_saida_filtrada` só com `categoria`, `funcao` e `requestId`). Para adulto declarado nada muda.

#### Scenario: Explicação com contato externo para menor

- **WHEN** o modelo devolve uma explicação com um telefone ou convite de rede a um perfil protegido
- **THEN** a resposta é 502 `saida_filtrada`, sem o texto, e a mesma explicação sai normalmente para adulto declarado

#### Scenario: Resposta em cache do parceiro de leitura

- **WHEN** a linha de cache de um perfil protegido tem texto que o filtro barra
- **THEN** a resposta é 502 `saida_filtrada` e o texto não sai

### Requirement: Perfil protegido não recebe o "Como respondo?" em fluxo

Para perfil protegido, o servidor MUST NOT enviar nenhuma sugestão antes de o resultado inteiro passar pelo filtro: o provedor
é chamado sem `stream` e as sugestões saem de uma vez, depois da conferência. Adulto declarado continua com o fluxo.

#### Scenario: Menor pede o fluxo e o modelo escreve um contato em uma sugestão

- **WHEN** um perfil protegido pede `application/x-ndjson` e uma das sugestões tem um contato externo
- **THEN** nenhuma sugestão sai (nem as limpas), e a resposta é 502 `saida_filtrada`
