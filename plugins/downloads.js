'use strict';

const axios = global.axios || require('axios');
const fetch = require('node-fetch');
const yts = require('yt-search');

module.exports = [

  // ═══════════════════════════════════════════════════════════
  // YOUTUBE SEARCH
  // ═══════════════════════════════════════════════════════════

  {
    command: ['ytsearch'],
    aliases: ['yts'],
    description: 'Search YouTube',
    category: 'downloads',
    handler: async (client, m, { reply, text }) => {
      if (!text) return reply('Provide a search term. E.g: .yts Alan Walker Alone');
      const result = await yts(text);
      const videos = result.videos;
      if (!videos || videos.length === 0) return reply(`No matching videos found for: *${text}*`);
      const length = Math.min(videos.length, 10);
      let tex = `📺 *YouTube Search*\n🔍 Query: ${text}\n\n`;
      for (let i = 0; i < length; i++) {
        tex += `*${i + 1}.* ${videos[i].title}\n🔗 ${videos[i].url}\n📺 ${videos[i].author.name}\n\n`;
      }
      reply(tex);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // YOUTUBE AUDIO
  // ═══════════════════════════════════════════════════════════

  {
    command: ['play'],
    aliases: ['yta', 'ytmp3'],
    description: 'Download YouTube audio (MP3)',
    category: 'downloads',
    handler: async (client, m, { text, api }) => {
      if (!text) return m.reply('🔎 Provide a song name or YouTube link!');
      try {
        await client.sendMessage(m.chat, { react: { text: '🎧', key: m.key } });
        let msg = await client.sendMessage(m.chat, { text: `🔍 Searching *${text}*...` }, { quoted: m });

        let videoUrl, videoTitle;
        if (text.match(/(youtube\.com|youtu\.be)/i)) {
          videoUrl = text;
          const videoId = videoUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)?.[1];
          if (!videoId) return m.reply('❌ Invalid YouTube link.');
          const info = await yts({ videoId });
          videoTitle = info?.title || 'YouTube Audio';
        } else {
          let search = await axios.get(`${api}/search/yts?query=${encodeURIComponent(text)}`);
          let videos = search.data?.result;
          if (!Array.isArray(videos) || videos.length === 0) {
            return client.sendMessage(m.chat, { text: '❌ No results found.', edit: msg.key });
          }
          videoUrl = videos[0].url;
          videoTitle = videos[0].title;
        }

        await client.sendMessage(m.chat, { text: `😍 Found: *${videoTitle}*`, edit: msg.key });
        await client.sendMessage(m.chat, { text: `✅ Downloading: *${videoTitle}*`, edit: msg.key });

        let download = await axios.get(`${api}/download/audio?url=${encodeURIComponent(videoUrl)}`);
        let downloadUrl = download.data?.result;
        if (!downloadUrl) return client.sendMessage(m.chat, { text: '❌ Failed to get audio.', edit: msg.key });

        let fileName = `${videoTitle}.mp3`.replace(/[^\w\s.-]/gi, '');
        await client.sendMessage(m.chat, { audio: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { document: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { text: `✅ Succesfully Downloaded *${videoTitle}*`, edit: msg.key });
      } catch (err) {
        m.reply('❌ Error downloading audio.');
      }
    }
  },

  {
    command: ['play2'],
    aliases: ['yta2'],
    description: 'Download YouTube audio via alternate API',
    category: 'downloads',
    handler: async (client, m, { text }) => {
      if (!text) return m.reply('🎧 Provide a song name or YouTube link!\nEg:- *play2 Blinding Lights*');
      try {
        await client.sendMessage(m.chat, { react: { text: '🎵', key: m.key } });
        let msg = await client.sendMessage(m.chat, { text: `🔍 Searching *${text}*...` }, { quoted: m });

        let videoUrl, videoTitle;
        if (text.match(/(youtube\.com|youtu\.be)/i)) {
          videoUrl = text;
          videoTitle = 'YouTube Audio';
        } else {
          const search = await yts(text);
          const video = search.videos[0];
          if (!video) return client.sendMessage(m.chat, { text: `❌ No results found for: *${text}*`, edit: msg.key });
          videoUrl = video.url;
          videoTitle = video.title;
        }

        await client.sendMessage(m.chat, { text: `😍 Found: *${videoTitle}*\n⏳ Downloading...`, edit: msg.key });

        const apiRes = await axios.get(
          `https://mcow.giftedtechnexus.workers.dev/api/yta?url=${encodeURIComponent(videoUrl)}`,
          { timeout: 60000 }
        );
        const data = apiRes.data;
        if (!data.success || !data.result?.download_url) {
          return client.sendMessage(m.chat, { text: '❌ Download failed. Try a different song.', edit: msg.key });
        }

        const finalTitle = data.result.title || videoTitle;
        const downloadUrl = data.result.download_url;
        const fileName = finalTitle.replace(/[\/\\:*?"<>|]/g, '').trim() + '.mp3';

        await client.sendMessage(m.chat, { audio: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { document: { url: downloadUrl }, mimetype: 'audio/mpeg', caption: '*DOWNLOADED BY 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃*', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { text: `✅ Succesfully Downloaded! *${finalTitle}*`, edit: msg.key });
      } catch (err) {
        m.reply('❌ An error occurred. Try again.');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // YOUTUBE VIDEO
  // ═══════════════════════════════════════════════════════════

  {
    command: ['video'],
    aliases: ['ytv', 'ytmp4'],
    description: 'Download YouTube video (MP4)',
    category: 'downloads',
    handler: async (client, m, { text }) => {
      if (!text) return m.reply('🎬 Provide a video name or YouTube link!\nEg:- *ytv Blinding Lights*');
      try {
        await client.sendMessage(m.chat, { react: { text: '🎬', key: m.key } });
        let msg = await client.sendMessage(m.chat, { text: `🔍 Searching *${text}*...` }, { quoted: m });

        let videoUrl, videoTitle;
        if (text.match(/(youtube\.com|youtu\.be)/i)) {
          videoUrl = text;
          videoTitle = 'YouTube Video';
        } else {
          const search = await yts(text);
          const video = search.videos[0];
          if (!video) return client.sendMessage(m.chat, { text: `❌ No results found for: *${text}*`, edit: msg.key });
          videoUrl = video.url;
          videoTitle = video.title;
        }

        await client.sendMessage(m.chat, { text: `😍 Found: *${videoTitle}*\n⏳ Downloading...`, edit: msg.key });

        const apiRes = await axios.get(
          `https://iamtkm.vercel.app/downloaders/ytmp4?apikey=tkm&url=${encodeURIComponent(videoUrl)}`,
          { timeout: 60000 }
        );
        const data = apiRes.data;
        if (!data.status || !data.data?.url) {
          return client.sendMessage(m.chat, { text: '❌ Download failed. Try a different video.', edit: msg.key });
        }

        const finalTitle = data.data.title || videoTitle;
        const downloadUrl = data.data.url;
        const fileName = finalTitle.replace(/[\/\\:*?"<>|]/g, '').trim() + '.mp4';

        await client.sendMessage(m.chat, { text: `✅ Downloading: *${finalTitle}*`, edit: msg.key });

        const head = await axios.head(downloadUrl, { timeout: 15000 }).catch(() => null);
        const size = head?.headers?.['content-length'];
        if (size && parseInt(size) > 150 * 1024 * 1024) {
          return client.sendMessage(m.chat, { text: '❌ Video too large (>150MB). Try a shorter video.', edit: msg.key });
        }

        const dlRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const buffer = Buffer.from(dlRes.data);

        await client.sendMessage(m.chat, { video: buffer, mimetype: 'video/mp4', fileName, caption: `🎬 *${finalTitle}*` }, { quoted: m });
        await client.sendMessage(m.chat, { document: buffer, mimetype: 'video/mp4', caption: '*DOWNLOADED BY 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃*', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { text: `✅ Successfully downloaded! *${finalTitle}*`, edit: msg.key });
      } catch (err) {
        m.reply('❌ An error occurred. Try again.');
      }
    }
  },

  {
    command: ['video2'],
    aliases: ['ytv2'],
    description: 'Download YouTube video via keithsite (alternate)',
    category: 'downloads',
    handler: async (client, m, { text, api }) => {
      if (!text) return m.reply('🎬 Provide a video name or YouTube link!');
      try {
        await client.sendMessage(m.chat, { react: { text: '🎬', key: m.key } });
        let msg = await client.sendMessage(m.chat, { text: `🔍 Searching *${text}*...` }, { quoted: m });

        let videoUrl, videoTitle;
        if (text.match(/(youtube\.com|youtu\.be)/i)) {
          videoUrl = text;
          const videoId = videoUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)?.[1];
          if (!videoId) return m.reply('❌ Invalid YouTube link.');
          const info = await yts({ videoId });
          videoTitle = info?.title || 'YouTube Video';
        } else {
          let search = await axios.get(`${api}/search/yts?query=${encodeURIComponent(text)}`);
          let videos = search.data?.result;
          if (!Array.isArray(videos) || videos.length === 0) return m.reply('❌ No results found.');
          videoUrl = videos[0].url;
          videoTitle = videos[0].title;
        }

        await client.sendMessage(m.chat, { text: `😍 Found: *${videoTitle}*`, edit: msg.key });
        await client.sendMessage(m.chat, { text: `✅ Downloading: *${videoTitle}*`, edit: msg.key });

        let download = await axios.get(`${api}/download/mp4?url=${encodeURIComponent(videoUrl)}`);
        let downloadUrl = download.data?.result;
        if (!downloadUrl) return client.sendMessage(m.chat, { text: '❌ Failed to get video.', edit: msg.key });

        let head = await axios.head(downloadUrl).catch(() => null);
        if (!head || !head.headers['content-type']?.includes('video')) return m.reply('❌ Invalid video format from API.');

        let response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        let size = response.headers['content-length'];
        if (size && size > 150 * 1024 * 1024) return m.reply('❌ Video too large. Try another one.');

        let buffer = Buffer.from(response.data);
        let fileName = `${videoTitle}.mp4`.replace(/[^\w\s.-]/gi, '');

        await client.sendMessage(m.chat, { video: buffer, mimetype: 'video/mp4', fileName, caption: `🎬 ${videoTitle}` }, { quoted: m });
        await client.sendMessage(m.chat, { text: `✅ Succesfully Downloaded *${videoTitle}*`, edit: msg.key });
      } catch (err) {
        m.reply('❌ Error downloading video. API may be unstable.');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // SPOTIFY
  // ═══════════════════════════════════════════════════════════

  {
    command: ['spotify'],
    description: 'Download from Spotify (name or link)',
    category: 'downloads',
    handler: async (client, m, { reply, text, prefix, api }) => {
      if (!text) return reply(
        `*🎵 Spotify Downloader*\n\nUsage:\n  *${prefix}spotify* _song name_\n  *${prefix}spotify* _<spotify URL>_\n\nExample: *${prefix}spotify* Shape of You Ed Sheeran`
      );
      try {
        await client.sendMessage(m.chat, { react: { text: '🎵', key: m.key } });
        let msg = await client.sendMessage(m.chat, { text: `🔍 Searching *${text}*...` }, { quoted: m });

        let query = text.trim();
        let displayTitle = query;

        if (/open\.spotify\.com\/track\//i.test(query)) {
          try {
            const oembedRes = await axios.get(`https://open.spotify.com/oembed?url=${encodeURIComponent(query)}`, { timeout: 8000 });
            if (oembedRes.data?.title) { displayTitle = oembedRes.data.title; query = oembedRes.data.title; }
          } catch (_) {}
        }

        const results = await yts(query);
        const video = results.videos[0];
        if (!video) return client.sendMessage(m.chat, { text: `❌ No results found for: *${displayTitle}*`, edit: msg.key });

        const safeTitle = (displayTitle || video.title).replace(/[\/\\:*?"<>|]/g, '').trim();
        const fileName = safeTitle + '.mp3';
        const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

        await client.sendMessage(m.chat, { text: `😍 Found: *${video.title}*\n⏱️ ${video.timestamp} | 🎤 ${video.author.name}`, edit: msg.key });
        await client.sendMessage(m.chat, { text: `⬇️ Downloading: *${video.title}*...`, edit: msg.key });

        let downloadUrl = null;

        // Primary api: raven
        try {
          const r1 = await axios.get(`${api}/download/audio?url=${encodeURIComponent(videoUrl)}`, { timeout: 30000 });
          if (r1.data?.status && r1.data?.result) downloadUrl = r1.data.result;
        } catch (_) {}

        // Fallback 1: xcasper
        if (!downloadUrl) {
          try {
            const r2 = await axios.get(`https://apis.xcasper.space/api/downloader/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 30000 });
            if (r2.data?.success && r2.data?.url) downloadUrl = r2.data.url;
          } catch (_) {}
        }

        // Fallback 2: gifted
        if (!downloadUrl) {
          try {
            const r3 = await axios.get(`https://mcow.giftedtechnexus.workers.dev/api/yta?url=${encodeURIComponent(videoUrl)}`, { timeout: 60000 });
            if (r3.data?.success && r3.data?.result?.download_url) downloadUrl = r3.data.result.download_url;
          } catch (_) {}
        }

        if (!downloadUrl) return client.sendMessage(m.chat, { text: '❌ Could not get a download link. All APIs failed. Try again later.', edit: msg.key });

        await client.sendMessage(m.chat, { audio: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { document: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { text: `✅ Succesfully Downloaded! *${safeTitle}*`, edit: msg.key });
      } catch (err) {
        m.reply('❌ Failed to download. Try a different name or Spotify link.');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // WHATSONG / SHAZAM
  // ═══════════════════════════════════════════════════════════

  {
    command: ['shazam'],
    aliases: ['whatsong'],
    description: 'Identify a song from quoted audio/video',
    category: 'downloads',
    handler: async (client, m, { reply, api }) => {
      try {
        if (!m.quoted) return reply('Quote a short audio or video to identify the song.');
        let d = m.quoted;
        let mimes = (d.msg || d).mimetype || d.mediaType || '';
        if (!/video|audio/i.test(mimes)) return reply('Quote an audio or video message.');

        await reply('🎵 Analyzing the media...');
        let buffer = await client.downloadMediaMessage(d);

        const acrcloud = require('acrcloud');
        let acr = new acrcloud({
          host: 'identify-eu-west-1.acrcloud.com',
          access_key: '2631ab98e77b49509e3edcf493757300',
          access_secret: 'KKbVWlTNCL3JjxjrWnywMdvQGanyhKRN0fpQxyUo'
        });

        let { status, metadata } = await acr.identify(buffer);
        if (status.code !== 0) return reply('❌ Could not identify the song. Try a clearer audio.');

        let { title, artists, album, genres, release_date } = metadata.music[0];
        let artistNames = artists ? artists.map(a => a.name).join(', ') : 'Unknown';
        let txt = `🎵 *Song Identified!*\n\n*• Title:* ${title}\n*• Artists:* ${artistNames}\n` +
          (album ? `*• Album:* ${album.name}\n` : '') +
          (genres ? `*• Genres:* ${genres.map(g => g.name).join(', ')}\n` : '') +
          (release_date ? `*• Released:* ${release_date}\n` : '') +
          `\n⬇️ Downloading...`;

        let infoMsg = await client.sendMessage(m.chat, { text: txt }, { quoted: m });

        let search = await axios.get(`${api}/search/yts?query=${encodeURIComponent(title + ' ' + artistNames)}`);
        let videos = search.data?.result;
        if (!Array.isArray(videos) || videos.length === 0) {
          return client.sendMessage(m.chat, { text: txt.replace('⬇️ Downloading...', '❌ No YouTube match found.'), edit: infoMsg.key });
        }

        let videoUrl = videos[0].url;
        let videoTitle = videos[0].title;
        let download = await axios.get(`${api}/download/audio?url=${encodeURIComponent(videoUrl)}`);
        let downloadUrl = download.data?.result;
        if (!downloadUrl) {
          return client.sendMessage(m.chat, { text: txt.replace('⬇️ Downloading...', '❌ Download failed.'), edit: infoMsg.key });
        }

        let fileName = `${title} - ${artistNames}.mp3`.replace(/[^\w\s.-]/gi, '');
        await client.sendMessage(m.chat, { audio: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { document: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: m });
        await client.sendMessage(m.chat, { text: txt.replace('⬇️ Downloading...', `✅ Succesfully Downloaded *${videoTitle}*`), edit: infoMsg.key });
      } catch (err) {
        reply('❌ Something went wrong identifying or downloading the song.');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // SOCIAL MEDIA DOWNLOADERS
  // ═══════════════════════════════════════════════════════════

  {
  command: ['insta'],
  aliases: ['igdl', 'instagram', 'ig'],
  description: 'Download Instagram photo/video/reel',
  category: 'downloads',
  handler: async (client, m, { text }) => {
    if (!text) return m.reply('📌 Provide an Instagram link.\nExample: .ig https://www.instagram.com/p/xxxxx');
    if (!text.includes('instagram.com')) return m.reply('❌ That is not a valid Instagram link.');
    try {
      await m.reply('⏳ Please wait, fetching your media...');
      await client.sendMessage(m.chat, { react: { text: '📥', key: m.key } });

      const response = await fetch(`https://api.bk9.dev/download/instagram?url=${encodeURIComponent(text)}`);
      const data = await response.json();

      if (!data.status || !data.BK9 || typeof data.BK9 === 'string') return m.reply('❌ Failed to fetch Instagram media. Make sure the link is valid and the post is public.');

      const items = Array.isArray(data.BK9) ? data.BK9 : [data.BK9];
      if (items.length === 0) return m.reply('❌ No media found at that link.');

      for (const item of items) {
        const url = item?.url || item?.video || item?.image || (typeof item === 'string' ? item : null);
        if (!url) continue;
        const isVideo = item?.type === 'video' || url.includes('.mp4');
        if (isVideo) {
          await client.sendMessage(m.chat, {
            video: { url },
            mimetype: 'video/mp4',
            caption: '📸 *Instagram*\n_Downloaded by BLACK-MD_',
            gifPlayback: false,
          }, { quoted: m });
        } else {
          await client.sendMessage(m.chat, {
            image: { url },
            caption: '📸 *Instagram*\n_Downloaded by BLACK-MD_',
          }, { quoted: m });
        }
      }

    } catch (err) {
      m.reply('❌ Error downloading Instagram media.');
    }
  }
},
  {
    command: ['insta2'],
    aliases: ['igdl2', 'instagram2', 'ig2'],
    description: 'Download Instagram video',
    category: 'downloads',
    handler: async (client, m, { text }) => {
      if (!text) return m.reply('Please provide an Instagram link for the video.');
      if (!text.includes('https://www.instagram.com/')) return m.reply('That is not a valid Instagram link.');
      try {
        const { igdl } = require('ruhend-scraper');
        const downloadData = await igdl(text);
        if (!downloadData || !downloadData.data || downloadData.data.length === 0) return m.reply('No video found at the provided link.');
        const videoData = downloadData.data;
        for (let i = 0; i < Math.min(20, videoData.length); i++) {
          await client.sendMessage(m.chat, {
            video: { url: videoData[i].url },
            mimetype: 'video/mp4',
            caption: `DOWNLOADED BY ${global.botname || 'BLACK-MD'}`
          }, { quoted: m });
        }
      } catch (error) {
        m.reply('An error occurred while processing the request.');
      }
    }
  },

  {
  command: ['igstory'],
  aliases: ['instastory', 'igstories', 'igs'],
  description: 'Download Instagram stories by username',
  category: 'downloads',
  handler: async (client, m, { text }) => {
    if (!text) return m.reply('📌 Provide an Instagram username.\nExample: .igstory username');
    const username = text.trim().replace(/^@/, '');
    try {
      await m.reply(`⏳ Fetching stories for *@${username}*...`);
      await client.sendMessage(m.chat, { react: { text: '📥', key: m.key } });

      const response = await fetch(`https://api.bk9.dev/download/igs?username=${encodeURIComponent(username)}`);
      const data = await response.json();

      if (!data.status || !data.BK9) {
  try {
    const profile = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers: { 'x-ig-app-id': '936619743392459' } }
    );
    const pdata = await profile.json();
    const isPrivate = pdata?.data?.user?.is_private;
    if (isPrivate === true) {
      return m.reply(`🔒 *@${username}* has a private account. Stories can only be downloaded from public accounts.`);
    }
  } catch {}
  return m.reply(`📭 *@${username}* has no active stories right now.`);
  }
      
      const stories = data.BK9?.stories;
      if (!Array.isArray(stories) || stories.length === 0) return m.reply(`❌ No active stories found for *@${username}*.`);

      await m.reply(`📖 Found *${stories.length}* stor${stories.length === 1 ? 'y' : 'ies'} for *@${username}*. Sending...`);

      const album = [];
      for (let i = 0; i < stories.length; i++) {
        const item = stories[i];
        const url = item?.download_url || item?.url;
        if (!url) continue;
        if (item.type === 'video') {
          album.push({
            video: { url },
            mimetype: 'video/mp4',
            caption: i === 0 ? `📸 *@${username}* stories\n_Downloaded by BLACK-MD_` : undefined,
            gifPlayback: false,
          });
        } else {
          album.push({
            image: { url },
            caption: i === 0 ? `📸 *@${username}* stories\n_Downloaded by BLACK-MD_` : undefined,
          });
        }
      }
      if (!album.length) return m.reply('❌ No media could be loaded from those stories.');
      await client.sendMessage(m.chat, { album }, { quoted: m });

    } catch (err) {
      m.reply('❌ Error fetching Instagram stories.');
    }
  }
},
  
  {
    command: ['tikdl'],
    aliases: ['tiktok', 'tdl', 'tt'],
    description: 'Download TikTok video',
    category: 'downloads',
    handler: async (client, m, { reply, text }) => {
      if (!text) return reply('Please provide a TikTok video link.');
      if (!text.includes('tiktok.com')) return reply('That is not a TikTok link.');
      await client.sendMessage(m.chat, { react: { text: '✅️', key: m.key } });
      try {
        const response = await axios.get(`https://api.bk9.dev/download/tiktok?url=${encodeURIComponent(text)}`);
        if (response.data.status && response.data.BK9) {
          const { BK9: videoUrl } = response.data.BK9;
          await client.sendMessage(m.chat, { text: 'Data fetched successfully✅ wait a moment. . .' }, { quoted: m });
          await client.sendMessage(m.chat, { video: { url: videoUrl }, caption: '𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 𝗕𝗟𝗔𝗖𝗞-𝗠𝗗', gifPlayback: false }, { quoted: m });
        } else {
          reply('Failed to retrieve video from the provided link.');
        }
      } catch (e) {
        reply(`An error occurred during download: ${e.message}`);
      }
    }
  },
  
{
  command: ['twitter'],
  aliases: ['xdl', 'tdl'],
  description: 'Download Twitter/X video or image',
  category: 'downloads',
  handler: async (client, m, { text }) => {
    if (!text || !/https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+\/status\/\d+/.test(text)) {
      return m.reply('📌 Provide a valid Twitter/X post link!\nExample: .twitter https://x.com/user/status/123456');
    }

    try {
      await m.reply('⏳ Fetching your media...');
      await client.sendMessage(m.chat, { react: { text: '📥', key: m.key } });

      const tweetId = text.match(/\/status\/(\d+)/)?.[1];
      if (!tweetId) return m.reply('❌ Could not parse tweet ID from that link.');

      const res = await axios.get(`https://api.fxtwitter.com/i/status/${tweetId}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const tweet = res.data?.tweet;
      if (!tweet) return m.reply('❌ Tweet not found or is from a private account.');

      const caption = `🐦 *@${tweet.author?.screen_name || 'Unknown'}*\n\n${tweet.text || ''}\n\n❤️ ${tweet.likes || 0}  🔁 ${tweet.retweets || 0}`;
      const media = tweet.media;

      // ── Video / GIF ──────────────────────────────────────────────────
      if (media?.videos?.length) {
        const video = media.videos[0];
        const videoUrl = video.url;

        const dl = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60000 });
        const size = parseInt(dl.headers['content-length'] || '0');
        if (size > 150 * 1024 * 1024) return m.reply('❌ Video too large to send (over 150MB).');

        const buffer = Buffer.from(dl.data);
        const isGif = video.type === 'gif';

        await client.sendMessage(m.chat, {
          video: buffer,
          mimetype: 'video/mp4',
          caption: caption,
          gifPlayback: isGif
        }, { quoted: m });

      // ── Photos ───────────────────────────────────────────────────────
      } else if (media?.photos?.length) {
        for (const photo of media.photos) {
          const dl = await axios.get(photo.url, { responseType: 'arraybuffer', timeout: 30000 });
          const buffer = Buffer.from(dl.data);
          await client.sendMessage(m.chat, {
            image: buffer,
            caption: caption
          }, { quoted: m });
        }

      // ── Text only tweet ──────────────────────────────────────────────
      } else {
        m.reply(`🐦 *Tweet (no media)*\n\n${caption}`);
      }

    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Unknown error';
      m.reply(`❌ Failed to download: ${msg}`);
    }
  }
},

  {
    command: ['fbdl'],
    aliases: ['fb', 'facebook'],
    description: 'Download Facebook video',
    category: 'downloads',
    handler: async (client, m, { text, api }) => {
      if (!text || !text.startsWith('http')) return m.reply('📌 Provide a valid Facebook video link!');
      try {
        await m.reply('⏳ Please wait, fetching your video...');
        await client.sendMessage(m.chat, { react: { text: '📥', key: m.key } });

        let response = await axios.get(`${api}/download/fbdown?url=${encodeURIComponent(text)}`, { timeout: 100000 });
        let result = response.data?.result;
        if (!result?.media?.sd) return m.reply('❌ Failed to fetch Facebook video.');

        let videoUrl = result.media.hd || result.media.sd;
        let head = await axios.head(videoUrl).catch(() => null);
        if (!head || !head.headers['content-type']?.includes('video')) return m.reply('❌ Invalid video format.');

        let res = await axios.get(videoUrl, { responseType: 'arraybuffer' });
        let size = res.headers['content-length'];
        if (size && size > 100 * 1024 * 1024) return m.reply('❌ Video too large.');

        let buffer = Buffer.from(res.data);
        await client.sendMessage(m.chat, { video: buffer, mimetype: 'video/mp4', caption: '📘 Facebook Video' }, { quoted: m });
      } catch (err) {
        m.reply('❌ Error downloading Facebook video.');
      }
    }
  },

  {
  command: ['fbdl2'],
  aliases: ['fb2', 'facebook2'],
  description: 'Download Facebook video',
  category: 'downloads',
  handler: async (client, m, { text }) => {
    if (!text || !text.startsWith('http')) return m.reply('📌 Provide a valid Facebook video link!');
    try {
      await m.reply('⏳ Please wait, fetching your video...');
      await client.sendMessage(m.chat, { react: { text: '📥', key: m.key } });

      const response = await fetch(`https://api.bk9.dev/download/fb?url=${encodeURIComponent(text)}`);
      const data = await response.json();

      if (!data.status || !data.BK9) return m.reply('❌ Failed to fetch Facebook video. Make sure the link is valid and the video is public.');

      const videoUrl = data.BK9?.hd || data.BK9?.sd || data.BK9?.url || (typeof data.BK9 === 'string' ? data.BK9 : null);
      if (!videoUrl) return m.reply('❌ No downloadable video found for that link.');

      const title = data.BK9?.title || 'Facebook Video';
      await client.sendMessage(m.chat, {
        video: { url: videoUrl },
        mimetype: 'video/mp4',
        caption: `📘 *${title}*\n_Downloaded by BLACK-MD_`,
        gifPlayback: false,
      }, { quoted: m });

    } catch (err) {
      m.reply('❌ Error downloading Facebook video.');
    }
  }
},

  {
    command: ['pindl'],
    aliases: ['pin', 'pinterest'],
    description: 'Download Pinterest image or video',
    category: 'downloads',
    handler: async (client, m, { text, api }) => {
      if (!text || !text.startsWith('http')) return m.reply('📌 Provide a valid Pinterest link!');
      try {
        await m.reply('⏳ Fetching Pinterest media...');
        await client.sendMessage(m.chat, { react: { text: '📌', key: m.key } });

        let res = await axios.get(`${api}/download/pindl2?url=${encodeURIComponent(text)}`, { timeout: 100000 });
        let result = res.data?.result;
        if (!result?.success || !Array.isArray(result.medias)) return m.reply('❌ Failed to fetch Pinterest media.');

        let title = result.title || 'Pinterest Media';
        for (let media of result.medias) {
          let { url, extension, videoAvailable } = media;
          if (!url) continue;
          try {
            let bufferRes = await axios.get(url, { responseType: 'arraybuffer' });
            let size = bufferRes.headers['content-length'];
            if (size && size > 100 * 1024 * 1024) { await m.reply('⚠️ Skipped large file.'); continue; }
            let buffer = Buffer.from(bufferRes.data);
            let fileName = `${title}.${extension || 'jpg'}`.replace(/[^\w\s.-]/gi, '');

            if (videoAvailable || extension === 'mp4') {
              await client.sendMessage(m.chat, { video: buffer, mimetype: 'video/mp4', fileName, caption: '📌 Pinterest Video' }, { quoted: m });
            } else {
              await client.sendMessage(m.chat, { image: buffer, fileName, caption: '📌 Pinterest Image' }, { quoted: m });
            }
          } catch (err) {}
        }
      } catch (err) {
        m.reply('❌ Error downloading Pinterest media.');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // OTHER DOWNLOADS
  // ═══════════════════════════════════════════════════════════
  
  {
    command: ['lyrics'],
    description: 'Get song lyrics',
    category: 'downloads',
    handler: async (client, m, { reply, text, from }) => {
      if (!text) return reply('Provide a song name!');
      try {
        const suggestRes = await global.axios.get('https://api.lyrics.ovh/suggest/' + encodeURIComponent(text));
        const hit = suggestRes.data?.data?.[0];
        if (!hit) return reply('No results found for: ' + text);
        const artist = hit.artist.name;
        const title = hit.title;
        const lyricsRes = await global.axios.get('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title));
        if (!lyricsRes.data?.lyrics) return reply('Lyrics not found for: ' + title);
        const msg = `*${title}*\n_${artist}_\n\n${lyricsRes.data.lyrics}`;
        await client.sendMessage(from, { text: msg }, { quoted: m });
      } catch (error) {
        reply('I did not find any lyrics for ' + text + '. Try searching a different song.');
      }
    }
  },

      {
    command: ['movie'],
    aliases: ['mv'],
    description: 'Search IMDB for a movie or series',
    category: 'downloads',
    handler: async (client, m, { reply, text, from }) => {
      if (!text) return reply('Provide a series or movie name.');
      let fids = await global.axios.get(`http://www.omdbapi.com/?apikey=742b2d09&t=${encodeURIComponent(text)}&plot=full`);
      let imdbt =
        '⚍⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚍\n ``` IMDB MOVIE SEARCH```\n⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎⚎\n' +
        `🎬Title      : ${fids.data.Title}\n` +
        `📅Year       : ${fids.data.Year}\n` +
        `⭐Rated      : ${fids.data.Rated}\n` +
        `📆Released   : ${fids.data.Released}\n` +
        `⏳Runtime    : ${fids.data.Runtime}\n` +
        `🌀Genre      : ${fids.data.Genre}\n` +
        `👨🏻‍💻Director   : ${fids.data.Director}\n` +
        `✍Writer     : ${fids.data.Writer}\n` +
        `👨Actors     : ${fids.data.Actors}\n` +
        `📃Plot       : ${fids.data.Plot}\n` +
        `🌐Language   : ${fids.data.Language}\n` +
        `🌍Country    : ${fids.data.Country}\n` +
        `🎖️Awards     : ${fids.data.Awards}\n` +
        `📦BoxOffice  : ${fids.data.BoxOffice}\n` +
        `🏙️Production : ${fids.data.Production}\n` +
        `🌟imdbRating : ${fids.data.imdbRating}\n` +
        `❎imdbVotes  : ${fids.data.imdbVotes}`;
      client.sendMessage(from, { image: { url: fids.data.Poster }, caption: imdbt }, { quoted: m });
    }
  },

  
{
    command: ['apk'],
    aliases: ['app'],
    description: 'Download an APK by name',
    category: 'downloads',
    handler: async (client, m, { reply, text }) => {
      if (!text) return reply('Where is the app name?');
      const { fetchJson } = require('../lib/ravenfunc');
      const kyuu = await fetchJson(`https://api.bk9.dev/search/apk?q=${text}`);
      const tylor = await fetchJson(`https://api.bk9.dev/download/apk?id=${kyuu.BK9[0].id}`);
      await client.sendMessage(m.chat, {
        document: { url: tylor.BK9.dllink },
        fileName: tylor.BK9.name,
        mimetype: 'application/vnd.android.package-archive',
        contextInfo: {
          externalAdReply: {
            title: 'BLACK-MD BOT',
            body: `${tylor.BK9.name}`,
            thumbnailUrl: `${tylor.BK9.icon}`,
            sourceUrl: `${tylor.BK9.dllink}`,
            mediaType: 2,
            showAdAttribution: true,
            renderLargerThumbnail: false
          }
        }
      }, { quoted: m });
    }
  },

];
