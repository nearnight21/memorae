# 照片日期与地点读取

最后更新：2026-10-16

## 本次定位

- 日期：`beginCreateMemory` 原来直接使用 `todayValue()`，没有解析和回填 EXIF 拍摄日期。
- 地点：虽然选图设置了 `exif: true`，但只解析选图器返回的 EXIF。Android 未声明/请求
  `ACCESS_MEDIA_LOCATION`，也没有通过系统相册读取原始 GPS；系统隐藏定位后会被误报为照片没有地点。
- 当前没有连接真机，以上为代码链路确认；用户照片的实际元数据与安装包行为仍需真机验收。

## 当前处理

1. 优先读取 `DateTimeOriginal`，再使用 `DateTimeDigitized`、`DateTime`，保留拍摄当地日期。
2. 日期或 GPS 缺失时，仅按所选照片 ID 调用系统相册；日期仍缺失时回退相册创建时间，
   不使用缓存文件的修改时间。不扫描相册，不额外下载 iCloud 原图。
3. Android 通过 `expo-media-library/legacy` 补读定位；SDK 57.0.5 的此实现使用
   `MediaStore.setRequireOriginal`，满足系统对未隐藏 GPS 的读取要求。
4. GPS 继续走现有坐标转换和反查；没有读取结果时允许手动填写。权限拒绝或照片不可访问不会阻断选图。
5. 追加照片只补充新建草稿的默认日期和空地点，保留手工日期/地点及已有记忆的字段。
   锁定后返回的选图/反查结果不再创建或修改草稿。

## 验证状态

- 已通过：App TypeScript、145 项测试、Expo Doctor 21 项、Android Metro/Hermes 导出。
- 已通过：Expo Manifest 解析包含 `ACCESS_MEDIA_LOCATION`、`READ_MEDIA_IMAGES`，未增加视频/音频读取权限。
- 已通过：运行面边界检查、`git diff --check`；改动仅在 App 与根目录交接文档。
- 未测：Android 原生包构建、安装和真实照片读取；iOS 真机读取。
- 新增原生依赖与权限，必须重新构建安装包，仅替换 JS bundle 无法给旧包补充能力。

## 真机验收

| 场景 | 预期 |
| --- | --- |
| 选择一张已知带日期和 GPS 的相机原图 | 日期为拍摄当天，地点完成转换与反查 |
| Android 首次同意照片访问和照片位置权限 | 可读取该照片 GPS，首页与编辑页地点一致 |
| 拒绝或限制相册访问 | 已选照片仍可使用，无法读取的字段可手填 |
| 选择多张照片，前面的照片缺少部分元数据 | 使用选择顺序中首个可读日期和首个有效 GPS |
| 手动修改日期/地点后追加照片 | 手工字段保持原值 |
| 编辑已有记忆并追加照片 | 原日期和地点保持原值 |
| 无元数据的截图或经转发移除元数据的图片 | 允许手动填写，不声称可恢复已移除的信息 |

参考：[Expo SDK 57 MediaLibrary](https://docs.expo.dev/versions/v57.0.0/sdk/media-library-legacy/)、
[Android 照片位置信息读取要求](https://developer.android.com/training/data-storage/shared/media#location-info-photos)。
