'use strict';

const BM = '𝐁𝐋𝐀𝐂𝐊-𝐌𝐃';
const TAG = `_${BM}_`;
const UA = 'BLACK-MD-Bot/1.0 (+https://github.com/McrayNick/BLACK-MD-PLUGINS)';

const http = () => global.axios || require('axios');
async function getJson(url, params) {
  const r = await http().get(url, { params, timeout: 20000, headers: { 'User-Agent': UA, Accept: 'application/json' }, validateStatus: s => s >= 200 && s < 300 });
  return r.data;
}
const enc = encodeURIComponent;
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const num = (n, d = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const quotedText = (m) => (m.quoted ? [m.quoted.text, m.quoted.body, m.quoted.caption, m.quoted.msg?.text].find(Boolean) || '' : '');
const nairobi = (ms, opts) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false, ...opts });
const bar = (title) => `*${BM} · ${title}*`;

async function sendCard(client, m, image, caption) {
  if (image) {
    try { return await client.sendMessage(m.chat, { image: { url: image }, caption }, { quoted: m }); } catch (_) {}
  }
  return client.sendMessage(m.chat, { text: caption }, { quoted: m });
}

const WX = [[0, '☀️ Clear'], [1, '🌤️ Mostly clear'], [2, '⛅ Partly cloudy'], [3, '☁️ Overcast'], [45, '🌫️ Fog'], [48, '🌫️ Rime fog'], [51, '🌦️ Light drizzle'], [53, '🌦️ Drizzle'], [55, '🌧️ Heavy drizzle'], [56, '🌧️ Freezing drizzle'], [57, '🌧️ Freezing drizzle'], [61, '🌧️ Light rain'], [63, '🌧️ Rain'], [65, '🌧️ Heavy rain'], [66, '🌧️ Freezing rain'], [67, '🌧️ Freezing rain'], [71, '🌨️ Light snow'], [73, '🌨️ Snow'], [75, '❄️ Heavy snow'], [77, '🌨️ Snow grains'], [80, '🌦️ Showers'], [81, '🌧️ Showers'], [82, '⛈️ Violent showers'], [85, '🌨️ Snow showers'], [86, '🌨️ Snow showers'], [95, '⛈️ Thunderstorm'], [96, '⛈️ Thunderstorm, hail'], [99, '⛈️ Thunderstorm, hail']];
const wx = (c) => (WX.find(x => x[0] === c) || [0, '🌡️ Unknown'])[1];

