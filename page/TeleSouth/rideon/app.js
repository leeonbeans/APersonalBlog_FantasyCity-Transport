/* =========================================================
   跨洋城际 · 乘坐体验  v5
   —— 简化版：顶部常量音频序列 + 独立区间时长
   ========================================================= */

// ╔═══════════════════════════════════════════════════════════════╗
// ║  用户配置区：音频序列 & 区间时长                                ║
// ║                                                                ║
// ║  音频序列规则：                                                 ║
// ║   • 数组每项是字符串，按顺序播放                                ║
// ║   • 普通字符串 = 音频文件名（放在 audio/ 目录）                 ║
// ║   • 'wait' = 静默等待 5 秒                                      ║
// ║                                                                ║
// ║  区间时长（秒）独立于音频序列：                                 ║
// ║   • 列车按区间时长行驶（位置由时间驱动）                        ║
// ║   • 区间时长到了立即停止音频并到站（即使序列未播完）            ║
// ║   • 双向共用同一时长（来回距离一样）                            ║
// ╚═══════════════════════════════════════════════════════════════╝

// 说明：approaching_*.mp3（即将到达广播）已从各序列移除，改由区间最后 N 秒自动播放
//       （普通站 5 秒 / 终点站 12 秒），与“即将到达”画面严格同步；映射见下方 APPROACHING_AUDIO。
//       因此下方序列只需放“巡航途中”的广播；JourneyTime = 巡航时长，到站窗口在其后额外追加。

// ─── 下行音频序列（下北泽 → 全怪塔）───
const ShimokitaToLostSpring   = ['welcome_chinese.mp3','welcome_cantonese.mp3','welcome_eng.mp3','wait','toward_mob_tower_chinese.mp3','toward_mob_tower_cantonese.mp3','toward_mob_tower_eng.mp3','next_lost_spring_chinese.mp3','next_lost_spring_cantonese.mp3','next_lost_spring_eng.mp3','tips_lost_garden.mp3', 'wait'];
const LostSpringToCanyonBay   = ['toward_mob_tower_chinese.mp3','toward_mob_tower_cantonese.mp3','toward_mob_tower_eng.mp3','next_canyon_bay_chinese.mp3','next_canyon_bay_cantonese.mp3','next_canyon_bay_eng.mp3','tips_canyon_bay.mp3','canyon_bay_easy_go_cantonese.mp3','canyon_bay_easy_go_eng.mp3','wait'];
const CanyonBayToEndHall      = ['toward_mob_tower_chinese.mp3','toward_mob_tower_cantonese.mp3','toward_mob_tower_eng.mp3','next_end_hall_chinese.mp3','next_end_hall_cantonese.mp3','next_end_hall_eng.mp3','tips_end_hall.mp3','wait'];
const EndHallToMobTower       = ['toward_mob_tower_chinese.mp3','toward_mob_tower_cantonese.mp3','toward_mob_tower_eng.mp3','next_mob_tower_chinese.mp3','next_mob_tower_cantonese.mp3','next_mob_tower_eng.mp3','wait','bridge_mob_tower.mp3','wait'];

// ─── 上行音频序列（全怪塔 → 下北泽）───
const MobTowerToEndHall       = ['welcome_chinese.mp3','welcome_cantonese.mp3','welcome_eng.mp3','wait','toward_shimokita_chinese.mp3','toward_shimokita_cantonese.mp3','toward_shimokita_eng.mp3','next_end_hall_chinese.mp3','next_end_hall_cantonese.mp3','next_end_hall_eng.mp3','tips_end_hall.mp3','bridge_mob_tower.mp3'];
const EndHallToCanyonBay      = ['toward_shimokita_chinese.mp3','toward_shimokita_cantonese.mp3','toward_shimokita_eng.mp3','next_canyon_bay_chinese.mp3','next_canyon_bay_cantonese.mp3','next_canyon_bay_eng.mp3','tips_canyon_bay.mp3','canyon_bay_easy_go_cantonese.mp3','canyon_bay_easy_go_eng.mp3'];
const CanyonBayToLostSpring   = ['toward_shimokita_chinese.mp3','toward_shimokita_cantonese.mp3','toward_shimokita_eng.mp3','next_lost_spring_chinese.mp3','next_lost_spring_cantonese.mp3','next_lost_spring_eng.mp3','tips_lost_garden.mp3', 'wait'];
const LostSpringToShimokita   = ['toward_shimokita_chinese.mp3','toward_shimokita_cantonese.mp3','toward_shimokita_eng.mp3','next_shimokita_chinese.mp3','next_shimokita_cantonese.mp3','next_shimokita_eng.mp3','tips_shimokita.mp3', 'wait'];

// ─── 区间时长（秒，双向共用）───
const ShimokitaToLostSpring_JourneyTime = 60;  //38 47  60
const LostSpringToCanyonBay_JourneyTime = 75;  //64 24  75
const CanyonBayToEndHall_JourneyTime    = 70;  //44 63  70
const EndHallToMobTower_JourneyTime     = 85;  //52 69  75

// ─── 各站“即将到达”广播（区间最后 N 秒播放，与到站画面严格同步；键 = 站点 key）───
// 注意：遗忘温泉的到站广播文件名是 approaching_lost_garden.mp3（历史命名），其余与站名对应
const APPROACHING_AUDIO = {
  'shimokita':   'approaching_shimokita.mp3',
  'lost-spring': 'approaching_lost_garden.mp3',
  'canyon-bay':  'approaching_canyon_bay.mp3',
  'end-hall':    'approaching_end_hall.mp3',
  'mob-tower':   'approaching_mob_tower.mp3'
};

// ╔═══════════════════════════════════════════════════════════════╗
// ║  以下为引擎代码，一般无需修改                                    ║
// ╚═══════════════════════════════════════════════════════════════╝

// ============ 站点数据 ============
const STATIONS = [
  { key:'shimokita',   zh:'下北泽',         en:'Shimokita Station',
    transfers:[
      { zh:'主城城际', en:'The Main City Intercity', color:'#00A6FF' }
    ] },
  { key:'lost-spring', zh:'遗忘温泉',       en:'Lost Spring', transfers:[] },
  { key:'canyon-bay',  zh:'峡谷湾',         en:'Canyon Bay',
    transfers:[
      { zh:'主城城际', en:'The Main City Intercity', color:'#00A6FF' },
      { zh:'远航城际',   en:'Far Voyage Intercity',    color:'#2FD6A4' }
    ] },
  { key:'end-hall',    zh:'末地传送大厅站', en:'The End Transport Hall Station',
    transfers:[
      { zh:'远航城际',   en:'Far Voyage Intercity', color:'#2FD6A4' },
      { zh:'拉特兰专线', en:'Laterano Line',        color:'#CCC39D' },
      { zh:'灰线',       en:'Grey Line',            color:'#949494' }
    ] },
  { key:'mob-tower',   zh:'全怪塔',         en:'Mob Tower', transfers:[] }
];
const N = STATIONS.length;

