# voz-fase-0 — bancada de voz: motores candidatos

Gerado em 2026-11-01.

> Provisório: os limiares de `scripts/eval-voz/limiares.json` ainda não foram calibrados pela F0.
> O número só elimina; o dono ouve e aprova (spec §7.3).

## 1. Motores e vozes

| candidato           | RTF (mediana) | memória (GB) | vozes do motor | duração por frase (s) | GPL |
| ------------------- | ------------- | ------------ | -------------- | --------------------- | --- |
| `pocket-tts/marius` | 0,091         | 2,31         | 3              | 15,1                  | não |
| `pocket-tts/rafael` | 0,091         | 2,31         | 3              | 14,9                  | não |
| `pocket-tts/vera`   | 0,090         | 2,31         | 3              | 17,3                  | não |
| `supertonic/F1`     | 0,251         | 0,95         | 2              | 17,4                  | não |
| `supertonic/M1`     | 0,242         | 0,95         | 2              | 17,4                  | não |

## 2. pt

| candidato           | CER  | WER   | itens | números e anos | estabilidade | fora de ±30% | nota       | aguenta 30 min | ouvintes |
| ------------------- | ---- | ----- | ----- | -------------- | ------------ | ------------ | ---------- | -------------- | -------- |
| `pocket-tts/marius` | 8,1% | 22,9% | 60,5% | 100,0%         | -            | 0,0%         | sem escuta | sem escuta     | 0        |
| `pocket-tts/rafael` | 7,9% | 21,6% | 68,4% | 90,9%          | 3,8%         | 0,0%         | sem escuta | sem escuta     | 0        |
| `pocket-tts/vera`   | 8,0% | 22,6% | 55,3% | 81,8%          | -            | 7,1%         | sem escuta | sem escuta     | 0        |
| `supertonic/F1`     | 4,5% | 15,7% | 81,6% | 81,8%          | 1,8%         | 0,0%         | sem escuta | sem escuta     | 0        |
| `supertonic/M1`     | 5,2% | 17,6% | 71,1% | 81,8%          | -            | 0,0%         | sem escuta | sem escuta     | 0        |

**Recomendação (pt):** opção 0 + T2: nenhum candidato passou em todos os portões (provisório)

- `pocket-tts/marius`: pt: CER 8,1 % acima do máximo de 3,0 %; pt: WER 22,9 % acima do máximo de 8,0 %; pt: itens difíceis corretos 60,5 % abaixo do mínimo de 85,0 %; pt: estabilidade (inserções + deleções) não medida (limite 1,0 %); escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `pocket-tts/rafael`: licença não limpa; pt: CER 7,9 % acima do máximo de 3,0 %; pt: WER 21,6 % acima do máximo de 8,0 %; pt: itens difíceis corretos 68,4 % abaixo do mínimo de 85,0 %; pt: números e anos corretos 90,9 % abaixo do mínimo de 100,0 %; pt: estabilidade (inserções + deleções) 3,8 % acima do máximo de 1,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `pocket-tts/vera`: pt: CER 8,0 % acima do máximo de 3,0 %; pt: WER 22,6 % acima do máximo de 8,0 %; pt: itens difíceis corretos 55,3 % abaixo do mínimo de 85,0 %; pt: números e anos corretos 81,8 % abaixo do mínimo de 100,0 %; pt: estabilidade (inserções + deleções) não medida (limite 1,0 %); pt: frases fora de ±30% da mediana 7,1 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `supertonic/F1`: pt: CER 4,5 % acima do máximo de 3,0 %; pt: WER 15,7 % acima do máximo de 8,0 %; pt: itens difíceis corretos 81,6 % abaixo do mínimo de 85,0 %; pt: números e anos corretos 81,8 % abaixo do mínimo de 100,0 %; pt: estabilidade (inserções + deleções) 1,8 % acima do máximo de 1,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `supertonic/M1`: pt: CER 5,2 % acima do máximo de 3,0 %; pt: WER 17,6 % acima do máximo de 8,0 %; pt: itens difíceis corretos 71,1 % abaixo do mínimo de 85,0 %; pt: números e anos corretos 81,8 % abaixo do mínimo de 100,0 %; pt: estabilidade (inserções + deleções) não medida (limite 1,0 %); escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho

## 3. en

| candidato           | CER   | WER   | itens | números e anos | estabilidade | fora de ±30% | nota       | aguenta 30 min | ouvintes |
| ------------------- | ----- | ----- | ----- | -------------- | ------------ | ------------ | ---------- | -------------- | -------- |
| `pocket-tts/marius` | 17,4% | 27,0% | 88,2% | 100,0%         | -            | 0,0%         | sem escuta | sem escuta     | 0        |
| `pocket-tts/rafael` | 12,9% | 26,4% | 70,6% | 40,0%          | -            | 0,0%         | sem escuta | sem escuta     | 0        |
| `pocket-tts/vera`   | 11,0% | 20,2% | 76,5% | 80,0%          | -            | 20,0%        | sem escuta | sem escuta     | 0        |
| `supertonic/F1`     | 11,5% | 24,2% | 82,4% | 80,0%          | -            | 20,0%        | sem escuta | sem escuta     | 0        |
| `supertonic/M1`     | 11,5% | 23,6% | 70,6% | 60,0%          | -            | 20,0%        | sem escuta | sem escuta     | 0        |

**Recomendação (en):** opção 0 + T2: nenhum candidato passou em todos os portões (provisório)

