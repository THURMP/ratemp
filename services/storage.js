import { seedTeachers, seedLogs } from "../data/seedData.js";
import { isSupabaseConfigured, supabaseConfig } from "../data/supabaseConfig.js";

const TEACHERS_KEY = "thu-rate-demo-teachers";
const LOGS_KEY = "thu-rate-demo-logs";
const AUTH_KEY = "thu-rate-demo-auth";

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

async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) => (
      createClient(supabaseConfig.url, supabaseConfig.anonKey)
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
    console.warn("Supabase unavailable, using localStorage fallback.", error);
    return fallback();
  }
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
        .order("date", { ascending: false });
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
          .map((review) => ({
            score: Number(review.score),
            text: review.text,
            author: review.author || "Anonymous student",
            date: review.date
          }))
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
  const teacher = {
    id: `t-${Date.now()}`,
    name: payload.name,
    college: payload.college,
    title: payload.title || "To be added",
    email: payload.email || "To be added",
    research: payload.research || "To be added",
    intro: payload.intro || "No introduction yet"
  };
  const review = {
    score: Number(payload.score),
    text: payload.review,
    author: "Anonymous student",
    date: today()
  };

  return withRemote(
    async (supabase) => {
      const { error: teacherError } = await supabase.from("teachers").insert(teacher);
      if (teacherError) throw teacherError;

      const { error: reviewError } = await supabase.from("reviews").insert({
        teacher_id: teacher.id,
        score: review.score,
        text: review.text,
        author: review.author,
        date: review.date
      });
      if (reviewError) throw reviewError;

      await addLog(`Added teacher: ${teacher.college} - ${teacher.name}, initial score ${payload.score}`);
      return { ...teacher, reviews: [review] };
    },
    () => {
      const teachers = getLocalTeachers();
      const savedTeacher = { ...teacher, reviews: [review] };
      teachers.push(savedTeacher);
      saveLocalTeachers(teachers);
      addLocalLog(`Added teacher: ${teacher.college} - ${teacher.name}, initial score ${payload.score}`);
      return savedTeacher;
    }
  );
}

export async function addReview(teacherId, review) {
  return withRemote(
    async (supabase) => {
      const { error } = await supabase.from("reviews").insert({
        teacher_id: teacherId,
        score: Number(review.score),
        text: review.text,
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
        score: Number(review.score),
        text: review.text,
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
        .limit(80);
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

function addLocalLog(message) {
  const logs = getLocalLogs();
  logs.unshift({ time: new Date().toLocaleString("zh-CN", { hour12: false }), message });
  write(LOGS_KEY, logs.slice(0, 80));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