// ============ 序列 & 时长映射 ============
const AUDIO_SEQUENCES = {
  'shimokita>lost-spring':   ShimokitaToLostSpring,
  'lost-spring>canyon-bay':  LostSpringToCanyonBay,
  'canyon-bay>end-hall':     CanyonBayToEndHall,
  'end-hall>mob-tower':      EndHallToMobTower,
  'mob-tower>end-hall':      MobTowerToEndHall,
  'end-hall>canyon-bay':     EndHallToCanyonBay,
  'canyon-bay>lost-spring':  CanyonBayToLostSpring,
  'lost-spring>shimokita':   LostSpringToShimokita
};
const JOURNEY_TIMES = {
  // 用 undirKey() 生成键，保证与查找时（会按字母排序）完全一致，避免键顺序写错导致落回默认 30 秒
  [undirKey('shimokita', 'lost-spring')]:  ShimokitaToLostSpring_JourneyTime,
  [undirKey('lost-spring', 'canyon-bay')]: LostSpringToCanyonBay_JourneyTime,
  [undirKey('canyon-bay', 'end-hall')]:    CanyonBayToEndHall_JourneyTime,
  [undirKey('end-hall', 'mob-tower')]:     EndHallToMobTower_JourneyTime
};
function dirKey(a, b){ return `${a}>${b}`; }
function undirKey(a, b){ return [a, b].sort().join('-'); }

// ============ 配置 ============
const CONFIG = {
  AUDIO_DIR: '../../../audio/',
  DOORS_OPEN_MS: 7000,       // 开门信息时长（同时播放 door_open.mp3）
  DOORS_CLOSE_MS: 10000,     // 关门信息时长（同时播放 door_close.mp3）
  WAIT_ITEM_MS: 5000,          // 'wait' 项等待时长
  FALLBACK_AUDIO_MS: 1500,     // 音频缺失时兜底
  NEXT_STATION_DELAY_S: 5,     // 发车后多少秒显示“下一站”
  NEXT_STATION_DURATION_S: 4,  // “下一站”显示多少秒后切回线路图
  ARRIVING_LEAD_NORMAL_S: 5,   // 中间站“即将到达”窗口（秒）：播放 approaching + 显示到站画面
  ARRIVING_LEAD_TERMINUS_S: 12,// 终点站“即将到达”窗口（秒）
  BG_VOLUME: 0.32,             // 背景音 running.mp3 相对主音量的比例
  BG_FADE_IN_MS: 2500,         // 背景音渐入时长（启程）
  BG_FADE_OUT_MS: 2500         // 背景音渐出时长（即将到站）
};

// ============ 几何参数 ============
const BIG_ROUTE = {
  width:1800, height:350, lineY:175, padX:140,
  stR:18, haloR:32, ringR:26,
  labelZhY:288, labelEnY:316,
  numY:235,          // 编号圆 y（站点圆圈与站名中间）
  transBaseY:125,    // 换乘格子组底部 y（线束顶端）
  transBoxH:34,      // 格子高
  transBoxGap:3,     // 格子上下间距
  transBoxW:132,     // 格子宽
  transFontSize:20   // 格子内线路名字号（≈“行驶中”20px）
};
const PIDS_STRIP = { padX:40, endX:520, y:32, labelY:72, stR:6 };

// ============ 音频管理器 ============
class AudioManager {
  constructor(dir){
    this.dir = dir;
    this.clips = new Map();
    this.volume = 0.8;
    this.rate = 1;           // 播放倍速（与设置面板“倍速”联动，音频同步变速）
    // ─── 背景音（独立元素，循环播放，单独控制音量/渐变，不纳入 clips）───
    this.bg = new Audio(dir + 'running.mp3');
    this.bg.loop = true;
    this.bg.preload = 'auto';
    this.bg.preservesPitch = true;  // 变速保持音调
    this.bg.volume = 0;
    this.bgEnabled = true;   // 设置面板可切换
    this.bgPlaying = false;  // 当前“应当发声”意图（用于暂停/恢复）
    this.bgMissing = false;  // 文件缺失标记
    this._bgFade = null;
    this.bg.addEventListener('error', () => { this.bgMissing = true; });
  }
  getOrLoad(filename){
    if(!filename) return null;
    if(this.clips.has(filename)) return this.clips.get(filename);
    const a = new Audio(this.dir + filename);
    a.preload = 'auto';
    a.volume = this.volume;
    a.preservesPitch = true;   // 变速保持音调（倍速语音不变尖）
    const clip = { filename, audio:a, status:'loading' };
    this.clips.set(filename, clip);
    a.addEventListener('canplaythrough', () => { if(clip.status !== 'ok') clip.status = 'ok'; });
    a.addEventListener('error', () => { clip.status = 'miss'; });
    try{ a.load(); }catch(_){}
    return clip;
  }
  play(clip){
    if(!clip || clip.status === 'miss') return false;
    try{
      clip.audio.volume = this.volume;
      clip.audio.playbackRate = this.rate;  // 应用当前倍速
      // loading 态也调用 play()：浏览器自动排队，就绪后播放（首次不再被跳过）
      if(clip.status === 'ok') clip.audio.currentTime = 0;
      const p = clip.audio.play();
      if(p && p.catch) p.catch(()=>{});
      return true;
    }catch(_){ return false; }
  }
  stopAll(){
    for(const c of this.clips.values()){
      try{ c.audio.pause(); c.audio.currentTime = 0; }catch(_){}
    }
  }
  pauseAll(){
    for(const c of this.clips.values()){ try{ c.audio.pause(); }catch(_){} }
  }
  setVolume(v){
    this.volume = v;
    for(const c of this.clips.values()) c.audio.volume = v;
    // 背景音正在播放且非渐变中时，同步到新主音量对应的背景电平
    if(this.bgPlaying && !this._bgFade) this.bg.volume = this._bgTarget();
  }
  // 设置播放倍速：应用到所有已加载音频与背景音（正在播放的立即生效）
  setRate(r){
    this.rate = (r > 0 ? r : 1);
    for(const c of this.clips.values()){ try{ c.audio.playbackRate = this.rate; }catch(_){} }
    try{ this.bg.playbackRate = this.rate; }catch(_){}
  }
  // ─── 背景音：渐入 / 渐出 / 暂停恢复 / 开关 ───
  _bgTarget(){ return Math.max(0, Math.min(1, this.volume * CONFIG.BG_VOLUME)); }
  _clearBgFade(){ if(this._bgFade){ clearInterval(this._bgFade); this._bgFade = null; } }
  _fadeBg(target, ms, onDone){
    this._clearBgFade();
    const start = this.bg.volume;
    const delta = target - start;
    if(ms <= 0 || Math.abs(delta) < 0.002){
      this.bg.volume = Math.max(0, Math.min(1, target));
      if(onDone) onDone();
      return;
    }
    const stepMs = 60;
    const steps = Math.max(1, Math.round(ms / stepMs));
    let i = 0;
    this._bgFade = setInterval(() => {
      i++;
      this.bg.volume = Math.max(0, Math.min(1, start + delta * (i / steps)));
      if(i >= steps){ this._clearBgFade(); if(onDone) onDone(); }
    }, stepMs);
  }
  startBackground(){
    if(!this.bgEnabled || this.bgMissing) return;
    try{
      this._clearBgFade();
      this.bg.currentTime = 0;
      this.bg.volume = 0;
      this.bg.playbackRate = this.rate;  // 背景音跟随倍速
      this.bgPlaying = true;
      const p = this.bg.play();
      if(p && p.catch) p.catch(()=>{});
      this._fadeBg(this._bgTarget(), CONFIG.BG_FADE_IN_MS);
    }catch(_){}
  }
  stopBackground(ms){
    const dur = (ms === undefined) ? CONFIG.BG_FADE_OUT_MS : ms;
    this.bgPlaying = false;
    if(dur <= 0){
      this._clearBgFade();
      try{ this.bg.pause(); this.bg.volume = 0; this.bg.currentTime = 0; }catch(_){}
      return;
    }
    this._fadeBg(0, dur, () => { try{ this.bg.pause(); }catch(_){} });
  }
  pauseBackground(){ if(this.bgPlaying){ try{ this.bg.pause(); }catch(_){} } }
  resumeBackground(){ if(this.bgPlaying && this.bgEnabled){ try{ const p = this.bg.play(); if(p && p.catch) p.catch(()=>{}); }catch(_){} } }
  setBgEnabled(on){
    this.bgEnabled = !!on;
    if(!this.bgEnabled) this.stopBackground(400);
  }
}

