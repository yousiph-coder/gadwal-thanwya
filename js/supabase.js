/**
 * Supabase Integration Layer for Mendel App
 * Enterprise-grade Auth (Google OAuth, Email, Phone OTP) + Cloud Database
 * Each user is identified by their unique email address.
 */

const DEFAULT_SUPABASE_URL = 'https://cnqqkyvutugyuepttypx.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_jzxJmdj6c5Ur0sMi-YWt6g_5zejk8Oi';

const SupaDB = {
  client: null,
  url: localStorage.getItem('tt_supabase_url') || DEFAULT_SUPABASE_URL,
  key: localStorage.getItem('tt_supabase_key') || DEFAULT_SUPABASE_KEY,

  // ─────────────────────────────────────────────
  // Core: Initialize Supabase Client
  // ─────────────────────────────────────────────
  init(url, key) {
    if (this.client) return true; // Already initialized

    if (url && key) {
      this.url = url.trim();
      this.key = key.trim();
      localStorage.setItem('tt_supabase_url', this.url);
      localStorage.setItem('tt_supabase_key', this.key);
    } else {
      const storedUrl = localStorage.getItem('tt_supabase_url');
      const storedKey = localStorage.getItem('tt_supabase_key');
      this.url = (storedUrl && storedUrl.trim()) ? storedUrl.trim() : DEFAULT_SUPABASE_URL;
      this.key = (storedKey && storedKey.trim()) ? storedKey.trim() : DEFAULT_SUPABASE_KEY;
    }

    const createFn = (window.supabase && window.supabase.createClient) || window.createClient || (window.supabaseClient && window.supabaseClient.createClient);

    if (this.url && this.key && createFn) {
      try {
        this.client = createFn(this.url, this.key, {
          auth: {
            flowType: 'implicit',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true
          }
        });

        // Global session listener
        this.client.auth.onAuthStateChange(async (event, session) => {
          if (session && session.user) {
            await this.handleAuthCallback(session);
          }
        });

        console.log('⚡ Supabase connected (implicit flow):', this.url);
        return true;
      } catch (err) {
        console.error('❌ Supabase init failed:', err);
        this.lastError = err.message;
        return false;
      }
    }
    this.lastError = !createFn ? 'Supabase SDK not loaded' : 'Missing credentials';
    return false;
  },

  isConfigured() { return !!(this.url && this.key); },
  isConnected() { if (!this.client) this.init(); return !!this.client; },

  // ═════════════════════════════════════════════
  //  AUTH: Google OAuth, Email, Phone
  // ═════════════════════════════════════════════

  /**
   * Google Sign-In — redirects to Google, then back to auth.html
   * with #access_token in the URL (implicit flow).
   */
  async signInWithGoogle() {
    if (!this.client) this.init();
    if (!this.client) return { error: { message: 'Supabase غير متصل' } };
    try {
      const { data, error } = await this.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/auth.html',
          queryParams: { prompt: 'select_account' }
        }
      });
      return { data, error };
    } catch (err) {
      return { error: err };
    }
  },

  /**
   * Central callback handler — called when any auth session is established.
   * Extracts email as unique key, saves to localStorage, upserts user row.
   */
  async handleAuthCallback(session) {
    if (!session || !session.user) return null;

    const email = (session.user.email || session.user.id).toLowerCase();
    const displayName = session.user.user_metadata?.full_name
                     || session.user.user_metadata?.name
                     || session.user.user_metadata?.username
                     || email.split('@')[0];

    // Save to localStorage (source of truth for auth guard)
    localStorage.setItem('tt_current_user', email);
    localStorage.setItem('tt_display_name', displayName);
    if (session.user.id) localStorage.setItem('tt_supabase_uid', session.user.id);

    console.log('✅ Auth callback: user =', email, '| name =', displayName);

    // Upsert user row in public.users table
    if (this.client) {
      try {
        await this.client.from('users').upsert({
          username: email,
          display_name: displayName,
          password_hash: 'GOOGLE_OAUTH',
          created_at: new Date().toISOString()
        }, { onConflict: 'username' });
      } catch (e) {
        console.warn('User upsert note:', e.message);
      }
    }

    return { email, displayName };
  },

  /** Email + Password Sign Up */
  async signUp(email, password, username) {
    if (!this.client) return { error: { message: 'Supabase غير متصل' } };
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await this.client.auth.signUp({
        email: cleanEmail,
        password: password,
        options: { data: { username: (username || cleanEmail.split('@')[0]).trim() } }
      });
      return { data, error };
    } catch (err) {
      return { error: err };
    }
  },

  /** Email + Password Sign In */
  async signIn(email, password) {
    if (!this.client) return { error: { message: 'Supabase غير متصل' } };
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await this.client.auth.signInWithPassword({
        email: cleanEmail, password: password
      });
      return { data, error };
    } catch (err) {
      return { error: err };
    }
  },

  /** Phone OTP */
  async sendPhoneOTP(phone) {
    if (!this.client) return { error: { message: 'Supabase غير متصل' } };
    try {
      let p = phone.trim();
      if (!p.startsWith('+')) {
        if (p.startsWith('0')) p = p.substring(1);
        p = '+20' + p;
      }
      const { data, error } = await this.client.auth.signInWithOtp({ phone: p });
      return { data, error, phone: p };
    } catch (err) {
      return { error: err };
    }
  },

  async verifyPhoneOTP(phone, code) {
    if (!this.client) return { error: { message: 'Supabase غير متصل' } };
    try {
      const { data, error } = await this.client.auth.verifyOtp({
        phone: phone.trim(), token: code.trim(), type: 'sms'
      });
      return { data, error };
    } catch (err) {
      return { error: err };
    }
  },

  /** Get current Supabase Auth user */
  async getCurrentUser() {
    if (!this.client) return null;
    try {
      const { data: { user } } = await this.client.auth.getUser();
      return user;
    } catch (err) {
      return null;
    }
  },

  /** Sign Out — clears all session keys and Supabase tokens synchronously */
  async signOut() {
    sessionStorage.setItem('tt_logged_out', 'true');

    // 1. Synchronously clear all localStorage keys related to user and Supabase auth
    try {
      localStorage.removeItem('tt_current_user');
      localStorage.removeItem('tt_supabase_uid');
      localStorage.removeItem('tt_display_name');

      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('auth-token') || key.startsWith('supabase.')) {
          localStorage.removeItem(key);
        }
      });
    } catch(e) {}

    // 2. Call Supabase API signout
    if (this.client && this.client.auth) {
      try {
        await this.client.auth.signOut().catch(() => {});
      } catch (err) {}
    }

    console.log('🔓 Signed out — all session keys & tokens wiped');
  },

  // ═════════════════════════════════════════════
  //  DATABASE: Users, Timetable, Curriculum, Todos, AI Memory
  // ═════════════════════════════════════════════

  async getUser(username) {
    if (!this.client || !username) return null;
    try {
      const { data, error } = await this.client.from('users').select('*').eq('username', username).maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('SupaDB getUser error:', err);
      return null;
    }
  },

  // ── Timetable ──
  async saveTimetable(username, data) {
    if (!this.client || !username) return null;
    try {
      const payload = {
        username: username,
        branch: data.branch || null,
        subjects: data.subjects || [],
        study_subjects: data.studySubjects || [],
        updated_at: new Date().toISOString()
      };
      const { data: res, error } = await this.client.from('timetable').upsert(payload, { onConflict: 'username' }).select();
      if (error) throw error;
      return res ? res[0] : null;
    } catch (err) {
      console.error('SupaDB saveTimetable error:', err);
      return null;
    }
  },

  async getTimetable(username) {
    if (!this.client || !username) return null;
    try {
      const { data, error } = await this.client.from('timetable').select('*').eq('username', username).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { username: data.username, branch: data.branch, subjects: data.subjects || [], studySubjects: data.study_subjects || [], updatedAt: data.updated_at };
    } catch (err) {
      console.error('SupaDB getTimetable error:', err);
      return null;
    }
  },

  // ── Curriculum ──
  async saveCurriculum(username, subjects) {
    if (!this.client || !username) return null;
    try {
      const { data, error } = await this.client.from('curriculum').upsert({ username, subjects: subjects || [], updated_at: new Date().toISOString() }, { onConflict: 'username' });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('SupaDB saveCurriculum error:', err);
      return null;
    }
  },

  async getCurriculum(username) {
    if (!this.client || !username) return null;
    try {
      const { data, error } = await this.client.from('curriculum').select('*').eq('username', username).maybeSingle();
      if (error) throw error;
      return data ? data.subjects : null;
    } catch (err) {
      console.error('SupaDB getCurriculum error:', err);
      return null;
    }
  },

  // ── Todos ──
  async addTodo(username, todo) {
    if (!this.client || !username) return null;
    try {
      const { data, error } = await this.client.from('todos').insert({ username, text: todo.text, done: !!todo.done, date: todo.date, created_at: new Date().toISOString() }).select();
      if (error) throw error;
      return data ? data[0] : null;
    } catch (err) {
      console.error('SupaDB addTodo error:', err);
      return null;
    }
  },

  async getTodos(username) {
    if (!this.client || !username) return [];
    try {
      const { data, error } = await this.client.from('todos').select('*').eq('username', username).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('SupaDB getTodos error:', err);
      return [];
    }
  },

  async updateTodo(id, updates) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client.from('todos').update(updates).eq('id', id);
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('SupaDB updateTodo error:', err);
      return null;
    }
  },

  // ── AI Memory ──
  async saveAIMemory(username, memoryData) {
    if (!this.client || !username) return null;
    try {
      const { data, error } = await this.client.from('ai_memory').upsert({ username, profile: memoryData.profile || {}, summaries: memoryData.summaries || [], updated_at: new Date().toISOString() }, { onConflict: 'username' });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('SupaDB saveAIMemory error:', err);
      return null;
    }
  },

  async getAIMemory(username) {
    if (!this.client || !username) return null;
    try {
      const { data, error } = await this.client.from('ai_memory').select('*').eq('username', username).maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('SupaDB getAIMemory error:', err);
      return null;
    }
  },

  // ── Cloud Sync (IndexedDB → Supabase) ──
  async syncLocalToCloud(username) {
    if (!this.client || !username) return false;
    try {
      if (typeof DB !== 'undefined' && DB.timetable) {
        const tt = await DB.timetable.get(username);
        if (tt) await this.saveTimetable(username, tt);
      }
      if (typeof DB !== 'undefined' && DB.curriculum) {
        const curr = await DB.curriculum.get(username);
        if (curr) await this.saveCurriculum(username, curr.subjects);
      }
      if (typeof DB !== 'undefined' && DB.aiMemory) {
        const mem = await DB.aiMemory.get(username);
        if (mem) await this.saveAIMemory(username, mem);
      }
      console.log('✅ Local → Cloud sync complete');
      return true;
    } catch (err) {
      console.error('❌ Sync failed:', err);
      return false;
    }
  }
};

// Auto-initialize on script load
document.addEventListener('DOMContentLoaded', () => {
  SupaDB.init();
});
