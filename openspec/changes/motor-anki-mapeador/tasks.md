> Revisão de 25/11/2026 (main `897c9d25`). O texto original (07/09) assumia o parser no servidor (`server/import/anki.ts`, `/api/anki/decks/:id/remapear`). Isso não existe mais:
> desde 20/10 o `.apkg` é lido no NAVEGADOR (`src/lib/anki/leitorDeApkg.worker.ts`, `lerApkg.ts`; função pura `montarNota` em `src/core/anki/mapeamento.ts`), e o servidor só recebe
> notas em lotes (`server/routes/ankiImports.ts`: abrir, notas, fechar), reaplica limpeza, identidade e régua de qualidade, e grava `anki_notes.estrutura_hash`, `notetype` e
> `campos_brutos` (JSON `{campos, midia, lacunas}`). As tarefas abaixo foram reescritas para esse desenho. **[D]** = depende do dono; **[R]** = navegador ou aparelho real.
> O Mapeador roda no cliente, ANTES de enviar o primeiro lote; o servidor continua não confiando no cliente.

## 0. Decisão

- [ ] 0.1 **[D]** Confirmar a prioridade (ver "Revisão de 25/11/2026" no proposal). Sem o sim, nada abaixo começa. Verificar: decisão registrada no proposal com data
- [ ] 0.2 **[D]** Onde guardar o perfil de mapeamento: só no aparelho, na conta, ou nos dois (ver decisão 2 do proposal). Verificar: decisão registrada; muda só o bloco 3

## 1. O que já existe (reconciliado com o código)

- [x] 1.1 `estruturaHash` (sha256 dos nomes normalizados em ordem, 16 hex). Feito no servidor: `server/import/identidadeDaNota.ts:hashDaEstrutura`, gravado por `ankiImports.ts`. Prova: `tests/ankiMidia.test.ts` ("nota ganha `estruturaHash`") e `tests/integration/anki-importacao-em-lotes.test.ts`. Falta o hash no cliente (ver 3.1)
- [x] 1.2 Nome do tipo de nota e do baralho: `NotaAnki.notetype`, `NotaAnki.baralho`, `NotaAnki.campos` (`src/core/anki/tipos.ts`, `montarNota`). Verificar: `npx vitest run tests/anki-leitor.test.ts`
- [x] 1.5 Mídia em qualquer campo: `montarNota` varre todos os campos com `extrairMidia` antes de limpar. Verificar: `npx vitest run tests/ankiMidia.test.ts`
- [x] 1.6 Mapeamento por nome (`indicePorNome`, igualdade antes de "contém", `Word` vence `Front`, `Sound_Meaning` não vence `Meaning`) e `campos_brutos` guardado para remapear. Verificar: `npx vitest run tests/importAnkiCampos.test.ts`
- [x] 1.7 Tela mostra "Como os campos foram lidos" DEPOIS da importação (`BaralhoAnki.tsx`, bloco `resultado.campos`), sem poder trocar. É o ponto de partida do Mapeador

## 2. Confiança e priors no núcleo (`src/core/anki/`)

- [ ] 2.1 `confianca` por papel (`alta`: igualdade em padrão prioritário; `media`: "contém" ou perfil salvo; `baixa`: posicional ou desempate por conteúdo). Nota 25/11: a tarefa 1.3 antiga estava marcada `[x]` por engano; não há confiança no código (`grep confianca src/core/anki` vazio). Verificar: `npx vitest run tests/anki-mapeamento-confianca.test.ts` com os casos `Word`/`Meaning` (alta), `№`/`IMG` (baixa) e dois campos sem nome (baixa, mas não bloqueia)
- [ ] 2.2 Desambiguar `Expression` por amostra (comprimento médio e presença de espaço em N notas), com confiança `baixa`. Verificar: teste com um deck de vocabulário (curto, sem espaço: palavra) e um de mineração (longo, com espaços: frase)
- [ ] 2.3 Priors como dado: `src/core/anki/priorsDeCampos.json` (nomes por papel do levantamento G0), lido por `indicePorNome` mantendo a ordem de prioridade. Verificar: `npx vitest run tests/importAnkiCampos.test.ts` continua verde e os arquétipos (Kaishi, Core, subs2srs/mpvacious, HSK, Basic, 4000EW) mapeiam certo
- [ ] 2.4 Unificar o vocabulário de papéis com `PapelDoCampo` de `paraAnkiConnect.ts` (hoje só exportação): palavra, significado, frase, leitura, áudio, imagem, nenhum. Verificar: `npm run typecheck` e `npx vitest run tests/anki-connect-mapeamento.test.ts`
- [ ] 2.5 `montarNota` aceita um mapeamento explícito (nome do campo para papel) que vence o automático. Verificar: caso 4000EW com mapeamento manual `Word`/`Meaning` gera as 3.871 notas

