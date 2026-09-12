// 特效驱动模块（技术概要设计 §4.2）
// 每秒把进度写为 CSS 变量（--p 解冻 / --pf 上冻），档位写为 data-stage；
// 连续动效全部由 CSS 常驻 @keyframes 承担（FR-09-1）。

const stage = document.getElementById('stage');

/**
 * @param {{state:string, progress:number, stage:string|null}} s computeState 结果
 */
export function applyEffects(s) {
  stage.dataset.state = s.state;
  if (s.stage) stage.dataset.stage = s.stage;
  else delete stage.dataset.stage;
  stage.style.setProperty('--p', (s.state === 'S1' ? s.progress : 1).toFixed(4));
  stage.style.setProperty('--pf', (s.state === 'S3' ? s.progress : 0).toFixed(4));
}
