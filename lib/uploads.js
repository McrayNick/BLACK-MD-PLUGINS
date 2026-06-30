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

async function uploadToUguu(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: mimeType
  });

  const response = await axios.post('https://uguu.se/upload.php', form, {
    headers: {
      ...form.getHeaders(),
      'origin': 'https://uguu.se',
      'referer': 'https://uguu.se/',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    }
  });

  const result = response.data;
  if (result.success && result.files?.[0]?.url) {
    return result.files[0].url;
  } else {
    throw new Error("Uguu upload failed or malformed response");
  }
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

  module.exports = { uploadToUguu, uploadToImgBB, upscaleImage }
  
