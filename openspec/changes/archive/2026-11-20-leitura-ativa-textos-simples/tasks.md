# Tarefas

Parte 1 (grupos 1 a 6): flag, núcleo puro, dados, tela de leitura, voz alta e perguntas. Parte 2 (grupos 7 a
10): escrita, servidor, cota e integração com revisão e missões. Cada grupo traz os próprios testes e i18n.
Nenhuma chamada de IA paga: testes com IA simulada.

## 1. Parte 1 — Flag `leitura_ativa`

- [x] 1.1 `FLAG_LEITURA_ATIVA` em `src/core/planos.ts`; migrações `server/db/migrations-pg/0020_flag_leitura_ativa.sql` e `server/db/migrations-sqlite/0062_flag_leitura_ativa.sql` com journal e snapshot; verificar com `tests/leitura-ativa-flag.test.ts` (modelo `voz-no-aparelho-flag.test.ts`: as duas cadeias, desligada, `ON CONFLICT DO NOTHING`) e a contagem atualizada em `tests/integration/schema-pg-baseline.test.ts`
- [x] 1.2 `leitura_ativa` em `FLAGS_SENSIVEIS` (`PainelFlags.tsx`); verificar com o teste do painel que ligar pede confirmação

## 2. Parte 1 — Núcleo puro (`src/core/leitura/`)

- [x] 2.1 `fichaDeTexto.ts`: tipo `FichaDeTexto` e `validarFicha` (campos, 3 perguntas × 3 opções, `correta` válido, palavras-alvo presentes no texto por lema); verificar com `tests/leitura-ativa-ficha.test.ts` cobrindo os cenários de ficha inválida
- [x] 2.2 `coberturaDoTexto.ts`: cobertura por etiquetas + funcionais + nomes próprios, com lema, e rótulo (≥98 / 95–97 / <95 / sem número abaixo de 3 sessões); verificar com `tests/leitura-ativa-cobertura.test.ts` (40/38 = 95%, "apples" ↔ "apple", conta nova sem número)
- [x] 2.3 `alinhadorDeLeitura.ts`: estado imutável, `aplicarParcial` com cursor monotônico e janela de 6, `reposicionar` sem puladas, fim de frase e estrela ≥ 80%; verificar com `tests/leitura-ativa-alinhador.test.ts` com os cenários da spec (completa, pulada, repetição/recuo, fora da janela, reposicionar) e um teste de propriedade "o cursor nunca recua"
- [x] 2.4 `palavrasParaPraticar.ts`: ordem puladas → tocadas → alvo desconhecidas, dedupe por lema, até 5, já no caderno desmarcada; verificar com `tests/leitura-ativa-praticar.test.ts`
- [x] 2.5 Conferir as camadas: `npm run typecheck:core` e `npm run lint` passam (nada de DOM nem import de `src/lib`/`src/gateway`)

## 3. Parte 1 — Dados (acervo)

- [x] 3.1 Copiar `reports/leitura-ativa-prototipo/textos.json` para `src/data/leitura/textos.json` (12 textos, CC BY 4.0) e importar de forma lazy; verificar com `tests/leitura-ativa-acervo.test.ts` (12 ids únicos, 4 por nível, licença e autoria, `validarFicha` sem erro em todos)
- [x] 3.2 Rodapé de crédito e selo gerados da ficha; verificar no teste de componente que "At the Market" mostra equipe Frasy + CC BY 4.0

## 4. Parte 1 — Rota, tela e catálogo

- [x] 4.1 View `leituraAtiva` em `src/types.ts` e `ViewDeRota`, segmento `leitura` e sub-rota `/leitura/<textoId>` em `src/lib/rotas.ts`; verificar com `tests/leitura-ativa-rotas.test.ts` (ida e volta, id inexistente cai no catálogo, sem colisão com `/sessao/<id>/leitura`)
- [x] 4.2 Tela lazy `src/components/views/leituraAtiva/LeituraAtiva.tsx` registrada no `App.tsx` e em `registrarTelas`; item "Leituras" no "Mais" só com `useFlag(FLAG_LEITURA_ATIVA)`; com a flag desligada a rota vai ao início; verificar com teste de componente usando `definirEstadoDasFlags` (ligada e desligada) e `npm run build` com o orçamento de bundle passando
- [x] 4.3 Catálogo (T1): filtros por nível e categoria, "Para você agora"/"Comece por aqui", "Lido ✓" e estado vazio; "lido" em `localStorage` com `try/catch`; verificar com teste de componente dos cenários da spec do acervo
- [x] 4.4 Antes de ler (T2): cobertura, palavras que podem ser novas, 3 modos, modo lembrado; verificar com teste de componente (voz alta esmaecida sem motor local)
- [x] 4.5 Perfil protegido sem ranking, sem palavras/min e sem oferta de plano; verificar com teste de componente com idade 13
- [x] 4.6 Chaves de i18n (en/es/ar), `pseudo.mjs`, cobertura e órfãs; verificar com `node scripts/i18n/pseudo.mjs --check`, `npm run i18n:orfas` e `node scripts/i18n/cobertura.mjs --check`

