import { addReview, averageScore, getTeacher } from "../../services/storage.js";

export function renderDetail(root, state, navigate) {
  const teacher = getTeacher(state.teacherId);
  if (!teacher) {
    root.innerHTML = `<div class="empty">没有找到该教师。<br><br><button class="btn secondary" id="back-main">返回主页</button></div>`;
    root.querySelector("#back-main").addEventListener("click", () => navigate("main"));
    return;
  }

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${teacher.name}</h1>
        <p>${teacher.college} · ${teacher.title}</p>
      </div>
      <button class="btn secondary" id="back-main">返回主页</button>
    </div>
    <div class="split">
      <div class="panel">
        <h2>教师信息</h2>
        <div class="stat-line"><strong>综合评分</strong><span>${averageScore(teacher) || "暂无"} / 5</span></div>
        <div class="stat-line"><strong>评价数量</strong><span>${teacher.reviews.length}</span></div>
        <div class="stat-line"><strong>联系方式</strong><span>${teacher.email}</span></div>
        <div class="stat-line"><strong>研究方向</strong><span>${teacher.research}</span></div>
        <div class="stat-line"><strong>基本介绍</strong><span>${teacher.intro}</span></div>
      </div>
      <form class="panel" id="review-form">
        <h2>追加评价</h2>
        <div class="field"><label>评分（1-5）</label><input name="score" type="number" min="1" max="5" step="0.1" required /></div>
        <div class="field"><label>评语</label><textarea name="text" required placeholder="补充你的课程体验或建议"></textarea></div>
        <button class="btn red" type="submit">提交评价</button>
      </form>
    </div>
    <div class="panel" style="margin-top:18px">
      <h2>全部评分和评语</h2>
      <div class="review-list">
        ${teacher.reviews.map((review) => `
          <article class="review">
            <div><strong>${review.score} / 5</strong> <span class="meta">${review.author} · ${review.date}</span></div>
            <p>${review.text}</p>
          </article>
        `).join("")}
      </div>
    </div>
  `;

  root.querySelector("#back-main").addEventListener("click", () => navigate("main", { college: teacher.college }));
  root.querySelector("#review-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    addReview(teacher.id, data);
    renderDetail(root, state, navigate);
  });
}
