const api = require("../../utils/api");

Page({
  data: { loading: true, error: "", role: "parent", sessions: [], students: [], studentIndex: 0, studentId: "" },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(true); },
  async load(refresh = false) {
    if (!refresh) this.setData({ loading: true, error: "" });
    try {
      const [context, students] = await Promise.all([api.call("getContext"), api.call("listStudents")]);
      const studentId = this.data.studentId || (students[0] && students[0].id) || "";
      const sessions = await api.call("listSessions", { studentId });
      this.setData({ role: context.user.role, students, studentId, sessions: sessions.map((item) => ({ ...item, shortDate: String(item.date || "").slice(5), statusLabel: item.myStatus === "booked" ? "已报名" : item.myStatus === "waiting" ? `候补第${item.waitlistPosition}位` : item.myStatus === "leave_pending" ? "请假审核中" : item.remaining > 0 ? `余${item.remaining}位` : "可候补" })), loading: false });
    } catch (error) { this.setData({ loading: false, error: "课程加载失败，请重试" }); }
    finally { wx.stopPullDownRefresh(); }
  },
  studentChange(event) { const index = Number(event.detail.value); this.setData({ studentIndex: index, studentId: this.data.students[index].id }, () => this.load()); },
  open(event) { wx.navigateTo({ url: `/pages/session-detail/index?id=${event.currentTarget.dataset.id}&studentId=${this.data.studentId}` }); },
  add() { wx.navigateTo({ url: "/pages/session-form/index" }); }
});
