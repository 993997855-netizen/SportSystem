const api = require("../../utils/api");

Page({
  data: { students: [], filtered: [], keyword: "", role: "admin", loading: true, error: "" },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(true); },
  async load(fromRefresh = false) {
    if (!fromRefresh) this.setData({ loading: true, error: "" });
    try {
      const [context, students] = await Promise.all([api.call("getContext"), api.call("listStudents")]);
      const decorated = students.map((item) => ({ ...item, lowBalance: Number(item.remainingLessons) <= 5 }));
      const keyword = this.data.keyword;
      const filtered = keyword ? decorated.filter((item) => `${item.name}${item.guardianName}${item.classNames}`.includes(keyword)) : decorated;
      this.setData({ students: decorated, filtered, role: context.user.role, loading: false, error: "" });
    } catch (error) {
      this.setData({ loading: false, error: "学员数据加载失败" });
    } finally { wx.stopPullDownRefresh(); }
  },
  search(event) {
    const keyword = event.detail.value.trim();
    const filtered = this.data.students.filter((item) => `${item.name}${item.guardianName}${item.classNames}`.includes(keyword));
    this.setData({ keyword, filtered });
  },
  clearSearch() { this.setData({ keyword: "", filtered: this.data.students }); },
  open(event) { const id = event.currentTarget.dataset.id; if (this.data.role === "parent") { getApp().globalData.activeStudentId = id; wx.setStorageSync("activeStudentId", id); } wx.navigateTo({ url: `/pages/student-detail/index?id=${id}` }); },
  add() { wx.navigateTo({ url: this.data.role === "parent" ? "/pages/parent-child-form/index" : "/pages/student-form/index" }); }
});
