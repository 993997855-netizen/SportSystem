const api = require("../../utils/api");
const navigation = require("../../utils/navigation-config");

Page({
  data: { students: [], filtered: [], keyword: "", role: "", viewMode: "directory", pageTitle: "学员档案", loading: true, error: "" },
  onShow() { this.load(); },
  onTabItemTap() { navigation.clearTabIntent(); this.setData({ viewMode: "directory" }, () => this.load()); },
  onPullDownRefresh() { this.load(true); },
  async load(fromRefresh = false) {
    if (!fromRefresh) this.setData({ loading: true, error: "" });
    try {
      const [context, students] = await Promise.all([api.call("getContext"), api.call("listStudents")]);
      const intent = navigation.consumeTabIntent("/pages/students/index", context.user.role);
      const roleChanged = context.user.role !== this.data.role;
      const viewMode = intent ? intent.mode : (roleChanged ? (context.user.role === "parent" ? "children" : "directory") : this.data.viewMode);
      const defaultTitle = context.user.role === "admin" ? "学员管理" : context.user.role === "coach" ? "我的学员" : "我的孩子";
      const pageTitle = intent ? intent.title : (viewMode === "growth" ? "成长管理" : defaultTitle);
      wx.setNavigationBarTitle({ title: pageTitle });
      const decorated = students.map((item) => ({ ...item, lowBalance: context.user.role !== "coach" && Number(item.remainingLessons) <= 5 }));
      const keyword = this.data.keyword;
      const filtered = keyword ? decorated.filter((item) => `${item.name || ""}${context.user.role === "coach" ? "" : item.guardianName || ""}${item.classNames || ""}`.includes(keyword)) : decorated;
      this.setData({ students: decorated, filtered, role: context.user.role, viewMode, pageTitle, loading: false, error: "" });
    } catch (error) {
      this.setData({ loading: false, error: "学员数据加载失败" });
    } finally { wx.stopPullDownRefresh(); }
  },
  search(event) {
    const keyword = event.detail.value.trim();
    const filtered = this.data.students.filter((item) => `${item.name || ""}${this.data.role === "coach" ? "" : item.guardianName || ""}${item.classNames || ""}`.includes(keyword));
    this.setData({ keyword, filtered });
  },
  clearSearch() { this.setData({ keyword: "", filtered: this.data.students }); },
  open(event) { const id = event.currentTarget.dataset.id; if (this.data.role === "parent") { getApp().globalData.activeStudentId = id; wx.setStorageSync("activeStudentId", id); } wx.navigateTo({ url: this.data.viewMode === "growth" ? `/pages/growth-profile/index?studentId=${id}` : `/pages/student-detail/index?id=${id}` }); },
  add() { wx.navigateTo({ url: this.data.role === "parent" ? "/pages/parent-child-form/index" : "/pages/student-form/index" }); }
});
