// Global Shared Constants, State, and Utilities for Timetable App

// Constants
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
const STUDY_COLORS = ['#a855f7', '#8b5cf6', '#7c3aed', '#c084fc', '#d946ef', '#7e22ce', '#9333ea'];
const SLOTS = [
  { l: '8:00ص', h: 8 }, { l: '9:00ص', h: 9 }, { l: '10:00ص', h: 10 }, { l: '11:00ص', h: 11 },
  { l: '12:00م', h: 12 }, { l: '1:00م', h: 13 }, { l: '2:00م', h: 14 }, { l: '3:00م', h: 15 }, { l: '4:00م', h: 16 },
  { l: '5:00م', h: 17 }, { l: '6:00م', h: 18 }, { l: '7:00م', h: 19 }, { l: '8:00م', h: 20 }, { l: '9:00م', h: 21 }
];

const BRANCHES = {
  math: { label: 'علمي رياضة', subjects: ['عربي', 'إنجليزي', 'فيزياء', 'كيمياء', 'رياضة بحتة', 'رياضة تطبيقية'] },
  science: { label: 'علمي علوم', subjects: ['عربي', 'إنجليزي', 'فيزياء', 'كيمياء', 'أحياء'] }
};

const CURRICULUM_BRANCHES = {
  math: { label: 'علمي رياضة', subjects: ['عربي', 'إنجليزي', 'فيزياء', 'كيمياء', 'رياضة بحتة', 'رياضة تطبيقية'] },
  science: { label: 'علمي علوم', subjects: ['عربي', 'إنجليزي', 'فيزياء', 'كيمياء', 'أحياء'] }
};

const SUBJECT_ICONS = {
  'فيزياء': '⚛️',
  'كيمياء': '🧪',
  'أحياء': '🧬',
  'رياضة بحتة': '📐',
  'رياضة تطبيقية': '📏',
  'عربي': '📝',
  'إنجليزي': '🔤'
};

// Global State
let currentUser = null;
let state = {
  branch: null,
  subjects: [],
  currentView: 'grid',
};
let studyState = { subjects: [] };
let curriculumState = { subjects: [] };
let todoItems = [];
let autoTaskDoneStates = {};
let todoArchive = [];
let aiProgress = { studiedLessons: {}, lessonExams: {}, unitExams: {}, courseExams: {} };
let geminiApiKey = '';
let aiChatHistory = [];
let userStats = {
  streak: 1,
  xp: 150,
  level: 2,
  targetCollege: 'كلية الطب',
  targetUniv: 'جامعة القاهرة',
  targetScore: 98.5,
  lastStreakDate: new Date().toISOString().split('T')[0]
};

function getPerUserApiKey(username) {
  const u = username || currentUser;
  if (!u) return '';
  return localStorage.getItem('tt_gemini_key_' + u) || '';
}

function setPerUserApiKey(username, key) {
  const u = username || currentUser;
  if (!u) return;
  const cleanKey = (key || '').trim();
  if (cleanKey) {
    localStorage.setItem('tt_gemini_key_' + u, cleanKey);
  } else {
    localStorage.removeItem('tt_gemini_key_' + u);
  }
  if (u === currentUser) {
    geminiApiKey = cleanKey;
  }
}

