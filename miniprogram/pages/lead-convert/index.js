const api = require("../../utils/api");
const { today } = require("../../utils/format");
const { chooseStudentPhoto } = require("../../utils/student-photo");

Page({
  data: { leadId: "", lead: null, avatarUrl: "", uploading: false, coaches: [], coachIndex: 0, registrationDate: today(), saving: false },
  async onLoad(options) {
    const [lead, meta] = await Promise.all([api.call("getLead", { id: options.leadId }), api.call("getCrmMeta")]);
    const coachIndex = Math.max(0, meta.coaches.findIndex((item) => item.id === lead.ownerCoachId));
    this.setData({ leadId: options.leadId, lead, avatarUrl: lead.avatarUrl || "", coaches: meta.coaches, coachIndex });
  },
  async avatar() {
    if (this.data.uploading) return;
    this.setData({ uploading: true });
    try { this.setData({ avatarUrl: await chooseStudentPhoto() }); }
    catch (error) { if (!String(error.errMsg || error.message || "").includes("cancel")) wx.showToast({ title: "照片上传失败", icon: "none" }); }
    finally { this.setData({ uploading: false }); }
  },
  coach(event) { this.setData({ coachIndex: Number(event.detail.value) }); },
  registrationDate(event) { this.setData({ registrationDate: event.detail.value }); },
  async save() {
    if (!this.data.avatarUrl) return wx.showToast({ title: "请上传孩子本人照片", icon: "none" });
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const coach = this.data.coaches[this.data.coachIndex] || {};
      const result = await api.call("convertLead", { id: this.data.leadId, avatarUrl: this.data.avatarUrl, classIds: [], registrationDate: this.data.registrationDate, ownerCoachId: coach.id, ownerCoachName: coach.name });
      if (result.duplicate) {
        wx.showModal({ title: "发现已有学员档案", content: `${result.duplicate.name}（${result.duplicate.guardianName}）已经存在。为避免重复档案，请由管理员核对并处理。`, showCancel: false });
        return;
      }
      wx.showModal({ title: "已转为正式学员", content: "已创建零课时学员档案，尚未绑定家长、尚未编班。请继续通过家长邀请、班级管理和课程购买完成后续流程。", showCancel: false, success: () => wx.redirectTo({ url: `/pages/student-detail/index?id=${result.id}` }) });
    } finally { this.setData({ saving: false }); }
  },
});