async function geocode(q) {
  const d = await getJson('https://geocoding-api.open-meteo.com/v1/search', { name: q, count: 1, language: 'en', format: 'json' });
  const r = d && d.results && d.results[0];
  if (!r) throw new Error(`No place found for "${q}"`);
  return { name: [r.name, r.admin1, r.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '), lat: r.latitude, lon: r.longitude };
}

const COINS = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin', xrp: 'ripple', usdt: 'tether', usdc: 'usd-coin', doge: 'dogecoin', ada: 'cardano', trx: 'tron', ton: 'the-open-network', dot: 'polkadot', ltc: 'litecoin', shib: 'shiba-inu', avax: 'avalanche-2', link: 'chainlink', matic: 'matic-network', pepe: 'pepe' };

const VERSES = ['Psalm 23:1-4', 'Proverbs 3:5-6', 'Philippians 4:13', 'Isaiah 41:10', 'Joshua 1:9', 'Romans 8:28', 'Jeremiah 29:11', 'Psalm 121:1-2', 'Matthew 6:33', 'Psalm 46:1', 'Proverbs 16:3', 'Isaiah 40:31'];

const decode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };

const sans = (s) => String(s).replace(/[A-Za-z0-9]/g, (c) => {
  const k = c.charCodeAt(0);
  if (k >= 97) return String.fromCodePoint(0x1D5EE + k - 97);
  if (k >= 65) return String.fromCodePoint(0x1D5D4 + k - 65);
  return String.fromCodePoint(0x1D7EC + k - 48);
});

const defs = [];
const add = (command, aliases, description, usage, fn) => defs.push({ command, aliases, description, usage, fn });

add(['skycast'], ['forecast', 'wxcast'], 'Weather and 3-day forecast for any city', 'skycast Nairobi', async ({ t }) => {
  const g = await geocode(t);
  const d = await getJson('https://api.open-meteo.com/v1/forecast', { latitude: g.lat, longitude: g.lon, current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: 4 });
  const c = d.current, dl = d.daily;
  const days = dl.time.map((day, i) => {
    const name = i === 0 ? 'Today' : new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    return `${name.padEnd(5)} ${wx(dl.weather_code[i])}  ${Math.round(dl.temperature_2m_min[i])}°–${Math.round(dl.temperature_2m_max[i])}°C  ☔${dl.precipitation_probability_max[i] ?? 0}%`;
  });
  return [bar('Skycast'), `📍 ${g.name}`, '', `${wx(c.weather_code)}  *${Math.round(c.temperature_2m)}°C*`, `Feels like ${Math.round(c.apparent_temperature)}°C · Humidity ${c.relative_humidity_2m}% · Wind ${Math.round(c.wind_speed_10m)} km/h`, '', ...days, '', TAG].join('\n');
});

add(['sunwatch'], ['sunrise', 'sunset'], 'Sunrise and sunset times for a city', 'sunwatch Mombasa', async ({ t }) => {
  const g = await geocode(t);
  const d = await getJson('https://api.open-meteo.com/v1/forecast', { latitude: g.lat, longitude: g.lon, daily: 'sunrise,sunset,daylight_duration', timezone: 'auto', forecast_days: 1 });
  const hm = (s) => String(s).split('T')[1];
  const dur = d.daily.daylight_duration[0];
  return [bar('Sunwatch'), `📍 ${g.name}`, '', `🌅 Sunrise  *${hm(d.daily.sunrise[0])}*`, `🌇 Sunset   *${hm(d.daily.sunset[0])}*`, `☀️ Daylight ${Math.floor(dur / 3600)}h ${Math.round((dur % 3600) / 60)}m`, '', TAG].join('\n');
});

add(['coinwatch'], ['crypto', 'coinprice'], 'Live crypto prices in USD and KES', 'coinwatch btc  (or just coinwatch)', async ({ t }) => {
  const list = (t ? t.toLowerCase().split(/[\s,]+/).filter(Boolean) : ['btc', 'eth', 'sol', 'bnb', 'xrp', 'doge']).slice(0, 8);
  const ids = list.map(x => COINS[x] || x);
  const d = await getJson('https://api.coingecko.com/api/v3/simple/price', { ids: ids.join(','), vs_currencies: 'usd,kes', include_24hr_change: 'true' });
  const rows = ids.map((id, i) => {
    const r = d[id];
    if (!r) return `${list[i].toUpperCase()}: not found`;
    const ch = r.usd_24h_change;
    const arrow = ch == null ? '' : (ch >= 0 ? `🟢 +${num(ch)}%` : `🔴 ${num(ch)}%`);
    return `*${list[i].toUpperCase()}*  $${num(r.usd, r.usd < 1 ? 6 : 2)}  ·  KES ${num(r.kes, r.kes < 1 ? 4 : 0)}  ${arrow}`;
  });
  return [bar('Coinwatch'), '', ...rows, '', '_24h change in USD_', TAG].join('\n');
});

add(['fxrate'], ['xchange', 'convertcash'], 'Currency converter with live rates', 'fxrate 100 usd kes', async ({ t }) => {
  const mt = t.trim().match(/^(\d[\d,]*(?:\.\d+)?)?\s*([a-z]{3})\s*(?:to|in|>|=)?\s*([a-z]{3})$/i);
  if (!mt) throw new Error('Format: fxrate 100 usd kes');
  const amount = mt[1] ? Number(mt[1].replace(/,/g, '')) : 1;
  const from = mt[2].toUpperCase(), to = mt[3].toUpperCase();
  const d = await getJson(`https://open.er-api.com/v6/latest/${from}`);
  if (d.result !== 'success' || !d.rates || !d.rates[to]) throw new Error(`Unknown currency ${from} or ${to}`);
  const rate = d.rates[to];
  return [bar('FX Rate'), '', `*${num(amount)} ${from}* = *${num(amount * rate, 4)} ${to}*`, `1 ${from} = ${num(rate, 6)} ${to}`, '', `_${cut(d.time_last_update_utc || '', 40)}_`, TAG].join('\n');
});

add(['lexicon'], ['define', 'meaning'], 'Dictionary: meaning, phonetics, examples', 'lexicon serendipity', async ({ t }) => {
  const d = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc(t.split(/\s+/)[0])}`);
  const e = d[0];
  const out = [bar('Lexicon'), '', `📖 *${e.word}* ${e.phonetic ? '_' + e.phonetic + '_' : ''}`, ''];
  for (const mn of (e.meanings || []).slice(0, 3)) {
    const df = mn.definitions[0];
    out.push(`*${mn.partOfSpeech}*`, `• ${df.definition}`);
    if (df.example) out.push(`  _"${df.example}"_`);
    if (mn.synonyms && mn.synonyms.length) out.push(`  ≈ ${mn.synonyms.slice(0, 5).join(', ')}`);
    out.push('');
  }
  return [...out, TAG].join('\n');
});

add(['wikisum'], ['wikipedia2', 'whatis'], 'Wikipedia summary with picture', 'wikisum Mount Kenya', async ({ t, client, m }) => {
  const s = await getJson('https://en.wikipedia.org/w/api.php', { action: 'opensearch', search: t, limit: 1, format: 'json' });
  const title = s && s[1] && s[1][0];
  if (!title) throw new Error(`Nothing found for "${t}"`);
  const d = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(title.replace(/ /g, '_'))}`);
  const cap = [bar('Wikisum'), '', `📚 *${d.title}*${d.description ? '\n_' + d.description + '_' : ''}`, '', cut(d.extract, 900), '', d.content_urls && d.content_urls.desktop ? d.content_urls.desktop.page : '', TAG].join('\n');
  await sendCard(client, m, d.thumbnail && d.thumbnail.source, cap);
  return null;
});

