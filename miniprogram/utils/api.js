const local = require("./local-domain");

async function call(action, data = {}) {
  const app = getApp();
  try {
    if (app.globalData.dataMode !== "cloud") {
      return await local.call(action, { ...data, previewRole: app.globalData.previewRole });
    }
    const response = await wx.cloud.callFunction({ name: "clubApi", data: { action, data } });
    const result = response.result || {};
    if (!result.success) throw new Error(result.message || "请求失败");
    return result.data;
  } catch (error) {
    const message = error && error.message ? error.message : "云端请求失败";
    wx.showToast({ title: message.slice(0, 18), icon: "none" });
    throw error;
  }
}

module.exports = { call };
