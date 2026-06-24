import { seedTeachers, seedLogs } from "../data/seedData.js";
import { isSupabaseConfigured, supabaseConfig } from "../data/supabaseConfig.js";

const TEACHERS_KEY = "thu-rate-demo-teachers";
const LOGS_KEY = "thu-rate-demo-logs";
const AUTH_KEY = "thu-rate-demo-auth";
const PENDING_KEY = "thu-rate-demo-pending-teachers";
const DEV_KEY = "thu-rate-demo-dev-key";

let clientPromise;
let lastBackend = "local";
let lastRemoteError = "";

function read(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getDevKey() {
  return sessionStorage.getItem(DEV_KEY) || "";
}

function setDevKey(value) {
  if (value) sessionStorage.setItem(DEV_KEY, value);
  else sessionStorage.removeItem(DEV_KEY);
  clientPromise = null;
}

async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) => (
      createClient(supabaseConfig.url, supabaseConfig.anonKey, {
        global: {
          headers: getDevKey() ? { "x-developer-key": getDevKey() } : {}
        }
      })
    ));
  }
  return clientPromise;
}

async function withRemote(action, fallback) {
  const supabase = await getSupabase();
  if (!supabase) {
    lastBackend = "local";
    lastRemoteError = "Supabase is not configured.";
    return fallback();
  }

  try {
    const value = await action(supabase);
    lastBackend = "supabase";
    lastRemoteError = "";
    return value;
  } catch (error) {
    lastBackend = "local";
    lastRemoteError = error?.message || String(error);
    console.warn("Supabase unavailable, using local fallback.", error);
    return fallback();
  }
}

async function requireSupabase() {
  const supabase = await getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export function getBackendLabel() {
  return lastBackend === "supabase" ? "Supabase cloud database" : "Browser localStorage";
}

export function getRemoteStatus() {
  return {
    configured: isSupabaseConfigured(),
    backend: lastBackend,
    error: lastRemoteError
  };
}

export async function initStore() {
  if (!localStorage.getItem(TEACHERS_KEY)) write(TEACHERS_KEY, seedTeachers);
  if (!localStorage.getItem(LOGS_KEY)) write(LOGS_KEY, seedLogs);
  if (!localStorage.getItem(PENDING_KEY)) write(PENDING_KEY, []);

  await withRemote(
    async (supabase) => {
      const { error } = await supabase.from("teachers").select("id").limit(1);
      if (error) throw error;
    },
    () => null
  );
}

export function isAuthed() { return read(AUTH_KEY, false); }
export function setAuthed(value) { write(AUTH_KEY, Boolean(value)); }

function getLocalTeachers() { return read(TEACHERS_KEY, []); }
function saveLocalTeachers(teachers) { write(TEACHERS_KEY, teachers); }
function getLocalLogs() { return read(LOGS_KEY, []); }
function getLocalPendingTeachers() { return read(PENDING_KEY, []); }
function saveLocalPendingTeachers(items) { write(PENDING_KEY, items); }

export async function getTeachers() {
  return withRemote(
    async (supabase) => {
      const { data: teachers, error: teacherError } = await supabase
        .from("teachers")
        .select("*")
        .order("college", { ascending: true })
        .order("name", { ascending: true });
      if (teacherError) throw teacherError;

      const { data: reviews, error: reviewError } = await supabase
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false });
      if (reviewError) throw reviewError;

      return teachers.map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        college: teacher.college,
        title: teacher.title,
        email: teacher.email,
        research: teacher.research,
        intro: teacher.intro,
        reviews: reviews
          .filter((review) => review.teacher_id === teacher.id)
          .map(normalizeReview)
      }));
    },
    getLocalTeachers
  );
}

export async function getTeacher(id) {
  const teachers = await getTeachers();
  return teachers.find((teacher) => teacher.id === id);
}

