# Assistente ao vivo: ajuda de idioma em cima da legenda

Fase C1 do plano "legenda flutuante inteligente" (decisões do dono de 25/10/2026). Este documento cobre o **motor**:
a spec, o servidor, o módulo local e a medição de qualidade. A tela (a aba "Assistente" da janela flutuante) é a
Fase C2. Flag `assistente_ao_vivo`, **desligada de fábrica** (SQLite 0057, PG 0011; `docs/flags.md`).

Pesquisa e LLM-as-judge que escolheram o escopo: [`docs/pesquisa/2026-10-25-frasy-assistente-ao-vivo.md`](../pesquisa/2026-10-25-frasy-assistente-ao-vivo.md).
Medição deste motor: [`docs/auditoria/eval-assistente-v1.md`](../auditoria/eval-assistente-v1.md).

## Problema

Quem assiste a uma série, joga ou está numa reunião em outro idioma vê a legenda e a tradução, mas tropeça em três
coisas que a tradução não resolve: a expressão que não é a soma das palavras ("break a leg"), a sigla ou o termo de
trabalho ("KPI", "churn") e a hora de responder ("e agora, como eu digo isso?"). Quem fala também quer saber se falou
certo. Os concorrentes de reunião (Otter, Copilot, Zoom) disputam resumo e ata, que o Teams e o Zoom dão de graça; os
de idioma (Language Reactor, Trancy) cobram US$ 3–6 por glosa na legenda. O espaço do Frasy é o **idioma dentro do
conteúdo**.

## Objetivos

1. **Destacar expressões idiomáticas e gírias** na linha da legenda, com o sentido em poucas palavras (automático).
2. **Marcar as palavras acima do nível da pessoa**, 100% no aparelho, sem rede e sem custo — também no Grátis.
3. **Explicar um termo técnico ou sigla em uma linha** (automático; detecção local e cache por termo).
4. **"Como respondo?"**: 3 respostas curtas, com tradução, sob demanda. Apresentado como ajuda de idioma.
5. **Correção gentil da própria fala** (opt-in).

Os recursos 1, 3, 4 e 5 são de nuvem e **só dos planos pagos**. Perfil protegido (menor ou idade não declarada): tudo
aqui trata só a frase que a própria pessoa está vendo ou falou, e sempre leva a instrução de segurança para menores.

## Fora do escopo

- Qualquer modo "oculto", "indetectável" ou "para entrevistas" (a lição do Cluely). A copy segue a skill
  `copy-br-etica`.
- Tudo que analisa terceiros: resumo, ata, tarefas, "quem disse o quê", emoção ou tom de quem fala, dossiê do
  interlocutor, filtro de toxicidade. Os juízes reprovaram ou marcaram como só para adultos (§5 da pesquisa).
- Busca na web (o ZDR do OpenRouter não cobre plugins de busca).
- Cache no servidor: a frase é da conversa de alguém (retenção zero). O cache das glosas é só na memória da aba.
- Segmentação de idiomas sem espaço (chinês, japonês, tailandês) no recurso 2.

## Design

### Peças