// ============ 音频序列播放器 ============
class JourneyPlayer {
  constructor(sequence, audio){
    this.sequence = sequence || [];
    this.audio = audio;
    this.index = -1;
    this.itemElapsed = 0;
    this.itemDuration = 0;
    this.finished = false;
    this.started = false;
    this.currentClip = null;
  }
  start(){
    this.started = true;
    this._enter(0);
  }
  _enter(i){
    this.index = i;
    this.itemElapsed = 0;
    if(i >= this.sequence.length){
      this.finished = true;
      this._stopClip();
      return;
    }
    const item = this.sequence[i];
    if(item === 'wait'){
      this.itemDuration = CONFIG.WAIT_ITEM_MS;
    } else {
      const clip = this.audio.getOrLoad(item);
      if(clip && clip.status !== 'miss'){
        // 即使仍在 loading 也调用 play()：浏览器会自动等待就绪后播放（首次不再被跳过）
        this._stopClip();
        try{
          clip.audio.volume = this.audio.volume;
          clip.audio.playbackRate = this.audio.rate;  // 应用当前倍速
          if(clip.status === 'ok') clip.audio.currentTime = 0;
          const p = clip.audio.play();
          if(p && p.catch) p.catch(()=>{});
        }catch(_){}
        this.currentClip = clip;
        // 时长：已就绪用真实时长；否则先用兜底，待 loadedmetadata 后修正，避免过早切歌
        if(isFinite(clip.audio.duration) && clip.audio.duration > 0){
          this.itemDuration = clip.audio.duration * 1000;
        } else {
          this.itemDuration = CONFIG.FALLBACK_AUDIO_MS;
          const fix = () => {
            clip.audio.removeEventListener('loadedmetadata', fix);
            if(this.currentClip === clip && isFinite(clip.audio.duration) && clip.audio.duration > 0){
              this.itemDuration = clip.audio.duration * 1000;
            }
          };
          clip.audio.addEventListener('loadedmetadata', fix);
        }
      } else {
        this.itemDuration = CONFIG.FALLBACK_AUDIO_MS;
      }
    }
  }
  _stopClip(){
    if(this.currentClip){
      try{ this.currentClip.audio.pause(); this.currentClip.audio.currentTime = 0; }catch(_){}
      this.currentClip = null;
    }
  }
  update(dtMs){
    if(!this.started || this.finished) return;
    this.itemElapsed += dtMs;
    let guard = 0;
    while(!this.finished && this.itemElapsed >= this.itemDuration && guard < 32){
      const overflow = this.itemElapsed - this.itemDuration;
      this._stopClip();
      this._enter(this.index + 1);
      this.itemElapsed = overflow;
      guard++;
    }
  }
  stop(){
    this._stopClip();
    this.finished = true;
    this.started = false;
  }
  pause(){ if(this.currentClip){ try{ this.currentClip.audio.pause(); }catch(_){} } }
  resume(){ if(this.currentClip){ this.currentClip.audio.play().catch(()=>{}); } }
}

// ============ 全局状态 ============
const state = {
  direction: 'forward',
  phase: 'idle',
  running: false,
  paused: false,
  currentIndex: 0,
  nextIdx: null,
  segProgress: 0,
  progress: 0,
  dwellMs: CONFIG.DOORS_OPEN_MS + CONFIG.DOORS_CLOSE_MS,
  dwellTimer: 0,
  dwellElapsed: 0,
  journeyElapsed: 0,
  journeyDuration: 0,
  arrivingAtMs: 0,        // 巡航结束 / “即将到达”窗口开始的时刻
  arrivingStarted: false, // 是否已触发到站窗口（approaching + 背景音渐出）
  approachingFile: null,  // 本区间目标站的到站广播文件名
  speedMul: 1,
  loop: true,
  volume: 0.8,
  displayMode: '',
  player: null,
  termElapsed: 0,
  doorClosePlayed: false
};

// ============ 方向辅助 ============
function travelOrder(){
  const a = STATIONS.map((_,i)=>i);
  return state.direction === 'backward' ? a.reverse() : a;
}
function terminusIdx(){ return state.direction === 'backward' ? 0 : N-1; }
function originIdx(){ return state.direction === 'backward' ? N-1 : 0; }
function travelPosOf(i){ return travelOrder().indexOf(i); }
function nextStationIdx(){
  const o = travelOrder();
  const p = o.indexOf(state.currentIndex);
  return p < o.length - 1 ? o[p+1] : null;
}
function isPassed(i){ return travelPosOf(i) < travelPosOf(state.currentIndex); }
function isReached(i){ return travelPosOf(i) <= travelPosOf(state.currentIndex); }
function isAtTerminus(){ return state.currentIndex === terminusIdx(); }

