const responseCache = new Map();
const inFlightReads = new Map();
let cacheGeneration = 0;

const CACHE_TTLS = {
  getContext: 30000,
  getAuthContext: 10000,
  getFamilyContext: 10000,
  listStudents: 8000,
  listClasses: 8000,
  listNews: 15000,
  getDashboard: 5000,
  getUnifiedTimetable: 5000,
  listSessions: 5000,
};

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function requestKey(action, data) {
  return `${action}:${JSON.stringify(stableValue(data || {}))}`;
}

function isReadAction(action) {
  return /^(get|list|search|check|preview)/.test(action) || action === "paymentEnvironmentCheck";
}

function cacheTtl(action) {
  return CACHE_TTLS[action] || 3000;
}

function clearCache(action) {
  cacheGeneration += 1;
  if (!action) {
    responseCache.clear();
    inFlightReads.clear();
    return;
  }
  const prefix = `${action}:`;
  [...responseCache.keys()].forEach((key) => {
    if (key.startsWith(prefix)) responseCache.delete(key);
  });
  [...inFlightReads.keys()].forEach((key) => {
    if (key.startsWith(prefix)) inFlightReads.delete(key);
  });
}

async function request(action, data) {
  const response = await wx.cloud.callFunction({ name: "clubApi", data: { action, data } });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.message || "请求失败");
    error.code = result.code || "SERVICE_ERROR";
    if (["UNREGISTERED", "ACCOUNT_DISABLED"].includes(error.code)) {
      clearCache();
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      const route = pages.length ? pages[pages.length - 1].route : "";
      if (route !== "pages/auth/index") wx.reLaunch({ url: `/pages/auth/index?reason=${error.code}` });
    }
    throw error;
  }
  return result.data;
}

async function call(action, data = {}, options = {}) {
  const read = isReadAction(action);
  const key = requestKey(action, data);
  const generation = cacheGeneration;
  const cached = responseCache.get(key);
  if (read && !options.force && cached && cached.expiresAt > Date.now()) return cached.value;
  if (read && !options.force && inFlightReads.has(key)) return inFlightReads.get(key);

  const task = request(action, data).then((value) => {
    if (read && generation === cacheGeneration) responseCache.set(key, { value, expiresAt: Date.now() + cacheTtl(action) });
    else clearCache();
    return value;
  }).catch((error) => {
    const message = error && error.message ? error.message : "云端请求失败，请检查云函数部署和网络";
    if (!options.silent) wx.showToast({ title: message.slice(0, 18), icon: "none" });
    throw error;
  }).finally(() => {
    if (read && inFlightReads.get(key) === task) inFlightReads.delete(key);
  });

  if (read) inFlightReads.set(key, task);
  return task;
}

function finishLogin(user) {
  clearCache();
  wx.setStorageSync("authUser", user || null);
  wx.removeStorageSync("sessionLoggedOut");
  getApp().globalData.authUser = user || null;
}

function logout() {
  clearCache();
  wx.removeStorageSync("authUser");
  wx.removeStorageSync("activeStudentId");
  wx.setStorageSync("sessionLoggedOut", true);
  const app = getApp();
  app.globalData.authUser = null;
  app.globalData.activeStudentId = "";
  wx.reLaunch({ url: "/pages/auth/index?loggedOut=1" });
}

module.exports = { call, clearCache, finishLogin, logout };
