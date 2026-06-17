'use strict';

const axios = global.axios || require('axios');

// ──  render standings rows ────────────────────────────────────────────
function standingsText(title, flag, teams) {
  let text = `📊 *${title}*\n\n`;
  for (const t of teams) {
    text += `${flag} ${t.position}. ${t.team} - ${t.points} pts\n`;
  }
  return text;
}

// ── render scorers rows ──────────────────────────────────────────────
function scorersText(title, scorers) {
  let text = `⚽ *${title}*\n\n`;
  scorers.slice(0, 10).forEach(s => {
    const medal = s.rank == 1 ? '🥇' : s.rank == 2 ? '🥈' : s.rank == 3 ? '🥉' : '⚽';
    text += `${medal} *${s.rank}. ${s.player}*`;
    if (s.team) text += ` (${s.team})`;
    text += `\nGoals: ${s.goals}`;
    if (s.assists !== undefined) text += ` | Assists: ${s.assists}`;
    if (s.penalties !== undefined) text += ` | Pens: ${s.penalties}`;
    text += '\n\n';
  });
  return text.trim();
}

module.exports = [

  // ═══════════════════════════════════════════════════════════
  // STANDINGS
  // ═══════════════════════════════════════════════════════════

  {
    command: ['epl'],
    aliases: ['premierleague'],
    description: 'Premier League standings',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        await client.sendMessage(m.chat, { react: { text: '📊', key: m.key } });
        const res = await axios.get(`${api}/epl/standings`);
        const data = res.data;
        if (!data.status || !Array.isArray(data.result?.standings)) {
          return m.reply('❌ Failed to fetch Premier League standings.');
        }
        let text = `📊 *Premier League Standings*\n\n`;
        for (const team of data.result.standings) {
          let tag = '🧱';
          if (team.position <= 4) tag = '🏆';
          else if (team.position <= 6) tag = '🥈';
          else if (team.position >= 18) tag = '⚠️';
          text += `${tag} *${team.position}. ${team.team}*\n`;
          text += `P:${team.played} W:${team.won} D:${team.draw} L:${team.lost} `;
          text += `Pts:${team.points} GD:${team.goalDifference}\n\n`;
        }
        m.reply(text);
      } catch (e) {
        m.reply('❌ Error fetching EPL standings.');
      }
    }
  },

  {
    command: ['laliga'],
    aliases: ['liga'],
    description: 'La Liga standings',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/laliga/standings`);
        m.reply(standingsText('La Liga Standings', '🇪🇦', res.data.result.standings));
      } catch {
        m.reply('❌ Error fetching La Liga.');
      }
    }
  },

  {
    command: ['bundesliga'],
    aliases: ['bdl'],
    description: 'Bundesliga standings',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/bundesliga/standings`);
        m.reply(standingsText('Bundesliga Standings', '🇩🇪', res.data.result.standings));
      } catch {
        m.reply('❌ Error fetching Bundesliga.');
      }
    }
  },

  {
    command: ['ligue1'],
    aliases: ['lg1'],
    description: 'Ligue 1 standings',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/ligue1/standings`);
        m.reply(standingsText('Ligue 1 Standings', '🇫🇷', res.data.result.standings));
      } catch {
        m.reply('❌ Error fetching Ligue 1.');
      }
    }
  },

  {
    command: ['seriea'],
    aliases: ['sl1'],
    description: 'Serie A standings',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/seriea/standings`);
        m.reply(standingsText('Serie A Standings', '🇮🇹', res.data.result.standings));
      } catch {
        m.reply('❌ Error fetching Serie A.');
      }
    }
  },

  {
    command: ['ucl'],
    aliases: ['uefa'],
    description: 'UEFA Champions League standings',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/ucl/standings`);
        m.reply(standingsText('UCL Standings', '🏆', res.data.result.standings));
      } catch {
        m.reply('❌ Error fetching UCL.');
      }
    }
  },

    {
    command: ['fifa'],
    aliases: ['ffa', 'worldcup'],
    description: 'FIFA 2026 World Cup group standings',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        await client.sendMessage(m.chat, { react: { text: '🌍', key: m.key } });
        const res = await axios.get(`${api}/fifastandings`);
        const data = res.data;

        if (!data.status || !data.result) return m.reply('❌ Could not fetch FIFA standings.');

        const tables = data.result.table?.[0]?.data?.tables || [];
        const groups = tables.filter(g => /Grp\.\s*[A-L]/i.test(g.leagueName));

        if (!groups.length) return m.reply('❌ No group standings found for 2026.');

        const medals = ['🥇', '🥈', '🔹', '🔹'];
        const gd = t.goalDifference ?? t.goalsDiff ?? t.gd ??
                       (typeof t.goalsFor === 'number' && typeof t.goalsAgainst === 'number'
                         ? t.goalsFor - t.goalsAgainst
                         : '?');

        let text = `🏆 *FIFA World Cup 2026*\n`;

        for (const group of groups) {
          const name  = group.leagueName.replace('Grp.', 'Group').trim();
          const teams = group.table?.all || [];

          text += `\n━━━━━━━━━━━━━━━━━\n`;
          text += `🚩 *${name}*\n`;
          text += `━━━━━━━━━━━━━━━━━\n`;

          for (const t of teams) {
            const icon = medals[t.idx - 1] || '🔹';
            text += `${icon} *${t.shortName || t.name}*\n`;
            text += `   Pl:${t.played} W:${t.wins} D:${t.draws} L:${t.losses} GD:${gd} | *${t.pts} pts*\n`;
          }
        }

        m.reply(text);
      } catch (e) {
        m.reply('❌ Error fetching FIFA standings.');
      }
    }
  },

  {
    command: ['euro'],
    aliases: ['eu'],
    description: 'Euro standings',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/euros/standings`);
        m.reply(standingsText('Euro Standings', '🇪🇺', res.data.result.standings));
      } catch {
        m.reply('❌ Error fetching Euro.');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // TOP SCORERS
  // ═══════════════════════════════════════════════════════════

  {
    command: ['eplscorers'],
    aliases: ['epls', 'topscorers'],
    description: 'Premier League top scorers',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        await client.sendMessage(m.chat, { react: { text: '⚽', key: m.key } });
        const res = await axios.get(`${api}/epl/scorers`);
        const data = res.data;
        if (!data.status || !Array.isArray(data.result?.topScorers)) {
          return m.reply('❌ Failed to fetch EPL scorers.');
        }
        m.reply(scorersText('Premier League Top Scorers', data.result.topScorers));
      } catch (e) {
        m.reply('❌ Error fetching EPL scorers.');
      }
    }
  },

  {
    command: ['laligascorers'],
    aliases: ['ligas'],
    description: 'La Liga top scorers',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/laliga/scorers`);
        m.reply(scorersText('La Liga Top Scorers', res.data.result.topScorers));
      } catch {
        m.reply('❌ Error fetching La Liga scorers.');
      }
    }
  },

  {
    command: ['bundesligascorers'],
    aliases: ['bdls'],
    description: 'Bundesliga top scorers',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/bundesliga/scorers`);
        m.reply(scorersText('Bundesliga Top Scorers', res.data.result.topScorers));
      } catch {
        m.reply('❌ Error fetching Bundesliga scorers.');
      }
    }
  },

  {
    command: ['serieascorers'],
    aliases: ['serieas'],
    description: 'Serie A top scorers',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/seriea/scorers`);
        m.reply(scorersText('Serie A Top Scorers', res.data.result.topScorers));
      } catch {
        m.reply('❌ Error fetching Serie A scorers.');
      }
    }
  },

  {
    command: ['ligue1scorers'],
    aliases: ['l1s'],
    description: 'Ligue 1 top scorers',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/ligue1/scorers`);
        m.reply(scorersText('Ligue 1 Top Scorers', res.data.result.topScorers));
      } catch {
        m.reply('❌ Error fetching Ligue 1 scorers.');
      }
    }
  },

  {
    command: ['uclscorers'],
    aliases: ['ucls', 'uefas'],
    description: 'UCL top scorers',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        const res = await axios.get(`${api}/ucl/scorers`);
        m.reply(scorersText('UCL Top Scorers', res.data.result.topScorers));
      } catch {
        m.reply('❌ Error fetching UCL scorers.');
      }
    }
  },

];
