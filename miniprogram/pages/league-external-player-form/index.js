const api = require("../../utils/api");
Page({
  data: { teamId: "", name: "", gender: "男", birthYear: "2017", jerseyNumber: "", remark: "", saving: false },
  onLoad(options) { this.setData({ teamId: options.teamId || "" }); },
  field(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  gender(event) { this.setData({ gender: event.detail.value ? "女" : "男" }); },
  async save() { if (!this.data.name.trim()) return wx.showToast({ title: "请填写球员姓名", icon: "none" }); this.setData({ saving: true }); try { await api.call("saveExternalPlayer", { teamId: this.data.teamId, name: this.data.name.trim(), gender: this.data.gender, birthYear: this.data.birthYear, jerseyNumber: this.data.jerseyNumber, remark: this.data.remark }); wx.showToast({ title: "外部球员已保存" }); this.setData({ name: "", jerseyNumber: "", remark: "" }); } finally { this.setData({ saving: false }); } },
  done() { wx.navigateBack({ delta: 2 }); }
});