| Peça                                          | O que faz                                                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/planos.ts`                          | `assistenteDia` em `QuotasDoPlano` (200 nos pagos, 0 no Grátis e no convidado, `null` no self-host), `ASSISTENTE_DIA_DOS_PAGOS`, `FLAG_ASSISTENTE_AO_VIVO`.                                               |
| `src/core/assistente/palavrasAcimaDoNivel.ts` | Recurso 2, puro: as palavras da linha acima do nível CEFR da pessoa, com início e fim. Usa `nivelCefr` (as listas A1–C2 da trilha: CEFR-J + Octanove no inglês, faixas de frequência nos outros idiomas). |
| `src/core/assistente/termosCandidatos.ts`     | A detecção local do recurso 3: siglas em caixa alta (2–6 caracteres). A tela só chama a nuvem quando há candidato.                                                                                        |
| `src/lib/estudo/promptDoAssistente.ts`        | Os quatro prompts, os parâmetros (`PARAMETROS_DO_ASSISTENTE`) e os leitores defensivos.                                                                                                                   |
| `src/lib/esquemasDeSaida.ts`                  | Os quatro esquemas `json_schema` estritos (`assistente_*`).                                                                                                                                               |
| `server/lib/assistenteAoVivo.ts`              | O teto do dia: `reservarUsoDoAssistente`/`estornarUsoDoAssistente` (contador `assistente_dia`, dia local).                                                                                                |
| `server/ai/nucleo/assistenteAoVivo.ts`        | O núcleo: flag, teto do dia, menor, ZDR, portão, admissão, cota, cascata, leitura.                                                                                                                        |
| `server/ai/assistente.ts`                     | O adaptador Express e o limitador de 30 pedidos/min (balde próprio).                                                                                                                                      |
| `src/data/apiDoAssistente.ts`                 | Os clientes tipados, o cache da aba e os motivos de falha (`motivoDeCota`).                                                                                                                               |
| `scripts/eval-ia/assistente.mjs`              | A bancada de qualidade e latência (LLM-as-judge, teto no livro-caixa).                                                                                                                                    |

### Fluxo de um pedido (igual ao da explicação da frase)

1. **Flag** `assistente_ao_vivo` desligada → 404 `recurso_indisponivel`, ANTES do limite por minuto (não conta no
   balde), sem ler corpo nem plano.
2. **Corpo estrito** (`z.strictObject`): só o texto da própria pessoa e os idiomas BCP-47. Chave a mais → 400 `invalido`.
3. **Plano** resolvido (erro → 502, fail-closed).
4. **Teto do dia** (`assistenteDia`): Grátis/convidado → 402 `sem_plano`; teto atingido → 429 `teto_do_assistente`.
   **O teste de 14 dias tem o assistente** (decisão de 25/10/2026): é uma amostra do plano pago, como a IA de estudo — o
   plano efetivo do teste traz o `assistenteDia` e a `assistenteTokensMes` dele, e os tokens seguem limitados pela
   franquia do teste (`FRANQUIA_DO_TESTE`).
5. **Menor** (`ehMenor`): instrução de segurança no fim do system; no "Como respondo?", o contexto é descartado.
6. **Pernas** do tutor só com `retencao: 'zdr'` (`pernasDaFuncao('assistente')`), nível rápido; sem perna → 501.
7. **Portão** da nuvem, **política de custo**, **admissão** (disjuntor e balde por modelo), a **subcota de tokens** do
   assistente (`assistenteTokensMes`; esgotada → 402 `cota_do_assistente`) e a **reserva de LLM** (chamadas e tokens
   da `tokensMes`, com o uso justo do dia). Os mesmos tokens contam nas duas.
8. **Cascata** com saída estruturada (`json_schema` strict + `require_parameters`) e o **roteamento da legenda** no
   OpenRouter (o endpoint mais barato que responde em até 1,5 s no p50). Relógios: 5 s na primeira perna, 6 s nas
   reservas, 10 s no total.
9. **Leitura defensiva**: fora do formato → 502 `resposta_invalida` (uso consumido: o provedor cobrou). Nenhum
   provedor respondeu → 502 `provedor_indisponivel` com o uso do dia e os tokens estornados.
10. **Telemetria**: `abrirRastro` com um rótulo por recurso (`assistente-expressoes`, `-termos`, `-como-respondo`,
    `-correcao`), menor, nível e par de idiomas; métrica de resposta inválida com a função `assistente`.

### Contrato da API (para a Fase C2)

Todas as rotas: `POST`, JSON, sessão obrigatória (`/api/ai` está em `SO_COM_CONTA`). Sucesso: o corpo abaixo +
`restanteHoje: number | null`; o modelo que respondeu vem no cabeçalho `x-ia-modelo` (para o 👍/👎). Recusas no
envelope `{ error, code }`.

| Rota                               | Pedido                                                                             | Resposta                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/api/ai/assistente/expressoes`    | `{ frase (1–300), lang, langDaPessoa }`                                            | `{ expressoes: [{ trecho, sentido, tipo: 'idiomatica'\|'giria'\|'phrasal' }] }` (até 3; `trecho` está na frase) |
| `/api/ai/assistente/termos`        | `{ frase (1–300), termos?: string[] (≤ 3, cada um na frase), lang, langDaPessoa }` | `{ termos: [{ termo, explicacao }] }` (até 3; sem `termos`, o modelo escolhe até 2)                             |
| `/api/ai/assistente/como-respondo` | `{ frase (1–400), contexto?: string[] (≤ 2), lang, langDaPessoa }`                 | `{ sugestoes: [{ texto, traducao, tom: 'neutro'\|'informal'\|'formal' }] }` (2 ou 3)                            |
| `/api/ai/assistente/correcao`      | `{ minhaFala (1–400), lang, langDaPessoa }`                                        | `{ correcao: { ok, corrigida, dica } }`                                                                         |

