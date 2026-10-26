'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const fetch = require('node-fetch');
const axios    = require('axios');
const FormData = require('form-data');


// ── ffmpeg + animated-WebP helpers (no sharp needed; same ffmpeg finder as the sticker command) ──
const { execFile } = require('child_process');

function ffmpegBin() {
  try { return require('../lib/stickerlite').ffmpegBin(); } catch (_) { return 'ffmpeg'; }
}

function runFf(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBin(), args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').slice(-2).join(' ').slice(0, 200)));
      resolve();
    });
  });
}

// stickers are only 512px, so videos/images made from them are enlarged to this size (set to 0 to keep the original size)
const ENLARGE_TO = 1024;
const enlargeFilter = () => (ENLARGE_TO ? `scale=${ENLARGE_TO}:${ENLARGE_TO}:force_original_aspect_ratio=decrease:flags=lanczos,` : '');

// reads a WebP file and returns its canvas size + frames (animated or not)
function parseWebp(buf) {
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  let off = 12, W = 0, H = 0, animated = false;
  const frames = [];
  const sub = (data) => { // chunks inside an ANMF frame
    const out = []; let o = 0;
    while (o + 8 <= data.length) {
      const id = data.toString('latin1', o, o + 4), size = data.readUInt32LE(o + 4);
      out.push({ id, raw: data.subarray(o, o + 8 + size + (size % 2)) });
      o += 8 + size + (size % 2);
    }
    return out;
  };
  while (off + 8 <= buf.length) {
    const id = buf.toString('latin1', off, off + 4), size = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + size);
    if (id === 'VP8X') { animated = !!(data[0] & 0x02); W = 1 + data.readUIntLE(4, 3); H = 1 + data.readUIntLE(7, 3); }
    else if (id === 'ANMF') {
      frames.push({
        x: data.readUIntLE(0, 3) * 2, y: data.readUIntLE(3, 3) * 2,
        w: 1 + data.readUIntLE(6, 3), h: 1 + data.readUIntLE(9, 3),
        dur: data.readUIntLE(12, 3),
        dispose: !!(data[15] & 0x01), noBlend: !!(data[15] & 0x02),
        chunks: sub(data.subarray(16))
      });
    }
    off += 8 + size + (size % 2);
  }
  return { W, H, animated: animated && frames.length > 1, frames };
}

// wraps the pieces of one animation frame into a normal single-image WebP
function frameToWebp(fr) {
  const hasAlpha = fr.chunks.some(c => c.id === 'ALPH' || c.id === 'VP8L');
  let body = Buffer.concat(fr.chunks.map(c => c.raw));
  if (fr.chunks.some(c => c.id === 'ALPH')) {
    const vp8x = Buffer.alloc(18);
    vp8x.write('VP8X', 0, 'latin1'); vp8x.writeUInt32LE(10, 4);
    vp8x[8] = 0x10;
    vp8x.writeUIntLE(fr.w - 1, 12, 3); vp8x.writeUIntLE(fr.h - 1, 15, 3);
    body = Buffer.concat([vp8x, body]);
  }
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(4 + body.length, 4); head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}

