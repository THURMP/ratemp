import { averageScore, getColleges, getTeachers } from "../../services/storage.js";
import { ratingStars } from "../shared/rating.js";

const LARGE_COLLEGE_THRESHOLD = 50;

export async function renderMain(root, state, navigate) {
  root.innerHTML = `<div class="empty">正在读取教师数据...</div>`;
  const colleges = await getColleges();
  const teachers = await getTeachers();
  const selectedCollege = state.college || "";
  const selectedDepartment = state.department || "";
  const keyword = state.keyword || "";
  const collegeTeachers = selectedCollege
    ? teachers.filter((teacher) => teacher.college === selectedCollege)
    : [];
  const isLargeCollege = collegeTeachers.length > LARGE_COLLEGE_THRESHOLD;
  const departments = getDepartments(collegeTeachers);
  const showDepartments = selectedCollege && isLargeCollege && !selectedDepartment && !keyword;
  const visibleTeachers = getVisibleTeachers({
    teachers,
    selectedCollege,
    selectedDepartment,
    keyword
  });

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>学院与教师</h1>
        <p>按学院浏览教师；人数较多的学院会先按系或方向分类。</p>
      </div>
      <button class="btn red" id="go-upload">上传新教师</button>
    </div>
    <div class="grid college-grid">
      ${colleges.map((college) => {
        const count = teachers.filter((teacher) => teacher.college === college).length;
        return `<button class="card college-card ${college === selectedCollege ? "selected" : ""}" data-college="${college}">
          <h2>${college}</h2>
          <p class="meta">${count} 位教师</p>
        </button>`;
      }).join("") || `<div class="empty">暂无学院数据，请先上传教师信息。</div>`}
    </div>
    <div class="panel" style="margin-top:18px">
      <div class="toolbar">
        <select id="college-select">
          <option value="">选择学院</option>
          ${colleges.map((college) => `<option value="${college}" ${college === selectedCollege ? "selected" : ""}>${college}</option>`).join("")}
        </select>
        ${selectedCollege && isLargeCollege ? `
          <select id="department-select">
            <option value="">全部系/方向</option>
            ${departments.map((department) => `<option value="${department.name}" ${department.name === selectedDepartment ? "selected" : ""}>${department.name}</option>`).join("")}
          </select>
        ` : ""}
        <input class="search" id="keyword" placeholder="搜索教师、职称或研究方向" value="${keyword}" />
      </div>
      ${renderContent({ selectedCollege, showDepartments, departments, visibleTeachers })}
    </div>
  `;

  root.querySelector("#go-upload")?.addEventListener("click", () => navigate("upload"));
  root.querySelectorAll(".college-card").forEach((button) => {
    button.addEventListener("click", () => navigate("main", { college: button.dataset.college, department: "", keyword: "" }));
  });
  root.querySelector("#college-select")?.addEventListener("change", (event) => {
    navigate("main", { college: event.target.value, department: "", keyword });
  });
  root.querySelector("#department-select")?.addEventListener("change", (event) => {
    navigate("main", { college: selectedCollege, department: event.target.value, keyword });
  });
  root.querySelector("#keyword")?.addEventListener("input", (event) => {
    navigate("main", { college: selectedCollege, department: selectedDepartment, keyword: event.target.value });
  });
  root.querySelectorAll(".department-card").forEach((button) => {
    button.addEventListener("click", () => navigate("main", { college: selectedCollege, department: button.dataset.department, keyword: "" }));
  });
  root.querySelectorAll(".teacher-card").forEach((button) => {
    button.addEventListener("click", () => navigate("detail", { teacherId: button.dataset.id }));
  });
}

function renderContent({ selectedCollege, showDepartments, departments, visibleTeachers }) {
  if (!selectedCollege) {
    return `<div class="empty">请选择一个学院。</div>`;
  }

  if (showDepartments) {
    return `
      <div class="grid department-grid">
        ${departments.map((department) => `
          <button class="card department-card" data-department="${department.name}">
            <h3>${department.name}</h3>
            <p class="meta">${department.count} 位教师</p>
          </button>
        `).join("")}
      </div>
    `;
  }

  return `
    <div class="grid teacher-grid">
      ${visibleTeachers.map((teacher) => `
        <button class="card teacher-card" data-id="${teacher.id}">
          <h3>${teacher.name}</h3>
          <p>${teacher.title} · ${teacher.research}</p>
          <div class="badge-row">
            <span class="badge score">${ratingStars(averageScore(teacher))}</span>
            <span class="badge count">${teacher.reviews.length} 条评价</span>
          </div>
        </button>
      `).join("") || `<div class="empty">当前条件下没有教师。</div>`}
    </div>
  `;
}

function getVisibleTeachers({ teachers, selectedCollege, selectedDepartment, keyword }) {
  return sortTeachers(teachers
    .filter((teacher) => !selectedCollege || teacher.college === selectedCollege)
    .filter((teacher) => !selectedDepartment || teacher.research === selectedDepartment)
    .filter((teacher) => `${teacher.name}${teacher.title}${teacher.research}`.includes(keyword)));
}

function getDepartments(teachers) {
  const counts = new Map();
  teachers.forEach((teacher) => {
    const department = teacher.research || "未分类";
    counts.set(department, (counts.get(department) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

function sortTeachers(teachers) {
  return [...teachers].sort((a, b) => {
    const reviewDiff = b.reviews.length - a.reviews.length;
    if (reviewDiff) return reviewDiff;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}
