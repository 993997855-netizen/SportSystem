const api = require("../../utils/api");
const navigation = require("../../utils/navigation-config");

Page({
  data: { loading: true, error: "", role: "", viewMode: "overview", pageTitle: "课程安排", sessions: [], nextSession: null, students: [], studentChoices: [], studentIndex: 0, studentId: "", myClasses: [] },
  onShow() { this.load(); },
  onTabItemTap() { navigation.clearTabIntent(); this.setData({ viewMode: "overview" }, () => this.load()); },
  onPullDownRefresh() { this.load(true); },
  async load(refresh = false) {
    if (!refresh) this.setData({ loading: true, error: "" });
    try {
      const [context, students] = await Promise.all([api.call("getContext"), api.call("listStudents")]);
      const intent = navigation.consumeTabIntent("/pages/sessions/index", context.user.role);
      const roleChanged = context.user.role !== this.data.role;
      const defaultMode = context.user.role === "admin" ? "manage" : context.user.role === "coach" ? "attendance" : "overview";
      const viewMode = intent ? intent.mode : (roleChanged ? defaultMode : this.data.viewMode);
      const defaultTitle = context.user.role === "admin" ? "课程管理" : context.user.role === "coach" ? "考勤" : "我的课表";
      const pageTitle = intent ? intent.title : defaultTitle;
      wx.setNavigationBarTitle({ title: pageTitle });
      const remembered = getApp().globalData.activeStudentId || wx.getStorageSync("activeStudentId"), studentChoices = context.user.role === "parent" ? [{ id: "ALL", name: "全部孩子" }, ...students] : students;
      const studentId = this.data.studentId || (students.some((item) => item.id === remembered) ? remembered : "") || (students[0] && students[0].id) || "";
      const studentIndex = Math.max(0, studentChoices.findIndex((item) => item.id === studentId));
      let sessions = [], myClasses = [];
      if (context.user.role === "parent" && studentId === "ALL") {
        const groups = await Promise.all(students.map((student) => api.call("listSessions", { studentId: student.id })));
        sessions = groups.flatMap((rows, index) => rows.map((item) => ({ ...item, studentId: students[index].id, studentName: students[index].name })));
        myClasses = students.flatMap((student) => (student.classes || []).map((item) => ({ ...item, rowKey: `${item.id}-${student.id}`, studentId: student.id, studentName: student.name })));
      } else {
        sessions = await api.call("listSessions", { studentId });
        const selectedStudent = students.find((item) => item.id === studentId) || {};
        myClasses = context.user.role === "parent" ? (selectedStudent.classes || []).map((item) => ({ ...item, rowKey: `${item.id}-${studentId}`, studentId, studentName: selectedStudent.name })) : [];
      }
      const decorated = sessions.map((item) => ({ ...item, rowKey: `${item.id}-${item.studentId || studentId}`, shortDate: String(item.date || "").slice(5), statusLabel: item.myStatus === "booked" ? "正常参加" : item.myStatus === "leave_pending" ? "请假待审批" : item.myStatus === "leave_approved" ? "已请假 · 0课时" : item.myStatus === "leave_rejected" ? "请假被拒绝" : item.statusLabel || "已发布" }));
      this.setData({ role: context.user.role, viewMode, pageTitle, students, studentChoices, studentIndex, studentId, myClasses, sessions: decorated, nextSession: context.user.role === "parent" ? decorated.find((item) => item.status !== "CANCELLED") || null : null, loading: false });
    } catch (error) { this.setData({ loading: false, error: "课程加载失败，请重试" }); }
    finally { wx.stopPullDownRefresh(); }
  },
  studentChange(event) { const index = Number(event.detail.value), id = this.data.studentChoices[index].id; if (id !== "ALL") { getApp().globalData.activeStudentId = id; wx.setStorageSync("activeStudentId", id); } this.setData({ studentIndex: index, studentId: id }, () => this.load()); },
  openClass(event) { const studentId = event.currentTarget.dataset.student; if (studentId) { getApp().globalData.activeStudentId = studentId; wx.setStorageSync("activeStudentId", studentId); } wx.navigateTo({ url: `/pages/class-detail/index?id=${event.currentTarget.dataset.id}` }); },
  open(event) { const studentId = event.currentTarget.dataset.student || this.data.studentId; wx.navigateTo({ url: `/pages/session-detail/index?id=${event.currentTarget.dataset.id}&studentId=${studentId === "ALL" ? "" : studentId}` }); },
  timetable() { wx.navigateTo({ url: "/pages/family-timetable/index" }); },
  enrollment() { wx.navigateTo({ url: "/pages/classes/index" }); },
  add() { wx.navigateTo({ url: "/pages/session-form/index" }); }
});
