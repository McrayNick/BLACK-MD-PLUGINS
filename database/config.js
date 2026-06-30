'use strict';

const fs   = require('fs');
const path = require('path');

const defaultSettings = {
  antilink:       'on',
  antilinkall:    'off',
  autobio:        'off',
  antidelete:     'on',
  antitag:        'on',
  antibot:        'off',
  anticall:       'on',
  badword:        'on',
  gptdm:          'off',
  welcomegoodbye: 'off',
  autoread:       'off',
  mode:           'public',
  prefix:         '.',
  autolike:       'on',
  menutype:       'video',
  autoview:       'on',
  wapresence:     'recording'
};

// ─── Auto-detect storage backend ─────────────────────────────────────────────
const usePostgres = !!process.env.DATABASE_URL;
console.log(usePostgres
  ? '🐘 Database: PostgreSQL (DATABASE_URL detected)'
  : '📁 Database: Local JSON file (no DATABASE_URL — panel mode)'
);

// ═════════════════════════════════════════════════════════════════════════════
          // JSON FILE BACKEND
// ═════════════════════════════════════════════════════════════════════════════
if (!usePostgres) {
  const DATA_FILE = path.join(__dirname, 'localdb.json');

  function loadFile() {
    try {
      if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {}
    return { settings: { ...defaultSettings }, sudos: [] };
  }

  function saveFile(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  }

  async function initializeDatabase() {
    if (!fs.existsSync(DATA_FILE)) {
      saveFile({ settings: { ...defaultSettings }, sudos: [] });
      console.log('✅ Local JSON database created.');
    } else {
      const data = loadFile();
      let changed = false;
      for (const [k, v] of Object.entries(defaultSettings)) {
        if (!(k in data.settings)) { data.settings[k] = v; changed = true; }
      }
      if (changed) saveFile(data);
      console.log('✅ Local JSON database ready.');
    }
  }

  async function getSettings() {
    return loadFile().settings;
  }

  async function updateSetting(key, value) {
    if (!(key in defaultSettings)) return false;
    const data = loadFile();
    data.settings[key] = value;
    saveFile(data);
    return true;
  }

  async function addSudo(jid) {
    const data = loadFile();
    if (data.sudos.includes(jid)) return false;
    data.sudos.push(jid);
    saveFile(data);
    return true;
  }

  async function removeSudo(jid) {
    const data = loadFile();
    const before = data.sudos.length;
    data.sudos = data.sudos.filter(j => j !== jid);
    saveFile(data);
    return data.sudos.length < before;
  }

  async function getSudos() {
    return loadFile().sudos;
  }

  async function clearAllSudos() {
    const data = loadFile();
    const count = data.sudos.length;
    data.sudos = [];
    saveFile(data);
    return count;
  }

  module.exports = { initializeDatabase, getSettings, updateSetting, addSudo, removeSudo, getSudos, clearAllSudos };

// ═════════════════════════════════════════════════════════════════════════════
             // POSTGRESQL BACKEND
// ═════════════════════════════════════════════════════════════════════════════
} else {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  async function initializeDatabase() {
    const client = await pool.connect();
    console.log('📡 Connecting to PostgreSQL...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS bot_settings (
          id SERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT NOT NULL
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS sudo_users (
          id SERIAL PRIMARY KEY, jid TEXT UNIQUE NOT NULL
        );
      `);
      for (const [key, value] of Object.entries(defaultSettings)) {
        await client.query(
          `INSERT INTO bot_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING;`,
          [key, value]
        );
      }
      console.log('✅ PostgreSQL database initialized.');
    } catch (err) {
      console.error('❌ Initialization error:', err);
    } finally {
      client.release();
    }
  }

  async function getSettings() {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT key, value FROM bot_settings WHERE key = ANY($1::text[])`,
        [Object.keys(defaultSettings)]
      );
      const settings = { ...defaultSettings };
      for (const row of result.rows) settings[row.key] = row.value;
      return settings;
    } catch (err) {
      console.error('❌ Failed to fetch settings:', err);
      return { ...defaultSettings };
    } finally {
      client.release();
    }
  }

  async function updateSetting(key, value) {
    const client = await pool.connect();
    try {
      if (!Object.keys(defaultSettings).includes(key)) throw new Error(`Invalid key: ${key}`);
      await client.query(`UPDATE bot_settings SET value = $1 WHERE key = $2`, [value, key]);
      return true;
    } catch (err) {
      console.error('❌ Failed to update setting:', err.message);
      return false;
    } finally {
      client.release();
    }
  }

  async function addSudo(jid) {
    const client = await pool.connect();
    try {
      const r = await client.query(`INSERT INTO sudo_users (jid) VALUES ($1) ON CONFLICT (jid) DO NOTHING;`, [jid]);
      return r.rowCount > 0;
    } catch (err) { console.error('❌ addSudo:', err); return false; } finally { client.release(); }
  }

  async function removeSudo(jid) {
    const client = await pool.connect();
    try {
      const r = await client.query(`DELETE FROM sudo_users WHERE jid = $1 RETURNING jid;`, [jid]);
      return r.rowCount > 0;
    } catch (err) { console.error('❌ removeSudo:', err); return false; } finally { client.release(); }
  }

  async function getSudos() {
    const client = await pool.connect();
    try {
      const r = await client.query(`SELECT jid FROM sudo_users;`);
      return r.rows.map(r => r.jid);
    } catch (err) { console.error('❌ getSudos:', err); return []; } finally { client.release(); }
  }

  async function clearAllSudos() {
    const client = await pool.connect();
    try {
      const r = await client.query(`DELETE FROM sudo_users RETURNING jid;`);
      return r.rowCount;
    } catch (err) { console.error('❌ clearAllSudos:', err); return -1; } finally { client.release(); }
  }

  module.exports = { initializeDatabase, getSettings, updateSetting, addSudo, removeSudo, getSudos, clearAllSudos };

}
