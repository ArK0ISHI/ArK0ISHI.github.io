#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOOK_TITLE = '东方紫雨幽蝶';
const EXPECTED_ENTRY_COUNT = 91;
const EXPECTED_RAW_SCENE_REFERENCES = 470;
const EXPECTED_SCENE_DEFINITIONS = 6;
const EXPECTED_SCENE_BREAKS = 464;
const EXPECTED_TIME_NOTES = 20;
const EXPECTED_EMPHASIS = 5;
const EXPECTED_LITERAL_STARS = 5;
const LITERAL_STAR_TOKEN = '__ZIYUDIE_LITERAL_STAR__';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--source') {
      options.source = argv[index + 1];
      index += 1;
    } else if (argument === '--output') {
      options.output = argv[index + 1];
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      fail(`未知参数：${argument}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`用法：
  node scripts/import-ziyudie-novel.mjs --source <东方紫雨幽蝶目录> [--output <输出目录>]

示例：
  node scripts/import-ziyudie-novel.mjs --source "<source-directory>" #PS
`);
}

function skipWhitespace(text, start) {
  let cursor = start;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  return cursor;
}

function consumeBalanced(text, start, opening, closing) {
  if (text[start] !== opening) {
    fail(`无法解析 TeX：位置 ${start} 应为 ${opening}`);
  }

  let depth = 0;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    const escaped = cursor > 0 && text[cursor - 1] === '\\';

    if (!escaped && character === opening) depth += 1;
    if (!escaped && character === closing) depth -= 1;
    if (depth === 0) return cursor + 1;
  }

  fail(`无法解析 TeX：从位置 ${start} 开始的 ${opening}${closing} 未闭合`);
}

function stripCommandDefinitions(text, commandName) {
  const marker = `\\${commandName}`;
  let result = text;
  let searchFrom = 0;

  while (true) {
    const commandStart = result.indexOf(marker, searchFrom);
    if (commandStart === -1) break;

    let cursor = commandStart + marker.length;
    cursor = skipWhitespace(result, cursor);
    if (result[cursor] === '*') cursor = skipWhitespace(result, cursor + 1);

    if (result[cursor] !== '{') {
      searchFrom = cursor;
      continue;
    }

    cursor = consumeBalanced(result, cursor, '{', '}');
    cursor = skipWhitespace(result, cursor);

    while (result[cursor] === '[') {
      cursor = consumeBalanced(result, cursor, '[', ']');
      cursor = skipWhitespace(result, cursor);
    }

    if (result[cursor] !== '{') {
      searchFrom = cursor;
      continue;
    }

    cursor = consumeBalanced(result, cursor, '{', '}');
    result = `${result.slice(0, commandStart)}${result.slice(cursor)}`;
    searchFrom = commandStart;
  }

  return result;
}

function extractNewCommandBody(text, commandName) {
  const marker = `\\newcommand{\\${commandName}}`;
  const commandStart = text.indexOf(marker);
  if (commandStart === -1) fail(`main-v2.tex 中未找到 \\${commandName}`);

  let cursor = skipWhitespace(text, commandStart + marker.length);
  while (text[cursor] === '[') {
    cursor = consumeBalanced(text, cursor, '[', ']');
    cursor = skipWhitespace(text, cursor);
  }

  if (text[cursor] !== '{') fail(`无法读取 \\${commandName} 的正文`);
  const end = consumeBalanced(text, cursor, '{', '}');
  return text.slice(cursor + 1, end - 1);
}

function removeCommentLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*%/.test(line))
    .join('\n');
}

function normalizeSource(text) {
  return removeCommentLines(
    stripCommandDefinitions(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), 'providecommand'),
  );
}

function replaceSimpleBracedCommand(text, commandName, renderer) {
  const expression = new RegExp(`\\\\${commandName}\\{([^{}]*)\\}`, 'g');
  let previous;
  let result = text;

  do {
    previous = result;
    result = result.replace(expression, (_, value) => renderer(value));
  } while (result !== previous);

  return result;
}

function cleanInlineTeX(value, { keepLineBreaks = false } = {}) {
  let result = value.trim();
  result = replaceSimpleBracedCommand(result, 'emph', (content) => `<em>${content}</em>`);
  result = replaceSimpleBracedCommand(result, 'calligra', (content) => content);
  result = result.replace(/\\LaTeX\{\}/g, 'LaTeX');
  result = result.replace(/\\(?:small|large|Large)\b/g, '');
  result = result.replace(/\\\\/g, keepLineBreaks ? '<br />' : ' ');
  result = result.replace(/\\\s+/g, ' ');
  result = result.replace(/[{}]/g, '');
  result = result.replace(/\s*<br \/>\s*/g, '<br />');
  result = result.replace(/[ \t]+/g, ' ').trim();
  return result;
}

function renderCenteredBlock(content) {
  const cleaned = cleanInlineTeX(content, { keepLineBreaks: true });

  if (/春死なむ|望月のころ/.test(cleaned)) {
    return `\n\n<blockquote class="novel-verse">${cleaned}</blockquote>\n\n`;
  }

  if (/第一部完/.test(cleaned)) {
    return `\n\n<p class="novel-end-mark">${cleaned}</p>\n\n`;
  }

  return `\n\n<p class="novel-time-note">${cleaned}</p>\n\n`;
}

function renderSignature(content) {
  const cleaned = cleanInlineTeX(content, { keepLineBreaks: true }).replace(/^--\s*/, '');
  return `\n\n<p class="novel-signature">${cleaned}</p>\n\n`;
}

function normalizeMarkdown(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^[ \t]+|[ \t]+$/g, ''))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function convertBody(source, { removeEditorialNote = false } = {}) {
  let result = source.replace(/\*/g, LITERAL_STAR_TOKEN);

  if (removeEditorialNote) {
    result = result.replace(/\\editorialnote\{[^{}]*\}/g, '');
  }

  result = replaceSimpleBracedCommand(result, 'afterwordsubtitle', (title) => `\n\n## ${title}\n\n`);
  result = result.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, (_, content) =>
    renderCenteredBlock(content),
  );
  result = result.replace(/\\begin\{flushright\}([\s\S]*?)\\end\{flushright\}/g, (_, content) =>
    renderSignature(content),
  );
  result = result.replace(/\\sceneBreak\b/g, '\n\n<hr class="novel-scene-break" aria-label="场景转换" />\n\n');
  result = result.replace(/\\addcontentsline\{[^{}]*\}\{[^{}]*\}\{[^{}]*\}/g, '');
  result = result.replace(/\\(?:clearpage|phantomsection|bigskip|par)\b/g, '');
  result = result.replace(/\\markboth\{[^{}]*\}\{[^{}]*\}/g, '');
  result = result.replace(/\\vspace\*?\{[^{}]*\}/g, '');
  result = result.replace(/\\LaTeX\{\}/g, 'LaTeX');
  result = replaceSimpleBracedCommand(result, 'emph', (content) => `<em>${content}</em>`);
  result = replaceSimpleBracedCommand(result, 'calligra', (content) => content);
  result = result.replace(/\\(?:small|large|Large)\b/g, '');
  result = result.replace(new RegExp(LITERAL_STAR_TOKEN, 'g'), '\\*');
  return normalizeMarkdown(result);
}