add(['nation'], ['countryinfo', 'flagfacts'], 'Country facts with flag', 'nation Kenya', async ({ t, client, m }) => {
  const d = await getJson(`https://restcountries.com/v3.1/name/${enc(t)}`, { fields: 'name,capital,population,region,subregion,flags,currencies,languages,area,timezones,idd,cca2' });
  const c = d[0];
  const cur = Object.values(c.currencies || {}).map(x => `${x.name} (${x.symbol || ''})`).join(', ');
  const code = c.idd && c.idd.root ? c.idd.root + ((c.idd.suffixes || [])[0] || '') : '';
  const cap = [bar('Nation'), '', `🌍 *${c.name.common}* — ${c.name.official}`, `Capital: ${(c.capital || []).join(', ') || '—'}`, `Region: ${c.region}${c.subregion ? ' · ' + c.subregion : ''}`, `Population: ${num(c.population, 0)}`, `Area: ${num(c.area, 0)} km²`, `Currency: ${cur || '—'}`, `Languages: ${Object.values(c.languages || {}).join(', ') || '—'}`, `Dial code: ${code || '—'}`, `Time zones: ${(c.timezones || []).slice(0, 3).join(', ')}`, '', TAG].join('\n');
  await sendCard(client, m, c.flags && c.flags.png, cap);
  return null;
});

add(['verse'], ['bibleverse', 'scripture'], 'Bible verse by reference, or a random one', 'verse John 3:16', async ({ t }) => {
  const ref = t || VERSES[Math.floor(Math.random() * VERSES.length)];
  const d = await getJson(`https://bible-api.com/${enc(ref)}`);
  return [bar('Verse'), '', `📖 *${d.reference}*`, '', cut(d.text, 1200), '', `_${d.translation_name || ''}_`, TAG].join('\n');
});

add(['salat'], ['prayertimes', 'swalah'], 'Daily prayer times for a city', 'salat Mombasa, Kenya', async ({ t }) => {
  const parts = (t || 'Nairobi').split(',').map(x => x.trim());
  const d = await getJson('https://api.aladhan.com/v1/timingsByCity', { city: parts[0], country: parts[1] || 'Kenya' });
  const tm = d.data.timings, dt = d.data.date;
  const row = (n, k) => `${n.padEnd(9)} *${String(tm[k]).split(' ')[0]}*`;
  return [bar('Salat'), `📍 ${parts[0]}, ${parts[1] || 'Kenya'}`, `${dt.readable} · ${dt.hijri.day} ${dt.hijri.month.en} ${dt.hijri.year} AH`, '', row('Fajr', 'Fajr'), row('Sunrise', 'Sunrise'), row('Dhuhr', 'Dhuhr'), row('Asr', 'Asr'), row('Maghrib', 'Maghrib'), row('Isha', 'Isha'), '', TAG].join('\n');
});

