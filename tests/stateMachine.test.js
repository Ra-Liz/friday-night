import { describe, it, expect } from 'vitest';
import {
  computeState,
  weekAnchors,
  formatRemain,
  unfreezeStage,
  freezeStage,
  HOUR,
} from '../src/js/stateMachine.js';

// 基准周：2026-09-07（周一）00:00 本地时间
const MON = new Date(2026, 8, 7, 0, 0, 0, 0).getTime();

describe('weekAnchors（锚点计算，概要设计 §3.1）', () => {
  it('周一为一周起点，周日归本周', () => {
    expect(weekAnchors(new Date(2026, 8, 7)).monday00).toBe(MON);
    expect(weekAnchors(new Date(2026, 8, 8, 15)).monday00).toBe(MON);
    expect(weekAnchors(new Date(2026, 8, 13)).monday00).toBe(MON); // 周日
  });

  it('三锚点间隔：115h（解冻）/ 5h（开唱）/ 48h（上冻）', () => {
    const a = weekAnchors(new Date(2026, 8, 9));
    expect(a.fri19 - a.monday00).toBe(115 * HOUR);
    expect(a.sat00 - a.fri19).toBe(5 * HOUR);
    expect(a.nextMon00 - a.sat00).toBe(48 * HOUR);
  });

  it('跨年周：2027-01-01（周五）的周一锚为 2026-12-28', () => {
    const a = weekAnchors(new Date(2027, 0, 1));
    expect(a.monday00).toBe(new Date(2026, 11, 28).getTime());
  });
});

describe('computeState（映射 SRS 验收 A-1~A-5）', () => {
  it('A-1 周三 12:00 → S1 / L2 / 进度≈52% / 倒计时 2天 07:00:00', () => {
    const s = computeState(new Date(2026, 8, 9, 12));
    expect(s.state).toBe('S1');
    expect(s.stage).toBe('L2');
    expect(s.progress).toBeCloseTo(60 / 115, 6);
    expect(formatRemain(s.remainMs)).toBe('2天 07:00:00');
  });

  it('A-2 边界：周五 18:59:59.999 仍 S1/L4；19:00:00.000 切 S2', () => {
    const before = computeState(new Date(2026, 8, 11, 18, 59, 59, 999));
    expect(before.state).toBe('S1');
    expect(before.stage).toBe('L4');
    const after = computeState(new Date(2026, 8, 11, 19, 0, 0, 0));
    expect(after.state).toBe('S2');
    expect(after.stage).toBeNull();
  });

  it('A-3 周五 20:00 → S2（开唱中，无档位）', () => {
    const s = computeState(new Date(2026, 8, 11, 20));
    expect(s.state).toBe('S2');
    expect(formatRemain(s.remainMs)).toBe('0天 04:00:00');
  });

  it('A-4 周日 12:00 → S3 / 进度 75%（距周六 00:00 已 36h）/ F2', () => {
    const s = computeState(new Date(2026, 8, 13, 12));
    expect(s.state).toBe('S3');
    expect(s.progress).toBeCloseTo(36 / 48, 6);
    expect(s.stage).toBe('F2');
  });

  it('A-5 边界：周日 23:59:59.999 仍 S3；周一 00:00:00.000 归零回 S1/L0（FR-07）', () => {
    expect(computeState(new Date(2026, 8, 13, 23, 59, 59, 999)).state).toBe('S3');
    const s = computeState(new Date(2026, 8, 14, 0, 0, 0, 0));
    expect(s.state).toBe('S1');
    expect(s.progress).toBe(0);
    expect(s.stage).toBe('L0');
    expect(formatRemain(s.remainMs)).toBe('4天 19:00:00');
  });

  it('周六 12:00 → S3 / F0 / 25%（FR-06 F0 起步平滑）', () => {
    const s = computeState(new Date(2026, 8, 12, 12));
    expect(s.state).toBe('S3');
    expect(s.stage).toBe('F0');
    expect(s.progress).toBeCloseTo(0.25, 6);
  });
});

describe('档位阈值（SRS FR-03 / FR-06）', () => {
  it('unfreezeStage L0–L5 分界 15/40/70/95%', () => {
    expect(unfreezeStage(0)).toBe('L0');
    expect(unfreezeStage(0.149)).toBe('L0');
    expect(unfreezeStage(0.15)).toBe('L1');
    expect(unfreezeStage(0.399)).toBe('L1');
    expect(unfreezeStage(0.4)).toBe('L2');
    expect(unfreezeStage(0.699)).toBe('L2');
    expect(unfreezeStage(0.7)).toBe('L3');
    expect(unfreezeStage(0.949)).toBe('L3');
    expect(unfreezeStage(0.95)).toBe('L4');
    expect(unfreezeStage(1)).toBe('L4');
  });

  it('freezeStage F0–F2 分界 30/70%', () => {
    expect(freezeStage(0)).toBe('F0');
    expect(freezeStage(0.299)).toBe('F0');
    expect(freezeStage(0.3)).toBe('F1');
    expect(freezeStage(0.699)).toBe('F1');
    expect(freezeStage(0.7)).toBe('F2');
    expect(freezeStage(1)).toBe('F2');
  });
});

describe('formatRemain（FR-02-1）', () => {
  it('55h → 2天 07:00:00', () => {
    expect(formatRemain(55 * HOUR)).toBe('2天 07:00:00');
  });
  it('0 与负值 → 0天 00:00:00', () => {
    expect(formatRemain(0)).toBe('0天 00:00:00');
    expect(formatRemain(-5)).toBe('0天 00:00:00');
  });
});
