// 时钟调度模块（技术概要设计 §3.2）
// 整秒对齐 tick + visibilitychange/focus 即时重算（FR-01-2 / FR-01-3）。
// DEV 构建支持 ?t=<毫秒时间戳|ISO字符串> 注入时间偏移（验收 A-2/A-5 用，
// 非 DEV 环境该参数被忽略，生产安全）。

export function resolveDevOffset() {
  let offset = 0;
  // import.meta.env 仅 Vite/Vitest 环境存在；原生 ES Module 下为 undefined
  if (import.meta.env?.DEV) {
    const raw = new URLSearchParams(location.search).get('t');
    if (raw) {
      const n = Number(raw);
      const ts = Number.isFinite(n) && raw.trim() !== '' ? n : Date.parse(raw);
      if (Number.isFinite(ts)) offset = ts - Date.now();
    }
  }
  return offset;
}

/**
 * 启动时钟循环。
 * @param {(now: Date) => void} onTick 每秒回调（含首次立即调用）
 * @returns {() => void} stop 函数
 */
export function startClock(onTick) {
  const offset = resolveDevOffset();
  const now = () => new Date(Date.now() + offset);
  const tick = () => onTick(now());

  tick(); // 首次立即（FR-01-1：打开即渲染正确状态）

  // 整秒对齐，避免累计漂移
  const toNextSecond = 1000 - (Date.now() % 1000);
  let interval = null;
  const alignTimer = setTimeout(() => {
    tick();
    interval = setInterval(tick, 1000);
  }, toNextSecond);

  // 休眠/后台恢复即时重算（E-3 / E-7）
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', tick);

  return function stop() {
    clearTimeout(alignTimer);
    if (interval) clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', tick);
  };
}
