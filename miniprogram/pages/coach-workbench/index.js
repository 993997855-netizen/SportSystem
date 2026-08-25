const api = require("../../utils/api");
function offset(value, days) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function decorate(items) { const groups = new Map(); (items || []).forEach((item) => { if (!groups.has(item.date)) groups.set(item.date, { date: item.date, isToday: item.date === new Date().toISOString().slice(0, 10), items: [] }); groups.get(item.date).items.push({ ...item, originalCoachText: (item.originalCoachNames || []).join("、") }); }); return [...groups.values()]; }
Page({
  data: { loading: true, error: "", date: "", timetable: { items: [], stats: {} }, groups: [] },
  onLoad() { this.setData({ date: new Date().toISOString().slice(0, 10) }); }, onShow() { this.load(); }, onPullDownRefresh() { this.load(); },
  async load() { if (!this.data.date) return; this.setData({ loading: true, error: "" }); try { const timetable = await api.call("getUnifiedTimetable", { date: this.data.date }); this.setData({ timetable, groups: decorate(timetable.items), loading: false }); } catch (error) { this.setData({ loading: false, error: "课表云端服务尚未更新，请部署新版 clubApi 后重试" }); } finally { wx.stopPullDownRefresh(); } },
  previous() { this.setData({ date: offset(this.data.timetable.startDate || this.data.date, -7) }, () => this.load()); }, next() { this.setData({ date: offset(this.data.timetable.startDate || this.data.date, 7) }, () => this.load()); }, current() { this.setData({ date: new Date().toISOString().slice(0, 10) }, () => this.load()); }, today() { this.current(); },
  open(event) { if (event.currentTarget.dataset.type === "TRAINING") wx.navigateTo({ url: `/pages/session-detail/index?id=${event.currentTarget.dataset.id}` }); }, workload() { wx.navigateTo({ url: "/pages/coach-workload/index" }); }
});
