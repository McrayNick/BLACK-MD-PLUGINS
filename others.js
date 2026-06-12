module.exports = [
  
  {
    command: ['hack'],
    aliases: ['prank'],
    description: 'Fake hacking animation (Owner only)',
    category: 'others',
    handler: async (client, m, { Owner, NotOwner }) => {
      if (!Owner) return m.reply(NotOwner);
      try {
        const steps = [
          '⚠️𝗜𝗻𝗶𝘁𝗶𝗹𝗶𝗮𝘇𝗶𝗻𝗴 𝗛𝗮𝗰𝗸𝗶𝗻𝗴 𝗧𝗼𝗼𝗹𝘀⚠️',
          '𝗜𝗻𝗷𝗲𝗰𝘁𝗶𝗻𝗴 𝗠𝗮𝗹𝘄𝗮𝗿𝗲🐛..\n𝗟𝗼𝗮𝗱𝗶𝗻𝗴 𝗗𝗲𝘃𝗶𝗰𝗲 𝗚𝗮𝗹𝗹𝗲𝗿𝘆 𝗙𝗶𝗹𝗲𝘀⚠️',
          '```██ 10%``` ⏳',
          '```████ 20%``` ⏳',
          '```██████ 30%``` ⏳',
          '```████████ 40%``` ⏳',
          '```██████████ 50%``` ⏳',
          '```████████████ 60%``` ⏳',
          '```██████████████ 70%``` ⏳',
          '```████████████████ 80%``` ⏳',
          '```██████████████████ 90%``` ⏳',
          '```████████████████████ 100%``` ✅',
          '```𝗦𝘆𝘀𝘁𝗲𝗺 𝗛𝘆𝗷𝗮𝗰𝗸𝗶𝗻𝗴 𝗼𝗻 𝗽𝗿𝗼𝗰𝗲𝘀𝘀...```\n```𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗶𝗻𝗴 𝘁𝗼 𝘁𝗵𝗲 𝗦𝗲𝗿𝘃𝗲𝗿 𝘁𝗼 𝗙𝗶𝗻𝗱 𝗘𝗿𝗿𝗼𝗿 404```',
          '```𝗦𝘂𝗰𝗰𝗲𝘀𝗳𝘂𝗹𝗹𝘆 𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱 𝘁𝗼 𝗗𝗲𝘃𝗶𝗰𝗲...\n𝗥𝗲𝗰𝗲𝗶𝘃𝗶𝗻𝗴 𝗗𝗮𝘁𝗮/𝗦𝗲𝗰𝗿𝗲𝘁 𝗣𝗮𝘀𝘀𝘄𝗼𝗿𝗱𝘀...```',
          '```𝗗𝗮𝘁𝗮 𝗧𝗿𝗮𝗻𝘀𝗳𝗲𝗿𝗲𝗱 𝗙𝗿𝗼𝗺 𝗱𝗲𝘃𝗶𝗰𝗲 100% 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲𝗱\n𝗘𝗿𝗮𝘀𝗶𝗻𝗴 𝗮𝗹𝗹 𝗘𝘃𝗶𝗱𝗲𝗻𝗰𝗲, 𝗞𝗶𝗹𝗹𝗶𝗻𝗴 𝗮𝗹𝗹 𝗠𝗮𝗹𝘄𝗮𝗿𝗲𝘀🐛...```',
          '```𝗦𝗘𝗡𝗗𝗜𝗡𝗚 𝗟𝗢𝗚 𝗗𝗢𝗖𝗨𝗠𝗘𝗡𝗧𝗦...```',
          '```𝗦𝘂𝗰𝗰𝗲𝘀𝗳𝘂𝗹𝗹𝘆 𝗦𝗲𝗻𝘁 𝗗𝗮𝘁𝗮 𝗔𝗻𝗱 𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗶𝗼𝗻 𝗦𝘂𝗰𝗰𝗲𝘀𝗳𝘂𝗹𝗹𝘆 𝗗𝗶𝘀𝗰𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱```',
          '```𝗔𝗹𝗹 𝗕𝗮𝗰𝗸𝗹𝗼𝗴𝘀 𝗖𝗹𝗲𝗮𝗿𝗲𝗱 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆💣\n𝗬𝗼𝘂𝗿 𝗦𝘆𝘀𝘁𝗲𝗺 𝗪𝗶𝗹𝗹 𝗕𝗲 𝗗𝗼𝘄𝗻 𝗜𝗻 𝗧𝗵𝗲 𝗡𝗲𝘅𝘁 𝗠𝗶𝗻𝘂𝘁𝗲⚠️```'
        ];
        for (const line of steps) {
          await client.sendMessage(m.chat, { text: line }, { quoted: m });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        client.sendMessage(m.chat, { text: `❌ *Error!* Something went wrong. Reason: ${error.message}.` });
      }
    }
  },

  {
    command: ['inspect'],
    aliases: ['source'],
    description: 'Inspect a website — fetch its HTML, CSS, and JS',
    category: 'others',
    handler: async (client, m, { reply, text }) => {
      const cheerio = require('cheerio');
      if (!text) return m.reply('Provide a valid web link to fetch!');
      if (!/^https?:\/\//i.test(text)) return m.reply('Please provide a URL starting with http:// or https://');
      try {
        const response = await fetch(text);
        const html = await response.text();
        const $ = cheerio.load(html);
        const cssFiles = [];
        $('link[rel="stylesheet"]').each((_, el) => { let href = $(el).attr('href'); if (href) cssFiles.push(href); });
        const jsFiles = [];
        $('script[src]').each((_, el) => { let src = $(el).attr('src'); if (src) jsFiles.push(src); });
        await m.reply(`**Full HTML Content**:\n\n${html}`);
        if (cssFiles.length > 0) {
          for (const cssFile of cssFiles) {
            const cssResponse = await fetch(new URL(cssFile, text));
            const cssContent = await cssResponse.text();
            await m.reply(`**CSS File Content**:\n\n${cssContent}`);
          }
        } else {
          await m.reply('No external CSS files found.');
        }
        if (jsFiles.length > 0) {
          for (const jsFile of jsFiles) {
            const jsResponse = await fetch(new URL(jsFile, text));
            const jsContent = await jsResponse.text();
            await m.reply(`**JavaScript File Content**:\n\n${jsContent}`);
          }
        } else {
          await m.reply('No external JavaScript files found.');
        }
      } catch (err) {
        m.reply('Failed to inspect the URL: ' + err.message);
      }
    }
  },

  {
    command: ['dlt'],
    aliases: ['dil'],
    description: "Delete the bot's own quoted message",
    category: 'others',
    handler: async (client, m, { reply }) => {
      if (!m.quoted) return reply('No message quoted for deletion');
      let { isBaileys } = m.quoted;
      if (isBaileys) return reply('I cannot delete. Quoted message is my message or another bot message.');
      client.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: true, id: m.quoted.id, participant: m.quoted.sender } });
    }
  },
  
  {
    command: ['news'],
    aliases: ['technews'],
    description: 'Get a random BBC tech news article',
    category: 'others',
    handler: async (client, m, { reply }) => {
      try {
        const cheerio = require('cheerio');
        const rssRes = await global.axios.get('https://feeds.bbci.co.uk/news/technology/rss.xml', { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(rssRes.data, { xmlMode: true });
        const items = [];
        $('item').each((_, el) => {
          const title       = $(el).find('title').text();
          const description = $(el).find('description').text();
          const link        = $(el).find('link').text();
          const pubDate     = $(el).find('pubDate').text();
          const thumbnail   = $(el).find('media\\:thumbnail, thumbnail').attr('url') || 'https://news.bbcimg.co.uk/nol/shared/img/bbc_news_120x60.gif';
          if (title) items.push({ title, description, link, pubDate, thumbnail });
        });
        if (!items.length) return reply('❌ Could not fetch news right now. Try again later.');
        const article = items[Math.floor(Math.random() * items.length)];
        const caption =
          `📰 *${article.title}*\n\n${article.description}\n\n🗓️ ${article.pubDate}\n🔗 ${article.link}`;
        await client.sendMessage(m.chat, { image: { url: article.thumbnail }, caption }, { quoted: m });
      } catch (err) {
        reply('❌ Failed to fetch news. Please try again.');
      }
    }
  },

  {
    command: ['anime'],
    aliases: ['random-anime'],
    description: 'Get a random anime',
    category: 'others',
    handler: async (client, m, { reply }) => {
      try {
        const response = await global.axios.get('https://api.jikan.moe/v4/random/anime');
        const data = response.data.data;
        const title = data.title;
        const synopsis = data.synopsis;
        const imageUrl = data.images.jpg.image_url;
        const episodes = data.episodes;
        const status = data.status;
        const message = `📺 Title: ${title}\n🎬 Épisodes: ${episodes}\n📡 Status: ${status}\n📝 Synopsis: ${synopsis}\n🔗 URL: ${data.url}`;
        await client.sendMessage(m.chat, { image: { url: imageUrl }, caption: message }, { quoted: m });
      } catch {
        m.reply('𝗢𝗼𝗽𝘀 𝗘𝗿𝗿𝗼𝗿!');
      }
    }
  },

  {
    command: ['mail'],
    aliases: ['tempmail', 'getmail'],
    description: 'Create a temporary email address',
    category: 'others',
    handler: async (client, m, { reply }) => {
      try {
        const res = await global.axios.get('https://apis.xcasper.space/api/tempmail?action=create');
        if (!res.data.success) return m.reply('Failed to create temp email. Try again.');
        const { email, token } = res.data;
        const tokenMsg = await client.sendMessage(m.chat, { text: token }, { quoted: m });
        await client.sendMessage(m.chat, {
          text: `📧 *Temp Email Created*\n\n*Email:* ${email}\n\n_Quoted message is your token._\nTo check your inbox use:\n*.inbox ${email} <your-token>*`
        }, { quoted: tokenMsg });
      } catch (e) {
        m.reply('Failed to generate temp email. Try again later.');
      }
    }
  },

  {
    command: ['inbox'],
    aliases: ['chekmail'],
    description: 'Check your temporary email inbox',
    category: 'others',
    handler: async (client, m, { reply, text }) => {
      if (!text) return m.reply('Usage: .inbox <email> <token>');
      const parts = text.trim().split(' ');
      if (parts.length < 2) return m.reply('Usage: .inbox <email> <token>\n\nBoth email and token are required.');
      const [inboxEmail, inboxToken] = parts;
      try {
        const res = await global.axios.get(`https://apis.xcasper.space/api/tempmail?action=check&email=${encodeURIComponent(inboxEmail)}&token=${encodeURIComponent(inboxToken)}`);
        if (!res.data.success) return m.reply('Failed to check inbox. Make sure email and token are correct.');
        const messages = res.data.messages;
        if (!messages || messages.length === 0) return m.reply('📭 Your inbox is empty. No messages yet.');
        for (const msg of messages) {
          const from = msg.from?.address || msg.from || 'Unknown';
          const subject = msg.subject || '(no subject)';
          const date = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : 'Unknown';
          const intro = msg.intro || msg.text || '(no preview)';
          await m.reply(`📩 *New Message*\n\n👤 *From:* ${from}\n📝 *Subject:* ${subject}\n🕐 *Date:* ${date}\n\n${intro}`);
        }
      } catch (e) {
        m.reply('Failed to fetch inbox. Try again later.');
      }
    }
  },
  
{
  command: ['system'],
  aliases: ['sysinfo'],
  description: 'Show system info — platform, RAM, storage, hostname',
  category: 'others',
  handler: async (client, m, { reply }) => {

    const os = require('os');
    const fs = require('fs');
    const { execSync } = require('child_process');

    // ── RAM ─────────────────────────────────────────────────────────────
    const totalRam = os.totalmem();
    const freeRam  = os.freemem();
    const usedRam  = totalRam - freeRam;
    const ramPct   = ((usedRam / totalRam) * 100).toFixed(1);

    const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';
    const toGB = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';

    // ── Storage ──────────────────────────────────────────────────────────
    let totalDisk = 'N/A', usedDisk = 'N/A', freeDisk = 'N/A';
    try {
      const df = execSync("df -k / | tail -1").toString().trim().split(/\s+/);
      totalDisk = toGB(parseInt(df[1]) * 1024);
      usedDisk  = toGB(parseInt(df[2]) * 1024);
      freeDisk  = toGB(parseInt(df[3]) * 1024);
    } catch (_) {}

    // ── CPU ──────────────────────────────────────────────────────────────
    const cpus    = os.cpus();
    const cpuName = cpus[0]?.model?.trim() || 'Unknown';
    const cores   = cpus.length;

    // ── Uptime ───────────────────────────────────────────────────────────
    const uptimeSec = os.uptime();
    const hrs  = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = Math.floor(uptimeSec % 60);
    const uptime = `${hrs}h ${mins}m ${secs}s`;

    // ── Process (bot) memory ─────────────────────────────────────────────
    const botMem = process.memoryUsage();

    // ── Network interfaces ───────────────────────────────────────────────
    const nets = os.networkInterfaces();
    let ip = 'N/A';
    for (const iface of Object.values(nets)) {
      const ext = iface?.find(i => i.family === 'IPv4' && !i.internal);
      if (ext) { ip = ext.address; break; }
    }

    const msg =
      `╔══════════════════════╗\n` +
      `║   💻 BLACK-MD SYSTEM  INFO      \n` +
      `╚══════════════════════╝\n\n` +
      `*🖥️ Host*\n` +
      `┣ Hostname : ${os.hostname()}\n` +
      `┣ Platform : ${os.platform()} (${os.type()})\n` +
      `┣ Arch     : ${os.arch()}\n` +
      `┣ Release  : ${os.release()}\n` +
      `┗ IP Addr  : ${ip}\n\n` +
      `*⚙️ CPU*\n` +
      `┣ Model : ${cpuName}\n` +
      `┗ Cores : ${cores}\n\n` +
      `*🧠 RAM*\n` +
      `┣ Total : ${toGB(totalRam)}\n` +
      `┣ Used  : ${toMB(usedRam)} (${ramPct}%)\n` +
      `┗ Free  : ${toMB(freeRam)}\n\n` +
      `*💾 Storage (/*\n` +
      `┣ Total : ${totalDisk}\n` +
      `┣ Used  : ${usedDisk}\n` +
      `┗ Free  : ${freeDisk}\n\n` +
      `*🤖 Bot Process*\n` +
      `┣ Heap Used  : ${toMB(botMem.heapUsed)}\n` +
      `┣ Heap Total : ${toMB(botMem.heapTotal)}\n` +
      `┗ RSS        : ${toMB(botMem.rss)}\n\n` +
      `*⏱️ Uptime*\n` +
      `┣ System : ${uptime}\n` +
      `┗ Node   : v${process.version.replace('v', '')}`;

    reply(msg);
  }
},

  {
    command: ['support'],
    description: 'Get support links',
    category: 'others',
    handler: async (client, m) => {
      const links = {
        group: 'https://chat.whatsapp.com/GDgPc1O7vzP5HujmwlES01',
        channel: 'https://whatsapp.com/channel/0029VawxyHxLdQeX3kA96G3N',
        email: 'mailto:cryptoboy1649@gmail.com',
        github: 'https://github.com/Blackie254/black-super-bot',
        developer: 'https://wa.me/254114283550'
      };
      const banner = 'https://files.catbox.moe/xiflcv.jpeg';
      await client.sendPresenceUpdate('composing', m.chat);
      const supportMessage =
        `▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄\n` +
        `█                             █\n` +
        `█   🄱🄻🄰🄲🄺🅈 🅂🅄🄿🄿🄾🅁🅃   █\n` +
        `█                             █\n` +
        `▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\n\n` +
        `✧ 𝙂𝙍𝙊𝙐𝙋 » ${links.group}\n\n` +
        `✧ 𝘾𝙃𝘼𝙉𝙉𝙀𝙇 » ${links.channel}\n\n` +
        `✧ 𝙀𝙈𝘼𝙄𝙇 » ${links.email}\n\n` +
        `✧ 𝙂𝙄𝙏𝙃𝙐𝘽 » ${links.github}\n\n` +
        `✧ 𝘿𝙀𝙑𝙀𝙇𝙊𝙋𝙀𝙍 » ${links.developer}\n\n` +
        `▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄\n` +
        `█  24/7 PREMIUM SUPPORT  █\n` +
        `▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀`;
      await client.sendMessage(m.chat, {
        image: { url: banner },
        caption: supportMessage,
        contextInfo: {
          externalAdReply: {
            title: '🅿🆁🅴🅼🅸🆄🅼 🆂🆄🅿🅿🅾🆁🆃',
            body: 'BLACK-MD v3 | Instant Response',
            thumbnail: { url: banner },
            sourceUrl: links.channel
          }
        }
      });
    }
  },

  {
       command: ['blue'],
    aliases: ['blizzard'],
    description: 'BlueBlizzards services info',
    category: 'others',
    handler: async (client, m) => {
      const menu =
        '*💙 BLUEBLIZZARDS — Premium Services*\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '🤖 *BOT SHOP*\n' +
        '▸ Anti-ban • Auto-reply • Multi-device\n' +
        '▸ Basic: $1 | Pro: $4 | Ultimate: $10\n' +
        '🔗 https://bot.blueblizzards.site\n\n' +
        '🚀 *DEPLOYMENT*\n' +
        '▸ 5-min setup • DDoS protection\n' +
        '▸ Quick: ksh100/mo | Custom: ksh500/mo\n' +
        '🔗 https://bot.blueblizzards.site\n\n' +
        '📊 *TRADING*\n' +
        '▸ AI signals • 1:500 leverage • 0.1% fees\n' +
        '▸ Crypto & Forex\n' +
        '🔗 https://blueblizzards.site\n\n' +
        '🎬 *FREE FLIX*\n' +
        '▸ 10,000+ titles • HD/4K • Ad-free\n' +
        '🔗 https://freeflix.blueblizzards.site\n\n' +
        '💰 *AFFILIATE PROGRAM*\n' +
        '▸ Earn 30% recurring commission\n' +
        '▸ Daily payouts\n' +
        '🔗 https://blueblizzards.site/affiliate\n\n' +
        '📞 *SUPPORT — 24/7*\n' +
        '🔗 https://blueblizzards.site';
      m.reply(menu);
    }
  }

  ];