add(['brainbolt'], ['triviaq', 'quizme'], 'Trivia question, answer revealed after 25 seconds', 'brainbolt', async ({ client, m }) => {
  const d = await getJson('https://opentdb.com/api.php', { amount: 1, type: 'multiple', encode: 'url3986' });
  const q = d.results && d.results[0];
  if (!q) throw new Error('No question came back, try again');
  const answer = decode(q.correct_answer);
  const opts = [...q.incorrect_answers.map(decode), answer].sort(() => Math.random() - 0.5);
  const letters = ['A', 'B', 'C', 'D'];
  const right = letters[opts.indexOf(answer)];
  await client.sendMessage(m.chat, { text: [bar('Brainbolt'), `${decode(q.category)} · ${decode(q.difficulty)}`, '', `❓ ${decode(q.question)}`, '', ...opts.map((o, i) => `*${letters[i]}.* ${o}`), '', '_Answer in 25 seconds..._', TAG].join('\n') }, { quoted: m });
  setTimeout(() => { client.sendMessage(m.chat, { text: `✅ *Answer:* ${right}. ${answer}\n${TAG}` }, { quoted: m }).catch(() => {}); }, 25000);
  return null;
});

add(['jokebox'], ['jokeme', 'laughs'], 'A clean random joke', 'jokebox', async () => {
  const d = await getJson('https://v2.jokeapi.dev/joke/Any', { 'safe-mode': '', blacklistFlags: 'nsfw,religious,political,racist,sexist,explicit' });
  const body = d.type === 'twopart' ? `${d.setup}\n\n_${d.delivery}_` : d.joke;
  return [bar('Jokebox'), '', `😂 ${body}`, '', TAG].join('\n');
});

add(['factoid'], ['randomfact', 'didyouknow'], 'A random fact', 'factoid', async () => {
  const d = await getJson('https://uselessfacts.jsph.pl/api/v2/facts/random', { language: 'en' });
  return [bar('Factoid'), '', `🧠 ${d.text}`, '', TAG].join('\n');
});

add(['counsel'], ['adviceme', 'lifetip'], 'A random piece of advice', 'counsel', async () => {
  const d = await getJson('https://api.adviceslip.com/advice');
  const s = typeof d === 'string' ? JSON.parse(d) : d;
  return [bar('Counsel'), '', `💡 ${s.slip.advice}`, '', TAG].join('\n');
});

add(['wisdom'], ['zenquote', 'quoteme'], 'An inspiring quote', 'wisdom', async () => {
  const d = await getJson('https://zenquotes.io/api/random');
  const q = d[0];
  return [bar('Wisdom'), '', `❝ ${q.q} ❞`, `— *${q.a}*`, '', TAG].join('\n');
});

add(['doggo'], ['randomdog'], 'Random dog picture', 'doggo', async ({ client, m }) => {
  const d = await getJson('https://dog.ceo/api/breeds/image/random');
  await sendCard(client, m, d.message, `🐶 ${TAG}`);
  return null;
});
add(['kitty'], ['randomcat'], 'Random cat picture', 'kitty', async ({ client, m }) => {
  const d = await getJson('https://api.thecatapi.com/v1/images/search');
  await sendCard(client, m, d[0].url, `🐱 ${TAG}`);
  return null;
});
add(['foxy'], ['randomfox'], 'Random fox picture', 'foxy', async ({ client, m }) => {
  const d = await getJson('https://randomfox.ca/floof/');
  await sendCard(client, m, d.image, `🦊 ${TAG}`);
  return null;
});

