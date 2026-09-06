const api = require("../../utils/api");

Page({
  data: { loading: true, error: "", role: "parent", viewMode: "team", pageTitle: "南联教练团队", coaches: [], visibleCoaches: [], filter: "ALL" },
  onLoad(options) { this.setData({ viewMode: options.mode || "team" }); },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const context = await api.call("getContext");
      const selfMode = context.user.role === "coach" && this.data.viewMode === "self";
      const testRoleWithoutCoach = selfMode && context.canSwitchTestRole && !context.user.coachId;
      const raw = testRoleWithoutCoach ? [] : await api.call(context.user.role === "admin" ? "listCoachProfiles" : selfMode ? "getMyPublicCoach" : "listPublicCoaches");
      const rows = Array.isArray(raw) ? raw : [raw];
      const coaches = rows.map((item) => ({
        ...item,
        profileId: item.id || item.coachId,
        coachId: item.coachId || item.id,
        isPublic: item.isPublic !== false,
        initial: (item.name || "教")[0],
        experienceText: `${Number(item.coachingYears || 0)}年青训执教经验`,
        specialtyText: (item.specialties || []).slice(0, 3).join(" · ")
      }));
      const visibleCoaches = coaches;
      const pageTitle = context.user.role === "admin" ? "教练管理" : selfMode ? "我的资料" : "南联教练团队";
      wx.setNavigationBarTitle({ title: pageTitle });
      this.setData({ role: context.user.role, pageTitle, testRoleWithoutCoach, coaches, visibleCoaches, loading: false });
    } catch (error) { this.setData({ loading: false, error: "教练团队加载失败，请稍后重试" }); }
  },
  detail(event) { if (this.data.role === "admin" && event.currentTarget.dataset.public === false) return this.edit(event); wx.navigateTo({ url: `/pages/coach-detail/index?id=${event.currentTarget.dataset.id}` }); },
  edit(event) { wx.navigateTo({ url: `/pages/coach-profile-form/index?id=${event.currentTarget.dataset.id}` }); },
  filter(event) { const filter = event.currentTarget.dataset.filter, visibleCoaches = filter === "ALL" ? this.data.coaches : this.data.coaches.filter((item) => item.accountStatus === filter); this.setData({ filter, visibleCoaches }); },
  invite(event) { wx.navigateTo({ url: `/pages/coach-profile-form/index?id=${event.currentTarget.dataset.id}&invite=1` }); },
  add() { wx.navigateTo({ url: "/pages/coach-profile-form/index" }); }
});
