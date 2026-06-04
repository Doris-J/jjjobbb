# Android Framework 面试八股文

---

# Part 1：进程启动

---

## 一、Zygote

### Q1：Zygote 进程的作用与 fork 机制？

**Zygote 作用：**
- Android 所有 App 进程的父进程，由 init 进程启动
- 预加载公共资源（Android Framework 类、系统资源），fork 后子进程共享（COW 写时复制），避免重复加载

**启动流程：**

```
init 进程
    → 解析 init.rc，启动 zygote
    → Zygote 预加载（preloadClasses / preloadResources）
    → 启动 SystemServer（fork 第一个子进程）
    → 进入 ZygoteServer.runSelectLoop() 等待 Socket 连接
```

**fork 机制：**

```
AMS 需要启动 App 进程
    → 通过 LocalSocket 向 Zygote 发请求（进程名 / UID / GID 等）
    → Zygote 调用 fork()（Linux 系统调用）
    → 子进程（App 进程）初始化，反射调用 ActivityThread.main()
```

**为什么用 Socket 而非 Binder？**
- fork 与多线程不兼容：Binder 线程池在多线程环境中工作，fork 时父进程的 Binder 线程不会被复制到子进程，可能造成死锁
- Socket 是单线程通信，安全

---

### Q2：App 冷启动完整流程？ [hard]

```
用户点击桌面图标
    ↓
Launcher 调用 startActivity()
    ↓
ActivityTaskManagerService（ATMS）处理请求
    ↓
判断目标进程是否存在 → 不存在：请求 Zygote fork 新进程
    ↓
Zygote fork → 子进程调用 ActivityThread.main()
    ↓
主线程 Looper 初始化，ActivityThread attach 到 AMS
    ↓
AMS 发送 bindApplication → 创建 Application 实例
    ↓
Application.attachBaseContext() → Application.onCreate()
    ↓
AMS 发送 scheduleLaunchActivity → 创建 Activity 实例
    ↓
Activity.onCreate() → setContentView() → View 树构建
    ↓
ViewRootImpl.performTraversals() → measure/layout/draw
    ↓
SurfaceFlinger 合成 → 屏幕显示第一帧
```

**性能关键节点：**

| 阶段 | 优化手段 |
|------|---------|
| Application.onCreate | 延迟初始化（懒加载）、异步初始化第三方 SDK |
| setContentView | 减少布局层级、使用 ViewStub |
| 首帧绘制 | 避免主线程 IO、避免过度绘制 |

---

### Q3：SystemServer 启动了哪些系统服务？ [easy]

```
Zygote fork → SystemServer.main()
    → SystemServer.run()
        → 启动引导服务（BootstrapServices）
            AMS / ATMS / PMS / WMS
        → 启动核心服务（CoreServices）
            BatteryService / WebViewUpdateService
        → 启动其他服务（OtherServices）
            CameraService / InputManagerService / NotificationManager
    → Looper.loop() 进入主循环
```

**核心服务职责：**

| 服务 | 职责 |
|------|------|
| AMS（ActivityManagerService） | 管理四大组件生命周期、进程管理 |
| ATMS（ActivityTaskManagerService） | Android 10+ 拆分自 AMS，专管 Activity 任务栈 |
| WMS（WindowManagerService） | 管理所有 Window 的添加/移除/排列/焦点 |
| PMS（PackageManagerService） | APK 安装/卸载/权限管理 |
| IMS（InputManagerService） | 输入事件读取与分发 |

---

## 二、ANR

### Q4：ANR 触发原理与排查？ [hard]

**触发条件：**

| 场景 | 超时时间 |
|------|---------|
| 前台 Activity 输入事件（无响应） | 5s |
| 前台 Service | 20s（前台）/ 200s（后台） |
| BroadcastReceiver onReceive | 10s（前台）/ 60s（后台） |
| ContentProvider 发布超时 | 10s |

**底层原理：**