// ============ 几何 ============
let segLen = 0, totalLength = 0, stationOffsets = [];
function computeRouteGeometry(){
  segLen = 380;
  totalLength = segLen * (N-1);
  stationOffsets = [];
  for(let i=0; i<N; i++){
    stationOffsets[i] = state.direction === 'forward' ? i*segLen : (N-1-i)*segLen;
  }
}
function bigRouteTrainX(p){
  return state.direction === 'forward'
    ? BIG_ROUTE.padX + p
    : (BIG_ROUTE.width - BIG_ROUTE.padX) - p;
}
function pidsTrainX(p){
  const r = totalLength > 0 ? p / totalLength : 0;
  return state.direction === 'forward'
    ? PIDS_STRIP.padX + (PIDS_STRIP.endX - PIDS_STRIP.padX) * r
    : PIDS_STRIP.endX - (PIDS_STRIP.endX - PIDS_STRIP.padX) * r;
}
function trainEase(t){
  t = Math.max(0, Math.min(1, t));
  const A = 0.22, D = 0.78;
  const k = 2 / (D - A + 1);
  if(t < A) return k * t * t / (2 * A);
  if(t < D) return k * A / 2 + k * (t - A);
  const posD = k * A / 2 + k * (D - A);
  const u = (t - D) / (1 - D);
  return posD + k * (1 - D) * (u - u*u/2);
}

// ============ DOM ============
const $ = id => document.getElementById(id);
const el = {};
function cacheDom(){
  const ids = [
    'display','phase-badge','direction-chip',
    'clock-hm','clock-s','clock-date',
    'pids-terminus-zh','pids-terminus-en','pids-next-zh','pids-next-en',
    'pids-progress','pids-stations','pids-strip-labels','pids-train','ticker-text',
    'doors-open-zh','doors-open-en','doors-open-num','doors-open-next','doors-open-transfers',
    'plat-sign-zh','plat-sign-en','plat-sign-zh-2','plat-sign-en-2',
    'zoom-zh','zoom-en','zoom-arrow','zoom-transfers',
    'arriving-zh','arriving-en','arriving-transfers',
    'route-next','route-remain','route-seg-progress',
    'br-base','br-progress','br-stations','br-labels','br-train',
    'term-zh','term-en','term-hint',
    'btn-fab','fab-icon',
    'btn-settings','modal-backdrop','btn-close-settings',
    'btn-start','btn-pause','btn-reset',
    'sel-speed','rng-volume','vol-val','chk-loop','chk-bg',
    'station-mini-list'
  ];
  ids.forEach(id => { el[id.replace(/-([a-z0-9])/g, (_,c) => c.toUpperCase())] = $(id); });
}

const audio = new AudioManager(CONFIG.AUDIO_DIR);

