import { getLogs, getTeachers } from "../../services/storage.js";

export function renderLogs(root) {
  const logs = getLogs();
  const teachers = getTeachers();
  const reviewCount = teachers.reduce((total, teacher) => total + teacher.reviews.length, 0);
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>系统日志及开发者信息</h1>
        <p>用于 demo 阶段追踪数据变更和开发说明。</p>
      </div>
    </div>
    <div class="split">
      <div class="panel">
        <h2>系统状态</h2>
        <div class="stat-line"><strong>教师数量</strong><span>${teachers.length}</span></div>
        <div class="stat-line"><strong>评价数量</strong><span>${reviewCount}</span></div>
        <div class="stat-line"><strong>存储方式</strong><span>浏览器 localStorage 模拟后台</span></div>
        <div class="stat-line"><strong>模块结构</strong><span>login / main / upload / detail / logs / services / data</span></div>
      </div>
      <div class="panel">
        <h2>开发者信息</h2>
        <p>Demo 版本：0.1.0</p>
        <p>用途：清华大学教师分类、评分、评价与信息补充原型。</p>
        <p class="hint">后续可替换为 Node/数据库后台，增加真实身份认证、审核机制和反滥用策略。</p>
      </div>
    </div>
    <div class="panel" style="margin-top:18px">
      <h2>操作日志</h2>
      <div class="log-list">
        ${logs.map((log) => `<div class="log-item"><strong>${log.time}</strong><br>${log.message}</div>`).join("") || `<div class="empty">暂无日志。</div>`}
      </div>
    </div>
  `;
}