add(['pokedex'], ['pokemon2', 'pokeinfo'], 'Pokémon stats and artwork', 'pokedex pikachu', async ({ t, client, m }) => {
  const d = await getJson(`https://pokeapi.co/api/v2/pokemon/${enc(t.toLowerCase().replace(/\s+/g, '-'))}`);
  const st = Object.fromEntries(d.stats.map(s => [s.stat.name, s.base_stat]));
  const img = (d.sprites.other && d.sprites.other['official-artwork'] && d.sprites.other['official-artwork'].front_default) || d.sprites.front_default;
  const cap = [bar('Pokédex'), '', `*#${d.id} ${d.name.toUpperCase()}*`, `Type: ${d.types.map(x => x.type.name).join(' / ')}`, `Height: ${d.height / 10} m · Weight: ${d.weight / 10} kg`, `Abilities: ${d.abilities.map(x => x.ability.name).join(', ')}`, '', `HP ${st.hp} · ATK ${st.attack} · DEF ${st.defense}`, `SP.ATK ${st['special-attack']} · SP.DEF ${st['special-defense']} · SPD ${st.speed}`, '', TAG].join('\n');
  await sendCard(client, m, img, cap);
  return null;
});

add(['animeinfo'], ['animedb', 'anilook'], 'Anime details, score and synopsis', 'animeinfo Naruto', async ({ t, client, m }) => {
  const d = await getJson('https://api.jikan.moe/v4/anime', { q: t, limit: 1, sfw: 'true' });
  const a = d.data && d.data[0];
  if (!a) throw new Error(`No anime found for "${t}"`);
  const cap = [bar('Animeinfo'), '', `🎌 *${a.title}*`, `Score: ⭐ ${a.score ?? 'n/a'} · Episodes: ${a.episodes ?? '?'} · ${a.status}`, `Year: ${a.year ?? '—'} · Type: ${a.type ?? '—'}`, `Genres: ${(a.genres || []).map(g => g.name).join(', ') || '—'}`, '', cut(a.synopsis, 600), '', TAG].join('\n');
  await sendCard(client, m, a.images && a.images.jpg && a.images.jpg.image_url, cap);
  return null;
});

add(['gitcard'], ['githubuser', 'ghinfo'], 'GitHub profile card with top repos', 'gitcard torvalds', async ({ t, client, m }) => {
  const u = await getJson(`https://api.github.com/users/${enc(t.split(/\s+/)[0])}`);
  let top = [];
  try {
    const repos = await getJson(`https://api.github.com/users/${enc(u.login)}/repos`, { per_page: 100, sort: 'updated' });
    top = repos.filter(r => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 3);
  } catch (_) {}
  const cap = [bar('Gitcard'), '', `🐙 *${u.name || u.login}* (@${u.login})`, u.bio ? cut(u.bio, 160) : '', `Repos ${u.public_repos} · Followers ${num(u.followers, 0)} · Following ${num(u.following, 0)}`, `Joined ${String(u.created_at).slice(0, 10)}${u.location ? ' · ' + u.location : ''}`, top.length ? '\n*Top repos*' : '', ...top.map(r => `• ${r.name} ⭐${num(r.stargazers_count, 0)}${r.language ? ' · ' + r.language : ''}`), '', u.html_url, TAG].filter(x => x !== '').join('\n');
  await sendCard(client, m, u.avatar_url, cap);
  return null;
});

add(['issnow'], ['whereisiss', 'spacestation'], 'Live position of the International Space Station', 'issnow', async () => {
  const d = await getJson('https://api.wheretheiss.at/v1/satellites/25544');
  return [bar('ISS Now'), '', `🛰️ Latitude  *${num(d.latitude, 3)}°*`, `Longitude *${num(d.longitude, 3)}°*`, `Altitude  ${num(d.altitude, 0)} km`, `Speed     ${num(d.velocity, 0)} km/h`, '', `https://maps.google.com/?q=${d.latitude},${d.longitude}`, TAG].join('\n');
});

add(['quakewatch'], ['earthquakes', 'tremors'], 'Strongest earthquakes in the last 24 hours', 'quakewatch', async () => {
  const d = await getJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
  const list = (d.features || []).sort((a, b) => b.properties.mag - a.properties.mag).slice(0, 6);
  if (!list.length) return [bar('Quakewatch'), '', 'No magnitude 4.5+ earthquakes in the last 24 hours.', TAG].join('\n');
  return [bar('Quakewatch'), '_Magnitude 4.5+ · last 24 hours_', '', ...list.map(f => `🌋 *M${f.properties.mag}*  ${f.properties.place}\n    ${nairobi(f.properties.time, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })} EAT`), '', TAG].join('\n');
});