// ============ 广播字幕 ============
function bcText(zh, en){
  el.tickerText.innerHTML =
    `<span class="zh">${escapeHtml(zh)}</span>` +
    (en ? `<span class="sep">·</span><span class="en">${escapeHtml(en)}</span>` : '');
  el.tickerText.style.animation = 'none';
  void el.tickerText.offsetWidth;
  el.tickerText.style.animation = '';
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// 生成换乘信息 HTML（标题行 + 徽章行，用于 next-station / doors-open / arriving）
function transferBadgesHtml(station){
  if(!station || !station.transfers || !station.transfers.length) return '';
  const badges = station.transfers.map(t =>
    `<span class="tr-badge" style="--tc:${t.color}"><i class="tr-dot"></i><span class="tr-name">${escapeHtml(t.zh)}</span></span>`
  ).join('');
  return `<div class="tr-head"><span class="tr-icon">⇄</span><span class="tr-label">可换乘线路</span><span class="tr-label-en">INTERCHANGE</span></div>`
       + `<div class="tr-badges">${badges}</div>`;
}

// ============ 构建 SVG ============
// 根据背景色亮度返回合适文字色（浅底用深字，深底用白字）
function textColorFor(hex){
  const c = String(hex).replace('#','');
  const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  return lum > 0.62 ? '#1a2418' : '#ffffff';
}
function buildBigRoute(){
  const { width, lineY, padX, stR, haloR, ringR, labelZhY, labelEnY, numY,
          transBaseY, transBoxH, transBoxGap, transBoxW, transFontSize } = BIG_ROUTE;
  const endX = width - padX;
  el.brBase.innerHTML = `<line x1="${padX}" y1="${lineY}" x2="${endX}" y2="${lineY}" class="br-base-line"/>`;
  el.brProgress.innerHTML = `<line id="br-progress-line" x1="${padX}" y1="${lineY}" x2="${padX}" y2="${lineY}" class="br-passed-line"/>`;
  let stHtml = '', lbHtml = '';
  STATIONS.forEach((s, i) => {
    const x = padX + (endX - padX) * (i / (N-1));
    stHtml += `
      <g class="br-station" data-idx="${i}" transform="translate(${x},${lineY})">
        <circle class="br-halo" r="${haloR}"/>
        <circle class="br-ring" r="${ringR}"/>
        <circle class="br-dot"  r="${stR}"/>
        <circle class="br-core" r="${(stR*0.45).toFixed(2)}"/>
      </g>`;

    // 换乘标识（广州地铁风格）：站点圆圈往上 → 紧挨线束 → 上下堆叠的圆角格子
    let trHtml = '';
    if(s.transfers && s.transfers.length){
      const lines = s.transfers;
      const n = lines.length;
      const lw = 8, lg = 3;                 // 线宽、线间距（紧挨成束，加粗）
      const topY = lineY - haloR;           // 线束底端（halo 顶 118）
      // n 条紧挨的垂直线（从格子底 transBaseY 连到圆圈顶 topY）
      lines.forEach((t, j) => {
        const lx = (x + (j - (n-1)/2) * (lw+lg)).toFixed(1);
        trHtml += `<line class="br-tr-line" x1="${lx}" y1="${transBaseY}" x2="${lx}" y2="${topY}" stroke="${t.color}" stroke-width="${lw}"/>`;
      });
      // n 个上下堆叠的圆角格子（底部对齐 transBaseY，依次往上）
      lines.forEach((t, j) => {
        const by = transBaseY - transBoxH - j*(transBoxH+transBoxGap);
        const rx = x - transBoxW/2;
        trHtml += `<rect class="br-tr-box" x="${rx.toFixed(1)}" y="${by.toFixed(1)}" width="${transBoxW}" height="${transBoxH}" rx="7" ry="7" fill="${t.color}"/>`;
        trHtml += `<text class="br-tr-name" x="${x.toFixed(1)}" y="${(by + transBoxH/2 + transFontSize*0.35).toFixed(1)}" text-anchor="middle" fill="${textColorFor(t.color)}">${escapeHtml(t.zh)}</text>`;
      });
    }

    // 编号（移到站点圆圈与站名中间）+ 站名 + 换乘标识
    lbHtml += `
      <g class="br-station-label" data-idx="${i}">
        <g transform="translate(${x},${numY})">
          <circle class="br-num-bg" r="14"/>
          <text class="br-num-tx" dy="1">${String(i+1).padStart(2,'0')}</text>
        </g>
        <text class="br-zh" x="${x}" y="${labelZhY}">${s.zh}</text>
        <text class="br-en" x="${x}" y="${labelEnY}">${s.en}</text>
        ${trHtml}
      </g>`;
  });
  el.brStations.innerHTML = stHtml;
  el.brLabels.innerHTML = lbHtml;
}
function buildPidsStrip(){
  const { padX, endX, y, labelY, stR } = PIDS_STRIP;
  let stHtml = '', lbHtml = '';
  STATIONS.forEach((s, i) => {
    const x = padX + (endX - padX) * (i / (N-1));
    stHtml += `
      <g class="pids-st" data-idx="${i}">
        <circle class="pids-dot" cx="${x}" cy="${y}" r="${stR}"
                fill="#ffffff" stroke="#5a9a10" stroke-width="2.5"/>
      </g>`;
    // 使用全名 s.zh（"末地传送大厅站"），字体稍小以容纳
    lbHtml += `
      <text class="pids-lbl-tx" data-idx="${i}" x="${x}" y="${labelY}"
            text-anchor="middle" font-size="13" letter-spacing="0.5"
            fill="#a3b09e" font-family="Orbitron,Segoe UI,PingFang SC,sans-serif">${s.zh}</text>`;
    // 换乘彩色点（站名下方，用颜色区分线路）
    if(s.transfers && s.transfers.length){
      const dotY = labelY + 15, dotR = 3.6, gap = 10;
      const startX = x - (s.transfers.length - 1) * gap / 2;
      s.transfers.forEach((t, ti) => {
        lbHtml += `<circle class="pids-tr-dot" cx="${(startX + ti*gap).toFixed(1)}" cy="${dotY}" r="${dotR}" fill="${t.color}"><title>换乘 ${escapeHtml(t.zh)}</title></circle>`;
      });
    }
  });
  el.pidsStations.innerHTML = stHtml;
  el.pidsStripLabels.innerHTML = lbHtml;
}

// ============ 渲染 ============
function renderStatic(){
  const tIdx = terminusIdx();
  el.directionChip.dataset.dir = state.direction;
  el.directionChip.querySelector('.dir-arrow').textContent = state.direction === 'forward' ? '→' : '←';
  el.directionChip.querySelector('.dir-text').textContent = '开往 ' + STATIONS[tIdx].zh;
  el.pidsTerminusZh.textContent = STATIONS[tIdx].zh;
  el.pidsTerminusEn.textContent = STATIONS[tIdx].en;
  el.termZh.textContent = STATIONS[tIdx].zh;
  el.termEn.textContent = STATIONS[tIdx].en;
  document.querySelectorAll('.dir-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.dir === state.direction);
  });
}

function renderDynamic(){
  const pm = { idle:{t:'待发车',d:'idle'}, dwell:{t:'停站中',d:'dwell'},
               journey:{t:'行驶中',d:'running'}, finished:{t:'已到终点',d:'finished'} }[state.phase];
  if(el.phaseBadge.textContent !== pm.t) el.phaseBadge.textContent = pm.t;
  el.phaseBadge.dataset.phase = pm.d;

  const cur = STATIONS[state.currentIndex];
  const nxIdx = nextStationIdx();
  const nx = nxIdx != null ? STATIONS[nxIdx] : null;

  if(nx){
    el.pidsNextZh.textContent = nx.zh;
    el.pidsNextEn.textContent = nx.en;
  } else {
    el.pidsNextZh.textContent = '— 终点 —';
    el.pidsNextEn.textContent = 'Terminus';
  }

  el.doorsOpenZh.textContent = cur.zh;
  el.doorsOpenEn.textContent = cur.en;
  el.doorsOpenNum.textContent = String(state.currentIndex + 1).padStart(2,'0');
  el.doorsOpenNext.textContent = nx ? nx.zh : '— 终点 —';
  el.doorsOpenTransfers.innerHTML = transferBadgesHtml(cur);
  el.platSignZh.textContent = cur.zh;   el.platSignEn.textContent = cur.en;
  el.platSignZh2.textContent = cur.zh;  el.platSignEn2.textContent = cur.en;

  if(nx){
    el.zoomZh.textContent = nx.zh;
    el.zoomEn.textContent = nx.en;
    el.zoomArrow.textContent = state.direction === 'forward' ? '→' : '←';
    el.zoomTransfers.innerHTML = transferBadgesHtml(nx);
    el.arrivingZh.textContent = nx.zh;
    el.arrivingEn.textContent = 'Arriving at ' + nx.en;
    el.arrivingTransfers.innerHTML = transferBadgesHtml(nx);
  } else {
    el.zoomTransfers.innerHTML = '';
    el.arrivingTransfers.innerHTML = '';
  }

  el.routeNext.textContent = nx ? nx.zh : '— 终点 —';
  el.routeRemain.textContent = nxIdx != null ? (travelOrder().length - 1 - travelPosOf(state.currentIndex)) : 0;
  el.routeSegProgress.textContent = Math.round(state.segProgress * 100) + '%';

  el.termHint.textContent = state.loop ? '循环运行已开启 · 将自动开始返程' : '可在设置中切换方向开启返程';

  el.brStations.querySelectorAll('.br-station').forEach(g => {
    const i = +g.dataset.idx;
    g.classList.toggle('passed',  isPassed(i));
    g.classList.toggle('current', i === state.currentIndex);
    g.classList.toggle('next',    nxIdx === i);
  });
  // 站名/编号在 .br-station-label 组里，需同步状态类（否则高亮选择器不匹配）
  el.brLabels.querySelectorAll('.br-station-label').forEach(g => {
    const i = +g.dataset.idx;
    g.classList.toggle('passed',  isPassed(i));
    g.classList.toggle('current', i === state.currentIndex);
    g.classList.toggle('next',    nxIdx === i);
  });
  el.pidsStations.querySelectorAll('.pids-dot').forEach(d => {
    const i = +d.parentElement.dataset.idx;
    d.setAttribute('fill', isReached(i) ? '#85D91E' : '#ffffff');
  });

  const brX = bigRouteTrainX(state.progress);
  const brX1 = state.direction === 'forward' ? BIG_ROUTE.padX : (BIG_ROUTE.width - BIG_ROUTE.padX);
  const brLine = document.getElementById('br-progress-line');
  if(brLine){ brLine.setAttribute('x1', brX1); brLine.setAttribute('x2', brX); }
  el.brTrain.setAttribute('transform', `translate(${brX},${BIG_ROUTE.lineY})`);

  const pidsX = pidsTrainX(state.progress);
  const pidsX1 = state.direction === 'forward' ? PIDS_STRIP.padX : PIDS_STRIP.endX;
  el.pidsProgress.setAttribute('x1', pidsX1);
  el.pidsProgress.setAttribute('x2', pidsX);
  el.pidsTrain.setAttribute('transform', `translate(${pidsX},${PIDS_STRIP.y})`);

  const icon = state.running && !state.paused ? '❚❚' : '▶';
  if(el.fabIcon.textContent !== icon) el.fabIcon.textContent = icon;
  el.btnFab.classList.toggle('playing', state.running && !state.paused);
  el.btnStart.disabled = state.running && !state.paused;
  el.btnPause.disabled = !(state.running && !state.paused);
}

