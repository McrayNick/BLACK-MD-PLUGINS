'use strict';

const axios = global.axios || require('axios');

function formatNum(n) {
  if (!n && n !== 0) return 'N/A';
  n = Number(n);
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function getUsername(text) {
  return text.trim()
    .replace(/https?:\/\/(www\.)?(instagram\.com|tiktok\.com|twitter\.com|x\.com|facebook\.com)\/@?/i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();
}

module.exports = [

  // ── INSTAGRAM ──────────────────────────────────────────────────────────────
    {
  command: ['igstalk'],
  aliases: ['instastalk', 'stalkim'],
  description: 'Stalk an Instagram profile',
  category: 'stalk',
  handler: async (client, m, { reply, text, api }) => {
    if (!text) return reply('📸 Usage: *.igstalk <username>*\nExample: *.igstalk cristiano*');
    const username = text.trim()
      .replace(/https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/^@/, '').split(/[/?#]/)[0].trim();
    try {
      reply(`🔍 Fetching *@${username}* on Instagram...`);

      const res = await axios.get(
        `${api}/stalker/ig?user=${encodeURIComponent(username)}`,
        { timeout: 15000 }
      );

      const d = res.data;
      if (!d || d.status === false) return reply('❌ User not found or profile is private.');

      // Access the result object properly
      const result = d.result;
      
      const caption =
        `📸 *Instagram Profile*\n\n` +
        `👤 *Name:* ${result.name || username}\n` +
        `🔖 *Username:* @${result.username || username}\n` +
        `📝 *Bio:* ${result.bio || 'N/A'}\n` +
        `🌐 *Website:* ${result.bioLinks?.[0]?.url || 'None'}\n\n` +
        `📊 *Stats*\n` +
        `👥 *Followers:* ${formatNum(result.followers || 0)}\n` +
        `➡️ *Following:* ${formatNum(result.following || 0)}\n` +
        `🖼️ *Posts:* ${formatNum(result.posts || 0)}\n\n` +
        `🏢 *Business:* ${result.isBusiness ? 'Yes' : 'No'}\n\n` +
        `📅 *Joined:* ${new Date(result.created_at).toLocaleDateString()}\n\n` +
        `🔗 https://instagram.com/${result.username || username}`;

      const pfp = result.profilePic;
      if (pfp) {
        await client.sendMessage(m.chat, { image: { url: pfp }, caption }, { quoted: m });
      } else {
        await client.sendMessage(m.chat, { text: caption }, { quoted: m });
      }
    } catch (err) {
      console.error('igstalk error:', err.message);
      reply('❌ Could not fetch Instagram profile. Username may not exist or is private.');
    }
  }
  },
  // ── TIKTOK ─────────────────────────────────────────────────────────────────
  {
    command: ['ttstalk'],
    aliases: ['tikstalk', 'tiktokstalk'],
    description: 'Stalk a TikTok profile',
    category: 'stalk',
    handler: async (client, m, { reply, text }) => {
      if (!text) return reply('🎵 Usage: *.ttstalk <username>*\nExample: *.ttstalk charlidamelio*');
      const username = getUsername(text);
      try {
        reply(`🔍 Fetching *@${username}* on TikTok...`);

        const res = await axios.get(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 15000,
        });

        const html = res.data;

        let user = null, stats = null;
        const scriptMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
          try {
            const find = (obj, check, depth = 0) => {
              if (depth > 8 || !obj || typeof obj !== 'object') return null;
              if (check(obj)) return obj;
              for (const v of Object.values(obj)) { const r = find(v, check, depth + 1); if (r) return r; }
              return null;
            };
            const pageData = JSON.parse(scriptMatch[1]);
            user  = find(pageData, o => o.uniqueId && o.nickname);
            stats = find(pageData, o => 'followerCount' in o && 'followingCount' in o);
          } catch (_) {}
        }

        const getMeta = (prop) =>
          html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]
          || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'))?.[1];

        if (!user) {
          const caption =
            `🎵 *TikTok Profile*\n\n` +
            `👤 *Username:* @${username}\n` +
            `📌 *Title:* ${getMeta('title') || 'N/A'}\n` +
            `📝 *About:* ${getMeta('description') || 'N/A'}\n\n` +
            `🔗 https://tiktok.com/@${username}`;
          const img = getMeta('image');
          if (img) return await client.sendMessage(m.chat, { image: { url: img }, caption }, { quoted: m });
          return await client.sendMessage(m.chat, { text: caption }, { quoted: m });
        }

        const caption =
          `🎵 *TikTok Profile*\n\n` +
          `👤 *Name:* ${user.nickname}\n` +
          `🔖 *Username:* @${user.uniqueId}\n` +
          `📝 *Bio:* ${user.signature || 'N/A'}\n\n` +
          `📊 *Stats*\n` +
          `👥 *Followers:* ${formatNum(stats?.followerCount)}\n` +
          `➡️ *Following:* ${formatNum(stats?.followingCount)}\n` +
          `❤️ *Likes:* ${formatNum(stats?.heartCount || stats?.heart)}\n` +
          `🎬 *Videos:* ${formatNum(stats?.videoCount)}\n\n` +
          `✅ *Verified:* ${user.verified ? 'Yes ✔️' : 'No'}\n` +
          `🔒 *Private:* ${user.privateAccount ? 'Yes' : 'No'}\n\n` +
          `🔗 https://tiktok.com/@${user.uniqueId}`;

        const pfp = user.avatarLarger || user.avatarMedium;
        if (pfp) {
          await client.sendMessage(m.chat, { image: { url: pfp }, caption }, { quoted: m });
        } else {
          await client.sendMessage(m.chat, { text: caption }, { quoted: m });
        }
      } catch (err) {
        console.error('ttstalk error:', err.message);
        reply('❌ Could not fetch TikTok profile. Username may not exist.');
      }
    }
  },

  // ── TWITTER / X ────────────────────────────────────────────────────────────
  {
    command: ['twstalk'],
    aliases: ['twitterstalk', 'xstalk'],
    description: 'Stalk a Twitter/X profile',
    category: 'stalk',
    handler: async (client, m, { reply, text }) => {
      if (!text) return reply('🐦 Usage: *.twstalk <username>*\nExample: *.twstalk elonmusk*');
      const username = getUsername(text);
      try {
        reply(`🔍 Fetching *@${username}* on Twitter/X...`);

        const res = await axios.get(`https://api.fxtwitter.com/${encodeURIComponent(username)}`, {
          timeout: 15000,
        });

        const u = res.data?.user;
        if (!u) return reply('❌ User not found or account is private/suspended.');

        const joined = u.joined ? new Date(u.joined).toDateString() : 'N/A';

        const caption =
          `🐦 *Twitter / X Profile*\n\n` +
          `👤 *Name:* ${u.name}\n` +
          `🔖 *Username:* @${u.screen_name}\n` +
          `📝 *Bio:* ${u.description || 'N/A'}\n` +
          `📍 *Location:* ${u.location || 'N/A'}\n` +
          `🌐 *Website:* ${u.website || 'None'}\n` +
          `📅 *Joined:* ${joined}\n\n` +
          `📊 *Stats*\n` +
          `👥 *Followers:* ${formatNum(u.followers)}\n` +
          `➡️ *Following:* ${formatNum(u.following)}\n` +
          `🐦 *Tweets:* ${formatNum(u.tweets)}\n` +
          `❤️ *Likes:* ${formatNum(u.likes)}\n\n` +
          `✅ *Verified:* ${u.verification?.verified ? 'Yes ✔️' : 'No'}\n` +
          `🔒 *Protected:* ${u.protected ? 'Yes' : 'No'}\n\n` +
          `🔗 https://x.com/${u.screen_name}`;

        const pfp = u.avatar_url?.replace('_normal', '_400x400');
        if (pfp) {
          await client.sendMessage(m.chat, { image: { url: pfp }, caption }, { quoted: m });
        } else {
          await client.sendMessage(m.chat, { text: caption }, { quoted: m });
        }
      } catch (err) {
        console.error('twstalk error:', err.message);
        reply('❌ Could not fetch Twitter profile. Username may not exist or account is suspended.');
      }
    }
  },

  // ── FACEBOOK ───────────────────────────────────────────────────────────────

{
  command: ['fbstalk'],
  aliases: ['facebookstalk', 'stalkfb'],
  description: 'Stalk a Facebook profile or page',
  category: 'stalk',
  handler: async (client, m, { reply, text }) => {
    if (!text) return reply('📘 Usage: *.fbstalk <username>*\nExample: *.fbstalk zuck*');
    const username = text.trim()
      .replace(/https?:\/\/(www\.)?facebook\.com\//i, '')
      .replace(/^@/, '').split(/[/?#]/)[0].trim();

    try {
      reply(`🔍 Fetching *${username}* on Facebook...`);

      const decode = s =>
        (s || '')
          .replace(/&#xb7;/gi, '·').replace(/&#183;/g, '·').replace(/&middot;/g, '·')
          .replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c))
          .replace(/<[^>]+>/g, '').trim();

      const extract = (html, patterns) => {
        for (const re of patterns) {
          const match = html.match(re);
          if (match?.[1]) return decode(match[1]);
        }
        return null;
      };

      const mbasicRes = await axios.get(
        `https://mbasic.facebook.com/${encodeURIComponent(username)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: 15000,
          maxRedirects: 5,
        }
      ).catch(() => null);

      const mhtml = mbasicRes?.data || '';

      const ogRes = await axios.get(
        `https://www.facebook.com/${encodeURIComponent(username)}`,
        {
          headers: {
            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 15000,
          maxRedirects: 5,
        }
      ).catch(() => null);

      const ohtml = ogRes?.data || '';

      const getMeta = (prop, html) =>
        html.match(new RegExp(`property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]?.trim()
        || html.match(new RegExp(`content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'))?.[1]?.trim();

      const name    = decode(getMeta('title', ohtml) || getMeta('title', mhtml)) || username;
      const image   = getMeta('image', ohtml) || getMeta('image', mhtml);
      const isRealImage = image && !image.includes('rsrc.php') && image.length > 80;

      const rawBio  = decode(getMeta('description', ohtml) || getMeta('description', mhtml) || '');
      const bio = rawBio
        .replace(/[\d,]+\s+(followers?|following|likes?|talking about this)(\s*·\s*)?/gi, '')
        .replace(/^[^.]+\.\s*/, '')
        .trim() || 'N/A';

      const followers = extract(mhtml, [
        /([\d,.]+\s*[KMB]?)\s*follower/i,
        /follower[^<]*?(\d[\d,.]*\s*[KMB]?)/i,
      ]) || extract(rawBio, [/([\d,]+)\s*follower/i]) || null;

      const following = extract(mhtml, [
        /([\d,.]+\s*[KMB]?)\s*following/i,
        /following[^<]*?(\d[\d,.]*\s*[KMB]?)/i,
      ]) || extract(rawBio, [/([\d,]+)\s*following/i]) || null;

      const posts = extract(mhtml, [
        /([\d,.]+\s*[KMB]?)\s*posts?/i,
        /posts?[^<]*?(\d[\d,.]*\s*[KMB]?)/i,
      ]) || null;

      const likes = extract(mhtml, [
        /([\d,.]+\s*[KMB]?)\s*(?:people\s+)?like\s+this/i,
        /([\d,.]+\s*[KMB]?)\s*likes?\b/i,
      ]) || extract(rawBio, [/([\d,]+)\s+likes/i]) || null;

      const talking = extract(mhtml, [
        /([\d,.]+\s*[KMB]?)\s*talking about this/i,
        /talking about this[^<]*?(\d[\d,.]*\s*[KMB]?)/i,
      ]) || extract(rawBio, [/([\d,]+)\s+talking about this/i]) || null;

      const caption =
        `📘 *Facebook Profile*\n\n` +
        `👤 *Name:* ${name}\n` +
        `🔖 *Username:* ${username}\n` +
        `📝 *About:* ${bio}\n\n` +
        `📊 *Stats*\n` +
        `👍 *Likes:* ${likes || '---'}\n` +
        `👥 *Followers:* ${followers || '---'}\n` +
        `➡️ *Following:* ${following || '---'}\n` +
        `📸 *Posts:* ${posts || '---'}\n` +
        `💬 *Talking about:* ${talking || '---'}\n\n` +
        `🔗 https://facebook.com/${username}`;

      if (isRealImage) {
        await client.sendMessage(m.chat, { image: { url: image }, caption }, { quoted: m });
      } else {
        await client.sendMessage(m.chat, { text: caption }, { quoted: m });
      }

    } catch (err) {
      console.error('fbstalk error:', err.message);
      reply(
        `📘 *Facebook: ${username}*\n\n` +
        `⚠️ Facebook blocks automated lookups for private profiles.\n\n` +
        `🔗 View manually: https://facebook.com/${username}`
      );
    }
  }
 },

  {
  command: ['npmstalk'],
  aliases: ['npm', 'pkg'],
  description: 'Stalk an NPM package using its name',
  category: 'stalk',
  handler: async (client, m, { reply, text, api }) => {
    if (!text) return reply('❌ Provide an NPM package name.\n\nExample: *.npmstalk baileys*');
    try {
      const res = await axios.get(
        `${api}/stalker/npm?q=${encodeURIComponent(text)}`,
        { timeout: 15000 }
      );
      const data = res.data;

      if (!data.status || !data.result?.metadata) {
        return reply('❌ Failed to fetch NPM package data. Make sure the package name is correct.');
      }

      const { metadata, versions, dependencies, maintainers, repository } = data.result;
      const npmLink = `https://www.npmjs.com/package/${text}`;

      const caption =
        `📦 *NPM Package: ${metadata.name}*\n\n` +
        `📝 *Description:* ${metadata.description || '—'}\n` +
        `🔗 *NPM Link:* ${npmLink}\n` +
        `📄 *License:* ${metadata.license || '—'}\n` +
        `🏷️ *Keywords:* ${metadata.keywords?.join(', ') || '—'}\n` +
        `📅 *Last Updated:* ${new Date(metadata.lastUpdated).toDateString()}\n\n` +
        `📊 *Versions*\n` +
        `📍 Latest: ${versions.latest}\n` +
        `📍 First: ${versions.first}\n` +
        `🔢 Total: ${versions.count}\n` +
        `📅 Published: ${new Date(versions.latestPublishTime).toDateString()}\n` +
        `📅 Created: ${new Date(versions.initialPublishTime).toDateString()}\n\n` +
        `📦 *Dependencies*\n` +
        `🔢 Latest: ${dependencies.latestCount}\n` +
        `🔢 Initial: ${dependencies.initialCount}\n\n` +
        `👥 *Maintainers:* ${maintainers.join(', ')}\n` +
        `📁 *Repo:* ${repository}`;

      await client.sendMessage(m.chat, { text: caption }, { quoted: m });
    } catch (err) {
      console.error('npmstalk error:', err.message);
      reply('❌ Error fetching NPM package data: ' + err.message);
    }
  }
},

{
    command: ['wastalk'],
    aliases: ['checknum', 'validate'],
    description: 'Validate a phone number and check WhatsApp',
    category: 'stalk',
    handler: async (client, m, { reply, text }) => {
      if (!text) return reply('Usage: validate +254712345678\nProvide the full number with country code (e.g. +1 for US, +44 for UK, +254 for Kenya).');
      const cleaned = text.trim().replace(/[\s\-().]/g, '');
      const digits = cleaned.replace(/^\+/, '');
      if (!digits || !/^\d{7,15}$/.test(digits)) return reply('❌ Invalid number format. Use international format, e.g. +254712345678 or +14155551234');
      m.reply('🔍 Validating +' + digits + ' worldwide...');
      const region = digits.startsWith('1') && digits.length === 11 ? 1 : 3;
      let apiData = null;
      try {
        const apiRes = await global.axios.get('https://api.phonevalidator.com/api/v4/phonesearch', {
          params: { apikey: 'dbc19b10-f34e-4857-b42b-6c12543d42e3', phone: digits, type: 'basic', region },
          timeout: 10000
        });
        apiData = apiRes.data?.PhoneBasic || null;
      } catch (e) {}
      const jid = digits + '@s.whatsapp.net';
      let onWA = false;
      try {
        const [result] = await client.onWhatsApp(jid);
        onWA = result?.exists === true;
      } catch (e) {}
      let about = null;
      try {
        const statusList = await client.fetchStatus(jid);
        if (Array.isArray(statusList) && statusList.length > 0) {
          const st = statusList[0]?.status?.status;
          if (typeof st === 'string' && st.length > 0) about = st;
        }
      } catch (e) {}
      const aboutText = about || '🔒 Private (hidden by WhatsApp privacy settings)';
      let ppStatus = 'None / hidden';
      let ppUrl = null;
      try {
        ppUrl = await client.profilePictureUrl(jid, 'image');
        if (ppUrl) ppStatus = 'Available';
      } catch (e) {}
      const isValid = apiData?.FakeNumber === 'NO';
      const lineType = apiData?.LineType || 'Unknown';
      const carrier = apiData?.PhoneCompany || 'Unknown';
      const country = apiData?.Country || 'Unknown';
      const countryCode = apiData?.CountryCode || '??';
      const fakeReason = apiData?.FakeNumberReason || '';
      const replyText =
        '*📱 Number Validation Results*\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '📞 *Number:* +' + digits + '\n' +
        '🌍 *Country:* ' + country + ' (' + countryCode + ')\n' +
        '🏢 *Carrier:* ' + carrier + '\n' +
        '📶 *Line Type:* ' + lineType + '\n' +
        '✅ *Valid Number:* ' + (isValid ? '✅ Yes' : '❌ No' + (fakeReason ? ' — ' + fakeReason : '')) + '\n\n' +
        '💬 *WhatsApp:* ' + (onWA ? '✅ Active on WhatsApp' : '❌ Not registered on WhatsApp') + '\n' +
        '📝 *About/Bio:* ' + aboutText + '\n' +
        '🖼️ *Profile Pic:* ' + ppStatus + '\n\n' +
        '🔗 https://wa.me/' + digits;
      if (ppUrl) {
        await client.sendMessage(m.chat, { image: { url: ppUrl }, caption: replyText }, { quoted: m });
      } else {
        await client.sendMessage(m.chat, { text: replyText }, { quoted: m });
      }
    }
  },

    {
    command: ['gitstalk'],
    aliases: ['github'],
    description: 'Get GitHub user info',
    category: 'stalk',
    handler: async (client, m, { reply, text }) => {
      if (!text) return m.reply('Provide a github username to stalk');
      try {
        const response = await fetch(`https://api.github.com/users/${encodeURIComponent(text)}`, { headers: { 'User-Agent': 'BlackMD-Bot' } });
        if (response.status === 404) return m.reply(`❌ GitHub user "${text}" not found.`);
        if (!response.ok) return m.reply(`❌ GitHub API error: ${response.status}`);
        const data = await response.json();
        const username = data.login || 'N/A';
        const nickname = data.name || 'N/A';
        const bio = data.bio || 'N/A';
        const profilePic = data.avatar_url;
        const url = data.html_url;
        const type = data.type || 'N/A';
        const company = data.company || 'N/A';
        const blog = data.blog || 'N/A';
        const location = data.location || 'N/A';
        const publicRepos = data.public_repos ?? 0;
        const publicGists = data.public_gists ?? 0;
        const followers = data.followers ?? 0;
        const following = data.following ?? 0;
        const createdAt = data.created_at ? new Date(data.created_at).toDateString() : 'N/A';
        const message =
          `*GitHub User Info*\n\n` +
          `Username:- ${username}\n\nNickname:- ${nickname}\n\nBio:- ${bio}\n\nLink:- ${url}\n\n` +
          `Location:- ${location}\n\nCompany:- ${company}\n\nBlog:- ${blog}\n\n` +
          `Followers:- ${followers}\n\nFollowing:- ${following}\n\nRepos:- ${publicRepos}\n\n` +
          `Gists:- ${publicGists}\n\nAccount Type:- ${type}\n\nCreated:- ${createdAt}`;
        await client.sendMessage(m.chat, { image: { url: profilePic }, caption: message }, { quoted: m });
      } catch (error) {
        m.reply('Unable to fetch data\n' + error);
      }
    }
  }

];
