# 语言基础面试八股文（Java + Kotlin）

---

# Part 1：Java

---

## 一、JVM 内存模型

### Q1：JVM 运行时内存区域？

| 区域 | 线程私有/共享 | 作用 |
|------|-------------|------|
| 程序计数器（PC） | 私有 | 记录当前线程执行字节码行号 |
| 虚拟机栈 | 私有 | 存储栈帧（局部变量表、操作数栈、动态链接） |
| 本地方法栈 | 私有 | Native 方法执行 |
| 堆 | 共享 | 对象实例、数组分配 |
| 方法区（元空间） | 共享 | 类信息、常量、静态变量、JIT代码 |
| 运行时常量池 | 共享 | 方法区的一部分，存放字面量和符号引用 |

> JDK8 之后永久代被元空间替代，元空间使用本地内存

---

### Q2：堆的分代结构？

```
堆
├── 新生代（Young Generation）1/3
│   ├── Eden 区          8/10
│   ├── Survivor0(From)  1/10
│   └── Survivor1(To)    1/10
└── 老年代（Old Generation）2/3
```

**对象晋升老年代条件：**
- 年龄达到阈值（默认 15 次 Minor GC）
- Survivor 区放不下（大对象直接进入）
- 动态年龄判断（同年龄对象超过 Survivor 50%）

---

## 二、垃圾回收

### Q3：GC Roots 有哪些？

1. 虚拟机栈中引用的对象（局部变量）
2. 方法区中静态属性引用的对象
3. 方法区中常量引用的对象
4. 本地方法栈中 Native 方法引用的对象
5. 被同步锁持有的对象

---

### Q4：垃圾回收算法对比？

| 算法 | 优点 | 缺点 | 使用场景 |
|------|------|------|---------|
| 标记-清除 | 简单 | 内存碎片、两次扫描 | CMS Old 区 |
| 标记-整理 | 无碎片 | 移动对象，STW 长 | G1 Old 区 |
| 复制算法 | 高效无碎片 | 内存利用率 50% | 新生代 |
| 分代收集 | 针对性强 | 复杂 | 现代 JVM |

---

### Q5：常见垃圾收集器？

| 收集器 | 区域 | 特点 |
|--------|------|------|
| Serial | 新生代 | 单线程，Client 模式 |
| ParNew | 新生代 | 多线程版 Serial |
| Parallel Scavenge | 新生代 | 吞吐量优先 |
| CMS | 老年代 | 并发、低停顿，有碎片 |
| G1 | 全堆 | 可预测停顿，Region 分区 |
| ZGC | 全堆 | 停顿 < 10ms，着色指针 |

---

## 三、引用类型

### Q6：四种引用类型区别？

| 引用类型 | GC 时机 | 使用场景 |
|---------|--------|---------|
| 强引用 | 永不回收 | 普通对象 |
| 软引用（SoftReference） | 内存不足时 | 图片缓存 |
| 弱引用（WeakReference） | 下次 GC 时 | ThreadLocal、非必要缓存 |
| 虚引用（PhantomReference） | 随时 | 跟踪对象回收、堆外内存管理 |

```java
WeakReference<Bitmap> weakBitmap = new WeakReference<>(bitmap);
Bitmap bmp = weakBitmap.get();
if (bmp != null) { /* 使用 */ }
```

---

## 四、类加载机制

### Q7：类加载过程？

```
加载 → 验证 → 准备 → 解析 → 初始化 → 使用 → 卸载
```

- **加载：** 读取字节码，生成 Class 对象
- **验证：** 字节码合法性检查
- **准备：** 为静态变量分配内存，赋默认值（0/null/false）
- **解析：** 符号引用 → 直接引用
- **初始化：** 执行 `<clinit>()` 静态变量赋值和静态代码块

---

### Q8：双亲委派模型？

```
BootstrapClassLoader（引导类加载器）
        ↑
ExtClassLoader（扩展类加载器）
        ↑
AppClassLoader（应用类加载器）
        ↑
自定义 ClassLoader
```

**流程：** 子加载器收到请求 → 委派给父加载器 → 父无法完成才由子加载

**优点：** 避免类重复加载；防止核心 API 被篡改

**Android 中的类加载器：**
- PathClassLoader：加载已安装 APK
- DexClassLoader：加载任意路径 dex/apk（热修复、插件化基础）

---

## 五、并发

### Q9：synchronized 底层原理？

**锁升级过程（单向，不可降级）：**

```
无锁 → 偏向锁 → 轻量级锁（CAS自旋）→ 重量级锁（OS互斥量）
```

