const api = require("../../utils/api");

Page({
  data: { loading: true, saving: false, sessions: [], students: [], sessionIndex: 0, studentIndex: 0, sessionId: "", studentId: "", ratingIndex: 3, ratings: [1, 2, 3, 4, 5], tagsText: "", content: "" },
  async onLoad(options) { this.setData({ sessionId: options.sessionId || "", studentId: options.studentId || "" }); try { const [sessions, students] = await Promise.all([api.call("listSessions"), api.call("listStudents")]); const sessionIndex = Math.max(0, sessions.findIndex((item) => item.id === this.data.sessionId)); const studentIndex = Math.max(0, students.findIndex((item) => item.id === this.data.studentId)); this.setData({ sessions, students, sessionIndex, studentIndex, sessionId: (sessions[sessionIndex] || {}).id || "", studentId: (students[studentIndex] || {}).id || "", loading: false }); } catch (error) { this.setData({ loading: false }); } },
  sessionChange(event) { const index = Number(event.detail.value); this.setData({ sessionIndex: index, sessionId: this.data.sessions[index].id }); },
  studentChange(event) { const index = Number(event.detail.value); this.setData({ studentIndex: index, studentId: this.data.students[index].id }); },
  ratingChange(event) { this.setData({ ratingIndex: Number(event.detail.value) }); }, tags(event) { this.setData({ tagsText: event.detail.value }); }, content(event) { this.setData({ content: event.detail.value }); },
  async save() { if (this.data.saving) return; if (!this.data.content.trim()) return wx.showToast({ title: "请填写训练反馈", icon: "none" }); this.setData({ saving: true }); try { await api.call("saveFeedback", { sessionId: this.data.sessionId, studentId: this.data.studentId, rating: this.data.ratings[this.data.ratingIndex], tags: this.data.tagsText.split(/[，,]/).map((item) => item.trim()).filter(Boolean), content: this.data.content }); wx.showToast({ title: "反馈已发布" }); setTimeout(() => wx.navigateBack(), 500); } finally { this.setData({ saving: false }); } }
});
