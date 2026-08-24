const ACTIONS = [
  "listPublicCoaches",
  "getPublicCoach",
  "listCoachProfiles",
  "getCoachProfile",
  "saveCoachProfile",
  "updateCoachAvatar"
];

const PUBLIC_KEYS = [
  "coachId",
  "name",
  "avatarUrl",
  "publicTitle",
  "coachingYears",
  "highestCertificate",
  "mainCertificates",
  "currentClasses",
  "specialties",
  "shortBio"
];

const DEMO_COACHES = [
  {
    id: "coach-profile-you",
    coachUserId: "coach1",
    name: "游导",
    avatarUrl: "/images/nanlian-logo.png",
    publicTitle: "U8精英队主教练",
    coachingYears: 10,
    highestCertificate: "中国足协B级教练员",
    certificates: [
      { name: "中国足协B级教练员", visibility: "PUBLIC", priority: 1 },
      { name: "青少年急救培训证", visibility: "PUBLIC", priority: 2 },
      { name: "俱乐部内部教研认证", visibility: "INTERNAL", priority: 3 }
    ],
    currentClasses: ["U8提高班", "U7精英队", "U8精英队"],
    specialties: ["1V1", "控球", "比赛指导", "梯队建设"],
    shortBio: "长期从事青少年足球训练，主要负责南联精英梯队培养。注重个人技术、比赛意识和训练兴趣，鼓励孩子在比赛中主动观察和解决问题。",
    bio: "负责南联青训训练体系与精英梯队建设，长期参与青少年足球训练、赛事组织和升学衔接工作。",
    careerHistory: ["2016-2020 青少年足球教练", "2021-2025 南联精英梯队主教练", "2026至今 南联青训负责人"],
    footballHistory: ["长期参加温州地区高水平成人足球赛事"],
    trainingPhilosophy: "让孩子在真实比赛问题中学会观察、判断和行动。",
    honors: ["带队参加浙江省青少年足球联赛"],
    internalNote: "头牌全职教练，内部薪资与绩效信息不得公开。",
    active: true,
    isPublic: true,
    createdAt: "2026-08-01 10:00",
    updatedAt: "2026-08-01 10:00"
  },
  {
    id: "coach-profile-wang",
    coachUserId: "coach2",
    name: "王蒋生",
    avatarUrl: "/images/avatar.png",
    publicTitle: "基础班主教练",
    coachingYears: 6,
    highestCertificate: "中国足协D级教练员",
    certificates: [{ name: "中国足协D级教练员", visibility: "PUBLIC", priority: 1 }],
    currentClasses: ["U6启蒙班", "U7基础班"],
    specialties: ["足球启蒙", "球感训练", "兴趣培养"],
    shortBio: "主要负责幼儿及小学阶段基础训练，重视球感、协调性和训练兴趣，用清晰、有耐心的方式帮助孩子建立足球基本能力。",
    bio: "长期参与幼儿和小学年龄段足球启蒙工作。",
    careerHistory: ["2020至今 南联基础班教练"],
    footballHistory: [],
    trainingPhilosophy: "先让孩子喜欢足球，再帮助孩子掌握足球。",
    honors: [],
    internalNote: "兼职教练资料，证书有效期需由管理员定期核验。",
    active: true,
    isPublic: true,
    createdAt: "2026-08-01 10:05",
    updatedAt: "2026-08-01 10:05"
  }
];

function strings(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(/[\n,，、]+/).map((item) => item.trim()).filter(Boolean);
}

function publicCertificates(profile) {
  const names = (profile.certificates || [])
    .filter((item) => typeof item === "string" || item.visibility !== "INTERNAL")
    .sort((a, b) => Number((a || {}).priority || 99) - Number((b || {}).priority || 99))
    .map((item) => typeof item === "string" ? item : item.name)
    .filter(Boolean);
  return [...new Set([profile.highestCertificate, ...names].filter(Boolean))];
}

function publicView(profile) {
  if (!profile || profile.active === false || profile.isPublic === false) return null;
  return {
    coachId: profile.id,
    name: String(profile.name || ""),
    avatarUrl: String(profile.avatarUrl || ""),
    publicTitle: String(profile.publicTitle || ""),
    coachingYears: Math.max(0, Number(profile.coachingYears || 0)),
    highestCertificate: String(profile.highestCertificate || ""),
    mainCertificates: publicCertificates(profile),
    currentClasses: strings(profile.currentClasses),
    specialties: strings(profile.specialties).slice(0, 3),
    shortBio: String(profile.shortBio || "").slice(0, 120)
  };
}

function coachReference(data, coachUserId, coachName) {
  const profile = (data.coachProfiles || []).find((item) => item.active !== false && item.isPublic !== false && ((coachUserId && item.coachUserId === coachUserId) || (coachName && item.name === coachName)));
  return { coachId: profile ? profile.id : "", name: String(coachName || (profile || {}).name || ""), avatarUrl: String((profile || {}).avatarUrl || "") };
}

