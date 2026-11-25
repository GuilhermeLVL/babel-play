# Ordem de execução: changes ativas depois da faxina de 23/11/2026

Origem: faxina do OpenSpec sobre a main `d279f9e9`. Das 65 changes ativas, 37 estavam feitas e foram arquivadas em
`openspec/changes/archive/2026-11-23-<nome>/` (specs sincronizados em `openspec/specs/`). Sobraram 18 vivas (trabalho real
pendente) e 10 incertas (precisam de decisão do dono). Tudo o que depende do dono, das changes arquivadas e das que ficaram,
está em `docs/pendencias-do-dono.md`. Cada change tem `proposal.md`, `tasks.md` e `specs/*/spec.md`.

## Vivas, em ordem de prioridade

| #   | Change                           | Prior. | Abertas | Por que nessa posição                                                                                               | Precisa do dono                                                        |
| --- | -------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | `traducao-sem-rota-no-celular`   | P1     | 5       | es→pt sem tradução no celular (CEL-01); a tela finge que traduziu. Só dev.                                          | nada                                                                   |
| 2   | `filtro-tutor-menores`           | P1     | 4       | Conformidade (ECA Digital): estender o filtro às demais saídas de IA para perfil protegido.                         | 4.3 opção C (moderação por IA); 4.4 listas e `tutor_saida_filtrada`    |
| 3   | `porta-de-entrada`               | P2     | 3       | Pequena; fecha o primeiro acesso. Revisar 3.3 (a função do gate por aba foi removida) antes de implementar.         | 6.2 conferir com `VITE_AUTH_REQUIRED=1`                                |
| 4   | `roteador-adaptativo-em-sombra`  | P2     | 6       | Só falta medir e decidir sair da sombra; destrava a rota inteligente de `planos-v3`.                                | 5.2 flag no staging, parecer de privacidade (`rum_latencia`)           |
| 5   | `modelos-confiaveis-e-offline`   | P2     | 6       | Confiabilidade do STT local; a pré-carga (4.1) é dev puro e não depende do dono.                                    | R2 (3.4), privacidade (5.2), Web Analytics (5.3), staging (4.5, 6.1)   |
| 6   | `voz-natural-no-aparelho-kitten` | P2     | 3       | Código pronto; só falta o seletor do leitor (4.4) e publicar modelos. Depende da decisão de `voz-no-aparelho`.      | 4.3 R2, `VITE_VOZ_KITTEN_URL`, ligar `voz_kitten`, ouvir               |
| 7   | `motor-anki-jogos`               | P2     | 14      | Alimenta os jogos de frase com o Anki; só dev. Antes de `motor-anki-mapeador`.                                      | nada                                                                   |
| 8   | `traducao-local-por-direcao`     | P2     | 14      | Qualidade da tradução local; começar por `criterio.md` (1.1) e a bancada `mt.mjs`.                                  | 1.2 portão de licença; 4.3 avaliadores brasileiros; R2                 |
| 9   | `planos-v3-e-rota-inteligente`   | P2     | 28      | Maior; reconciliar com os planos v4 antes de mexer. Depende da rota em sombra (#4).                                 | Asaas (0.3), abrir venda, jurídico (11.6)                              |
| 10  | `interprete-conversa-virtual`    | P2     | 11      | Spike com portão (`setSinkId`); depende de entitlement e do medidor (1.1, 1.9).                                     | plano, voz roteável do Grátis, teste real Meet/Zoom/Discord            |
| 11  | `polimento-movimento`            | P2     | 13      | Fases do protótipo aprovado; mexe em muitos componentes, rodar sozinha.                                             | aprovar aparência do tema e da barra de cinco; temas-v2 (5.3)          |
| 12  | `audiolivros`                    | P2     | 21      | Três flags; maior parte depende de jurídico e escuta cega antes de código novo.                                     | jurídico espeak/OpenRAIL, escuta cega, bucket/CDN, amostra de 5%, beta |
| 13  | `avatar-interprete`              | P2     | 17      | Atrás de flags; reconciliar os checkboxes 1.x/2.x antes de seguir.                                                  | `leitura_elenco` (5.1); revisão por pessoas surdas; ligar flags        |
| 14  | `motor-anki-mapeador`            | P2     | 19      | A arquitetura mudou (importação pesada roda no navegador); confirmar se ainda faz sentido antes de qualquer tarefa. | confirmar a prioridade                                                 |
| 15  | `cartoes`                        | P2     | 31      | Só a fatia 1 feita; a fatia 2 exige limites no servidor e opções na conta.                                          | priorizar a revisão espaçada frente às outras frentes                  |
| 16  | `modelo-do-aluno-e-dados`        | P2     | 29      | Mexe em dado gravado: cada fatia pede sim, backup e ensaio. Depois de `cartoes` (seletor único de revisão).         | sim por fatia                                                          |
| 17  | `tela-de-jogos-v2`               | P3     | 6       | Folha de detalhe e anti-regressão; conflita com `polimento-movimento` (#11), fazer depois.                          | nada                                                                   |
| 18  | `formatacao-e-lint-estrito`      | P3     | 2       | A passada geral do Prettier gera conflito com tudo; só quando as outras frentes esvaziarem.                         | decidir o momento                                                      |

Conflitos de arquivo a respeitar: `modelos-confiaveis-e-offline` (#5) e `traducao-sem-rota-no-celular` (#1) tocam a
preparação de modelos (`ModelPrepPanel.tsx`), então a #1 vai primeiro; `tela-de-jogos-v2` (#17) e `polimento-movimento`
(#11) mexem em `Play.tsx`; `cartoes` (#15) e `modelo-do-aluno-e-dados` (#16) disputam o seletor de revisão.

## Incertas: perguntas objetivas ao dono

1. `ia-por-custo` (P2): arquivo as fases B0 a B6 como feitas e abro uma change nova só para a B7 (trocar os padrões pelos vencedores)? Quando você roda a bancada completa e cria os segredos do Actions?
2. `interprete-fim-de-fala-inteligente` (P2): o Smart Turn v3 vira o padrão do fim de fala? Se sim, marco 2.1, 2.4 e 2.6 como feitos e arquivo depois de você testar fala real (5.2).
3. `voz-no-aparelho` (P2): o motor local é o Supertonic ou o Kitten? Escolhendo o Kitten, arquivo esta change e a `voz-natural-no-aparelho-kitten` segue sozinha.
4. `economia-de-creditos` (P3): a visão de créditos comprados ainda vale com os planos v3/v4? Se não, abandono (arquivo sem sincronizar spec).
5. `interprete-ao-vivo` (P3): a fase de fala-para-fala ao vivo segue depois do corte de custo de 02/10? Se sim, qual provedor e limite de custo para o spike?
6. `interprete-vozes-por-falante` (P3): retomo só quando houver clientes pagantes e reavalio com Kokoro/OpenRouter, ou abandono?
7. `quest-caminho-leve` (P3): você testa no Quest e roda `/diagnostico` para decidirmos threads, eco e onde fica o trabalho pesado, ou abandono por falta de prioridade?
8. `auditoria-i18n-v1` (P3): aceita a tabela e os vereditos (G0.1, G1.1)? Libera rede para Wikidata/Tatoeba? Arquivo como relatório?
9. `api-e-mcp` (P3): a API pública com chave `/v1` e o MCP remoto entram no roadmap? Se não, arquivo a parte entregue (núcleo de IA) e descarto a futura.
10. `estrutura-por-dominio-proposta` (P3): aprova ou recusa a árvore-alvo por domínio (refactor grande, 349 arquivos)? Se recusar, arquivo como descartada.

## Changes de preparo (25/11/2026), ainda sem código

Escritas só como planejamento; nenhuma tem tarefa feita. Ordem sugerida: `sombra-sem-web-speech` (cria o capturador de PCM e
o VAD de uma frase) -> `leitura-ativa-com-moonshine` (reusa o capturador; depende de `leitura_ativa` ligada para ter efeito)
-> `repetir-e-pausar-por-frase` (independente, pode ir antes: não usa modelo nem microfone).

| Change                        | Prior. | Esforço | Precisa do dono                                                                    |
| ----------------------------- | ------ | ------- | ---------------------------------------------------------------------------------- |
| `repetir-e-pausar-por-frase`  | P2     | M       | ligar a flag; decidir vídeo local (fora de escopo); fusão `ditado`/`ditadoDeFrase` |
| `sombra-sem-web-speech`       | P2     | G       | idiomas além de en; texto de privacidade; ligar a flag                             |
| `leitura-ativa-com-moonshine` | P2     | M       | recrutar 10 a 20 brasileiros; ligar `leitura_voz_local` (e `leitura_ativa`)        |

## Atualização de 25/11/2026

O plano consolidado (ondas por conflito de arquivo, bancadas e o que espera o dono) está em `docs/backlog/plano-de-execucao.md`.
A lista única e numerada de decisões, incluindo as 10 incertas acima, está em `docs/backlog/decisoes-do-dono.md`.
Em caso de divergência com a ordem desta página, vale o plano novo.
