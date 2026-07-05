  const axios = require('axios');
  const FormData = require('form-data');
  const mime = require('mime-types');
  const fs = require('fs-extra');
  const path = require('path');  

async function uploadToImgBB(filePath) {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  
  const { data } = await axios.post('https://api.imgbb.com/1/upload?key=51a83289ef870ddee8d19ccae557fef5', form, {
    headers: form.getHeaders()
  });

  return data.data.url;
  }

async function uploadToCatbox(filePath) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath), path.basename(filePath));
  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000,
  });
  const link = String(res.data || '').trim();
  if (!link.startsWith('http')) throw new Error(`Catbox upload failed: ${link}`);
  return link;
}

async function uploadToTmpFiles(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), path.basename(filePath));
  const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000,
  });
  const url = res.data && res.data.data && res.data.data.url;
  if (!url) throw new Error('tmpfiles.org upload failed: no url in response');
  return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

async function uploadTo0x0(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), path.basename(filePath));
  const res = await axios.post('https://0x0.st', form, {
    headers: {
      ...form.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (compatible; black-super-bot uploader)',
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000,
  });
  const link = String(res.data || '').trim();
  if (!link.startsWith('http')) throw new Error(`0x0.st upload failed: ${link}`);
  return link;
}

async function uploadToUguu(filePath) {
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath), path.basename(filePath));
  const res = await axios.post('https://uguu.se/upload', form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000,
  });
  const url = res.data && res.data.files && res.data.files[0] && res.data.files[0].url;
  if (!url) throw new Error('uguu.se upload failed: no url in response');
  return url;
}

const UPLOADERS = [
  ['catbox', uploadToCatbox],
  ['0x0.st', uploadTo0x0],
  ['uguu', uploadToUguu],
  ['tmpfiles', uploadToTmpFiles],
];

async function uploadMedia(filePath) {
  const errors = [];
  for (const [name, fn] of UPLOADERS) {
    try {
      return await fn(filePath);
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(`All upload hosts failed — ${errors.join(' | ')}`);
}

function genSerial() {
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

async function upscaleImage(buffer) {
  const serial = genSerial();

  const form = new FormData();
  form.append("original_image_file", buffer, "image.jpg");
  form.append("upscale_type", "8");

  const createRes = await axios.post(
    "https://api.imgupscaler.ai/api/image-upscaler/v2/upscale/create-job",
    form,
    {
      headers: {
        ...form.getHeaders(),
        "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
        "product-serial": serial,
        timezone: "Asia/Jakarta",
        origin: "https://imgupscaler.ai",
        referer: "https://imgupscaler.ai/"
      }
    }
  );

  const create = createRes.data;
  if (create.code !== 100000) throw new Error("❌ Failed to create upscale job");

  const jobId = create.result.job_id;

  while (true) {
    await new Promise(r => setTimeout(r, 3000));

    const res = await axios.get(
      `https://api.imgupscaler.ai/api/image-upscaler/v1/universal_upscale/get-job/${jobId}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
          "product-serial": serial,
          origin: "https://imgupscaler.ai",
          referer: "https://imgupscaler.ai/"
        }
      }
    );

    const json = res.data;
    if (
      json.code === 100000 &&
      json.message?.en === "Image generated successfully."
    ) {
      return json.result.output_url;
    }
  }
}

  module.exports = { uploadMedia, uploadToCatbox, uploadToTmpFiles, uploadTo0x0, uploadToUguu, uploadToImgBB, upscaleImage };
  
