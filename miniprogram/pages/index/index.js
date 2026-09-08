const api = require("../../utils/api");
const { roleLabels, today } = require("../../utils/format");
const navigation = require("../../utils/navigation-config");

Page({
  data: { loading: true, hasLoaded: false, error: "", dashboard: {}, user: {}, roleLabel: "", quickEntries: [], familyStudents: [], parentEmpty: false, latestNews: [], today: today(), attentionTitle: "重点关注", nextSchedule: null, todayScheduleStats: { total: 0, inProgress: 0, upcoming: 0 } },
  onShow() { this.load(); },
  onPullDownRefresh() { api.clearCache(); this.load(true); },
  async load(fromRefresh = false) {
    const loadId = (this._loadId || 0) + 1;
    this._loadId = loadId;
    if (!fromRefresh && !this.data.hasLoaded) this.setData({ loading: true, error: "" });
    try {
      const context = await api.call("getContext");
      let family = { students: [], activeStudentId: "" };
      if (context.user.role === "parent") family = await api.call("getFamilyContext", { activeStudentId: getApp().globalData.activeStudentId });
      const activeStudentId = family.activeStudentId || "";
      if (activeStudentId) { getApp().globalData.activeStudentId = activeStudentId; wx.setStorageSync("activeStudentId", activeStudentId); }
      const [dashboard, latestNews, timetable] = await Promise.all([
        api.call("getDashboard", { activeStudentId }),
        api.call("listNews", {}, { silent: true }).catch(() => []),
        api.call("getUnifiedTimetable", { date: today(), studentId: activeStudentId || undefined }, { silent: true }).catch(() => ({ items: [] })),
      ]);
      if (loadId !== this._loadId) return;
      const nextSchedule = (timetable.items || []).find((item) => item.date >= today()) || null;
      const todayItems = (timetable.items || []).filter((item) => item.sourceType === "TRAINING" && item.date === today()), todayScheduleStats = { total: todayItems.length, inProgress: todayItems.filter((item) => item.status === "IN_PROGRESS").length, upcoming: todayItems.filter((item) => !["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(item.status)).length };
      this.setData({
        user: context.user,
        dashboard: { ...dashboard, recentStudents: (dashboard.recentStudents || []).map((item) => ({ ...item, lowBalance: context.user.role !== "coach" && Number(item.remainingLessons) <= 5 })) },
        roleLabel: roleLabels[context.user.role],
        quickEntries: navigation.homeEntries(context.user.role),
        attentionTitle: dashboard.lowBalance ? "低课时提醒" : "学员概览",
        familyStudents: family.students,
        activeStudentId,
        activeStudentIndex: Math.max(0, family.students.findIndex((item) => item.id === activeStudentId)),
        parentEmpty: context.user.role === "parent" && family.students.length === 0,
        latestNews: (latestNews || []).slice(0, 3),
        nextSchedule,
        todayScheduleStats,
        loading: false,
        hasLoaded: true,
        error: ""
      });
    } catch (error) {
      if (loadId === this._loadId) this.setData({ loading: false, error: "数据加载失败，请检查网络后重试" });
    } finally {
      wx.stopPullDownRefresh();
    }
  },
  activeStudentChange(event) { const index = Number(event.detail.value), student = this.data.familyStudents[index]; if (!student) return; getApp().globalData.activeStudentId = student.id; wx.setStorageSync("activeStudentId", student.id); this.setData({ activeStudentIndex: index, activeStudentId: student.id }, () => this.load()); },
  openActiveStudent() { const id = this.activeStudentId(); if (id) wx.navigateTo({ url: `/pages/student-detail/index?id=${id}` }); },
  activeStudentId() { return this.data.activeStudentId || ((this.data.dashboard.recentStudents || [])[0] || {}).id || ""; },
  openFeature(key, params = {}) { try { navigation.openFeature(key, this.data.user.role, params); } catch (error) { wx.showToast({ title: error.message || "入口暂不可用", icon: "none" }); } },
  openQuick(event) { const key = event.currentTarget.dataset.key, params = {}; if (["parentGrowth", "parentAssessment"].includes(key)) params.studentId = this.activeStudentId(); if (["parentGrowth", "parentAssessment"].includes(key) && !params.studentId) return wx.showToast({ title: "请先添加孩子", icon: "none" }); this.openFeature(key, params); },
  goAddChild() { this.openFeature("parentAddChild"); },
  goStudents() { const keys = { admin: "adminStudents", coach: "coachClasses", parent: "parentChildren" }; this.openFeature(keys[this.data.user.role]); },
  goClasses() { const keys = { admin: "adminClasses", coach: "coachClasses", parent: "parentEnrollment" }; this.openFeature(keys[this.data.user.role]); },
  goCoachTeam() { const keys = { admin: "adminCoaches", coach: "coachProfile", parent: "parentCoaches" }; this.openFeature(keys[this.data.user.role]); },
  goSessions() { const keys = { admin: "adminCourses", coach: "coachTimetable", parent: "parentCourses" }; this.openFeature(keys[this.data.user.role]); },
  goLeaves() { const keys = { admin: "adminLeaves", parent: "parentLeaves" }; if (keys[this.data.user.role]) this.openFeature(keys[this.data.user.role]); else this.goSessions(); },
  goOperations() { this.openFeature("adminOperations"); },
  goCoachWorkbench() { this.openFeature("coachTimetable"); },
  goCoachWorkload() { this.openFeature("coachWorkload"); },
  goCrm() { this.openFeature("adminCrm"); },
  goTraining() { this.openFeature("adminTraining"); },
  goCurriculums() { wx.navigateTo({ url: "/pages/curriculums/index" }); },
  goWeeklyPlans() { this.openFeature("coachWeeklyPlans"); },
  goGrowth() { const keys = { admin: "adminGrowth", coach: "coachGrowth", parent: "parentGrowth" }, params = this.data.user.role === "parent" ? { studentId: this.activeStudentId() } : {}; if (this.data.user.role === "parent" && !params.studentId) return wx.showToast({ title: "请先添加孩子", icon: "none" }); this.openFeature(keys[this.data.user.role], params); },
  goElite() { this.openFeature(this.data.user.role === "admin" ? "adminElite" : "coachElite"); },
  goLeague() { const keys = { admin: "adminLeague", parent: "parentLeague" }; if (keys[this.data.user.role]) this.openFeature(keys[this.data.user.role]); },
  goTimetable() { const keys = { admin: "adminTimetable", coach: "coachTimetable", parent: "parentTimetable" }; this.openFeature(keys[this.data.user.role]); },
  openNext() { const item = this.data.nextSchedule; if (item && item.sourceType === "TRAINING") wx.navigateTo({ url: `/pages/session-detail/index?id=${item.sessionId}&studentId=${item.studentId || ""}` }); else this.goTimetable(); },
  leaveNext() { const item = this.data.nextSchedule; if (item && item.sourceType === "TRAINING") wx.navigateTo({ url: `/pages/session-detail/index?id=${item.sessionId}&studentId=${item.studentId || this.activeStudentId()}` }); else this.openFeature("parentLeaves"); },
  goNews() { const keys = { admin: "adminNews", coach: "coachNews", parent: "parentNews" }; this.openFeature(keys[this.data.user.role]); },
  goRenewals() { this.openFeature(this.data.user.role === "admin" ? "adminOrders" : "parentPackages"); },
  goStat4() { if (this.data.dashboard.role === "coach") this.goClasses(); else this.goRenewals(); },
  goStudent(event) { wx.navigateTo({ url: `/pages/student-detail/index?id=${event.currentTarget.dataset.id}` }); },
  takeAttendance(event) { wx.navigateTo({ url: `/pages/attendance/index?sessionId=${event.currentTarget.dataset.id}` }); }
});
