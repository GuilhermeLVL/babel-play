# Coleção curada de avatares do Frasy

Estes arquivos VÃO para o `dist` (`public/avatares/colecao/`) e são servidos de `/avatares/colecao/<id>.vrm`. A
alternativa é hospedá-los num bucket (R2/CDN) e apontar `VITE_AVATARES_URL` para a raiz dele; o catálogo
(`src/data/avatar/colecao.ts`, `src/lib/avatar/fontes.ts`) resolve a URL por `VITE_AVATARES_URL` quando definida
(`<base>/colecao/<id>.vrm`) e, senão, por `/avatares/colecao/<id>.vrm`. Isto NÃO é parecer jurídico.

## Origem e licença

Os seis são da coleção **100Avatars** (R1 e R2), de **Polygonal Mind**, publicados em
[ToxSam/open-source-avatars](https://github.com/ToxSam/open-source-avatars) (registro `data/projects.json`:
`"license": "CC0"` nos projetos `100avatars-r1` e `100avatars-r2`). Licença:
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (domínio público, sem exigência de
crédito; o Frasy credita mesmo assim). Checado em 2026-10-28 (registro e `meta` do próprio arquivo).

A regra da coleção: só entra o que concorda em CC0 nas DUAS camadas (registro e `meta` do VRM). Os `meta` dizem
`Allow` para uso sexual, violento e comercial (padrão do exportador): por isso o Frasy só os trata como seguros
para menores por serem da coleção curada por nós (`avaliarLicenca(meta, 'menor', 'colecao')`), nunca como arquivo
importado.

Todos: `licenseName="CC0"`, `allowedUserName="Everyone"`, `violentUssageName="Allow"`,
`sexualUssageName="Allow"`, `commercialUssageName="Allow"`. Um material só, uma textura de 1024x1024 "assada"
(nomes `mat_NN`): pele, cabelo e olhos não se recolorem (`suporta` todo `false`).

| Arquivo                         | Modelo (nº no registro) | Autor (`meta.author`)   | Fonte                          | Tamanho (bytes) | SHA-256                                                            |
| ------------------------------- | ----------------------- | ----------------------- | ------------------------------ | --------------- | ------------------------------------------------------------------ |
| `milk.vrm`                      | Milk (R1 #084)          | Polygonal Mind          | 100Avatars R1, ToxSam registro | 1338344         | `99e32f15d529eb47b3892aa44d5f053c07dabf55a0851aca7e7ab74f5f17e107` |
| `bullidan.vrm`                  | Bullidan (R1 #028)      | Polygonal Mind          | 100Avatars R1, ToxSam registro | 1485492         | `e3b07256b73a3f537b9fffb1448b03ff2b6552167b4264962b2e95d1030c7078` |
| `100avatars-r1-devil.vrm`       | Devil (R1 #031)         | Polygonal Mind          | 100Avatars R1, ToxSam registro | 1393048         | `2e428dd1846504a77f3936259f489a899cc92aa6179b769a1aee230f875a9b4d` |
| `100avatars-r1-dinokid.vrm`     | DinoKid (R1 #045)       | PolygonalMind (no meta) | 100Avatars R1, ToxSam registro | 1730484         | `ec7770601b1e060e5710e5e7bfb3c597d395fffc90e3c60ef32fcd60f85afc48` |
| `100avatars-r2-coolbunny.vrm`   | CoolBunny (R2 #179)     | Polygonal Mind          | 100Avatars R2, ToxSam registro | 1462760         | `abb2b2703df658cd21b9bced08de0b2c6867eb11daae94688d77e0fc8e00bf3d` |
| `100avatars-r2-coolhydrant.vrm` | CoolHydrant (R2 #139)   | Polygonal Mind          | 100Avatars R2, ToxSam registro | 2361752         | `5a008f9756877a85cbd913bc27a5ffba981585e93f98806246d11a6b5c7408fb` |

Total: 9.771.880 bytes (9,3 MiB) no `dist`. Os arquivos vieram do ramo local `proto/avatar-libras-b1-colecao`
(`docs/prototipos/avatar-libras/colecao/`), baixados do Arweave indicado em `colecao.json` de lá; o SHA-256 acima
é o dos arquivos como estão aqui (o teste `tests/avatar-enquadramento.test.ts` confere cada um).

Crédito mostrado onde o avatar aparece: `<Modelo> (100Avatars R1|R2, nº NNN), Polygonal Mind, CC0 1.0`.

## Como o catálogo usa

- `camera` e `medidas` (corpo inteiro e rosto) de cada modelo foram lidas do próprio `.vrm` por
  `scripts/avatar/calibrar-colecao.ts` e conferidas a olho com `scripts/avatar/capturar-colecao.ts`.
- Só os modelos que passam no teste de enquadramento são sorteados em "Sugerido para você" e "Escolher para mim".

## Hospedar no R2 (opcional)

1. Suba os `.vrm` para `colecao/<id>.vrm` num bucket com CORS liberando a origem do app (só `GET`).
2. Defina `VITE_AVATARES_URL=https://<bucket-publico>` no build (`.env.production`, variável do deploy). A CSP
   libera a origem em `connect-src` (`server/http/csp.ts`) e o app passa a buscar de lá; sem a variável, do
   próprio domínio.
3. Com o bucket em uso, dá para tirar `public/avatares/colecao/` do `dist` (basta listar a pasta em
   `PASTAS_FORA_DO_DIST` de `scripts/vite/precomprimir.ts`).

## Nada da Quaternius

Nenhum arquivo da Quaternius entra aqui: a licença deles está em conflito entre a página (CC0) e o pacote (QAL)
e aguarda parecer do dono.
