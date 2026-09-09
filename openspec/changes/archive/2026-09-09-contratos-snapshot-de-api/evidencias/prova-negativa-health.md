# Prova negativa — 2026-09-08 — campo `db` removido de `server/routes/health.ts` (edicao temporaria, revertida em seguida)

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/caracterizacao/auth-e-conta.test.ts > modo publico (AUTH_REQUIRED=1, JWT ES256) > /api/health e publico: 200 sem token, com a forma conhecida
Error: Snapshot `modo publico (AUTH_REQUIRED=1, JWT ES256) > /api/health e publico: 200 sem token, com a forma conhecida 1` mismatched
- Expected
+ Received
  {
    "status": 200,
    "forma": {
      "at": "number",
      "boot": "string",
-     "db": "string",
      "status": "string"
    }
  }
 ❯ tests/caracterizacao/auth-e-conta.test.ts:20:5
     18|     expect(r.status).toBe(200)
     19|     expect(r.headers.get('x-request-id')).toBeTruthy()
     20|     await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFi…
       |     ^
     21|   })
     22|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
  Snapshots  1 failed
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```
