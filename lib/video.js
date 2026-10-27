'use strict';

const API_KEY = 'ytmp3_ac2b76122a683e3e88885f7ac3b906a7d7e69a1d859e2d7d3859825bf347061b';
const BEARER_TOKEN = 'backend_b598df4f3a6e475d4af493d02914a5e0bb50ed4241cb948a3df28ae54dd59ca2';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'Origin': 'https://yt-to-mp3.net',
  'Referer': 'https://yt-to-mp3.net/',
  'sec-ch-ua': '"Mises";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site'
};

async function ytmp3(videoId, format = 'mp3') {
  const ts = () => Date.now();

  const authRes = await fetch(`https://epsilon.epsiloncloud.org/api/v1/auth?api_key=${API_KEY}&_=${ts()}`, { headers: HEADERS });
  const authText = await authRes.text();
  if (authText.includes('<html')) throw new Error('Blocked by Cloudflare/HTML page.');
  JSON.parse(authText);

  const initRes = await fetch(`https://epsilon.epsiloncloud.org/api/v1/init?_=${ts()}`, {
    headers: { ...HEADERS, Authorization: `Bearer ${BEARER_TOKEN}` }
  });
  const initText = await initRes.text();
  if (initText.includes('<html')) throw new Error('Init endpoint returned HTML.');
  const { convertURL } = JSON.parse(initText);

  let result;
  let url = `${convertURL}&v=${videoId}&f=${format}&_=${ts()}`;

  while (true) {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    result = JSON.parse(text);

    if (result.error) throw new Error(`API Error Code: ${result.error}`);
    if (!result.redirect) break;

    url = result.redirectURL;
    await new Promise(r => setTimeout(r, 1000));
  }

  return {
    title: result.title,
    format,
    result_url: result.downloadURL
  };
}

module.exports = { ytmp3 };
