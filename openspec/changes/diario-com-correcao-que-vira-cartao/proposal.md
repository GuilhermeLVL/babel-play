## Why

O Frasy ensina com o que a pessoa ouve (legenda, conversa, leitura). Falta o outro lado: o que ela PRODUZ. Escrever sobre o
próprio dia no idioma que aprende é a prática de produção mais barata que existe, e o erro que a pessoa comete é o melhor
cartão que ela pode ter (é o erro DELA, não o de um livro). Hoje:

- Existe retorno de escrita com IA, mas só dentro da Leitura ativa: `POST /api/ai/escrita` exige um texto do acervo (`textoId`
  e a ficha com o nível), tarefa "reescrever" ou "opinar", 20 a 120 palavras, e só em inglês
  (`server/ai/nucleo/escrita.ts`, `src/lib/estudo/promptDaEscrita.ts`), atrás da flag `leitura_ativa`.
- O assistente ao vivo corrige UMA frase falada (`POST /api/ai/assistente/correcao`, `{ ok, corrigida, dica }`).
- O retorno de escrita devolve até 3 pontos com `trecho`, `tipo`, `dica` e `exemplo`, mas NADA disso vira cartão: a pessoa lê
  e a correção some quando ela sai da tela.
- Não existe tela de escrita livre, nem histórico do que a pessoa escreveu, nem o ciclo "escrevi, errei, corrigi, revisei".

Esta change cria o ciclo: **escrever livremente, receber 1 elogio e até 3 correções, transformar cada correção num cartão da
própria pessoa, e rever no espaçamento normal.**

## Para quem

Quem já tem o hábito de capturar e quer produzir. Atende adultos com IA e, depois de condição de segurança, perfil protegido
(ver "Menores"). O plano Grátis tem a conferência local.

## What Changes

Atrás da flag nova `diario` (nasce DESLIGADA; sem regra de plano; a cota vem de `src/core/planos.ts`).

- **Tela `/diario`** (não entra no trilho; abre pelo cartão "Escreva sobre o seu dia" no Início e pela aba Hoje de Cartões):
  editor simples no idioma-alvo da pessoa, prompt do dia opcional ("Conte uma coisa que você viu hoje"), 20 a 200 palavras
  por entrada. O rascunho fica SÓ NO APARELHO (como na Leitura ativa).
- **Retorno por IA (planos pagos)**: reaproveita o núcleo de `escrita.ts` num modo novo `diario` (sem ficha de texto; o nível
  vem do perfil de idioma da pessoa, `lib/perfilDeIdioma.ts`; idiomas v1: inglês e espanhol, os que o prompt e a bancada
  cobrem). Mesmo contrato: 1 elogio e até 3 pontos com `trecho` exato, `tipo`, `dica` em português e `exemplo`.
- **Conferir sozinho (Grátis e perfil protegido sem IA)**: no aparelho, conta palavras, mostra quais palavras que a pessoa
  está aprendendo ela usou e aponta frase sem ponto final (`core/leitura/conferenciaLocal.ts`). Sem chamada de IA.
- **Cada correção vira cartão com um toque** ("Guardar como cartão"): a frente é o trecho do erro em lacuna, o verso é o
  `exemplo` corrigido mais a `dica`; origem `diario`, etiqueta "do diário", `sentence` = frase da pessoa corrigida. Entra pelo
  `bulk-add` existente, com a régua de qualidade e a deduplicação por (palavra, idioma). Nenhuma chamada extra de IA: o cartão
  nasce do retorno já pago.
- **Histórico local**: as entradas e as correções ficam no IndexedDB do aparelho (apagar tudo em um toque; trocar de conta
  apaga). O servidor guarda apenas o contador de uso. Sem sincronizar entradas entre aparelhos na v1.

## Delta sobre o que já existe

Não duplica `leitura-ativa-escrita` (arquivada e sincronizada): reaproveita seu núcleo, filtro de dados pessoais, contador
`escritasMes`, regra de menor e retenção zero. O delta é: modo sem texto de acervo, idioma-alvo da pessoa, histórico local e a
ponte correção -> cartão (inexistente hoje). O "Polir a sessão" (`polirLote`) corrige tradução, não escrita da pessoa. Conferido
em `openspec/changes` e `archive`: nenhuma change de diário.

## Fora de escopo

- Reescrever o texto inteiro da pessoa (o retorno continua sendo apontar, não reescrever).
- Sincronizar o histórico do diário na conta (futuro; mexe em dado pessoal e retenção).
- Voz para texto no diário, tutor conversacional sobre a entrada, compartilhar entrada, notas ou ranking.
- Outros idiomas além de inglês e espanhol na v1.

## Custo da IA (declarado)

- Cada retorno é uma chamada da função nova `diario` (no molde de `escrita`: ~900 tokens de entrada com o `system` e até 200
  palavras, até 500 de saída, temperatura 0,2). Pela conta de `ESCRITAS_MES_DOS_PAGOS`, 30 retornos por mês custam na casa de
  US$ 0,01 por assinante que usa tudo; o diário acrescenta um pouco por causa das 200 palavras, estimativa US$ 0,0004 por
  retorno (a medir na tarefa 1.2 com o modelo vencedor e `npm run ia:custo`).
