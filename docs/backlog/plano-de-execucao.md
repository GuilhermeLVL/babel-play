# Plano de execução do backlog (25/11/2026)

> **Andamento (25/11/2026):** Ondas 1 a 4 entregues na `main` (PRs #208, #209, #210 e #211, mais o #212 de correção). Onda 5 em curso (branch `onda5/fechamentos`: chave de duplicata v2 também em marcadas e vistas, arquivamento das changes que só esperam o dono, este plano). Produção segue em `897c9d25` até a publicação única no fim. Detalhe por onda e o que falta: seção "Andamento das ondas e o que resta".

Consolida as 39 changes ativas de `openspec/changes/`: 18 vivas revisadas, 10 incertas, 10 novas de planejamento e `modo-offline-declarado`. Decisões: `docs/backlog/decisoes-do-dono.md` (lista única, numerada). Ordem anterior: `openspec/changes/README-ordem-2026-11-23.md`.

## Regras que valem para tudo

- Desenvolver tudo e publicar produção UMA vez, no fim. Staging liberado em qualquer onda.
- Toda flag nasce desligada. O que espera decisão do dono fica pronto atrás da flag desligada, ou bloqueado quando a decisão muda o desenho.
- Cotas e planos só em `src/core/planos.ts`. IA paga só com custo declarado. Gemini proibido. Menores: retenção zero (ECA Digital/LGPD).
- Marcas: **[D]** depende do dono; **[R]** aparelho real; **[B]** bancada (método rápido, máquina sozinha, uma por vez).
- Esforço: P (até 1 dia), M (2 a 4 dias), G (mais de 4). Valor: A/M/B. Ordem dentro da onda = valor/esforço, maior primeiro.
- Dentro de uma onda não há conflito de arquivo. Entre ondas a ordem é obrigatória onde o conflito está citado.

## Estado das 39 changes

| Estado                                      | Qtd | Changes                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pronta para executar (só dev)               | 11  | `traducao-sem-rota-no-celular`, `porta-de-entrada`, `voz-natural-no-aparelho-kitten` (4.4), `motor-anki-jogos` (escopo reduzido), `repetir-e-pausar-por-frase`, `status-da-palavra-na-legenda`, `latencia-publicada-por-aparelho`, `tela-de-jogos-v2` (depois do polimento), `modelos-confiaveis-e-offline` (7.1 a 7.3), `formatacao-e-lint-estrito` (trava de CI), `modo-offline-declarado` (só reconciliar)                     |
| Pronta atrás de flag / espera decisão       | 16  | `filtro-tutor-menores`, `roteador-adaptativo-em-sombra`, `traducao-local-por-direcao`, `interprete-conversa-virtual`, `polimento-movimento`, `audiolivros`, `avatar-interprete`, `motor-anki-mapeador`, `cartoes`, `modelo-do-aluno-e-dados`, `sombra-sem-web-speech`, `leitura-ativa-com-moonshine`, `cartao-com-audio-do-trecho`, `cartao-com-captura-de-tela`, `diario-com-correcao-que-vira-cartao`, `navegacao-mais-simples` |
| Arquivar após fechamento curto              | 1   | `planos-v3-e-rota-inteligente` (abre duas changes pequenas: preço v4 e rota inteligente)                                                                                                                                                                                                                                                                                                                                          |
| Só pacote de decisão/jurídico, sem código   | 1   | `ao-vivo-streaming-de-terceiro` (recomendação: arquivar ou adiar até `latencia-publicada` mostrar a necessidade)                                                                                                                                                                                                                                                                                                                  |
| Incertas (decidir antes de qualquer código) | 10  | `ia-por-custo`, `interprete-fim-de-fala-inteligente`, `voz-no-aparelho`, `economia-de-creditos`, `interprete-ao-vivo`, `interprete-vozes-por-falante`, `quest-caminho-leve`, `auditoria-i18n-v1`, `api-e-mcp`, `estrutura-por-dominio-proposta` (decisões 20 a 29)                                                                                                                                                                |

## Conflitos de arquivo que ditam as ondas

| Arquivo / recurso                                                | Changes                                                                                                | Regra                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `ModelPrepPanel.tsx`                                             | `traducao-sem-rota-no-celular`, `modelos-confiaveis-e-offline`, `traducao-local-por-direcao`           | sem-rota, modelos-confiaveis, traducao-local (ver nota)       |
| `Play.tsx` (4.037 linhas)                                        | `motor-anki-jogos`, `polimento-movimento`, `tela-de-jogos-v2`, `navegacao-mais-simples`, `cartoes` 9.x | anki-jogos, polimento (sozinha), tela-de-jogos-v2, navegação  |
| `politicaDeRota.ts`, `conferenciaDaRota.ts`, `pipelineDeFala.ts` | `roteador-adaptativo-em-sombra`, `planos-v3-e-rota-inteligente`                                        | roteador antes; nunca em paralelo                             |
| `SeletorDeVoz.tsx`                                               | `voz-natural-no-aparelho-kitten`, `voz-no-aparelho`                                                    | kitten primeiro                                               |
| `PaginaDoInterprete.tsx`, `planos.ts`                            | `interprete-conversa-virtual`, `interprete-fim-de-fala-inteligente`, plano v4                          | conversa-virtual só após kitten e plano v4                    |
| `src/lib/leitor/`, `docs/flags.md`                               | `audiolivros`, `avatar-interprete`, `leitura-ativa-com-moonshine`                                      | uma por vez                                                   |
| Seletor de revisão                                               | `cartoes`, `modelo-do-aluno-e-dados`                                                                   | cartoes bloco 2, depois modelo-do-aluno                       |
| Bucket R2 (pesos, ORT, Bergamot, Kitten, voz)                    | `modelos-confiaveis` 3.4, kitten, `traducao-local`, `sombra-sem-web-speech`, `audiolivros`             | UMA publicação do dono (decisão 3); o código usa a URL depois |
| Capturador de PCM + VAD                                          | `sombra-sem-web-speech` (cria), `leitura-ativa-com-moonshine` (reusa)                                  | sombra antes                                                  |
| Armazém local de áudio/imagem                                    | `cartao-com-audio-do-trecho` (cria), `cartao-com-captura-de-tela` (reusa)                              | áudio antes                                                   |

Nota: os relatórios divergem. `traducao-local` diz que `modelos-confiaveis` vem depois; `modelos-confiaveis` diz que vai depois de `traducao-sem-rota`. Adotado: `modelos-confiaveis` na Onda 2 e `traducao-local` na Onda 3, serializados em `ModelPrepPanel.tsx`. Para inverter, troque as duas de onda.

## Onda 0. Desbloqueio do dono (paralelo a tudo, não é dev)

| Ato                                                                                                    | Destrava                                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Publicar pesos, ORT, Bergamot e voz no R2 de uma vez [D] (decisão 3)                                   | modelos-confiaveis, kitten, traducao-sem-rota (CDN), sombra, traducao-local |
| Parecer de privacidade único (`rum_latencia`, `roteador`, contador de falhas) [D] (decisão 5)          | roteador 5.2, latencia-publicada, modelos-confiaveis 5.2                    |
| Pedido jurídico único: preço v4, anual, anúncios, OpenRAIL-M, voz de menor em terceiro [D] (decisão 6) | planos-v3 11.6, audiolivros, voz-no-aparelho, ao-vivo                       |

## Onda 1. Só dev, arquivos disjuntos (em paralelo)

| #    | Change                              | Esf. | Valor | Marcas / observações                                                                                                      |
| ---- | ----------------------------------- | ---- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | `filtro-tutor-menores`              | P    | A     | Código completo; resta 4.5 (teste estático de cobertura). 4.3 opção C [D]: fora. 4.4 relatório semanal [D]. Sem flag nova |
| 1.2  | `traducao-sem-rota-no-celular`      | P    | A     | Reaplicar o e2e `ef991c9f` (3.2). 6.1 [D] piso do pivô. 5.3 memória [R]. CDN [D]. Libera `ModelPrepPanel.tsx`             |
| 1.3  | `porta-de-entrada`                  | P    | M     | Fechar 2.4 (507 de palavras) e 3.3, arquivar. 6.2 [R] funde com `acesso-sem-conta-v2`                                     |
| 1.4  | `voz-natural-no-aparelho-kitten`    | P    | A     | 4.4 opção `@kitten` em `SeletorDeVoz.tsx`. 4.3 [D] R2 e flag. 5.2 [R][B] celular e Safari                                 |
| 1.5  | `status-da-palavra-na-legenda`      | P-M  | M     | Flag `forca_na_legenda`. Simulação offline do mapa em decks reais primeiro (leve). Mapa final [D]                         |
| 1.6  | `repetir-e-pausar-por-frase`        | M    | M     | Flag `frase_por_frase`. Começa por `Analysis.tsx` (`loopMode` morto). 4.2 ditado depende de decisão [D]. 20 frases [R]    |
| 1.7  | `motor-anki-jogos`                  | M    | M-A   | Escopo reduzido (sem mídia). Ligar `filtroAplicavel` na UI; "só revisão". **Antes** do polimento por causa de `Play.tsx`  |
| 1.8  | `roteador-adaptativo-em-sombra`     | M    | B-M   | 1.3 (reconciliar critério E-005) primeiro. Medição 4.1 a 4.3 [B]. Staging 2 semanas [D]. Reserva `politicaDeRota.ts`      |
| 1.9  | `formatacao-e-lint-estrito` (trava) | P    | B     | Só a trava de CI nos arquivos do PR. Passada geral na Onda 5                                                              |
| 1.10 | `modo-offline-declarado`            | P    | B     | Sem tarefas abertas; reconciliar com `modelos-confiaveis` 7.3 e arquivar                                                  |

## Onda 2. Depende da Onda 1, paralelas entre si

| #   | Change                                      | Esf. | Valor | Marcas / observações                                                                                                                                                                    |
| --- | ------------------------------------------- | ---- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | `modelos-confiaveis-e-offline`              | P    | A     | Depois de 1.2. 7.1 (escopo `/` do service worker vs site público), 7.2 (Parakeet no espelho), 7.3. 3.4, 4.5, 5.2, 6.1 [D]; ordem: publicar, rodar o portão, só então definir a variável |
| 2.2 | `cartoes` (bloco 2)                         | M    | A     | Limite diário na conta, nota não perdida, quem erra revê. Migração com backup e ensaio [D]. Pontas Anki 7.2 e 7.3. 9.3 espera o polimento                                               |
| 2.3 | `planos-v3-e-rota-inteligente` (fechamento) | P    | A     | Depois de 1.8. Reescrever spec para v4, ADR 0016, abrir duas changes pequenas, descartar Ao Vivo [D]. Reserva `politicaDeRota.ts` e `pipelineDeFala.ts`                                 |
| 2.4 | `motor-anki-mapeador` (enxuto)              | M    | M     | Depois de 1.7. Confiança, priors em JSON, Mapeador antes do 1º lote. Perfil só no aparelho                                                                                              |
| 2.5 | `sombra-sem-web-speech`                     | G    | A     | Flag `sombra_local`. Cria capturador de PCM e VAD. Só inglês no começo [D]. Régua antes, simular offline [B]. Conformidade de `SombraDaFala` (decisão 12) antes                         |
| 2.6 | `latencia-publicada-por-aparelho`           | P-M  | M     | Flag `latencia_publicada`. Lotes sintéticos primeiro. Liga só com `rum_latencia` e parecer [D]                                                                                          |
| 2.7 | `avatar-interprete` (conferência)           | P    | M     | Conferência, runbook, i18n es/ar, coleção no R2. Staging só no id do dono [D]. `avatar_sinais` desligada. Sem tocar `src/lib/leitor/` nesta onda                                        |

## Onda 3. `Play.tsx` sozinha, mais frentes sem conflito com ela

| #   | Change                                         | Esf.  | Valor | Marcas / observações                                                                                                     |
| --- | ---------------------------------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| 3.1 | `polimento-movimento`                          | M     | M     | **Sozinha em `Play.tsx`.** Reconciliar tasks e estado (fases 0 a 7 prontas). 8.5 `prefers-reduced-motion`. Aparência [D] |
| 3.2 | `modelo-do-aluno-e-dados` (chave de duplicata) | M     | A     | Depois de 2.2. Ensaio na cópia do banco; refazer medições em Postgres [B]. 3.3 espera 3.1                                |
| 3.3 | `leitura-ativa-com-moonshine`                  | M     | A     | Depois de 2.5. Flag `leitura_voz_local`. 10 a 20 brasileiros [D][R][B]                                                   |
| 3.4 | `cartao-com-audio-do-trecho`                   | M     | A     | Flag `cartao_com_audio`. ROPA e `exclusao-e-exportacao-completas` [D]. Bitrate por escuta cega [B]. Cria o armazém local |
| 3.5 | `traducao-local-por-direcao`                   | M a G | M     | Depois de 2.1. Licença par a par [D]. Teste cego pt-BR adiado. Bancada `mt.mjs` [B]                                      |
| 3.6 | `interprete-conversa-virtual` (fecha a Fase 4) | P     | M     | Depois de 1.4 e 2.3. Fase 5 adiada [D]. Reserva `PaginaDoInterprete.tsx` e `planos.ts`                                   |

## Onda 4. Depois do polimento e do armazém

| #   | Change                                | Esf.            | Valor | Marcas / observações                                                                                                                   |
| --- | ------------------------------------- | --------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | `tela-de-jogos-v2`                    | M               | M     | Depois de 3.1. Fechar 5.2, 4.7, 2.6b; arquivar 2.8, 2.9, 2.10 como absorvidas. Coreano fora                                            |
| 4.2 | `audiolivros`                         | G (M no piloto) | A     | Piloto de 3 livros na ortografia do leitor. Parecer OpenRAIL-M e buckets [D]. Escuta cega [B]. Reserva `src/lib/leitor/`               |
| 4.3 | `diario-com-correcao-que-vira-cartao` | G               | A     | Flag `diario`. Bancada de qualidade 1.1/1.2 [B], custo declarado. Menores só após `filtro-tutor-menores` 4.3/4.4 [D]                   |
| 4.4 | `navegacao-mais-simples`              | G               | A     | Depois de 3.1 e 4.1 e de `cartoes` 9.x. Medição Playwright, protótipo, teste com 5 pessoas [D][B]; fatias atrás de `navegacao_simples` |
| 4.5 | `cartao-com-captura-de-tela`          | M               | M-B   | Depois de 3.4. Só se o dono quiser a função [D]. Fora do perfil protegido na v1                                                        |

## Onda 5. Fecho

| #   | Item                                        | Observações                                                                                             |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 5.1 | `formatacao-e-lint-estrito` (passada geral) | Por último, com `.git-blame-ignore-revs`. Se `estrutura-por-dominio-proposta` for aprovada, depois dela |
| 5.2 | Incertas decididas                          | Executar o que as decisões 20 a 29 mandarem (arquivar, abandonar ou abrir change)                       |
| 5.3 | Publicação única em produção                | Staging verde, portões de CI, flags desligadas, deploy manual com OK do dono                            |

## Andamento das ondas e o que resta para a publicação

Atualizado em 25/11/2026. Staging recebeu cada onda; produção não mudou.

| Onda | Entrega                                                                                                                                                                                                                                                                                                             | Estado                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | PR #208 (`36dad2f4`): filtro do tutor e porta de entrada, tradução sem rota no celular, voz Kitten, status da palavra, repetir e pausar por frase, motor Anki de jogos, roteador em sombra, lint e modo offline                                                                                                     | Mergeada. Pendências [D]/[R]/[B] em `pendencias-do-dono`                                         |
| 2    | PR #209 (`4f14a128`): modelos confiáveis e offline, cartões bloco 2, fechamento de planos v3, mapeador Anki, sombra sem Web Speech, latência publicada, conferência do avatar                                                                                                                                       | Mergeada                                                                                         |
| 3    | PR #210 (`34be215b`): polimento de movimento, modelo do aluno (chave de duplicata, flag `chave_dedup_v2`), leitura ativa com Moonshine, cartão com áudio do trecho, tradução local por direção, intérprete conversa virtual (Fase 4)                                                                                | Mergeada                                                                                         |
| 4    | PR #211 (`a05e9387`): tela de jogos v2, audiolivros (piloto), diário com correção que vira cartão, cartão com captura de tela, privacidade do áudio do cartão. PR #212: dados locais por conta                                                                                                                      | Mergeada. **`navegacao-mais-simples` (4.4) NÃO começou**: espera a decisão 1.3/2.4 e o protótipo |
| 5    | 5.3 (do modelo do aluno): reescrita de `palavras_marcadas` e `palavras_vistas` junto com `norm_key`; arquivadas `modo-offline-declarado`, `tela-de-jogos-v2`, `filtro-tutor-menores`, `latencia-publicada-por-aparelho`, `porta-de-entrada`, `pre-traducao-de-legendas`, `planos-v3-e-rota-inteligente`; este plano | Em curso. 5.1 (passada geral do Prettier) e 5.2 (incertas) abertas                               |

### O que resta para a publicação única

1. **Dev ainda aberto**
   - `navegacao-mais-simples` (4.4): só depois de decidir 1.3/2.4 e aprovar o protótipo.
   - `modelo-do-aluno-e-dados` 5.4: chave v2 no cliente (leitor, legenda, `useConhecimento`) e na edição estática. **Bloqueia ligar `chave_dedup_v2`**: sem ela, a palavra marcada com acento em es/pt/de/fr não casa na tela.
   - `leitura-ativa-com-moonshine` 1.2 (simulação offline), `motor-anki-jogos` e `motor-anki-mapeador` (tarefas de dev restantes), `polimento-movimento` (1.10 e outras), `status-da-palavra-na-legenda` 3.1/3.2, `sombra-sem-web-speech` 4.1, `formatacao-e-lint-estrito` 1.8 e a passada geral (5.1).
   - Ondas 5.2: executar o que as decisões 20 a 29 mandarem para as 10 incertas.
2. **Sessão de bancada única [B]** (depois da Onda 4, máquina sozinha): roteador 4.1 a 4.3, sombra e leitura com Moonshine (régua de atraso), `traducao-local-por-direcao` (`mt.mjs`), Kitten e áudio do trecho (escuta cega), diário 1.1/1.2, audiolivros, e a ida e volta da chave de duplicata em Postgres real. Ordem na seção "Janela de bancada".
3. **Atos do dono [D]** (lista única em `docs/pendencias-do-dono.md`, Partes 1 a 5, e `docs/backlog/decisoes-do-dono.md`): publicar no R2 (decisão 3), parecer de privacidade (5), pedido jurídico único (6), tokens e segredos, parecer OpenRAIL-M, escolha de modelos e tetos.
4. **Aparelho real [R]**: celular bom e fraco, Safari/iPhone, Quest 3, rodada com 10 a 20 brasileiros.
5. **Migrações a aplicar em produção** (com backup e ensaio, no deploy único): PG 0034 a 0043 e SQLite 0074 a 0082 (as das ondas, já renumeradas; conferir também qualquer anterior que a produção ainda não tenha, como a 0028 de `pendencias-do-dono`), e a reescrita de chaves (`operacao.cjs chave-de-duplicata`) só junto com a flag `chave_dedup_v2` e depois da 5.4.
6. **Fechamento**: staging verde, portões de CI, todas as flags novas desligadas, deploy manual com OK do dono (5.3).

## Janela de bancada (máquina sozinha, tampa aberta e `caffeinate`)

Uma bancada por vez, sem outras ondas rodando testes pesados. Método rápido: réguas escritas antes, simular offline, triagem curta, só a finalista na medição longa, pré-voo antes de rodadas demoradas.

1. `roteador-adaptativo-em-sombra` 4.1 a 4.3 e 5.x (depois da 1.3).
2. `sombra-sem-web-speech` e `leitura-ativa-com-moonshine` (régua de atraso e nota).
3. `traducao-local-por-direcao` (`mt.mjs`) e `traducao-sem-rota-no-celular` 5.2/5.3 [R].
4. `voz-natural-no-aparelho-kitten` 5.2 [R] e `cartao-com-audio-do-trecho` (escuta cega).
5. `diario-com-correcao-que-vira-cartao` 1.1/1.2 e `audiolivros` (escuta).
6. `ia-por-custo` bancada completa, se a decisão 20 mandar rodar.

Leves, fora da janela: simulação do mapa de `status-da-palavra-na-legenda`, lotes sintéticos de `latencia-publicada-por-aparelho`, medição Playwright de `navegacao-mais-simples`.

## Pronto atrás de flag versus bloqueado

| Situação                         | Changes                                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desenvolver e deixar desligada   | `forca_na_legenda`, `frase_por_frase`, `sombra_local`, `leitura_voz_local`, `latencia_publicada`, `cartao_com_audio`, `cartao_com_cena`, `diario`, `navegacao_simples`, `voz_kitten`, flags de `audiolivros` e `avatar-interprete`       |
| Bloqueada até decisão do dono    | `traducao-local-por-direcao` (licença), `audiolivros` (parecer), `interprete-conversa-virtual` Fase 5, `diario` para menores, `cartao-com-captura-de-tela` (se existe), rota inteligente (precisa do roteador medido), todas as incertas |
| Só pacote de decisão, sem código | `ao-vivo-streaming-de-terceiro`                                                                                                                                                                                                          |

## Riscos a acompanhar

- Privacidade: `SombraDaFala` chama `SpeechRecognition` sem a régua `rapidoDoMicPermitido`; no Chrome pode enviar áudio ao fabricante, inclusive no perfil protegido. Change de conformidade antes de `sombra-sem-web-speech` (decisão 12). Não corrigido na preparação.
- Acessibilidade a confirmar: o app ignora `prefers-reduced-motion` com animações ligadas (tarefa 8.5 do polimento).
- `traduzirNoNivel` não passa pelo filtro de menores, por decisão (tradução de terceiros); a 4.5 do filtro prende o limite com lista de exceções.
- Medições antigas de `modelo-do-aluno-e-dados` (43,2 MB, 533 ms) eram de SQLite; a produção é Postgres. Refazer antes de agir.
