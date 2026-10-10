# 智能传感与信息处理 · 个人作业仓库

这里保存作业要求、离线实验台和个人提交规范，不包含课程私有仓库的历史、真实照片、设备模型或个人资料。每个人长期使用同一个 `student/<github-login>` 分支，后续作业在自己的新目录继续提交；个人作业不合并进 `main`。

## 现在做 HW02

**[第二次作业：用证据修正一个判断](assignments/hw-02/README.md)**。三个案例任选一个，个人完成，无须写代码。

截止：**2026 年 10 月 21 日（周三）23:59，北京时间（UTC+8）**。最后允许秒为 `2026-10-21T15:59:59Z`，即北京时间 23:59:59。

克隆本仓库或通过 Code → Download ZIP 下载后，双击 `assignments/hw-02/lab.html`。实验台用普通脚本、系统字体和自有合成数据，离线运行，不需要课程网站账号、第三方库或安装 Python。GitHub 文件页面展示源码，不是在线实验台；本仓库没有承诺 Pages 地址。

## 先取得写权限

公开可读不等于可以推送。教师需要核实你的 GitHub 账号、授予 write 权限，你接受邀请后才能推送；教师尚未取得账号时不会代造分支或邀请。未获权限也可以先下载完成，及时联系教师解决访问问题。没有服务端收据时，不声称已经提交成功。

个人 GitHub 仓库的普通 write 权限不能自动隔离到“只写本人的分支”。分支规范、收据校验不是逐人 ACL；必须遵守 [AGENTS.md](AGENTS.md)，教师审核异常变更。公共材料位于 `main`；main 与个人分支的实际保护状态以 [平台验收记录](teacher/platform-status.md) 为准。

## 第一次建立个人分支

以下命令用于 macOS／Linux 终端或 Windows Git Bash。把 `your-github-login` 换成自己的 GitHub 账号小写，不写姓名、学号或邮箱。

```sh
git clone https://github.com/hrgentry/smart-sensing-info-proc-assignments.git
cd smart-sensing-info-proc-assignments
MY_GITHUB_LOGIN=your-github-login
git fetch origin
git switch --create "student/$MY_GITHUB_LOGIN" origin/main
mkdir -p "submissions/$MY_GITHUB_LOGIN/hw-02"
cp -R templates/hw-02/. "submissions/$MY_GITHUB_LOGIN/hw-02/"
```

如果远端已经有你的固定分支，不再创建新分支，使用 `git switch --track "origin/student/$MY_GITHUB_LOGIN"`。已有本地分支则直接切换。不要切到别人的分支。

完成实验、报告和模板替换后，核对提交范围：

```sh
git status --short
git add -- "submissions/$MY_GITHUB_LOGIN/hw-02"
git diff --cached --name-only
git commit -m "docs(hw-02): 提交实验证据与判断更新"
git push -u origin "HEAD:student/$MY_GITHUB_LOGIN"
```

到仓库 Actions 查找这次 `Submission receipt` 运行，保存运行 URL 和完整 head SHA。收据不代表作业内容合格。也可用 GitHub 网页上传到**本人分支、本人目录**，不能在 main 上传。

## 以后继续同一个分支

先保存／提交本人改动，确保工作区干净，再按顺序同步：

```sh
git fetch origin
git switch "student/$MY_GITHUB_LOGIN"
git merge --ff-only "origin/student/$MY_GITHUB_LOGIN"
git merge origin/main
```

先取回自己远端的更新，再合并教师材料。出现冲突时保留事实、核对差异；不要用 force、reset 丢历史或强制覆盖解决。下一次作业放在 `submissions/<github-login>/hw-03/`，继续此分支。自己的分支长期保留，不提“把作业合进 main”的 PR，不合并他人的分支。

## 截止与证据

教师核对 GitHub Actions API 的 `run.created_at` 与 `head_sha`。这是 GitHub 服务器的**运行创建时间**，不是精确的 push 到达时间；本地 Git 时间、manifest 或日志里自写的时间不能替代它。学生需预留排队时间，确认运行产生并保存 URL。

有效收据须同时满足 push 事件、指定 workflow 路径、`student/<小写 actor>`、目标 SHA，以及该 SHA 内 `receipt.yml` 的哈希属于教师可信版本清单。工作流在个人分支可被修改，所以教师不会只凭日志认定有效。可信清单保留以前有效版本，不因正常升级否认旧收据。

截止前最后有效收据绑定的 SHA 是按时冻结版本；截止后首次提交或后续修订须如实说明。平台排队、未触发或故障保留证据交教师人工判断，不自动扣分，也不覆盖先前按时版本。教师私下保存 API 元数据和 SHA 快照，不公开实名映射或成绩。详情见 [教师收据流程](teacher/README.md)。

## 文件与验证

- [HW02 完整任务](assignments/hw-02/README.md)
- [个人提交模板](templates/hw-02/)
- [学生与 AI 助手规则](AGENTS.md)
- [模型／收据测试](scripts/README.md)

不要提交 API 密钥、口令、完整私人聊天、姓名、学号、邮箱、未经授权的照片或资料。公开可读不表示他人的作品已授予任意复用权；个人作品版权仍由作者保留。
