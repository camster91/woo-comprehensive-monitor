const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

// Create dist directory
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  fs.removeSync(distDir);
}
fs.mkdirSync(distDir);

// Files and directories to include
const includePaths = [
  'admin',
  'assets',
  'includes',
  'languages',
  'woo-comprehensive-monitor.php',
  'README.md',
  'LICENSE'
];

// Copy files to dist directory
includePaths.forEach(item => {
  const src = path.join(__dirname, item);
  const dest = path.join(distDir, item);
  
  if (fs.existsSync(src)) {
    if (fs.statSync(src).isDirectory()) {
      fs.copySync(src, dest);
    } else {
      fs.copySync(src, dest);
    }
    console.log(`Copied: ${item}`);
  } else {
    console.warn(`Warning: ${item} does not exist`);
  }
});

// Create languages directory if it doesn't exist
const languagesDir = path.join(distDir, 'languages');
if (!fs.existsSync(languagesDir)) {
  fs.mkdirSync(languagesDir);
}

// Create empty .pot file for translations
const potFile = path.join(languagesDir, 'woo-comprehensive-monitor.pot');
fs.writeFileSync(potFile, `# Copyright (C) 2026 Ashbi
# This file is distributed under the GPL v2 or later.
msgid ""
msgstr ""
"Project-Id-Version: WooCommerce Comprehensive Monitor 3.0.0\\n"
"Report-Msgid-Bugs-To: \\n"
"POT-Creation-Date: ${new Date().toISOString()}\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"PO-Revision-Date: \\n"
"Last-Translator: \\n"
"Language-Team: \\n"
"Language: \\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"
"X-Generator: \\n"
"X-Domain: woo-comprehensive-monitor\\n"

msgid "WooCommerce Comprehensive Monitor"
msgstr ""
`);

console.log('\n✅ Build complete! Files copied to dist/ directory.');

// Create ZIP file
const output = fs.createWriteStream(path.join(__dirname, 'woo-comprehensive-monitor.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 }
});

output.on('close', () => {
  console.log(`\n✅ ZIP created: ${archive.pointer()} total bytes`);
  console.log('📦 Plugin ready for distribution: woo-comprehensive-monitor.zip');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add all files from dist directory
archive.directory(distDir, false);

archive.finalize();