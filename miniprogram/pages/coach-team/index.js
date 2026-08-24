const api = require("../../utils/api");

Page({
  data: { loading: true, error: "", role: "parent", coaches: [] },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const context = await api.call("getContext");
      const rows = await api.call(context.user.role === "admin" ? "listCoachProfiles" : "listPublicCoaches");
      const coaches = rows.map((item) => ({
        ...item,
        coachId: item.coachId || item.id,
        isPublic: item.isPublic !== false,
        initial: (item.name || "教")[0],
        experienceText: `${Number(item.coachingYears || 0)}年青训执教经验`,
        specialtyText: (item.specialties || []).slice(0, 3).join(" · ")
      }));
      this.setData({ role: context.user.role, coaches, loading: false });
    } catch (error) { this.setData({ loading: false, error: "教练团队加载失败，请稍后重试" }); }
  },
  detail(event) { if (this.data.role === "admin" && event.currentTarget.dataset.public === false) return this.edit(event); wx.navigateTo({ url: `/pages/coach-detail/index?id=${event.currentTarget.dataset.id}` }); },
  edit(event) { wx.navigateTo({ url: `/pages/coach-profile-form/index?id=${event.currentTarget.dataset.id}` }); },
  add() { wx.navigateTo({ url: "/pages/coach-profile-form/index" }); }
});
