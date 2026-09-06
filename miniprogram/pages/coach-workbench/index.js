const api = require("../../utils/api");
const { today } = require("../../utils/format");
function offset(value, days) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function decorate(items) { const groups = new Map(); (items || []).forEach((item) => { if (!groups.has(item.date)) groups.set(item.date, { date: item.date, isToday: item.date === new Date().toISOString().slice(0, 10), items: [] }); groups.get(item.date).items.push({ ...item, originalCoachText: (item.originalCoachNames || []).join("、") }); }); return [...groups.values()]; }
Page({
  data: { loading: true, error: "", date: "", range: "today", timetable: { items: [], stats: {} }, allItems: [], groups: [] },
  onLoad() { wx.setNavigationBarTitle({ title: "今日教学" }); this.setData({ date: today() }); }, onShow() { this.load(); }, onPullDownRefresh() { this.load(); },
  async load() { if (!this.data.date) return; this.setData({ loading: true, error: "" }); try { const timetable = await api.call("getUnifiedTimetable", { date: this.data.date }); this.setData({ timetable, allItems: timetable.items || [], loading: false }, () => this.applyRange()); } catch (error) { this.setData({ loading: false, error: "教学安排加载失败，请稍后重试" }); } finally { wx.stopPullDownRefresh(); } },
  applyRange() { const currentDate = today(), items = this.data.range === "today" ? this.data.allItems.filter((item) => item.date === currentDate) : this.data.allItems; this.setData({ groups: decorate(items) }); },
  range(event) { this.setData({ range: event.currentTarget.dataset.range }, () => this.applyRange()); },
  previous() { this.setData({ date: offset(this.data.timetable.startDate || this.data.date, -7) }, () => this.load()); }, next() { this.setData({ date: offset(this.data.timetable.startDate || this.data.date, 7) }, () => this.load()); }, current() { this.setData({ date: today() }, () => this.load()); }, today() { this.current(); },
  open(event) { if (event.currentTarget.dataset.type === "TRAINING") wx.navigateTo({ url: `/pages/session-detail/index?id=${event.currentTarget.dataset.id}` }); },
  attendance(event) { wx.navigateTo({ url: `/pages/attendance/index?sessionId=${event.currentTarget.dataset.id}` }); },
  evaluation(event) { wx.navigateTo({ url: `/pages/training-evaluation/index?sessionId=${event.currentTarget.dataset.id}` }); },
  weeklyPlan() { wx.navigateTo({ url: "/pages/training-cycles/index" }); },
  workload() { wx.navigateTo({ url: "/pages/coach-workload/index?mode=work" }); }
});
