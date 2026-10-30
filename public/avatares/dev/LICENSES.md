# Modelos de teste do avatar (só desenvolvimento e testes)

Estes arquivos servem ao harness do avatar (`tests/e2e/avatar-harness`) e à pesquisa. **Não vão para produção**:
`scripts/vite/precomprimir.ts` tira `avatares/dev/` do `dist`. Isto NÃO é parecer jurídico.

## Origem

Dois avatares da coleção **100Avatars R1**, de Polygonal Mind, publicados em
[ToxSam/open-source-avatars](https://github.com/ToxSam/open-source-avatars) (registro `data/projects.json`,
projeto `100avatars-r1`, `"license": "CC0"`). O README do repositório diz: "100Avatars Series - Our own free
avatars, no attribution needed".

| Arquivo        | Avatar          | Autor          | Licença | `meta` do VRM (literal, resumido)                                                                                                          |
| -------------- | --------------- | -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `milk.vrm`     | 84_Milk (#084)  | Polygonal Mind | CC0 1.0 | `licenseName="CC0"`, `allowedUserName="Everyone"`, `violentUssageName="Allow"`, `sexualUssageName="Allow"`, `commercialUssageName="Allow"` |
| `bullidan.vrm` | Bullidan (#028) | Polygonal Mind | CC0 1.0 | idem                                                                                                                                       |

Os dois concordam em CC0 nas duas camadas (registro e `meta` do arquivo), a "regra de ouro" da coleção curada
(`docs/prototipos/avatar-libras/colecao/LICENSES.md`, ramo `proto/avatar-libras-b1-colecao`, checado em 2026-10-28).

Os `meta` dizem `Allow` para uso sexual e violento: é o padrão do exportador. Por isso o Frasy só os trata como
seguros para menores por serem da **coleção curada por nós** (`avaliarLicenca(meta, 'menor', 'colecao')`), nunca
como arquivo importado.

## Nada da Quaternius

Nenhum arquivo da Quaternius entra aqui: a licença deles está em conflito entre a página (CC0) e o pacote
(QAL) e aguarda parecer do dono.
