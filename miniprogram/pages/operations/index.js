const api = require("../../utils/api");

Page({
  data: { loading: true, error: "", data: { metrics: {}, alerts: [], sessions: [], auditLogs: [] } },
  onShow() { this.load(); }, onPullDownRefresh() { this.load(); },
  async load() { this.setData({ loading: true, error: "" }); try { this.setData({ data: await api.call("getOperationsDashboard"), loading: false }); } catch (error) { this.setData({ loading: false, error: "运营数据加载失败" }); } finally { wx.stopPullDownRefresh(); } },
  sessions() { wx.switchTab({ url: "/pages/sessions/index" }); }, classes() { wx.navigateTo({ url: "/pages/classes/index" }); }, assessments() { wx.navigateTo({ url: "/pages/assessment-rounds/index" }); }, league() { wx.navigateTo({ url: "/pages/league-dashboard/index" }); }, leaves() { wx.navigateTo({ url: "/pages/leave-requests/index" }); }, renewals() { wx.navigateTo({ url: "/pages/renewals/index" }); }, addSession() { wx.navigateTo({ url: "/pages/session-form/index" }); }, attendance(event) { wx.navigateTo({ url: `/pages/attendance/index?sessionId=${event.currentTarget.dataset.id}` }); }
});