| Status / `code`                                   | Quando                                                    | Motivo no cliente           |
| ------------------------------------------------- | --------------------------------------------------------- | --------------------------- |
| 404 `recurso_indisponivel`                        | flag desligada                                            | `fora`                      |
| 400 `invalido`                                    | corpo fora do contrato, chave a mais, termo fora da frase | `invalido`                  |
| 402 `sem_plano`                                   | Grátis, convidado                                         | `sem_plano`                 |
| 429 `teto_do_assistente`                          | teto do dia                                               | `uso_justo`                 |
| 429 `uso_justo_do_dia` / 402 `quota_exceeded`     | tokens do dia / do mês                                    | `uso_justo` / `cota_do_mes` |
| 402 `cota_do_assistente`                          | a subcota de tokens do assistente no mês                  | `cota_do_mes`               |
| 429 `assistente_demais` / `nuvem_ocupada`         | 30/min, admissão, limite do provedor                      | `nuvem_ocupada`             |
| 501                                               | nenhuma perna ZDR configurada                             | `indisponivel`              |
| 502 `resposta_invalida` / `provedor_indisponivel` | modelo fora do formato / provedor fora do ar              | `indisponivel`              |

Clientes (`src/data/apiDoAssistente.ts`): `destacarExpressoes`, `explicarTermos`, `comoRespondo`, `corrigirMinhaFala`
(nenhum lança; `{ ok: true, valor } | { ok: false, motivo, status }`), `esquecerCacheDoAssistente`. Numa resposta do
cache, `restanteHoje` é o último valor conhecido na aba, ou fica de fora — nunca `null`. Local:
`palavrasAcimaDoNivel(linha, lang, nivelDaPessoa)` e `candidatosATermo(linha)`.

### Recomendações para a tela (C2)

- Expressões: chamar só para linhas com ≥ 4 palavras e no máximo uma vez por linha (o cliente já guarda em cache).
- Termos: chamar só quando `candidatosATermo` acha sigla (ou num toque explícito na linha).
- "Como respondo?": botão explícito. Texto sugerido: "Como respondo?" / "Sugestões para você responder com as suas
  palavras". Nada de "oculto", "ninguém vê" ou "entrevista".
- Correção: interruptor desligado por padrão, e só com a fala do microfone da própria pessoa.
- No Safari (PiP de vídeo, só leitura) só cabem 1, 2 e 3, desenhados inline.

### A tela (Fase C2)

