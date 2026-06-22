import { averageScore, getColleges, getTeachers } from "../../services/storage.js";

export function renderMain(root, state, navigate) {
  const colleges = getColleges();
  const teachers = getTeachers();
  const selectedCollege = state.college || colleges[0] || "";
  const keyword = state.keyword || "";
  const visibleTeachers = teachers
    .filter((teacher) => !selectedCollege || teacher.college === selectedCollege)
    .filter((teacher) => `${teacher.name}${teacher.title}${teacher.research}`.includes(keyword));

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>学院与教师</h1>
        <p>先选学院，再查看教师列表与评分。数据不足时可进入上传模块补充。</p>
      </div>
      <button class="btn red" id="go-upload">上传新教师</button>
    </div>
    <div class="grid college-grid">
      ${colleges.map((college) => {
        const count = teachers.filter((teacher) => teacher.college === college).length;
        return `<button class="card college-card" data-college="${college}">
          <h2>${college}</h2>
          <p class="meta">${count} 位教师</p>
        </button>`;
      }).join("") || `<div class="empty">暂无学院数据，请先上传教师信息。</div>`}
    </div>
    <div class="panel" style="margin-top:18px">
      <div class="toolbar">
        <select id="college-select">
          ${colleges.map((college) => `<option value="${college}" ${college === selectedCollege ? "selected" : ""}>${college}</option>`).join("")}
        </select>
        <input class="search" id="keyword" placeholder="搜索教师、职称或研究方向" value="${keyword}" />
      </div>
      <div class="grid teacher-grid">
        ${visibleTeachers.map((teacher) => `
          <button class="card teacher-card" data-id="${teacher.id}">
            <h3>${teacher.name}</h3>
            <p>${teacher.title} · ${teacher.research}</p>
            <div class="badge-row">
              <span class="badge score">评分 ${averageScore(teacher) || "暂无"}</span>
              <span class="badge count">${teacher.reviews.length} 条评价</span>
            </div>
          </button>
        `).join("") || `<div class="empty">当前条件下没有教师。</div>`}
      </div>
    </div>
  `;

  root.querySelector("#go-upload")?.addEventListener("click", () => navigate("upload"));
  root.querySelectorAll(".college-card").forEach((button) => {
    button.addEventListener("click", () => navigate("main", { college: button.dataset.college, keyword: "" }));
  });
  root.querySelector("#college-select")?.addEventListener("change", (event) => navigate("main", { college: event.target.value, keyword }));
  root.querySelector("#keyword")?.addEventListener("input", (event) => navigate("main", { college: selectedCollege, keyword: event.target.value }));
  root.querySelectorAll(".teacher-card").forEach((button) => {
    button.addEventListener("click", () => navigate("detail", { teacherId: button.dataset.id }));
  });
}
