import {
  approvePendingTeacher,
  createTeacher,
  deleteReview,
  deleteTeacher,
  devSignIn,
  devSignOut,
  getAllReviews,
  getDevSession,
  getLogs,
  getPendingTeachers,
  getTeachers,
  rejectPendingTeacher,
  updateReview,
  updateTeacher
} from "../../services/storage.js";
import { joinVisible } from "../shared/display.js";
import { ratingStars } from "../shared/rating.js";

export async function renderDeveloper(root, navigate) {
  root.innerHTML = `<div class="empty">正在检查开发者登录状态...</div>`;
  const session = await getDevSession();
  if (!session) {
    renderDeveloperLogin(root, navigate);
    return;
  }
  await renderDeveloperDashboard(root, navigate, session.label);
}

function renderDeveloperLogin(root, navigate) {
  root.innerHTML = `
    <div class="panel login-card">
      <div class="page-head">
        <div>
          <h1>开发者登录</h1>
          <p>输入开发者密钥进入审核与数据维护后台。</p>
        </div>
      </div>
      <form id="dev-login-form">
        <div class="field">
          <label>开发者密钥</label>
          <input name="key" type="password" required autocomplete="current-password" />
        </div>
        <div class="actions">
          <button class="btn red" type="submit">登录后台</button>
          <button class="btn secondary" type="button" id="back-main">返回主页</button>
        </div>
        <p class="hint">密钥只保存在当前浏览器，用于本次后台请求校验。</p>
        <p class="error" id="dev-login-error"></p>
      </form>
    </div>
  `;

  root.querySelector("#back-main").addEventListener("click", () => navigate("main"));
  root.querySelector("#dev-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await devSignIn(form.key);
      await renderDeveloper(root, navigate);
    } catch (error) {
      root.querySelector("#dev-login-error").textContent = error.message || "密钥无效";
    }
  });
}