function computeDisplayMode(){
  if(!state.running && state.phase !== 'finished') return 'idle';
  if(state.phase === 'finished'){
    return state.termElapsed < CONFIG.DOORS_OPEN_MS ? 'doors-open' : 'terminus';
  }
  if(state.phase === 'dwell'){
    // 前 DOORS_OPEN_MS 显示开门，其余显示关门
    return state.dwellElapsed < CONFIG.DOORS_OPEN_MS ? 'doors-open' : 'doors-closing';
  }
  if(state.phase === 'journey'){
    const elapsedS = state.journeyElapsed / 1000;
    // 进入“即将到达”窗口：显示到站画面（与 approaching 音频同一时刻触发，严格同步）
    if(state.journeyElapsed >= state.arrivingAtMs) return 'arriving';
    // 发车后 DELAY ~ (DELAY+DURATION) 秒：下一站放大（只显示一小段）
    if(elapsedS >= CONFIG.NEXT_STATION_DELAY_S &&
       elapsedS < CONFIG.NEXT_STATION_DELAY_S + CONFIG.NEXT_STATION_DURATION_S) return 'next-station';
    // 其余时间：线路图
    return 'route';
  }
  return 'idle';
}
function applyDisplayMode(){
  const m = computeDisplayMode();
  if(m !== state.displayMode){
    state.displayMode = m;
    el.display.dataset.mode = m;
  }
}

// ============ 状态机 ============
function resetState(newDirection){
  if(newDirection) state.direction = newDirection;
  audio.stopAll();
  audio.stopBackground(0);
  if(state.player){ state.player.stop(); state.player = null; }
  computeRouteGeometry();
  state.currentIndex = originIdx();
  state.nextIdx = null;
  state.segProgress = 0;
  state.progress = stationOffsets[state.currentIndex];
  state.phase = 'idle';
  state.running = false;
  state.paused = false;
  state.dwellTimer = 0;
  state.dwellElapsed = 0;
  state.journeyElapsed = 0;
  state.journeyDuration = 0;
  state.arrivingAtMs = 0;
  state.arrivingStarted = false;
  state.approachingFile = null;
  state.termElapsed = 0;
  state.displayMode = '';
  renderStatic();
  renderDynamic();
  applyDisplayMode();
  renderStationMiniList();
  bcText('欢迎乘坐跨洋城际', 'Welcome aboard the Oversea Intercity');
}

function startRun(){
  if(state.running && !state.paused) return;
  if(state.paused){
    state.paused = false;
    if(state.player) state.player.resume();
    audio.resumeBackground();
    return;
  }
  if(state.phase === 'finished') resetState();
  state.running = true;
  state.paused = false;
  if(state.phase === 'idle'){
    const st = STATIONS[state.currentIndex];
    const tIdx = terminusIdx();
    bcText(`本次列车由 ${st.zh} 出发，开往 ${STATIONS[tIdx].zh}`,
           `Departing ${st.en}, bound for ${STATIONS[tIdx].en}`);
    enterDwell(state.currentIndex, { silent:true });
  }
}
function pauseRun(){
  if(!state.running || state.paused) return;
  state.paused = true;
  if(state.player) state.player.pause();
  audio.pauseBackground();
}

function enterDwell(idx, opts={}){
  const { silent = false } = opts;
  state.currentIndex = idx;
  state.phase = 'dwell';
  state.segProgress = 0;
  state.nextIdx = null;
  state.progress = stationOffsets[idx];
  state.dwellMs = CONFIG.DOORS_OPEN_MS + CONFIG.DOORS_CLOSE_MS;  // 开门7s + 关门10s
  state.dwellTimer = state.dwellMs;
  state.dwellElapsed = 0;
  state.doorClosePlayed = false;
  state.termElapsed = 0;
  state.journeyElapsed = 0;

  if(!silent){
    const st = STATIONS[idx];
    bcText(`列车已抵达 ${st.zh}`, `Arrived at ${st.en}`);
  }
  // 开门阶段：播放开门音频（首次发车/中途到站/跳转都播）
  audio.stopAll();
  audio.stopBackground(0);  // 停站时背景音立即静默
  audio.play(audio.getOrLoad('door_open.mp3'));
  renderStationMiniList();
}

function startJourney(){
  const fromIdx = state.currentIndex;
  const toIdx = nextStationIdx();
  if(toIdx == null){ finishRun(); return; }
  const fromKey = STATIONS[fromIdx].key;
  const toKey = STATIONS[toIdx].key;

  const sequence = AUDIO_SEQUENCES[dirKey(fromKey, toKey)] || [];
  const journeySec = JOURNEY_TIMES[undirKey(fromKey, toKey)] || 30;
  // 到站窗口：终点站 12s，其余 5s（此窗口内播放 approaching + 显示“即将到达”）
  const arrivingLeadS = (toIdx === terminusIdx()) ? CONFIG.ARRIVING_LEAD_TERMINUS_S : CONFIG.ARRIVING_LEAD_NORMAL_S;

  state.phase = 'journey';
  state.segProgress = 0;
  state.nextIdx = toIdx;
  state.journeyElapsed = 0;
  state.arrivingAtMs = journeySec * 1000;                      // 巡航结束 = 到站窗口开始
  state.journeyDuration = (journeySec + arrivingLeadS) * 1000; // 总时长 = 巡航 + 到站窗口
  state.arrivingStarted = false;
  state.approachingFile = APPROACHING_AUDIO[toKey] || null;

  bcText(`列车出发 · 下一站 ${STATIONS[toIdx].zh}`,
         `Departing · Next: ${STATIONS[toIdx].en}`);

  if(state.player){ state.player.stop(); }
  state.player = new JourneyPlayer(sequence, audio);
  state.player.start();

  audio.startBackground();  // 启程：背景音渐入
}