// turns an animated WebP sticker into full PNG frames (stacked on black, or transparent) + their durations
async function webpToFrames(buf, dir, { transparent = false, maxFrames = 300 } = {}) {
  const info = parseWebp(buf);
  const { W, H } = info;
  const bg = transparent ? 'black@0' : 'black';
  const blank = path.join(dir, 'blank.png');
  await runFf(['-y', '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H},format=rgba`, '-frames:v', '1', blank]);
  let canvas = blank;
  const out = [], durs = [];
  const list = info.frames.slice(0, maxFrames);
  for (let i = 0; i < list.length; i++) {
    const fr = list[i];
    const wp = path.join(dir, `f${i}.webp`), fp = path.join(dir, `f${i}.png`), cp = path.join(dir, `c${String(i).padStart(4, '0')}.png`);
    fs.writeFileSync(wp, frameToWebp(fr));
    await runFf(['-y', '-i', wp, '-frames:v', '1', fp]);
    await runFf(['-y', '-i', canvas, '-i', fp, '-filter_complex', `[0:v][1:v]overlay=${fr.x}:${fr.y}:format=auto,format=rgba`, '-frames:v', '1', cp]);
    out.push(cp); durs.push(Math.max(fr.dur, 20) / 1000);
    if (fr.dispose) {
      // "dispose to background" only clears this frame's own rectangle, not the whole picture
      const kp = path.join(dir, `k${i}.png`);
      await runFf(['-y', '-i', cp, '-vf', `format=rgba,drawbox=x=${fr.x}:y=${fr.y}:w=${fr.w}:h=${fr.h}:color=${bg}:t=fill:replace=1`, '-frames:v', '1', kp]);
      canvas = kp;
    } else canvas = cp;
  }
  return { W, H, frames: out, durs };
}

module.exports = [

    {
    command: ['topdf'],
    aliases: ['pdf', 'makepdf', 'img2pdf', 'text2pdf'],
    description: 'Convert a quoted image or text to a PDF file',
    category: 'converter',
    handler: async (client, m, { reply, text }) => {
      const PDFDocument = require('pdfkit');

     const msgR     = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
     const quotedText = msgR?.conversation || msgR?.extendedTextMessage?.text || '';
     const inputText  = text || quotedText;
     const imageMsg = msgR?.imageMessage || null;

      if (!imageMsg && !inputText) return reply(
        '📄 *Usage:*\n• Reply to an image: *.topdf*\n• Convert text: *.topdf Your text here*'
      );

      let imgFilePath;
      const pdfPath = path.join(os.tmpdir(), `pdf_${Date.now()}.pdf`);

      try {
        reply('⏳ Creating PDF...');
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const ws  = fs.createWriteStream(pdfPath);
        doc.pipe(ws);

        if (imageMsg) {
          imgFilePath = await client.downloadAndSaveMediaMessage(imageMsg);
          if (!imgFilePath || !fs.existsSync(imgFilePath)) throw new Error('Download failed');
          const pageW = doc.page.width - 80;
          const pageH = doc.page.height - 80;
          doc.image(imgFilePath, 40, 40, { fit: [pageW, pageH], align: 'center', valign: 'center' });
        } else {
          doc.font('Helvetica').fontSize(12).text(inputText, { align: 'left', lineGap: 4 });
        }

        doc.end();
        await new Promise((resolve, reject) => { ws.on('finish', resolve); ws.on('error', reject); });

        await client.sendMessage(m.chat, {
          document: fs.readFileSync(pdfPath),
          mimetype: 'application/pdf',
          fileName: `document_${Date.now()}.pdf`,
          caption: '✅ *PDF created successfully!*',
        }, { quoted: m });

      } catch (err) {
        console.error('topdf error:', err.message);
        reply('❌ Failed to create PDF. Try again.');
      } finally {
        for (const p of [imgFilePath, pdfPath]) {
          if (p && fs.existsSync(p)) try { fs.unlinkSync(p); } catch (_) {}
        }
      }
    }
  },

    {
    command: ['toexcel'],
    aliases: ['excel', 'makeexcel', 'toxlsx', 'text2excel'],
    description: 'Convert comma-separated text to an Excel spreadsheet',
    category: 'converter',
    handler: async (client, m, { reply, text }) => {
      const XLSX = require('xlsx');

      const msgR       = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
      const quotedText = msgR?.conversation || msgR?.extendedTextMessage?.text || '';
      const inputText  = text || quotedText;

      if (!inputText?.trim()) return reply(
        '📊 *Usage:*\n*.toexcel Name,Age,City\\nJohn,25,NY\\nJane,30,LA*\n\n_Columns = commas, Rows = new lines_\n_Or reply to a text message with CSV data_'
      );

      const xlsxPath = path.join(os.tmpdir(), `excel_${Date.now()}.xlsx`);
      try {
        reply('⏳ Creating Excel file...');

        const lines = inputText.trim().split(/\n|\\n/).filter(l => l.trim());
        const data  = lines.map(line =>
          line.split(',').map(cell => {
            const t = cell.trim();
            const n = Number(t);
            return (!isNaN(n) && t !== '') ? n : t;
          })
        );

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();

        // Auto column widths
        const colWidths = data.reduce((acc, row) => {
          row.forEach((cell, i) => { acc[i] = Math.max(acc[i] || 10, String(cell).length + 4); });
          return acc;
        }, []);
        ws['!cols'] = colWidths.map(w => ({ wch: w }));

        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, xlsxPath);

        await client.sendMessage(m.chat, {
          document: fs.readFileSync(xlsxPath),
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName: `spreadsheet_${Date.now()}.xlsx`,
          caption: `✅ *Excel created!*\n📊 ${data.length} rows × ${data[0]?.length || 0} columns`,
        }, { quoted: m });

      } catch (err) {
        console.error('toexcel error:', err.message);
        reply('❌ Failed to create Excel. Make sure data is comma-separated.');
      } finally {
        if (fs.existsSync(xlsxPath)) try { fs.unlinkSync(xlsxPath); } catch (_) {}
      }
    }
  },

    {
    command: ['toword'],
    aliases: ['word', 'makedoc', 'todocx', 'img2word', 'text2word'],
    description: 'Convert a quoted image or text to a Word (.docx) file',
    category: 'converter',
    handler: async (client, m, { reply, text }) => {

      const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } = require('docx');

      const msgR     = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
      const quotedText = msgR?.conversation || msgR?.extendedTextMessage?.text || '';
      const inputText  = text || quotedText;
      const imageMsg = msgR?.imageMessage || null;

      if (!imageMsg && !inputText) return reply(
        '📝 *Usage:*\n• Reply to an image: *.toword*\n• Convert text: *.toword Your text here*'
      );

      let imgFilePath;
      try {
        reply('⏳ Creating Word document...');
        let children = [];

        if (imageMsg) {
          imgFilePath = await client.downloadAndSaveMediaMessage(imageMsg);
          if (!imgFilePath || !fs.existsSync(imgFilePath)) throw new Error('Download failed');
          const imgBuffer = fs.readFileSync(imgFilePath);
          const ext = path.extname(imgFilePath).replace('.', '').toLowerCase() || 'jpeg';
          children.push(
            new Paragraph({
              children: [new ImageRun({ data: imgBuffer, transformation: { width: 500, height: 350 }, type: ext === 'png' ? 'png' : 'jpg' })],
              alignment: AlignmentType.CENTER,
            })
          );
        } else {
          for (const line of inputText.split('\n')) {
            children.push(
              line.trim()
                ? new Paragraph({ children: [new TextRun({ text: line.trim(), size: 24, font: 'Calibri' })], spacing: { after: 120 } })
                : new Paragraph({})
            );
          }
        }

        const doc = new Document({ sections: [{ properties: {}, children }] });
        const docBuffer = await Packer.toBuffer(doc);

        await client.sendMessage(m.chat, {
          document: docBuffer,
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileName: `document_${Date.now()}.docx`,
          caption: '✅ *Word document created successfully!*',
        }, { quoted: m });

      } catch (err) {
        console.error('toword error:', err.message);
        reply('❌ Failed to create Word document. Try again.');
      } finally {
        if (imgFilePath && fs.existsSync(imgFilePath)) try { fs.unlinkSync(imgFilePath); } catch (_) {}
      }
    }
  },

  {
  command: ['tovideo'],
  aliases: ['mp4', 'tovid'],
  description: 'Convert animated sticker to video',
  category: 'converter',
  handler: async (client, m, { reply, prefix, command }) => {
    if (!m.quoted) return reply(`📎 Reply to an *animated sticker* with *${prefix + command}*`);
    const mime = (m.quoted.msg || m.quoted).mimetype || '';
    if (!/webp/.test(mime)) return reply(`⚠️ That's not a sticker.`);
    const dir = path.join(os.tmpdir(), `tovideo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    try {
      await m.reply('🎬 _Converting sticker to video..._');
      const buf = await m.quoted.download();
      if (!buf || !buf.length) return reply('❌ Could not download the sticker.');
      let info;
      try { info = parseWebp(buf); } catch (e) { return reply('❌ ' + e.message); }
      if (!info.animated) return reply('⚠️ This is a *static* sticker, not animated! Use *.toimg* instead.');

      fs.mkdirSync(dir, { recursive: true });
      const { W, H, frames, durs } = await webpToFrames(buf, dir, { transparent: false });

      // list of frames with their real durations (the last one is repeated, as concat requires)
      let listTxt = '';
      frames.forEach((f, i) => { listTxt += `file '${f.replace(/'/g, "'\\''")}'\nduration ${durs[i].toFixed(3)}\n`; });
      listTxt += `file '${frames[frames.length - 1].replace(/'/g, "'\\''")}'\n`;
      fs.writeFileSync(path.join(dir, 'list.txt'), listTxt);

      const outputPath = path.join(dir, 'out.mp4');
      await runFf([
        '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
        '-vf', `fps=20,${enlargeFilter()}scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', 'faststart', outputPath
      ], 90000);
      if (!fs.existsSync(outputPath)) return m.reply('❌ Output file not created');

      await client.sendMessage(m.chat, {
        video: fs.readFileSync(outputPath),
        mimetype: 'video/mp4',
        caption: '*Sticker converted successfully to Video*'
      }, { quoted: m });
    } catch (err) {
      m.reply('❌ Error: ' + err.message);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  }
},

  {
    command: ['toaudio'],
    aliases: ['audioe'],
    description: 'Convert video to audio',
    category: 'converter',
    handler: async (client, m, { reply, quoted, mime }) => {
      if (!quoted) return reply('Reply to a video message to convert it to audio.');
      if (!/video/.test(mime)) return reply('Reply to a *video* message.');
      await reply('🎵 _Converting video to audio..._');
      const buffer = await client.downloadMediaMessage(quoted);
      const tmpIn = `tmp_in_${Date.now()}.mp4`;
      const tmpOut = `tmp_out_${Date.now()}.mp3`;
      const tmpDir = os.tmpdir();
      const tIn = path.join(tmpDir, tmpIn), tOut = path.join(tmpDir, tmpOut);
      fs.writeFileSync(tIn, buffer);
      try { fs.unlinkSync(tmpIn); } catch {}
      try {
        await runFf(['-y', '-i', tIn, '-vn', '-acodec', 'libmp3lame', tOut], 90000);
        await client.sendMessage(m.chat, { audio: fs.readFileSync(tOut), mimetype: 'audio/mpeg', fileName: 'audio.mp3' }, { quoted: m });
      } catch (e) {
        m.reply('❌ Conversion failed: ' + e.message);
      } finally {
        try { fs.unlinkSync(tIn); } catch {}
        try { fs.unlinkSync(tOut); } catch {}
      }
    }
  },

    {
    command: ['toimg'],
    aliases: ['photo', 'toimage'],
    description: 'Convert a sticker to image',
    category: 'converter',
    handler: async (client, m, { reply, mime, quoted }) => {
      if (!quoted) return m.reply('Tag a sticker with the command!');
      if (!/webp/.test(mime)) return m.reply(`Tag a sticker to convert to photo`);
      const dir = path.join(os.tmpdir(), `toimg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      try {
        fs.mkdirSync(dir, { recursive: true });
        const buf = await m.quoted.download();
        if (!buf || !buf.length) return m.reply('❌ Could not download the sticker.');
        const png = path.join(dir, 'out.png');
        let info = null;
        try { info = parseWebp(buf); } catch (_) {}

        if (info && info.animated) {
          // animated sticker: ffmpeg cannot read it directly, so take its first frame
          const r = await webpToFrames(buf, dir, { transparent: true, maxFrames: 1 });
          fs.copyFileSync(r.frames[0], png);
        } else {
          const src = path.join(dir, 'in.webp');
          fs.writeFileSync(src, buf);
          await runFf(['-y', '-i', src, '-frames:v', '1', png]);
        }
        if (ENLARGE_TO) {
          const big = path.join(dir, 'big.png');
          try { await runFf(['-y', '-i', png, '-vf', enlargeFilter().replace(/,$/, ''), '-frames:v', '1', big]); fs.copyFileSync(big, png); } catch (_) {}
        }
        await client.sendMessage(m.chat, { image: fs.readFileSync(png), caption: `𝗖𝗼𝗻𝘃𝗲𝗿𝘁𝗲𝗱 𝗯𝘆 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃` }, { quoted: m });
      } catch (err) {
        m.reply('❌ Conversion failed: ' + err.message);
      } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
      }
    }
  },

      {
    command: ['ocr'],
    aliases: ['readtext', 'extract', 'imgtotext', 'scan'],
    description: 'Extract text from a quoted image',
    category: 'converter',
    handler: async (client, m, { reply }) => {

      const msgR = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
      if (!msgR) return reply('🖼️ Reply to an image with *.ocr* to read text from it.');

      const imageMsg = msgR.imageMessage || null;
      if (!imageMsg) return reply('❌ Quoted message is not an image.');

      let filePath;
      try {
        reply('🔍 Scanning image for text...');

        filePath = await client.downloadAndSaveMediaMessage(imageMsg);
        if (!filePath || !fs.existsSync(filePath)) throw new Error('Image download failed');

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('language', 'eng');
        form.append('isOverlayRequired', 'false');
        form.append('detectOrientation', 'true');
        form.append('scale', 'true');
        form.append('OCREngine', '2');

        const res = await axios.post(
          'https://api.ocr.space/parse/image',
          form,
          {
            headers: {
              ...form.getHeaders(),
              'apikey': 'helloworld',
            },
            timeout: 30000,
          }
        );

        const data = res.data;
        if (data?.IsErroredOnProcessing) {
          return reply(`❌ OCR error: ${data.ErrorMessage?.[0] || 'Unknown error'}`);
        }

        const text = data?.ParsedResults?.[0]?.ParsedText?.trim();
        if (!text) return reply('🤷 No text found in the image. Try a clearer photo.');

        await client.sendMessage(m.chat, {
          text: `${text}`,
        }, { quoted: m });

      } catch (err) {
        console.error('OCR error:', err.message);
        reply('❌ Failed to read text. Try a clearer, well-lit photo.');
      } finally {
        if (filePath && fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }
  },

    {
    command: ['attp'],
    description: 'Animated text sticker',
    category: 'converter',
    handler: async (client, m, { reply, q }) => {
      if (!q) return reply('Provide text. E.g: .attp Hello World');
      client.sendMessage(m.chat, {
        sticker: { url: `https://api.lolhuman.xyz/api/attp?apikey=cde5404984da80591a2692b6&text=${encodeURIComponent(q)}` }
      }, { quoted: m });
    }
  },

  {
    command: ['carbon'],
    description: 'Turn code into a carbon screenshot',
    category: 'converter',
    handler: async (client, m, { reply }) => {
      if (!m.quoted || !m.quoted.text) return reply('Quote a code message to convert to carbon image.');
      try {
        const response = await fetch('https://carbonara.solopov.dev/api/cook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: m.quoted.text, backgroundColor: '#1F816D' }),
        });
        if (!response.ok) return m.reply('API failed to fetch a valid response.');
        const buffer = await response.buffer();
        await client.sendMessage(m.chat, {
          image: buffer,
          caption: `𝗖𝗢𝗡𝗩𝗘𝗥𝗧𝗘𝗗 𝗕𝗬 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃`
        }, { quoted: m });
      } catch (err) {
        m.reply('❌ Carbon failed: ' + err.message);
      }
    }
  },

      {
    command: ['totext'],
    aliases: ['stt', 'listen', 'transcribe', 'audiotxt'],
    description: 'Convert a quoted voice/audio message to text',
    category: 'converter',
    handler: async (client, m, { reply }) => {
      const ffmpeg     = require('fluent-ffmpeg');
      ffmpeg.setFfmpegPath(ffmpegBin());

      const msgR = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
      if (!msgR) return reply('🎙️ Reply to a voice note or audio message with *.transcribe*');

      const audioMsg = msgR.audioMessage || msgR.videoMessage || null;
      if (!audioMsg) return reply('❌ Quoted message is not audio. Reply to a voice note.');

      let rawPath, flacPath;
      try {
        reply('⏳ Converting audio to text...');

        rawPath = await client.downloadAndSaveMediaMessage(audioMsg);
        if (!rawPath || !fs.existsSync(rawPath)) throw new Error('Audio download failed');

        flacPath = path.join(os.tmpdir(), `stt_${Date.now()}.flac`);
        await new Promise((resolve, reject) => {
          ffmpeg(rawPath)
            .audioChannels(1)
            .audioFrequency(16000)
            .toFormat('flac')
            .on('end', resolve)
            .on('error', reject)
            .save(flacPath);
        });

        const flacBuffer = fs.readFileSync(flacPath);
        const GOOGLE_KEY = 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';
        const res = await axios.post(
          `https://www.google.com/speech-api/v2/recognize?output=json&lang=en-US&key=${GOOGLE_KEY}`,
          flacBuffer,
          {
            headers: { 'Content-Type': 'audio/x-flac; rate=16000' },
            timeout: 30000,
          }
        );

        const lines = String(res.data).trim().split('\n').filter(l => l.trim() && l !== '{}');
        let transcript = '';
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const alt = obj?.result?.[0]?.alternative?.[0]?.transcript;
            if (alt) transcript += alt + ' ';
          } catch (_) {}
        }

        transcript = transcript.trim();
        if (!transcript) return reply('🤷 Could not make out any speech. Try a clearer audio message.');

        await client.sendMessage(m.chat, {
          text: `🎙️ *Transcription:*\n\n${transcript}`,
        }, { quoted: m });

      } catch (err) {
        console.error('Transcribe error:', err.message);
        reply('❌ Transcription failed. Audio may be too long (max ~60s) or too noisy.');
      } finally {
        for (const p of [rawPath, flacPath]) {
          if (p && fs.existsSync(p)) try { fs.unlinkSync(p); } catch (_) {}
        }
      }
    }
  },

  ];