async function renderDeveloperDashboard(root, navigate, label) {
  const [pending, teachers, reviews, logs] = await Promise.all([
    getPendingTeachers(),
    getTeachers(),
    getAllReviews(),
    getLogs()
  ]);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>开发者后台</h1>
        <p>${escapeText(label)} · 审核上传、维护教师信息、管理评论和查看系统日志。</p>
      </div>
      <button class="btn secondary" id="dev-signout">退出后台</button>
    </div>
    <div class="dev-tabs">
      <button class="dev-tab active" data-panel="pending-panel">待审核 ${pending.length}</button>
      <button class="dev-tab" data-panel="teachers-panel">教师 ${teachers.length}</button>
      <button class="dev-tab" data-panel="reviews-panel">评论 ${reviews.length}</button>
      <button class="dev-tab" data-panel="logs-panel">日志 ${logs.length}</button>
    </div>
    <section class="dev-panel" id="pending-panel">${renderPending(pending)}</section>
    <section class="dev-panel hidden" id="teachers-panel">${renderTeachers(teachers)}</section>
    <section class="dev-panel hidden" id="reviews-panel">${renderReviews(reviews)}</section>
    <section class="dev-panel hidden" id="logs-panel">${renderLogs(logs)}</section>
  `;

  bindTabs(root);
  root.querySelector("#dev-signout").addEventListener("click", async () => {
    await devSignOut();
    navigate("main");
  });
  bindPendingActions(root, navigate);
  bindTeacherActions(root, navigate);
  bindReviewActions(root, navigate);
}

function renderPending(items) {
  if (!items.length) return `<div class="empty">暂无待审核上传。</div>`;
  return `
    <div class="dev-list">
      ${items.map((item) => `
        <article class="dev-item">
          <div>
            <h3>${escapeText(item.name)}</h3>
            <p class="meta">${escapeText(joinVisible([item.college, item.research, item.title]))}</p>
            ${joinVisible([item.intro]) ? `<p>${escapeText(item.intro)}</p>` : ""}
            <p>${ratingStars(item.score)} <span class="meta">${escapeText(item.review_text || "未填写评语")}</span></p>
          </div>
          <div class="actions">
            <button class="btn red approve-pending" data-id="${escapeAttr(item.id)}">通过</button>
            <button class="btn secondary reject-pending" data-id="${escapeAttr(item.id)}">拒绝</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderTeachers(teachers) {
  return `
    <form class="panel compact-form" id="new-teacher-form">
      <h2>新增教师</h2>
      <div class="form-grid">
        <input name="name" required placeholder="姓名" />
        <input name="college" required placeholder="学院" />
        <input name="research" placeholder="系或方向" />
        <input name="title" placeholder="职称" />
        <input name="email" placeholder="邮箱或主页" />
        <input name="intro" placeholder="简介" />
      </div>
      <button class="btn red" type="submit">新增</button>
    </form>
    <div class="dev-table-wrap">
      <table class="dev-table">
        <thead><tr><th>姓名</th><th>学院</th><th>系或方向</th><th>职称</th><th>邮箱/主页</th><th>简介</th><th>操作</th></tr></thead>
        <tbody>
          ${teachers.map((teacher) => `
            <tr>
              <td><input data-field="name" data-id="${escapeAttr(teacher.id)}" value="${escapeAttr(teacher.name)}" /></td>
              <td><input data-field="college" data-id="${escapeAttr(teacher.id)}" value="${escapeAttr(teacher.college)}" /></td>
              <td><input data-field="research" data-id="${escapeAttr(teacher.id)}" value="${escapeAttr(teacher.research)}" /></td>
              <td><input data-field="title" data-id="${escapeAttr(teacher.id)}" value="${escapeAttr(teacher.title)}" /></td>
              <td><input data-field="email" data-id="${escapeAttr(teacher.id)}" value="${escapeAttr(teacher.email)}" /></td>
              <td><textarea data-field="intro" data-id="${escapeAttr(teacher.id)}">${escapeText(teacher.intro)}</textarea></td>
              <td class="table-actions">
                <button class="btn secondary save-teacher" data-id="${escapeAttr(teacher.id)}">保存</button>
                <button class="btn red delete-teacher" data-id="${escapeAttr(teacher.id)}">删除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReviews(reviews) {
  if (!reviews.length) return `<div class="empty">暂无评论。</div>`;
  return `
    <div class="dev-table-wrap">
      <table class="dev-table">
        <thead><tr><th>教师</th><th>评分</th><th>评论</th><th>日期</th><th>操作</th></tr></thead>
        <tbody>
          ${reviews.map((review) => `
            <tr>
              <td>${escapeText(review.teacher_name)}<br><span class="meta">${escapeText(review.teacher_college)}</span></td>
              <td><input data-review-field="score" data-id="${escapeAttr(review.id)}" type="number" min="1" max="5" step="0.1" value="${escapeAttr(review.score)}" /></td>
              <td><textarea data-review-field="text" data-id="${escapeAttr(review.id)}">${escapeText(review.text)}</textarea></td>
              <td>${escapeText(review.date)}</td>
              <td class="table-actions">
                <button class="btn secondary save-review" data-id="${escapeAttr(review.id)}">保存</button>
                <button class="btn red delete-review" data-id="${escapeAttr(review.id)}">删除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLogs(logs) {
  return `
    <div class="log-list">
      ${logs.map((log) => `<div class="log-item"><strong>${escapeText(log.time)}</strong><br>${escapeText(log.message)}</div>`).join("") || `<div class="empty">暂无日志。</div>`}
    </div>
  `;
}

function bindTabs(root) {
  root.querySelectorAll(".dev-tab").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll(".dev-tab").forEach((item) => item.classList.remove("active"));
      root.querySelectorAll(".dev-panel").forEach((panel) => panel.classList.add("hidden"));
      button.classList.add("active");
      root.querySelector(`#${button.dataset.panel}`).classList.remove("hidden");
    });
  });
}

function bindPendingActions(root, navigate) {
  root.querySelectorAll(".approve-pending").forEach((button) => button.addEventListener("click", async () => {
    await approvePendingTeacher(button.dataset.id);
    await renderDeveloper(root, navigate);
  }));
  root.querySelectorAll(".reject-pending").forEach((button) => button.addEventListener("click", async () => {
    await rejectPendingTeacher(button.dataset.id);
    await renderDeveloper(root, navigate);
  }));
}

function bindTeacherActions(root, navigate) {
  root.querySelector("#new-teacher-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createTeacher(Object.fromEntries(new FormData(event.currentTarget).entries()));
    await renderDeveloper(root, navigate);
  });
  root.querySelectorAll(".save-teacher").forEach((button) => button.addEventListener("click", async () => {
    await updateTeacher(button.dataset.id, collectTeacherRow(root, button.dataset.id));
    await renderDeveloper(root, navigate);
  }));
  root.querySelectorAll(".delete-teacher").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("确认删除该教师及其评论？")) return;
    await deleteTeacher(button.dataset.id);
    await renderDeveloper(root, navigate);
  }));
}

function bindReviewActions(root, navigate) {
  root.querySelectorAll(".save-review").forEach((button) => button.addEventListener("click", async () => {
    await updateReview(button.dataset.id, collectReviewRow(root, button.dataset.id));
    await renderDeveloper(root, navigate);
  }));
  root.querySelectorAll(".delete-review").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("确认删除该评论？")) return;
    await deleteReview(button.dataset.id);
    await renderDeveloper(root, navigate);
  }));
}

function collectTeacherRow(root, id) {
  const fields = {};
  root.querySelectorAll(`[data-id="${cssEscape(id)}"][data-field]`).forEach((input) => {
    fields[input.dataset.field] = input.value.trim();
  });
  return fields;
}

function collectReviewRow(root, id) {
  const fields = {};
  root.querySelectorAll(`[data-id="${cssEscape(id)}"][data-review-field]`).forEach((input) => {
    fields[input.dataset.reviewField] = input.value;
  });
  return fields;
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
