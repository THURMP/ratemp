import { getBackendLabel, getLogs, getRemoteStatus, getTeachers } from "../../services/storage.js";

export async function renderLogs(root) {
  root.innerHTML = `<div class="empty">正在读取系统日志...</div>`;
  const logs = await getLogs();
  const teachers = await getTeachers();
  const remoteStatus = getRemoteStatus();
  const reviewCount = teachers.reduce((total, teacher) => total + teacher.reviews.length, 0);
  const statusText = remoteStatus.configured
    ? (remoteStatus.backend === "supabase" ? "已连接 Supabase" : `未连接 Supabase：${remoteStatus.error}`)
    : "未填写 Supabase URL 和 anon key";

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
        <div class="stat-line"><strong>存储方式</strong><span>${getBackendLabel()}</span></div>
        <div class="stat-line"><strong>云端状态</strong><span>${statusText}</span></div>
        <div class="stat-line"><strong>模块结构</strong><span>login / main / upload / detail / logs / services / data</span></div>
      </div>
      <div class="panel">
        <h2>开发者信息</h2>
        <p>Demo 版本：0.2.0</p>
        <p>用途：清华大学教师分类、评分、评价与信息补充原型。</p>
        <p class="hint">当前推荐后端为 Supabase。正式公开前应增加审核、举报、频率限制和更严格的身份验证。</p>
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
