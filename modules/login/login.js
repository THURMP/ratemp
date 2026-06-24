import { authConfig } from "../../data/authConfig.js";
import { setAuthed, addLog } from "../../services/storage.js";

export function renderLogin(root, onSuccess) {
  root.innerHTML = `
    <div class="panel login-card">
      <div class="page-head">
        <div>
          <h1>学生登录验证</h1>
          <p>先通过一个问题验证，再进入教师评价系统。</p>
        </div>
      </div>
      <form id="login-form">
        <div class="field">
          <label for="verify-answer">${authConfig.question}</label>
          <input id="verify-answer" autocomplete="off" placeholder="输入验证答案（demo答案：清华）" required />
        </div>
        <div class="actions">
          <button class="btn red" type="submit">进入系统</button>
          <span class="error" id="login-error"></span>
        </div>
      </form>
    </div>
  `;

  root.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const answer = root.querySelector("#verify-answer").value.trim();
    const ok = authConfig.acceptedAnswers.some((item) => item.toLowerCase() === answer.toLowerCase());
    if (!ok) {
      root.querySelector("#login-error").textContent = "验证未通过，请检查答案。";
      return;
    }
    setAuthed(true);
    await addLog("学生验证通过并进入系统。");
    onSuccess();
  });
}
