const api = require("../../utils/api");
const { chooseStudentPhoto } = require("../../utils/student-photo");

Page({
  data: { profile: { avatarUrl: "", name: "", gender: "男", birthDate: "2018-01-01", idCardNumber: "", school: "", grade: "", remark: "", relationship: "GUARDIAN" }, saving: false, uploading: false },
  field(event) { this.setData({ [`profile.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  date(event) { this.setData({ "profile.birthDate": event.detail.value }); },
  gender(event) { this.setData({ "profile.gender": event.detail.value }); },
  async avatar() {
    if (this.data.uploading) return;
    this.setData({ uploading: true });
    try { this.setData({ "profile.avatarUrl": await chooseStudentPhoto() }); }
    catch (error) { if (!/cancel/i.test(String(error.errMsg || error.message || ""))) wx.showToast({ title: "照片上传失败", icon: "none" }); }
    finally { this.setData({ uploading: false }); }
  },
  async save() {
    if (this.data.saving) return;
    if (!this.data.profile.avatarUrl) return wx.showToast({ title: "请先上传孩子本人照片", icon: "none" });
    this.setData({ saving: true });
    try {
      const result = await api.call("submitChildProfile", { profile: this.data.profile });
      wx.showModal({ title: "资料已提交", content: result.duplicateFound ? "发现可能已存在的学员档案，管理员将审核后绑定，不会重复创建。" : "管理员确认后，孩子会出现在你的学员列表中。", showCancel: false, success: () => wx.navigateBack() });
    } finally { this.setData({ saving: false }); }
  },
});