function extractChapter(normalizedSource, chapterNumber) {
  const titleMatch = normalizedSource.match(/\\novelchapter\{([^{}]+)\}/);
  if (!titleMatch) fail(`ch${String(chapterNumber).padStart(2, '0')}.tex 缺少 \\novelchapter`);

  const title = titleMatch[1].trim();
  const body = normalizedSource.replace(titleMatch[0], '').trim();
  return { title, body };
}

function splitChapterFive(body) {
  const interludeHeading = /\\section\*\{([^{}]+)\}\s*\\addcontentsline\{toc\}\{section\}\{([^{}]+)\}/;
  const match = body.match(interludeHeading);
  if (!match || match.index === undefined) fail('ch05.tex 中未找到间奏标题');

  return {
    chapterBody: body.slice(0, match.index).trim(),
    interludeTitle: match[1].trim(),
    interludeBody: body.slice(match.index + match[0].length).trim(),
  };
}

function yamlString(value) {
  return JSON.stringify(value);
}

function frontmatter(entry) {
  const fields = [
    '---',
    `title: ${yamlString(entry.title)}`,
    `book: ${yamlString(BOOK_TITLE)}`,
    `order: ${entry.order}`,
    `kind: ${yamlString(entry.kind)}`,
  ];

  if (entry.chapterNumber !== undefined) fields.push(`chapterNumber: ${entry.chapterNumber}`);

  fields.push(
    `sourceFile: ${yamlString(entry.sourceFile)}`,
    `description: ${yamlString(entry.description)}`,
    '---',
  );

  return fields.join('\n');
}

function renderEntry(entry) {
  return `${frontmatter(entry)}\n\n${entry.body}\n`;
}

function countMatches(text, expression) {
  return text.match(expression)?.length ?? 0;
}

function plainCharacterCount(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s/g, '').length;
}

