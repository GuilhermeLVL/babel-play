# Runbook: avatares (intérprete, PiP e livros)

Spec: `docs/specs/2026-10-28-avatar-interprete.md`. Change: `openspec/changes/avatar-interprete/`. Nada aqui é parecer jurídico.
Produção segue FECHADA: ligar flag, publicar no R2 e definir variável de build são atos do dono (decisão 34 de
`docs/backlog/decisoes-do-dono.md`: ligar só no id do dono no staging, depois de publicar a coleção).

## 1. Flags (nascem desligadas)

| Flag            | Liga o quê                                                                  | Exige antes                                                           |
| --------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `avatar_3d`     | Avatar da pessoa, do intérprete e do PiP (3D sob demanda, fallback 2D)      | Coleção no R2 e `VITE_AVATARES_URL` no build (ou coleção no `dist`)   |
| `avatar_elenco` | Narrador e personagens nos livros (falante, emoção, painel do elenco)       | `avatar_3d` ligada; frentes de Livros                                 |
| `avatar_sinais` | Soletração de nomes e palavras sem sinal, sempre rotulada como demonstração | `avatar_3d` ligada; revisão por pessoas surdas e parecer (tarefa 8.2) |

Migração PG `0016` semeia as três desligadas, sem regra de plano. Constantes `FLAG_AVATAR_*` em `src/core/planos.ts`; linhas em
`docs/flags.md`. Avatar é recurso livre: **não ponha regra `planos`**.

**`avatar_sinais` fica DESLIGADA.** As poses são demonstração, nunca "tradução para Libras". Só liga depois da revisão por
pessoas surdas e do parecer (ver `docs/pesquisa/2026-10-28-avatar-sinais-qualidade.md`).

## 2. Ordem de ligação (staging, só no id do dono)

1. Publicar a coleção (seção 3) e definir `VITE_AVATARES_URL` no build do staging (seção 4).
2. Ligar `avatar_3d` para o id do dono (`percentual: 0`, `ids: [<id do dono>]`).
3. Percorrer a checklist da seção 5.
4. Só depois, `avatar_elenco` (mesmo id). Por último, e só com revisão e parecer, `avatar_sinais`.

Ligar para um id:

```sh
node dist-server/operacao.cjs flags definir avatar_3d '{"habilitada":true,"regras":{"ids":["<id do dono>"],"percentual":0}}'
node dist-server/operacao.cjs flags listar
```

Sem coleção no R2 e sem `VITE_AVATARES_URL`, a coleção sai do próprio domínio (`/avatares/colecao/<id>.vrm`, já no `dist`): isso
funciona, mas pesa 9,3 MiB no deploy; o bucket é o caminho previsto.

## 3. Coleção curada no R2

Seis arquivos CC0 (100Avatars R1/R2, Polygonal Mind) em `public/avatares/colecao/`, registrados com SHA-256 em
`public/avatares/colecao/LICENSES.md`. Chave no bucket: `colecao/<id>.vrm` (o app monta `<VITE_AVATARES_URL>/colecao/<id>.vrm`).

1. **[D]** Criar o bucket (sugestão `frasy-avatares-staging`) e dar acesso público de leitura (domínio próprio ou r2.dev), com
   CORS de `GET`/`HEAD` para as origens do app (as mesmas de `scripts/cloudflare/r2.mjs`; o navegador busca de outra origem).
2. Conferir sem enviar nada:
   `npx tsx scripts/avatar/publicar-colecao-no-r2.ts --bucket=frasy-avatares-staging`
   (confere SHA-256 e tamanho contra o `LICENSES.md` e contra o catálogo; qualquer divergência recusa).
3. **[D]** Enviar: com `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no ambiente, o mesmo comando com `--publicar`.
4. Conferir o acesso: `curl -sI https://<domínio do bucket>/colecao/milk.vrm` deve dar 200, `content-length: 1338344` e
   `access-control-allow-origin` para a origem do app.

Ordem obrigatória: publicar, conferir, só então definir a variável.

## 4. Variável de build e CSP

- `VITE_AVATARES_URL` = raiz pública do bucket, sem barra final (variável de Actions `VITE_AVATARES_URL`, lida pelo
  `deploy-worker.yml`). A CSP abre `connect-src` para essa origem sozinha (`server/http/csp.ts`); o arquivo é dado e nunca entra em
  `script-src` nem `worker-src`. Teste: `npx vitest run tests/seguranca/csp-estreita.test.ts`.
- `AVATAR_GALERIA_TERCEIROS=1` abre a galeria ao vivo (GitHub e Arweave): deixe FORA no staging até haver decisão; ela é opt-in
  da pessoa e fechada para perfil protegido.

## 5. Checklist de staging (preencher com data, aparelho e navegador)

Com `avatar_3d` ligada só para o id do dono:

- [ ] Ajustes > Avatar: escolher da coleção, personalizar, salvar, apagar (volta a foto ou iniciais).
- [ ] Aba de rede: os `.vrm` vêm do domínio do bucket, nenhum de terceiros.
- [ ] Intérprete: avatar por lado, fala e movimento; modo economia.
- [ ] PiP (documento, vídeo, painel) no Safari real, Firefox e celular real (tarefa 4.6).
- [ ] Perfil protegido (menor): só a coleção, sem importar, sem galeria, sem requisição a terceiros.
- [ ] Sem WebGL: fallback foto/iniciais, sem erro no console.
- [ ] Flags continuam desligadas em produção (`flags listar` lá).

Guardar o resultado em `docs/pesquisa/AAAA-MM-DD-avatar-staging.md`.

## 6. Reverter

Da mais rápida para a mais lenta:

1. Desligar a flag (sem deploy): `node dist-server/operacao.cjs flags desligar avatar_3d`. O app volta a foto/iniciais; o
   Intérprete e os livros voltam ao que eram antes. `avatar_elenco` e `avatar_sinais` exigem `avatar_3d` (`docs/flags.md`);
   desligue-as também, para não ficar flag ligada sem a base.
2. Coleção com problema: apagar ou trocar o objeto no bucket (caminho imutável por arquivo; troque o id no catálogo, não o
   conteúdo do mesmo caminho).
3. Variável errada: redefinir `VITE_AVATARES_URL` e refazer o deploy do staging; vazia, o app usa o próprio domínio.

Dados da pessoa: o avatar e o arquivo "traga o seu" ficam só no IndexedDB `frasy-avatar` do aparelho (nunca no servidor);
nada a migrar nem a limpar no servidor ao reverter.

## 7. Antes de ligar para mais gente

- Parecer jurídico (Quaternius, `meta` de terceiros, menores) e revisão por pessoas surdas: tarefa 8.2 da change.
- Microcopy com `copy-br-etica` e rodada do juiz (tarefa 7.5).
- Eixo e11y: `npx playwright test tests/e2e/avatar-a11y.e2e.ts`; reproduzir antes o caso da linha 168 citado no plano.
