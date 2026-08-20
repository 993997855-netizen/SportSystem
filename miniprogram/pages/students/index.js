const api = require("../../utils/api");

Page({
  data: { students: [], filtered: [], keyword: "", role: "admin", loading: true, error: "" },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(true); },
  async load(fromRefresh = false) {
    if (!fromRefresh) this.setData({ loading: true, error: "" });
    try {
      const [context, students] = await Promise.all([api.call("getContext"), api.call("listStudents")]);
      const keyword = this.data.keyword;
      const filtered = keyword ? students.filter((item) => `${item.name}${item.guardianName}${item.classNames}`.includes(keyword)) : students;
      this.setData({ students, filtered, role: context.user.role, loading: false, error: "" });
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
  open(event) { wx.navigateTo({ url: `/pages/student-detail/index?id=${event.currentTarget.dataset.id}` }); },
  add() { wx.navigateTo({ url: "/pages/student-form/index" }); }
});
