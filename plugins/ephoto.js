'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const BM = '𝐁𝐋𝐀𝐂𝐊-𝐌𝐃';
const TAG = `_${BM}_`;

function ffmpegBin() {
  try { return require('../lib/stickerlite').ffmpegBin(); } catch (_) { return 'ffmpeg'; }
}
function run(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBin(), args, { timeout, maxBuffer: 30 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').slice(-2).join(' ').slice(0, 220)));
      resolve(String(stderr || ''));
    });
  });
}
function makeDir() {
  const d = path.join(os.tmpdir(), `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const rmDir = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };
const quotedText = (m) => (m.quoted ? [m.quoted.text, m.quoted.body, m.quoted.caption, m.quoted.msg?.text].find(Boolean) || '' : '');

const W = 1280, H = 720, LW = 1180;

async function textLayer(text) {
  const Jimp = require('jimp');
  const keys = { 128: Jimp.FONT_SANS_128_WHITE, 64: Jimp.FONT_SANS_64_WHITE, 32: Jimp.FONT_SANS_32_WHITE };
  const pad = 10, maxW = LW - pad * 2, maxH = 540;
  let font = null;
  for (const s of [128, 64, 32]) {
    font = await Jimp.loadFont(keys[s]);
    if (Jimp.measureTextHeight(font, text, maxW) <= maxH - pad * 2) break;
  }
  const th = Jimp.measureTextHeight(font, text, maxW);
  const img = new Jimp(LW, th + pad * 2, 0x00000000);
  img.print(font, pad, pad, { text, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, maxW);
  return { png: await img.getBufferAsync(Jimp.MIME_PNG), h: th + pad * 2 };
}
async function textBounds(file, layerH) {
  try {
    const err = await run(['-hide_banner', '-loop', '1', '-t', '0.2', '-i', file, '-vf', 'alphaextract,format=gray,cropdetect=limit=20:round=2:reset=0', '-f', 'null', '-'], 30000);
    const all = [...err.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
    if (all.length) { const m = all[all.length - 1]; return { w: +m[1], h: +m[2], x: +m[3], y: +m[4] }; }
  } catch (_) {}
  return { w: LW - 100, h: Math.round(layerH * 0.6), x: 50, y: Math.round(layerH * 0.2) };
}

const q = (e) => `'${e}'`;
const geq = (r, g, b) => `format=gbrp,geq=r=${q(r)}:g=${q(g)}:b=${q(b)},format=rgba`;
const src = (c = 'black') => `color=c=${c}:s=${W}x${H}:r=1:d=1`;
const lin = (a, b, t) => `(${a}+(${b - a})*${t})`;
const rgbLin = (c1, c2, t) => [lin(c1[0], c2[0], t), lin(c1[1], c2[1], t), lin(c1[2], c2[2], t)];
const hexOf = (c) => '0x' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function fillChain(spec, box) {
  const T = `clip((Y-${box.y0})/${box.h},0,1)`;
  const S = `clip((X-${box.x0})/${box.w},0,1)`;
  const [kind, a, b, c] = spec;
  const P = 6.2832;
  switch (kind) {
    case 'solid': return `${src(hexOf(a))},format=rgba`;
    case 'grad': return `${src()},${geq(...rgbLin(a, b, T))}`;
    case 'grad3': {
      const t1 = `clip(${T}*2,0,1)`, t2 = `clip(${T}*2-1,0,1)`;
      const f = (i) => `if(lt(${T},0.5),${a[i]}+(${b[i] - a[i]})*${t1},${b[i]}+(${c[i] - b[i]})*${t2})`;
      return `${src()},${geq(f(0), f(1), f(2))}`;
    }
    case 'rainbow': return `${src()},${geq(`127+128*sin(${P}*${S})`, `127+128*sin(${P}*${S}+2.094)`, `127+128*sin(${P}*${S}+4.188)`)}`;
    case 'rainbowy': return `${src()},${geq(`127+128*sin(${P}*${T})`, `127+128*sin(${P}*${T}+2.094)`, `127+128*sin(${P}*${T}+4.188)`)}`;
    case 'chrome': {
      const L = `if(lt(${T},0.5),240-170*pow(${T}/0.5,1.3),60+180*pow((${T}-0.5)/0.5,0.9))`;
      return `${src()},${geq(`${L}*${a[0]}`, `${L}*${a[1]}`, `${L}*${a[2]}`)}`;
    }
    case 'wood': {
      const v = `(0.62+0.22*sin(0.085*Y+3*sin(0.011*X)+1.5*sin(0.031*X))+0.08*sin(0.5*Y+0.02*X))`;
      return `${src()},${geq(`210*${v}`, `140*${v}`, `80*${v}`)},noise=alls=14:allf=u`;
    }
    case 'stone': return `color=c=0x808080:s=${W}x${H}:r=1:d=1,format=gray,noise=alls=55:allf=u,gblur=sigma=1.2,format=rgba,colorchannelmixer=rr=${a[0]}:gg=${a[1]}:bb=${a[2]}`;
    case 'crack': {
      const crack = `lt(abs(sin(0.045*X+2.5*sin(0.021*Y)+1.3*sin(0.037*Y+1))),0.04)`;
      return `color=c=0x808080:s=${W}x${H}:r=1:d=1,format=gray,noise=alls=55:allf=u,gblur=sigma=1.2,format=gbrp,geq=r=${q(`1.3*r(X,Y)*(1-0.9*${crack})`)}:g=${q(`1.25*r(X,Y)*(1-0.9*${crack})`)}:b=${q(`1.15*r(X,Y)*(1-0.9*${crack})`)},format=rgba`;
    }
    case 'water': {
      const L = `(0.55+0.22*sin(0.07*Y+0.03*X)+0.18*sin(0.13*X-0.05*Y)+0.25*${T})`;
      return `${src()},${geq(`40*${L}`, `150*${L}`, `255*${L}`)}`;
    }
    case 'candy': {
      const s = 'lt(mod(X+Y,64),32)';
      return `${src()},${geq(`if(${s},205,252)`, `if(${s},25,252)`, `if(${s},40,252)`)}`;
    }
    case 'usflag': {
      const row = `floor(${T}*13)`;
      const canton = `(lt(${S},0.42)*lt(${T},0.54))`;
      const star = `lt(hypot(mod(X,26)-13,mod(Y,24)-12),3.2)`;
      return `${src()},${geq(`if(${canton},if(${star},255,50),if(lt(mod(${row},2),1),190,250))`, `if(${canton},if(${star},255,55),if(lt(mod(${row},2),1),30,250))`, `if(${canton},if(${star},255,150),if(lt(mod(${row},2),1),50,250))`)}`;
    }
    case 'ngflag': return `${src()},${geq(`if(lt(${S},0.333),0,if(lt(${S},0.667),250,0))`, `if(lt(${S},0.333),140,if(lt(${S},0.667),250,140))`, `if(lt(${S},0.333),80,if(lt(${S},0.667),250,80))`)}`;
    case 'bulbs': {
      const d = `hypot(mod(X,24)-12,mod(Y,24)-12)`;
      return `${src()},${geq(`if(lt(${d},8.5),255,55)`, `if(lt(${d},8.5),232,40)`, `if(lt(${d},8.5),150,15)`)},gblur=sigma=0.8`;
    }
    case 'paint': return `${src()},${geq(`150+105*sin(0.021*X+2*sin(0.033*Y))`, `150+105*sin(0.019*Y+2*sin(0.027*X)+2.1)`, `150+105*sin(0.017*X+0.02*Y+4.2)`)}`;
    case 'holo': return `${src()},${geq(`(70+150*${S})*(0.75+0.25*lt(mod(Y,6),3))`, `(225-70*${S})*(0.75+0.25*lt(mod(Y,6),3))`, `255*(0.75+0.25*lt(mod(Y,6),3))`)}`;
    case 'balloon': {
      const col = `mod(floor((X-${box.x0})/${Math.max(60, Math.round(box.w / 8))}),4)`;
      const hl = `(70*pow(max(0,1-${T}*2.4),2))`;
      return `${src()},${geq(`if(lt(${col},1),235,if(lt(${col},2),250,if(lt(${col},3),40,60)))+${hl}`, `if(lt(${col},1),40,if(lt(${col},2),205,if(lt(${col},3),130,200)))+${hl}`, `if(lt(${col},1),70,if(lt(${col},2),40,if(lt(${col},3),240,70)))+${hl}`)}`;
    }
    case 'snow': return `${src()},${geq(...rgbLin([255, 255, 255], [185, 215, 245], T))},noise=alls=10:allf=u`;
    case 'ruby': {
      const L = `(0.55+0.45*sin(${P}*${T}*1.2+0.6))`;
      return `${src()},${geq(`255*${L}`, `20*${L}`, `45*${L}`)}`;
    }
    case 'avengers': {
      const t1 = `clip(${T}*2,0,1)`, t2 = `clip(${T}*2-1,0,1)`;
      const f = (A, B, C) => `if(lt(${T},0.5),${A}+(${B - A})*${t1},${B}+(${C - B})*${t2})`;
      return `${src()},${geq(f(200, 250, 40), f(25, 200, 70), f(40, 70, 170))}`;
    }
    default: return `${src('white')},format=rgba`;
  }
}

function bgChain(name) {
  const dark = (c1, c2) => `${src()},${geq(...rgbLin(c1, c2, 'X/W'))},vignette=PI/4`;
  switch (name) {
    case 'dark': return `${src()},${geq('6+10*Y/H', '6+8*Y/H', '16+30*Y/H')},vignette=PI/5`;
    case 'darkblue': return `${src()},${geq('4+8*X/W', '10+22*Y/H', '34+60*(1-Y/H)')},vignette=PI/5`;
    case 'darkgrad': return `${src()},${geq('18+30*Y/H', '18+30*Y/H', '24+36*Y/H')},vignette=PI/5`;
    case 'steel': return `${src()},${geq('30+60*(1-Y/H)', '36+66*(1-Y/H)', '46+80*(1-Y/H)')},vignette=PI/4`;
    case 'darkgrey': return `${src()},${geq('30', '30', '32')},noise=alls=14:allf=u,vignette=PI/4`;
    case 'bluegrad': return `${src()},${geq('20+40*Y/H', '60+90*(1-Y/H)', '140+90*(1-Y/H)')},vignette=PI/6`;
    case 'lightgrey': return `${src()},${geq('235-45*Y/H', '238-45*Y/H', '245-35*Y/H')}`;
    case 'white': return `${src()},${geq('250-20*Y/H', '250-20*Y/H', '252-14*Y/H')}`;
    case 'pink': return `${src()},${geq('255', '205-40*Y/H', '225-30*Y/H')}`;
    case 'stars': {
      const st = `if(lt(mod(sin(X*12.9898+Y*78.233)*43758.5453,1),0.0022),235,0)`;
      return `${src()},format=gbrp,geq=r=${q('4+10*(1-X/W)+16*Y/H+' + st)}:g=${q('4+6*Y/H+' + st)}:b=${q('22+46*(1-Y/H)+' + st)},dilation,vignette=PI/5,format=rgba`;
    }
    case 'retro': {
      const hz = Math.round(H * 0.62);
      const floor = `gt(Y,${hz})`;
      const hl = `lt(mod(pow((Y-${hz})/${H - hz},2)*14,1),0.07)`;
      const vl = `lt(abs(mod((X-${W / 2})/(Y-${hz}+1)*9+0.5,1)-0.5),0.035)`;
      const g = `max(${hl},${vl})`;
      return `${src()},${geq(`if(${floor},18+237*${g},30+225*pow(Y/${hz},2))`, `if(${floor},0+40*${g},0+60*pow(Y/${hz},2))`, `if(${floor},40+120*${g},70+50*(1-Y/${hz}))`)}`;
    }
    case 'matrix': {
      const col = `floor(X/18)`;
      const hsh = `mod(sin(${col}*12.9898)*43758.5453,1)`;
      const v = `pow(mod(Y*0.012+${hsh}*10,1),3)*lt(abs(${hsh}),0.75)`;
      return `${src()},${geq(`6+20*${v}`, `10+210*${v}`, `8+40*${v}`)},gblur=sigma=0.6,vignette=PI/4`;
    }
    case 'flames': {
      const f = `clip((Y/H-0.35)*1.9+0.18*sin(0.05*X+Y*0.02)+0.1*sin(0.11*X-Y*0.03),0,1)`;
      return `${src()},${geq(`10+245*pow(${f},1.2)`, `0+120*pow(${f},2.2)`, `0+30*pow(${f},3)`)},gblur=sigma=2`;
    }
    case 'bokeh': {
      const hs = (k) => `abs(mod(sin(floor(X/150)*${(12.9898 + k).toFixed(4)}+floor(Y/150)*${(78.233 + k * 3).toFixed(4)})*43758.5453,1))`;
      const d = `hypot(X-(floor(X/150)*150+30+90*${hs(1)}),Y-(floor(Y/150)*150+30+90*${hs(2)}))`;
      const a = `(clip((14+46*${hs(3)}-${d})/12,0,1)*lt(${hs(4)},0.6)*0.5)`;
      return `${src()},format=gbrp,geq=r=${q('6+30*(1-Y/H)+255*' + a)}:g=${q('4+(90+110*' + hs(5) + ')*' + a)}:b=${q('8+(50+120*' + hs(6) + ')*' + a)},gblur=sigma=1.4,format=rgba`;
    }
    case 'brick': {
      const row = `floor(Y/44)`, off = `mod(${row},2)*60`;
      const mort = `max(lt(mod(Y,44),4),lt(mod(X+${off},120),4))`;
      return `${src()},${geq(`(150-90*${mort})-35*mod(${row}*7+floor((X+${off})/120)*13,5)/5`, `(66-30*${mort})-14*mod(${row}*7+floor((X+${off})/120)*13,5)/5`, `(52-20*${mort})-10*mod(${row}*7+floor((X+${off})/120)*13,5)/5`)},noise=alls=14:allf=u,vignette=PI/4`;
    }
    case 'wood': return `${src()},${geq(`(120+45*sin(0.08*Y+2*sin(0.01*X)))*(1-0.5*lt(mod(Y,96),3))`, `(78+30*sin(0.08*Y+2*sin(0.01*X)))*(1-0.5*lt(mod(Y,96),3))`, `(40+16*sin(0.08*Y+2*sin(0.01*X)))*(1-0.5*lt(mod(Y,96),3))`)},noise=alls=12:allf=u,vignette=PI/4`;
    case 'darkwood': return `${src()},${geq(`(62+26*sin(0.08*Y+2*sin(0.01*X)))*(1-0.6*lt(mod(Y,96),3))`, `(38+18*sin(0.08*Y+2*sin(0.01*X)))*(1-0.6*lt(mod(Y,96),3))`, `(20+10*sin(0.08*Y+2*sin(0.01*X)))*(1-0.6*lt(mod(Y,96),3))`)},noise=alls=12:allf=u,vignette=PI/3`;
    case 'water': return `${src()},${geq('10+30*(1-Y/H)+22*pow(sin(0.04*X+0.06*Y)*sin(0.05*Y-0.02*X),2)', '70+90*(1-Y/H)+30*pow(sin(0.04*X+0.06*Y)*sin(0.05*Y-0.02*X),2)', '150+90*(1-Y/H)+30*pow(sin(0.04*X+0.06*Y)*sin(0.05*Y-0.02*X),2)')}`;
    case 'underwater': return `${src()},${geq('0+30*(1-Y/H)', '50+120*(1-Y/H)', '110+120*(1-Y/H)')},format=gbrp,geq=r=${q('r(X,Y)+if(lt(abs(hypot(mod(X,150)-75,mod(Y*1.0+floor(X/150)*53,190)-95)-18),1.6),110,0)')}:g=${q('g(X,Y)+if(lt(abs(hypot(mod(X,150)-75,mod(Y*1.0+floor(X/150)*53,190)-95)-18),1.6),110,0)')}:b=${q('b(X,Y)+if(lt(abs(hypot(mod(X,150)-75,mod(Y*1.0+floor(X/150)*53,190)-95)-18),1.6),110,0)')},format=rgba`;
    case 'sand': return `color=c=0x808080:s=${W}x${H}:r=1:d=1,format=gray,noise=alls=40:allf=u,gblur=sigma=1,format=rgba,colorchannelmixer=rr=1.65:gg=1.4:bb=0.95,vignette=PI/5`;
    case 'snowbg': return `${src()},${geq('25+30*(1-Y/H)', '60+60*(1-Y/H)', '120+90*(1-Y/H)')},format=gbrp,geq=r=${q('r(X,Y)+if(lt(mod(sin(X*12.9898+Y*78.233)*43758.5453,1),0.0035),230,0)')}:g=${q('g(X,Y)+if(lt(mod(sin(X*12.9898+Y*78.233)*43758.5453,1),0.0035),230,0)')}:b=${q('b(X,Y)+if(lt(mod(sin(X*12.9898+Y*78.233)*43758.5453,1),0.0035),230,0)')},dilation,format=rgba`;
    case 'xmas': return `${src()},${geq('8+18*(1-Y/H)', '40+60*(1-Y/H)', '24+30*(1-Y/H)')},format=gbrp,geq=r=${q('r(X,Y)+if(lt(mod(sin(X*12.9898+Y*78.233)*43758.5453,1),0.004),230,0)')}:g=${q('g(X,Y)+if(lt(mod(sin(X*12.9898+Y*78.233)*43758.5453,1),0.004),230,0)')}:b=${q('b(X,Y)+if(lt(mod(sin(X*12.9898+Y*78.233)*43758.5453,1),0.004),230,0)')},dilation,format=rgba,vignette=PI/5`;
    case 'beach': {
      const sea = `Y/H`;
      return `${src()},${geq(`if(lt(${sea},0.45),90+60*${sea},if(lt(${sea},0.62),20+40*(${sea}-0.45)*5,225-30*(${sea}-0.62)))`, `if(lt(${sea},0.45),170+50*${sea},if(lt(${sea},0.62),150+50*(${sea}-0.45)*5,200-30*(${sea}-0.62)))`, `if(lt(${sea},0.45),240-20*${sea},if(lt(${sea},0.62),200,150-40*(${sea}-0.62)))`)}`;
    }
    case 'sky': return `${src()},${geq('90+100*Y/H', '160+70*Y/H', '240-10*Y/H')}`;
    case 'halftone': {
      const d = `hypot(mod(X,26)-13,mod(Y,26)-13)`;
      return `${src()},${geq(`if(lt(${d},6+5*Y/H),255,255)`, `if(lt(${d},6+5*Y/H),150,215)`, `if(lt(${d},6+5*Y/H),60,70)`)}`;
    }
    case 'confetti': return `${src()},${geq('250', '236', '244')},format=gbrp,geq=r=${q('if(lt(mod(sin(floor(X/16)*12.9898+floor(Y/16)*78.233)*43758.5453,1),0.12),127+128*sin(floor(X/16)*3.1+floor(Y/16)),r(X,Y))')}:g=${q('if(lt(mod(sin(floor(X/16)*12.9898+floor(Y/16)*78.233)*43758.5453,1),0.12),127+128*sin(floor(X/16)*3.1+floor(Y/16)+2.1),g(X,Y))')}:b=${q('if(lt(mod(sin(floor(X/16)*12.9898+floor(Y/16)*78.233)*43758.5453,1),0.12),127+128*sin(floor(X/16)*3.1+floor(Y/16)+4.2),b(X,Y))')},format=rgba`;
    case 'scan': return `${src()},${geq('0+6*Y/H', '12+26*Y/H+10*lt(mod(Y,5),2)', '32+60*(1-Y/H)+14*lt(mod(Y,5),2)')},vignette=PI/4`;
    default: return `${src('black')},format=rgba`;
  }
}

const N = (c, bg, extra = {}) => ({ mode: 'neon', color: c, bg, ...extra });
const D3 = (fill, ext, bg, extra = {}) => ({ mode: '3d', fill, ext, bg, depth: 14, ...extra });
const CY = [0, 229, 255], PK = [255, 60, 200], BL = [60, 140, 255], GR = [57, 255, 120];

const STYLES = {
  neon: N(PK, 'dark'),
  colorfulglow: N(null, 'dark', { fill: ['rainbow'] }),
  advancedglow: N(null, 'darkblue', { fill: ['grad', [0, 230, 255], [170, 90, 255]] }),
  neononline: N([0, 255, 200], 'dark'),
  blueneon: N(BL, 'dark'),
  neontext: N([255, 70, 120], 'dark'),
  neonlight: N([255, 214, 90], 'darkgrad'),
  greenneon: N(GR, 'dark'),
  greenlightneon: N([170, 255, 60], 'dark'),
  blueneonlogo: N([60, 160, 255], 'darkblue', { frame: true }),
  galaxyneon: N([170, 110, 255], 'stars'),
  retroneon: N([255, 70, 170], 'retro'),
  multicolorneon: N(null, 'dark', { fill: ['rainbow'] }),
  hackerneon: N([40, 255, 80], 'matrix'),
  devilwings: N([255, 50, 40], 'flames'),
  glowtext: N([255, 255, 255], 'darkblue', { soft: true }),
  blackpinkneon: N([255, 90, 170], 'dark', { bars: true }),
  neonglitch: N([0, 229, 255], 'dark', { glitch: true }),
  colorfulneonlight: N(null, 'bokeh', { fill: ['rainbow'] }),

  wooden3d: D3(['wood'], [70, 38, 16], 'lightgrey'),
  cubic3d: D3(['grad', [120, 185, 255], [40, 100, 230]], [18, 48, 140], 'lightgrey', { depth: 22 }),
  wooden3donline: D3(['wood'], [52, 28, 12], 'darkgrad', { depth: 18 }),
  water3d: D3(['water'], [8, 56, 140], 'lightgrey'),
  cuongthi3d: D3(['grad', [255, 200, 40], [255, 90, 20]], [140, 50, 0], 'dark'),
  text3d: D3(['grad', [255, 255, 255], [175, 185, 200]], [60, 66, 80], 'bluegrad'),
  graffiti3d: D3(['rainbowy'], [28, 28, 30], 'brick', { outline: [{ grow: 7, color: [10, 10, 10] }] }),
  silver3d: D3(['chrome', [0.92, 0.95, 1]], [58, 62, 74], 'dark'),
  style3d: D3(['grad', [255, 130, 60], [255, 40, 130]], [110, 18, 64], 'dark'),
  metal3d: D3(['chrome', [0.72, 0.84, 1]], [40, 52, 76], 'steel'),
  ruby3d: D3(['ruby'], [70, 0, 14], 'dark'),
  birthday3d: D3(['rainbowy'], [160, 40, 110], 'confetti'),
  metallogo3d: D3(['chrome', [1, 0.97, 0.9]], [28, 28, 38], 'darkgrad', { depth: 18 }),
  pig3d: D3(['grad', [255, 190, 215], [255, 110, 160]], [190, 70, 115], 'pink'),
  avengers3d: D3(['avengers'], [28, 20, 62], 'dark', { depth: 18 }),
  hologram3d: D3(['holo'], [0, 66, 110], 'scan', { glow: [60, 220, 255], depth: 10 }),
  gradient3d: D3(['grad', [170, 90, 255], [255, 90, 190]], [68, 20, 110], 'dark'),
  stone3d: D3(['stone', [1.05, 1.02, 0.98]], [44, 44, 46], 'darkgrey', { depth: 18 }),
  space3d: D3(['chrome', [0.55, 0.68, 1]], [20, 26, 80], 'stars', { depth: 16 }),
  sand3d: D3(['stone', [1.7, 1.45, 1]], [150, 108, 58], 'darkgrad'),
  gradienttext3d: D3(['grad', [0, 235, 255], [150, 80, 255]], [18, 28, 110], 'dark'),
  lightbulb3d: D3(['bulbs'], [60, 44, 20], 'dark', { glow: [255, 214, 120], depth: 12 }),
  snow3d: D3(['snow'], [100, 140, 195], 'snowbg'),
  papercut3d: D3(['solid', [255, 210, 70]], [20, 20, 20], 'pink', { depth: 0, layers: [{ grow: 26, color: [220, 60, 90] }, { grow: 15, color: [90, 160, 230] }, { grow: 6, color: [255, 255, 255] }] }),
  underwater3d: D3(['grad', [140, 240, 255], [40, 170, 240]], [0, 50, 112], 'underwater'),
  shinymetallic3d: D3(['chrome', [0.62, 0.78, 1]], [30, 36, 56], 'darkgrad', { depth: 18 }),
  gradientstyle3d: D3(['grad3', [255, 190, 40], [255, 70, 120], [140, 70, 230]], [70, 24, 100], 'dark'),
  beach3d: D3(['chrome', [1, 0.82, 0.45]], [120, 80, 30], 'beach'),
  crack3d: D3(['crack', [1, 1, 1]], [26, 26, 26], 'lightgrey', { depth: 16 }),
  wood3d: D3(['wood'], [86, 48, 20], 'bluegrad'),
  americanflag3d: D3(['usflag'], [22, 28, 80], 'lightgrey', { depth: 16 }),
  christmas3d: D3(['candy'], [100, 12, 24], 'xmas'),
  nigeriaflag3d: D3(['ngflag'], [0, 64, 36], 'dark', { depth: 16 }),
  christmassnow3d: D3(['snow'], [160, 26, 40], 'xmas'),
  goldenchristmas3d: D3(['chrome', [1, 0.78, 0.3]], [100, 60, 8], 'bokeh', { depth: 16 }),
  decorativemetal3d: D3(['chrome', [1, 0.62, 0.36]], [64, 32, 14], 'dark', { depth: 16 }),
  colorfulpaint3d: D3(['paint'], [56, 58, 80], 'white'),
  glossysilver3d: D3(['chrome', [0.95, 0.97, 1]], [108, 114, 126], 'darkgrad', { depth: 16 }),
  balloon3d: D3(['balloon'], [140, 24, 56], 'sky', { depth: 8, puffy: true }),
  comic3d: D3(['solid', [255, 226, 40]], [214, 30, 40], 'halftone', { outline: [{ grow: 8, color: [10, 10, 10] }], depth: 12 })
};

async function render(name, text, dir) {
  const cfg = STYLES[name];
  const layer = await textLayer(text);
  const textPng = path.join(dir, 'text.png');
  fs.writeFileSync(textPng, layer.png);
  const tb = await textBounds(textPng, layer.h);
  const lx = Math.round((W - LW) / 2), ly = Math.max(0, Math.round((H - layer.h) / 2));
  const box = { x0: lx + tb.x, y0: ly + tb.y, w: Math.max(40, tb.w), h: Math.max(30, tb.h) };

  const g = [];
  const uses = {};
  const U = (base) => { uses[base] = (uses[base] || 0) + 1; return `${base}_${uses[base] - 1}`; };
  let cur = 'bg0', k = 0;
  const over = (top, x = 0, y = 0) => { const o = `c${k++}`; g.push(`[${cur}][${top}]overlay=${x}:${y}:format=auto[${o}]`); cur = o; };
  const solidFrom = (colorSrc, maskLabel, out) => {
    g.push(`${colorSrc},format=rgba[${out}s]`);
    g.push(`[${out}s][${maskLabel}]alphamerge,format=rgba[${out}]`);
  };
  const grown = (grw, out) => g.push(`[${U('M')}]gblur=sigma=${Math.max(1, grw / 2)},lut=y='clip(val*6,0,255)'[${out}]`);

  const puffy = cfg.puffy ? `gblur=sigma=5,lut=y='clip((val-90)*4,0,255)',` : '';
  g.push(`[0:v]format=rgba,pad=${W}:${H}:${lx}:${ly}:color=black@0,alphaextract,gblur=sigma=2.2,lut=y='clip(val*2.8,0,255)',${puffy}format=gray[M]`);
  const faceFill = cfg.fill || ['solid', cfg.color || [255, 255, 255]];
  g.push(`${fillChain(faceFill, box)}[ff]`);
  g.push(`[ff][${U('M')}]alphamerge,format=rgba[face]`);
  g.push(`${bgChain(cfg.bg)}[bg0]`);

  if (cfg.mode === 'neon') {
    if (cfg.glitch) {
      g.push(`[${U('face')}]colorchannelmixer=rr=1:gg=0:bb=0[red]`);
      g.push(`[${U('face')}]colorchannelmixer=rr=0:gg=1:bb=1[cy]`);
      over('red', -9, 3); over('cy', 9, -3);
      g.push(`[${U('face')}]gblur=sigma=22[gl]`);
      over('gl');
    } else {
      g.push(`[${U('face')}]gblur=sigma=34[ga]`);
      g.push(`[${U('face')}]gblur=sigma=12[gb]`);
      over(U('ga')); over(U('ga')); over(U('gb'));
      if (cfg.soft) over(U('gb')); else over(U('face'));
    }
    g.push(`[${U('M')}]${cfg.soft ? 'gblur=sigma=1.5' : 'erosion,erosion,erosion,erosion'}[core0]`);
    solidFrom(src('white'), 'core0', 'corew');
    over('corew');
    if (cfg.frame || cfg.bars) {
      const c = hexOf(cfg.color);
      let d;
      if (cfg.frame) {
        const x1 = 70, y1 = 70, x2 = W - 70, y2 = H - 70;
        d = `drawbox=x=${x1 - 8}:y=${y1 - 8}:w=${x2 - x1 + 16}:h=${y2 - y1 + 16}:color=${c}@0.18:t=14,drawbox=x=${x1}:y=${y1}:w=${x2 - x1}:h=${y2 - y1}:color=${c}@1:t=7`;
      } else {
        const y1 = Math.max(10, box.y0 - 46), y2 = Math.min(H - 20, box.y0 + box.h + 38);
        d = [y1, y2].map(y => `drawbox=x=160:y=${y - 4}:w=${W - 320}:h=14:color=${c}@0.22:t=fill,drawbox=x=160:y=${y}:w=${W - 320}:h=6:color=${c}@1:t=fill`).join(',');
      }
      g.push(`[${cur}]${d}[dec]`); cur = 'dec';
    }
  } else {
    const depth = cfg.depth;
    g.push(`[${U('M')}]gblur=sigma=11[shm]`);
    solidFrom(src('black'), 'shm', 'shb');
    g.push(`[shb]colorchannelmixer=aa=0.55[shadow]`);
    over('shadow', depth + 8, depth + 14);
    if (cfg.glow) {
      g.push(`[${U('face')}]gblur=sigma=26[gl]`);
      over(U('gl')); over(U('gl'));
    }
    (cfg.layers || []).forEach((L, i) => {
      grown(L.grow, `lm${i}`);
      g.push(`${src(hexOf(L.color))},format=rgba[lc${i}]`);
      g.push(`[lc${i}][lm${i}]alphamerge,format=rgba[lay${i}]`);
      g.push(`[${U('lay' + i)}]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.35,gblur=sigma=4[lay${i}s]`);
      over(`lay${i}s`, 0, 7);
      over(U('lay' + i));
    });
    const outl = cfg.outline || [];
    if (depth > 0) {
      solidFrom(src(hexOf(cfg.ext)), U('M'), 'ext');
      const olTop = [];
      outl.forEach((L, i) => {
        grown(L.grow, `om${i}`);
        g.push(`${src(hexOf(L.color))},format=rgba[oc${i}]`);
        g.push(`[oc${i}][om${i}]alphamerge,format=rgba[ol${i}]`);
        over(U('ol' + i), depth, depth);
        olTop.push(i);
      });
      for (let i = depth; i >= 1; i--) over(U('ext'), i, i);
      outl.forEach((L, i) => over(U('ol' + i)));
    } else if (outl.length) {
      outl.forEach((L, i) => {
        grown(L.grow, `om${i}`);
        g.push(`${src(hexOf(L.color))},format=rgba[oc${i}]`);
        g.push(`[oc${i}][om${i}]alphamerge,format=rgba[ol${i}]`);
        over(`ol${i}`);
      });
    }
    over(U('face'));
    if (cfg.puffy) {
      g.push(`[${U('M')}]erosion,erosion,erosion,erosion,erosion,erosion,gblur=sigma=5,lut=y='clip(val*0.55,0,255)'[hlm]`);
      solidFrom(src('white'), 'hlm', 'hl');
      over('hl', -6, -9);
    }
  }
  Object.keys(uses).forEach(b => {
    const n = uses[b];
    g.push(`[${b}]split=${n}[${Array.from({ length: n }, (_, i) => `${b}_${i}`).join('][')}]`);
  });
  g.push(`[${cur}]format=yuvj420p[v]`);
  const out = path.join(dir, 'out.jpg');
  await run(['-y', '-i', textPng, '-filter_complex', g.join(';'), '-map', '[v]', '-frames:v', '1', '-q:v', '2', out], 120000);
  return fs.readFileSync(out);
}

const NEON_NAMES = ['neon', 'colorfulglow', 'advancedglow', 'neononline', 'blueneon', 'neontext', 'neonlight', 'greenneon', 'greenlightneon', 'blueneonlogo', 'galaxyneon', 'retroneon', 'multicolorneon', 'hackerneon', 'devilwings', 'glowtext', 'blackpinkneon', 'neonglitch', 'colorfulneonlight'];
const D3_NAMES = Object.keys(STYLES).filter(n => !NEON_NAMES.includes(n));

const effectCommands = Object.keys(STYLES).map((name) => ({
  command: [name],
  description: `${name} text effect (.${name} Your text)`,
  category: 'logo',
  handler: async (client, m, { text, prefix }) => {
    const t = String(text || quotedText(m) || '').trim();
    const p = typeof prefix === 'string' && prefix ? prefix : '.';
    if (!t) return m.reply(`🎨 *${BM} text effect*\n\nSend your text after the command:\n*${p}${name} Black Merchant*\n\nSee all effects: *${p}ephotomenu*`);
    if (t.length > 40) return m.reply('⚠️ Use 40 characters or less.');
    const dir = makeDir();
    try {
      await m.reply('🎨 _Creating your text effect..._');
      const img = await render(name, t, dir);
      await client.sendMessage(m.chat, { image: img, mimetype: 'image/jpeg', caption: `🎨 *${name}*\n${TAG}` }, { quoted: m });
    } catch (e) { m.reply('❌ Could not make it: ' + String(e.message).slice(0, 150)); }
    finally { rmDir(dir); }
  }
}));

const menu = {
  command: ['ephotomenu'],
  aliases: ['texteffects', 'effectsmenu', 'logomenu'],
  description: 'List all text effects',
  category: 'logo',
  handler: async (client, m, { prefix }) => {
    const p = typeof prefix === 'string' && prefix ? prefix : '.';
    const block = (title, names) => `┌──┤ ${title} ├\n` + names.map(n => `│ ${n}`).join('\n') + '\n└──────────';
    m.reply(`${block('TEXT EFFECTS · NEON', NEON_NAMES)}\n\n${block('TEXT EFFECTS · 3D', D3_NAMES)}\n\nUse: *${p}<effect> Your text*\nExample: *${p}neon Black Merchant*\n${TAG}`);
  }
};

module.exports = [...effectCommands, menu];
