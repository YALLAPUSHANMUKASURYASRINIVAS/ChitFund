const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Ensure 'marked' markdown parser is installed
try {
  require.resolve('marked');
} catch (e) {
  console.log("Installing 'marked' library to compile markdown...");
  execSync('npm install marked', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
}
const { marked } = require('marked');

// 2. Paths
const mdPath = path.join(__dirname, '..', 'interview_master_guide.md');
const htmlPath = path.join(__dirname, 'temp.html');
const pdfPath = path.join(__dirname, '..', 'interview_master_guide.pdf');

// 3. Read markdown
if (!fs.existsSync(mdPath)) {
  console.error(`Error: Could not find ${mdPath}`);
  process.exit(1);
}
const markdownContent = fs.readFileSync(mdPath, 'utf-8');

// 4. Compile to HTML
const htmlBody = marked(markdownContent);

// 5. Add custom CSS styling optimized for printable PDFs
const htmlDocument = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ChitLite - Interview Master Guide</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #333333;
      line-height: 1.6;
      font-size: 14px;
      margin: 20px;
    }
    h1, h2, h3, h4 {
      color: #111111;
      font-weight: 600;
      page-break-after: avoid;
    }
    h1 {
      font-size: 28px;
      border-bottom: 2px solid #eaecef;
      padding-bottom: 8px;
      margin-top: 0;
    }
    h2 {
      font-size: 20px;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 5px;
      margin-top: 30px;
      page-break-inside: avoid;
    }
    h3 {
      font-size: 16px;
      margin-top: 20px;
    }
    p, li {
      font-size: 14px;
    }
    ul, ol {
      padding-left: 20px;
    }
    li {
      margin-bottom: 5px;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 12.5px;
      background-color: rgba(27, 31, 35, 0.05);
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
    pre {
      background-color: #f6f8fa;
      border: 1px solid #eaecef;
      border-radius: 6px;
      padding: 16px;
      overflow: auto;
      page-break-inside: avoid;
      margin-bottom: 20px;
    }
    pre code {
      background-color: transparent;
      padding: 0;
      border-radius: 0;
    }
    blockquote {
      border-left: 0.25em solid #dfe2e5;
      color: #6a737d;
      padding: 0 1em;
      margin: 20px 0;
      background-color: #fafbfc;
      border-radius: 0 4px 4px 0;
    }
    blockquote p {
      margin: 8px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
      page-break-inside: avoid;
    }
    table, th, td {
      border: 1px solid #dfe2e5;
    }
    th, td {
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background-color: #f6f8fa;
    }
    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: #e1e4e6;
      border: 0;
    }
    /* Page break helpers */
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>
`;

fs.writeFileSync(htmlPath, htmlDocument, 'utf-8');
console.log("Compiled markdown to HTML successfully.");

// 6. Locate Google Chrome to compile PDF
const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Local\\Google\\Chrome\\Application\\chrome.exe'
];

let chromePath = null;
for (const p of chromePaths) {
  if (fs.existsSync(p)) {
    chromePath = p;
    break;
  }
}

if (!chromePath) {
  console.error("Error: Could not locate Google Chrome installation on Windows to print to PDF.");
  console.log("Please install Google Chrome or export the HTML file manually.");
  process.exit(1);
}

// 7. Run Chrome in headless mode to print HTML to PDF
try {
  console.log(`Using Chrome at: ${chromePath}`);
  console.log("Generating PDF file...");
  
  // Format commands for child_process exec
  const cmd = `"${chromePath}" --headless --disable-gpu --print-to-pdf="${pdfPath}" "${htmlPath}"`;
  execSync(cmd);

  console.log("-----------------------------------------");
  console.log(`SUCCESS: PDF file generated successfully!`);
  console.log(`Saved to: ${pdfPath}`);
  console.log("-----------------------------------------");
} catch (err) {
  console.error("Failed to compile PDF via Chrome CLI:", err.message);
} finally {
  // 8. Clean up temp HTML file
  if (fs.existsSync(htmlPath)) {
    fs.unlinkSync(htmlPath);
  }
}