add(['slangdef'], ['urbandef', 'streetword'], 'Slang definitions from Urban Dictionary', 'slangdef rizz', async ({ t }) => {
  const d = await getJson('https://api.urbandictionary.com/v0/define', { term: t });
  const e = (d.list || []).sort((a, b) => b.thumbs_up - a.thumbs_up)[0];
  if (!e) throw new Error(`No definition for "${t}"`);
  const clean = (s) => String(s).replace(/[\[\]]/g, '');
  return [bar('Slangdef'), '', `🗣️ *${e.word}*`, '', cut(clean(e.definition), 600), e.example ? `\n_"${cut(clean(e.example), 240)}"_` : '', `\n👍 ${num(e.thumbs_up, 0)}   👎 ${num(e.thumbs_down, 0)}`, '', TAG].filter(x => x !== '').join('\n');
});

add(['tunesearch'], ['findsong', 'songinfo'], 'Find a song and get a 30-second preview', 'tunesearch Burna Boy Last Last', async ({ t, client, m }) => {
  const d = await getJson('https://itunes.apple.com/search', { term: t, entity: 'song', limit: 1 });
  const s = d.results && d.results[0];
  if (!s) throw new Error(`No song found for "${t}"`);
  const cap = [bar('Tunesearch'), '', `🎵 *${s.trackName}*`, `Artist: ${s.artistName}`, `Album: ${s.collectionName || '—'}`, `Genre: ${s.primaryGenreName || '—'} · ${String(s.releaseDate || '').slice(0, 4)}`, s.trackTimeMillis ? `Length: ${Math.floor(s.trackTimeMillis / 60000)}:${String(Math.floor((s.trackTimeMillis % 60000) / 1000)).padStart(2, '0')}` : '', '', s.trackViewUrl || '', TAG].filter(x => x !== '').join('\n');
  await sendCard(client, m, (s.artworkUrl100 || '').replace('100x100', '600x600'), cap);
  if (s.previewUrl) await client.sendMessage(m.chat, { audio: { url: s.previewUrl }, mimetype: 'audio/mp4' }, { quoted: m });
  return null;
});

add(['bookfind'], ['findbook', 'booksearch'], 'Search books with cover and details', 'bookfind Things Fall Apart', async ({ t, client, m }) => {
  const d = await getJson('https://openlibrary.org/search.json', { q: t, limit: 3, fields: 'title,author_name,first_publish_year,cover_i,number_of_pages_median,key' });
  const docs = d.docs || [];
  if (!docs.length) throw new Error(`No book found for "${t}"`);
  const rows = docs.map((b, i) => `${i + 1}. *${b.title}* — ${(b.author_name || ['Unknown']).slice(0, 2).join(', ')}\n   ${b.first_publish_year || '—'}${b.number_of_pages_median ? ' · ' + b.number_of_pages_median + ' pages' : ''}\n   https://openlibrary.org${b.key}`);
  const cap = [bar('Bookfind'), '', ...rows, '', TAG].join('\n');
  await sendCard(client, m, docs[0].cover_i ? `https://covers.openlibrary.org/b/id/${docs[0].cover_i}-L.jpg` : null, cap);
  return null;
});

function recipeLines(o, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const ing = o[`strIngredient${i}`];
    if (ing && String(ing).trim()) out.push(`• ${String(o[`strMeasure${i}`] || '').trim()} ${String(ing).trim()}`.replace(/\s+/g, ' '));
  }
  return out;
}
add(['mixology'], ['cocktail', 'drinkrecipe'], 'Cocktail recipes', 'mixology margarita  (or just mixology)', async ({ t, client, m }) => {
  const d = await getJson(t ? 'https://www.thecocktaildb.com/api/json/v1/1/search.php' : 'https://www.thecocktaildb.com/api/json/v1/1/random.php', t ? { s: t } : undefined);
  const r = d.drinks && d.drinks[0];
  if (!r) throw new Error(`No cocktail found for "${t}"`);
  const cap = [bar('Mixology'), '', `🍹 *${r.strDrink}*`, `${r.strCategory || ''} · ${r.strAlcoholic || ''} · ${r.strGlass || ''}`, '', '*Ingredients*', ...recipeLines(r, 15), '', '*Method*', cut(r.strInstructions, 700), '', TAG].join('\n');
  await sendCard(client, m, r.strDrinkThumb, cap);
  return null;
});
add(['mealidea'], ['recipefind', 'cookwhat'], 'Meal recipes with ingredients', 'mealidea pilau  (or just mealidea)', async ({ t, client, m }) => {
  const d = await getJson(t ? 'https://www.themealdb.com/api/json/v1/1/search.php' : 'https://www.themealdb.com/api/json/v1/1/random.php', t ? { s: t } : undefined);
  const r = d.meals && d.meals[0];
  if (!r) throw new Error(`No meal found for "${t}"`);
  const cap = [bar('Mealidea'), '', `🍽️ *${r.strMeal}*`, `${r.strCategory || ''} · ${r.strArea || ''}`, '', '*Ingredients*', ...recipeLines(r, 20), '', '*Method*', cut(r.strInstructions, 800), r.strYoutube ? '\n' + r.strYoutube : '', '', TAG].join('\n');
  await sendCard(client, m, r.strMealThumb, cap);
  return null;
});

