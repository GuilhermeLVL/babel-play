## ADDED Requirements

### Requirement: O chinês transcrito segue a escrita que a pessoa escolheu

O app SHALL converter o texto de um trecho em chinês para a escrita da variante configurada (simplificada para `zh`/`zh-CN`, tradicional para
`zh-TW`/`zh-HK`), qualquer que seja o provedor ou o modelo local. O app MUST NOT converter texto de outro idioma, e MUST seguir com o texto
original se o conversor ainda não carregou.

#### Scenario: Provedor devolve caracteres tradicionais

- **WHEN** a pessoa escolheu 中文 (简体) e o provedor devolve `我喜歡學習中文。今天天氣很好`
- **THEN** a legenda mostra `我喜欢学习中文。今天天气很好`, e a tradução e o vocabulário usam essa escrita

#### Scenario: Outro idioma

- **WHEN** o trecho é japonês, coreano ou português
- **THEN** o texto passa intacto
