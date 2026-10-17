## 1. Implementação

- [x] 1.1 `escritaChinesa.ts`: variante pelo código do idioma, carga sob demanda e conversão síncrona
- [x] 1.2 Pipeline: converte parcial e final (só chinês), pré-carrega ao preparar a captura
- [x] 1.3 Testes (29): variantes, simplificada↔tradicional, idempotência, outros idiomas, números e latim, sem conversor carregado

## 2. Verificação

- [x] 2.1 No navegador, com o provedor simulado devolvendo tradicional: a tela mostrou o texto simplificado e a tradução em português

## 3. Pendências

- [ ] 3.1 Conferir a conversão com `zh-TW` selecionado no navegador (coberta só por teste unitário)
