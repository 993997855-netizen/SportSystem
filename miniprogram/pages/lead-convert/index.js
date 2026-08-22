const api = require("../../utils/api");
const { today } = require("../../utils/format");
const { chooseStudentPhoto } = require("../../utils/student-photo");

Page({
  data: { leadId: "", lead: null, avatarUrl: "", uploading: false, classes: [], packages: [], coaches: [], packageIndex: 0, coachIndex: 0, registrationDate: today(), classIds: [], saving: false },
  async onLoad(options) {
    const [lead, allClasses, meta, products] = await Promise.all([api.call("getLead", { id: options.leadId }), api.call("listClasses"), api.call("getCrmMeta"), api.call("listProducts")]);
    const classes = allClasses.filter((item) => item.classType === "REGULAR"), packages = products.filter((item) => item.active && Number(item.lessonCount || 0) > 0).map((item) => ({ id: item.id, name: item.name, lessons: item.lessonCount, amount: item.price })), recommended = lead.trials && lead.trials[0] && lead.trials[0].recommendedClassId, classIds = recommended && classes.some((item) => item.id === recommended) ? [recommended] : [], coachIndex = Math.max(0, meta.coaches.findIndex((item) => item.id === lead.ownerCoachId));
    this.setData({ leadId: options.leadId, lead, avatarUrl: lead.avatarUrl || "", classes: classes.map((item) => ({ ...item, checked: classIds.includes(item.id) })), packages, coaches: meta.coaches, coachIndex, classIds });
  },
  async avatar() { if (this.data.uploading) return; this.setData({ uploading: true }); try { this.setData({ avatarUrl: await chooseStudentPhoto() }); } catch (error) { if (!String(error.errMsg || error.message || "").includes("cancel")) wx.showToast({ title: "照片上传失败", icon: "none" }); } finally { this.setData({ uploading: false }); } },
  classes(event) { const classIds = event.detail.value; this.setData({ classIds, classes: this.data.classes.map((item) => ({ ...item, checked: classIds.includes(item.id) })) }); },
  pack(event) { this.setData({ packageIndex: Number(event.detail.value) }); }, coach(event) { this.setData({ coachIndex: Number(event.detail.value) }); }, registrationDate(event) { this.setData({ registrationDate: event.detail.value }); },
  async perform(confirmDuplicate) {
    const pack = this.data.packages[this.data.packageIndex], coach = this.data.coaches[this.data.coachIndex] || {};
    const result = await api.call("convertLead", { id: this.data.leadId, avatarUrl: this.data.avatarUrl, classIds: this.data.classIds, productId: pack.id, amount: pack.amount, registrationDate: this.data.registrationDate, ownerCoachId: coach.id, ownerCoachName: coach.name, confirmDuplicate });
    if (result.duplicate) { wx.showModal({ title: "发现疑似重复学员", content: `${result.duplicate.name}（${result.duplicate.guardianName}）已经存在。仍要创建新学员吗？`, confirmText: "继续创建", success: (modal) => { if (modal.confirm) this.perform(true); } }); return; }
    wx.showToast({ title: result.orderId ? "已建档并创建首单" : "已转正式学员" }); setTimeout(() => wx.redirectTo({ url: result.orderId ? `/pages/order-detail/index?id=${result.orderId}` : `/pages/student-detail/index?id=${result.id}` }), 450);
  },
  async save() { if (!this.data.avatarUrl) return wx.showToast({ title: "请上传孩子本人照片", icon: "none" }); if (!this.data.classIds.length) return wx.showToast({ title: "请选择普通正式班", icon: "none" }); this.setData({ saving: true }); try { await this.perform(false); } finally { this.setData({ saving: false }); } }
});
