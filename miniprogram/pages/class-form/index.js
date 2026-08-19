const api = require("../../utils/api");

Page({
  data: { id: "", clubClass: { name: "", coachName: "", schedule: "", venue: "", studentIds: [] }, students: [], saving: false, loading: true, error: "" },
  async onLoad(options) {
    this.options = options;
    wx.setNavigationBarTitle({ title: options.id ? "编辑班级" : "新增班级" });
    try {
      const students = await api.call("listStudents");
      let clubClass = this.data.clubClass;
      if (options.id) clubClass = await api.call("getClass", { id: options.id });
      const selected = clubClass.studentIds || [];
      this.setData({ id: options.id || "", clubClass, students: students.map((item) => ({ ...item, checked: selected.includes(item.id) })), loading: false });
    } catch (error) { this.setData({ loading: false, error: "表单加载失败" }); }
  },
  retry() { this.setData({ loading: true, error: "" }); this.onLoad(this.options || {}); },
  field(event) { this.setData({ [`clubClass.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  students(event) { this.setData({ "clubClass.studentIds": event.detail.value }); },
  async save() {
    if (this.data.saving) return;
    const clubClass = { ...this.data.clubClass, name: this.data.clubClass.name.trim(), coachName: this.data.clubClass.coachName.trim(), schedule: this.data.clubClass.schedule.trim(), venue: this.data.clubClass.venue.trim() };
    if (!clubClass.name || !clubClass.coachName || !clubClass.schedule || !clubClass.venue) { wx.showToast({ title: "请完整填写班级信息", icon: "none" }); return; }
    this.setData({ saving: true });
    try {
      await api.call("saveClass", { clubClass: { ...clubClass, id: this.data.id || undefined } });
      wx.showToast({ title: "班级已保存" }); setTimeout(() => wx.navigateBack(), 400);
    } finally { this.setData({ saving: false }); }
  }
});