```
// 以 Service 为例
startService → AMS 发 Message（TIMEOUT）到主线程 Handler
    ↓（延时 20s）
若 SERVICE_TIMEOUT_MSG 到期仍未被清除
    → AMS.appNotResponding()
    → 收集 CPU 信息、dump /data/anr/traces.txt
    → 弹出 ANR 对话框
```

**输入 ANR（Input Dispatcher）：**

```
InputDispatcher 发送触摸事件给应用窗口
    → 等待应用 finishInputEvent 回调
    → 超过 5s 未回调 → 触发 ANR
```

**排查步骤：**

```
1. 查看 /data/anr/traces.txt（主线程堆栈）
2. 分析主线程是否在：
   - 等待锁（BLOCKED 状态）
   - IO 操作
   - 死锁（两线程互相等待）
3. 使用 adb shell dumpsys activity processes 查看进程状态
4. StrictMode 检测主线程 IO
```

**常见原因与解决：**

| 原因 | 解决 |
|------|------|
| 主线程 IO / 网络 | 移至子线程（协程 Dispatchers.IO） |
| 主线程等待子线程锁 | 优化锁粒度，避免跨线程持锁 |
| Binder 调用卡顿 | 对端进程阻塞，避免主线程同步 Binder 调用 |
| 布局过于复杂 | 减少层级，使用 ConstraintLayout |

---

# Part 2：Window 机制

---

## 三、Window / WMS

### Q5：Window / WindowManager / WMS 架构？

```
应用层
    PhoneWindow（Window 的唯一实现）
    WindowManager（接口）
        ↓
    WindowManagerImpl → WindowManagerGlobal
        ↓ 跨进程 Binder（IWindowSession）
系统层
    WMS（WindowManagerService）
        管理所有 Window 的 z-order / 焦点 / 动画
        ↓
    SurfaceFlinger（合成所有 Layer 显示到屏幕）
```

**Window 添加流程：**

```kotlin
// 应用调用
windowManager.addView(view, params)
    → WindowManagerGlobal.addView()
    → 创建 ViewRootImpl
    → ViewRootImpl.setView()
        → mWindowSession.addToDisplay()  // Binder 跨进程
            → WMS.addWindow()
            → 创建 WindowState 记录 Window 信息
            → 申请 Surface（与 SurfaceFlinger 通信）
        → 触发第一次 performTraversals()（measure/layout/draw）
```

---

### Q6：DecorView 与 ViewRootImpl 关系？

```
Activity
    └── PhoneWindow
            └── DecorView（FrameLayout，View 树根节点）
                    ├── StatusBar（状态栏）
                    ├── ContentView（setContentView 内容）
                    └── NavigationBar（导航栏）

ViewRootImpl（非 View，是 Window 和 View 树的桥梁）
    ├── 持有 DecorView 引用
    ├── 通过 Choreographer 调度 VSync 信号
    ├── 执行 performTraversals()（measure/layout/draw 三大流程）
    └── 处理输入事件并分发给 DecorView
```

**关键时机：**

```kotlin
// setContentView 只是构建 View 树，不触发绘制
// onResume 后 WindowManager.addView(decorView) 才创建 ViewRootImpl
// 因此 View.getWidth() 在 onResume 中仍为 0，需用 post{}
view.post { val width = view.width }
```

---

### Q7：Activity、Dialog、PopupWindow 的 Window 区别？ [easy]

| | Activity | Dialog | PopupWindow |
|--|---------|--------|-------------|
| Window 类型 | TYPE_APPLICATION | TYPE_APPLICATION（依附 Activity） | 无独立 Window（借用 Activity Window） |
| WMS 中独立 Window | ✅ | ✅ | ❌（通过 View 叠加） |
| 生命周期 | Activity 管理 | 随 Activity | 随调用方 |
| 遮挡状态栏 | 可配置 | 不遮挡 | 不遮挡 |
| 触摸范围 | 全屏 | 仅对话框区域 | 弹出区域 |

---

# Part 3：Activity 启动（系统视角）

---

## 四、ATMS / AMS

### Q8：Activity 启动完整流程（系统层）？ [hard]

