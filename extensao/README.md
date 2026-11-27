# Extensão do Frasy para Chrome e Edge (esqueleto)

Legenda o som da aba atual com **um clique**, sem o seletor de compartilhamento do navegador. É um esqueleto funcional
da change `openspec/changes/captura-em-um-clique/`: captura a aba e entrega PCM ao app. **Não está publicada em loja**
(a publicação é ato do dono).

## Carregar sem compactação

1. Abra `chrome://extensions` (no Edge, `edge://extensions`) e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha esta pasta (`extensao/`).
3. Suba o app em `http://localhost:3100` (`npm run dev:local`).
4. Abra a aba com o vídeo ou a aula, clique no ícone do Frasy e em **Legendar esta aba**. O app abre em
   `/capturar?fonte=extensao`; o selo **ON** no ícone mostra que a captura está no ar. **Parar** no popup encerra.

Chrome 116 ou mais novo (o `chrome.runtime.getContexts` e o documento offscreen com `USER_MEDIA`).

## O que tem aqui

| Arquivo                           | Papel                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                   | MV3. Permissões mínimas: `tabCapture`, `offscreen`, `activeTab`. Sem `host_permissions`, sem `storage`, sem rede. |
| `service-worker.js`               | Orquestra: pede o `streamId` da aba ativa, cria o documento offscreen, abre o app. Sem estado.                    |
| `offscreen.js` + `worklet-pcm.js` | Captura a aba, devolve o som ao alto-falante e entrega PCM 16 kHz mono em quadros de 100 ms.                      |
| `ponte.js`                        | Content script só em `http://localhost/*`: liga a página do app ao offscreen por `postMessage`.                   |
| `contrato.js`                     | O contrato de mensagens (versão 1). Testado em `tests/extensao-contrato.test.ts`.                                 |
| `popup.html` / `popup.js`         | Um botão.                                                                                                         |

## O contrato (resumo)

O app faz `window.postMessage({ fonte: 'frasy-app', versao: 1, tipo: 'pedir' }, location.origin)`; a extensão responde, na
mesma janela, com `{ fonte: 'frasy-extensao', versao: 1, tipo: 'pronta' }` e depois `pcm` (`seq`, `t`, `sr: 16000`,
`pcm` em base64 de Int16), até um `parou` ou `erro`. O app confere `event.source === window`, `event.origin` e
`validarDaExtensao` antes de usar qualquer quadro. Sem o `pedir`, nenhum áudio é entregue a site nenhum.

## Privacidade

Sem rede, sem armazenamento, sem gravação: sem porta aberta pelo app o quadro é descartado no próprio offscreen. Fechar a
aba capturada encerra a captura.

## Falta (ver `tasks.md` da change)

- O lado do app: ouvir `postMessage` e alimentar o pipeline (VAD, STT) no lugar do `getDisplayMedia`.
- Ícones, texto da loja, política de privacidade e a origem de produção em `matches` (**[D]**).
