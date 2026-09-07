## Why

O dono decidiu que a primeira visita deve ser a mais confortável: o app carrega no perfil
"Leitura ampliada" (`senior`) por padrão, como a edição leve já faz desde 2026-08-27
(`profile.ts:42-44`). Hoje o build completo cai em `pro`.

## What Changes

- `readAgeProfile()` (`profile.ts:44`): fallback vira `'senior'` incondicional.
- Default de `babel.font_scale` (`App.tsx:211`) vira `'lg'` — o boot direto em senior não passa
  pelo efeito que sugere fonte maior (`App.tsx:256-261`).
- Escolha do usuário continua vencendo: localStorage e `ui.ageProfile` do servidor
  (`App.tsx:493-496`) não mudam.
