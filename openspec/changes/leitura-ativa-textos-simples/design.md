## Contexto

Motivação em `proposal.md`. Fontes do desenho: `reports/Leitura ativa de textos simples.md` (pesquisa),
`reports/leitura-ativa-prototipo/ux.md` (telas T1–T6, textos de UI exatos) e
`reports/leitura-ativa-prototipo/mapa-do-codigo.md` (linhas do código a reaproveitar). Os 12 textos estão em
`reports/leitura-ativa-prototipo/textos.json`, conferidos em `textos-verificacao.md` (cobertura por nível
dentro da meta).

Restrições que moldam tudo: `src/core/` é puro (sem DOM, sem rede, `typecheck:core`); a URL espelha
`activeView` (não há router); flags no padrão `FLAG_*` + migração nas duas cadeias; IA só pelo núcleo
(`server/ai/nucleo/`) com retenção zero; cotas só em `src/core/planos.ts`; texto em pt é a chave de i18n.

## Objetivos / Fora de objetivo

**Objetivos:** um protótipo usável de ponta a ponta atrás de `leitura_ativa`, sem custo de IA no
desenvolvimento, com as regras puras testadas e um e2e que simula a voz.

**Fora de objetivo:** medir o reconhecimento com brasileiros (é o próximo passo de pesquisa, não código);
ligar a flag em qualquer ambiente; o leitor EPUB (`/leitor`) não muda.

## Decisões

1. **Tela própria, não o leitor EPUB.** A tela nova (`src/components/views/leituraAtiva/`, view
   `leituraAtiva`, segmento `leitura`) renderiza o texto como spans por palavra. Levar o foliate para um texto
   de 100 palavras traria iframe, paginação e o overlayer sem ganho. Alternativa descartada: `livroDeTexto.ts`
   no leitor (não confirmado e pesado). Reaproveita `CartaoDaPalavra.tsx`, `frasesDoTexto`/`narrar`
   (`src/core/leitura/narracao.ts`), `criarFalante` e `useEtiquetador`.

2. **Acervo empacotado como JSON em `src/data/leitura/textos.json`**, importado de forma lazy pela tela. Doze
   textos cabem em ~25 KB; servir de `public/catalogo/` exigiria um gerador e cache. Quando o acervo crescer
   (acervos externos, 30–60 textos), migra para o catálogo estático. O tipo `FichaDeTexto` e o validador puro
   ficam em `src/core/leitura/fichaDeTexto.ts`; o teste do acervo roda o validador nos 12.

3. **Cobertura por listas, no aparelho** (`src/core/leitura/coberturaDoTexto.ts`, puro). Tokeniza com a mesma
   regra de `palavrasDaFrase`, lematiza com `src/core/texto/lemas.ts`, e conta como conhecida a palavra
   `dominada`/`aprendendo` (entrada: um `Map` de etiquetas que a tela monta com `useEtiquetador`), funcional
   (`PALAVRAS_FUNCIONAIS`) ou nome próprio (maiúscula fora do começo de frase). O nível do texto vem da ficha
   (curado), não é recalculado; o nível sugerido da pessoa sai das faixas 95/98%. Sem embeddings: para 12
   textos, categorias fixas resolvem. O histórico mínimo reaproveita `SESSOES_MINIMAS_PARA_NOVA`.

4. **Alinhador puro com cursor monotônico** (`src/core/leitura/alinhadorDeLeitura.ts`). Estado imutável:
   `{ palavras: EstadoDaPalavra[], cursor }`, com `EstadoDaPalavra = 'pendente'|'atual'|'lida'|'pulada'`.
   `aplicarParcial(estado, parcial)` normaliza o parcial, pega as palavras novas no fim da hipótese e, para cada
   uma, procura a primeira igual em `[cursor, cursor+6)`; casou → as de antes viram `pulada`, ela `lida`, cursor
   anda. `reposicionar(estado, i)` move o cursor sem marcar puladas. Igualdade por forma normalizada e lema
   (aceita "apple"/"apples"). Alternativa descartada: alinhamento global (Needleman-Wunsch) a cada parcial —
   custo maior, e deixa o cursor voltar, o que pisca na tela. "Trocada" fica fora: o reconhecedor corrige para a
   palavra esperada e acusaria errado (pesquisa, §"Ler em voz alta").