```
App 调用 startActivity(intent)
    ↓
Instrumentation.execStartActivity()
    ↓ Binder
ActivityTaskManagerService.startActivity()
    ↓
ActivityStarter.execute()
    → 解析 Intent（目标 Activity、启动模式）
    → 查找 / 创建目标 TaskRecord 和 ActivityStack
    ↓
判断目标 App 进程是否存在
    ┌── 存在 → 直接走 realStartActivityLocked()
    └── 不存在 → AMS.startProcessLocked()
                    → 请求 Zygote fork 新进程
                    → 新进程 ActivityThread.attach()
                    → AMS 继续走 realStartActivityLocked()
    ↓
realStartActivityLocked()
    → ClientTransaction（包含 LaunchActivityItem）
    → 通过 Binder 发给目标进程的 ApplicationThread
    ↓
ActivityThread.handleLaunchActivity()
    → Instrumentation.newActivity()（反射创建 Activity）
    → Activity.attach()（绑定 PhoneWindow）
    → Instrumentation.callActivityOnCreate() → Activity.onCreate()
    → onStart() → onResume()
```

---

### Q9：Instrumentation 的作用？ [easy]

- Activity / Application 的实际创建者（反射 `newActivity` / `newApplication`）
- 生命周期回调的统一入口（`callActivityOnCreate` / `callActivityOnPause` 等）
- 测试框架（`InstrumentationTestRunner`）通过替换 Instrumentation 拦截生命周期
- 插件化框架通过 Hook Instrumentation 实现未注册 Activity 的加载

```kotlin
// ActivityThread 中
val activity = mInstrumentation.newActivity(
    cl, component.className, intent
)
mInstrumentation.callActivityOnCreate(activity, icicle)
```

---

# Part 4：输入系统

---

## 五、Input 事件分发链路

### Q10：触摸事件从内核到 View 的完整链路？

```
Linux 内核（/dev/input/eventX）
    ↓ EventHub 读取原始事件
InputReader（线程）
    → 将原始事件转换为 MotionEvent
    ↓
InputDispatcher（线程）
    → 查找目标 Window（向 WMS 查询）
    → 通过 InputChannel（Unix Domain Socket）发送事件
    ↓
ViewRootImpl.WindowInputEventReceiver.onInputEvent()
    ↓
ViewRootImpl.processPointerEvent()
    ↓
DecorView.dispatchTouchEvent()
    ↓
Activity.dispatchTouchEvent()
    ↓
Window.superDispatchTouchEvent()
    ↓
View 树 dispatchTouchEvent 递归分发
```

**InputChannel 原理：**
- 每个 Window 对应一对 InputChannel（Server 端在 InputDispatcher，Client 端在 ViewRootImpl）
- 底层是 Unix Domain Socket，通过文件描述符实现跨进程事件传递
- 不使用 Binder 的原因：输入事件需要低延迟，Socket 比 Binder 开销更小

---

# Part 5：包管理

---

## 六、APK 安装

### Q11：APK 安装完整流程？

```
adb install / 应用市场下载 / 系统安装器
    ↓
PackageInstaller（系统安装界面，API 21+）
    ↓ Binder
PackageManagerService.installPackage()
    ↓
① 拷贝 APK 到 /data/app/{包名}/
② 解析 AndroidManifest.xml（解析组件、权限）
③ dex 优化（dexopt / dex2oat 生成 .odex / .vdex）
④ 更新 packages.xml（记录包信息、签名、权限）
⑤ 发送 ACTION_PACKAGE_ADDED 广播
⑥ Launcher 监听广播，刷新桌面图标
```

**关键目录：**

| 目录 | 内容 |
|------|------|
| `/data/app/{包名}/` | APK 本体 |
| `/data/data/{包名}/` | 应用私有数据（沙盒） |
| `/data/dalvik-cache/` | dex 编译产物 |
| `/data/system/packages.xml` | 所有已安装包信息 |

---

### Q12：ClassLoader 在 Android 中的体系？

```
BootClassLoader（加载 Framework 核心类）
    ↑ parent
PathClassLoader（加载已安装 APK 的 dex，不能加载外部路径）
    ↑ parent
DexClassLoader（加载任意路径的 dex/jar/apk，热修复/插件化基础）
```