function validateEntries(entries, sourceSceneReferences, sourceSceneDefinitions) {
  if (entries.length !== EXPECTED_ENTRY_COUNT) {
    fail(`条目数错误：应为 ${EXPECTED_ENTRY_COUNT}，实际为 ${entries.length}`);
  }

  const orders = entries.map(({ order }) => order);
  const expectedOrders = Array.from({ length: EXPECTED_ENTRY_COUNT }, (_, index) => index + 1);
  if (JSON.stringify(orders) !== JSON.stringify(expectedOrders)) fail('order 字段不是连续的 1–91');

  const chapterEntries = entries.filter(({ kind }) => kind === 'chapter');
  const interludeEntries = entries.filter(({ kind }) => kind === 'interlude');
  const afterwordEntries = entries.filter(({ kind }) => kind === 'afterword');
  if (chapterEntries.length !== 88) fail(`正文章数错误：${chapterEntries.length}`);
  if (interludeEntries.length !== 1) fail(`间奏数错误：${interludeEntries.length}`);
  if (afterwordEntries.length !== 2) fail(`后记数错误：${afterwordEntries.length}`);

  const allBodies = entries.map(({ body }) => body).join('\n');
  const sceneBreaks = countMatches(allBodies, /class="novel-scene-break"/g);
  const timeNotes = countMatches(allBodies, /class="novel-time-note"/g);
  const emphasis = countMatches(allBodies, /<em>/g);
  const literalStars = countMatches(allBodies, /\\\*/g);
  const endMarks = countMatches(allBodies, /class="novel-end-mark"/g);
  const verses = countMatches(allBodies, /class="novel-verse"/g);
  const signatures = countMatches(allBodies, /class="novel-signature"/g);

  if (sourceSceneReferences !== EXPECTED_RAW_SCENE_REFERENCES) {
    fail(
      `源文件 sceneBreak 字面引用数错误：应为 ${EXPECTED_RAW_SCENE_REFERENCES}，实际为 ${sourceSceneReferences}`,
    );
  }
  if (sourceSceneDefinitions !== EXPECTED_SCENE_DEFINITIONS) {
    fail(`源文件 sceneBreak 宏定义数错误：应为 ${EXPECTED_SCENE_DEFINITIONS}，实际为 ${sourceSceneDefinitions}`);
  }
  const semanticSourceSceneBreaks = sourceSceneReferences - sourceSceneDefinitions;
  if (semanticSourceSceneBreaks !== EXPECTED_SCENE_BREAKS) {
    fail(`源文件实际 sceneBreak 调用数错误：${semanticSourceSceneBreaks}`);
  }
  if (sceneBreaks !== semanticSourceSceneBreaks) {
    fail(`sceneBreak 转换有丢失：${semanticSourceSceneBreaks} → ${sceneBreaks}`);
  }
  if (timeNotes !== EXPECTED_TIME_NOTES) fail(`时间提示数错误：${timeNotes}`);
  if (emphasis !== EXPECTED_EMPHASIS) fail(`强调标记数错误：${emphasis}`);
  if (literalStars !== EXPECTED_LITERAL_STARS) fail(`正文星号数错误：${literalStars}`);
  if (endMarks !== 1) fail(`结篇标记数错误：${endMarks}`);
  if (verses !== 1) fail(`和歌块数错误：${verses}`);
  if (signatures !== 2) fail(`署名块数错误：${signatures}`);

  const residualControlSequence = allBodies.match(/\\[A-Za-z@]+/g);
  if (residualControlSequence) {
    fail(`仍有 TeX 控制序列：${[...new Set(residualControlSequence)].join(', ')}`);
  }

  const residualBackslash = allBodies.replace(/\\\*/g, '').match(/\\/g);
  if (residualBackslash) fail(`仍有 ${residualBackslash.length} 个未解释的反斜杠`);
  if (/editorialnote|88章莫名其妙/.test(allBodies)) fail('ch89 内部编辑批注未删除');
  if (entries.some(({ body }) => body.length === 0)) fail('存在空正文条目');

  return {
    entries: entries.length,
    chapters: chapterEntries.length,
    interludes: interludeEntries.length,
    afterwords: afterwordEntries.length,
    rawSceneReferences: sourceSceneReferences,
    sceneDefinitions: sourceSceneDefinitions,
    sceneBreaks,
    timeNotes,
    emphasis,
    literalStars,
    endMarks,
    verses,
    signatures,
    plainCharacters: plainCharacterCount(allBodies),
    residualTexCommands: 0,
  };
}

