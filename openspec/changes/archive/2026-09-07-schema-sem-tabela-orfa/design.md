# Decisões desta mudança

## 1. Pergunta 5 — cada tabela, decidida

A pergunta era "remover ou implementar?", tabela por tabela. **O dono respondeu "vá em frente"
(07/09), com a mesma liberação da economia: a aplicação não tem usuários.** A tabela abaixo é a
decisão, com o que foi medido no banco real no dia.

| objeto | linhas | operações em `server/` | decisão |
|---|---|---|---|
| `analyses` | 0 | 0 | remover |
| `profiles` | 0 | 0 | remover |
| `anki_media` | 0 | 0 | remover |
| `anki_note_media` | 0 | 0 | remover |
| `vocab_cards.frequency` | 0 escritas em 2.818 | 0 | remover a coluna |
| `server/lib/ankiMidia.ts` | — | 0 importadores (nem em teste) | remover |
| `CachedAnalysis` | — | 0 usos | remover |
| `VocabCard.frequency` (cliente) | — | 0 leituras, 1 escrita cravada | remover o campo |
| `recalcularDificuldade` | — | 0 chamadores de PRODUÇÃO | **ligar**, não remover |

**Por que remover, e não deixar por precaução.** Uma tabela vazia não é neutra. Ela afirma que o
produto guarda aquilo — `analyses` chegava a ter, em `contract.ts`, um comentário explicando que
"na web vai para `analyses`", coisa que nunca aconteceu; ela entra em toda varredura de manutenção
(exclusão de conta, backfill de tenancy, checagem de drift), e faz quem lê o schema entender errado
o sistema. A regra já existia no repositório: `memory_embeddings` saiu por isso, e o comentário que
ficou diz "schema não é lugar de intenção". O que faltava era aplicá-la de novo.

**As decisões não se perdem.** `motor-anki-midia` continua aberta com o desenho registrado (dedupe
por usuário e não global, por decisão jurídica; referência anulável para "citado mas ainda não
enviado"). Quando a mídia for entregue, as tabelas voltam com o desenho DAQUELE dia, em vez de
carregarem o de 2026-08 por inércia.

**`settings.active_profile_id` fica.** Nunca houve FK para `profiles`: os perfis de IA são código
(`src/gateway/profiles.ts`, `BUILTIN_PROFILES`) e a coluna guarda o id do escolhido. A tabela era a
promessa de perfis definidos pelo usuário, que não existe.

## 2. `recalcularDificuldade` é o oposto do resto: ela é LIGADA

Todos os outros itens saem por não terem uso. Este é o caso simétrico e merece a distinção: a
função está escrita, correta e coberta por dois arquivos de integração. Falta só o chamador de
produção — e sem ele o resultado é o mesmo de não existir, com o agravante de que os testes dela
ficam verdes e dão a impressão contrária.

O efeito medido: `difficulty_score` NULL em 2.818 de 2.818 cartões, `palavrasDificeis` sempre
vazio, o recorte "difíceis" do filtro facetado sem nada, a estratégia de composição
`em-dificuldade` selecionando zero itens. Três funcionalidades visíveis paradas por uma chamada.

O gatilho é `POST /api/exercises/rodada`, **só para os `cardId` da rodada** (é o desempenho desses
itens que acabou de mudar; a varredura de 7 dias continua disponível pela mesma função, sem
`cardIds`, para quando houver um job) e **depois do `res.json`** (quem jogou já recebeu a
confirmação; o recálculo alimenta uma tela que ele vai abrir depois). Falha ali é `warn`, nunca
500: a rodada está gravada, e é isso que a pessoa fez.

## 3. O que NÃO entrou, e por quê

`GET /api/vocab/distribuicao-dificuldade` e `GET /api/vocab/:id/ocorrencias` continuam sem tela.
Elas estão na tarefa 2.3 da proposta, e ficaram de fora de propósito: **rota órfã não é tabela
órfã.** O invariante que esta mudança instala é sobre tabelas, e as duas rotas leem tabelas
vivíssimas (`vocab_cards`, `vocab_occurrences`), com repositório testado.

Elas são trabalho de `codigo-morto-removido`, que por desenho roda por último — e cujo inventário
precisa ser refeito, porque o da auditoria já está velho: três módulos que ela apontava como mortos
(`ocr.ts`, `dificuldade.ts`, `distribuicao.ts`) ganharam importador nas mudanças que vieram depois.
Decidir sobre elas agora, com a lista de 07/09, seria decidir sobre um retrato vencido.

Vale registrar que `/distribuicao-dificuldade` MUDOU de estado com esta mudança: ela era
instrumentação de um número que não existia (todos NULL) e passou a medir algo real.

## 4. A migração 0026 falhou duas vezes antes de aplicar — e as duas ficam registradas

**Primeira:** sem os marcadores de quebra entre as instruções. O migrador do drizzle divide o
arquivo por eles e manda um `execute` por pedaço; sem separador, ele executou o primeiro `DROP`,
gravou a migração como aplicada, e o banco ficou com quatro dos cinco objetos de pé com o journal
dizendo que estava tudo feito. Migração que mente sobre o que aplicou é pior que migração que
falha, porque a próxima execução não tenta de novo.

**Segunda:** o comentário que eu escrevi para explicar a primeira falha CITAVA o marcador. O
divisor é uma busca de texto: a menção partiu o comentário ao meio e o resto virou SQL inválido.

As duas estão escritas no cabeçalho da migração, porque a lição não é sobre este arquivo — é sobre
o próximo que precisar de mais de uma instrução.

Em ambos os casos o banco real foi restaurado da cópia de segurança tirada antes, e só a terceira
execução foi a que valeu. Conferido depois: 0 tabelas órfãs, 0 colunas `frequency`, 2.818 cartões
intactos.
