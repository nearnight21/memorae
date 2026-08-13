# 水晶时间轴第一阶段原型

## 入口

仅在 Vite 开发环境使用：

```text
http://localhost:3000/?crystal-timeline=1
```

可选参数：

- `crystal-position=0..100`：初始日期位置。
- `crystal-state=base`：隐藏年份、轨道、节点和 Current Focus，只看水晶主体。
- `crystal-lat`、`crystal-lng`、`crystal-zoom`：指定真实地图验收区域。

正式产品入口与原时间轴没有被替换。

## 材质参数

- Glass Base：`opacity 0.082`、`blur 1.7px`、`brightness 1.045`、`saturation 1.10`。
- Top Highlight：`opacity 0.72`，从上沿向内部快速衰减。
- Bottom Shade：`opacity 0.42`，只在下沿制造冷色折射暗部。
- Edge Lens：左右各 `82px`，以非描边径向渐变形成端部厚度。
- Current Focus：宽 `76–92px`，`blur 0.8px`、`brightness 1.085`、`saturation 1.17`，中心与 Handle 始终重合。

实现没有使用 WebGL、Shader、粒子或图片蒙版。地图仍清晰可见，主体识别主要依靠内侧高光、下沿暗部和端部透镜层。

## 验证与限制

- 连续日期范围：2021-01-01 至 2025-12-31；不是离散年份滑块。
- Pointer Events 覆盖鼠标、触摸和手写笔；支持点击跳转、拖动及键盘逐日移动。
- 已保存白色陆地、蓝色水面、绿色区域、城市道路和 20%/50%/80% Focus 截图到
  `test-results/crystal-timeline/`。
- 最大差距：CSS `backdrop-filter` 无法真正弯折地图图像；白底上的水晶感依赖光学明暗分层；Focus 仍是近似局部聚光，
  不是物理透镜。第一阶段到此停止，视觉通过前不接入业务筛选。
