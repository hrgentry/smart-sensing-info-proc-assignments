# 教师维护与收据核验

本目录是公开操作说明与可信版本清单，不保存实名名单、成绩或学生私密数据。write 授权须由教师核实实际 GitHub 账号并发邀请；本次初始化没有名单，不邀请任何人。

## 从可信 main 独立核验

教师在**另一个干净的 main checkout**中获取最新公共材料，不运行学生分支里的脚本：

```sh
git fetch origin
git switch main
git merge --ff-only origin/main
node scripts/verify-receipt.mjs --run-id RUN_ID --head-sha FULL_HEAD_SHA --save-dir .teacher-private/receipts --snapshot
```

把占位值换成实际 Actions run ID 和完整 SHA；`gh` 须有正常认证。脚本只读取 GitHub API，不执行学生提交、workflow 文本或报告。它核 event、workflow 路径、repository、branch/actor（账号小写）、head_sha 和该 SHA 的 receipt.yml 原字节哈希。哈希必须在 `teacher/trusted-workflows.json` 中；日志写 PASS 不算证据。

API 元数据及校验结果保存为 JSON，workflow 原字节也保留；`--snapshot` 以校验通过的 head SHA 下载仓库快照。**只有实际完成这些读写后才称已保存快照**。`.teacher-private/` 已忽略，推荐另存教师私人目录；不要把成绩、账号实名映射、批阅或这些快照推送公有仓库。

`run.created_at` 是 GitHub 服务器运行创建时间，不是精确 push 到达时间。截止最后允许秒 `2026-10-21T15:59:59Z`。截止前最后有效收据绑定的 SHA 作为按时版本；after-cutoff 输出是人工复核标志，不是自动成绩／扣分。截止后首次交、补交／更新与平台延迟分别据事实处理，原按时版本保留。

工作流缺失、排队、未运行、API 限流或 GitHub 故障时，保留运行 URL、API 报错等可核对材料，人工决定；不要用截图、本地 author/committer 日期或 manifest 自填时间冒充服务端时间。

## 可信工作流升级

`receipt.yml` 的执行内容只打印安全查找提示，`permissions: {}`，没有 checkout、第三方 Action、secrets 或学生代码执行。个人分支可以修改 workflow，GitHub 日志不是不可伪造的证明；有效性由教师独立 API／哈希校验决定。

经审查修改 workflow 时先更新其 `workflowVersion`，再运行：

```sh
node scripts/approve-workflow.mjs receipt-v3
```

清单追加新哈希，**不删除或替换 receipt-v1**，以免把以前正常产生的收据追溯判无效。同一版本内容改变时脚本拒绝覆盖，须使用新版本。

## 权限的真实边界

仓库规范：main 仅教师公共材料；禁止学生直接更新 main；main 和 student/** 禁止 force-push、删除。实现与读回结果见 [平台验收记录](platform-status.md)。如果个人仓库平台不支持某项限制，就如实记录，不宣称已有逐人 ACL。

普通 write 不自动隔离本人分支，main 保护和 receipt 也不能阻止所有“写别人分支”行为。教师审核异常历史；学生遵守个人路径约定。本人固定分支长期保留，不把个人作业合并进 main。

## 初始化烟测

教师可用自己的实际 GitHub 账号建立 `student/hrgentry` 进行收据烟测，写清“教师烟测，非学生作业”，不造学生名单、姓名或成绩。此分支不作为学生提交，不删除其验证历史。烟测须实际读取 API、核 hash 并私存 SHA 快照，不能用本地模拟测试代称线上通过。
