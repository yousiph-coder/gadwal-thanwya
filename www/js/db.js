/**
 * MendelDB — IndexedDB Wrapper
 * Central database layer for all app data.
 * Replaces scattered localStorage keys with structured object stores.
 *
 * Stores:
 *   users        → { username(pk), passwordHash, createdAt }
 *   timetable    → { username(pk), branch, subjects, studySubjects, updatedAt }
 *   curriculum   → { username(pk), subjects, updatedAt }
 *   todos        → { id(pk,auto), username, text, done, date, createdAt, archivedAt? }
 *   ai_memory    → { username(pk), profile{}, summaries[], updatedAt }
 *   ai_chat_log  → { id(pk,auto), username, role, text, timestamp }
 *   ai_exam_log  → { id(pk,auto), username, subject, score, total, date }
 */

const DB_NAME = 'MendelDB';
const DB_VERSION = 1;

let _db = null;

// ─────────────────────────────────────────────
// Core: Open / Upgrade
// ─────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      // users store
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'username' });
      }

      // timetable store (one record per user)
      if (!db.objectStoreNames.contains('timetable')) {
        db.createObjectStore('timetable', { keyPath: 'username' });
      }

      // curriculum store (one record per user)
      if (!db.objectStoreNames.contains('curriculum')) {
        db.createObjectStore('curriculum', { keyPath: 'username' });
      }

      // todos store (many records per user)
      if (!db.objectStoreNames.contains('todos')) {
        const todoStore = db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true });
        todoStore.createIndex('by_username', 'username', { unique: false });
        todoStore.createIndex('by_date', ['username', 'date'], { unique: false });
      }

      // AI Memory (one record per user)
      if (!db.objectStoreNames.contains('ai_memory')) {
        db.createObjectStore('ai_memory', { keyPath: 'username' });
      }

      // AI Chat Log (many per user)
      if (!db.objectStoreNames.contains('ai_chat_log')) {
        const chatStore = db.createObjectStore('ai_chat_log', { keyPath: 'id', autoIncrement: true });
        chatStore.createIndex('by_username', 'username', { unique: false });
        chatStore.createIndex('by_username_time', ['username', 'timestamp'], { unique: false });
      }

      // AI Exam Log (many per user)
      if (!db.objectStoreNames.contains('ai_exam_log')) {
        const examStore = db.createObjectStore('ai_exam_log', { keyPath: 'id', autoIncrement: true });
        examStore.createIndex('by_username', 'username', { unique: false });
      }
    };

    req.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    req.onerror = (event) => {
      console.error('MendelDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ─────────────────────────────────────────────
// Generic helpers
// ─────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

function getAll(storeName, indexName, query) {
  const store = tx(storeName, 'readonly');
  const source = indexName ? store.index(indexName) : store;
  return promisifyRequest(source.getAll(query));
}

function getOne(storeName, key) {
  return promisifyRequest(tx(storeName, 'readonly').get(key));
}

function putOne(storeName, value) {
  return promisifyRequest(tx(storeName, 'readwrite').put(value));
}

function deleteOne(storeName, key) {
  return promisifyRequest(tx(storeName, 'readwrite').delete(key));
}

// ─────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────

const users = {
  async get(username) {
    await openDB();
    return getOne('users', username);
  },
  async put(userObj) {
    await openDB();
    return putOne('users', userObj);
  },
  async getAll() {
    await openDB();
    return getAll('users');
  }
};

// ─────────────────────────────────────────────
// Timetable (branch + subjects + study config)
// ─────────────────────────────────────────────

const timetable = {
  async get(username) {
    await openDB();
    return getOne('timetable', username);
  },
  async save(username, data) {
    await openDB();
    return putOne('timetable', { username, ...data, updatedAt: Date.now() });
  }
};

// ─────────────────────────────────────────────
// Curriculum
// ─────────────────────────────────────────────

const curriculum = {
  async get(username) {
    await openDB();
    return getOne('curriculum', username);
  },
  async save(username, subjectsArray) {
    await openDB();
    return putOne('curriculum', { username, subjects: subjectsArray, updatedAt: Date.now() });
  }
};

// ─────────────────────────────────────────────
// Todos
// ─────────────────────────────────────────────

const todos = {
  async getAll(username) {
    await openDB();
    return getAll('todos', 'by_username', username);
  },
  async add(username, todoObj) {
    await openDB();
    const record = { username, ...todoObj, createdAt: todoObj.createdAt || Date.now() };
    return promisifyRequest(tx('todos', 'readwrite').add(record));
  },
  async update(todoObj) {
    await openDB();
    return putOne('todos', todoObj);
  },
  async delete(id) {
    await openDB();
    return deleteOne('todos', id);
  },
  async clearAll(username) {
    await openDB();
    const all = await this.getAll(username);
    const store = tx('todos', 'readwrite');
    return Promise.all(all.map(t => promisifyRequest(store.delete(t.id))));
  },
  async bulkAdd(username, todoArray) {
    await openDB();
    const store = tx('todos', 'readwrite');
    return Promise.all(todoArray.map(t => promisifyRequest(store.put({ username, ...t }))));
  }
};

// ─────────────────────────────────────────────
// AI Memory
// ─────────────────────────────────────────────

const aiMemory = {
  async get(username) {
    await openDB();
    return getOne('ai_memory', username);
  },
  async save(username, memObj) {
    await openDB();
    return putOne('ai_memory', { username, ...memObj, updatedAt: Date.now() });
  },
  /**
   * Build a rich system-prompt snippet from stored memory.
   * Injected into every Gemini call to give AI context about the student.
   */
  async buildContextString(username) {
    const mem = await this.get(username);
    if (!mem) return '';

    const p = mem.profile || {};
    const summaries = mem.summaries || [];

    let ctx = `\n\n--- معلومات الطالب المحفوظة ---\n`;
    if (p.name)              ctx += `الاسم: ${p.name}\n`;
    if (p.branch)            ctx += `الشعبة: ${p.branch}\n`;
    if (p.weakSubjects?.length)   ctx += `المواد الصعبة عليه: ${p.weakSubjects.join('، ')}\n`;
    if (p.strongSubjects?.length) ctx += `المواد القوية: ${p.strongSubjects.join('، ')}\n`;
    if (p.studyHoursPerDay)  ctx += `ساعات المذاكرة اليومية: ${p.studyHoursPerDay}\n`;
    if (p.lastActive)        ctx += `آخر نشاط: ${p.lastActive}\n`;
    if (summaries.length) {
      ctx += `\nملاحظات مهمة عن الطالب:\n`;
      summaries.slice(-5).forEach(s => { ctx += `- ${s}\n`; });
    }
    ctx += `--- نهاية معلومات الطالب ---`;
    return ctx;
  },
  /** Update profile fields (merges with existing) */
  async updateProfile(username, profileFields) {
    const existing = await this.get(username) || { profile: {}, summaries: [] };
    existing.profile = { ...(existing.profile || {}), ...profileFields };
    return this.save(username, existing);
  },
  /** Append a new summary note (keeps last 20) */
  async addSummary(username, summaryText) {
    const existing = await this.get(username) || { profile: {}, summaries: [] };
    existing.summaries = [...(existing.summaries || []), summaryText].slice(-20);
    return this.save(username, existing);
  },
  async getSummaryText(username) {
    const mem = await this.get(username);
    if (!mem) return '';
    const summaries = mem.summaries || [];
    if (!summaries.length) return '';
    return summaries.slice(-5).map(s => `- ${s}`).join('\n');
  }
};

// ─────────────────────────────────────────────
// AI Chat Log
// ─────────────────────────────────────────────

const chatLog = {
  async getRecent(username, limit = 60) {
    await openDB();
    const all = await getAll('ai_chat_log', 'by_username', username);
    return all.slice(-limit);
  },
  async append(username, role, text) {
    await openDB();
    return promisifyRequest(
      tx('ai_chat_log', 'readwrite').add({
        username, role, text, timestamp: Date.now()
      })
    );
  },
  async clearAll(username) {
    await openDB();
    const all = await this.getRecent(username, 99999);
    const store = tx('ai_chat_log', 'readwrite');
    return Promise.all(all.map(m => promisifyRequest(store.delete(m.id))));
  }
};

// ─────────────────────────────────────────────
// AI Exam Log
// ─────────────────────────────────────────────

const examLog = {
  async getAll(username) {
    await openDB();
    return getAll('ai_exam_log', 'by_username', username);
  },
  async add(username, subject, score, total) {
    await openDB();
    return promisifyRequest(
      tx('ai_exam_log', 'readwrite').add({
        username, subject, score, total, date: Date.now()
      })
    );
  }
};

// ─────────────────────────────────────────────
// Migration: localStorage → IndexedDB
// Runs once, then sets a flag to skip next time.
// ─────────────────────────────────────────────

async function migrateFromLocalStorage() {
  if (localStorage.getItem('tt_db_migrated') === '1') return;

  console.log('MendelDB: Starting migration from localStorage...');

  try {
    await openDB();

    // Migrate users
    let lsUsers = {};
    try { lsUsers = JSON.parse(localStorage.getItem('tt_users') || '{}'); } catch (e) {}
    for (const [uname, udata] of Object.entries(lsUsers)) {
      await users.put({ username: uname, passwordHash: udata.password, createdAt: udata.createdAt || Date.now() });
    }

    // Migrate per-user data
    for (const uname of Object.keys(lsUsers)) {
      let udata = null;
      try { udata = JSON.parse(localStorage.getItem('tt_data_' + uname) || 'null'); } catch (e) {}
      if (!udata) continue;

      // timetable
      if (udata.branch || udata.subjects?.length) {
        await timetable.save(uname, {
          branch: udata.branch || null,
          subjects: udata.subjects || [],
          studySubjects: udata.studySubjects || [],
          aiProgress: udata.aiProgress || {}
        });
      }

      // curriculum
      if (udata.curriculum?.length) {
        await curriculum.save(uname, udata.curriculum);
      }

      // todos
      if (udata.todos?.length) {
        await todos.bulkAdd(uname, udata.todos);
      }
      if (udata.todoArchive?.length) {
        await todos.bulkAdd(uname, udata.todoArchive.map(t => ({ ...t, done: true, archivedAt: t.archivedAt || Date.now() })));
      }

      // seed AI memory from branch info
      if (udata.branch) {
        const branchNames = { math: 'علمي رياضة', science: 'علمي علوم' };
        await aiMemory.updateProfile(uname, {
          name: uname,
          branch: branchNames[udata.branch] || udata.branch,
          lastActive: new Date().toISOString().split('T')[0]
        });
      }
    }

    localStorage.setItem('tt_db_migrated', '1');
    console.log('MendelDB: Migration complete ✅');
  } catch (err) {
    console.error('MendelDB: Migration error:', err);
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

const DB = {
  init: async () => {
    await openDB();
    await migrateFromLocalStorage();
  },
  users,
  timetable,
  curriculum,
  todos,
  aiMemory,
  chatLog,
  examLog
};

// Make globally available
window.DB = DB;
