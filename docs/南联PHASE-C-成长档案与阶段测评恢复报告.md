# 南联 PHASE C：成长档案与阶段测评恢复报告

## 一、阶段结论

PHASE C 已完成本地恢复、增量适配与回归验证。本阶段仅恢复“成长档案 + 阶段测评 + 日常训练评价”，未进入精英选拔、赛事运营或周日成长联赛。

当前业务链路为：

```text
正式学员
→ 自动获得成长档案
→ 教练记录日常训练评价
→ 管理员创建阶段测评轮次
→ 授权教练按五个维度测评
→ 管理员发布
→ 家长查看自己孩子的历史与趋势
```

## 二、Restore Audit

恢复前检查确认，历史版本已经存在成长领域模型、云端服务、页面和回归测试，因此本阶段采用“恢复后适配”，没有重新创造第二套数据结构。

发现并处理的兼容问题：

1. 历史家长权限依赖 `users.studentIds`，已改为调用当前唯一归属权限校验，最终以 `student.ownerParentUserId` 为权威来源。
2. 教练权限改为根据 `ACTIVE classMembers` 与教练被授权班级共同判断。
3. 历史成长页面包含通往后续赛事编辑功能的入口；PHASE C 未恢复该写入入口，只保留已有比赛记录的只读呈现，避免越过阶段边界。
4. 本地演示权限上下文曾在指定教练账号时错误回退到 `coach1` 的班级范围，已修正为始终使用当前 `userId`，防止教练跨班读取或写入。
5. 成长接口增加身份证字段防御性清理。即使旧数据误把身份证字段混入 `students`，也不会从成长档案、测评名单或训练评价名单返回。

## 三、已恢复能力

### 1. 自动成长档案

成长档案不需要管理员手工创建。任何状态为 `active` 的正式学员，使用原有 `studentId` 即可实时聚合：

- 学员照片与基本资料
- 当前正式班级
- 训练时长与最近训练日期
- 当月出勤统计
- 日常训练评价
- 阶段测评历史
- 五维能力趋势
- 比赛记录
- 班级、测评、训练及比赛成长事件

### 2. 五维阶段测评

顶层维度固定为：

- `TECHNICAL`：技术
- `TACTICAL`：战术
- `ATHLETIC`：运动能力
- `MATCH`：比赛能力
- `DEVELOPMENT`：训练表现

评分为 1～5 级，并具有对应文字解释。雷达与历史比较只使用以上五个顶层维度，不生成公开排名。

### 3. 测评轮次与历史

- 管理员创建班级阶段测评轮次。
- 名单仅取该班 `ACTIVE classMembers`。
- 授权教练可以逐个填写并完成测评。
- 发布前必须完成全部正式成员测评。
- 不同轮次产生不同记录，后续轮次不会覆盖历史轮次。
- 趋势按 `assessmentDate` 正序生成，只比较该学员自身历史。

### 4. 日常训练评价

日常训练评价使用独立 `feedback` 数据，不写入 `playerAssessments`，与阶段测评严格分离。教练可在单节课程中评价正式成员，也可批量添加训练标签。

## 四、数据与接口

云端新增或恢复使用以下集合：

- `feedback`
- `assessmentTemplates`
- `assessmentRounds`
- `playerAssessments`
- `playerGrowthEvents`
- `playerMatchRecords`

主要接口：

- `getGrowthMeta`
- `listAssessmentTemplates`
- `saveAssessmentTemplate`
- `listAssessmentRounds`
- `createAssessmentRound`
- `getAssessmentRound`
- `savePlayerAssessment`
- `publishAssessmentRound`
- `getGrowthProfile`
- `getSessionEvaluationRoster`
- `saveTrainingEvaluation`
- `batchAddTrainingTag`

`studentPrivateProfiles` 不被成长服务读取；成长接口不会返回身份证号码。

## 五、三端入口

- 家长：首页“成长档案”、学员详情“球员成长档案”。
- 教练：首页“阶段测评”、课程详情“训练评价”。
- 管理员：首页“成长管理”、运营后台“成长管理 / 阶段测评”。

已注册成长档案、测评轮次、轮次创建、轮次详情、学员评分、训练评价和反馈表单页面。

## 六、权限结果

### 管理员

可查看全部成长档案、创建测评模板和轮次、发布测评。

### 教练

只能查看和评价其授权班级中的 `ACTIVE` 正式成员。直接篡改 `studentId` 或 `roundId` 越权会被后端拒绝。

### 家长

只能查看 `ownerParentUserId` 等于当前家长账号的孩子。家长不能进入测评工作台，也不能看到 `STAFF_ONLY` 内部训练记录或测评内容。

## 七、测试结果

新增专项测试：

```text
Growth profile regression: 7 checks passed
Assessment regression: 6 checks passed
PHASE C permission regression: 7 checks passed
Compatibility regression: 4 checks passed
PHASE C growth & assessment regression: 24 checks passed
```

专项覆盖：

- 所有正式学员自动获得成长档案
- 五个顶层维度与 1～5 分标签
- 管理员创建两轮测评
- 授权教练完成评分
- 两轮历史互不覆盖
- 趋势时间顺序和个人进步结果
- 家长跨孩子越权拦截
- 教练跨班越权拦截
- 日常评价与阶段测评分离
- 内部备注对家长隐藏
- 身份证字段不泄漏
- 不改动班级成员、候补和课时流水

同时执行项目全部 28 个回归测试脚本，全部通过；57 个已注册页面均存在。云函数及本地领域代码均通过 Node 语法检查。

## 八、问题分级

### P0（已修复）

- 本地演示环境指定非默认教练时，班级权限错误使用 `coach1` 默认范围，存在错误放行风险。已统一传递当前 `userId`，专项越权测试通过。

### P1（已修复）

- 历史家长访问逻辑依赖 `users.studentIds`，已适配唯一家长归属权限。
- 普通 `students` 数据若误混入身份证字段可能被本地成长档案展开，已增加防御性清理。

### P2（后续阶段）

- 比赛记录的正式新增和编辑入口应在赛事模块恢复时统一处理。
- 精英选拔仅可在 PHASE D 恢复，不应由成长分数自动触发。
- 周日成长联赛属于后续独立阶段。

## 九、阶段边界与下一步

本地代码已完成，但正式云端要使用新逻辑，仍需在微信开发者工具中重新上传并部署 `clubApi` 云函数，选择“云端安装依赖”。

部署并完成真机验收后，再决定是否进入 PHASE D。当前不应继续叠加后续模块。