5. **Motor de fala só local.** Ordem: Web Speech com `processLocally: true` (falha fechada, já existe em
   `src/gateway/adapters/webSpeech.ts`); senão `startLive` de um modelo local do roteador
   (`src/gateway/sttRouter.ts`, perfil `local-private`, Moonshine em inglês); senão modo indisponível. A tela usa
   um adaptador fino (`src/lib/leituraAtiva/ouvinteLocal.ts`) que expõe `onParcial`, `parar` e `descartar` e
   recusa motor de nuvem por construção (não recebe a fábrica de nuvem). Os buffers de áudio vivem no motor;
   `descartar()` é chamado ao fim de cada frase (detectada pelo alinhador), ao pausar, ao sair e no
   `visibilitychange`.

6. **Persistência local mínima.** "Lido", modo preferido e rascunho de escrita em `localStorage` com
   `try/catch` (chaves `frasy.leituraAtiva.*`). Nada de áudio nem transcrição em armazenamento.

7. **Perguntas e missão pelo caminho das rodadas.** O resultado das perguntas vai como linhas de
   `exercise_results` com `exerciseKind: 'leituraAtiva'` e um `roundId` por leitura, pelo mesmo cliente das
   rodadas de jogo. `TipoDeMissao` ganha `'leitura'` (alvo `[1]`); `FontesDasMissoes.rodadas` já traz as
   linhas, e um filtro novo conta rodadas `leituraAtiva` (que não passam em `ehJogo`, de propósito: não viram
   "jogo novo" nem contam para maestria). O sorteio recebe `incluirLeitura` (a flag), para que com a flag
   desligada o resultado seja idêntico ao de hoje para qualquer semente. Alternativa descartada: registrar como
   `karaoke` — misturaria a maestria do Karaokê.

8. **Palavras para praticar** (`src/core/leitura/palavrasParaPraticar.ts`, puro): junta puladas, tocadas e
   palavras-alvo desconhecidas, deduplica por lema, corta em 5, marca desmarcadas as já no caderno. A tela salva
   com `ficharCartao` + `marcarSalva`, como o leitor.

9. **Função de IA `escrita`.** Entra em `FuncaoDeIa`/`FUNCOES_DE_IA` (`tetoEntrada` ~1.500 caracteres, que
   cobre 120 palavras com folga; `maxTokens` 500; temperatura 0,2). Núcleo `server/ai/nucleo/escrita.ts` no
   modelo de `explicarFrase.ts`: quem pede → flag (`ctx.flagLigada`, 404) → filtro de dados pessoais (422) →
   direito do plano (403) → reserva de `escritasMes` (429) → menor (`comInstrucaoDeMenor`) → cascata só ZDR →
   `formatoDeSaida` com esquema `{ elogio, pontos[≤3]{ trecho, tipo, dica, exemplo }, resolvidos? }` → pós-validação
   (corta em 3, descarta ponto cujo `trecho` não está no texto) → estorno se falhar. Sem cache. O reenvio manda
   os trechos da versão anterior para o modelo dizer quais foram resolvidos; o limite de 1 reenvio por texto é
   do cliente (o servidor só conta cota). O adaptador HTTP é `server/ai/escrita.ts`, rota em `server/routes/ai.ts`,
   cliente em `src/data/apiDoEstudo.ts`. O prompt (`src/lib/estudo/promptDaEscrita.ts`) segue a correção gentil
   do assistente e o delimitador de `corretorPrompt.ts`; prioridade: sentido > tempo verbal > concordância >
   ortografia; ortografia repetida conta uma vez.

