export const seedTeachers = [
  {
    id: "t-automation-chen",
    name: "陈教授",
    college: "自动化系",
    title: "教授",
    email: "chen@example.tsinghua.edu.cn",
    research: "智能控制、机器学习与系统建模",
    intro: "课程结构清晰，重视基础推导和工程实践。",
    reviews: [
      { score: 4.7, text: "讲课节奏稳定，作业有挑战但反馈及时。", author: "匿名学生", date: "2026-06-20" }
    ]
  },
  {
    id: "t-cs-li",
    name: "李教授",
    college: "计算机科学与技术系",
    title: "副教授",
    email: "li@example.tsinghua.edu.cn",
    research: "数据库系统、数据管理与云计算",
    intro: "课堂案例丰富，适合想做系统方向的同学。",
    reviews: [
      { score: 4.4, text: "项目训练很实用，期末复习范围明确。", author: "匿名学生", date: "2026-06-19" }
    ]
  },
  {
    id: "t-ee-wang",
    name: "王教授",
    college: "电子工程系",
    title: "教授",
    email: "wang@example.tsinghua.edu.cn",
    research: "信号处理、通信系统与智能感知",
    intro: "理论要求高，课堂板书细致。",
    reviews: [
      { score: 4.2, text: "考试偏重理解，建议认真跟每周习题。", author: "匿名学生", date: "2026-06-18" }
    ]
  }
];

export const seedLogs = [
  { time: "2026-06-22 09:00", message: "Demo 初始化：创建登录、学院、上传、详情和日志模块。" },
  { time: "2026-06-22 09:05", message: "本地存储服务已启用，数据会保存在当前浏览器 localStorage。" }
];