| Peça                                        | O que faz                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/assistente/telaDoAssistente.ts`   | Puro: o portão (`recursosDoAssistente`: flag + `assistenteDia` do plano + recusa do servidor na sessão + consentimento), a faixa mínima (`assistenteNoLayout`), o orçamento (`planejarChamadas`), as marcas sem sobreposição (`marcasDaLinha`) e a glosa única do PiP de vídeo. |
| `src/lib/assistente/agendaDoAssistente.ts`  | Quando uma linha final vai à nuvem: espera de 700 ms, uma chamada por linha, a linha atropelada não é pedida, nada pausado/escondido/fechado.                                                                                                                                   |
| `src/lib/assistente/ajustesDoAssistente.ts` | Os ajustes no aparelho (`babel.assistente`): nível, expressões, termos, correção (opt-in, desligada), abrir na aba.                                                                                                                                                             |
| `src/components/views/captura/assistente/`  | O hook (`useAssistenteAoVivo`), a folha "Como respondo?", a aba Assistente (glossário com Salvar), a seção dos Ajustes da captura e a copy (`copyDoAssistente.ts`).                                                                                                             |

- **Silencioso**: sublinhado pontilhado na palavra (cor por tipo), sentido no `title` e no cartão da palavra (toque ou Enter);
  nenhum aviso, som ou anúncio ao leitor de tela. Falha automática não avisa; a cota esgotada para as automáticas e deixa
  uma nota na aba; `nuvem_ocupada`/`indisponivel` fazem as automáticas recuarem 60 s (`RECUO_DO_ASSISTENTE_MS`).
  Teclado: só a primeira marca da linha entra no Tab (roving), ← → andam entre as marcas, Enter abre o cartão.
- **Uma marca por trecho**: expressão e termo marcam só a PRIMEIRA ocorrência na linha (a mesma sigla três vezes seria
  ruído); as palavras acima do nível marcam todas. Chinês e japonês: a expressão é achada sem borda de palavra, e o
  "≥ 4 palavras" conta pelo `Intl.Segmenter` (sem ele, 2 caracteres por palavra). O recurso 2 segue sem esses idiomas.
- **Orçamento na tela**: cada linha final é oferecida uma vez, quando chega (ligar um recurso depois não manda a linha
  velha); as marcas de cada linha são guardadas por texto, nível, glosas e recursos (o mesmo array, e a linha não é
  repintada enquanto a parcial de outra cresce — a captura também mantém a identidade das falas, `estabilizarFalas`).
- **Faixa (jogo)**: só as marcas de expressão e termo, mais finas (as de nível ficam de fora no jogo); sem botão, sem
  correção, sem abas. **PiP de vídeo**: uma linha curta de glosa
  (expressão, senão termo) embaixo da legenda nos formatos Legenda e Conversa; na faixa, nada.
- **"Como respondo?"**: botão no canto (com os controles) e Alt+R, em legenda/conversa/estudo; folha com 2–3 sugestões,
  tradução, tom, Copiar e Ouvir; "Pensando em respostas…" e, depois de 2,5 s, "Está demorando…" com Cancelar.
- **Escondido** com a flag desligada, no Grátis ou depois de um `sem_plano`/`fora`/`sem_conta` do servidor (o plano é
  acompanhado pelo evento dos entitlements); o recurso 2 segue. O perfil
  protegido recebe os mesmos recursos, sem contexto no "Como respondo?" e sem nenhuma oferta.
- Testes: `tests/assistente-tela.test.ts`, `tests/assistente-janela.test.tsx`, `tests/e2e/assistente-ao-vivo.e2e.ts`.

### As telas da página (Fase C3)

- **Uma instância só**: `LiveCapture` chama `useAssistenteAoVivo` uma vez e a divide em duas vistas — `janela` (a
  legenda flutuante; `useJanelaFlutuante` só conta como a janela está, `aoMudarVistaDoAssistente`) e `pagina` (a legenda
  da captura e o Intérprete). Uma chamada por linha, um cache de marcas, um glossário. A página à vista (aba visível,
  `usePaginaVisivel`) basta para as automáticas saírem; com o PiP de vídeo (só leitura), a página ainda tem o "Como
  respondo?" e a correção. Cada vista desenha só a folha do "Como respondo?" pedida nela (`onde`).
- **As falas** (`src/lib/assistente/falasDoAssistente.ts`): as últimas 60 da sessão. Na captura, o computador é "eles"
  e o microfone é "você"; no Intérprete, a METADE da pessoa (`meu`, ou `outro` com os lados trocados) é "você" — a
  correção (opt-in) só cai nela. A fala sem idioma leva o do lado. SÓ COM O MICROFONE fora do Intérprete (o celular, o
  "Usar o microfone" do Safari e do Firefox) o microfone ouve a TV: o lado é `incerto` e a fala NUNCA vai à correção.
  No Intérprete, a fala do microfone que chega SEM metade (o automático só decide o lado depois de medir o idioma) é
  `incerto` e fica PENDENTE (como uma parcial): nem marcada nem oferecida, até a metade chegar. Só o lado certo é
  guardado (a metade, ou o som do computador); o incerto nunca congela. Regra contra o envio duplo: cada id é oferecido
  no máximo uma vez na vida da instância, com o lado que tinha naquela hora.
- **Quando a página conta** (`paginaMostraOAssistente`): a aba à vista E a legenda da captura (gravando ou com falas, fora
  do foco cheio) ou a conversa do Intérprete; a conversa virtual e a tela pronta, não. As falas que já existem quando a
  captura monta, ou que chegam de uma vez na sessão retomada (`semente`), contam como vistas: nenhuma vai à nuvem.
- **Marcas silenciosas na página** (`TextoComMarcas`): o texto nasce em pedaços estáveis e a marca é só atributo — nada
  novo para as regiões `aria-live` da legenda e da metade do Intérprete anunciarem. Na captura a linha já é um botão: a
  marca não é focável; tocar nela abre o cartão da palavra com o tipo e o sentido, e a folha da frase lista os
  destaques (o teclado chega por ela). No Intérprete (bolhas e o original na metade), roving com ← →, Enter abre o
  cartão.
- **"Como respondo?"**: na captura, uma ação da folha da frase (falas de "eles", ou todas só com o microfone); no
  Intérprete, um botão junto da última fala da outra pessoa (na metade da pessoa e embaixo da bolha), mais Alt+R. A
  folha é a mesma da janela (`FolhaComoRespondo`), numa camada da página; o foco volta para quem a abriu.
- **Correção**: "Mais natural: …" embaixo da própria fala, com `aria-live="off"`.
- Testes: `tests/assistente-paginas.test.tsx`, `tests/modoInterprete.test.tsx` (Fase C3), `tests/e2e/assistente-nas-telas.e2e.ts`.

### Praticar a conversa (Intérprete)

Pedido aprovado pelo dono em 26/10/2026. No Intérprete a pessoa fala o idioma DELA, e a correção gentil da própria fala
quase nunca saía (`planejarChamadas` pula a fala no idioma da pessoa). A prática é o modo em que ela responde no idioma
que aprende e recebe a dica.

- **O botão "Praticar"** (rótulo para o leitor: "Praticar falando em {idioma}") fica na faixa da tela pronta e da
  conversa em curso, ao lado de "Conversa", com `aria-pressed`. **Desligado de fábrica e a cada visita**: o estado mora
  no `EstadoDaTela` (`praticar`) e sair da tela pronta o desliga — mandar a própria fala à nuvem é escolha da vez, não um
  ajuste esquecido. Só aparece com a flag `assistente_ao_vivo` ligada e um idioma a praticar (o que a pessoa aprende,
  diferente do dela).
- **Os idiomas**: praticando, a METADE da pessoa FALA o idioma que ela aprende (`IdiomasDoInterprete.falaDoMeu`;
  `direcaoDoLado` e `idiomasDaConversa` o usam) e segue OUVINDO no dela: a fala da outra pessoa continua chegando
  traduzida. A fala da pessoa no mesmo idioma da outra não tem tradução (o tradutor trata como "sem tradução"); o
  controle guarda esse aviso quando ele chega antes do fim da fala, e a conversa não fica presa em "Traduzindo…".
- **Por toque**: praticando, a conversa é por toque (o automático fica de fora, e tocar nele diz por quê). As duas
  pessoas falam o mesmo idioma e o idioma medido não separa as duas; só o toque na metade diz quem falou. No "Detectar"
  (o idioma da outra pessoa ainda não escolhido) a prática não liga e a faixa pede o idioma.
- **A correção**: a fala da pessoa, no idioma que ela aprende, é "você" e cai nas regras de sempre (`planejarChamadas`:
  só a própria fala, só fora do idioma da pessoa). A prática vale como o opt-in da correção na vez
  (`useAssistenteAoVivo({ praticando })`; os ajustes guardados não mudam). **Nunca a fala da outra pessoa.**
- **O lado incerto nunca vai à correção** (a garantia da C3 vale na prática): a fala sem metade espera; o lado do
  automático sem evidência de idioma (a alternância, ou as duas metades no mesmo idioma — `decidirLadoDaFala` agora
  devolve palpite nesse caso, e o controle marca palpite em tudo que o automático decide praticando) chega como
  `ladoPalpite` e, se cairia na pessoa, vira `incerto`. A fala de terceiros não chega à `/correcao`.
- **Na tela**: "Mais natural: …" com a dica, embaixo da própria fala (na metade e na lista), `aria-live="off"`, sem
  vermelho, sem modal (`CorrecaoNaPagina`).
- **"Falar esta"**: praticando, cada sugestão do "Como respondo?" ganha "Falar esta" (junto de "Ouvir", que lê antes). A
  folha fecha, o microfone abre na metade da pessoa e a sugestão fica à vista ("Leia em voz alta: …"). A PRÓXIMA fala
  final dela fica ligada à sugestão: a tela compara no aparelho (`compararComASugestao`: as palavras que faltaram, sem
  contar ordem nem pontuação) e a correção do servidor vem como em toda fala dela. A rota não muda (o contrato da
  `/correcao` é o mesmo: só `minhaFala`).
- **O portão** (`correcaoNaPratica`): a dica sai com a flag + plano pago ou teste (`assistenteDia`) + o consentimento de
  nuvem. Sem o consentimento, a faixa diz e oferece "Autorizar IA de nuvem". No Grátis, no convidado e depois de um
  `sem_plano` do servidor, a prática liga do mesmo jeito (a pessoa pratica a fala) e a faixa diz, sem oferta de plano:
  "A dica da sua fala não está disponível nesta conta; a tradução segue funcionando." O perfil protegido recebe a
  prática inteira no plano pago, e a mesma nota sem oferta no Grátis.
- Peças: `src/core/assistente/praticaDaConversa.ts` (puro), `interprete/praticaNaConversa.ts` (o botão e as frases),
  `ModoInterprete`, `PaginaDoInterprete`, `ConversaDoPrototipo` (`modos`, `acaoDoAviso`, `ensaiando`, `ensaios`),
  `FolhaComoRespondo` (`aoFalar`), `AssistenteNaPagina` (`SugestaoParaLer`, `ComparacaoNaPagina`).
- Testes: `tests/praticarConversa.test.tsx`, `tests/e2e/praticar-conversa.e2e.ts` (com `PRATICAR_TELAS=<pasta>`, as fotos).

### Cota e custo

- **Teto do dia**: 200 chamadas por dia local nos pagos, somando os quatro recursos; contador próprio.
- **Subcota de tokens** (`assistenteTokensMes`, decisão do dono de 25/10/2026): 25% da `tokensMes` em todo plano
  (Plus 500 mil, Família e Pro 750 mil), definida só em `src/core/planos.ts` (`FRACAO_DA_COTA_DO_ASSISTENTE`), por
  cima do teto do dia. **Decisão: os tokens do assistente contam na subcota E na `tokensMes`.** A subcota é checada
  antes: o assistente para em 25%, e a legenda (e o resto da IA de texto) fica com pelo menos 75% — nunca é esgotada
  pelo assistente. Contar só na subcota protegeria 100% da legenda, mas somaria 25% de tokens ao custo do plano (a
  margem do Pro cairia de R$ 2,29 para R$ 1,24); contar nas duas mantém o custo dentro do que a coluna "IA de texto"
  já paga e conserva o uso justo do dia (`tokensDia`).
- **Custo**: pior caso (teto todo dia, 650 tokens por chamada, preço da perna mais cara do nível rápido), limitado
  pela subcota: R$ 0,45/mês no Plus e R$ 0,67 no Família e no Pro, dentro da IA de texto (R$ 2,80 e R$ 4,20); a
  margem do anual não muda (Plus R$ 2,71, Família R$ 3,94, Pro R$ 2,29 por mês).
- **Medido** (bancada): US$ 0,03–0,07 por mil chamadas no Gemma 4 26B com o roteamento da legenda.
- **Por minuto**: 30 pedidos por conta, num balde próprio — as glosas acompanham a legenda, e dividir o balde caro com
  a tradução de cada fala cortaria a legenda.

- **Roteamento**: a Makora está no `ignore` do OpenRouter (`ops/ia-provedores.openrouter.json`, decisão do dono de
  25/10/2026): era a cauda de 5–14 s do "Como respondo?". Medido antes/depois, intercalado: "Como respondo?" p95
  5,6 → 3,8 s; legenda p95 1,7 → 1,4 s (não piorou: a legenda quase não passa por ela).

### Modelo

A cascata rápida atual (Gemma 4 26B → Llama 3.3 70B, só ZDR) com o roteamento da legenda. Na bancada de 25/10/2026
(100 casos, 2 juízes), ela empatou ou venceu o DeepSeek v4.1 Flash e o gpt-oss-120b nos quatro recursos e custou
menos. Detalhes e números: `docs/auditoria/eval-assistente-v1.md`.

## Critérios de aceite

1. Flag desligada (a semente da migração): as quatro rotas respondem 404 `recurso_indisponivel` sem chamar provedor,
   sem contar e sem ler o plano. _(teste: `tests/integration/assistente-ao-vivo.test.ts`, `tests/caracterizacao/ia.test.ts`)_
2. Grátis: 402 `sem_plano` nas quatro, sem provedor. Pagos: `assistenteDia` = 200; self-host sem teto.
3. Plus: 200 com o corpo do contrato, esquema `assistente_*` com `require_parameters`, `provider.sort = 'price'`, o
   contador do dia +1 e os tokens na `tokensMes` e na subcota `assistenteTokensMes`.
   Subcota esgotada: 402 `cota_do_assistente`, sem provedor e sem tocar na `tokensMes`. `assistenteTokensMes` = 25% da
   `tokensMes` em todo plano. Teste de 14 dias: 200. Convidado (`PLANO_CONVIDADO`): `assistenteDia` 0 e 402.
4. Teto do dia atingido: 429 `teto_do_assistente` sem provedor; o cliente mapeia para `uso_justo`.
5. Resposta fora do formato: 502 `resposta_invalida` e o uso do dia consumido; provedor fora do ar: 502 com uso e
   tokens estornados.
6. Menor: a instrução de segurança no system dos quatro recursos; o "Como respondo?" não envia o contexto. Adulto: sem
   a instrução, com o contexto.
7. Corpo estrito: `falante`, `participantes`, `transcricao`, `falas`, `sessionId`, `emocao` ou qualquer chave a mais →
   400, sem custo; termo pedido fora da frase → 400; idioma com texto livre → 400.
8. Provedor sem `retencao: 'zdr'` nunca é chamado; sem perna ZDR → 501.
9. Com o balde zerado, o 30º pedido no minuto passa e o 31º → 429 `assistente_demais`; o balde caro não muda. Flag
   desligada não conta no balde.
10. Recurso 2: só palavras estritamente acima do nível, com a posição exata; não marca sigla, nome próprio no meio da
    frase, palavra fora da lista (salvo opção) nem idioma sem espaço. _(teste: `tests/assistente-local.test.ts`)_
11. Qualidade e latência medidas com o harness, gasto ≤ US$ 1,00 no livro-caixa; "Como respondo?" com alvo de p95 ≤ 3 s (medido: 5,7 s com a Makora; 3,8 s sem ela — ainda 0,8 s acima do alvo, ver o relatório).
12. `npm run ia:custo`: margem do anual ≥ 0 nos planos v4. _(teste: `tests/assistente-custo.test.ts`)_

## Riscos e mitigação

| Risco                                                         | Mitigação                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| O assistente come a `tokensMes` e falta legenda no fim do mês | Resolvido pela subcota `assistenteTokensMes` (25%): o assistente para antes, e a legenda fica com pelo menos 75% da cota.                       |
| Destaque errado ou inventado                                  | O leitor descarta trecho/termo que não está na frase; a bancada mediu 80–88% de aprovação nas glosas.                                           |
| "Como respondo?" lido como cola                               | Copy de ajuda de idioma, sob demanda, sem promessa de ocultação; o prompt proíbe mentir e dados pessoais.                                       |
| Latência acima de 3 s no "Como respondo?"                     | Sem a Makora (aplicado), p95 de 3,8 s (p50 2,6 s, p90 3,4 s), ainda acima do alvo: a tela mostra a espera e permite cancelar; medir no staging. |
| Provedor do OpenRouter que ignora o esquema                   | `require_parameters` + leitor defensivo; a bancada viu um endpoint (SiliconFlow) devolver JSON sem uma chave — vira 502, sem ajuda inventada.   |

## Perguntas ao dono

1. O teto do dia (200) e o limite por minuto (30) estão bons para o lançamento?
2. ~~Subcota de tokens~~ — decidido: 25% da `tokensMes`, contando nas duas cotas.
3. A palavra acima do nível vai ao Grátis como isca (custo zero) — confirmado; mostrar a contagem de "palavras novas"
   no fim da sessão é próxima fase?
