const api = require("../../utils/api");

Page({
  data: { id: "", loading: true, saving: false, classes: [], classIndex: 0, modes: ["开放报名", "梯队固定"], session: { classId: "", title: "", date: "", weekday: "", time: "", venue: "", coachName: "", focus: "", capacity: 20, enrollmentMode: "open", status: "published" } },
  async onLoad(options) {
    this.setData({ id: options.id || "" });
    try { const classes = await api.call("listClasses"); let session = this.data.session; if (options.id) session = await api.call("getSession", { id: options.id }); const classIndex = Math.max(0, classes.findIndex((item) => item.id === session.classId)); if (!session.classId && classes[0]) session = { ...session, classId: classes[0].id, title: classes[0].name, venue: classes[0].venue, coachName: classes[0].coachName }; this.setData({ classes, classIndex, session, loading: false }); } catch (error) { this.setData({ loading: false }); }
  },
  field(event) { this.setData({ [`session.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  classChange(event) { const index = Number(event.detail.value); const item = this.data.classes[index]; this.setData({ classIndex: index, "session.classId": item.id, "session.title": item.name, "session.venue": item.venue, "session.coachName": item.coachName }); },
  dateChange(event) { const date = event.detail.value; const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]; this.setData({ "session.date": date, "session.weekday": labels[new Date(`${date}T00:00:00`).getDay()] }); },
  modeChange(event) { this.setData({ "session.enrollmentMode": Number(event.detail.value) === 0 ? "open" : "fixed" }); },
  async save() { if (this.data.saving) return; this.setData({ saving: true }); try { await api.call("saveSession", { session: { ...this.data.session, id: this.data.id || undefined, capacity: Number(this.data.session.capacity) } }); wx.showToast({ title: "课程已发布" }); setTimeout(() => wx.navigateBack(), 500); } finally { this.setData({ saving: false }); } }
});