- **偏向锁：** Mark Word 记录线程 ID，无竞争下无需 CAS
- **轻量级锁：** CAS 将 Mark Word 替换为锁记录指针，自旋等待
- **重量级锁：** 关联 Monitor 对象，阻塞等待

---

### Q10：volatile 原理？

**保证：**
1. **可见性：** 写后插入 Store Barrier，读前插入 Load Barrier
2. **有序性：** 禁止指令重排序
3. **不保证原子性**（i++ 不是原子操作）

**内存屏障：**
- 写 volatile 前：StoreStore 屏障
- 写 volatile 后：StoreLoad 屏障
- 读 volatile 后：LoadLoad + LoadStore 屏障

---

### Q11：ReentrantLock vs synchronized？

| 特性 | synchronized | ReentrantLock |
|------|-------------|---------------|
| 实现 | JVM 内置 | JDK（AQS） |
| 锁释放 | 自动 | 需手动 unlock |
| 可中断 | ❌ | ✅ lockInterruptibly |
| 公平锁 | ❌ | ✅ new ReentrantLock(true) |
| 条件变量 | 单一 wait/notify | 多个 Condition |
| 尝试获取 | ❌ | ✅ tryLock(timeout) |

---

### Q12：CAS 原理与 ABA 问题？

**CAS：** Compare And Swap，比较期望值与当前值，相等则替换（CPU 原子指令）

**ABA 问题：** 值从 A→B→A，CAS 无法感知中间变化

**解决：** AtomicStampedReference（版本号）

```java
AtomicStampedReference<Integer> ref =
    new AtomicStampedReference<>(100, 0);
ref.compareAndSet(100, 101, 0, 1); // 带版本号比较
```

---

### Q13：ThreadLocal 原理与内存泄漏？

**原理：**

```
Thread → ThreadLocalMap → Entry(WeakReference<ThreadLocal>, value)
```

**内存泄漏：**
- key（ThreadLocal）是弱引用，GC 后变 null
- value 是强引用，无法被回收，形成内存泄漏

**解决：** 用完调用 `threadLocal.remove()`

---

### Q14：线程池核心参数与执行流程？

```java
ThreadPoolExecutor(
    int corePoolSize,       // 核心线程数（长期存活）
    int maximumPoolSize,    // 最大线程数
    long keepAliveTime,     // 非核心线程空闲存活时间
    TimeUnit unit,
    BlockingQueue<Runnable> workQueue,
    ThreadFactory threadFactory,
    RejectedExecutionHandler handler
)
```

**执行流程：**

```
任务提交
  → 核心线程未满：创建核心线程执行
  → 核心线程满：放入队列
  → 队列满：创建非核心线程
  → 达到最大线程数：执行拒绝策略
```

**拒绝策略：**

| 策略 | 行为 |
|------|------|
| AbortPolicy（默认） | 抛出 RejectedExecutionException |
| CallerRunsPolicy | 调用者线程执行 |
| DiscardPolicy | 静默丢弃 |
| DiscardOldestPolicy | 丢弃队列最老任务 |

---

### Q15：AQS 原理？

- `state`：volatile int，表示同步状态
- CLH 变体队列：FIFO 双向链表，存放等待线程

**独占模式（ReentrantLock）：**

```
acquire → tryAcquire → 失败 → addWaiter 入队 → acquireQueued 自旋
release → tryRelease → unparkSuccessor 唤醒后继
```

**共享模式（Semaphore/CountDownLatch）：** acquireShared / releaseShared

---

### Q16：死锁四个必要条件及预防？

**四个条件：**
1. 互斥条件
2. 请求与保持
3. 不可剥夺
4. 循环等待

**预防：** 固定加锁顺序；tryLock 超时；jstack 死锁检测

---

## 六、集合

### Q17：HashMap 底层？

**JDK 1.8：** 数组 + 链表 + 红黑树

| 关键参数 | 值 |
|---------|-----|
| 默认容量 | 16 |
| 负载因子 | 0.75 |
| 树化阈值 | 链表长度 ≥ 8 且数组长度 ≥ 64 |
| 退化阈值 | 红黑树节点 ≤ 6 |

**扩容：** 容量×2，高位为 0 留原位，高位为 1 移动到 index+oldCap

**ConcurrentHashMap 1.8：** CAS + synchronized 锁头节点，分段粒度更细

---

### Q18：ArrayList vs LinkedList？

| 对比 | ArrayList | LinkedList |
|------|-----------|------------|
| 底层 | 数组 | 双向链表 |
| 随机访问 | O(1) | O(n) |
| 插入/删除（中间） | O(n) | O(1) |
| 内存 | 连续紧凑 | 有指针开销 |

