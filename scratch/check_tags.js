const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// A very basic HTML tokenizer/tag balancer
const tagRegex = /<\/?([a-zA-Z0-9\-]+)(?:\s+[^>]*)?>/g;
let match;
const stack = [];
const selfClosingTags = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', '!--'
]);

let lineNum = 1;
let lastIndex = 0;

function getLineNumber(index) {
  const textBefore = html.substring(0, index);
  return textBefore.split('\n').length;
}

while ((match = tagRegex.exec(html)) !== null) {
  const tagText = match[0];
  const tagName = match[1].toLowerCase();
  const index = match.index;
  const currentLine = getLineNumber(index);

  // Ignore HTML comments (they match regex as <!-- or similar if not careful, but let's handle comment tags separately if needed)
  if (tagText.startsWith('<!--') || tagText.endsWith('-->')) {
    continue;
  }

  const isClosing = tagText.startsWith('</');

  if (selfClosingTags.has(tagName)) {
    if (isClosing) {
      console.warn(`[Line ${currentLine}] Self-closing tag <${tagName}> should not have a closing tag.`);
    }
    continue;
  }

  if (isClosing) {
    if (stack.length === 0) {
      console.error(`[Line ${currentLine}] Unexpected closing tag </${tagName}> with no matching open tag.`);
    } else {
      const last = stack.pop();
      if (last.name !== tagName) {
        console.error(`[Line ${currentLine}] Mismatched closing tag </${tagName}>. Expected </${last.name}> (opened at line ${last.line}).`);
        // Put it back to keep checking
        stack.push(last);
      }
    }
  } else {
    stack.push({ name: tagName, line: currentLine });
  }
}

if (stack.length > 0) {
  console.error('The following tags were opened but never closed:');
  stack.forEach(t => console.error(`  <${t.name}> opened at line ${t.line}`));
} else {
  console.log('All non-self-closing tags are balanced successfully!');
}