function ensure(data) {
  if (!Array.isArray(data.coachProfiles)) data.coachProfiles = [];
  for (const demo of DEMO_COACHES) {
    if (!data.coachProfiles.some((item) => item.id === demo.id)) data.coachProfiles.push({ ...demo });
  }
}

function normalizeProfile(profile, previous, ctx) {
  const shortBio = String(profile.shortBio || "").trim();
  const avatarUrl = String(profile.avatarUrl || "").trim();
  if (shortBio.length > 120) throw new Error("家长端简短介绍不能超过120字");
  if (/^data:image\//i.test(avatarUrl)) throw new Error("教练照片不能使用base64保存");
  const name = String(profile.name || "").trim();
  const publicTitle = String(profile.publicTitle || "").trim();
  const highestCertificate = String(profile.highestCertificate || "").trim();
  if (!name || !publicTitle || !highestCertificate) throw new Error("请完整填写家长公开资料");
  const certificates = (profile.certificates || []).map((item, index) => ({
    name: String(typeof item === "string" ? item : item.name || "").trim(),
    visibility: typeof item === "string" ? "PUBLIC" : item.visibility === "INTERNAL" ? "INTERNAL" : "PUBLIC",
    priority: Number((item || {}).priority || index + 1)
  })).filter((item) => item.name);
  return {
    ...previous,
    ...profile,
    name,
    avatarUrl,
    publicTitle,
    coachingYears: Math.max(0, Number(profile.coachingYears || 0)),
    highestCertificate,
    certificates,
    currentClasses: strings(profile.currentClasses),
    specialties: strings(profile.specialties),
    shortBio,
    bio: String(profile.bio || "").trim(),
    careerHistory: strings(profile.careerHistory),
    footballHistory: strings(profile.footballHistory),
    trainingPhilosophy: String(profile.trainingPhilosophy || "").trim(),
    honors: strings(profile.honors),
    internalNote: String(profile.internalNote || "").trim(),
    active: profile.active !== false,
    isPublic: profile.isPublic !== false,
    updatedAt: ctx.stamp()
  };
}

async function call(action, input, ctx) {
  const { data, role } = ctx;
  ensure(data);
  if (action === "listPublicCoaches") return data.coachProfiles.map(publicView).filter(Boolean);
  if (action === "getPublicCoach") {
    const result = publicView(data.coachProfiles.find((item) => item.id === input.id));
    if (!result) throw new Error("教练资料不存在或未公开");
    return result;
  }
  if (action === "listCoachProfiles") {
    if (role !== "admin") throw new Error("没有执行该操作的权限");
    return data.coachProfiles.map((item) => ({ ...item }));
  }
  if (action === "getCoachProfile") {
    if (role !== "admin") throw new Error("没有执行该操作的权限");
    const result = data.coachProfiles.find((item) => item.id === input.id);
    if (!result) throw new Error("教练资料不存在");
    return { ...result };
  }
  if (action === "saveCoachProfile") {
    if (role !== "admin") throw new Error("没有执行该操作的权限");
    const incoming = input.coach || {};
    let id = incoming.id;
    const previous = id ? data.coachProfiles.find((item) => item.id === id) : null;
    if (id && !previous) throw new Error("教练资料不存在");
    if (!id) id = ctx.uid("coach-profile-");
    const normalized = normalizeProfile({ ...incoming, id }, previous || { id, createdAt: ctx.stamp() }, ctx);
    if (previous) Object.assign(previous, normalized); else data.coachProfiles.push(normalized);
    ctx.audit("SAVE_COACH_PROFILE", "coachProfile", id, { isPublic: normalized.isPublic });
    ctx.save();
    return { id };
  }
  if (action === "updateCoachAvatar") {
    if (role !== "admin") throw new Error("没有执行该操作的权限");
    const profile = data.coachProfiles.find((item) => item.id === input.coachId);
    if (!profile) throw new Error("教练资料不存在");
    const newAvatarUrl = String(input.avatarUrl || "").trim();
    if (!newAvatarUrl || /^data:image\//i.test(newAvatarUrl)) throw new Error("教练照片地址无效");
    const oldAvatarUrl = String(profile.avatarUrl || "");
    if (oldAvatarUrl === newAvatarUrl) return { coachId: profile.id, avatarUrl: newAvatarUrl, unchanged: true };
    profile.avatarUrl = newAvatarUrl;
    profile.updatedAt = ctx.stamp();
    ctx.audit("UPDATE_COACH_AVATAR", "coachProfile", profile.id, { coachId: profile.id, operatorId: ctx.userId, oldAvatarUrl, newAvatarUrl });
    ctx.save();
    return { coachId: profile.id, avatarUrl: newAvatarUrl, unchanged: false };
  }
  throw new Error("未知教练资料操作");
}

module.exports = { ACTIONS, PUBLIC_KEYS, DEMO_COACHES, ensure, handles: (action) => ACTIONS.includes(action), publicView, coachReference, call };