## 5. Parte 1 — Ler (ouvir, silêncio e voz alta)

- [x] 5.1 Texto em spans por palavra com as etiquetas de sempre (`useEtiquetador`) e toque abrindo `CartaoDaPalavra` sem pausar nada; verificar com teste de componente
- [x] 5.2 Modo "Ouvir primeiro" com `frasesDoTexto`/`narrar` e `criarFalante`, destaque por frase; modo "Ler em silêncio" com "Terminei"; verificar com teste de componente com falante simulado
- [x] 5.3 `src/lib/leituraAtiva/ouvinteLocal.ts`: Web Speech com `processLocally: true`, senão modelo local do roteador, senão indisponível; sem caminho de nuvem; `descartar()` por frase, ao pausar, sair e em `visibilitychange`; verificar com teste unitário que (a) falha local não abre motor de nuvem e (b) `descartar` é chamado em cada fim de frase (Feito: `src/lib/leituraAtiva/ouvinteLocal.ts`; `tests/leitura-ativa-ouvinte.test.ts` cobre a falha local sem abrir nuvem e `descartar()` a cada fim de frase; `SessaoDeLeitura.tsx` descarta ao pausar, sair e em `visibilitychange`. 20/11.)
- [x] 5.4 Aviso do microfone (T2b) antes da permissão, versão infantil a cada sessão no perfil protegido, estados sem microfone/negado/em uso, aba em segundo plano; verificar com teste de componente que nenhum `getUserMedia`/`start()` acontece antes do toque em "Ligar o microfone"
- [x] 5.5 Camada de marcas (lida sublinhado, pulada pontilhado neutro, atual), estrela por frase, `aria-live` só no fim da frase, `prefers-reduced-motion`, aviso "O Frasy se perdeu" após 4 s e reposicionamento por toque; verificar com teste de componente alimentando parciais simulados
- [x] 5.6 E2E `tests/e2e/leitura-ativa-voz.e2e.ts`: flag por `page.route('**/api/flags')`, `SpeechRecognition` falso com parciais crescentes e `processLocally`, lê "At the Market" pulando "six"; confere marcas, "O Frasy não ouviu bem", nenhuma requisição com áudio/transcrição e nada de áudio no armazenamento; rodar nos 3 viewports

## 6. Parte 1 — Perguntas e resumo

- [x] 6.1 Componente de pergunta inline (T4): uma por vez, "Ver em português" (A1 bilíngue por padrão), segunda tentativa, resposta com `explicacao`, "Pular", sem "errado"; verificar com teste de componente dos três cenários
- [x] 6.2 Resumo (T6): frases lidas, tempo, estrelas, perguntas; palavras/min só para adulto em voz alta; lista de palavras para praticar com marcar/desmarcar; verificar com teste de componente (72 palavras em 45 s → "cerca de 96 palavras por minuto"; menor sem palavras/min)
- [x] 6.3 Gate de Parte 1: `npm run typecheck`, `npm run typecheck:estrito`, `npm run lint`, `npm run morto:arquivos`, `npx vitest run tests/leitura-ativa-*` e o e2e 5.6 verdes

### Notas da Parte 1 (o que mudou em relação ao planejado)

- 5.3 fica aberta: o ouvido usa só a Web Speech com `processLocally` (falha fechada); o modelo local do roteador
  (Moonshine via `startLive`) como segundo motor ainda não está ligado. Sem `processLocally`, a voz alta aparece
  esmaecida. Testes em `tests/leitura-ativa-ouvinte.test.ts` (sem motor local nada abre; `descartar` solta e reabre).
- 5.2 usa `falar` (com `onEnd`) + `narrar`, e não `criarFalante`, que não avisa o fim da fala.
- 5.4: os estados "negado" e "sem microfone" vêm dos códigos da Web Speech; "microfone em uso" não tem código
  próprio e cai em "O microfone parou.". O e2e prova que nenhum reconhecedor é criado antes do toque.
- 5.5: "O Frasy se perdeu" e o reposicionamento por toque estão na tela e no núcleo (`reposicionar`, testado), mas
  sem teste de componente com relógio simulado.
- 5.6: o e2e ficou em `tests/e2e/leitura-ativa.e2e.ts` (nome pedido na rodada) e cobre também a flag desligada e as
  três perguntas.