**热修复原理（类替换）：**

```kotlin
// DexPathList 内部维护 dexElements 数组
// ClassLoader 加载类时按数组顺序查找
// 热修复：将补丁 dex 插入 dexElements 数组最前面
// → 优先找到补丁中的新类，跳过原 APK 中的旧类

val dexPathListField = BaseDexClassLoader::class.java
    .getDeclaredField("pathList")
dexPathListField.isAccessible = true
val pathList = dexPathListField.get(classLoader)

val elementsField = pathList.javaClass.getDeclaredField("dexElements")
elementsField.isAccessible = true
val oldElements = elementsField.get(pathList) as Array<*>

// 将补丁 dexElements 插入数组头部
val newElements = patchElements + oldElements
elementsField.set(pathList, newElements)
```

---

# Part 6：内存管理

---

## 七、LMK 与进程回收

### Q13：Low Memory Killer 工作原理？

**Android 进程优先级（OOM Adj 值，越低越不易被杀）：**

| 进程类型 | OOM Adj 范围 | 说明 |
|---------|------------|------|
| Native Process | -1000 | 系统进程，永不被杀 |
| System Process | -900 | SystemServer |
| 前台进程 | 0 | 正在交互的 Activity |
| 可见进程 | 100 | 部分可见（如弹出 Dialog 的后台 Activity） |
| 服务进程 | 200 | 运行 Service |
| 缓存进程 | 900 | 后台 Activity，优先被杀 |

**LMK 触发机制：**

```
内存不足时（/sys/module/lowmemorykiller/parameters/minfree 阈值）
    → LMK 驱动（内核模块）按 OOM Adj 从高到低扫描进程
    → 选择 OOM Adj 最高且内存占用最大的进程发送 SIGKILL
```

**Android 11+ 改为用户空间 lmkd：**

```
lmkd 守护进程监控内存压力（PSI: Pressure Stall Information）
    → PSI 超过阈值时查询 /proc/{pid}/oom_score_adj
    → 按策略杀死目标进程（比内核 LMK 更灵活）
```

---

### Q14：以下关于 Android 进程保活说法正确的是？ [choice|easy]

- A. START_STICKY 可以保证 Service 永远不被系统杀死
- B. 提升进程 OOM Adj 值可以降低被杀概率
- C. 前台 Service（startForeground）可以降低进程 OOM Adj，减少被杀概率 ✓
- D. 在 onDestroy 中重启 Service 是被 Google 官方推荐的保活方案

前台 Service 会将进程 OOM Adj 降低（提升优先级），系统在内存不足时会优先保留它。START_STICKY 只保证进程被杀后重启 Service，不能阻止被杀。提升 OOM Adj 值反而使进程更容易被回收。

---

# Part 7：Binder 深入

---

## 八、Binder 进阶

### Q15：ServiceManager 的作用与 Binder 注册流程？

**ServiceManager 是 Binder 的"DNS 服务器"：**

```
系统服务启动时（如 AMS）：
    AMS.main()
        → ServiceManager.addService("activity", amisBinder)
        → 将名称与 Binder 对象映射存入 ServiceManager

客户端获取服务时：
    ActivityManager.getService()
        → ServiceManager.getService("activity")
        → 返回 AMS 的 Binder 代理对象（IBinder）
        → 通过代理发起 transact() 调用
```

**ServiceManager 本身如何获取？**
- ServiceManager 的 Binder 句柄固定为 **0**（特殊约定）
- 任何进程可通过 `IPCThreadState.self().transact(0, ...)` 直接访问

---

### Q16：Binder 驱动与内存映射（mmap）？ [hard]

**一次拷贝的原理：**

```
发送方进程（用户空间）
    copy_from_user() → Binder 驱动（内核空间）
                            ↕ mmap（内存映射）
                       接收方进程（用户空间）
```

- 接收方进程在启动时调用 `mmap()`，将一块物理内存同时映射到：
  - Binder 内核空间
  - 接收方用户空间
