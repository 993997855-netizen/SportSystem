const api = require("../../utils/api");
const { roleLabels } = require("../../utils/format");
const navigation = require("../../utils/navigation-config");

Page({
  data: { context: null, roleLabel: "", modeLabel: "", menuEntries: [], activeStudentId: "", inviteCode: "", loading: true, error: "", binding: false, switchingRole: false, roles: [{ value: "admin", label: "管理员" }, { value: "coach", label: "教练员" }, { value: "parent", label: "家长" }] },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const context = await api.call("getContext");
      let activeStudentId = "";
      if (context.user.role === "parent") {
        const family = await api.call("getFamilyContext").catch(() => null);
        activeStudentId = family && family.activeStudentId ? family.activeStudentId : "";
      }
      this.setData({ context, activeStudentId, menuEntries: navigation.profileEntries(context.user.role), roleLabel: roleLabels[context.user.role], modeLabel: context.mode === "local" ? "本地演示" : "云端共享", loading: false });
    } catch (error) { this.setData({ loading: false, error: "账号信息加载失败" }); }
  },
  async switchRole(event) {
    const role = event.currentTarget.dataset.role;
    if (!this.data.context.canSwitchTestRole || this.data.switchingRole) return;
    this.setData({ switchingRole: true });
    try {
      await api.call("switchTestRole", { role });
      wx.showToast({ title: `已切换为${roleLabels[role]}`, icon: "none" });
      await this.load();
    } finally {
      this.setData({ switchingRole: false });
    }
  },
  openMenu(event) {
    const key = event.currentTarget.dataset.key;
    const params = {};
    if (key === "parentGrowth" || key === "parentAssessment") {
      if (!this.data.activeStudentId) { wx.showToast({ title: "请先添加孩子", icon: "none" }); return; }
      params.studentId = this.data.activeStudentId;
    }
    navigation.openFeature(key, this.data.context.user.role, params);
  },
  register() { wx.navigateTo({ url: "/pages/parent-child-form/index" }); },
  logout() {
    wx.showModal({ title: "退出登录", content: "退出只会清理本机登录状态，不会删除账号、孩子或历史业务数据。", success: (result) => { if (result.confirm) api.logout(); } });
  },
  inviteInput(event) { this.setData({ inviteCode: String(event.detail.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) }); },
  async claimInvite() {
    if (this.data.binding) return;
    if (this.data.inviteCode.length !== 6) { wx.showToast({ title: "请输入6位邀请码", icon: "none" }); return; }
    if (/^NL[A-Z0-9]{4}$/.test(this.data.inviteCode)) {
      wx.navigateTo({ url: `/pages/coach-bind/index?code=${this.data.inviteCode}` });
      return;
    }
    this.setData({ binding: true });
    try {
      await api.call("claimInvite", { code: this.data.inviteCode });
      wx.showToast({ title: "身份绑定成功" }); this.setData({ inviteCode: "" }); this.load();
    } finally { this.setData({ binding: false }); }
  }
});