add(['npmcard'], ['npminfo', 'pkginfo'], 'npm package details and weekly downloads', 'npmcard axios', async ({ t }) => {
  const name = t.split(/\s+/)[0];
  const [p, dl] = await Promise.all([getJson(`https://registry.npmjs.org/${name.replace('/', '%2f')}/latest`), getJson(`https://api.npmjs.org/downloads/point/last-week/${name}`).catch(() => null)]);
  return [bar('NPM Card'), '', `📦 *${p.name}* v${p.version}`, cut(p.description, 200), '', `License: ${p.license || '—'}`, dl ? `Weekly downloads: ${num(dl.downloads, 0)}` : '', p.homepage ? p.homepage : '', '', TAG].filter(x => x !== '').join('\n');
});

add(['hnews'], ['hackernews', 'techtop'], 'Top Hacker News stories right now', 'hnews', async () => {
  const ids = await getJson('https://hacker-news.firebaseio.com/v0/topstories.json');
  const items = await Promise.all(ids.slice(0, 8).map(id => getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)));
  const rows = items.filter(Boolean).map((x, i) => `${i + 1}. *${cut(x.title, 90)}*\n   ▲${x.score} · ${x.descendants ?? 0} comments\n   ${x.url || 'https://news.ycombinator.com/item?id=' + x.id}`);
  return [bar('Hacker News'), '', ...rows, '', TAG].join('\n');
});

add(['namelens'], ['namescope', 'nameguess'], 'Statistical guess of age, gender and origin for a first name', 'namelens Wanjiru', async ({ t }) => {
  const n = t.split(/\s+/)[0];
  const [a, g, c] = await Promise.all([getJson('https://api.agify.io', { name: n }), getJson('https://api.genderize.io', { name: n }), getJson('https://api.nationalize.io', { name: n })]);
  let dn = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (_) {}
  const origins = (c.country || []).slice(0, 3).map(x => `${dn ? dn.of(x.country_id) : x.country_id} ${Math.round(x.probability * 100)}%`);
  return [bar('Namelens'), '', `🔎 *${n}*`, `Typical age: ${a.age ?? 'unknown'}`, `Gender lean: ${g.gender ? g.gender + ' ' + Math.round(g.probability * 100) + '%' : 'unknown'}`, `Likely origin: ${origins.join(' · ') || 'unknown'}`, '', '_Fun statistics from public data, not facts about a person_', TAG].join('\n');
});

add(['rhymes'], ['rhymewith'], 'Words that rhyme', 'rhymes love', async ({ t }) => {
  const d = await getJson('https://api.datamuse.com/words', { rel_rhy: t.split(/\s+/)[0], max: 30 });
  if (!d.length) throw new Error(`No rhymes for "${t}"`);
  return [bar('Rhymes'), '', `🎤 *${t.split(/\s+/)[0]}*`, '', d.map(x => x.word).join(' · '), '', TAG].join('\n');
});
add(['synonyms'], ['thesaurus', 'wordsalike'], 'Synonyms and related words', 'synonyms happy', async ({ t }) => {
  const w = t.split(/\s+/)[0];
  const [syn, rel] = await Promise.all([getJson('https://api.datamuse.com/words', { rel_syn: w, max: 20 }), getJson('https://api.datamuse.com/words', { ml: w, max: 20 })]);
  const a = syn.map(x => x.word);
  const b = rel.map(x => x.word).filter(x => !a.includes(x));
  if (!a.length && !b.length) throw new Error(`Nothing found for "${w}"`);
  return [bar('Synonyms'), '', `🔤 *${w}*`, a.length ? '\n*Synonyms*\n' + a.join(' · ') : '', b.length ? '\n*Related*\n' + b.join(' · ') : '', '', TAG].filter(x => x !== '').join('\n');
});

