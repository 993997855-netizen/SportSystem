const api = require("../../utils/api");

Page({
  data: { id: "", studentId: "", role: "parent", session: null, loading: true, error: "", acting: false, progress: 0 },
  onLoad(options) { this.setData({ id: options.id || "", studentId: options.studentId || "" }); },
  onShow() { if (this.data.id) this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try { const [context, raw] = await Promise.all([api.call("getContext"), api.call("getSession", { id: this.data.id, studentId: this.data.studentId })]); const session = { ...raw, enrollments: (raw.enrollments || []).map((item) => ({ ...item, student: { ...item.student, initial: item.student && item.student.name ? item.student.name[0] : "学" } })) }; this.setData({ role: context.user.role, session, progress: session.capacity ? Math.min(100, Math.round(session.enrolledCount / session.capacity * 100)) : 0, loading: false }); }
    catch (error) { this.setData({ loading: false, error: "课程信息加载失败" }); }
  },
  async primary() {
    const session = this.data.session; if (this.data.acting) return;
    if (session.myStatus === "waiting_history") return wx.showToast({ title: "历史候补记录，请联系管理员", icon: "none" });
    if (session.myStatus === "leave_pending") return wx.showToast({ title: "请假正在审核", icon: "none" });
    if (session.myStatus === "booked") return this.leave();
    this.setData({ acting: true }); try { const result = await api.call("enrollSession", { sessionId: session.id, studentId: this.data.studentId }); wx.showModal({ title: result.status === "full" ? "课程已满" : "报名成功", content: result.message, showCancel: false, success: () => this.load() }); } finally { this.setData({ acting: false }); }
  },
  leave() {
    wx.showModal({ title: "提交请假", editable: true, placeholderText: "请输入请假原因", content: "", success: async (result) => { if (!result.confirm) return; this.setData({ acting: true }); try { await api.call("requestLeave", { sessionId: this.data.id, studentId: this.data.studentId, reason: result.content || "家长请假" }); wx.showToast({ title: "请假已提交" }); this.load(); } finally { this.setData({ acting: false }); } } });
  },
  attendance() { wx.navigateTo({ url: `/pages/attendance/index?sessionId=${this.data.id}` }); },
  feedback(event) { wx.navigateTo({ url: `/pages/feedback-form/index?sessionId=${this.data.id}&studentId=${event.currentTarget.dataset.student || ""}` }); },
  leaves() { wx.navigateTo({ url: "/pages/leave-requests/index" }); },
  edit() { wx.navigateTo({ url: `/pages/session-form/index?id=${this.data.id}` }); }
});