---

### Q19：LinkedHashMap 实现 LRU？

```java
Map<Integer, Integer> lruCache =
    new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry eldest) {
            return size() > capacity;
        }
    };
// accessOrder=true：按访问顺序排序（最近访问在尾部）
```

---

### Q20：happens-before 规则？

1. **程序顺序规则：** 同线程前一操作 hb 后一操作
2. **监视器锁规则：** unlock hb 后续 lock
3. **volatile 规则：** 写 volatile hb 后续读
4. **线程启动规则：** start() hb 线程内所有操作
5. **线程终止规则：** 线程所有操作 hb join() 返回
6. **传递性：** A hb B，B hb C → A hb C

---

# Part 2：Kotlin

---

## 七、协程原理

### Q21：协程 vs 线程？

| 对比 | 线程 | 协程 |
|------|------|------|
| 调度 | OS 内核 | 用户态 |
| 切换开销 | 大（上下文切换） | 小（函数调用级别） |
| 数量限制 | 受 OS 限制 | 可创建成千上万 |
| 阻塞 | 阻塞线程 | 挂起不阻塞线程 |
| 本质 | OS 资源 | 轻量级状态机 |

---

### Q22：挂起函数（suspend）原理？

编译后本质是 **CPS（Continuation Passing Style）变换**：

```kotlin
// 原始代码
suspend fun fetchUser(): User = api.getUser()

// 编译后（伪代码）—— 状态机
fun fetchUser(continuation: Continuation<User>): Any {
    when(label) {
        0 -> {
            label = 1
            api.getUser(continuation) // 挂起点，返回 COROUTINE_SUSPENDED
        }
        1 -> {
            return continuation.result // 恢复后返回结果
        }
    }
}
```

**Continuation 接口：**

```kotlin
interface Continuation<in T> {
    val context: CoroutineContext
    fun resumeWith(result: Result<T>)
}
```

---

### Q23：协程调度器？

| Dispatcher | 用途 |
|-----------|------|
| Main | UI 操作，主线程 |
| IO | 网络、文件 IO（可扩展线程池） |
| Default | CPU 密集型（线程数 = CPU 核数） |
| Unconfined | 不限制线程（慎用） |

```kotlin
viewModelScope.launch(Dispatchers.IO) {
    val data = fetchFromNetwork()
    withContext(Dispatchers.Main) {
        updateUI(data)
    }
}
```

---

### Q24：结构化并发？

```kotlin
// 父协程取消 → 子协程全部取消
// 子协程失败 → 父协程取消（SupervisorJob 除外）
val job = scope.launch {
    launch { task1() }
    launch { task2() }
}
job.cancel() // 取消所有子协程

// SupervisorJob：子协程失败不影响兄弟和父协程
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
```

---

### Q25：协程异常处理？

```kotlin
// launch：使用 CoroutineExceptionHandler
val handler = CoroutineExceptionHandler { _, e ->
    Log.e("TAG", "Exception: $e")
}
scope.launch(handler) { throw RuntimeException() }

// async：异常在 await() 时抛出
val deferred = scope.async { throw RuntimeException() }
try {
    deferred.await()
} catch (e: Exception) { }
```

---

### Q33：Kotlin 协程中 launch 和 async 有什么区别？

launch：启动一个不返回结果的协程，返回 Job，用于执行无需返回值的并发任务（如网络请求、数据库写入）。
async：启动一个返回 Deferred<T> 的协程，通过 .await() 获取结果，用于需要返回值的并发计算。

```kotlin
// launch：发射即忘
scope.launch {
    saveToDb(data)
}

// async：并发执行后汇总结果
val user = async { fetchUser() }
val orders = async { fetchOrders() }
val result = user.await() to orders.await()
```

关键区别：async 可并发执行多个任务然后汇总；异常处理不同——launch 中异常立即传播，async 中异常在 await() 时才抛出。

---

## 八、Flow

### Q26：Flow vs LiveData vs RxJava？

| 特性 | Flow | LiveData | RxJava |
|------|------|---------|--------|
| 语言 | Kotlin | Java/Kotlin | Java/Kotlin |
| 线程切换 | flowOn | 自动主线程 | observeOn/subscribeOn |
| 生命周期感知 | 需 repeatOnLifecycle | 自动 | 需手动 |
| 背压 | 内置支持 | 不支持 | 支持 |
| 冷/热 | 默认冷流 | 热流 | 两者都有 |
| 操作符 | 丰富 | 少 | 极丰富 |

---

### Q27：StateFlow vs SharedFlow？

