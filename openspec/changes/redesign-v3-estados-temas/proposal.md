## Why

O redesign trocou tokens (F1), casca (F2) e o interior de sete telas. Antes de fechar, é preciso
provar que os 7 temas × claro/escuro e os 3 viewports continuam legíveis — e que os estados
globais (Toast, confirmação, paleta de comandos, iChat, guia, popovers, erro de tela) não
ficaram com cor fora de token.

## What Changes

- `scripts/redesign/evidencias.mjs --temas a,b,c`: uma passada por tema, gravando o tema no
  servidor descartável (o servidor vence o localStorage em `hydrateTheme`) e devolvendo `babel`
  no fim. Arquivo `<rota>__<vp>__<modo>__<tema>.png`.
- Varredura `evidencias/12-temas/`: Início, Jogar e Capturar nos 6 temas além do babel, claro e
  escuro, 375/768/1280.
- Auditoria dos componentes globais: nenhuma cor da paleta do Tailwind nem hex literal em
  className fora de `views/` e `minigames/`; os `text-white` restantes ficam sobre avatares de
  cor de falante (inline) e no Overlay (presets próprios), ambos legítimos.

## Nao-escopo

Correções encontradas na varredura entram como commits próprios nesta mesma change, cada um com
a captura que os motivou.
