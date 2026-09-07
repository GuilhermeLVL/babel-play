# Decisões desta mudança

## 1. Pergunta 4 — a edição leve: ENCERRAR

Era a única das três perguntas travadas sem saída barata. As duas respostas davam trabalho em
direções opostas: manter obriga a escrever cada funcionalidade duas vezes; encerrar remove uma
superfície inteira de uma vez.

**O que decidiu, e foi medido antes de decidir:** ela nunca esteve no ar. `deploy-pages.yml` nasceu
desarmado — dispara só manualmente e não tem `CLOUDFLARE_API_TOKEN` nem `CLOUDFLARE_ACCOUNT_ID` — e
nunca foi disparado. O proxy `functions/api/[[path]].ts` respondia 503 "API ainda não publicada".
Encerrar não tirou nada do ar porque nada estava no ar.

**O custo de manter, esse já tinha cobrado:** as três changes de economia desta rodada tiveram de
ser escritas duas vezes, e a seção 5 de `modo-anonimo-em-paridade` estava parada esperando
exatamente esta resposta.

**O que NÃO sai junto, e é o ponto que faz a decisão barata:** o servidor efêmero não é a edição
leve. Ele é quem atende o modo sem conta na edição completa também, e continua inteiro. O produto
"usar sem conta" sobrevive; o que morre é o segundo BUILD.

## 2. O ranking veio junto, em vez de sumir

Havia uma funcionalidade que só a hospedagem no Pages servia: o placar público dos minijogos, numa
Pages Function contra um banco D1 separado.

Apagá-la seria uma perda silenciosa de escopo que o dono não pediu — e pior, a tela de "Recordes e
ranking" já a anunciava, com a frase "o ranking global vive na versão publicada". Encerrar a edição
leve sem trazer o ranking transformaria aquela frase numa mentira: ela apontaria para uma versão
que nunca vai existir.

Então ele veio para `/api/rank`, no Express. As decisões que a versão Cloudflare tinha tomado bem
foram preservadas (uma linha por apelido, tetos de plausibilidade, um envio por minuto por origem);
três coisas mudaram, e cada uma por um motivo:

| o que mudou | por quê |
|---|---|
| `ip` → `ip_hash` | endereço guardado sem prazo e sem caminho de exclusão é dado pessoal numa tabela que se apresenta como anônima. O hash responde à única pergunta da trava ("vieram do mesmo lugar?") e a nenhuma outra |
| `Set` de nove nomes → `MINIGAME_IDS` | a lista à mão envelheceria em silêncio: um jogo novo levaria 404 sem ninguém entender por quê |
| leitura+escrita → um `INSERT ... ON CONFLICT` | duas partidas terminando juntas não podem criar duas linhas do mesmo apelido; quem arbitra é o índice único, não uma leitura anterior |

**A rota fica antes do `authMiddleware`**, como o health e o webhook. Não é descuido: o placar é
público e anônimo por desenho, e exigir token o quebraria justamente no modo para o qual foi feito.
Ela ganha o `writeLimiter` no modo público pela mesma razão do webhook — estando antes do auth,
ficaria sem teto nenhum, e o POST escreve no banco.

**A postura sobre trapaça, dita na cara:** um placar público sem conta é trapaceável, e este é. O
que os tetos garantem não é honestidade — é que a trapaça não QUEBRE a tabela (um envio de dez
milhões deixaria o resto invisível para sempre). Fingir o contrário exigiria conta, e o ranking
existe justamente para funcionar igual sem ela.

## 3. O que a remoção NÃO tirou

Duas peças pareciam exclusivas da leve e não eram:

- **`OnboardingLeve`** perguntava o idioma-alvo na porta, coisa que a onboarding completa não fazia
  — era o achado A38. Ele foi corrigido na mudança `idioma-alvo-e-ui-respeitados`: hoje a completa
  pergunta os dois eixos. A leve não tinha mais nada a ensinar.
- **`TranscricaoLeve`** era um segundo controle para `ui.sttQuality`, e a tela de Captura já tem o
  seletor completo da mesma preferência. Remover não tirou o controle de ninguém.

Se qualquer uma das duas fosse a única forma de fazer algo, ela teria ficado — sem o gate.

## 4. A tabela de paridade virou um TESTE

A tarefa 1.2 de `modo-anonimo-em-paridade` pedia uma tabela "rota → paridade | 501 explicado". Uma
tabela num documento responde a pergunta uma vez e envelhece na primeira rota nova — foi exatamente
assim que seis rotas ficaram fora do espelho sem ninguém perceber, e a aba de Progresso passou meses
vazia para quem estuda sem conta.

`tests/contratos/rotas-espelhadas.test.ts` é a tabela escrita de um jeito que não envelhece: ele lê
as chamadas `/api/...` de todo o `src/` e cobra que cada uma esteja espelhada OU tenha motivo
escrito. E cobra nos dois sentidos — uma justificativa para uma rota que ninguém chama mais é
documentação que sobreviveu ao próprio assunto.

Ele já achou um: `POST /api/ai/llm/chat/completions` existe no Express e nenhum código do cliente a
chama. Rota órfã não é assunto de paridade, é de `codigo-morto-removido` — o que importa é que ela
deixou de estar escondida atrás de uma justificativa plausível.

## 5. `historicoDeXp` foi para o core antes de o modo sem conta precisar dele

A curva de XP era só do servidor, e `/api/metrics/xp` não tinha espelho: a aba de Progresso levava
um 501 e o gráfico ficava vazio sem conta. Copiar a agregação resolveria a tela e criaria a segunda
verdade — setenta linhas de "some evento por balde" que concordariam só enquanto ninguém mexesse
numa delas.

A fórmula foi para `src/core/learning/historicoDeXp.ts` e as duas pontas passaram a chamá-la. O que
ficou em cada lado é o que só ele sabe fazer: LER as linhas. Mesma postura de `economiaDeMetricas` e
de `chaveDedup`.