- 发送方数据只需从用户空间拷贝到内核（1次），接收方通过映射直接读取（0次拷贝到用户空间）
- 普通进程通信（Socket/Pipe）需要 **2次拷贝**（发送方→内核→接收方）

**Binder 数据传输上限：**
- 单次传输默认上限 **1MB - 8KB**（共享内存区域限制）
- 传输大数据（图片等）应使用 `ashmem`（匿名共享内存）配合 `FileDescriptor`

---

### Q17：AIDL 自动生成代码解析？ [easy]

```java
// AIDL 生成的 Stub 关键结构（简化）
public abstract class Stub extends Binder implements IMyService {

    // 服务端：继承 Stub 实现接口方法
    // Binder.onTransact() 接收来自客户端的调用
    @Override
    public boolean onTransact(int code, Parcel data, Parcel reply, int flags) {
        switch (code) {
            case TRANSACTION_doSomething:
                // 从 data 反序列化参数
                String arg = data.readString();
                // 调用实际实现
                String result = this.doSomething(arg);
                // 将结果写入 reply
                reply.writeString(result);
                return true;
        }
        return super.onTransact(code, data, reply, flags);
    }

    // 客户端持有的代理对象
    public static class Proxy implements IMyService {
        private IBinder mRemote;

        @Override
        public String doSomething(String arg) throws RemoteException {
            Parcel data = Parcel.obtain();
            Parcel reply = Parcel.obtain();
            // 序列化参数
            data.writeString(arg);
            // 发起跨进程调用（阻塞等待）
            mRemote.transact(TRANSACTION_doSomething, data, reply, 0);
            // 反序列化结果
            return reply.readString();
        }
    }
}
```

**关键点：**
- `asInterface()`：同进程返回 Stub 本身，跨进程返回 Proxy
- `transact()` 在客户端线程发起后**阻塞**，等待服务端 `onTransact()` 执行完毕
- 服务端 `onTransact()` 在 **Binder 线程池**中执行（非主线程）

---

# Part 8：渲染管线

---

## 九、SurfaceFlinger

### Q18：SurfaceFlinger 渲染合成流程？

```
App 进程（GPU 绘制）
    ViewRootImpl.draw()
        → 硬件加速：RenderThread 提交 GL 指令到 GPU
        → GPU 渲染结果写入 Surface（BufferQueue）
    ↓
SurfaceFlinger 进程
    → 监听 HW Composer VSync 信号（60Hz = 16.6ms）
    → 从各 App 的 BufferQueue 获取最新帧
    → HW Composer 合成（硬件层）/ GPU 合成（fallback）
    → 输出到 Display（屏幕）
```

**BufferQueue 机制（生产者-消费者）：**

| 角色 | 说明 |
|------|------|
| Producer（生产者） | App 进程（GPU 渲染写入 Buffer） |
| Consumer（消费者） | SurfaceFlinger（读取 Buffer 合成） |
| 三重缓冲 | 允许 App 提前渲染下一帧，减少等待 VSync 的延迟 |

---

### Q19：掉帧（Jank）产生原因与检测？

**掉帧原理：**

```
VSync 信号每 16.6ms 发出一次
    → App 必须在 16.6ms 内完成 measure/layout/draw
    → 若超时，SurfaceFlinger 本次 VSync 无新帧可显示
    → 重复显示上一帧 → 用户感知卡顿（Jank）
```

**常见原因：**

| 原因 | 检测工具 |
|------|---------|
| 主线程耗时（IO / 锁 / 计算） | StrictMode / Systrace |
| 过度绘制（Overdraw） | 开发者选项 > 显示过度绘制 |
| 布局层级过深 | Layout Inspector |
| 频繁 GC 导致主线程暂停 | Memory Profiler |
| RecyclerView item 绑定耗时 | Systrace |

**Systrace / Perfetto 分析关键轨道：**
- `Choreographer#doFrame`：单帧总耗时
- `measure` / `layout` / `draw`：各阶段耗时
- `GPU completion`：GPU 渲染完成时间
