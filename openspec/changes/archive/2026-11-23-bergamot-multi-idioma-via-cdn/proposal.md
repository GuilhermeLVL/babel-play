## Why

O tradutor local de `X → inglês` usa o Opus-MT: ~113 MB por idioma e lento. O A/B de 17/10/2026 (54 frases, 9 idiomas, chrF++)
mediu o Bergamot (Mozilla) melhor (77,3 contra 69,3), 5–10× mais rápido e ~3× menor (~32 MB; ja/ko/zh ~44 MB). Só faltava
onde hospedar: o bucket da Mozilla só libera CORS para `localhost`. Detalhes em `docs/alternativas-de-custo-e-eficiencia.md`.

## What Changes

- `modelosDoBergamot.json` ganha `paresDoCdn` (es, fr, de, it, ru, ar, ja, ko, zh, cs, fi, hu, nl, pl, th → en; sha256 conferido
  contra o registro da Mozilla por `scripts/modelos/gerar-pares-do-bergamot.mjs`). Eles NÃO entram no `dist`.
- Com `VITE_BERGAMOT_MODELOS_URL` o build liga `__BERGAMOT_CDN__`: `X → en` e a primeira perna de `X → pt/es/fr/it/de` (pelo
  inglês, nos idiomas que o Opus-MT já cobria) passam ao Bergamot, um worker por par; a segunda perna segue no Opus-MT.
- Qualquer falha cai no Opus-MT (pivô completo). Falha do MOTOR (WASM) vale para todos os pares; modelo que não baixa vale só para o seu.
- `scripts/modelos/publicar-bergamot-no-r2.ts` sobe os 16 pares ao bucket (idempotente, confere sha256, `Cache-Control: immutable`).

## Non-Goals

- `en → X` (o Opus-MT escreve melhor o português do Brasil) e pares diretos es→pt, fr→pt (o Bergamot passaria pelo inglês).
- Mudar o que roda sem CDN: sem `VITE_BERGAMOT_MODELOS_URL` nada muda (pt→en embutido, o resto no Opus-MT).

## Impact

- `bergamotModelo.ts`, `bergamotLocal.ts`, `roteadorDeTraducao.ts` (`bergamotVenceNoPar`), `viaIngles.ts`, `modelCache.ts`,
  `LiveCapture.tsx` (título do download), `vite.config.ts`, docs de lançamento e testes.
- Custo para o dono: um bucket R2 público (~450 MB, egress zero) e rodar o script de publicação.
- Risco: o heap do WASM é ~550 MB por idioma (743 MB no japonês), medido no desktop; falta medir no celular.
