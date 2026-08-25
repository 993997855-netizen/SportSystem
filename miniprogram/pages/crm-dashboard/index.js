const api = require("../../utils/api");
Page({
  data: { loading: true, dashboard: { today: {}, month: {}, funnel: [], recent: [] }, role: "" },
  onShow() { this.load(); }, onPullDownRefresh() { this.load(true); },
  async load(refresh) { if (!refresh) this.setData({ loading: true }); try { const [context, dashboard] = await Promise.all([api.call("getContext"), api.call("getCrmDashboard")]); this.setData({ role: context.user.role, dashboard, loading: false }); } finally { wx.stopPullDownRefresh(); } },
  go(event) { wx.navigateTo({ url: event.currentTarget.dataset.url }); },
  add() { wx.navigateTo({ url: "/pages/lead-form/index" }); },
  lead(event) { wx.navigateTo({ url: `/pages/lead-detail/index?id=${event.currentTarget.dataset.id}` }); }
});


