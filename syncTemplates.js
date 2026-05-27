#!/usr/bin/env node

/**
 * Template Sync Script
 * Keeps .html and .ejs files in sync
 * 
 * Usage:
 *   node syncTemplates.js         # Sync all files once
 *   node syncTemplates.js --watch # Watch for changes and auto-sync
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, 'views');

// Files to sync (without extension)
const filesToSync = [
  'index',
  'login',
  'contact',
  'help',
  'blog',
  'articles',
  'podcasts',
  'carousel',
  'index-fallback'
];

/**
 * Convert HTML to EJS by replacing header/footer with partials
 */
function htmlToEjs(htmlContent, filename) {
  let content = htmlContent;
  
  // Remove header element and replace with partial include
  content = content.replace(
    /<header>[\s\S]*?<\/header>/i,
    '<%- include(\'_header\') %>'
  );
  
  // Remove footer element and replace with partial include
  content = content.replace(
    /<footer>[\s\S]*?<\/footer>/i,
    '<%- include(\'_footer\') %>'
  );
  
  return content;
}

/**
 * Convert EJS to HTML by replacing partials with actual header/footer
 */
function ejsToHtml(ejsContent, filename) {
  let content = ejsContent;
  
  // Read header and footer partials
  const headerEjs = fs.readFileSync(path.join(viewsDir, '_header.ejs'), 'utf-8');
  const footerEjs = fs.readFileSync(path.join(viewsDir, '_footer.ejs'), 'utf-8');
  
  const headerHtml = headerEjs;

  const footerMatch = footerEjs.match(/<style>[\s\S]*?<\/style>([\s\S]*)/);
  const footerHtml = footerMatch ? footerMatch[1] : '';
  
  // Replace partials with actual content
  content = content.replace(
    /<%- include\(['"]_header['"]\) %>/,
    headerHtml
  );
  
  content = content.replace(
    /<%- include\(['"]_footer['"]\) %>/,
    footerHtml
  );
  
  return content;
}

/**
 * Sync HTML file to EJS
 */
function syncHtmlToEjs(filename) {
  const htmlPath = path.join(viewsDir, `${filename}.html`);
  const ejsPath = path.join(viewsDir, `${filename}.ejs`);
  
  if (!fs.existsSync(htmlPath)) {
    console.log(`⏭️  ${filename}.html not found, skipping`);
    return;
  }
  
  try {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const ejsContent = htmlToEjs(htmlContent, filename);
    fs.writeFileSync(ejsPath, ejsContent, 'utf-8');
    console.log(`✅ Synced: ${filename}.html → ${filename}.ejs`);
  } catch (err) {
    console.error(`❌ Error syncing ${filename}:`, err.message);
  }
}

/**
 * Sync EJS file to HTML
 */
function syncEjsToHtml(filename) {
  const ejsPath = path.join(viewsDir, `${filename}.ejs`);
  const htmlPath = path.join(viewsDir, `${filename}.html`);
  
  if (!fs.existsSync(ejsPath)) {
    console.log(`⏭️  ${filename}.ejs not found, skipping`);
    return;
  }
  
  try {
    const ejsContent = fs.readFileSync(ejsPath, 'utf-8');
    const htmlContent = ejsToHtml(ejsContent, filename);
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    console.log(`✅ Synced: ${filename}.ejs → ${filename}.html`);
  } catch (err) {
    console.error(`❌ Error syncing ${filename}:`, err.message);
  }
}

/**
 * Sync all template files
 */
function syncAll(direction = 'html-to-ejs') {
  console.log(`\n🔄 Syncing templates (${direction})...\n`);
  
  if (direction === 'html-to-ejs' || direction === 'both') {
    filesToSync.forEach(filename => syncHtmlToEjs(filename));
  }
  
  if (direction === 'ejs-to-html' || direction === 'both') {
    filesToSync.forEach(filename => syncEjsToHtml(filename));
  }
  
  console.log('\n✨ Sync complete!\n');
}

/**
 * Watch mode - auto-sync on file changes
 */
async function watchMode() {
  console.log('👀 Watching for template changes...\n');
  
  try {
    // Try to use chokidar if available, otherwise use fs.watch
    let chokidar;
    try {
      chokidar = await import('chokidar');
    } catch {
      chokidar = null;
    }
    
    if (chokidar) {
      const watcher = chokidar.default.watch(
        filesToSync.map(f => path.join(viewsDir, `${f}.*`)),
        { ignored: /node_modules/ }
      );
      
      watcher.on('change', (filePath) => {
        const filename = path.basename(filePath);
        const name = filename.split('.')[0];
        const ext = filename.split('.')[1];
        
        if (ext === 'html') {
          syncHtmlToEjs(name);
        } else if (ext === 'ejs') {
          syncEjsToHtml(name);
        }
      });
      
      console.log('Press Ctrl+C to stop watching\n');
    } else {
      console.log('⚠️  chokidar not installed. Using fs.watch (less reliable).\n');
      console.log('Install with: npm install --save-dev chokidar\n');
      
      filesToSync.forEach(filename => {
        fs.watch(path.join(viewsDir, `${filename}.html`), () => {
          syncHtmlToEjs(filename);
        });
        
        fs.watch(path.join(viewsDir, `${filename}.ejs`), () => {
          syncEjsToHtml(filename);
        });
      });
      
      console.log('Press Ctrl+C to stop watching\n');
    }
  } catch (err) {
    console.error('Watch mode error:', err.message);
  }
}

// CLI
const args = process.argv.slice(2);
const watch = args.includes('--watch') || args.includes('-w');
const direction = args[0] === 'ejs-to-html' ? 'ejs-to-html' : 
                  args[0] === 'both' ? 'both' : 'html-to-ejs';

(async () => {
  if (watch) {
    await watchMode();
  } else {
    syncAll(direction);
  }
})();
