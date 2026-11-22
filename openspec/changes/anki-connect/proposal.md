## Why

Hoje o Frasy só troca cartões com o Anki por arquivo `.apkg`: exportar, baixar, abrir no Anki. Quem estuda com Anki no
computador quer mandar as palavras direto para o baralho aberto. O relatório de engenharia reversa
(`docs/pesquisa/2026-11-ecossistema-de-aprendizado/engenharia-reversa-extensoes.md`, item 11) mostra que Yomitan, Migaku e
Language Reactor fazem isso pelo AnkiConnect (API HTTP local em `127.0.0.1:8765`), e que é barato e fecha a lacuna de
exportação.

## What Changes

- **"Anki no computador"**: um quinto formato no diálogo de exportar o vocabulário (`ExportarVocabulario`), com painel para
  testar a conexão, escolher baralho, modelo e campos, enviar com progresso e ver o resumo (adicionados, já existiam, erros).
  Serve também para "Enviar selecionados" (a seleção da lista de vocabulário já abre este diálogo).
- **100% no navegador.** O servidor do Frasy nunca fala com o Anki e nenhum dado vai a terceiros: não há rota nova.
- **Só no computador.** O formato some no celular e no Quest (AnkiConnect é do Anki de mesa), pela detecção de dispositivo
  existente (`src/lib/dispositivo/perfil.ts`).
- **Cliente mínimo (versão 6)** em `src/lib/anki/ankiConnect.ts`: `requestPermission`, `version`, `deckNames`,
  `modelNames`, `modelFieldNames`, `createDeck`, `canAddNotes`, `addNotes`, com prazo curto e erros tipados e acionáveis
  (Anki fechado, origem não liberada com a linha exata de `webCorsOriginList`, permissão negada, versão antiga).
- **Mapeamento por papel** em `src/core/anki/paraAnkiConnect.ts`: padrão "Basic" (Frente = palavra; Verso = tradução + frase
  em itálico com a palavra em negrito), com escolha por campo (palavra, tradução, frase, cloze, nota, nível). Tags = etiquetas
  do cartão + `frasy`. Escape de `&`, `<`, `>` e tetos de tamanho.
- **Preferências só no aparelho** (`localStorage`, com try/catch): baralho, modelo e mapeamento por modelo.
- **CSP:** `connect-src` ganha `http://127.0.0.1:8765` e `http://localhost:8765`, só isso (`server/http/csp.ts`).

## Capabilities

### Modified Capabilities

- `acervo-anki`: o Frasy passa a enviar cartões ao Anki aberto no computador, além do `.apkg`.

## Impact

- Código: `src/core/anki/paraAnkiConnect.ts`, `src/lib/anki/ankiConnect.ts`, `src/lib/anki/ankiConnectPrefs.ts`,
  `src/components/views/vocab/EnviarParaOAnki.tsx`, `src/components/views/vocab/ExportarVocabulario.tsx`,
  `server/http/csp.ts`, catálogos `public/i18n/{en,es,ar}.json`.
- Segurança: a única abertura é loopback na porta 8765 em `connect-src` (nunca `script-src`, `worker-src` nem `frame-src`).
  O texto da pessoa é escapado antes de virar HTML do Anki. O usuário precisa listar a origem do Frasy em
  `webCorsOriginList` do AnkiConnect (o app mostra a linha exata).
- Menores (ECA Digital/LGPD): nada é coletado nem enviado ao servidor; o envio é do aparelho para o Anki da mesma máquina.
- Testes: `tests/anki-connect*.test.ts(x)`, `tests/cabecalhos-gerados.test.ts`.
- Limites conhecidos: Safari pode bloquear `http://127.0.0.1` a partir de página `https`; sem áudio nem imagem no cartão.
