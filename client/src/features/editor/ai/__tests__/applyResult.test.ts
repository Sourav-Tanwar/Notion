import { parseAiText, inlineMarkdownToHtml } from '../applyResult';

describe('inlineMarkdownToHtml', () => {
  test('escapes HTML to stay XSS-safe', () => {
    expect(inlineMarkdownToHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  test('converts bold, italic, strikethrough and inline code', () => {
    expect(inlineMarkdownToHtml('**bold**')).toBe('<strong>bold</strong>');
    expect(inlineMarkdownToHtml('*italic*')).toBe('<em>italic</em>');
    expect(inlineMarkdownToHtml('~~gone~~')).toBe('<s>gone</s>');
    expect(inlineMarkdownToHtml('`code`')).toBe('<code>code</code>');
  });

  test('links only allow http(s)/mailto schemes', () => {
    expect(inlineMarkdownToHtml('[site](https://example.com)')).toBe(
      '<a href="https://example.com">site</a>',
    );
    // javascript: URIs must NOT be turned into anchors.
    expect(inlineMarkdownToHtml('[x](javascript:alert(1))')).not.toContain('<a');
  });
});

describe('parseAiText', () => {
  test('parses headings by level', () => {
    expect(parseAiText('# One')).toEqual([{ type: 'heading', text: 'One' }]);
    expect(parseAiText('## Two')).toEqual([{ type: 'heading2', text: 'Two' }]);
    expect(parseAiText('### Three')).toEqual([{ type: 'heading3', text: 'Three' }]);
    // h4+ collapses to heading3
    expect(parseAiText('#### Four')).toEqual([{ type: 'heading3', text: 'Four' }]);
  });

  test('parses bullets and numbered lists', () => {
    expect(parseAiText('- a')).toEqual([{ type: 'bullet', text: 'a' }]);
    expect(parseAiText('* b')).toEqual([{ type: 'bullet', text: 'b' }]);
    expect(parseAiText('1. first')).toEqual([{ type: 'numbered', text: 'first' }]);
    expect(parseAiText('2) second')).toEqual([{ type: 'numbered', text: 'second' }]);
  });

  test('parses to-do checkboxes with checked state', () => {
    expect(parseAiText('- [ ] todo')).toEqual([
      { type: 'todo', text: 'todo', props: { checked: false } },
    ]);
    expect(parseAiText('- [x] done')).toEqual([
      { type: 'todo', text: 'done', props: { checked: true } },
    ]);
  });

  test('parses callouts before plain blockquotes', () => {
    expect(parseAiText('> [!WARNING] Careful')).toEqual([
      { type: 'callout', text: 'Careful', props: { icon: '⚠️' } },
    ]);
    expect(parseAiText('> just a quote')).toEqual([{ type: 'quote', text: 'just a quote' }]);
  });

  test('parses horizontal rules as dividers', () => {
    expect(parseAiText('---')).toEqual([{ type: 'divider', text: '' }]);
    expect(parseAiText('***')).toEqual([{ type: 'divider', text: '' }]);
  });

  test('parses fenced code blocks with language', () => {
    const out = parseAiText('```js\nconst x = 1;\n```');
    expect(out).toEqual([{ type: 'code', text: 'const x = 1;', props: { lang: 'js' } }]);
  });

  test('maps a Markdown table into a single editable table block', () => {
    const md = ['| Name | Age |', '| --- | --- |', '| Alice | 30 |', '| Bob | 25 |'].join('\n');
    expect(parseAiText(md)).toEqual([
      {
        type: 'table',
        text: '',
        props: {
          header: true,
          rows: [
            ['Name', 'Age'],
            ['Alice', '30'],
            ['Bob', '25'],
          ],
        },
      },
    ]);
  });

  test('normalises ragged table rows to the header width', () => {
    const md = ['| A | B | C |', '| --- | --- | --- |', '| 1 | 2 |'].join('\n');
    const out = parseAiText(md);
    expect(out[0].props?.rows).toEqual([
      ['A', 'B', 'C'],
      ['1', '2', ''],
    ]);
  });

  test('applies inline marks inside block text', () => {
    expect(parseAiText('- **bold** item')).toEqual([
      { type: 'bullet', text: '<strong>bold</strong> item' },
    ]);
  });

  test('treats unmatched content as a plain text block', () => {
    expect(parseAiText('just words')).toEqual([{ type: 'text', text: 'just words' }]);
  });

  test('always returns at least one block for empty input', () => {
    expect(parseAiText('')).toEqual([{ type: 'text', text: '' }]);
    expect(parseAiText('   \n  ')).toEqual([{ type: 'text', text: '' }]);
  });

  test('parses a mixed document in order', () => {
    const md = ['# Title', '', 'Intro paragraph.', '', '- one', '- two'].join('\n');
    expect(parseAiText(md)).toEqual([
      { type: 'heading', text: 'Title' },
      { type: 'text', text: 'Intro paragraph.' },
      { type: 'bullet', text: 'one' },
      { type: 'bullet', text: 'two' },
    ]);
  });
});
