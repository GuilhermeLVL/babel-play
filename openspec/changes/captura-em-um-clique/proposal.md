## Why

Legendar o som de uma aba exige hoje: abrir Capturar, tocar em Iniciar, e passar pelo **seletor obrigatório do navegador**
(escolher a aba, confirmar). A medição de 2026-11-26 (`docs/auditoria/2026-11-26-captura-com-menos-passos.md`) mostra que
o app já corta tudo o que está ao alcance de uma página (dicas do `getDisplayMedia`, "Legendar agora", download lembrado) e
que o piso são **2 toques no seletor**. Nenhuma página consegue tirá-lo; uma extensão sim.

## What Changes

- **Já entregue no app (fatia 1):** botão "Legendar agora", dica `displaySurface` com detecção de suporte, confirmação de
  download lembrada no desktop.
- **Esta change (fatia 2):** uma extensão do Frasy para Chrome e Edge (Manifest V3, `chrome.tabCapture` + documento
  offscreen) que legenda a **aba atual com 1 toque no ícone**, sem o seletor, entregando PCM 16 kHz ao app por
  `postMessage` por uma ponte (content script) restrita às origens do app.
- Privacidade de menores: retenção zero, nenhuma rede na extensão, nenhum áudio enviado à nuvem por ela; o que o app faz
  com o áudio segue as regras de hoje (aparelho por padrão, nuvem só com consentimento).
- Permissões mínimas: `tabCapture`, `offscreen`, `activeTab`. Sem `host_permissions`, sem `storage`.
- Esqueleto funcional em `extensao/` (carregar sem compactação). **Publicar na loja é ato do dono [D].**

## Capabilities

### New Capabilities

- `captura-por-extensao`: a captura da aba pela extensão, o contrato de mensagens com o app e as garantias de privacidade.
- `captura-com-menos-passos`: o "Legendar agora" e as dicas do seletor no app (fatia 1, já no código).

## Impact

- Novo diretório `extensao/` (fora do bundle do app, dentro do lint e do prettier). Sem dependência nova.
- App: um receptor do contrato (`src/lib/captura/`) que entrega os quadros ao pipeline no lugar do `getDisplayMedia`
  (fatia 2, ainda não feita).
- Loja: conta de desenvolvedor da Chrome Web Store, política de privacidade, justificativa por permissão, revisão. Ver `design.md`.
- Menores (ECA Digital/LGPD): a extensão não coleta dado nenhum; o termo de uso e a política da loja precisam dizer isso.
