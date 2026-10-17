## 1. Implementação

- [x] 1.1 Leitor puro de SRT, VTT e ASS/SSA (`src/lib/import/legendas.ts`)
- [x] 1.2 Fila de importação lê a legenda no navegador (`filaDeImportacao.ts`)
- [x] 1.3 Tela de importar aceita e descreve legendas (`Library.tsx`)
- [x] 1.4 Testes: SRT com BOM/CRLF/etiquetas/entidades, rolagem, japonês, VTT com NOTE/STYLE, ASS com vírgulas e Comment, arquivo vazio

## 2. Verificação

- [x] 2.1 No navegador: o campo aceita `.srt`; um SRT em japonês criou a sessão com 3 falas e idioma `ja-JP` detectado

## 3. Pendências

- [ ] 3.1 O texto do menu "Trazer uma fonte → Vídeo, áudio ou PDF" (chave de tradução) ainda não cita legendas
- [ ] 3.2 Guardar os tempos das falas, se a sessão passar a sincronizar com um vídeo
