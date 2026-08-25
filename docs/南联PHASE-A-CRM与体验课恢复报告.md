# 南联青训 PHASE A：CRM 与体验课恢复报告

## 本阶段边界

本阶段只恢复 CRM 招生与体验课。训练大纲、周训练计划、成长档案、阶段测评、精英队选拔和周日成长联赛均未启用，等待下一阶段确认后再继续。

## Restore Audit

| 检查项 | 恢复前 | PHASE A 完成后 |
| --- | --- | --- |
| 已有页面 | Git 历史中存在 10 个 CRM/体验课页面，正式版已下线 | 10 个页面按当前模型恢复并注册 |
| 已有 domain | `miniprogram/utils/crm-domain.js` 仍保留本地演示逻辑 | 已修正为具体 session 预约、独立体验名单、零课时转正式 |
| 已有 service | 历史 `cloudfunctions/clubApi/crm.js` 已从正式版删除 | 新正式实现为 `crm-service.js`；`crm.js` 仅保留兼容导出 |
| 已有云函数 | 历史动作曾存在，当前 `v2.js` 未注册 | 18 个 CRM 动作已接回统一 `clubApi` |
| 已有 collection | 历史模型为 `leads`、`leadFollowUps`、`trialBookings` | 三个集合加入云端自动建集合清单并复用原命名 |
| 已有测试 | 历史 CRM 测试被正式版删除 | 新增 PHASE A 42 项回归测试 |
| 当前是否注册 | 否 | 是，`app.json` 共 44 页 |
| 当前是否被正式路由调用 | 否，仅本地 domain 残留 | 是，页面 → `clubApi` → `crmService` → 云数据库 |

## 恢复的业务流程

```text
咨询 / 新线索
→ 跟进
→ 预约具体体验课 session
→ 课程内“体验学员”独立名单
→ 体验课点名
→ 体验课反馈
→ 次日回访
→ 管理员转正式学员
→ 家长绑定 / 管理员编班 / 课程购买分别处理
```

## 页面与角色入口

- ADMIN：首页“招生中心”，运营后台“招生中心”。可看全部线索、分配、跟进、预约体验课、反馈、统计、转正式学员。
- COACH：首页“我的招生”。只读取自己的线索；可跟进、管理自己权限内的体验课并填写反馈。
- PARENT：没有 CRM 入口；即使直接调用接口也会被云端角色校验拒绝。

恢复页面：

1. 招生中心
2. 招生线索列表
3. 新增/编辑线索
4. 线索详情
5. 添加跟进
6. 体验课管理
7. 预约体验课
8. 体验课反馈
9. 转正式学员
10. 招生统计

## 体验课与当前正式模型的兼容方式

- 体验预约必须绑定现有 `sessions` 中的一节具体课程。
- `classId`、`coachId`、`venueId`、日期均从 session 及其班级/教练关系派生，不由客户端随意指定。
- 容量校验读取 `classMembers` 中 ACTIVE 正式成员，再加本节有效体验预约。
- 体验学员只保存在 `trialBookings`，在课程详情和点名页显示为独立区域。
- 体验点名只更新 `trialBookings.attendanceStatus`，不写 `attendance`，不写 `lessonLedger`。
- 体验预约与转正式都不会创建或修改任何候补记录。

## 体验课反馈

教练填写 1～5 分的：

- 训练参与
- 协调表现
- 球感基础
- 理解能力
- 训练积极性

同时填写综合评价和推荐班级。保存后保留历史反馈，并自动建立次日“体验课后回访”任务。

## CRM 转正式学员

转换复用当前 `saveStudent` 正式建档逻辑，同时保留：

- `crmLeadId`
- 招生来源
- 招生负责人
- 报名日期
- 最近体验课与反馈关联

转换结果严格为：

- 创建正式 student
- `remainingLessons = 0`
- 不创建 `classMember`
- 不生成课时流水
- 不绑定精英队
- 不创建候补
- 暂不写 `ownerParentUserId`，后续通过现有家长邀请/归属流程绑定

管理员随后分别通过班级管理、课程购买和家长邀请完成正式业务，避免 CRM 绕过当前核心约束。

## 权限与隐私

- 云端统一使用 ADMIN / COACH / PARENT 三角色，没有新增角色系统。
- 教练只访问 `ownerCoachId` 为自己的线索；公海只允许教练领取。
- 教练预约体验课时还必须拥有该 session 的管理权限。
- 家长无法调用 CRM 接口。
- CRM 接口不读取或返回 `studentPrivateProfiles.idCardNumber`。
- 正式学员照片继续统一使用 `student.avatarUrl`。

## 旧代码处理

- 正式启用：历史 CRM 页面结构、`crm-domain.js` 本地演示能力、线索/跟进/体验课集合命名。
- 重构后启用：云端 `crm-service.js`、session 体验名单、体验点名、零课时转正式。
- 兼容保留：`cloudfunctions/clubApi/crm.js` 仅转发到新正式 service，不存在第二套运行逻辑。
- 未恢复：旧“转正式同时选班”、旧“自动生成首单”、任何 waitlist/自动补位逻辑。

## 自动化测试结果

- CRM regression: 42 checks passed
- Registered pages: 44
- Missing page files: 0
- Formal core regression: 44 pages passed
- Fixed class membership regression: 16 checks passed
- Waitlist removal regression: 4 checks passed
- Leave regression: 15 checks passed
- Attendance regression: 16 checks passed
- Lesson ledger regression: 11 checks passed
- Parent ownership regression: 12 checks passed
- Family & identity regression: 28 checks passed
- Student photo regression: 13 checks passed
- Unified timetable regression: 10 checks passed
- 当前 `tests/*.js` 全量回归通过

## P0 / P1 / P2

- P0：无。
- P1：云端正式使用前，需要在微信开发者工具重新上传并部署 `clubApi`，以创建/复用三个 CRM 集合和启用新路由。
- P2：建议真实账号验收一次“管理员建线索 → 教练体验点名/反馈 → 管理员转正式 → 家长邀请 → 管理员编班”，验证现有云数据库历史数据与新字段的兼容情况。

## PHASE A 结论

- waitlist 重新出现：NO。
- 请假仍只影响单节 attendance：YES。
- `classMembers` 仍是班级成员唯一权威来源：YES。
- 课表仍统一读取 `sessions`：YES。
- 身份证完整号码仍只有管理员通过独立隐私接口读取：YES。

PHASE A 已完成并停止，不继续 PHASE B。
