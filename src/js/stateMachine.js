// 状态机纯函数模块（技术概要设计 §3.1）
// 唯一时间权威：无副作用、不依赖 DOM，可独立单测。
// S1 解冻倒计时：周一 00:00 ≤ t < 周五 19:00（115h，进度 0→1）
// S2 解冻开唱：  周五 19:00 ≤ t < 周六 00:00（5h，视频无特效）
// S3 逐步上冻：  周六 00:00 ≤ t < 下周一 00:00（48h，上冻进度 0→1）

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** 计算某时刻所在周（周一起点，周日归本周）的四个锚点 */
export function weekAnchors(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const daysSinceMonday = (d.getDay() + 6) % 7; // 周一=0 … 周日=6
  const monday00 = d.getTime() - daysSinceMonday * DAY;
  return {
    monday00,
    fri19: monday00 + 115 * HOUR, // 周五 19:00
    sat00: monday00 + 120 * HOUR, // 周六 00:00
    nextMon00: monday00 + 168 * HOUR, // 下周一 00:00
  };
}

/** 解冻档位（SRS FR-03） */
export function unfreezeStage(p) {
  if (p < 0.15) return 'L0';
  if (p < 0.40) return 'L1';
  if (p < 0.70) return 'L2';
  if (p < 0.95) return 'L3';
  return 'L4';
}

/** 上冻档位（SRS FR-06） */
export function freezeStage(p) {
  if (p < 0.30) return 'F0';
  if (p < 0.70) return 'F1';
  return 'F2';
}

const TOTAL_S1 = 115 * HOUR;
const TOTAL_S3 = 48 * HOUR;

/**
 * 计算页面状态。
 * @param {Date|number} now
 * @returns {{state:'S1'|'S2'|'S3', progress:number, stage:string|null,
 *            anchors:object, nextAnchorTs:number, remainMs:number, label:string}}
 */
export function computeState(now = new Date()) {
  const t = new Date(now).getTime();
  const a = weekAnchors(t);

  if (t < a.fri19) {
    const progress = (t - a.monday00) / TOTAL_S1;
    return {
      state: 'S1', progress, stage: unfreezeStage(progress),
      anchors: a, nextAnchorTs: a.fri19, remainMs: a.fri19 - t,
      label: '解冻倒计时 · 周五 19:00',
    };
  }
  if (t < a.sat00) {
    return {
      state: 'S2', progress: 1, stage: null,
      anchors: a, nextAnchorTs: a.sat00, remainMs: a.sat00 - t,
      label: '解冻成功 · 开唱中',
    };
  }
  const progress = (t - a.sat00) / TOTAL_S3;
  return {
    state: 'S3', progress, stage: freezeStage(progress),
    anchors: a, nextAnchorTs: a.nextMon00, remainMs: a.nextMon00 - t,
    label: '周末结束倒计时 · 周一重新冰封',
  };
}

/** 剩余毫秒 → "X天 HH:MM:SS"（FR-02-1） */
export function formatRemain(ms) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600) % 24;
  const d = Math.floor(total / 86400);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`;
}
