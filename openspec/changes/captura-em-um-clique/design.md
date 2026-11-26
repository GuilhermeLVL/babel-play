## Context

O `getDisplayMedia` sempre abre o seletor do navegador, por desenho de segurança: a página não escolhe a aba por quem
assiste. Dicas (`displaySurface`, `systemAudio`, `selfBrowserSurface`, `surfaceSwitching`) só pré-arrumam. `preferCurrentTab`
captura a aba do próprio Frasy, o contrário do que se quer. O único caminho sem seletor no navegador é a API de extensão
`chrome.tabCapture`, que aceita o clique no ícone como autorização (`activeTab`).

## Alternativas avaliadas

| Opção                                              | Toques          | Prós                                                 | Contras                                                                                                                                             | Veredito                                        |
| -------------------------------------------------- | --------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| A. Só o app (dicas + "Legendar agora")             | 1 + seletor (2) | já feito, sem instalação, vale em qualquer navegador | o seletor não sai                                                                                                                                   | **fica como base**                              |
| B. Atalho de teclado / PWA instalada               | 1 + seletor     | abre o app mais rápido                               | o seletor continua; PWA não ganha `tabCapture`                                                                                                      | descartada como solução do seletor              |
| C. Extensão MV3 (`tabCapture` + offscreen)         | **1**           | sem seletor, áudio de aba limpo, poucas permissões   | só Chrome/Edge; loja; manutenção de uma segunda base                                                                                                | **recomendada**                                 |
| D. App desktop (Electron/Tauri)                    | 1-2             | captura de sistema inteira (loopback), sem seletor   | instalação pesada, assinatura de código, atualização, loja de apps, superfície enorme para o que é um botão; menores em app instalado = mais regras | descartada agora; reavaliar para jogos/consoles |
| E. Legenda dentro da extensão (overlay), sem o app | 1               | independe do app aberto                              | duplica STT/MT no pacote da extensão (tamanho, política da loja), foge do "app é a casa"                                                            | fatia futura, não agora                         |

**Recomendação: A (feita) + C.** A cobre todo navegador; C dá o 1 toque a quem usa Chrome/Edge no desktop, que é onde está
a dor. D só se aparecer demanda por áudio de apps fora do navegador.

## Decisões

1. **Onde roda a captura.** Service worker pede `chrome.tabCapture.getMediaStreamId({ targetTabId })` no gesto do popup e
   cria um documento offscreen (`reasons: ['USER_MEDIA']`); só o offscreen tem `getUserMedia`. O SW não guarda estado: a
   existência do documento é o estado, e a aba vai na URL dele.
2. **Formato.** `AudioContext({ sampleRate: 16000 })` + `AudioWorklet` empacotam PCM Int16 mono em quadros de 100 ms
   (1600 amostras). É o formato do VAD e do STT do app. A aba continua audível (um segundo contexto devolve o som ao
   alto-falante, porque a captura de aba silencia a aba).
3. **Entrega ao app.** Offscreen <-> ponte (content script, só nas origens do app) por porta `chrome.runtime.connect`;
   ponte <-> app por `window.postMessage` na própria janela. Quadro em base64 (mensagens do Chrome são JSON). Contrato
   versionado em `extensao/contrato.js`.
4. **O app pede.** Sem `pedir` do app nenhuma porta abre e nenhum quadro sai do offscreen (descartado na hora). Extensão
   instalada não entrega áudio a site nenhum por conta própria.
5. **Confiança.** O app confere `event.source === window`, `event.origin`, `fonte`, `versao` e a forma do quadro
   (`validarDaExtensao`). A ponte só repassa `pedir`/`parar`. O offscreen só aceita porta da própria extensão.
6. **Permissões.** `tabCapture` (a captura), `offscreen` (o documento), `activeTab` (o gesto do clique autoriza só a aba
   ativa, sem `host_permissions`). Sem `storage`, sem `tabs`, sem `<all_urls>`. Um teste trava essa lista.
7. **Privacidade de menores.** Retenção zero (nada é gravado nem em memória além do quadro em trânsito); sem rede na
   extensão (teste procura `fetch`/`WebSocket`/`storage`); nenhum identificador, nenhuma telemetria. A nuvem continua só
   no app, com o consentimento de hoje. Menor com a extensão: mesmas regras do app; a extensão não vê idade.
8. **Falha esperada.** Aba protegida por DRM (Netflix etc.) pode entregar silêncio: o app mostra o guia de "sem áudio" de
   hoje. Aba fechada encerra a captura. Duas capturas ao mesmo tempo: a segunda substitui a primeira.

## O que muda na Chrome Web Store (todos **[D]**)

- Conta de desenvolvedor (taxa única), verificação do editor e e-mail de contato.
- **Uma finalidade única** declarada: "legendar o som da aba atual no Frasy".
- **Justificativa por permissão** (campo obrigatório): `tabCapture` (captura o som da aba que a pessoa escolheu ao clicar),
  `offscreen` (processa o áudio fora do service worker), `activeTab` (limita ao tab clicado).
- **Prática de dados**: declarar "não coleta dados do usuário"; áudio tratado só no aparelho e entregue ao Frasy aberto
  pela própria pessoa. Link de **política de privacidade** (página no site público).
- Ícones 16/48/128, capturas de tela, descrição em pt-BR e en; produção em `matches` (hoje só `http://localhost/*`).
- Revisão manual por captura de áudio: prever dias de espera e uma resposta pronta sobre menores (nada coletado).
- Edge Add-ons: mesmo pacote, outro painel (outra conta).
- Versionamento: o contrato tem `versao`; o app aceita só a que conhece e mostra "atualize a extensão" quando difere.

## Risks / Trade-offs

- [Só Chrome/Edge] -> o app continua com o seletor nos outros (fatia 1).
- [Revisão da loja recusa por áudio] -> finalidade única, permissões mínimas e política de privacidade clara; fallback: distribuição não listada.
- [Duas bases de código] -> a extensão é fina (sem STT/MT); o contrato é o único acoplamento e tem teste.
- [Aba com DRM em silêncio] -> guia existente.
- [Base64 a 10 quadros/s] -> ~43 KB/s: irrelevante; trocar por transferência binária só se medir custo.

## Open Questions

- Origem de produção do app para `matches` e `web_accessible_resources`. **[D]**
- Publicar listada ou não listada no início. **[D]**
- Nome e ícone na loja (a marca é do dono). **[D]**
