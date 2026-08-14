/* =========================================================
   Hassan Nassar Jewelry — Authenticated Shared Cloud Data Engine
   ---------------------------------------------------------
   - Firebase Authentication is the access gate for every module.
   - Firestore is the primary cloud database for the whole shop.
   - All approved users share the same shop dataset (shop_data), while
     every write is stamped with the authenticated user for auditing.
   - Offline Firestore persistence remains enabled when supported.
   - Optional local folder mirror remains available.
   - exportAll()/importAll() cover every dataset used by the application.
========================================================= */
(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyAQMILfvEzLXxUKYbScldvKTHKQEk4PpN4",
    authDomain: "hassan-nassar-license.firebaseapp.com",
    projectId: "hassan-nassar-license",
    storageBucket: "hassan-nassar-license.firebasestorage.app",
    messagingSenderId: "381313051649",
    appId: "1:381313051649:web:ef6e6667f691848c3c6400",
    measurementId: "G-E939CTWF3W"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const fsdb = firebase.firestore();

  try {
    fsdb.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
      console.warn('Firestore offline persistence:', err && err.code ? err.code : err);
    });
  } catch (e) {}

  const SHOP_NAME = 'مجوهرات حسن نصار';
  const DATA_COLLECTION = 'shop_data';
  const ACTIVITY_COLLECTION = 'activity_log';
  const DATA_DEFAULTS = { settings:{}, inventory:[], customers:[], suppliers:[], safe:[], goldsmiths:[], goldsmith_tx:[], invoices:[], returns:[], layaway:[], repairs:[], old_gold:[], opex:[], workshop_loss:[], credit_ledger:[], silver_prices:{p999:0,p925:0,p800:0}, users:[], audit_log:[] };
  const DATA_KEYS = [
    'settings','inventory','customers','suppliers','safe','goldsmiths','goldsmith_tx',
    'invoices','returns','layaway','repairs','old_gold','opex','workshop_loss',
    'credit_ledger','silver_prices','users','audit_log'
  ];

  let authReadyPromise = null;
  function waitForAuth() {
    if (authReadyPromise) return authReadyPromise;
    authReadyPromise = new Promise(function(resolve) {
      if (!firebase.auth) { resolve(null); return; }
      const unsubscribe = firebase.auth().onAuthStateChanged(function(user) {
        unsubscribe();
        resolve(user || null);
      });
    });
    return authReadyPromise;
  }

  async function requireUser(redirectIfMissing) {
    const user = await waitForAuth();
    if (user) return user;
    if (redirectIfMissing !== false) {
      const file = (location.pathname.split('/').pop() || '').toLowerCase();
      if (file && file !== 'index.html') {
        try { location.replace('index.html'); } catch (e) {}
      }
    }
    throw new Error('AUTH_REQUIRED');
  }

  function currentUser() {
    try {
      const authUser = firebase.auth && firebase.auth().currentUser;
      const raw = localStorage.getItem('hn_current_user');
      const profile = raw ? JSON.parse(raw) : {};
      return {
        uid: (authUser && authUser.uid) || profile.uid || '',
        name: profile.name || (authUser && authUser.displayName) || 'غير معروف',
        phone: profile.phone || '',
        email: (authUser && authUser.email) || ''
      };
    } catch (e) { return { uid:'', name:'غير معروف', phone:'', email:'' }; }
  }

  function ensureOfflineBanner() {
    if (!document.body || document.getElementById('hnOfflineBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'hnOfflineBanner';
    bar.style.cssText = 'display:none;position:sticky;top:0;z-index:99998;background:#3a1414;color:#FF9791;text-align:center;font-size:12.5px;padding:8px;border-bottom:1px solid rgba(255,105,97,.4);font-family:inherit;';
    bar.textContent = '🔴 وضع عدم اتصال — البيانات محفوظة محلياً داخل Firestore وسيتم مزامنتها تلقائياً عند عودة الإنترنت';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function updateOfflineBanner() {
    ensureOfflineBanner();
    const bar = document.getElementById('hnOfflineBanner');
    if (bar) bar.style.display = navigator.onLine ? 'none' : 'block';
  }
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  document.addEventListener('DOMContentLoaded', updateOfflineBanner);

  async function logActivity(action, key, extra) {
    try {
      const u = currentUser();
      await fsdb.collection(ACTIVITY_COLLECTION).add({
        action: action || 'write', key: key || '',
        user: u.name || 'غير معروف', phone: u.phone || '', email: u.email || '', uid: u.uid || '',
        page: location.pathname.split('/').pop(),
        at: firebase.firestore.FieldValue.serverTimestamp(),
        meta: extra || null
      });
    } catch (e) {
      console.warn('activity log skipped:', e);
    }
  }

  const DB = {
    supported: 'showDirectoryPicker' in window,
    dirHandle: null,
    shopHandle: null,
    connected: false,
    DATA_KEYS: DATA_KEYS.slice(),

    async pickFolder() {
      if (!this.supported) {
        alert('المتصفح لا يدعم اختيار مجلد. البيانات الأساسية محفوظة سحابياً على Firebase، وهذا المجلد اختياري فقط.');
        return true;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode:'readwrite' });
        this.dirHandle = handle;
        this.shopHandle = await handle.getDirectoryHandle(SHOP_NAME, { create:true });
        await idbSet('rootDirHandle', handle);
        return true;
      } catch (e) { return false; }
    },

    async tryAutoConnect() {
      try {
        await requireUser(true);
        this.connected = true;
      } catch (e) {
        this.connected = false;
        return false;
      }
      if (this.supported) {
        try {
          const h = await idbGet('rootDirHandle');
          if (h) {
            const perm = await h.queryPermission({ mode:'readwrite' });
            if (perm === 'granted') {
              this.dirHandle = h;
              this.shopHandle = await h.getDirectoryHandle(SHOP_NAME, { create:true });
            }
          }
        } catch (e) {}
      }
      return true;
    },

    async _mirrorWrite(key, value) {
      if (!this.shopHandle) return;
      try {
        const fh = await this.shopHandle.getFileHandle(key + '.json', { create:true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(value, null, 2));
        await w.close();
      } catch (e) { console.warn('local mirror write failed:', key, e); }
    },

    async read(key, fallback) {
      await requireUser(true);
      try {
        const doc = await fsdb.collection(DATA_COLLECTION).doc(key).get();
        if (doc.exists && doc.data() && Object.prototype.hasOwnProperty.call(doc.data(), 'value')) {
          return doc.data().value;
        }
        if (this.shopHandle) {
          try {
            const fh = await this.shopHandle.getFileHandle(key + '.json');
            const f = await fh.getFile();
            return JSON.parse(await f.text());
          } catch (e2) {}
        }
        return fallback;
      } catch (e) {
        if (this.shopHandle) {
          try {
            const fh = await this.shopHandle.getFileHandle(key + '.json');
            const f = await fh.getFile();
            return JSON.parse(await f.text());
          } catch (e2) {}
        }
        console.error('Cloud read failed:', key, e);
        return fallback;
      }
    },

    async write(key, value) {
      const u = await requireUser(true);
      if (!key || typeof key !== 'string') throw new Error('INVALID_DATA_KEY');

      const payload = {
        value: value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: u.uid || '',
        updatedByName: u.name || 'غير معروف'
      };

      // Retry transient Firestore/network failures so a normal connection hiccup
      // does not make a successful-looking UI action disappear after refresh.
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await fsdb.collection(DATA_COLLECTION).doc(key).set(payload, { merge:false });
          const verify = await fsdb.collection(DATA_COLLECTION).doc(key).get({ source:'server' }).catch(() => null);
          if (verify && verify.exists && verify.data() && Object.prototype.hasOwnProperty.call(verify.data(), 'value')) {
            await this._mirrorWrite(key, value);
            await logActivity('write', key, { size: Array.isArray(value) ? value.length : null });
            return true;
          }
          throw new Error('WRITE_VERIFY_FAILED');
        } catch (e) {
          lastError = e;
          if (attempt < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }

      console.error('Cloud write failed:', key, lastError);
      const code = lastError && (lastError.code || lastError.message) || 'UNKNOWN';
      throw new Error('FIRESTORE_WRITE_FAILED:' + code);
    },

    async remove(key) {
      await requireUser(true);
      await fsdb.collection(DATA_COLLECTION).doc(key).delete();
      if (this.shopHandle) {
        try {
          const fh = await this.shopHandle.getFileHandle(key + '.json');
          await fh.remove();
        } catch (e) {}
      }
      await logActivity('delete', key);
      return true;
    },

    onChange(key, callback) {
      return fsdb.collection(DATA_COLLECTION).doc(key).onSnapshot(function(doc) {
        if (doc.exists && doc.data() && Object.prototype.hasOwnProperty.call(doc.data(), 'value')) {
          callback(doc.data().value);
        }
      }, function(err) { console.warn('live listener failed:', key, err); });
    },

    async exportAll() {
      await requireUser(true);
      const out = { version:2, shop:SHOP_NAME, exportedAt:Date.now(), data:{} };
      for (const key of DATA_KEYS) out.data[key] = await this.read(key, Object.prototype.hasOwnProperty.call(DATA_DEFAULTS, key) ? DATA_DEFAULTS[key] : null);
      return out;
    },

    async importAll(payload) {
      await requireUser(true);
      if (!payload || typeof payload !== 'object' || !payload.data) throw new Error('INVALID_BACKUP');
      for (const key of DATA_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload.data, key)) {
          await this.write(key, payload.data[key]);
        }
      }
      return true;
    }
  };

  function idbOpen() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('hn_db_meta', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function idbGet(k) {
    return idbOpen().then(db => new Promise((res, rej) => {
      const tx = db.transaction('kv','readonly'); const rq = tx.objectStore('kv').get(k);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    }));
  }
  function idbSet(k,v) {
    return idbOpen().then(db => new Promise((res, rej) => {
      const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put(v,k);
      tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
    }));
  }

  window.DB = DB;
  window.HN_FSDB = fsdb;
  window.HN_AUTH = firebase.auth();
  window.HN_DATA_KEYS = DATA_KEYS.slice();
})();
