# Redmi K80 至尊版真机测试

## 安装后先做

1. 打开 App，点击“运行兼容与性能测试”。
2. 结果必须显示兼容测试通过，并记录 Argon2id 毫秒数。
3. 创建测试私密空间，密码至少 8 个字符。
4. 手动锁定，再用正确密码解锁。
5. 输入错误密码，确认无法解锁。

## 文字和照片

1. 新建一条包含标题和正文的记忆。
2. 选择一张真实照片，加密并保存。
3. 记录照片大小和加密耗时。
4. 点击“在内存中解密照片”，确认照片正确显示。
5. 点击“清除内存预览”，确认明文预览消失。
6. 分别使用约 5 MB、15 MB、30 MB 的照片重复测试，观察是否卡死或闪退。

## 照片性能采样

App 会在 Metro/Android 日志中输出脱敏的 `[memory-diagnostics]` `photo-performance` 记录，包含阶段耗时和密文大小，不包含照片内容、文件名、坐标、正文或密钥。照片上传和下载继续保持单张串行处理，避免无数据依据地提高内存峰值。

在 App 运行并执行一轮单图或多图操作时，可另开 PowerShell 采样 Android 进程 PSS：

```powershell
cd memory-recall-mobile
.\scripts\sample-android-memory.ps1 -PackageName com.memorae.cn -IntervalSeconds 5 -Samples 60 -OutputPath .\android-memory.csv
```

若同时连接多个设备，再追加 `-DeviceSerial <adb-serial>`。

脚本只读取 `adb shell dumpsys meminfo`，输出采样时间、总 PSS、Native Heap 和 Dalvik Heap；它不读取 App 文件、密文或日志内容。单张照片无法做字节级断点续传，网络中断后按照片档位重新申请授权并重传。

## Android Keystore

1. 解锁后启用“本机指纹解锁”。
2. 手动锁定。
3. 使用指纹重新解锁。
4. 在系统中新增或删除指纹后再次测试；凭证失效时必须回退到密码解锁。

## 换设备恢复模拟

1. 导出加密 JSON 并妥善保存。
2. 清空本机原型数据。
3. 导入刚才的 JSON。
4. 输入原密码。
5. 确认文字和照片全部恢复。

## 失败条件

- Android 固定向量或网页密文兼容测试失败。
- 错误密码可以进入。
- 修改密文后仍能解密。
- App 锁定后仍然显示文字或照片预览。
- 15 MB 照片导致稳定闪退。
- 导出文件中能够直接搜索到标题、正文、原始照片文件名或照片内容。
