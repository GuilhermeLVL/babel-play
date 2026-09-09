## ADDED Requirements

### Requirement: Regra de arquitetura casa por camada, nao por pasta

As regras que valem para uma camada do servidor SHALL usar um padrao que case tanto a arvore atual quanto a arvore por dominio.

#### Scenario: Rota numa subpasta de dominio

- **WHEN** existe `server/dominios/<d>/rotas/x.ts` lendo `process.env`, chamando `db` direto e com `console.log`
- **THEN** `env-fora-de-config`, `rota-fala-com-o-banco` e `no-console` acusam as tres violacoes
