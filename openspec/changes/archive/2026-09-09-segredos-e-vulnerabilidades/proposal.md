## Why

O mandato exige historico sem segredo e zero vulnerabilidade alta/critica sem justificativa, e um
SAST independente ao lado das regras da casa.

## What Changes

- `gitleaks` no historico inteiro: 6 achados, todos o mesmo valor de teste. Allowlist por VALOR (e
  nao por caminho) em `.gitleaks.toml`, porque quatro dos seis eram a varredura achando o registro
  da varredura anterior.
- Semgrep 1.176.1 no `seguranca.yml`, via `pipx`, com `--error`.
- `audit:gate` verde: 4 HIGH na allowlist nomeada, todas sem fix upstream e fora do caminho de
  execucao do servidor.

## Nao-escopo

`git filter-repo`. Nao ha segredo real no historico — o unico valor achado e uma constante de teste
que nunca foi chave de nada.
