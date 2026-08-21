const api = require("../../utils/api");

Page({
  data: { id: "", classTypes: [{ value: "REGULAR", label: "普通班" }, { value: "ELITE", label: "精英队" }], typeIndex: 0, statuses: [{ value: "ACTIVE", label: "启用" }, { value: "INACTIVE", label: "停用" }], statusIndex: 0, clubClass: { name: "", classType: "REGULAR", ageGroup: "", standardCapacity: 20, headCoachName: "", assistantCoachName: "", schedule: "", venue: "", status: "ACTIVE", remark: "" }, saving: false, loading: true, error: "" },
  async onLoad(options) {
    this.options = options;
    wx.setNavigationBarTitle({ title: options.id ? "编辑班级" : "新增班级" });
    try {
      let clubClass = this.data.clubClass;
      if (options.id) clubClass = await api.call("getClass", { id: options.id });
      this.setData({ id: options.id || "", clubClass, typeIndex: clubClass.classType === "ELITE" ? 1 : 0, statusIndex: clubClass.status === "INACTIVE" ? 1 : 0, loading: false });
    } catch (error) { this.setData({ loading: false, error: "表单加载失败" }); }
  },
  retry() { this.setData({ loading: true, error: "" }); this.onLoad(this.options || {}); },
  field(event) { this.setData({ [`clubClass.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  type(event) { const index = Number(event.detail.value); this.setData({ typeIndex: index, "clubClass.classType": this.data.classTypes[index].value }); },
  status(event) { const index = Number(event.detail.value); this.setData({ statusIndex: index, "clubClass.status": this.data.statuses[index].value }); },
  async save() {
    if (this.data.saving) return;
    const clubClass = { ...this.data.clubClass, name: this.data.clubClass.name.trim(), headCoachName: this.data.clubClass.headCoachName.trim(), schedule: this.data.clubClass.schedule.trim(), venue: this.data.clubClass.venue.trim(), standardCapacity: Number(this.data.clubClass.standardCapacity) };
    if (!clubClass.name || !clubClass.ageGroup || !clubClass.headCoachName || !clubClass.schedule || !clubClass.venue || clubClass.standardCapacity < 1) { wx.showToast({ title: "请完整填写班级信息", icon: "none" }); return; }
    this.setData({ saving: true });
    try {
      await api.call("saveClass", { clubClass: { ...clubClass, id: this.data.id || undefined } });
      wx.showToast({ title: "班级已保存" }); setTimeout(() => wx.navigateBack(), 400);
    } finally { this.setData({ saving: false }); }
  }
});
