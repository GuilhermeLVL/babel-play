# Elenco por frase: a função de IA (desenho, M5)

Status: desenho (sem código de servidor) · Data: 2026-10-28 · Autor: Guilherme (com Claude)

Parte de `docs/specs/2026-10-28-avatar-interprete.md` (M5) e de `openspec/changes/avatar-interprete/` (tarefa 5.1).
O núcleo puro já existe em `src/core/avatar/elenco/` (heurística, vozes, validação, chave do cache). Este documento
desenha o que falta: a IA que melhora a marcação, o cache, as cotas e o consumo pelo Narrador. Depende das frentes de
Livros (Narrador, ficha, parceiro de leitura, cache do parceiro), que ainda não estão nesta base.

## 1. Decisão: marcar uma vez, fora do produto

Uma obra de domínio público tem as mesmas frases para todo mundo. Marcar "quem fala" é trabalho de uma vez por
capítulo, não por leitura. Duas formas, em ordem de preferência:

| Opção                                                                                  | Custo                              | Privacidade                      | Quando                        |
| -------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------- | ----------------------------- |
| A. Offline, como as fichas: `scripts/livros/gerar-elenco.mjs` com `claude -p`/`agy -p` | zero de API (assinaturas do dono)  | só texto de domínio público      | RECOMENDADA, primeira entrega |
| B. Função `leitura_elenco` no servidor, sob demanda, com cache compartilhado           | centavos por capítulo, pagos 1 vez | retenção zero (ZDR), só catálogo | só se A não cobrir o catálogo |

Com A, o resultado vira JSON estático (`public/catalogo/elenco/<livro>/<capitulo>.json`, ou R2), carregado sob
demanda como a ficha. O produto não chama IA para o elenco; só lê o arquivo, valida (`validarMarcacaoDaIa`) e cai na
heurística onde faltar. O livro TRAZIDO pela pessoa fica SEMPRE com a heurística local (texto privado, retenção zero:
nada sai do aparelho). A função B (abaixo) só existe se o dono quiser marcar sob demanda; o desenho a seguir serve às
duas, porque o contrato (JSON, lotes, validação) é o mesmo.

## 2. Contrato: JSON estrito alinhado ao índice da frase

Entrada do lote (o que o prompt leva): `idioma`, `personagens` (nomes da ficha, no máximo 10 por livro, até 80
caracteres cada), `frases` (cada uma com `i` global e `t` texto), mais até 2 frases de contexto antes e depois,
marcadas como `contexto: true` (a IA NÃO as marca). Sem título, autor nem metadado de usuário.

Saída (`json_schema` estrito, `additionalProperties: false`), compacta para caber no teto de tokens:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["frases"],
  "properties": {
    "frases": {
      "type": "array",
      "maxItems": 40,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["indice", "falante", "emocao"],
        "properties": {
          "indice": { "type": "integer", "minimum": 0 },
          "falante": { "enum": ["narrador", "personagem", "desconhecido"] },
          "nome": { "type": ["string", "null"], "maxLength": 80 },
          "emocao": { "enum": ["neutro", "feliz", "triste", "bravo", "surpreso", "relaxado"] },
          "confianca": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    }
  }
}
```

Regras de leitura do servidor (`validarMarcacaoDaIa`, já no core): índice fora do lote, repetido ou de contexto é
descartado e contado; `nome` fora da lista de personagens vira `desconhecido` com confiança <= 0,3 e conta como
"invenção" (telemetria e juiz); emoção desconhecida vira `neutro`; frase sem resposta fica `null` e a heurística
preenche. Resposta fora do formato inteira: 502 `resposta_invalida` (como o parceiro), a heurística cobre o lote.

### Prompt (system, versionado em `VERSAO_DO_PROMPT_DO_ELENCO`)

```
Você marca, frase a frase, QUEM FALA e COM QUE EMOÇÃO num trecho de livro, para uma voz sintética dar vozes
diferentes às personagens. Responda SOMENTE com o JSON do esquema.
- narrador: narração, inclusive fala indireta ("ele disse que viria").
- personagem: fala direta (aspas, travessão). "nome" é EXATAMENTE um nome da lista. Nunca invente nome.
- desconhecido: fala direta de quem você não consegue identificar com segurança. Na dúvida, desconhecido.
- Nome dentro da fala ("— Ana, venha") é quem ouve, não quem fala.
- emocao: neutro, feliz, triste, bravo, surpreso ou relaxado. Use neutro sem pista clara no texto; errar para neutro
  é melhor que dramatizar. Narração é sempre neutro.