export async function getColleges() {
  const teachers = await getTeachers();
  return [...new Set(teachers.map((teacher) => teacher.college))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function averageScore(teacher) {
  if (!teacher.reviews.length) return 0;
  const sum = teacher.reviews.reduce((total, review) => total + Number(review.score || 0), 0);
  return Math.round((sum / teacher.reviews.length) * 10) / 10;
}

export async function addTeacher(payload) {
  const pendingTeacher = {
    id: `pending-${Date.now()}`,
    name: payload.name,
    college: payload.college,
    title: payload.title || "To be added",
    email: payload.email || "To be added",
    research: payload.research || "To be added",
    intro: payload.intro || "No introduction yet",
    score: Number(payload.score),
    review_text: normalizeReviewText(payload.review),
    status: "pending"
  };

  return withRemote(
    async (supabase) => {
      const { data, error } = await supabase
        .from("pending_teachers")
        .insert(pendingTeacher)
        .select()
        .single();
      if (error) throw error;
      await addLog(`Teacher upload submitted for review: ${pendingTeacher.college} - ${pendingTeacher.name}`);
      return { ...data, pending: true };
    },
    () => {
      const items = getLocalPendingTeachers();
      items.unshift({ ...pendingTeacher, created_at: new Date().toISOString() });
      saveLocalPendingTeachers(items);
      addLocalLog(`Teacher upload submitted for review: ${pendingTeacher.college} - ${pendingTeacher.name}`);
      return { ...pendingTeacher, pending: true };
    }
  );
}

export async function addReview(teacherId, review) {
  return withRemote(
    async (supabase) => {
      const { error } = await supabase.from("reviews").insert({
        teacher_id: teacherId,
        score: Number(review.score),
        text: normalizeReviewText(review.text),
        author: "Anonymous student",
        date: today()
      });
      if (error) throw error;

      const teacher = await getTeacher(teacherId);
      await addLog(`Added review: ${teacher?.name || teacherId}, score ${review.score}`);
      return teacher;
    },
    () => {
      const teachers = getLocalTeachers();
      const teacher = teachers.find((item) => item.id === teacherId);
      if (!teacher) return null;
      teacher.reviews.push({
        id: `local-review-${Date.now()}`,
        score: Number(review.score),
        text: normalizeReviewText(review.text),
        author: "Anonymous student",
        date: today()
      });
      saveLocalTeachers(teachers);
      addLocalLog(`Added review: ${teacher.name}, score ${review.score}`);
      return teacher;
    }
  );
}

export async function getLogs() {
  return withRemote(
    async (supabase) => {
      const { data, error } = await supabase
        .from("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.map((log) => ({ time: log.time, message: log.message }));
    },
    getLocalLogs
  );
}

export async function addLog(message) {
  return withRemote(
    async (supabase) => {
      const { error } = await supabase.from("system_logs").insert({
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        message
      });
      if (error) throw error;
    },
    () => addLocalLog(message)
  );
}

export async function devSignIn(key) {
  const cleanKey = String(key || "").trim();
  if (!cleanKey) throw new Error("请输入开发者密钥。");

  setDevKey(cleanKey);
  const supabase = await requireSupabase();
  const { error } = await supabase.from("pending_teachers").select("id").limit(1);
  if (error) {
    setDevKey("");
    throw new Error("密钥无效，或数据库尚未启用 key 登录策略。");
  }

  await addLog("Developer signed in with access key");
  return { label: "Key verified" };
}

export async function devSignOut() {
  setDevKey("");
}

export async function getDevSession() {
  return getDevKey() ? { label: "Key verified" } : null;
}

export async function getPendingTeachers() {
  return withRemote(
    async (supabase) => {
      const { data, error } = await supabase
        .from("pending_teachers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    getLocalPendingTeachers
  );
}

export async function approvePendingTeacher(pendingId) {
  const supabase = await requireSupabase();
  const { data: pending, error: pendingError } = await supabase
    .from("pending_teachers")
    .select("*")
    .eq("id", pendingId)
    .single();
  if (pendingError) throw pendingError;

  const teacher = {
    id: `t-${Date.now()}`,
    name: pending.name,
    college: pending.college,
    title: pending.title,
    email: pending.email,
    research: pending.research,
    intro: pending.intro
  };
  const { error: teacherError } = await supabase.from("teachers").insert(teacher);
  if (teacherError) throw teacherError;

  const { error: reviewError } = await supabase.from("reviews").insert({
    teacher_id: teacher.id,
    score: Number(pending.score),
    text: normalizeReviewText(pending.review_text),
    author: "Anonymous student",
    date: today()
  });
  if (reviewError) throw reviewError;

  const { error: deleteError } = await supabase.from("pending_teachers").delete().eq("id", pendingId);
  if (deleteError) throw deleteError;

  await addLog(`Approved teacher upload: ${teacher.college} - ${teacher.name}`);
  return teacher;
}

export async function rejectPendingTeacher(pendingId) {
  const supabase = await requireSupabase();
  const { error } = await supabase.from("pending_teachers").delete().eq("id", pendingId);
  if (error) throw error;
  await addLog(`Rejected teacher upload: ${pendingId}`);
}

export async function createTeacher(payload) {
  const supabase = await requireSupabase();
  const teacher = {
    id: `t-${Date.now()}`,
    name: payload.name,
    college: payload.college,
    title: payload.title || "To be added",
    email: payload.email || "To be added",
    research: payload.research || "To be added",
    intro: payload.intro || "No introduction yet"
  };
  const { data, error } = await supabase.from("teachers").insert(teacher).select().single();
  if (error) throw error;
  await addLog(`Developer created teacher: ${teacher.college} - ${teacher.name}`);
  return data;
}

export async function updateTeacher(teacherId, payload) {
  const supabase = await requireSupabase();
  const { error } = await supabase
    .from("teachers")
    .update({
      name: payload.name,
      college: payload.college,
      title: payload.title,
      email: payload.email,
      research: payload.research,
      intro: payload.intro
    })
    .eq("id", teacherId);
  if (error) throw error;
  await addLog(`Developer updated teacher: ${payload.name}`);
}

export async function deleteTeacher(teacherId) {
  const supabase = await requireSupabase();
  const { error } = await supabase.from("teachers").delete().eq("id", teacherId);
  if (error) throw error;
  await addLog(`Developer deleted teacher: ${teacherId}`);
}

export async function getAllReviews() {
  return withRemote(
    async (supabase) => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*, teachers(name, college)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.map((review) => ({
        ...normalizeReview(review),
        teacher_id: review.teacher_id,
        teacher_name: review.teachers?.name || review.teacher_id,
        teacher_college: review.teachers?.college || ""
      }));
    },
    () => getLocalTeachers().flatMap((teacher) => teacher.reviews.map((review) => ({
      ...review,
      teacher_id: teacher.id,
      teacher_name: teacher.name,
      teacher_college: teacher.college
    })))
  );
}

export async function updateReview(reviewId, payload) {
  const supabase = await requireSupabase();
  const { error } = await supabase
    .from("reviews")
    .update({
      score: Number(payload.score),
      text: normalizeReviewText(payload.text)
    })
    .eq("id", reviewId);
  if (error) throw error;
  await addLog(`Developer updated review: ${reviewId}`);
}

export async function deleteReview(reviewId) {
  const supabase = await requireSupabase();
  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) throw error;
  await addLog(`Developer deleted review: ${reviewId}`);
}

function normalizeReview(review) {
  return {
    id: review.id,
    score: Number(review.score),
    text: review.text,
    author: review.author || "Anonymous student",
    date: review.date
  };
}

function addLocalLog(message) {
  const logs = getLocalLogs();
  logs.unshift({ time: new Date().toLocaleString("zh-CN", { hour12: false }), message });
  write(LOGS_KEY, logs.slice(0, 200));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeReviewText(value) {
  const text = String(value || "").trim();
  return text || "未填写评语";
}