function addEntry(entries, entry) {
  const order = entries.length + 1;
  const filename = `${String(order).padStart(3, '0')}-${entry.slug}.md`;
  entries.push({ ...entry, order, filename });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.source) {
    printUsage();
    fail('必须提供 --source');
  }

  const sourceRoot = path.resolve(options.source);
  const chaptersDirectory = path.join(sourceRoot, 'chapters');
  const mainV2Path = path.join(sourceRoot, 'main-v2.tex');
  const outputDirectory = options.output
    ? path.resolve(options.output)
    : path.join(repositoryRoot, 'src', 'content', 'novel', 'ziyudie');

  const rawChapters = new Map();
  for (let chapterNumber = 1; chapterNumber <= 89; chapterNumber += 1) {
    const basename = `ch${String(chapterNumber).padStart(2, '0')}.tex`;
    const chapterPath = path.join(chaptersDirectory, basename);
    rawChapters.set(chapterNumber, await readFile(chapterPath, 'utf8'));
  }
  const mainV2Source = await readFile(mainV2Path, 'utf8');

  const sourceSceneReferences = [...rawChapters.values()].reduce(
    (total, source) => total + countMatches(source, /\\sceneBreak\b/g),
    0,
  );
  const sourceSceneDefinitions = [...rawChapters.values()].reduce(
    (total, source) => total + countMatches(source, /\\providecommand\{\\sceneBreak\}/g),
    0,
  );

  const entries = [];
  for (let chapterNumber = 1; chapterNumber <= 88; chapterNumber += 1) {
    const basename = `ch${String(chapterNumber).padStart(2, '0')}.tex`;
    const chapter = extractChapter(normalizeSource(rawChapters.get(chapterNumber)), chapterNumber);

    if (chapterNumber === 5) {
      const split = splitChapterFive(chapter.body);
      addEntry(entries, {
        slug: 'chapter-05',
        title: chapter.title,
        kind: 'chapter',
        chapterNumber,
        sourceFile: `chapters/${basename}`,
        description: `《${BOOK_TITLE}》第一部〈白玉楼阁〉第${chapterNumber}章。`,
        body: convertBody(split.chapterBody),
      });
      addEntry(entries, {
        slug: 'interlude-01',
        title: split.interludeTitle,
        kind: 'interlude',
        sourceFile: `chapters/${basename}`,
        description: `《${BOOK_TITLE}》第一部〈白玉楼阁〉间奏。`,
        body: convertBody(split.interludeBody),
      });
      continue;
    }

    addEntry(entries, {
      slug: `chapter-${String(chapterNumber).padStart(2, '0')}`,
      title: chapter.title,
      kind: 'chapter',
      chapterNumber,
      sourceFile: `chapters/${basename}`,
      description: `《${BOOK_TITLE}》第一部〈白玉楼阁〉第${chapterNumber}章。`,
      body: convertBody(chapter.body),
    });
  }

  const authorAfterword = extractChapter(normalizeSource(rawChapters.get(89)), 89);
  addEntry(entries, {
    slug: 'author-afterword',
    title: authorAfterword.title,
    kind: 'afterword',
    sourceFile: 'chapters/ch89.tex',
    description: '原作者 coolcate 写于第一部〈白玉楼阁〉完结后的创作感言。',
    body: convertBody(authorAfterword.body, { removeEditorialNote: true }),
  });

  let editorAfterword = extractNewCommandBody(mainV2Source.replace(/\r\n?/g, '\n'), 'makeeditorsafterword');
  editorAfterword = removeCommentLines(editorAfterword);
  editorAfterword = editorAfterword.replace(
    /\\chapterdisplay\{整理校订记\}\{整理者后记\}/,
    '',
  );
  addEntry(entries, {
    slug: 'editor-afterword',
    title: '整理校订记',
    kind: 'afterword',
    sourceFile: 'main-v2.tex',
    description: '亚略 Ar 为 v2.0 整理校订版所写的校订与装帧后记。',
    body: convertBody(editorAfterword),
  });

  const validation = validateEntries(entries, sourceSceneReferences, sourceSceneDefinitions);
  await mkdir(outputDirectory, { recursive: true });

  const expectedFilenames = new Set(entries.map(({ filename }) => filename));
  const existingFilenames = (await readdir(outputDirectory)).filter((filename) => filename.endsWith('.md'));
  const unexpectedFilenames = existingFilenames.filter((filename) => !expectedFilenames.has(filename));
  if (unexpectedFilenames.length > 0) {
    fail(`输出目录含有脚本不会覆盖的 Markdown：${unexpectedFilenames.join(', ')}`);
  }

  await Promise.all(
    entries.map((entry) => writeFile(path.join(outputDirectory, entry.filename), renderEntry(entry), 'utf8')),
  );

  const writtenFiles = (await readdir(outputDirectory)).filter((filename) => filename.endsWith('.md'));
  if (writtenFiles.length !== EXPECTED_ENTRY_COUNT) {
    fail(`写入后文件数错误：应为 ${EXPECTED_ENTRY_COUNT}，实际为 ${writtenFiles.length}`);
  }

  console.log(
    JSON.stringify(
      {
        source: sourceRoot,
        output: outputDirectory,
        ...validation,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