- As frases marcadas contexto servem só para entender; não as marque.
- confianca: 0 a 1.
```

O prompt do conjunto de ouro no juiz (`scripts/avatar/juiz-elenco.mjs`, `promptDeRotular`) é a base deste; muda o
formato de entrada (índice global, contexto) e nada na política.

## 3. Lotes, e se cabe nos limites da função `leitura`

Limites atuais da função `leitura` (parceiro de leitura): até 8.000 caracteres de entrada (`TETOS_DO_PARCEIRO.catalogo`)
e 900 tokens de saída (`PARAMETROS_DO_PARCEIRO`). Conta para um lote de 40 frases com 2 de contexto de cada lado (44):

- Entrada. Prosa de romance tem ~120 caracteres por frase (diálogo, ~60; narração longa, 250+). 44 x 120 = 5.280, mais
  o system (~1.300 caracteres) e a lista de personagens (~300) = ~6.900. Cabe nos 8.000 só com frase média; com frases de
  250 caracteres: 44 x 250 = 11.000. NÃO cabe. Por isso o lote se fecha por caracteres, não só por contagem: para ao
  chegar em 40 frases OU 5.500 caracteres de frase, o que vier primeiro. O contexto entra dentro do orçamento.
- Saída. Um item compacto (`{"indice":12,"falante":"personagem","nome":"Ana","emocao":"neutro","confianca":0.9}`)
  tem ~30 tokens. 40 x 30 = 1.200 tokens, acima dos 900. Pode-se encurtar omitindo as frases `narrador`/`neutro` (o
  padrão) e deixando só as exceções, mas em capítulo de diálogo quase tudo é exceção. Com 900 tokens cabem ~28 frases.

Conclusão: dá para usar `leitura` com lotes de ~25 frases, mas isso pede ~12 chamadas por capítulo de 300 frases e
mexe nos tetos de uma função pensada para outra coisa. Proposta: **nova função `leitura_elenco`**, mesmas pernas
(`tutor`, só retenção zero), limites próprios:

| Limite               | `leitura`  | `leitura_elenco` | Por quê                                                       |
| -------------------- | ---------- | ---------------- | ------------------------------------------------------------- |
| entrada (caracteres) | 8.000      | 9.000            | 5.500 de frases + 2 x ~600 de contexto + system + personagens |
| saída (tokens)       | 900        | 1.500            | 40 itens x ~30 + margem                                       |
| frases por lote      | 40 trechos | 40 (+4 contexto) | fecha antes se passar de 5.500 caracteres de frase            |
| temperatura          | 0,2 a 0,6  | 0                | marcação determinística                                       |

Custo (DeepSeek V4.1 Flash, US$ 0,15/0,65 por 1M tokens, o mesmo do parceiro): lote de ~3.000 tokens de entrada e ~1.200
de saída = US$ 0,0012. Capítulo de 300 frases = ~8 lotes = ~US$ 0,01; livro de 30 capítulos = ~US$ 0,30, UMA vez, pago
pela primeira pessoa e dividido por todas pelo cache. Na opção A, zero.

## 4. Cache compartilhado (só catálogo)

Mesma regra do `cacheDoParceiro`: só livro do catálogo com texto conferido no manifesto. Chave = SHA-256 de
`{livro, capítulo, versaoDoMarcador (VERSAO_DO_MARCADOR + versão do prompt), hash do texto do capítulo, nível do modelo}`;
é o `ChaveDoElenco` do core. Outro texto ou outro prompt, outra chave: não há como envenenar nem servir marcação velha.
Guarda a resposta JÁ validada (lida pelo `validarMarcacaoDaIa`), TTL 90 dias, poda diária. Livro trazido e texto da
pessoa nunca entram. Acerto de cache não conta cota nem tokens.

## 5. Privacidade, menores, cotas

- **Retenção zero:** só provedor com `retencao: 'zdr'` (`pernasDaFuncao`), como `leitura`. Sem perna: 501 e a heurística
  assume. Nada de busca na web. Telemetria sem texto (idioma, nº de frases, acerto de cache, contagem de invenções).
- **Quem pede:** só livro do catálogo, e só se `visivelPara` o perfil (menor não pede marcação de livro fora da faixa).
  A marcação é metadado do texto de domínio público; não gera conteúdo novo nem usa dado do perfil. Menor recebe a
  marcação normalmente (é o mesmo arquivo), com `INSTRUCAO_DE_SEGURANCA_PARA_MENORES` no prompt na opção B. Trazido: nunca.
- **Flag:** `avatar_elenco` (`FLAG_AVATAR_ELENCO`) desligada = só heurística. Flag nunca é direito de plano.
- **Cota (opção B):** pedido com acerto de cache é grátis; com miss, conta numa subcota própria `elencoTokensMes`
  (fração pequena da `tokensMes`, como `parceiroTokensMes` = 20%), teto do dia e portão do orçamento de IA. Preencher o
  catálogo em lote usa um trabalho de operação (script), não o pedido de uma pessoa.
- **Limiar antes de ligar:** o juiz (`scripts/avatar/juiz-elenco.mjs`) tem de passar nos limiares de
  `docs/pesquisa/2026-10-28-avatar-elenco-juiz.md`, e o dono aprova. O juiz nunca aprova sozinho.

## 6. Fallback para a heurística

A cadeia por frase, na ordem: marcação da IA válida e confiante (>= `CONFIANCA_MINIMA`) → heurística (`marcarFrases`) →
narrador/neutro. Em lote com frase sem resposta, só ela cai na heurística. Sem rede, sem flag, sem cota, sem arquivo do
capítulo, com resposta inválida ou com o orçamento estourado: heurística. A heurística é determinística e roda no
aparelho, então o recurso nunca "desliga": só fica menos esperto.

## 7. Como o Narrador consumiria (`passos()`)

Hoje `Narrador.passos(indice)` devolve `PassoDaFala[]` `{texto, idioma}` e `falarFrase` chama `motor.speak(texto,
{lang, rate, pitch, volume})`. A ligação (M5, depois do PR de Livros):

1. Ao abrir o capítulo, `elencoDoCapitulo(chave)` carrega o arquivo (opção A) ou chama a função (B), valida, preenche
   buracos com `marcarFrases(frases, {idioma, personagens: ficha.personagens})` e guarda em memória por `indice`.
   Tudo atrás de `FLAG_AVATAR_ELENCO` e da preferência "vozes de personagem" nos Ajustes (padrão desligada).
2. `passos(indice)` ganha `elenco.get(indice)`. Só o passo do LIVRO (modo `original`, e a parte original do `bilingue`)
   leva elenco; a tradução fala sempre na voz da pessoa, sem personagem. O passo vira
   `{texto, idioma, voz?: string, emocao?: EmocaoDoAvatar, falante?: Falante}`.
3. A voz vem de `vozDaFrase(frase, atribuirVozes(personagens, vozesDoMotor, {idioma, vozPrincipal, gostos}))`: o mapa é
   calculado UMA vez por livro (voz da personagem não muda de capítulo) e a pessoa pode trocar a voz de cada personagem no
   painel do elenco (`gostos`, guardado no aparelho). `voiceName` chega ao `speak` (`SpeakOptions.voiceName`).
4. `rate`/`pitch` de cada frase = `parametrosDaEmocao(frase, {rate: velocidade, pitch: tom}, motorTemTom)`: a nuvem
   não tem tom, então só o ritmo muda. Confiança < `CONFIANCA_MINIMA` = narrador, neutro.
5. O avatar-narrador recebe `emocao` e `falante` do passo para a expressão (`expressaoDaEmocao`); o nome da personagem
   falando aparece como legenda do painel. Nada disso muda o texto falado nem o destaque.
6. Falha em qualquer ponto (arquivo, voz inexistente no aparelho, motor sem `voiceName`): o passo sai sem `voz`/`emocao`,
   exatamente como hoje. O avatar nunca é o único caminho para o conteúdo.

## 8. Critérios de aceite do M5 (para a ligação)

1. Conjunto de ouro (pt/en/es) acima do limiar do juiz; falha vira tarefa.
2. Marcação inválida, personagem inventada e frase > 600 caracteres tratadas (testes do core já cobrem).
3. Chave do cache muda com texto, versão do marcador e prompt.
4. `voiceName` chega ao motor; sem a flag ou sem a voz, comportamento idêntico ao de hoje.
5. Livro trazido não sai do aparelho; menor só vê elenco de livro visível a ele.

## 9. Fora do escopo agora

Função de servidor, rota, migração do cache, ligação ao Narrador, painel do elenco e avatar-narrador (dependem do PR de
Livros). Tradução de falas por personagem. Clonagem de voz ou inferência de gênero pelo nome (nunca).
