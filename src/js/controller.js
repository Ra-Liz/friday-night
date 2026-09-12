// 控制器（技术概要设计 §3.3）
// 订阅 tick → diff 状态 → 编排转场（S1→S2 爆裂 / S3→S1 冻结）与 HUD 渲染。

import { computeState, formatRemain } from './stateMachine.js';
import { startClock } from './clock.js';
import { applyEffects } from './effects.js';
import * as media from './media.js';

const stage = document.getElementById('stage');
const countdownEl = document.getElementById('countdown');
const progressEl = document.getElementById('progressLabel');
const subtitleEl = document.getElementById('subtitle');

let current = null;

export function init() {
  startClock(handleTick);
}

function handleTick(now) {
  const s = computeState(now);
  applyEffects(s);
  renderHud(s);

  if (!current) {
    // 首次进入：直接渲染目标状态，不播跨状态转场（FR-04-2 / FR-07-3）
    current = s;
    if (s.state !== 'S1') media.activateVideo();
    return;
  }

  if (s.state !== current.state) {
    transition(current.state, s.state);
  } else if (s.state === 'S1' && s.stage === 'L4' && current.stage !== 'L4') {
    media.preload(); // 进入蓄力档，提前预热视频
  }
  current = s;
}

function transition(from, to) {
  if (to === 'S2') {
    // S1 → S2：冰块爆裂转场（≤2s），视频并行激活（FR-04-1）
    stage.classList.add('burst');
    media.activateVideo();
    setTimeout(() => stage.classList.remove('burst'), 2000);
  } else if (to === 'S1') {
    // S3 → S1：彻底冻住短转场（≤1.5s），归零回 L0（FR-07）
    stage.classList.add('refreeze');
    media.deactivateVideo();
    setTimeout(() => stage.classList.remove('refreeze'), 1600);
  }
  // S2 → S3：无重转场，--pf 从 0 平滑起步（FR-06）
}

function renderHud(s) {
  subtitleEl.textContent = s.label;

  if (s.state === 'S2') {
    countdownEl.textContent = '解冻成功 🎉';
    progressEl.textContent = 'FridayNight 正在循环播放';
    return;
  }

  countdownEl.textContent = formatRemain(s.remainMs);
  const pct = Math.floor(s.progress * 100);
  progressEl.textContent = s.state === 'S1'
    ? `解冻进度 ${pct}%`
    : `上冻进度 ${pct}%`;
}