function arriveAtNextStation(){
  const toIdx = state.nextIdx;
  if(state.player){ state.player.stop(); state.player = null; }
  if(toIdx == null) return;
  if(toIdx === terminusIdx()) finishRun();
  else enterDwell(toIdx, { silent:false });
}

function finishRun(){
  state.phase = 'finished';
  state.running = true;
  state.nextIdx = null;
  state.segProgress = 1;
  state.progress = stationOffsets[terminusIdx()];
  state.currentIndex = terminusIdx();
  state.termElapsed = 0;
  if(state.player){ state.player.stop(); state.player = null; }
  audio.stopBackground(0);  // 确保背景音停止
  const t = STATIONS[terminusIdx()];
  bcText(`本次列车终到 ${t.zh} · 感谢乘坐`, `Terminus ${t.en} · Thank you for riding`);
  audio.stopAll();          // 停止可能在播的 approaching，避免与开门音重叠
  audio.play(audio.getOrLoad('door_open.mp3'));  // 终点站开门下车
  renderStationMiniList();
  if(state.loop){
    setTimeout(() => {
      if(state.loop && state.phase === 'finished'){
        const newDir = state.direction === 'forward' ? 'backward' : 'forward';
        audio.stopAll();
        resetState(newDir);
        setTimeout(startRun, 400);
      }
    }, 3800);
  }
}

function jumpToStation(idx){
  audio.stopAll();
  if(state.player){ state.player.stop(); state.player = null; }
  state.currentIndex = idx;
  state.nextIdx = null;
  state.segProgress = 0;
  state.progress = stationOffsets[idx];
  state.running = true;
  state.paused = false;
  bcText(`已跳转到 ${STATIONS[idx].zh}`, `Jumped to ${STATIONS[idx].en}`);
  if(idx === terminusIdx()) finishRun();
  else enterDwell(idx, { silent:false });
}

// ============ 主循环 ============
let lastT = performance.now();
function tick(now){
  try{
    const rawDt = now - lastT;
    lastT = now;
    const dt = Math.min(rawDt, 120);

    if(state.running && !state.paused){
      const dtS = dt * state.speedMul;

      if(state.phase === 'dwell'){
        state.dwellElapsed += dtS;
        state.dwellTimer -= dtS;
        // 进入关门阶段：播放关门音频（仅一次）
        if(!state.doorClosePlayed && state.dwellElapsed >= CONFIG.DOORS_OPEN_MS){
          state.doorClosePlayed = true;
          audio.stopAll();  // 停止开门音，避免与关门音重叠
          audio.play(audio.getOrLoad('door_close.mp3'));
        }
        if(state.dwellTimer <= 0){
          state.dwellTimer = 0;
          startJourney();
        }
      } else if(state.phase === 'journey'){
        // 区间时间驱动（独立于音频序列）
        state.journeyElapsed += dtS;
        state.segProgress = Math.min(1, state.journeyElapsed / state.journeyDuration);
        const fromIdx = state.currentIndex;
        const toIdx = state.nextIdx;
        if(fromIdx != null && toIdx != null){
          const p0 = stationOffsets[fromIdx];
          const p1 = stationOffsets[toIdx];
          state.progress = p0 + (p1 - p0) * trainEase(state.segProgress);
        }
        // 进入“即将到达”窗口（仅触发一次）：停序列 + 背景音渐出 + 播放 approaching（与到站画面同步）
        if(!state.arrivingStarted && state.journeyElapsed >= state.arrivingAtMs){
          state.arrivingStarted = true;
          if(state.player){ state.player.stop(); state.player = null; }
          audio.stopBackground();
          // 用单元素序列的 JourneyPlayer 播放 approaching，使暂停/恢复/停止与序列一致
          if(state.approachingFile){
            state.player = new JourneyPlayer([state.approachingFile], audio);
            state.player.start();
          }
        } else if(state.player && !state.player.finished){
          // 巡航阶段：推进序列音频
          state.player.update(dtS);
        }
        // 区间时间到 → 立即到站（停止音频）
        if(state.journeyElapsed >= state.journeyDuration){
          arriveAtNextStation();
        }
      } else if(state.phase === 'finished'){
        state.termElapsed += dtS;
      }
    } else if(state.phase === 'finished'){
      state.termElapsed += dt;
    }

    applyDisplayMode();
    renderDynamic();
  } catch(err){
    console.error('[rideon tick error]', err);
  }
  requestAnimationFrame(tick);
}

