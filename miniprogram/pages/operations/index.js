const api = require("../../utils/api");
const navigation = require("../../utils/navigation-config");

Page({
  data: { loading: true, error: "", quickEntries: navigation.operationsEntries(), data: { metrics: {}, alerts: [], sessions: [], auditLogs: [] } },
  onShow() { this.load(); }, onPullDownRefresh() { this.load(); },
  async load() { this.setData({ loading: true, error: "" }); try { this.setData({ data: await api.call("getOperationsDashboard"), loading: false }); } catch (error) { this.setData({ loading: false, error: "运营数据加载失败" }); } finally { wx.stopPullDownRefresh(); } },
  openFeature(event) { navigation.openFeature(event.currentTarget.dataset.key, "admin"); },
  attendance(event) { wx.navigateTo({ url: `/pages/attendance/index?sessionId=${event.currentTarget.dataset.id}` }); }
});