- 6.1: o retorno do erro é "Quase. Releia o texto e tente de novo.": a ficha ainda não diz qual trecho responde
  cada pergunta, então a tela não promete um "trecho destacado". As perguntas aparecem depois de "Terminei" (o
  texto fica à vista), não intercaladas.
- 3.1: o validador achou "careful" fora de dois textos (só "carefully" aparece); a palavra-alvo virou "carefully"
  em `a2-o-onibus-errado` e `a2-o-dragao-quieto`. Cada pergunta ganhou `traducao` (o "Ver em português").

## 7. Parte 2 — Núcleo puro da escrita

- [x] 7.1 `src/core/leitura/dadosPessoais.ts`: e-mail, telefone, @usuário, URL e nome de escola, devolvendo trechos; verificar com `tests/leitura-ativa-dados-pessoais.test.ts` (positivos da spec e negativos como "2 bananas", "six red apples", "at 7 o'clock")
- [x] 7.2 `src/core/leitura/conferenciaLocal.ts`: contagem, palavras-alvo usadas por lema, frases sem ponto; verificar com `tests/leitura-ativa-conferencia.test.ts`
- [x] 7.3 Cota `escritasMes` em `QuotasDoPlano` e em todos os planos (0 no grátis, `ESCRITAS_MES_DOS_PAGOS = 30`, `null` no selfhost), depois de passar pela skill `custo-de-ia`; verificar com `tests/planos-matriz.test.ts`, `planos-capacidades.test.ts` e `planos-so-o-que-existe.test.ts` atualizados

## 8. Parte 2 — Servidor (função `escrita`)

- [x] 8.1 `escrita` em `FuncaoDeIa`/`FUNCOES_DE_IA` (teto de entrada ~1.500, `maxTokens` 500 ≤ 1.500, temperatura 0,2) e docblock de custo; verificar com `tests/integration/funcoes-de-ia.test.ts`
- [x] 8.2 Esquema de saída em `src/lib/esquemasDeSaida.ts` (elogio, até 3 pontos com trecho/tipo/dica/exemplo, resolvidos) e prompt `src/lib/estudo/promptDaEscrita.ts` com texto delimitado como dado, prioridade dos pontos e sem texto reescrito; verificar com teste unitário do prompt (delimitadores, sem `system` vindo do cliente)
- [x] 8.3 Núcleo `server/ai/nucleo/escrita.ts` (quem pede → flag 404 → dados pessoais 422 → plano 403 → cota 429 → menor → cascata só ZDR → esquema → corte em 3 e descarte de trecho inexistente → estorno em falha), sem cache e sem gravar texto; verificar com `tests/integration/escrita.test.ts` com `fetch` simulado cobrindo todos os cenários da spec, inclusive provedor `SEM_ZDR` nunca chamado, `system` com instrução de menor e nenhuma linha de log ou tabela com o texto
- [x] 8.4 Adaptador `server/ai/escrita.ts`, rota `POST /api/ai/escrita` em `server/routes/ai.ts`, teste de caracterização em `tests/caracterizacao/` e consumidor em `src/data/apiDoEstudo.ts`; verificar com `scripts/testes/rotas-sem-caracterizacao.mjs`, `rotas-sem-consumidor.mjs` e `npm run contrato:api`

## 9. Parte 2 — Tela de escrita (T5/T5b)

- [x] 9.1 Escrever: duas tarefas, limites 20–120, chips de palavras-alvo, rascunho local, filtro de dados pessoais com sublinhado; verificar com teste de componente (12 palavras desativa; e-mail bloqueia sem requisição)
- [x] 9.2 Grátis e conta restrita: "Conferir sozinho" com a conferência local e a linha "O retorno com IA faz parte dos planos pagos." (sem "Ver planos" no perfil protegido); revisar a copy com a skill `copy-br-etica`; verificar com teste de componente e o teste de copy
- [x] 9.3 Retorno: frases marcadas 1–3, elogio, dicas, "Ver um exemplo", selo "Retorno feito por IA. Ela pode errar.", erro com "Tentar de novo", cota esgotada, um reenvio com "✓ Resolvido"; verificar com teste de componente usando a API simulada
- [x] 9.4 E2E `tests/e2e/leitura-ativa-escrita.e2e.ts` com `page.route('**/api/ai/escrita')` e `semIaDeVerdade(page)`: plano pago recebe retorno; grátis só confere; nos 3 viewports

## 10. Parte 2 — Revisão, XP e missões

