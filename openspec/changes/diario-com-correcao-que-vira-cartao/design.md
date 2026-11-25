## Abordagem escolhida

**Reaproveitar o núcleo da escrita, trocar a "ficha do acervo" pelo perfil da pessoa, e fazer a ponte para o cartão no cliente.**

1. **Servidor**: `FUNCOES_DE_IA.diario` (entrada 1.600 caracteres, `maxTokens` 500, temperatura 0,2) e `POST /api/ai/diario`
   como adaptador fino de `pedirRetornoDoDiario`, que chama o mesmo caminho de `escrita.ts` (flag, dados pessoais, plano,
   cota, menor, retenção zero, portão, admissão, cascata) com `SAIDA_DA_ESCRITA` e a mesma leitura defensiva
   (`lerRetornoDaEscrita`). O pedido traz `idioma` (en|es), `nivel` (A1 a B1 do perfil; o servidor limita ao que a bancada
   cobre) e `escrita`; nada de `system` vindo do cliente.
2. **Cliente**: `src/lib/diario/` com o editor, o histórico no IndexedDB, o detector de sinais de risco
   (`src/core/diario/sinaisDeRisco.ts`, puro, listas pequenas e comentadas, no molde de `listasParaMenores.ts`) e a conversão
   `pontoParaCartao(ponto, idioma)` (pura, testável): lacuna com `makeCloze` sobre o `trecho`, verso com `exemplo` e `dica`.
3. **Cartão**: entra por `bulkAddCards` com `origem: 'diario'`, etiqueta "do diário" e dedup por `normKey`. Nenhum campo novo
   em `vocab_cards`.
4. **Segurança de menores como portão, não como enfeite**: a flag e a regra de idade ficam no servidor (`ehMenor`), o detector
   de risco roda antes do envio, o moderador de saída roda antes da resposta; o cliente adulterado cai nos 403 e 422 do núcleo.

## Alternativa descartada

**Estender a Leitura ativa (`/leitura`) com um "texto livre"**, sem tela nova. Menor trabalho, mas (a) a Leitura ativa tem
flag e público próprios (microfone para menores, sensível no painel), então ligar o diário ligaria tudo junto; (b) a ficha de
texto fixa o nível e o idioma (inglês) e o diário precisa do perfil da pessoa; (c) o diário precisa de histórico, prompt do dia
e ponte para o cartão, que não pertencem a uma tela de leitura. Foi descartada por acoplamento, mas o NÚCLEO é compartilhado.

## Método rápido (skill ciclo-rapido)

A qualidade da correção é a premissa de maior risco; mede-se antes de construir tela.

1. **Simular antes**: golden set de 40 entradas (20 com erros plantados, 10 sem erro, 5 com dado pessoal, 5 com sinal de risco)
   em inglês e espanhol, escritas por nós, em `tests/fixtures/diario/`. Roda local, sem rede, contra o validador defensivo e o
   detector de risco, e já aponta bugs de esquema e de falso positivo do filtro.
2. **Triagem curta**: os modelos elegíveis de `ops/ia-provedores*.json` (todos `zdr`) sobre as 40 entradas, 1 passada, juiz
   por `claude -p` (nunca crédito de API; no máximo 3 em paralelo). Corta o que tiver `trecho` ausente do texto em > 5% ou
   corrigir texto certo em > 10%. Parada antecipada: se o mais barato passa nos dois cortes, não testa os caros.
3. **Só a finalista na bancada completa** (3 repetições, 40 entradas, custo por retorno medido com `npm run ia:custo`) e, depois,
   no staging com o id do dono. Pré-voo: o script confere flag, retenção e orçamento antes de gastar.
