# 平台验收记录

2026-10-10 实际验收完成。仓库 [hrgentry/smart-sensing-info-proc-assignments](https://github.com/hrgentry/smart-sensing-info-proc-assignments) 为 **public**，默认分支 **main**，Actions 已启用；它从独立根提交建立，没有课程私有仓库的历史。已发布源代码版本为 `6705434d3d30f91774c6df7d6004a2e4e1728ec8`（初始发布 `85cca090759fd52e3e4635a1e2ac9c4e9ac13e70`，随后追加 receipt-v2，保留 v1）。本次只追加这份验收文档，不改变实验模型或工作流。

## 实际分支保护

以下 ruleset 已从 GitHub API 读回为 active，并核对 main 与教师本人测试分支的有效规则：

| ruleset | ID | 范围与行为 | bypass |
|---|---:|---|---|
| main-teacher-updates | 24827918 | `refs/heads/main`，限制 update | 仅 RepositoryRole admin（ID 5）可正常维护 main |
| main-history-integrity | 24827919 | main 禁止 deletion、non_fast_forward | 无 |
| student-history-integrity | 24827925 | `refs/heads/student/**` 禁止 deletion、non_fast_forward | 无 |

教师正常 main 推送已实际成功，远端明确记录 admin 对 update 限制的 bypass；禁止删除和重写历史的规则没有 bypass。普通 **write 权限仍能影响他人分支**，这些规则没有实现逐人分支 ACL。本人分支／目录规范、可信收据与异常审核仍必须执行。

## 实际收据烟测

仅使用仓库所有者的真实 `student/hrgentry` 分支。其 README 明确标为教师平台烟测，**不是学生作业**；没有真实学生实验、姓名、学号或成绩。该固定分支保留历史，不删除或强推。

- 测试提交：`13d67a5a4a2bb6bd71c14d8e888a990b67c40dfa`。
- [实际 Actions 运行 38018407831](https://github.com/hrgentry/smart-sensing-info-proc-assignments/actions/runs/38018407831)：completed / success，事件 push，actor `hrgentry`，分支 `student/hrgentry`，路径 `.github/workflows/receipt.yml`，head SHA 与测试提交相同。
- API `created_at`：`2026-10-10T02:50:07Z`，北京时间 10:50:07。它是**运行创建时间**，不是精确 push 到达时间。
- 教师从可信 main 运行校验器：实际退出码 0，`validMetadata: true`、`errors: []`，`workflowVersion: receipt-v2`，workflow SHA256 为 `f91ce79785bba872830fb65a20d35e00b4ae50db58277d950c26de6129088b63`。
- 原始 API 元数据、校验收据、工作流原文、绑定 SHA 的 ZIP 快照已实际保存于教师私有位置。检查通过的是元数据、版本与快照绑定；`contentAssessed: false`，不代表作业内容合格。

可信清单同时保留 receipt-v1 与 v2；工作流无 checkout、第三方 Action、secrets 或学生代码执行，权限为 `permissions: {}`。日志中的提示不替代 API 核对。

## 匿名下载与离线复核

关闭 Git 全局／系统配置和凭据后，匿名重新克隆上述源代码版本成功，未发送认证 header。克隆包恰为发布清单中的 23 个文件，不含运行缓存、真实课程资产或私有记录；9 项模型、5 项收据、8 项结构验证测试共 **22／22**，实际退出码 0。

重新克隆出的 `assignments/hw-02/lab.html` 通过 `file://` 实际打开，完成 A／B／C 三案与草稿的浏览器操作、真实 Blob JSON 导出和刷新恢复：**33 项检查通过，实际退出码 0**。A 保存 8 条记录，B 保存 7 条，C 保存 4 条并保留前两案旧轮及换案原因；完整导出含初始与更新四象限、单位和版本，草稿保持 incomplete。可信 main 验证器对三份实际完整导出与草稿均给出 `validStructure: true`、`errors: []`、`contentAssessed: false`。

桌面 1280×900 与手机 390×844 视口无文档横向溢出，图轴文字实测至少 11.8 px；浏览器无控制台错误，仅载入本地 HTML／JS。这些是教师合成 QA 证据，存于仓库外，未发布为学生作业；视口仿真不等于真手机或真人学习计时。

## 尚需教师办理

尚未获得学生 GitHub 用户名，因此没有邀请学生，也没有建立真实学生分支。教师须核实账号、授予 write，学生接受邀请后才可推送。截止、排队或故障按 [教师收据流程](README.md) 保留证据并人工判断，不把可读权限或本地导出称为提交成功。