- `pocket-tts/marius`: en: CER 17,4 % acima do máximo de 2,0 %; en: WER 27,0 % acima do máximo de 5,0 %; en: itens difíceis corretos 88,2 % abaixo do mínimo de 90,0 %; en: estabilidade (inserções + deleções) não medida (limite 1,0 %); escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `pocket-tts/rafael`: licença não limpa; en: CER 12,9 % acima do máximo de 2,0 %; en: WER 26,4 % acima do máximo de 5,0 %; en: itens difíceis corretos 70,6 % abaixo do mínimo de 90,0 %; en: números e anos corretos 40,0 % abaixo do mínimo de 100,0 %; en: estabilidade (inserções + deleções) não medida (limite 1,0 %); escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `pocket-tts/vera`: en: CER 11,0 % acima do máximo de 2,0 %; en: WER 20,2 % acima do máximo de 5,0 %; en: itens difíceis corretos 76,5 % abaixo do mínimo de 90,0 %; en: números e anos corretos 80,0 % abaixo do mínimo de 100,0 %; en: estabilidade (inserções + deleções) não medida (limite 1,0 %); en: frases fora de ±30% da mediana 20,0 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `supertonic/F1`: en: CER 11,5 % acima do máximo de 2,0 %; en: WER 24,2 % acima do máximo de 5,0 %; en: itens difíceis corretos 82,4 % abaixo do mínimo de 90,0 %; en: números e anos corretos 80,0 % abaixo do mínimo de 100,0 %; en: estabilidade (inserções + deleções) não medida (limite 1,0 %); en: frases fora de ±30% da mediana 20,0 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `supertonic/M1`: en: CER 11,5 % acima do máximo de 2,0 %; en: WER 23,6 % acima do máximo de 5,0 %; en: itens difíceis corretos 70,6 % abaixo do mínimo de 90,0 %; en: números e anos corretos 60,0 % abaixo do mínimo de 100,0 %; en: estabilidade (inserções + deleções) não medida (limite 1,0 %); en: frases fora de ±30% da mediana 20,0 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho

## 4. es

| candidato           | CER   | WER   | itens | números e anos | estabilidade | fora de ±30% | nota       | aguenta 30 min | ouvintes |
| ------------------- | ----- | ----- | ----- | -------------- | ------------ | ------------ | ---------- | -------------- | -------- |
| `pocket-tts/marius` | 14,6% | 26,8% | 42,9% | 0,0%           | -            | 25,0%        | sem escuta | sem escuta     | 0        |
| `pocket-tts/rafael` | 12,6% | 26,0% | 50,0% | 0,0%           | -            | 25,0%        | sem escuta | sem escuta     | 0        |
| `pocket-tts/vera`   | 15,3% | 26,0% | 35,7% | 0,0%           | -            | 25,0%        | sem escuta | sem escuta     | 0        |
| `supertonic/F1`     | 5,0%  | 11,4% | 78,6% | 50,0%          | -            | 25,0%        | sem escuta | sem escuta     | 0        |
| `supertonic/M1`     | 10,1% | 23,6% | 64,3% | 25,0%          | -            | 25,0%        | sem escuta | sem escuta     | 0        |

**Recomendação (es):** opção 0 + T2: nenhum candidato passou em todos os portões (provisório)

- `pocket-tts/marius`: es: CER 14,6 % acima do máximo de 3,0 %; es: WER 26,8 % acima do máximo de 7,0 %; es: itens difíceis corretos 42,9 % abaixo do mínimo de 90,0 %; es: números e anos corretos 0,0 % abaixo do mínimo de 100,0 %; es: estabilidade (inserções + deleções) não medida (limite 1,0 %); es: frases fora de ±30% da mediana 25,0 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `pocket-tts/rafael`: licença não limpa; es: CER 12,6 % acima do máximo de 3,0 %; es: WER 26,0 % acima do máximo de 7,0 %; es: itens difíceis corretos 50,0 % abaixo do mínimo de 90,0 %; es: números e anos corretos 0,0 % abaixo do mínimo de 100,0 %; es: estabilidade (inserções + deleções) não medida (limite 1,0 %); es: frases fora de ±30% da mediana 25,0 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `pocket-tts/vera`: es: CER 15,3 % acima do máximo de 3,0 %; es: WER 26,0 % acima do máximo de 7,0 %; es: itens difíceis corretos 35,7 % abaixo do mínimo de 90,0 %; es: números e anos corretos 0,0 % abaixo do mínimo de 100,0 %; es: estabilidade (inserções + deleções) não medida (limite 1,0 %); es: frases fora de ±30% da mediana 25,0 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `supertonic/F1`: es: CER 5,0 % acima do máximo de 3,0 %; es: WER 11,4 % acima do máximo de 7,0 %; es: itens difíceis corretos 78,6 % abaixo do mínimo de 90,0 %; es: números e anos corretos 50,0 % abaixo do mínimo de 100,0 %; es: estabilidade (inserções + deleções) não medida (limite 1,0 %); es: frases fora de ±30% da mediana 25,0 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
- `supertonic/M1`: es: CER 10,1 % acima do máximo de 3,0 %; es: WER 23,6 % acima do máximo de 7,0 %; es: itens difíceis corretos 64,3 % abaixo do mínimo de 90,0 %; es: números e anos corretos 25,0 % abaixo do mínimo de 100,0 %; es: estabilidade (inserções + deleções) não medida (limite 1,0 %); es: frases fora de ±30% da mediana 25,0 % acima do máximo de 3,0 %; escuta insuficiente: 0 ouvinte(s), mínimo 3; sem escuta (naturalidade); sem escuta (aguentaria 30 min); sem escuta (erros graves); sem comparação com a voz do aparelho
