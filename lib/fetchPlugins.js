'use strict';

const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const REPO       = 'McrayNick/BLACK-MD-PLUGINS';
const BRANCH     = 'main';
const PLUGIN_DIR = path.join(__dirname, '../plugins');
if (!fs.existsSync(PLUGIN_DIR)) fs.mkdirSync(PLUGIN_DIR, { recursive: true });

async function fetchPlugins() {
  try {
    console.log('🔄 Fetching latest plugins from GitHub...');
    const res   = await fetch(`https://api.github.com/repos/${REPO}/contents/plugins?ref=${BRANCH}`);
    const files = await res.json();
    
    if (!Array.isArray(files)) {
      console.warn('⚠️ Could not read plugin list. Using local plugins.');
      return;
    }
    
    console.log('✅️ ALL Plugins loaded successfully');

    let updated = 0;
    for (const file of files) {
      if (!file.name.endsWith('.js')) continue;
      try {
        const code = await fetch(file.download_url).then(r => r.text());
        fs.writeFileSync(path.join(PLUGIN_DIR, file.name), code, 'utf8');
        updated++;
      } catch {
        console.warn(`⚠️ Failed to fetch plugin: ${file.name}`);
      }
    }
    console.log(`✅ Updated ${updated} plugins from GitHub.`);
  } catch (err) {
    console.warn('⚠️ Plugin fetch failed. Using local plugins:', err.message);
  }
}

module.exports = { fetchPlugins };