| 特性 | StateFlow | SharedFlow |
|------|-----------|------------|
| 初始值 | 必须有 | 不需要 |
| 粘性 | 总是（新订阅者获取最新值） | 可配置 replay |
| 相同值 | 不触发（distinctUntilChanged） | 触发 |
| 用途 | UI 状态 | 一次性事件 |

```kotlin
// StateFlow
val _uiState = MutableStateFlow(UiState())
val uiState: StateFlow<UiState> = _uiState.asStateFlow()

// SharedFlow（事件总线）
val _events = MutableSharedFlow<Event>()
viewModelScope.launch {
    _events.emit(Event.NavigateToLogin)
}

// 生命周期安全收集
lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.uiState.collect { render(it) }
    }
}
```

---

## 九、关键字原理

### Q28：inline / noinline / crossinline？

- **inline：** 函数体在调用处展开，消除 lambda 对象创建开销
- **noinline：** inline 函数中某个 lambda 不内联（需作为对象传递时）
- **crossinline：** 禁止 lambda 中使用非局部 return

```kotlin
inline fun measureTime(block: () -> Unit): Long {
    val start = System.currentTimeMillis()
    block()
    return System.currentTimeMillis() - start
}

inline fun runAsync(crossinline block: () -> Unit) {
    Thread { block() }.start()
}

inline fun foo(inlined: () -> Unit, noinline notInlined: () -> Unit) {
    inlined()
    bar(notInlined)
}
```

---

### Q29：reified 原理？

普通泛型运行时类型擦除，reified + inline 可在运行时获取真实类型：

```kotlin
inline fun <reified T> Context.startActivity() {
    startActivity(Intent(this, T::class.java))
}
startActivity<MainActivity>()
// 编译后 T 被替换为 MainActivity，不存在类型擦除
```

---

### Q30：委托属性？

```kotlin
// lazy：线程安全的懒加载
val data by lazy { heavyComputation() }

// observable：属性变化监听
var name by Delegates.observable("") { _, old, new ->
    println("$old → $new")
}

// by viewModels()：内部使用 ViewModelProvider
val viewModel by viewModels<MyViewModel>()

// 自定义委托
class PreferenceDelegate(private val key: String) {
    operator fun getValue(thisRef: Any?, property: KProperty<*>): String =
        prefs.getString(key, "") ?: ""
    operator fun setValue(thisRef: Any?, property: KProperty<*>, value: String) =
        prefs.edit().putString(key, value).apply()
}
```

---

### Q31：扩展函数原理？

```kotlin
fun String.isEmail() = contains("@")

// 编译后（Java 静态方法）：
public static boolean isEmail(String receiver) {
    return receiver.contains("@");
}
```

- 扩展函数不是真正成员函数，无法访问私有成员
- 不支持多态（根据变量声明类型决定，非运行时类型）

---

### Q32：密封类 vs 枚举？

| 特性 | 枚举 | 密封类 |
|------|------|--------|
| 实例 | 单例 | 可多实例 |
| 构造参数 | 相同类型 | 每个子类可不同 |
| 携带数据 | 有限 | 灵活 |
| 继承 | ❌ | ✅ |

```kotlin
sealed class UiState {
    object Loading : UiState()
    data class Success(val data: List<Item>) : UiState()
    data class Error(val message: String) : UiState()
}

// when 可完备性检查（不需要 else）
when(state) {
    is UiState.Loading -> showLoading()
    is UiState.Success -> showData(state.data)
    is UiState.Error   -> showError(state.message)
}
```

---

### Q34：Kotlin 中 data class 会自动生成哪些方法？它和普通 class 有什么区别？ [easy]

data class 自动生成：
1. equals()：基于所有主构造函数属性比较值相等性（而非引用）。
2. hashCode()：基于属性生成一致的哈希值。
3. toString()：返回 "ClassName(prop1=val1, prop2=val2)" 格式字符串。
4. copy()：浅拷贝，支持修改部分属性创建新对象。
5. componentN()：支持解构声明（val (a, b) = dataObj）。

限制：主构造函数至少有一个参数；不能是 abstract/open/sealed/inner 类。
使用场景：DTO、UI State、API 响应实体等需要值比较的数据容器。

---

### Q35：以下关于 Kotlin 空安全的说法，哪个是正确的？ [choice|easy]

- A. Kotlin 完全消除了 NullPointerException
- B. ?.（安全调用）和 !!（非空断言）作用相同
- C. !! 操作符在值为 null 时会抛出 NullPointerException ✓
- D. lateinit var 可以用于基本类型（Int、Boolean）

!! 操作符强制解包可空类型，若值为 null 则抛出 NullPointerException，应谨慎使用。
