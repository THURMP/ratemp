import { addReview, averageScore, getTeacher } from "../../services/storage.js";
import { ratingStars } from "../shared/rating.js";

export async function renderDetail(root, state, navigate) {
  root.innerHTML = `<div class="empty">正在读取教师详情...</div>`;
  const teacher = await getTeacher(state.teacherId);
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
        <div class="stat-line"><strong>综合评分</strong><span>${ratingStars(averageScore(teacher))}</span></div>
        <div class="stat-line"><strong>评价数量</strong><span>${teacher.reviews.length}</span></div>
        <div class="stat-line"><strong>联系方式</strong><span>${teacher.email}</span></div>
        <div class="stat-line"><strong>研究方向</strong><span>${teacher.research}</span></div>
        <div class="stat-line"><strong>基本介绍</strong><span>${teacher.intro}</span></div>
      </div>
      <form class="panel" id="review-form">
        <h2>追加评价</h2>
        <div class="field"><label>评分（1-5）</label><input name="score" type="number" min="1" max="5" step="0.1" required /></div>
        <div class="field"><label>评语（可选）</label><textarea name="text" placeholder="可补充你的课程体验或建议"></textarea></div>
        <button class="btn red" type="submit">提交评分</button>
      </form>
    </div>
    <div class="panel" style="margin-top:18px">
      <h2>全部评分和评语</h2>
      <div class="review-list">
        ${teacher.reviews.map((review) => `
          <article class="review">
            <div class="review-head">
              ${ratingStars(review.score)}
              <span class="meta">${review.author} · ${review.date}</span>
            </div>
            <p>${review.text || "未填写评语"}</p>
          </article>
        `).join("") || `<div class="empty">暂无评分。</div>`}
      </div>
    </div>
  `;

  root.querySelector("#back-main").addEventListener("click", () => navigate("main", { college: teacher.college, department: teacher.research }));
  root.querySelector("#review-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await addReview(teacher.id, data);
    renderDetail(root, state, navigate);
  });
}
