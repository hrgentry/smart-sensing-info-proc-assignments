# 本地验证

此仓库不用 npm 依赖。教师从可信 main 运行 Node.js（18 或更新版）：

```sh
node --test scripts/*.test.mjs assignments/hw-02/model.test.cjs
node scripts/validate-submission.mjs --login your-github-login
```

第二条仅检查本人目录中的结构、JSON、路径与截图格式，不执行学生代码，不代替人工内容评价；模板占位没有替换或实际记录／两截图缺失时应失败。收据核验见[教师说明](../teacher/README.md)。