10. **Filtro de dados pessoais puro e compartilhado** (`src/core/leitura/dadosPessoais.ts`): e-mail, telefone
    brasileiro e internacional (≥ 8 dígitos com separadores), `@usuario`, URL e "escola/colégio/school" seguido
    de nome próprio. Devolve trechos `{inicio, fim, tipo}`. O cliente sublinha; o servidor recusa. Números
    curtos ("2 bananas") não disparam.

11. **Cota `escritasMes`** em `QuotasDoPlano` e em todos os planos (0 no grátis, `ESCRITAS_MES_DOS_PAGOS = 30`
    nos pagos, `null` no selfhost como as outras de IA), contada pelo mesmo mecanismo de reserva das cotas de
    estudo (`server/lib/iaDeEstudo.ts`). Antes de fixar, a skill `custo-de-ia` e
    `docs/alternativas-de-custo-e-eficiencia.md`: 30 × ~700 tokens num modelo ZDR barato fica abaixo de
    US$ 0,003/mês.

12. **Conferência local do grátis** (`src/core/leitura/conferenciaLocal.ts`, pura): contagem de palavras,
    palavras-alvo usadas (por lema) e frases sem ponto final. Sem IA, sem rede.

13. **Flag.** `FLAG_LEITURA_ATIVA = 'leitura_ativa'` em `src/core/planos.ts`, ao lado de
    `FLAG_PARCEIRO_DE_LEITURA`. Migrações `0020_flag_leitura_ativa.sql` (PG) e `0062_flag_leitura_ativa.sql`
    (SQLite), com journal e snapshot; a contagem do baseline de flags sobe. Não é flag de risco (sem custo sem
    plano pago e com cota), mas entra em `FLAGS_SENSIVEIS` do painel porque liga microfone para menores.
    Não entra em `FLAGS_LIGADAS_NO_DEV` por padrão; o e2e liga por `page.route('**/api/flags')`.

14. **E2E da voz.** Classe falsa de `SpeechRecognition` (modelo `tests/e2e/_interprete.ts`) estendida para
    emitir parciais crescentes e aceitar `processLocally`; o teste lê "At the Market" pulando "six" e confere as
    marcas e a lista de palavras para praticar. A IA da escrita é simulada por `page.route('**/api/ai/escrita')`
    e `semIaDeVerdade(page)`.

## Riscos / Trade-offs

- [Reconhecimento local ruim com sotaque brasileiro faz o cursor travar] → janela de 6, lema na comparação,
  aviso "O Frasy se perdeu" com reposicionamento por toque; medir com 10–20 pessoas antes de ligar a flag.
- [Navegadores sem `processLocally` (Safari, Firefox) não terão voz alta] → os outros dois modos funcionam;
  o modelo local é o caminho nesses navegadores, com download em segundo plano.
- [Filtro de dados pessoais com falso positivo irrita] → regras estreitas, testes com exemplos de A1–B1; o
  aviso diz o que tirar, não bloqueia a tela.
- [IA reescreve demais ou fala da pessoa] → esquema sem campo de "texto reescrito", corte em 3 pontos,
  descarte de trecho inexistente, instrução para menores; escolha do modelo por juízes via `claude -p` com 30–50
  textos próprios antes de ligar.
- [12 textos acabam rápido] → mensagem "Você leu todos os textos deste nível"; acervo externo é a próxima etapa.
- [Missão nova muda o sorteio] → sorteio idêntico com a flag desligada, provado por teste com várias sementes.

## Plano de migração

Tudo nasce desligado. Para testar no staging, o admin liga `leitura_ativa` pelo painel (com confirmação).
Reversão: desligar a flag; a migração tem o `DELETE` de reversão comentado. Nenhuma tabela nova; a cota nova
usa os contadores existentes.

## Questões abertas

As decisões que o dono ainda precisa validar estão em `proposal.md`, seção "Suposições para o dono validar".
Todas foram tomadas de forma provisória para não travar o protótipo; mudar qualquer uma delas muda specs e
tarefas, por isso estão lá e não aqui.
