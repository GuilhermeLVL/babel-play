# bundle por rota (manifest do Vite) - build sem login (VITE_AUTH_REQUIRED=0) para Lighthouse - 47ecf10
# comando: npx vite build --manifest; parse de dist/.vite/manifest.json (isDynamicEntry + imports estaticos transitivos)
# os tamanhos do build de producao real (com .env) estao em bundle-medir-rotas.txt; a diferenca e so o chunk de login.

## arranque (entry + imports estaticos): 2 chunks, 743 KB, 209 KB gz

| entrada lazy (rota/tela) | chunks proprios (fora do arranque) | KB | KB gz |
|---|---:|---:|---:|
| src/components/views/LiveCapture.tsx | 28 | 684 | 204 |
| src/components/views/Analysis.tsx | 27 | 675 | 201 |
| src/components/views/Play.tsx | 29 | 522 | 155 |
| src/components/views/Metrics.tsx | 19 | 480 | 149 |
| src/components/views/Library.tsx | 15 | 474 | 134 |
| src/components/views/Perfil.tsx | 10 | 388 | 118 |
| node_modules/@supabase/supabase-js/dist/index.mjs | 1 | 214 | 56 |
| src/components/views/Settings.tsx | 20 | 111 | 38 |
| src/components/views/Loja.tsx | 10 | 95 | 26 |
| src/data/trilha/niveis/ko.json | 1 | 122 | 25 |
| src/data/trilha/niveis/ja.json | 1 | 47 | 25 |
| src/data/trilha/niveis/ru.json | 1 | 82 | 25 |
| src/data/trilha/niveis/tr.json | 1 | 47 | 21 |
| src/data/trilha/niveis/nl.json | 1 | 44 | 21 |
| src/data/trilha/niveis/it.json | 1 | 46 | 21 |
| src/data/trilha/niveis/de.json | 1 | 45 | 21 |
| src/data/trilha/niveis/es.json | 1 | 44 | 21 |
| src/data/trilha/niveis/fr.json | 1 | 44 | 20 |
| src/data/trilha/niveis/zh.json | 1 | 34 | 20 |
| src/data/trilha/niveis/pl.json | 1 | 44 | 20 |
| src/data/trilha/niveis/he.json | 1 | 57 | 19 |
| src/data/trilha/niveis/ar.json | 1 | 56 | 19 |
| src/data/trilha/niveis/sv.json | 1 | 40 | 19 |
| src/components/Onboarding.tsx | 13 | 53 | 19 |
| src/data/trilha/niveis/hi.json | 1 | 55 | 15 |
| src/components/IChat.tsx | 11 | 38 | 15 |
| src/components/views/Sobre.tsx | 6 | 18 | 7 |
| src/components/views/Planos.tsx | 6 | 15 | 6 |
| src/components/LayoutStudio.tsx | 5 | 17 | 6 |
| src/components/Login.tsx | 2 | 7 | 3 |
| src/components/auth/ResetPassword.tsx | 2 | 4 | 2 |
| index.html | 0 | 0 | 0 |
