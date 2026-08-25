const api = require("../../utils/api");
Page({
  data: { loading: true, error: "", data: null }, onShow() { this.load(); },
  async load() { this.setData({ loading: true, error: "" }); try { const raw = await api.call("getResearchDashboard"); this.setData({ data: { ...raw, weeklyPlans: (raw.weeklyPlans || []).map((item) => ({ ...item, focusText: (item.trainingFocus || []).join(" / ") })) }, loading: false }); } catch (error) { this.setData({ loading: false, error: error.message || "训练管理数据加载失败" }); } },
  go(event) { wx.navigateTo({ url: `/pages/${event.currentTarget.dataset.page}/index` }); }
});
