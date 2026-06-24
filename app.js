import { renderLogin } from "./modules/login/login.js";
import { renderMain } from "./modules/main/main.js";
import { renderUpload } from "./modules/upload/upload.js";
import { renderDetail } from "./modules/detail/detail.js";
import { renderDeveloper } from "./modules/developer/developer.js";
import { renderCopyright } from "./modules/copyright/copyright.js";
import { initStore, isAuthed, setAuthed } from "./services/storage.js";

const modules = {
  login: document.querySelector("#login-module"),
  main: document.querySelector("#main-module"),
  upload: document.querySelector("#upload-module"),
  detail: document.querySelector("#detail-module"),
  copyright: document.querySelector("#copyright-module"),
  developer: document.querySelector("#developer-module")
};
const navButtons = [...document.querySelectorAll(".nav-item")];
const loginState = document.querySelector("#login-state");
let state = { route: "main" };

function show(route) {
  Object.entries(modules).forEach(([name, node]) => node.classList.toggle("hidden", name !== route));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.route === route));
}

async function navigate(route, nextState = {}) {
  state = { ...state, ...nextState, route };
  if (!isAuthed() && !["developer", "copyright"].includes(route)) {
    show("login");
    renderLogin(modules.login, () => navigate("main"));
    updateLoginState();
    return;
  }
  if (route === "main") await renderMain(modules.main, state, navigate);
  if (route === "upload") await renderUpload(modules.upload, navigate);
  if (route === "detail") await renderDetail(modules.detail, state, navigate);
  if (route === "copyright") renderCopyright(modules.copyright);
  if (route === "developer") await renderDeveloper(modules.developer, navigate);
  show(route);
  updateLoginState();
}

function updateLoginState() {
  loginState.innerHTML = isAuthed()
    ? `已通过学生验证<br><button class="btn secondary" id="logout" style="margin-top:10px">退出验证</button>`
    : `未登录<br><span class="hint">请先完成清华学生验证。</span>`;
  loginState.querySelector("#logout")?.addEventListener("click", () => {
    setAuthed(false);
    navigate("login");
  });
}

navButtons.forEach((button) => button.addEventListener("click", () => navigate(button.dataset.route)));
await initStore();
navigate("main");
