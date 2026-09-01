## 1. O Crédito ganha destino

- [x] 1.1 `precoCreditos?: number` em `ItemDaLoja` (`src/core/loja.ts`) e a autorização de gasto em
      Créditos em `core/economiaAutoridade.ts` (`autorizarGastoDeCredito`), no molde do de Seeds
- [x] 1.2 `POST /api/billing/gastar`: motivo validado, preço do catálogo, saldo conferido → 402 com
      quanto falta. Chama `creditsRepo.debitar`, que já existe e nunca foi chamado
- [x] 1.3 `gastarCreditos()` no cliente (`src/data/api.ts`), no molde de `gastarSeeds`
- [x] 1.4 Posse de item premium derivada do log (`credit_spends.reason LIKE 'premium:%'`), como a
      da Loja já é

## 2. A origem "Créditos" deixa de ser rótulo vazio

- [x] 2.1 `origemDoItem` passa a devolver `'creditos'` para o que foi comprado com Créditos
- [x] 2.2 A Loja ganha a prateleira paga, separada da de Seeds
- [x] 2.3 O cartão mostra o preço na moeda certa (o ícone de Crédito, não o de Seed)

## 3. O Passe entrega o que promete

- [x] 3.1 Itens "Variante Dourada N" entram no catálogo como exclusivos do passe (`exclusivoDePasse`),
      no molde de `exclusivoDe`
- [x] 3.2 `POST /api/billing/creditar-passe`: credita os Créditos das casas alcançadas, idempotente
      por `passe:<temporada>:premium-<n>`, e só para quem tem o passe
- [x] 3.3 A fileira premium do `PasseDeTemporada` vira interativa para quem tem o passe
- [x] 3.4 Sem o passe, nada é creditado e a casa continua sendo vitrine honesta

## 4. O gate que só existia no cliente

- [x] 4.1 `youtubeImport` conferido em `server/routes/import.ts` → 402, como `managedCloudStt` já faz

## 5. Testes

- [x] 5.1 Gasto de Crédito: preço do catálogo, saldo insuficiente → 402, motivo desconhecido → 400,
      reenvio idempotente
- [x] 5.2 Passe: casa creditada uma vez com passe; nada sem passe; variante dourada existe no catálogo
- [ ] 5.3 Import do YouTube sem plano → 402 no servidor — o gate ESTÁ no código
      (`server/routes/import.ts`, fail-closed como o da nuvem gerenciada), mas o teste ainda não
      existe: a rota depende de `yt-dlp` e de rede, e o harness atual não a cobre
- [x] 5.4 Os testes atuais continuam passando

## 6. Verificação

- [x] 6.1 `npx vitest run` · `npm run typecheck` · `npm run lint` · `npm run audit:gate` ·
      `npx ast-grep scan -c sgconfig.yml src server server.ts`
- [ ] 6.2 Navegador: a prateleira paga aparece, o item premium equipa, e a fileira do passe credita