## 3. Perfis de mapeamento (decisão de onde guardar em 0.2)

- [ ] 3.1 Hash da estrutura no cliente (WebCrypto ou função pura equivalente) com o MESMO resultado de `hashDaEstrutura`. Verificar: teste que compara os dois com 20 listas de campos, inclusive acentos, `Word Audio`/`Word_Audio`/`WordAudio` e ordem trocada
- [ ] 3.2 Guardar o perfil confirmado POR APARELHO (IndexedDB ou `localStorage` com `try/catch`, só nomes de campo e papéis, nenhum conteúdo de nota), chaveado por `estruturaHash`; aplicado com confiança `media`. Verificar: mesma estrutura aplica; mesmos nomes em ordem diferente NÃO aplica; apagar dados do navegador volta ao automático
- [ ] 3.3 **[D]** Perfil também na conta (tabela `anki_perfis_de_mapeamento`, migração PG nova, só EXPAND, por `user_id`) para seguir a pessoa entre aparelhos. Só se 0.2 pedir. Verificar: `npx vitest run tests/integration/schema-pg-baseline.test.ts` e teste de isolamento entre usuários; entra na exportação e na exclusão da conta

## 4. Tela do Mapeador (no navegador, antes de gravar)

- [ ] 4.1 Separar `importarBaralhoAnki` em duas fases: ler (worker) e enviar (lotes), com um passo de confirmação entre elas só quando a confiança de palavra ou significado é `baixa`. Depende de `cartoes` 7.2 ("ler sem gravar"). Verificar: `npx vitest run tests/baralhoAnkiImport.test.tsx tests/importarAnki-lotes.test.ts` e que baralho de dois campos sem nome continua importando sem parada
- [ ] 4.2 Componente do Mapeador: campos reais x papel, amostra das 3 primeiras notas, troca recalcula a amostra na hora, campos sem papel listados com conteúdo. Verificar: teste de componente (troca de papel muda a amostra; nenhum campo some) e conferência no navegador **[R]** com o 4000EW (`№`, `IMG`)
- [ ] 4.3 Confiança baixa em palavra ou significado abre o Mapeador antes de enviar o primeiro lote. Verificar: e2e com um `.apkg` sintético de campos `№`/`IMG` (o servidor não recebe lote antes da confirmação)
- [ ] 4.4 Perfil aplicado: a tela diz "mapeamento reconhecido de um baralho anterior" e permite desfazer. Verificar: teste de componente
- [ ] 4.5 Textos em `public/i18n/{en,es,ar}.json` seguindo as regras de i18n e `copy-br-etica` (sem culpa nem pressa), ícones lucide, estados de carregando e erro. Verificar: `npm run i18n` sem diferença e `npm run i18n:orfas` limpo

## 5. Remapear sem reimportar

- [ ] 5.1 `POST /api/anki/decks/:id/remapear`: recalcula frente, verso e exemplo de `campos_brutos` com a função pura do núcleo, reaplicando a régua de qualidade do servidor. Verificar: `npx vitest run tests/integration/anki-remapear.test.ts` (nota descartada que passa a servir perde `motivo_descarte`; a que deixa de servir ganha)
- [ ] 5.2 Não toca em SRS nem em `projected_card_id` de nota ativada; só o texto, pelo caminho "preenche buraco sem sobrescrever o que já é bom". Verificar: teste com cartão ativado e revisado, FSRS intacto
- [ ] 5.3 Rota nova exige caracterização (`rotas-sem-caracterizacao`) e validação Zod; limite por usuário. Verificar: `npx vitest run tests/caracterizacao` sem rota solta
- [ ] 5.4 Botão "Corrigir campos" na lista de baralhos abre o Mapeador com os campos reais e chama a rota. Verificar: e2e (corrige, o relatório diz quantas notas mudaram)