add(['xtrans'], ['quicktranslate', 'langswap'], 'Translate text, from English or between any two languages', 'xtrans sw How are you  |  xtrans fr-en Bonjour', async ({ t }) => {
  const mt = t.match(/^([a-z]{2,3})(?:[-|>]([a-z]{2,3}))?\s+([\s\S]+)$/i);
  if (!mt) throw new Error('Format: xtrans sw How are you');
  const from = mt[2] ? mt[1].toLowerCase() : 'en', to = (mt[2] || mt[1]).toLowerCase(), text = mt[3].slice(0, 450);
  const d = await getJson('https://api.mymemory.translated.net/get', { q: text, langpair: `${from}|${to}` });
  const out = d.responseData && d.responseData.translatedText;
  if (!out || Number(d.responseStatus) !== 200) throw new Error('Translation failed, check the language codes');
  return [bar('Xtrans'), `${from.toUpperCase()} → ${to.toUpperCase()}`, '', text, '', `*${out}*`, '', TAG].join('\n');
});

const needsArg = (d) => !/\(or just/.test(d.usage) && d.usage.split(' ').length > 1 && !['issnow', 'quakewatch', 'hnews', 'factoid', 'jokebox', 'counsel', 'wisdom', 'doggo', 'kitty', 'foxy', 'brainbolt', 'verse'].includes(d.command[0]);

const commands = defs.map((d) => ({
  command: d.command,
  aliases: d.aliases,
  description: d.description,
  category: 'tools',
  handler: async (client, m, ctx) => {
    const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
    const t = String((ctx && ctx.text) || quotedText(m) || '').trim();
    if (!t && needsArg(d)) return m.reply(`${bar(d.command[0])}\n\nUsage: *${p}${d.usage}*\n${TAG}`);
    try {
      const out = await d.fn({ t, client, m, p });
      if (out) await client.sendMessage(m.chat, { text: out }, { quoted: m });
    } catch (e) {
      const st = e && e.response && e.response.status;
      const msg = st === 404 ? 'Nothing found for that.' : st === 429 ? 'The service is busy, try again in a minute.' : st ? `The service answered with an error (${st}).` : (e && e.code === 'ECONNABORTED') ? 'The service took too long, try again.' : String((e && e.message) || e).slice(0, 160);
      m.reply(`❌ ${msg}`);
    }
  }
}));

const GROUPS = [
  ['WEATHER · WORLD', ['skycast', 'sunwatch', 'nation', 'issnow', 'quakewatch']],
  ['MONEY', ['coinwatch', 'fxrate']],
  ['WORDS', ['lexicon', 'wikisum', 'slangdef', 'rhymes', 'synonyms', 'xtrans']],
  ['FAITH', ['verse', 'salat']],
  ['FUN', ['brainbolt', 'jokebox', 'factoid', 'counsel', 'wisdom', 'doggo', 'kitty', 'foxy', 'namelens']],
  ['ENTERTAINMENT', ['pokedex', 'animeinfo', 'tunesearch', 'bookfind', 'mixology', 'mealidea']],
  ['DEV', ['gitcard', 'npmcard', 'hnews']]
];

commands.push({
  command: ['apimenu'],
  aliases: ['livetools', 'webtools'],
  description: 'List all live web tools',
  category: 'tools',
  handler: async (client, m, ctx) => {
    const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
    const block = (title, names) => `┌──┤ ${sans(title)} ├\n` + names.map(n => `│ ${sans(n)}`).join('\n') + '\n└──────────';
    const listed = new Set(GROUPS.flatMap(g => g[1]));
    const rest = defs.map(d => d.command[0]).filter(n => !listed.has(n));
    const blocks = GROUPS.map(g => block(g[0], g[1]));
    if (rest.length) blocks.push(block('MORE', rest));
    return m.reply(`${blocks.join('\n\n')}\n\nUse: ${p}${sans('command')} your input\nExample: ${p}${sans('skycast')} Nairobi\n${TAG}`);
  }
});

module.exports = commands;