// ============ 时钟 ============
function startClock(){
  const wk = ['周日','周一','周二','周三','周四','周五','周六'];
  function upd(){
    const d = new Date();
    el.clockHm.textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    el.clockS.textContent = String(d.getSeconds()).padStart(2,'0');
    el.clockDate.textContent =
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${wk[d.getDay()]}`;
  }
  upd();
  setInterval(upd, 1000);
}

// ============ 站点小列表 ============
function renderStationMiniList(){
  el.stationMiniList.innerHTML = STATIONS.map((s, i) => {
    const cls = ['sml-item'];
    if(i === state.currentIndex) cls.push('current');
    else if(isPassed(i)) cls.push('passed');
    return `
      <div class="${cls.join(' ')}" data-idx="${i}" title="跳转到 ${s.zh}">
        <span class="sml-num">${String(i+1).padStart(2,'0')}</span>
        <span class="sml-name">
          <span class="sml-zh">${s.zh}</span>
          <span class="sml-en">${s.en}</span>
        </span>
      </div>`;
  }).join('');
  el.stationMiniList.querySelectorAll('.sml-item').forEach(node => {
    node.addEventListener('click', () => jumpToStation(+node.dataset.idx));
  });
}

// ============ 弹窗 ============
function openSettings(){ el.modalBackdrop.classList.add('open'); }
function closeSettings(){ el.modalBackdrop.classList.remove('open'); }
function toggleSettings(){ el.modalBackdrop.classList.toggle('open'); }

// ============ 事件 ============
function bindEvents(){
  el.btnSettings.addEventListener('click', toggleSettings);
  el.btnCloseSettings.addEventListener('click', closeSettings);
  el.modalBackdrop.addEventListener('click', e => { if(e.target === el.modalBackdrop) closeSettings(); });

  el.btnStart.addEventListener('click', startRun);
  el.btnPause.addEventListener('click', pauseRun);
  el.btnReset.addEventListener('click', () => { resetState(); bcText('已重置 · 可再次发车', 'Reset complete'); });
  el.btnFab.addEventListener('click', () => { if(state.running && !state.paused) pauseRun(); else startRun(); });

  document.querySelectorAll('.dir-btn').forEach(b => {
    b.addEventListener('click', () => {
      const dir = b.dataset.dir;
      if(dir === state.direction) return;
      resetState(dir);
      bcText(dir === 'forward' ? '方向：下北泽 → 全怪塔' : '方向：全怪塔 → 下北泽',
             dir === 'forward' ? 'Direction: Shimokita to Mob Tower' : 'Direction: Mob Tower to Shimokita');
    });
  });

  el.selSpeed.addEventListener('change', () => {
    state.speedMul = parseFloat(el.selSpeed.value) || 1;
    audio.setRate(state.speedMul);  // 音频同步变速，避免与画面/计时错位
  });
  el.rngVolume.addEventListener('input', () => {
    const v = (parseInt(el.rngVolume.value, 10) || 0) / 100;
    state.volume = v;
    audio.setVolume(v);
    el.volVal.textContent = Math.round(v*100) + '%';
  });
  el.chkLoop.addEventListener('change', () => { state.loop = el.chkLoop.checked; });
  el.chkBg.addEventListener('change', () => {
    audio.setBgEnabled(el.chkBg.checked);
    // 若在巡航途中打开开关，立即渐入背景音
    if(el.chkBg.checked && state.phase === 'journey' && !state.arrivingStarted && state.running && !state.paused){
      audio.startBackground();
    }
  });

  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toUpperCase();
    if(tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT'){
      if(e.key === 'Escape') e.target.blur();
      return;
    }
    switch(e.key){
      case ' ': e.preventDefault(); if(state.running && !state.paused) pauseRun(); else startRun(); break;
      case 'r': case 'R': resetState(); break;
      case 's': case 'S': toggleSettings(); break;
      case 'd': case 'D': {
        const nd = state.direction === 'forward' ? 'backward' : 'forward';
        const btn = document.querySelector(`.dir-btn[data-dir="${nd}"]`);
        if(btn) btn.click();
        break;
      }
      case 'Escape': closeSettings(); break;
    }
  });
}

// ============ 初始化 ============
// 预加载所有会播放的音频文件：避免首次播放因音频未就绪（status='loading'）被跳过。
// 返回 Promise：全部缓冲完成（或加载失败）时 resolve；onProgress(done,total) 用于加载动画进度。
function preloadAllAudio(onProgress){
  const files = new Set();
  // 开关门音频在停站阶段播放（不在序列里），必须单独预加载，否则首次发车时仍在 loading 被跳过
  files.add('door_open.mp3');
  files.add('door_close.mp3');
  Object.values(AUDIO_SEQUENCES).forEach(seq => {
    (seq || []).forEach(item => { if(item && item !== 'wait') files.add(item); });
  });
  // “即将到达”广播由区间独立触发（不在序列里），同样需要预加载
  Object.values(APPROACHING_AUDIO).forEach(f => { if(f) files.add(f); });

  const clips = Array.from(files).map(f => audio.getOrLoad(f));

  return new Promise(resolve => {
    // 背景音 running.mp3 一并纳入缓冲统计（“所有东西都缓冲完”）
    const targets = clips.map(c => c.audio).concat([audio.bg]);
    const total = targets.length;
    if(total === 0){ resolve(); return; }
    let done = 0;
    const bump = () => {
      done++;
      if(onProgress) onProgress(done, total);
      if(done >= total) resolve();
    };
    targets.forEach(a => {
      if(!a){ bump(); return; }
      if(a.readyState >= 4){ bump(); return; }   // HAVE_ENOUGH_DATA：已可直接播放
      let settled = false;
      const finish = () => { if(settled) return; settled = true; cleanup(); bump(); };
      const cleanup = () => {
        a.removeEventListener('canplaythrough', finish);
        a.removeEventListener('error', finish);
      };
      a.addEventListener('canplaythrough', finish);
      a.addEventListener('error', finish);
    });
  });
}

// 加载动画：统计缓冲进度，全部就绪（或超时兜底）后淡出遮罩、恢复正常界面
function runLoader(){
  const overlay = document.getElementById('loader-overlay');
  const bar = document.getElementById('loader-bar-fill');
  const pct = document.getElementById('loader-pct');
  // 若遮罩不存在，仍执行预加载（保留原有防静默能力）
  if(!overlay){ preloadAllAudio(); return; }

  const setProgress = (done, total) => {
    const p = total ? Math.min(100, Math.round(done / total * 100)) : 100;
    if(bar) bar.style.width = p + '%';
    if(pct) pct.textContent = p + '%';
  };

  const MAX_WAIT = 8000;  // 超时兜底：个别文件卡住也不会一直转圈，8s 后强制进入
  const ready = preloadAllAudio(setProgress).then(() => 'ready');
  const timeout = new Promise(res => setTimeout(() => res('timeout'), MAX_WAIT));

  Promise.race([ready, timeout]).then((which) => {
    setProgress(1, 1);
    overlay.classList.add('done');
    setTimeout(() => { overlay.style.display = 'none'; }, 650);
    // 仅当“超时兜底”触发（资源未全部就绪）时，提示网络超时
    if(which === 'timeout') showNetTimeout();
  });
}

// 顶部居中红色提示框：“网络请求超时”（6s 后自动收起，可手动关闭）
function showNetTimeout(){
  const toast = document.getElementById('net-toast');
  if(!toast) return;
  toast.classList.add('show');
  const hide = () => toast.classList.remove('show');
  const closeBtn = document.getElementById('net-toast-close');
  if(closeBtn) closeBtn.addEventListener('click', hide, { once:true });
  setTimeout(hide, 6000);
}

function init(){
  cacheDom();
  audio.setVolume(state.volume);
  computeRouteGeometry();
  buildBigRoute();
  buildPidsStrip();
  renderStatic();
  renderStationMiniList();
  resetState();
  bindEvents();
  startClock();
  requestAnimationFrame(tick);
  runLoader();   // 加载动画：等资源缓冲完成后再淡出，露出正常界面
}

init();
