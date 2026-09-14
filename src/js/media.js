// 视频模块（技术概要设计 §5）
// 自动播放策略：muted + playsinline；被拦截时「点击开始」兜底（E-6）；
// 加载失败 poster 兜底 + 重试（E-5）；离开 S2/S3 释放解码内存；
// 进度记忆：刷新后恢复上次播放位置（FR-05-1a，仅本播放周期内有效）；
// 进度条：S2/S3 底部可拖拽选择播放进度（FR-05-1b）。

import { computeState } from './stateMachine.js';

const video = document.getElementById('video');
const stage = document.getElementById('stage');
const startMask = document.getElementById('startMask');
const startBtn = document.getElementById('startBtn');
const unmuteBtn = document.getElementById('unmuteBtn');
const immersiveBtn = document.getElementById('immersiveBtn');
const fallback = document.getElementById('videoFallback');
const retryBtn = document.getElementById('retryBtn');
const seekbar = document.getElementById('seekbar');
const seekFill = document.getElementById('seekFill');
const visual = document.querySelector('.visual');

// 正式素材替换：仅需更换 src/assets/placeholder.mp4 文件，此处零改动
const VIDEO_SRC = new URL('../assets/placeholder.mp4', import.meta.url).href;

const PROGRESS_KEY = 'fridaynight:video-progress';

let active = false;
let wantMuted = true; // SRS Q-3：默认静音，提供取消静音按钮
let seeking = false;  // 进度条拖拽中
let lastSavedAt = 0;  // 进度保存节流时间戳
let fxRaf = 0;        // alignFx 节流帧 id

video.addEventListener('error', () => {
  if (active) showFallback();
});

video.addEventListener('timeupdate', () => {
  saveProgress();
  if (!seeking && video.duration) setFill(video.currentTime / video.duration);
});

retryBtn.addEventListener('click', () => {
  hide(fallback);
  load();
  tryPlay();
});

startBtn.addEventListener('click', () => {
  hide(startMask);
  tryPlay();
});

unmuteBtn.addEventListener('click', () => {
  wantMuted = !wantMuted;
  video.muted = wantMuted;
  unmuteBtn.textContent = wantMuted ? '🔇 取消静音' : '🔊 已开启声音';
});

/* ---------- 特效层对齐（FR-06-4 v1.4：与视频显示区域一致） ---------- */

/**
 * 计算视频在 .visual 容器内的实际显示盒（object-fit cover/contain 数学），
 * 写为 --fx-* 边距变量驱动 .freeze-overlay 内缩贴齐视频。
 * cover → 全 0（铺满容器）；contain 黑边 → 对应边内缩。
 */
function alignFx() {
  const style = getComputedStyle(visual);
  const fit = style.getPropertyValue('--video-fit').trim() || 'cover';
  let top = 0, right = 0, bottom = 0, left = 0;
  if (fit === 'contain' && video.videoWidth && video.videoHeight) {
    const cw = visual.clientWidth, ch = visual.clientHeight;
    const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
    const w = video.videoWidth * scale, h = video.videoHeight * scale;
    left = right = (cw - w) / 2;
    top = bottom = (ch - h) / 2;
  }
  visual.style.setProperty('--fx-top', top + 'px');
  visual.style.setProperty('--fx-right', right + 'px');
  visual.style.setProperty('--fx-bottom', bottom + 'px');
  visual.style.setProperty('--fx-left', left + 'px');
}

/** rAF 节流重算（容resize / 沉浸切换 / 视频尺寸就绪） */
function scheduleAlign() {
  if (fxRaf) return;
  fxRaf = requestAnimationFrame(() => { fxRaf = 0; alignFx(); });
}

window.addEventListener('resize', scheduleAlign);
video.addEventListener('loadedmetadata', scheduleAlign);

/* 沉浸式切换（FR-05-3 v1.3）：窄视口下 contain 完整展示 ↔ cover 铺满；
   切换后重算特效层边距（FR-06-4） */
immersiveBtn.addEventListener('click', () => {
  const on = stage.classList.toggle('immersive');
  immersiveBtn.setAttribute('aria-pressed', String(on));
  scheduleAlign();
});

/* ---------- 进度记忆（FR-05-1a：刷新恢复） ---------- */

/** 节流保存当前播放位置（≥1s 一次），localStorage 不可用时静默降级为无记忆 */
function saveProgress() {
  if (!active || !video.duration) return;
  const now = Date.now();
  if (now - lastSavedAt < 1000) return;
  lastSavedAt = now;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ t: Math.floor(video.currentTime), savedAt: now }));
  } catch { /* 隐私模式等存储异常忽略 */ }
}

/** 恢复上次播放位置：仅当记录产生于本播放周期（本周五 19:00 起）；距结尾 <2s 视为已看完从头播 */
function restoreProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return;
    const { t, savedAt } = JSON.parse(raw);
    if (!Number.isFinite(t) || savedAt < computeState(new Date()).anchors.fri19) return;
    const apply = () => {
      if (video.duration && t < video.duration - 2) video.currentTime = t;
    };
    if (video.readyState >= 1) apply();
    else video.addEventListener('loadedmetadata', apply, { once: true });
  } catch { /* 记录损坏忽略 */ }
}

/* ---------- 进度条拖拽（FR-05-1b：可选择进度） ---------- */

function setFill(ratio) {
  seekFill.style.width = (Math.min(1, Math.max(0, ratio)) * 100).toFixed(2) + '%';
}

function ratioFrom(e) {
  const rect = seekbar.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
}

seekbar.addEventListener('pointerdown', (e) => {
  seeking = true;
  seekbar.setPointerCapture(e.pointerId);
  setFill(ratioFrom(e));
});
seekbar.addEventListener('pointermove', (e) => {
  if (seeking) setFill(ratioFrom(e));
});
seekbar.addEventListener('pointerup', (e) => {
  if (!seeking) return;
  seeking = false;
  if (video.duration) video.currentTime = ratioFrom(e) * video.duration;
});
seekbar.addEventListener('pointercancel', () => { seeking = false; });

/* ---------- 激活 / 释放 ---------- */

function load() {
  if (!video.src) {
    video.src = VIDEO_SRC;
    video.load();
  }
}

function tryPlay() {
  const p = video.play();
  if (p && typeof p.catch === 'function') p.catch(() => show(startMask));
}

function show(el) { el.hidden = false; }
function hide(el) { el.hidden = true; }

function showFallback() {
  deactivateVideo();
  show(fallback);
}

/** L4 蓄力档预热（S1 末尾提前缓冲，消除转场黑屏，FR-04-1） */
export function preload() {
  if (!active) load();
  video.preload = 'auto';
}

/** 进入 S2/S3：激活视频、恢复上次进度并尝试自动播放 */
export function activateVideo() {
  if (active) return;
  active = true;
  hide(fallback);
  video.muted = wantMuted;
  load();
  video.preload = 'auto';
  restoreProgress();
  alignFx();
  show(unmuteBtn);
  tryPlay();
}

/** 离开 S2/S3：暂停、清进度记录并释放资源（下周期从头播放），沉浸态一并归零 */
export function deactivateVideo() {
  active = false;
  seeking = false;
  stage.classList.remove('immersive');
    immersiveBtn.setAttribute('aria-pressed', 'false');
    hide(startMask);
  hide(unmuteBtn);
  video.pause();
  video.removeAttribute('src');
  video.load();
  setFill(0);
  try { localStorage.removeItem(PROGRESS_KEY); } catch { /* 忽略 */ }
}
