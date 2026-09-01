## 1. Parser expõe o que a decisão precisa

- [ ] 1.1 `estruturaHash` — sha256 dos nomes normalizados + ordem (16 hex). Normalizar: minúsculas,
      sem acento, separadores (espaço/hífen/underscore/CamelCase) colapsados
- [ ] 1.2 Nome do tipo de nota (`notetypes.name`, fallback `col.models[mid].name`) e nome do baralho
      (`decks`, fallback `col.decks`; hierarquia `::`)
- [ ] 1.3 Confiança por papel: `alta` (igualdade em padrão prioritário) · `media` ("contém", ou
      perfil salvo) · `baixa` (posicional, ou desempate por conteúdo)
- [ ] 1.4 Desambiguação de `Expression` por amostra de conteúdo (comprimento médio + presença de
      espaço em N notas) — nenhuma lista de nomes resolve isso
- [ ] 1.5 Detecção de mídia em QUALQUER campo (a marcação de som não mora só em campo chamado Audio)

## 2. Priors como dado

- [ ] 2.1 `server/import/priorsDeCampos.json` — nomes por papel, do levantamento do G0 (palavra,
      leitura, significado, frase, tradução da frase, áudio da palavra, áudio da frase, imagem,
      cloze, metadados)
- [ ] 2.2 `indicePorNome` passa a ler os priors do JSON, mantendo a ordem de prioridade e a regra
      "igualdade antes de contém" (pagas com teste: `Word` vence `Front`; `Sound_Meaning` não vence `Meaning`)
- [ ] 2.3 Teste: os arquétipos catalogados (Kaishi, Core, subs2srs/mpvacious, HSK, Basic, 4000EW)
      mapeiam corretamente com os priors

## 3. Perfis de mapeamento

- [ ] 3.1 Tabela `anki_perfis_de_mapeamento` — user_id, `estrutura_hash`, papéis→índices, nome do
      tipo de nota, criado/atualizado; único `(user_id, estrutura_hash)`
- [ ] 3.2 Aplicar perfil salvo na leitura; marcar o palpite como confiança `media` e dizer na tela
      que veio de perfil
- [ ] 3.3 Salvar/atualizar perfil quando o usuário confirma um mapeamento
- [ ] 3.4 Teste: mesma estrutura ⇒ aplica; mesma lista de nomes em ordem diferente ⇒ NÃO aplica

## 4. Reprocessamento sem reimportar

- [ ] 4.1 `POST /api/anki/decks/:id/remapear` — recalcula frente/verso/exemplo de `campos_brutos`
- [ ] 4.2 Nota que passa a ser jogável perde o `motivo_descarte`; nota que deixa de ser, ganha
- [ ] 4.3 Não toca em SRS, nem em `projected_card_id` de nota já ativada (só atualiza o texto do
      cartão pelo caminho de "preenche buraco sem sobrescrever o que já é bom")
- [ ] 4.4 Teste: corrigir mapeamento de baralho importado muda as notas sem novo upload

## 5. Tela do Mapeador

- [ ] 5.1 Componente novo: campos reais do baralho × papel atribuído, com amostra ao vivo das 3
      primeiras notas
- [ ] 5.2 Trocar papel recalcula a amostra na hora, antes de gravar
- [ ] 5.3 Campos sem papel ficam listados com seu conteúdo — nada some da tela
- [ ] 5.4 Confiança baixa em palavra/significado **abre o Mapeador antes de gravar** (o 4000EW
      falhou em silêncio; isso não pode repetir)
- [ ] 5.5 Estados: carregando, erro, e o caso "baralho de dois campos sem nome" (não deve estorvar —
      é o caso mais comum e já funciona)
- [ ] 5.6 Ícones lucide, sem emoji; segue o padrão visual de `BaralhoAnki.tsx`
- [ ] 5.7 Verificar no navegador (porta 3100, servidor reiniciado — `server/` não tem watch)
