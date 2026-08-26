// ==========================================
// 🛡️ Hassan Nassar Jewelry - License Guard (Disabled)
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyAQMILfvEzLXxUKYbScldvKTHKQEk4PpN4",
  authDomain: "hassan-nassar-license.firebaseapp.com",
  projectId: "hassan-nassar-license",
  storageBucket: "hassan-nassar-license.firebasestorage.app",
  messagingSenderId: "381313051649",
  appId: "1:381313051649:web:ef6e6667f691848c3c6400",
  measurementId: "G-E939CTWF3W"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// تم إلغاء قيود الترخيص تماماً ليفتح البرنامج مباشرة
function checkLicenseGuard() {
  console.log("تم تجاوز نظام الترخيص بنجاح.");
  return true; 
}

// تشغيل وهمي لعدم تعطيل أي سكربتات تانية بتنادي عليها
async function trackDeviceSession() {
  return;
}

function blockUnauthorizedUser(message) {
  // معطلة تماماً
}

// لن يتم حظر أي مستخدم بعد الآن
