const api = require("../../utils/api");
const { chooseCoachPhoto } = require("../../utils/coach-photo");

function splitValues(value) { return String(value || "").split(/[\n,，、]+/).map((item) => item.trim()).filter(Boolean); }

Page({
  data: {
    id: "", saving: false, savingAvatar: false, uploading: false, photoDirty: false, originalAvatarUrl: "", previewAvatarUrl: "", shortBioCount: 0,
    coach: { avatarUrl: "", name: "", publicTitle: "", coachingYears: 0, highestCertificate: "", shortBio: "", bio: "", trainingPhilosophy: "", internalNote: "", active: true, isPublic: true },
    currentClassesText: "", specialtiesText: "", publicCertificatesText: "", internalCertificatesText: "", careerHistoryText: "", footballHistoryText: "", honorsText: ""
  },
  async onLoad(options) {
    if (!options.id) return;
    const coach = await api.call("getCoachProfile", { id: options.id });
    const publicCertificates = (coach.certificates || []).filter((item) => item.visibility !== "INTERNAL").map((item) => item.name).filter((item) => item !== coach.highestCertificate);
    const internalCertificates = (coach.certificates || []).filter((item) => item.visibility === "INTERNAL").map((item) => item.name);
    this.setData({ id: options.id, coach, originalAvatarUrl: coach.avatarUrl || "", previewAvatarUrl: coach.avatarUrl || "", shortBioCount: String(coach.shortBio || "").length, currentClassesText: (coach.currentClasses || []).join("、"), specialtiesText: (coach.specialties || []).join("、"), publicCertificatesText: publicCertificates.join("\n"), internalCertificatesText: internalCertificates.join("\n"), careerHistoryText: (coach.careerHistory || []).join("\n"), footballHistoryText: (coach.footballHistory || []).join("\n"), honorsText: (coach.honors || []).join("\n") });
  },
  field(event) { const key = event.currentTarget.dataset.key, value = event.detail.value; this.setData({ [`coach.${key}`]: value, ...(key === "shortBio" ? { shortBioCount: value.length } : {}) }); },
  textField(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  toggle(event) { this.setData({ [`coach.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  async avatar() {
    if (this.data.uploading) return;
    this.setData({ uploading: true });
    try {
      const avatarUrl = await chooseCoachPhoto();
      if (this.data.id) this.setData({ previewAvatarUrl: avatarUrl, photoDirty: avatarUrl !== this.data.originalAvatarUrl });
      else this.setData({ previewAvatarUrl: avatarUrl, "coach.avatarUrl": avatarUrl });
    } catch (error) { if (!/cancel/i.test(String(error.errMsg || error.message || ""))) wx.showToast({ title: "头像上传失败", icon: "none" }); }
    finally { this.setData({ uploading: false }); }
  },
  previewPhoto() { if (this.data.previewAvatarUrl) wx.previewImage({ current: this.data.previewAvatarUrl, urls: [this.data.previewAvatarUrl] }); },
  cancelAvatar() { this.setData({ previewAvatarUrl: this.data.originalAvatarUrl, photoDirty: false }); },
  async saveAvatar() {
    if (!this.data.id || !this.data.photoDirty || this.data.savingAvatar) return;
    this.setData({ savingAvatar: true });
    try {
      const result = await api.call("updateCoachAvatar", { coachId: this.data.id, avatarUrl: this.data.previewAvatarUrl });
      this.setData({ "coach.avatarUrl": result.avatarUrl, originalAvatarUrl: result.avatarUrl, previewAvatarUrl: result.avatarUrl, photoDirty: false });
      wx.showToast({ title: "教练照片已更新" });
    } catch (error) { wx.showToast({ title: error.message || "照片保存失败", icon: "none" }); }
    finally { this.setData({ savingAvatar: false }); }
  },
  async save() {
    if (this.data.saving) return;
    if (this.data.photoDirty) return wx.showToast({ title: "请先保存或取消照片修改", icon: "none" });
    const coach = { ...this.data.coach, id: this.data.id || undefined, coachingYears: Number(this.data.coach.coachingYears || 0), currentClasses: splitValues(this.data.currentClassesText), specialties: splitValues(this.data.specialtiesText), careerHistory: splitValues(this.data.careerHistoryText), footballHistory: splitValues(this.data.footballHistoryText), honors: splitValues(this.data.honorsText), certificates: [{ name: this.data.coach.highestCertificate, visibility: "PUBLIC", priority: 1 }, ...splitValues(this.data.publicCertificatesText).map((name, index) => ({ name, visibility: "PUBLIC", priority: index + 2 })), ...splitValues(this.data.internalCertificatesText).map((name, index) => ({ name, visibility: "INTERNAL", priority: index + 50 }))] };
    if (!coach.avatarUrl || !coach.name || !coach.publicTitle || !coach.highestCertificate || !coach.shortBio) return wx.showToast({ title: "请完整填写公开资料", icon: "none" });
    this.setData({ saving: true });
    try { await api.call("saveCoachProfile", { coach }); wx.showToast({ title: "教练资料已保存" }); setTimeout(() => wx.navigateBack(), 350); } finally { this.setData({ saving: false }); }
  }
});
