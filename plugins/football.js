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
    description: 'FIFA 2026 World Cup group standings + best thirds',
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

        const thirds = [];
        let text = `🏆 *FIFA World Cup 2026*\n`;

        for (const group of groups) {
          const name  = group.leagueName.replace('Grp.', 'Group').trim();
          const teams = group.table?.all || [];

          text += `\n━━━━━━━━━━━━━━━━━\n`;
          text += `🚩 *${name}*\n`;
          text += `━━━━━━━━━━━━━━━━━\n`;

          teams.forEach((t, i) => {
            const pos = i + 1;
            const icon = pos === 1 ? '🥇'
                       : pos === 2 ? '🥈'
                       : pos === 3 ? '3️⃣'
                       : '4️⃣';
            const gd = Number(t.goalConDiff) > 0 ? `+${t.goalConDiff}` : t.goalConDiff;

            text += `${icon} *${t.shortName || t.name}*\n`;
            text += `   Pl:${t.played} W:${t.wins} D:${t.draws} L:${t.losses} GD:${gd} | *${t.pts} pts*\n`;

            if (pos === 3) {
              thirds.push({
                group: name.replace('Group', 'Grp'),
                name: t.shortName || t.name,
                played: t.played,
                wins: t.wins,
                draws: t.draws,
                losses: t.losses,
                gd: Number(t.goalConDiff),
                gf: Number(t.goalConFor ?? t.scored ?? 0),
                pts: Number(t.pts)
              });
            }
          });
        }

        // ── Best Thirds ────────────────────
        if (thirds.length) {
          thirds.sort((a, b) =>
            b.pts - a.pts ||
            b.gd  - a.gd  ||
            b.gf  - a.gf  ||
            a.name.localeCompare(b.name)
          );

          text += `\n\n🔥 *Best Third-Placed Teams*\n`;
          text += `━━━━━━━━━━━━━━━━━━━━\n`;
          text += `_(Best 8 of 12 advance to Round of 32)_\n\n`;

          thirds.forEach((t, i) => {
            const qualifies = i < 8;
            const icon = i === 0 ? '🥇'
                       : i === 1 ? '🥈'
                       : i === 2 ? '🥉'
                       : qualifies ? '✅' : '❌';
            const status = qualifies ? '*QUALIFIES ✅*' : 'Eliminated ❌';
            const gd = t.gd > 0 ? `+${t.gd}` : t.gd;
            text += `${icon} *${t.name}* (${t.group})\n`;
            text += `   Pl:${t.played} W:${t.wins} D:${t.draws} L:${t.losses} GD:${gd} | *${t.pts} pts* — ${status}\n\n`;
          });
        }

        m.reply(text);
      } catch (e) {
        m.reply('❌ Error fetching FIFA standings.');
      }
    }
  }, 

    {
    command: ['fifaplayoffs'],
    aliases: ['playoffs', 'wcbracket', 'wcko'],
    description: 'FIFA World Cup knockout bracket',
    category: 'football',
    handler: async (client, m, { api }) => {
      try {
        await client.sendMessage(m.chat, { react: { text: '🏆', key: m.key } });
        const res = await axios.get(`${api}/fifastandings`);
        const data = res.data;

        if (!data?.status) return m.reply('❌ FIFA data unavailable.');

        const playoff = data.result?.playoff;
        if (!playoff?.rounds?.length) return m.reply('❌ Knockout bracket not available yet. Check back once the group stage ends.');

        const season = data.result.details?.selectedSeason || '2026';

        const stageLabels = {
          '1/16':  '🔵 ROUND OF 32',
          '1/8':   '🟢 ROUND OF 16',
          '1/4':   '🟡 QUARTER-FINALS',
          '1/2':   '🟠 SEMI-FINALS',
          'final': '🏆 FINAL'
        };

        let txt = `🏆 *FIFA WORLD CUP ${season}*\n`;
        txt += `🎯 *KNOCKOUT BRACKET*\n`;

        for (const round of playoff.rounds) {
          const label = stageLabels[round.stage] || `🔘 ${round.stage.toUpperCase()}`;
          txt += `\n━━━━━━━━━━━━━━━━━\n`;
          txt += `*${label}*\n`;
          txt += `━━━━━━━━━━━━━━━━━\n`;

          for (const matchup of round.matchups) {
            const match = matchup.matches?.[0];
            const home = matchup.homeTeam || 'TBD';
            const away = matchup.awayTeam || 'TBD';

            if (!match || !match.status?.started) {
              const date = match?.status?.utcTime
                ? new Date(match.status.utcTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                : 'TBD';
              txt += `⚽ ${home} 🆚 ${away}  _(${date})_\n`;
            } else if (match.status?.finished) {
              const hScore = match.home?.score ?? 0;
const aScore = match.away?.score ?? 0;
const winner = matchup.aggregatedWinner;
let winnerName = null;
if (winner) {
  if (match.home?.id == winner) winnerName = home;
  else if (match.away?.id == winner) winnerName = away;
  else if (hScore > aScore) winnerName = home;
  else if (aScore > hScore) winnerName = away;
}
txt += `✅ *${home} ${hScore} - ${aScore} ${away}*`;
if (winnerName) txt += `  → *${winnerName}* advances`;
              txt += `\n`;
            } else {
              const hScore = match.home?.score ?? 0;
              const aScore = match.away?.score ?? 0;
              txt += `🔴 *LIVE* ${home} ${hScore} - ${aScore} ${away}\n`;
            }
          }
        }

        // Bronze Final
        const bronze = playoff.bronzeFinal;
        if (bronze?.matchups?.length) {
          txt += `\n━━━━━━━━━━━━━━━━━\n`;
          txt += `*🥉 THIRD PLACE*\n`;
          txt += `━━━━━━━━━━━━━━━━━\n`;
          const bMatch = bronze.matchups[0];
          const bHome = bMatch.homeTeam || 'TBD';
          const bAway = bMatch.awayTeam || 'TBD';
          const bm = bMatch.matches?.[0];
          if (bm?.status?.finished) {
            txt += `✅ *${bHome} ${bm.home?.score} - ${bm.away?.score} ${bAway}*\n`;
          } else if (bm?.status?.started) {
            txt += `🔴 *LIVE* ${bHome} ${bm.home?.score} - ${bm.away?.score} ${bAway}\n`;
          } else {
            const date = bm?.status?.utcTime
              ? new Date(bm.status.utcTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
              : 'TBD';
            txt += `⚽ ${bHome} 🆚 ${bAway}  _(${date})_\n`;
          }
        }

        await client.sendMessage(m.chat, { text: txt }, { quoted: m });

      } catch (e) {
        console.error('FIFA Playoff Error:', e);
        m.reply('❌ Error fetching FIFA bracket.');
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