- Recomendação: o diário usa a MESMA cota `escritasMes` da Leitura ativa (30 por mês nos pagos), sem número novo na matriz de
  planos, e os tokens saem da `tokensMes`. Se o dono quiser cota própria, é `diarioMes` em `src/core/planos.ts` (decisão).
- Só provedor com `retencao: 'zdr'` (`pernasDaFuncao`), nunca Gemini; sem perna, 501. Portão da nuvem, política de custo,
  admissão e reserva de tokens como as outras funções. Falha estorna a cota.
- Cartões criados a partir do retorno: custo zero (sem nova chamada).

## Menores (ECA Digital, LGPD)

Um diário é onde crianças e adolescentes escrevem coisas íntimas. É a superfície mais sensível que o app teria. Desenho:

1. **Entrada**: o filtro de dados pessoais existente (`src/core/leitura/dadosPessoais.ts`, repetido no servidor: 422
   `dado_pessoal`) bloqueia e sublinha. NOVO: um detector local e determinístico de **sinais de risco** (automutilação,
   violência sofrida ou praticada, abuso) em pt, en, es. Com sinal, a entrada NÃO vai à IA; a tela mostra uma mensagem fixa e
   acolhedora ("Parece que você está passando por algo difícil. Converse com um adulto de confiança. No Brasil, o CVV atende
   no 188, 24 horas.") e nenhum texto é registrado (só a contagem da categoria).
2. **Saída**: para perfil protegido, o retorno passa por `moderarSaidaDoTutor` (filtro local de `filtro-tutor-menores`,
   tarefa 4.1 já feita); barrado, sai a frase fixa e nenhum cartão é oferecido.
3. **Instrução de segurança** (`INSTRUCAO_DE_SEGURANCA_PARA_MENORES`) já é aplicada pelo núcleo.
4. **Na v1 a IA do diário é só para adulto declarado.** O perfil protegido usa "Conferir sozinho" e cria cartões à mão a
   partir da conferência local. Liberar a IA para 12 a 17 anos é a Decisão 2 e só depois de `filtro-tutor-menores` 4.3/4.4 e de
   uma rodada de teste com o corpus de risco (tarefa 3.4).
5. **Retenção zero**: nenhum texto (da pessoa ou da IA) vai para banco, log ou cache do servidor; só o contador de uso e, no
   log, quantos pontos e de que tipos. O histórico é local.
6. Sem conta, sem retorno de IA (como a Leitura ativa): só a conferência local.

## Riscos

| Risco                                             | Mitigação                                                                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menor revela dado pessoal ou situação de risco    | Filtro de dados pessoais nos dois lados; detector de risco; IA só para adulto na v1; mensagem fixa e sem registro                                                |
| IA "corrige" o que estava certo (falso positivo)  | Trecho exato ou o ponto é descartado; no máximo 3 pontos; botão "Isto estava certo" que descarta o ponto e conta numa métrica local; bancada com textos sem erro |
| Dica em português errada ou exemplo fora do nível | Nível do perfil no `system`; bancada com dicas avaliadas (tarefa 1.2)                                                                                            |
| Cartão ruim (lacuna que já entrega a resposta)    | Régua de qualidade do `bulk-add`; lacuna construída por `makeCloze` sobre o trecho, nunca sobre o exemplo inteiro                                                |
| Custo cresce em laço                              | Cota mensal, mínimo de 20 palavras, teto de 200, um retorno por entrada por vez, reserva e estorno                                                               |
| Perda do histórico local                          | Aviso claro de que o diário mora neste aparelho; exportar o diário em `.txt` (tarefa 4.2)                                                                        |

## Métrica de sucesso

- Retornos úteis: >= 80% dos pontos NÃO marcados como "estava certo" (bancada e campo).
- Conversão: >= 50% das entradas com retorno geram pelo menos 1 cartão.
- Retenção do hábito: >= 30% de quem escreveu 1 entrada escreve outra em até 7 dias (só agregado, sem texto).
- Aprendizado: o cartão do diário tem retenção em 14 dias igual ou melhor que a média dos cartões da mesma pessoa
  (`review_logs`, agregado).
- Custo: <= US$ 0,0005 por retorno medido; zero chamada de IA em entrada com sinal de risco ou dado pessoal.

## Esforço

G (2 a 3 semanas): a IA e o núcleo são reaproveitados; o peso está na tela, no histórico local, na ponte para o cartão, na
segurança para menores e na bancada de qualidade.

## Decisões do dono (com recomendação)

1. **Cota.** Recomendo dividir a `escritasMes` (30/mês nos pagos) com a Leitura ativa, sem número novo; alternativa é `diarioMes` próprio em `src/core/planos.ts`.
2. **Menores.** Recomendo IA só para adulto na v1; liberar 12 a 17 anos só depois de `filtro-tutor-menores` 4.3/4.4 e da rodada de risco (tarefa 3.4). Abaixo de 12, nunca.
3. **Idiomas da v1:** inglês e espanhol (recomendado) ou só inglês.
4. **Modelo vencedor e custo** (tarefas 1.2 e 1.3), e se a mensagem de apoio cita o CVV (188) ou outro serviço.
5. **Nome da tela:** "Diário" (recomendado; curto e claro) ou "Escrever".
