const api = require("../../utils/api");

Page({
  data: {
    role: "admin", renewals: [], students: [], showForm: false, studentId: "", studentIndex: 0, packageIndex: 1, loading: true, error: "", submitting: false, confirmingId: "",
    packages: [{ id: "p14", lessons: 14, amount: 1380, label: "一周一练 · 14节 · ¥1380" }, { id: "p28", lessons: 28, amount: 1980, label: "一周两练 · 28节 · ¥1980" }]
  },
  onLoad(options) { this.setData({ studentId: options.studentId || "" }); },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const [context, renewals, students] = await Promise.all([api.call("getContext"), api.call("listRenewals"), api.call("listStudents")]);
      const studentIndex = Math.max(0, students.findIndex((item) => item.id === this.data.studentId));
      this.setData({ role: context.user.role, renewals, students, studentIndex, showForm: context.user.role !== "coach" && Boolean(this.data.studentId), loading: false });
    } catch (error) { this.setData({ loading: false, error: "续费记录加载失败" }); }
  },
  openForm() { this.setData({ showForm: true }); },
  closeForm() { if (!this.data.submitting) this.setData({ showForm: false }); },
  student(event) { this.setData({ studentIndex: Number(event.detail.value) }); },
  package(event) { this.setData({ packageIndex: Number(event.detail.value) }); },
  async create() {
    if (this.data.submitting) return;
    const student = this.data.students[this.data.studentIndex];
    const pack = this.data.packages[this.data.packageIndex];
    if (!student || !pack) { wx.showToast({ title: "请选择学员和套餐", icon: "none" }); return; }
    this.setData({ submitting: true });
    try {
      await api.call("createRenewal", { studentId: student.id, packageId: pack.id });
      wx.showToast({ title: "续费申请已提交" }); this.setData({ showForm: false, studentId: "" }); this.load();
    } finally { this.setData({ submitting: false }); }
  },
  confirm(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "确认到账",
      content: "确认后将立即增加孩子的剩余课时。",
      success: async (result) => {
        if (!result.confirm) return;
        if (this.data.confirmingId) return;
        this.setData({ confirmingId: id });
        try {
          await api.call("confirmRenewal", { id });
          wx.showToast({ title: "已确认并加课" }); this.load();
        } finally { this.setData({ confirmingId: "" }); }
      }
    });
  }
});
