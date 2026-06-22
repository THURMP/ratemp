# 清华教师评价 Demo

这是一个可直接运行的前端 demo，按 GUI 模块拆分代码：

- `modules/login`：登录与问题验证模块
- `modules/main`：学院分类与教师列表模块
- `modules/upload`：教师信息、评分、评语上传模块
- `modules/detail`：教师详情、全部评分与评语模块
- `modules/logs`：系统日志与开发者信息模块
- `services/storage.js`：用 localStorage 模拟后台数据访问
- `data/authConfig.js`：验证问题与答案配置
- `data/seedData.js`：初始示例数据

## 运行方式

用浏览器打开 `index.html` 即可运行。

默认验证答案：`清华`、`Tsinghua` 或 `THU`。
