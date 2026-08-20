const api = require("../../utils/api");
Page({
  data: { id: "", lead: null, role: "", meta: { coaches: [] }, loading: true }, onLoad(options) { this.setData({ id: options.id }); }, onShow() { this.load(); },
  async load() { const [context, meta, lead] = await Promise.all([api.call("getContext"), api.call("getCrmMeta"), api.call("getLead", { id: this.data.id })]); this.setData({ role: context.user.role, meta, lead, loading: false }); },
  go(event) { wx.navigateTo({ url: `${event.currentTarget.dataset.url}?leadId=${this.data.id}` }); }, edit() { wx.navigateTo({ url: `/pages/lead-form/index?id=${this.data.id}` }); },
  phone() { wx.makePhoneCall({ phoneNumber: this.data.lead.mobile }); }, copyWechat() { wx.setClipboardData({ data: this.data.lead.wechat || this.data.lead.mobile }); },
  assign() { wx.showActionSheet({ itemList: this.data.meta.coaches.map((item) => item.name), success: async (result) => { await api.call("assignLead", { id: this.data.id, ownerCoachId: this.data.meta.coaches[result.tapIndex].id }); wx.showToast({ title: "已重新分配" }); this.load(); } }); },
  publicPool() { wx.showModal({ title: "放入公海？", content: "放入后原负责人将无法继续查看。", success: async (result) => { if (result.confirm) { await api.call("moveLeadToPublic", { id: this.data.id }); wx.navigateBack(); } } }); },
  archive() { wx.showModal({ title: "归档线索？", content: "归档后默认列表不再显示，但历史记录仍保留。", success: async (result) => { if (result.confirm) { await api.call("archiveLead", { id: this.data.id }); wx.navigateBack(); } } }); },
  convert() { wx.navigateTo({ url: `/pages/lead-convert/index?leadId=${this.data.id}` }); }, feedback(event) { wx.navigateTo({ url: `/pages/trial-feedback/index?id=${event.currentTarget.dataset.id}` }); },
  cancelTrial(event) { const id = event.currentTarget.dataset.id; wx.showModal({ title: "取消体验课？", editable: true, placeholderText: "填写取消原因", success: async (result) => { if (result.confirm) { await api.call("cancelTrial", { id, reason: result.content || "计划调整" }); wx.showToast({ title: "体验课已取消" }); this.load(); } } }); }
});
