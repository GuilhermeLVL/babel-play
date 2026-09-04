/**
 * Gera baralhos de teste multi-idioma no formato de texto que `lerTextoAnki` aceita
 * (frente TAB verso TAB exemplo). Baralho real tem licença própria e não entra no repo;
 * estes são pequenos e servem para medir o FLUXO, não a escala.
 *
 *   node scripts/corpus-anki/gerar.mjs [--saida <dir>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BARALHOS = {
  es: {
    nome: 'Espanhol basico',
    escrita: 'latino',
    notas: [
      ['silla', 'cadeira', 'La silla es roja.'],
      ['ventana', 'janela', 'Abre la ventana, por favor.'],
      ['comida', 'comida', 'La comida esta lista.'],
      ['trabajo', 'trabalho', 'Voy al trabajo temprano.'],
      ['ciudad', 'cidade', 'Vivo en una ciudad grande.'],
      ['tiempo', 'tempo', 'No tengo tiempo hoy.'],
      ['camino', 'caminho', 'El camino es largo.'],
      ['puerta', 'porta', 'Cierra la puerta despacio.'],
      ['libro', 'livro', 'Este libro es muy bueno.'],
      ['agua', 'agua', 'Quiero un vaso de agua.'],
      ['noche', 'noite', 'La noche esta fria.'],
      ['pueblo', 'povoado', 'El pueblo queda cerca.'],
    ],
  },
  fr: {
    nome: 'Frances basico',
    escrita: 'latino',
    notas: [
      ['fenetre', 'janela', 'La fenetre est ouverte.'],
      ['travail', 'trabalho', 'Je vais au travail.'],
      ['maison', 'casa', 'La maison est grande.'],
      ['chemin', 'caminho', 'Le chemin est long.'],
      ['livre', 'livro', 'Ce livre est interessant.'],
      ['temps', 'tempo', "Je n'ai pas le temps."],
      ['ville', 'cidade', 'La ville est belle.'],
      ['porte', 'porta', 'Ferme la porte.'],
      ['nuit', 'noite', 'La nuit est calme.'],
      ['eau', 'agua', "Je bois de l'eau."],
    ],
  },
  de: {
    nome: 'Alemao basico',
    escrita: 'latino',
    notas: [
      ['Fenster', 'janela', 'Das Fenster ist offen.'],
      ['Arbeit', 'trabalho', 'Ich gehe zur Arbeit.'],
      ['Haus', 'casa', 'Das Haus ist gross.'],
      ['Weg', 'caminho', 'Der Weg ist lang.'],
      ['Buch', 'livro', 'Dieses Buch ist gut.'],
      ['Zeit', 'tempo', 'Ich habe keine Zeit.'],
      ['Stadt', 'cidade', 'Die Stadt ist schoen.'],
      ['Tuer', 'porta', 'Schliess die Tuer.'],
      ['Nacht', 'noite', 'Die Nacht ist ruhig.'],
      ['Wasser', 'agua', 'Ich trinke Wasser.'],
    ],
  },
  ja: {
    nome: 'Japones basico',
    escrita: 'kana+kanji',
    notas: [
      ['窓', 'janela', '窓を開けてください。'],
      ['仕事', 'trabalho', '仕事に行きます。'],
      ['家', 'casa', 'この家は大きいです。'],
      ['道', 'caminho', '道が長いです。'],
      ['本', 'livro', 'この本は面白いです。'],
      ['時間', 'tempo', '時間がありません。'],
      ['町', 'cidade', '町はきれいです。'],
      ['水', 'agua', '水を飲みます。'],
      ['夜', 'noite', '夜は静かです。'],
      ['食べる', 'comer', '毎日ご飯を食べる。'],
    ],
  },
  ru: {
    nome: 'Russo basico',
    escrita: 'cirilico',
    notas: [
      ['окно', 'janela', 'Окно открыто.'],
      ['работа', 'trabalho', 'Я иду на работу.'],
      ['дом', 'casa', 'Этот дом большой.'],
      ['дорога', 'caminho', 'Дорога длинная.'],
      ['книга', 'livro', 'Эта книга интересная.'],
      ['время', 'tempo', 'У меня нет времени.'],
      ['город', 'cidade', 'Город красивый.'],
      ['вода', 'agua', 'Я пью воду.'],
      ['ночь', 'noite', 'Ночь тихая.'],
      ['дверь', 'porta', 'Закрой дверь.'],
    ],
  },
  ar: {
    nome: 'Arabe basico (RTL)',
    escrita: 'arabe',
    notas: [
      ['نافذة', 'janela', 'النافذة مفتوحة.'],
      ['عمل', 'trabalho', 'أذهب إلى العمل.'],
      ['بيت', 'casa', 'هذا البيت كبير.'],
      ['طريق', 'caminho', 'الطريق طويل.'],
      ['كتاب', 'livro', 'هذا الكتاب مفيد.'],
      ['وقت', 'tempo', 'ليس لدي وقت.'],
      ['مدينة', 'cidade', 'المدينة جميلة.'],
      ['ماء', 'agua', 'أشرب الماء.'],
      ['ليل', 'noite', 'الليل هادئ.'],
      ['باب', 'porta', 'أغلق الباب.'],
    ],
  },
  th: {
    nome: 'Tailandes basico',
    escrita: 'thai',
    notas: [
      ['หน้าต่าง', 'janela', 'หน้าต่างเปิดอยู่'],
      ['งาน', 'trabalho', 'ฉันไปทำงาน'],
      ['บ้าน', 'casa', 'บ้านหลังนี้ใหญ่'],
      ['ถนน', 'caminho', 'ถนนยาวมาก'],
      ['หนังสือ', 'livro', 'หนังสือเล่มนี้ดี'],
      ['เวลา', 'tempo', 'ฉันไม่มีเวลา'],
      ['เมือง', 'cidade', 'เมืองสวยงาม'],
      ['น้ำ', 'agua', 'ฉันดื่มน้ำ'],
      ['กลางคืน', 'noite', 'กลางคืนเงียบ'],
      ['ประตู', 'porta', 'ปิดประตู'],
    ],
  },
};

const args = process.argv.slice(2);
const iSaida = args.indexOf('--saida');
const dir = iSaida >= 0 ? args[iSaida + 1] : join(process.cwd(), 'tmp-corpus');

mkdirSync(dir, { recursive: true });
const gerados = [];
for (const [lang, deck] of Object.entries(BARALHOS)) {
  const linhas = ['frente\tverso\texemplo', ...deck.notas.map(n => n.join('\t'))];
  const arquivo = join(dir, `${lang}-${deck.nome.replace(/\s+/g, '-').toLowerCase()}.txt`);
  writeFileSync(arquivo, linhas.join('\n'), 'utf8');
  gerados.push({ lang, escrita: deck.escrita, notas: deck.notas.length, arquivo });
}

console.log(`${gerados.length} baralhos em ${dir}`);
for (const g of gerados) console.log(`  ${g.lang.padEnd(3)} ${String(g.notas).padStart(3)} notas  ${g.escrita}`);
