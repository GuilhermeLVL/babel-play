export function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    /* Pontuação. As barras de escape em `\/`, `\^` e `\*` eram inúteis: dentro de `[...]` a barra
       não precisa de escape, `^` só é especial na PRIMEIRA posição e `*` não é quantificador ali.
       O `\-` no meio da classe é MANTIDO de propósito — sem ele, `=-_` seria lido como o intervalo
       de `=` a `_`, que engoliria letras maiúsculas e dígitos. */
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize spacing
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= a.length; j++) {
    matrix[0].push(j);
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function similarityPercentage(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (normA === normB) return 1.0;
  if (normA.length === 0 || normB.length === 0) return 0.0;
  const distance = levenshtein(normA, normB);
  const maxLength = Math.max(normA.length, normB.length);
  return 1.0 - distance / maxLength;
}

export interface DiffPart {
  value: string;
  type: 'match' | 'added' | 'removed';
}

export function diffWords(word: string, attempt: string): DiffPart[] {
  const result: DiffPart[] = [];
  const w = word.trim();
  const att = attempt.trim();
  
  let i = 0;
  let j = 0;
  while (i < w.length || j < att.length) {
    if (i < w.length && j < att.length && w[i].toLowerCase() === att[j].toLowerCase()) {
      result.push({ value: w[i], type: 'match' });
      i++;
      j++;
    } else {
      // Find matches down the line to sync back up
      let foundSync = false;
      for (let k = 1; k < 4; k++) {
        if (i + k < w.length && j < att.length && w[i + k].toLowerCase() === att[j].toLowerCase()) {
          for (let m = 0; m < k; m++) {
            result.push({ value: w[i + m], type: 'removed' });
          }
          i += k;
          foundSync = true;
          break;
        }
        if (j + k < att.length && i < w.length && w[i].toLowerCase() === att[j + k].toLowerCase()) {
          for (let m = 0; m < k; m++) {
            result.push({ value: att[j + m], type: 'added' });
          }
          j += k;
          foundSync = true;
          break;
        }
      }
      if (!foundSync) {
        if (i < w.length) {
          result.push({ value: w[i], type: 'removed' });
          i++;
        }
        if (j < att.length) {
          result.push({ value: att[j], type: 'added' });
          j++;
        }
      }
    }
  }
  return result;
}
