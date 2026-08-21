const api = require("../../utils/api");
const { chooseStudentPhoto } = require("../../utils/student-photo");

Page({
  data: {
    id: "",
    genders: ["男", "女"],
    genderIndex: 0,
    student: { avatarUrl: "", name: "", gender: "男", birthDate: "2016-01-01", school: "", grade: "", guardianName: "", guardianPhone: "", emergencyContact: "", healthNotes: "", remainingLessons: 0, totalLessons: 0, classIds: [] },
    originalAvatarUrl: "",
    uploading: false,
    saving: false,
    loading: true,
    error: ""
  },
  async onLoad(options) {
    this.options = options;
    wx.setNavigationBarTitle({ title: options.id ? "编辑学员" : "新增学员" });
    try {
      let student = this.data.student;
      if (options.id) student = await api.call("getStudent", { id: options.id });
      this.setData({ id: options.id || "", student, originalAvatarUrl: student.avatarUrl || "", genderIndex: student.gender === "女" ? 1 : 0, loading: false });
    } catch (error) { this.setData({ loading: false, error: "表单加载失败" }); }
  },
  retry() { this.setData({ loading: true, error: "" }); this.onLoad(this.options || {}); },
  field(event) { this.setData({ [`student.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  gender(event) { const index = Number(event.detail.value); this.setData({ genderIndex: index, "student.gender": this.data.genders[index] }); },
  birthDate(event) { this.setData({ "student.birthDate": event.detail.value }); },
  async avatar() {
    if (this.data.uploading) return;
    this.setData({ uploading: true });
    try { this.setData({ "student.avatarUrl": await chooseStudentPhoto() }); }
    catch (error) { if (!/cancel/i.test(String(error.errMsg || error.message || ""))) wx.showToast({ title: "照片上传失败", icon: "none" }); }
    finally { this.setData({ uploading: false }); }
  },
  async save() {
    if (this.data.saving) return;
    const student = { ...this.data.student, name: this.data.student.name.trim(), guardianName: this.data.student.guardianName.trim(), guardianPhone: String(this.data.student.guardianPhone || "").trim() };
    if (!student.avatarUrl || !student.name || !student.school || !student.grade || !student.guardianName || !student.guardianPhone) { wx.showToast({ title: "请填写孩子照片、学校、年级和家长信息", icon: "none" }); return; }
    if (!student.guardianPhone.includes("*") && !/^1\d{10}$/.test(student.guardianPhone)) { wx.showToast({ title: "请输入正确的11位手机号", icon: "none" }); return; }
    if (!this.data.id && (!Number.isFinite(Number(student.remainingLessons)) || Number(student.remainingLessons) < 0)) { wx.showToast({ title: "初始课时不能小于0", icon: "none" }); return; }
    this.setData({ saving: true });
    try {
      const saved = await api.call("saveStudent", { student: { ...student, id: this.data.id || undefined } });
      const studentId = this.data.id || saved.id;
      if (student.avatarUrl !== this.data.originalAvatarUrl) await api.call("updateStudentAvatar", { studentId, avatarUrl: student.avatarUrl });
      wx.showToast({ title: "保存成功" });
      setTimeout(() => wx.navigateBack(), 400);
    } finally { this.setData({ saving: false }); }
  }
});