function getUserStatsForUser(username) {
  const u = username || currentUser;
  if (!u) return userStats;
  try {
    const saved = localStorage.getItem('tt_stats_' + u);
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return userStats;
}

function saveUserStatsForUser(username, stats) {
  const u = username || currentUser;
  if (!u) return userStats;
  const current = getUserStatsForUser(u);
  const merged = { ...current, ...stats };
  localStorage.setItem('tt_stats_' + u, JSON.stringify(merged));
  if (u === currentUser) userStats = merged;
  if (window.SupaDB && SupaDB.client && SupaDB.saveUserStats) {
    SupaDB.saveUserStats(u, merged).catch(() => {});
  }
  return merged;
}

function awardXP(amount) {
  if (!currentUser) return;
  const stats = getUserStatsForUser(currentUser);
  const oldLevel = stats.level || 1;
  stats.xp = (stats.xp || 0) + amount;
  const newLevel = Math.min(99, Math.floor(Math.sqrt(stats.xp / 40)) + 1);
  stats.level = newLevel;
  saveUserStatsForUser(currentUser, stats);

  if (newLevel > oldLevel) {
    showToast(`🎉 مبروك! ارتفع مستواك إلى المستوى ${newLevel}!`, 'success');
  } else {
    showToast(`⚡ +${amount} نقطة XP إنجاز!`, 'info');
  }
}

// Formats time strings from HH:MM format (24h) to localized 12h format with Arabic indicator
function fmt(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// Converts HH:MM string to total minutes
function toMin(t) {
  if (!t) return -1;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Converts total minutes back to HH:MM format
function fromMin(n) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

// Escapes HTML special characters
function escH(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Generates an empty session object
function mkSession() {
  return { days: [], startTime: '', endTime: '', timeMode: 'quick', activeSlot: null };
}

// Simple SHA-256 password hashing helper
async function hashPassword(pass) {
  const msgBuffer = new TextEncoder().encode(pass + 'tt-salt-2025');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Legacy localStorage helpers (kept for backward compat during migration) ───
function getUsers() {
  try { return JSON.parse(localStorage.getItem('tt_users') || '{}'); } catch (e) { return {}; }
}
function saveUsers(u) {
  localStorage.setItem('tt_users', JSON.stringify(u));
}
function getUserData(username) {
  try { return JSON.parse(localStorage.getItem('tt_data_' + username) || 'null'); } catch (e) { return null; }
}
function saveUserData(username, data) {
  localStorage.setItem('tt_data_' + username, JSON.stringify(data));
}

// ─── IndexedDB-backed save/load ───────────────────────────────────────────────

async function saveCurrentData() {
  if (!currentUser) return;

  // Write to IndexedDB
  if (window.DB) {
    await DB.timetable.save(currentUser, {
      branch: state.branch,
      subjects: state.subjects,
      studySubjects: studyState.subjects,
      aiProgress: aiProgress,
      autoTaskDone: autoTaskDoneStates
    });
    await DB.curriculum.save(currentUser, curriculumState.subjects);

    // Sync todos: clear and rewrite all (simple approach for now)
    await DB.todos.clearAll(currentUser);
    const allTodos = [
      ...todoItems,
      ...todoArchive.map(t => ({ ...t, done: true, archivedAt: t.archivedAt || Date.now() }))
    ];
    if (allTodos.length) {
      await DB.todos.bulkAdd(currentUser, allTodos);
    }

    // Update AI memory profile with latest state
    const branchNames = { math: 'علمي رياضة', science: 'علمي علوم' };
    await DB.aiMemory.updateProfile(currentUser, {
      name: currentUser,
      branch: state.branch ? (branchNames[state.branch] || state.branch) : undefined,
      lastActive: new Date().toISOString().split('T')[0]
    });
  }

  // Also keep a localStorage copy as fallback
  const data = {
    branch: state.branch,
    subjects: state.subjects,
    studySubjects: studyState.subjects,
    todos: todoItems,
    autoTaskDone: autoTaskDoneStates,
    todoArchive: todoArchive,
    curriculum: curriculumState.subjects,
    aiProgress: aiProgress,
    savedAt: Date.now()
  };
  saveUserData(currentUser, data);

  // Sync to Supabase cloud if connected
  if (window.SupaDB && SupaDB.isConnected()) {
    SupaDB.syncLocalToCloud(currentUser);
  }
}

async function loadUserData() {
  if (!currentUser) return;

  // Load per-user API key for currentUser
  geminiApiKey = getPerUserApiKey(currentUser);

  // Try Supabase Cloud first if connected
  if (window.SupaDB && SupaDB.isConnected()) {
    try {
      const supaTT = await SupaDB.getTimetable(currentUser);
      if (supaTT) {
        if (supaTT.branch) {
          state.branch = supaTT.branch;
          if (window.initTheme) window.initTheme(supaTT.branch);
        }
        if (supaTT.subjects?.length) state.subjects = supaTT.subjects;
        if (supaTT.studySubjects?.length) studyState.subjects = supaTT.studySubjects;
      }
      const supaCurr = await SupaDB.getCurriculum(currentUser);
      if (supaCurr?.subjects?.length) {
        curriculumState.subjects = supaCurr.subjects;
      }
      const supaTodos = await SupaDB.getTodos(currentUser);
      if (supaTodos?.length) {
        todoItems = supaTodos.filter(t => !t.done);
        todoArchive = supaTodos.filter(t => t.done);
      }
    } catch (err) {
      console.warn('Supabase Cloud load note:', err);
    }
  }

  // Try IndexedDB
  if (window.DB) {
    try {
      const [ttData, currData, todoData] = await Promise.all([
        DB.timetable.get(currentUser),
        DB.curriculum.get(currentUser),
        DB.todos.getAll(currentUser)
      ]);

      if (ttData) {
        if (ttData.branch) {
          state.branch = ttData.branch;
          if (window.initTheme) window.initTheme(ttData.branch);
        }
        if (ttData.subjects?.length) state.subjects = ttData.subjects;
        if (ttData.studySubjects?.length) studyState.subjects = ttData.studySubjects;
        autoTaskDoneStates = ttData.autoTaskDone || {};
        aiProgress = ttData.aiProgress || { studiedLessons: {}, lessonExams: {}, unitExams: {}, courseExams: {} };
      }

      if (currData?.subjects?.length) {
        const allowedSubjects = state.branch ? CURRICULUM_BRANCHES[state.branch].subjects : [];
        curriculumState.subjects = currData.subjects.filter(s => allowedSubjects.includes(s.name));
      }

      if (todoData?.length) {
        // Separate active todos from archived
        todoItems = todoData.filter(t => !t.archivedAt && !t.done);
        todoArchive = todoData.filter(t => t.archivedAt || (t.done && !todoItems.includes(t)));
        todoItems.forEach(item => {
          if (!item.date) item.date = timestampToKey(item.createdAt || Date.now());
        });
      }

      return; // Successfully loaded from IndexedDB
    } catch (e) {
      console.warn('DB load failed, falling back to localStorage:', e);
    }
  }

  // Fallback to localStorage
  const data = getUserData(currentUser);
  if (!data) return;
  if (data.branch) {
    state.branch = data.branch;
    if (window.initTheme) window.initTheme(data.branch);
  }
  if (data.subjects?.length) state.subjects = data.subjects;
  if (data.studySubjects?.length) studyState.subjects = data.studySubjects;
  autoTaskDoneStates = data.autoTaskDone || {};
  todoArchive = data.todoArchive || [];
  if (data.todos?.length) {
    todoItems = data.todos;
    todoItems.forEach(item => {
      if (!item.date) item.date = timestampToKey(item.createdAt || Date.now());
    });
  } else {
    todoItems = [];
  }
  if (data.curriculum?.length) {
    const allowedSubjects = state.branch ? CURRICULUM_BRANCHES[state.branch].subjects : [];
    curriculumState.subjects = data.curriculum.filter(s => allowedSubjects.includes(s.name));
  }
  if (data.aiProgress) {
    aiProgress = data.aiProgress;
  } else {
    aiProgress = { studiedLessons: {}, lessonExams: {}, unitExams: {}, courseExams: {} };
  }
}

// Toast System
function showToast(msg, type = 'error') {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'success' ? ' success' : type === 'info' ? ' info' : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('hiding');
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

// Auth Guard — simple, reliable, localStorage = source of truth
async function initAuthGuard() {
  const isAuthPage = location.pathname.includes('auth.html');
  const isOAuthCallback = location.search.includes('code=') || location.hash.includes('access_token=');
  const isLoggedOut = sessionStorage.getItem('tt_logged_out') === 'true';
  let user = localStorage.getItem('tt_current_user');

  // If user is returning from OAuth callback, clear logged out flag
  if (isOAuthCallback) {
    sessionStorage.removeItem('tt_logged_out');
  }

  // Check Supabase session ONLY if not explicitly logged out or if returning from OAuth callback
  if (window.SupaDB && (!isLoggedOut || isOAuthCallback)) {
    SupaDB.init();
    if (SupaDB.client) {
      try {
        if (isOAuthCallback) {
          // Poll for session exchange (up to 3 seconds)
          for (let i = 0; i < 15; i++) {
            const { data: { session } } = await SupaDB.client.auth.getSession();
            if (session && session.user) {
              const res = await SupaDB.handleAuthCallback(session);
              if (res) user = res.email;
              break;
            }
            await new Promise(r => setTimeout(r, 200));
          }
        } else if (user) {
          const { data: { session } } = await SupaDB.client.auth.getSession();
          if (session && session.user) {
            const res = await SupaDB.handleAuthCallback(session);
            if (res) user = res.email;
          }
        }
      } catch (e) {
        console.warn('Auth guard session check:', e);
      }
    }
  }

  // Init IndexedDB
  if (window.DB) await DB.init();

  // Route decision
  if (isAuthPage) {
    if (user && !isLoggedOut) {
      location.href = 'dashboard.html';
    }
  } else {
    if (!user || isLoggedOut) {
      const prefix = location.pathname.includes('/ai/') ? '../' : '';
      location.href = prefix + 'auth.html';
    } else {
      currentUser = user;
      await loadUserData();
    }
  }
}

// Dynamic UI Injection
function injectBlobs() {
  const container = document.createElement('div');
  container.className = 'blobs';
  container.setAttribute('aria-hidden', 'true');
  container.innerHTML = `
    <div class="blob blob1" id="blob1" style="background:#3b6ef8"></div>
    <div class="blob blob2" id="blob2" style="background:#8b5cf6"></div>
    <div class="blob blob3" id="blob3" style="background:#06b6d4"></div>
  `;
  document.body.insertBefore(container, document.body.firstChild);
}

function injectCanvas() {
  const canvas = document.createElement('canvas');
  canvas.id = 'themedCanvas';
  document.body.insertBefore(canvas, document.body.firstChild);
}

function injectThemeToggle() {
  const btn = document.createElement('button');
  btn.className = 'theme-toggle';
  btn.id = 'themeToggle';
  btn.title = 'تبديل الوضع الليلي/النهاري';
  btn.onclick = toggleTheme;
  btn.textContent = localStorage.getItem('tt_theme') === 'day' ? '☀️' : '🌙';
  document.body.appendChild(btn);
}

function injectBottomNav() {
  const isAuthPage = location.pathname.includes('auth.html');
  if (isAuthPage) return;

  const existingNav = document.getElementById('bottomNav');
  if (existingNav) existingNav.remove();

  const isAI = location.pathname.includes('/ai/');
  const rootPrefix = isAI ? '../' : '';
  const aiPrefix = 'ai/';

  const nav = document.createElement('nav');
  nav.id = 'bottomNav';
  nav.className = 'visible';
  nav.innerHTML = `
    <button class="nav-btn" id="navDashboard" onclick="location.href='${rootPrefix}dashboard.html'">
      <span class="nav-icon">📊</span>لوحة التحكم
    </button>
    <button class="nav-btn" id="navTimetable" onclick="location.href='${rootPrefix}index.html'">
      <span class="nav-icon">📅</span>الجدول
    </button>
    <button class="nav-btn" id="navTodo" onclick="location.href='${rootPrefix}todo.html'">
      <span class="nav-icon">✅</span>المهام
    </button>
    <button class="nav-btn" id="navCurriculum" onclick="location.href='${rootPrefix}curriculum.html'">
      <span class="nav-icon">📚</span>المنهج
    </button>
    <button class="nav-btn" id="navReview" onclick="location.href='${rootPrefix}review.html'">
      <span class="nav-icon">🔍</span>المراجعة
    </button>
    <button class="nav-btn" id="navAI" onclick="location.href='${rootPrefix}${aiPrefix}chat.html'">
      <span class="nav-icon">🤖</span>المساعد
    </button>
    <button class="nav-btn" id="navProfile" onclick="location.href='${rootPrefix}profile.html'">
      <span class="nav-icon">👤</span>الملف
    </button>
  `;
  document.body.appendChild(nav);

  // Set active class based on path
  const path = location.pathname.split('/').pop() || 'dashboard.html';
  if (path === 'dashboard.html' || path === '') {
    const b = document.getElementById('navDashboard');
    if (b) b.classList.add('active');
  } else if (path === 'index.html') {
    const b = document.getElementById('navTimetable');
    if (b) b.classList.add('active');
  } else if (path === 'todo.html') {
    const b = document.getElementById('navTodo');
    if (b) b.classList.add('active');
  } else if (path === 'curriculum.html') {
    const b = document.getElementById('navCurriculum');
    if (b) b.classList.add('active');
  } else if (path === 'review.html') {
    const b = document.getElementById('navReview');
    if (b) b.classList.add('active');
  } else if (path === 'chat.html' || path === 'exam.html') {
    const b = document.getElementById('navAI');
    if (b) b.classList.add('active');
  } else if (path === 'profile.html') {
    const b = document.getElementById('navProfile');
    if (b) b.classList.add('active');
  }
}

function toggleTheme() {
  const isDay = document.body.classList.toggle('day-mode');
  localStorage.setItem('tt_theme', isDay ? 'day' : 'night');
  document.getElementById('themeToggle').textContent = isDay ? '☀️' : '🌙';
  if (state.branch && window.initTheme) window.initTheme(state.branch);
}

function initSavedTheme() {
  const saved = localStorage.getItem('tt_theme');
  if (saved === 'day') {
    document.body.classList.add('day-mode');
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.textContent = '☀️';
  }
}

// Date helpers
function dateToKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function timestampToKey(timestamp) {
  return dateToKey(new Date(timestamp));
}

function getTodayKey() {
  return dateToKey(new Date());
}

// Gemini API helper — supports AI memory injection & auto-normalizes contents format
async function callGemini(contents, systemInstruction = '', responseMimeType = '') {
  if (!geminiApiKey) {
    showToast('⚠️ يرجى إدخال مفتاح Gemini API أولاً في الملف الشخصي أو قسم المساعد');
    throw new Error('API Key Missing');
  }

  // 1. Normalize contents format for Gemini API
  let formattedContents = [];
  if (typeof contents === 'string') {
    formattedContents = [{ role: 'user', parts: [{ text: contents }] }];
  } else if (Array.isArray(contents)) {
    if (contents.length > 0 && contents[0].role) {
      formattedContents = contents;
    } else if (contents.length > 0 && (contents[0].text || contents[0].inline_data)) {
      formattedContents = [{ role: 'user', parts: contents }];
    } else {
      formattedContents = [{ role: 'user', parts: [{ text: String(contents) }] }];
    }
  } else if (contents && typeof contents === 'object') {
    if (contents.role) {
      formattedContents = [contents];
    } else if (contents.text) {
      formattedContents = [{ role: 'user', parts: [contents] }];
    }
  }

  // 2. Normalize system instruction
  let sysText = '';
  if (typeof systemInstruction === 'string') {
    sysText = systemInstruction;
  } else if (Array.isArray(systemInstruction)) {
    sysText = systemInstruction.map(p => typeof p === 'string' ? p : (p.text || '')).join('\n');
  } else if (systemInstruction && systemInstruction.text) {
    sysText = systemInstruction.text;
  }

  // Append AI memory context to system instruction if available
  let enrichedSystem = sysText;
  if (currentUser && window.DB && window.DB.aiMemory) {
    try {
      const memCtx = await DB.aiMemory.buildContextString(currentUser);
      if (memCtx) enrichedSystem = sysText + '\n' + memCtx;
    } catch (e) {
      // Non-fatal — continue without memory
    }
  }

  // Free & Available models (as of Aug 2026) — fallback in order
  const models = [
    'gemini-3.6-flash',    // Latest stable — fastest & free
    'gemini-3.5-flash',    // Stable fallback
    'gemini-2.5-flash',    // Older stable fallback
  ];
  let lastError = null;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    const body = { contents: formattedContents };

    if (enrichedSystem && enrichedSystem.trim()) {
      body.systemInstruction = { parts: [{ text: enrichedSystem.trim() }] };
    }
    if (typeof responseMimeType === 'string' && responseMimeType.includes('application/json')) {
      body.generationConfig = { responseMimeType: 'application/json' };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || response.statusText;
        throw new Error(errMsg);
      }

      const resData = await response.json();
      const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('استجابة فارغة من الذكاء الاصطناعي');
      return text;
    } catch (err) {
      console.warn(`Failed with model ${model}:`, err.message);
      lastError = err;
      const lowerErr = err.message.toLowerCase();
      // Auto-fallback if model is unavailable, deprecated or not found
      const shouldFallback = lowerErr.includes('not found')
        || lowerErr.includes('not supported')
        || lowerErr.includes('404')
        || lowerErr.includes('no longer available')
        || lowerErr.includes('deprecated')
        || lowerErr.includes('user_location_invalid')
        || lowerErr.includes('unavailable');
      if (shouldFallback) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('فشلت جميع محاولات الاتصال بالنماذج المتاحة');
}

function cleanAndParseJSON(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '').trim();
  }
  return JSON.parse(cleaned);
}

// Ripple Effect
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const btn = e.target.closest('button, .action-btn, .build-btn, .study-save-btn, .auth-btn');
    if (!btn) return;
    const r = document.createElement('span');
    r.className = 'ripple-effect';
    const rect = btn.getBoundingClientRect();
    const sz = Math.max(rect.width, rect.height);
    r.style.cssText = `width:${sz}px;height:${sz}px;top:${e.clientY - rect.top - sz / 2}px;left:${e.clientX - rect.left - sz / 2}px`;
    btn.appendChild(r);
    setTimeout(() => r.remove(), 700);
  });
});

// Self Initialization — async-safe and exposes appReady promise
window.appReady = (async () => {
  await new Promise(resolve => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve);
    } else {
      resolve();
    }
  });

  injectBlobs();
  injectCanvas();
  injectThemeToggle();
  injectBottomNav();
  initSavedTheme();
  await initAuthGuard();
})();
