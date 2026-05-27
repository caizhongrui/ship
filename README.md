# 船舶数字孪生诊断系统

基于 **Tauri 2 + Vue 3 + TypeScript** 的 Windows 桌面客户端，面向 16000 TEU 集装箱船 MAN B&W 8G95ME-C 主机系泊试验竞赛教学场景。

## 技术栈

- 桌面壳：**Tauri 2**（Rust 极少量代码，使用 Win10/11 自带 WebView2）
- UI：**Vue 3 + Element Plus + ECharts**
- 状态：Pinia
- 仿真/诊断：纯 TypeScript，跑在 Web Worker
- 报告导出：ExcelJS
- 存储：YAML（配置） + JSONL（时序/事件） + JSON（元数据），全本地文件，零中间件

## 演示账号

| 用户名 | 密码 | 角色 |
|---|---|---|
| `student` | `123456` | 学员 |
| `admin` | `admin123` | 管理员 |

## 本地开发

```bash
npm install

# 仅前端调试（浏览器，不依赖 Rust）
npm run dev          # → http://localhost:5173

# 桌面壳开发（需要本机已装 Rust 工具链 + macOS/Linux/Windows 任一）
npm run tauri:dev

# 本机构建安装包
npm run tauri:build
```

## Windows 安装包构建（GitHub Actions）

提交到 `main` 分支或推 `v*` tag 后，CI 自动在 `windows-latest` runner 上构建并打包：

- **手动触发**：进入仓库 Actions → "Build Windows Installer" → Run workflow
- **打 tag 发布**：
  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```
  CI 完成后会自动创建 GitHub Release，附带 NSIS `.exe` 和 MSI `.msi` 两个安装包。

产物位置：
- Actions Artifacts（每次提交都有，保留 90 天）
- GitHub Releases（仅 tag 触发）

## 主线剧本

启动 → 逐档加车（剧本 0–300s）→ t=290s 5# 缸排温故障渐变升至 ~435℃ →
学员停止 → 进入故障诊断 → 故障修复（自动生成诊断报告）→ 系统软重放剧本（5# 正常）→
报表查询页可查看/编辑/导出 Excel 报告。

## 页面（左侧导航）

1. **主机监测** — 4 个圆形大表 + 8 缸排温柱状图（带 450℃ 阈值线）+ 9 项安全状态卡
2. **电站控制** — 电网三相 + 3 台 A/E
3. **辅助系统** — 暖缸/滑油/冷却水/增压/空气源/燃油
4. **轴系监测** — 轴系示意 + 关键参数 + 温度趋势 + 4 点塞尺测量
5. **报警记录** — 历史报警表格
6. **曲线查询** — 多测点叠加趋势（单调时间轴，故障前后两段对比）
7. **报表查询** — 诊断报告（按 xlsx 模板格式，可导出）
8. **故障诊断** — IF-THEN 规则推理 + 修复按键

## 数据基线

所有参数与曲线遵循 04.24 数据交底文档 + 04.30 启动数据表，详见 `src-tauri/resources/default-config/`。

## AI 推理模型

安装包内置 `all-MiniLM-L6-v2` ONNX 模型（~90MB），位于 `resources/models/embedding-model.onnx`。当前版本保留接口，**未启用运行时推理**；后续可用于：

- 故障描述与历史案例的相似度匹配
- 报警语义聚类
- 维修建议检索增强

模型文件由 CI 构建时从 Hugging Face 下载（仓库本身不存模型），开发本地构建若需打入安装包，可执行：

```bash
curl -L -o src-tauri/resources/models/embedding-model.onnx \
  https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx
```

## 许可

私有项目，未经授权请勿分发。