- [x] 10.1 Resultado das perguntas como linhas `exerciseKind: 'leituraAtiva'` com um `roundId` por leitura, pelo cliente das rodadas (aceitar o tipo novo na validação do servidor); verificar com teste de integração que só acerto de 1ª/2ª/nenhum chega, sem texto da pessoa
- [x] 10.2 Palavras marcadas viram cartões via `ficharCartao` + `marcarSalva`, sem duplicar; sem conta, só o aviso; verificar com teste de componente e com o cartão aparecendo na fila de `due.ts`
- [x] 10.3 `TipoDeMissao 'leitura'` (alvo `[1]`) em `src/core/missoes.ts`, contado por rodada `leituraAtiva` do dia, sorteado só com `incluirLeitura`; verificar com `tests/missoes.test.ts`: com a flag desligada o sorteio é idêntico ao de hoje para 200 sementes, e com ligada a missão fecha com uma rodada
- [x] 10.4 Gate final: `npm run typecheck` (×3), `npm run lint`, `npm test`, `npm run build`, i18n (pseudo, órfãs, cobertura, piso), `npm run morto:arquivos`, `npm run morto:ciclos` e os dois e2e verdes; capturas da tela em 375 px e 1280 px para o dono

### Notas da Parte 2 (o que mudou em relação ao planejado)

- 7.3: o teste de 3 dias também fica sem o retorno (403 no núcleo, `reservarEscrita`), além do Grátis e do convidado.
- 8.3: a resposta fora do esquema ESTORNA o retorno do mês (a spec pede), ao contrário da explicação; os tokens
  cobrados continuam na `tokensMes`. O texto lido e o enunciado vêm do acervo pelo `textoId`, não do cliente.
- 9.x: o Grátis no e2e é simulado pelo 403 do servidor (o app do e2e é self-host, que tem o retorno). O modo offline
  e o "Está demorando" estão na tela, sem teste próprio. "Ver uma versão reescrita" (ux T5b) ficou de fora: o
  esquema não tem texto reescrito, de propósito.
- 10.2: o teste de componente prova `ficharCartao` com a frase do texto, `marcarSalva` e nada duplicado; a entrada na
  fila do `due.ts` não tem teste próprio (o cartão novo usa o caminho de sempre do leitor).
- 10.3: o servidor lê as rodadas `leituraAtiva` dos últimos 3 dias à parte das de jogo (`linhasDeLeituraAtiva`); o
  espelho sem conta não sorteia a missão.
- Custo: estimado no `design.md` ("Custo da escrita"); o `npm run ia:custo` não rodou (o ambiente recusou o comando)
  e ainda não modela a escrita.
- Capturas para o dono em `reports/leitura-ativa-prototipo/capturas/` (fora do git).

## 11. Rodada de correções (revisão adversarial e teste de uso)

- [x] 11.1 Microfone só por toque: "Ouvir esta frase" religa no `onEnd` e só com a tela montada, em `lendo`, com a
      aba visível e o mesmo pedido; erro, cancelamento, "Terminei", sair da tela e aba em segundo plano não religam;
      verificar com `tests/leitura-ativa-microfone.test.tsx` (unmount, Terminei, erro, aba escondida)
- [x] 11.2 Alinhador: a revisão de uma palavra já casada ("lia" → "leah") não anda o cursor (`casadas` por posição da
      hipótese); testes com a palavra repetida dentro da janela
- [x] 11.3 Servidor da escrita: o filtro de dados pessoais também nos `anteriores` (422 sem cota nem provedor)
- [x] 11.4 Escrita: perfil protegido nunca vê "Ver planos" depois do 403; o teste de 3 dias não oferece o pedido
- [x] 11.5 Testes dos cenários da spec que faltavam: "Pausamos enquanto você estava fora.", "O microfone parou." com
      "Ligar de novo"/"Seguir em silêncio", "O Frasy se perdeu" + toque que reposiciona, nada vai à rede na voz alta
- [x] 11.6 Filtro de dados pessoais: fixo de 8 dígitos, escola em minúsculas, "the Lincoln school", e-mail por
      extenso; sem falso positivo em "read.me", "apples.Me", dois anos seguidos
- [x] 11.7 Texto pelo teclado: uma parada de Tab, setas/Home/End entre as palavras (tabindex itinerante)
- [x] 11.8 Teste de uso: cartão da palavra com fundo (tokens `--leitor-*` em `.la`, conferido no e2e); "Ver um
      exemplo" com contraste e alvo de 44 px; "✓ Resolvido" com `--good-ink`; a tarefa escolhida visível; iChat
      escondido em `/leitura`; palavras por minuto com teto de 300 e a missão só com tempo de leitura possível

## Workflow follow-up

- O dono valida as suposições do `proposal.md` antes de ligar a flag no staging.
- Medir o reconhecimento local com 10–20 brasileiros lendo três textos (harness do projeto) antes de prometer
  "acompanhar sua leitura".
- Escolher o modelo da escrita por juízes via `claude -p` com 30–50 textos próprios.
- Arquivar o change depois da revisão e do merge.
