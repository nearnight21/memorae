# Crystal Timeline Archive

此目录保存已冻结的 Golden Crystal 水晶时间轴视觉实现、几何参数、测试渲染器依赖和参考图。

正式 App 不再引用此目录中的实现。正式 Home 时间轴使用
`app/src/home/timeline/ArcTimeline.tsx`，该实现来自已有正式适配提交
`b1b8a52`（`fix(app): align timeline year cycling with prototype`），包含拱形布局、拖动回弹、
边缘循环年份和正式年份选择回调。

除非明确恢复产品路线，不得将此目录中的 Golden Crystal 代码重新接入正式入口，也不得用测试原型重写正式时间轴。
