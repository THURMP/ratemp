import { addTeacher, getColleges } from "../../services/storage.js";

export function renderUpload(root, navigate) {
  const colleges = getColleges();
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>上传教师信息</h1>
        <p>学生可补充教师基础信息、评分和第一条评价。</p>
      </div>
    </div>
    <form class="panel" id="upload-form">
      <div class="split">
        <div>
          <div class="field"><label>教师姓名</label><input name="name" required placeholder="例如：张教授" /></div>
          <div class="field"><label>学院 / 院系</label><input name="college" list="college-list" required placeholder="例如：软件学院" /></div>
          <datalist id="college-list">${colleges.map((college) => `<option value="${college}"></option>`).join("")}</datalist>
          <div class="field"><label>职称</label><input name="title" placeholder="教授 / 副教授 / 讲师" /></div>
          <div class="field"><label>邮箱或主页</label><input name="email" placeholder="可选" /></div>
        </div>
        <div>
          <div class="field"><label>研究方向</label><input name="research" placeholder="例如：人工智能、系统安全" /></div>
          <div class="field"><label>基本介绍</label><textarea name="intro" placeholder="简短介绍教师风格、课程或研究方向"></textarea></div>
          <div class="field"><label>评分（1-5）</label><input name="score" type="number" min="1" max="5" step="0.1" required placeholder="4.5" /></div>
          <div class="field"><label>评语</label><textarea name="review" required placeholder="请写下真实、具体、尊重的评价"></textarea></div>
        </div>
      </div>
      <div class="actions">
        <button class="btn red" type="submit">保存并查看详情</button>
        <button class="btn secondary" type="button" id="back-main">返回主页</button>
      </div>
    </form>
  `;

  root.querySelector("#back-main").addEventListener("click", () => navigate("main"));
  root.querySelector("#upload-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const teacher = addTeacher(data);
    navigate("detail", { teacherId: teacher.id });
  });
}
