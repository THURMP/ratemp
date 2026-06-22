import { seedTeachers, seedLogs } from "../data/seedData.js";

const TEACHERS_KEY = "thu-rate-demo-teachers";
const LOGS_KEY = "thu-rate-demo-logs";
const AUTH_KEY = "thu-rate-demo-auth";

function read(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function initStore() {
  if (!localStorage.getItem(TEACHERS_KEY)) write(TEACHERS_KEY, seedTeachers);
  if (!localStorage.getItem(LOGS_KEY)) write(LOGS_KEY, seedLogs);
}

export function isAuthed() { return read(AUTH_KEY, false); }
export function setAuthed(value) { write(AUTH_KEY, Boolean(value)); }

export function getTeachers() { return read(TEACHERS_KEY, []); }
export function saveTeachers(teachers) { write(TEACHERS_KEY, teachers); }

export function getTeacher(id) { return getTeachers().find((teacher) => teacher.id === id); }

export function getColleges() {
  const teachers = getTeachers();
  return [...new Set(teachers.map((teacher) => teacher.college))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function averageScore(teacher) {
  if (!teacher.reviews.length) return 0;
  const sum = teacher.reviews.reduce((total, review) => total + Number(review.score || 0), 0);
  return Math.round((sum / teacher.reviews.length) * 10) / 10;
}

export function addTeacher(payload) {
  const teachers = getTeachers();
  const teacher = {
    id: `t-${Date.now()}`,
    name: payload.name,
    college: payload.college,
    title: payload.title || "待补充",
    email: payload.email || "待补充",
    research: payload.research || "待补充",
    intro: payload.intro || "暂无介绍",
    reviews: [{ score: Number(payload.score), text: payload.review, author: "匿名学生", date: today() }]
  };
  teachers.push(teacher);
  saveTeachers(teachers);
  addLog(`新增教师：${teacher.college} - ${teacher.name}，初始评分 ${payload.score}`);
  return teacher;
}

export function addReview(teacherId, review) {
  const teachers = getTeachers();
  const teacher = teachers.find((item) => item.id === teacherId);
  if (!teacher) return null;
  teacher.reviews.push({ score: Number(review.score), text: review.text, author: "匿名学生", date: today() });
  saveTeachers(teachers);
  addLog(`新增评价：${teacher.name}，评分 ${review.score}`);
  return teacher;
}

export function getLogs() { return read(LOGS_KEY, []); }

export function addLog(message) {
  const logs = getLogs();
  logs.unshift({ time: new Date().toLocaleString("zh-CN", { hour12: false }), message });
  write(LOGS_KEY, logs.slice(0, 80));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
