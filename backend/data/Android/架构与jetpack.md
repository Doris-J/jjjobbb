# 架构与 Jetpack 面试八股文

---

# Part 1：架构设计

---

## 一、架构模式

### Q1：MVC / MVP / MVVM / MVI 对比？

| 模式 | 特点 | 问题 |
|------|------|------|
| MVC | Controller 连接 Model 和 View | Android 中 Activity 即 Controller，导致臃肿 |
| MVP | Presenter 处理逻辑，View 接口隔离 | Presenter 与 View 1:1，接口繁琐 |
| MVVM | ViewModel + 数据绑定，View 观察数据 | 双向绑定调试困难 |
| MVI | 单向数据流，State 不可变 | 样板代码多 |

---

### Q2：MVVM 数据流？

```
View（Activity/Fragment）
    ↕ 观察 StateFlow/LiveData
ViewModel（持有数据，不持有 View 引用）
    ↕ 调用
Repository（数据仓库，单一数据来源）
    ↕
DataSource（Remote API / Local DB）
```

---

### Q3：MVI 架构？

```
用户操作 → Intent（用户意图）
    → ViewModel 处理
        → 生成新的不可变 State
            → View 渲染 UI
```

```kotlin
// State：UI 的完整快照（不可变）
data class HomeState(
    val isLoading: Boolean = false,
    val users: List<User> = emptyList(),
    val error: String? = null
)

// Intent：用户动作
sealed class HomeIntent {
    object LoadUsers : HomeIntent()
    data class DeleteUser(val id: Int) : HomeIntent()
}

// ViewModel
class HomeViewModel : ViewModel() {
    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()

    fun processIntent(intent: HomeIntent) {
        when (intent) {
            is HomeIntent.LoadUsers  -> loadUsers()
            is HomeIntent.DeleteUser -> deleteUser(intent.id)
        }
    }

    private fun loadUsers() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                val users = repository.getUsers()
                _state.update { it.copy(isLoading = false, users = users) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

// View 收集状态
lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.state.collect { state ->
            when {
                state.isLoading        -> showLoading()
                state.error != null    -> showError(state.error)
                state.users.isNotEmpty() -> showUsers(state.users)
            }
        }
    }
}
```

---

## 二、Clean Architecture

### Q4：Clean Architecture 分层？

```
┌─────────────────────────────────────┐
│   Presentation Layer（展示层）        │
│   Activity / Fragment / ViewModel   │
├─────────────────────────────────────┤
│   Domain Layer（领域层）              │
│   UseCase / Repository Interface    │
├─────────────────────────────────────┤
│   Data Layer（数据层）                │
│   Repository Impl / API / DB        │
└─────────────────────────────────────┘
```

**依赖方向：** Presentation → Domain ← Data

**UseCase 示例：**

```kotlin
// Domain 层：只依赖接口，不依赖具体实现
class GetUserUseCase(private val repository: UserRepository) {
    suspend operator fun invoke(userId: Int): Result<User> {
        return repository.getUser(userId)
    }
}

// Presentation 层调用
class UserViewModel(
    private val getUserUseCase: GetUserUseCase
) : ViewModel() {
    fun loadUser(id: Int) {
        viewModelScope.launch {
            getUserUseCase(id)
                .onSuccess { _state.value = UiState.Success(it) }
                .onFailure { _state.value = UiState.Error(it.message) }
        }
    }
}
```

---

## 三、设计原则

### Q5：SOLID 原则举例？

| 原则 | 全称 | Android 举例 |
|------|------|------------|
| S | 单一职责 | Activity 只负责 UI，逻辑放 ViewModel |
| O | 开闭原则 | 新增支付方式，只新增实现类不修改现有代码 |
| L | 里氏替换 | 子类可完全替换父类使用 |
| I | 接口隔离 | 细化接口，不强迫实现不需要的方法 |
| D | 依赖倒置 | 依赖抽象接口，不依赖具体实现（配合 DI） |

---

## 四、组件化

### Q6：组件化架构分层？

```
┌─────────────────────────────────────┐
│             App 壳工程               │
├──────────────┬──────────────────────┤
│   业务组件A   │      业务组件B         │
│   (module)  │      (module)         │
├──────────────┴──────────────────────┤
│             基础业务层                │
│    （账号 / 统计 / 分享 / 支付）       │
├─────────────────────────────────────┤
│             基础组件层                │
│   （网络 / 图片 / 存储 / UI基础库）    │
└─────────────────────────────────────┘
```

**组件间通信方案：**
1. **路由**（ARouter）：页面跳转、跨模块服务发现
2. **接口下沉**：接口定义在基础层，实现在各业务组件
3. **EventBus / Flow**：事件通知（解耦）

---

### Q7：ARouter 原理？

**编译期（APT 注解处理器）：**

```
扫描 @Route 注解
    → 生成路由映射表（路径 → Class 的 Map）
    → 生成 Java 文件，在模块初始化时注册到 RouteMap
```

**运行期：**

```
ARouter.getInstance().build("/user/login").navigation()
    → 查找路由表
    → 找到 LoginActivity.class
    → 创建 Intent 并启动
```

**跨模块服务调用：**

```kotlin
// 接口定义在基础层
interface IUserService : IProvider {
    fun isLogin(): Boolean
}

// 实现在用户模块（编译期注册）
@Route(path = "/service/user")
class UserServiceImpl : IUserService {
    override fun isLogin(): Boolean = true
    override fun init(context: Context) {}
}

// 其他模块调用
val userService = ARouter.getInstance()
    .navigation(IUserService::class.java)
userService?.isLogin()
```

---

### Q8：模块独立运行方案？

```groovy
// gradle.properties
isModule = false  // true：独立运行；false：集成到宿主

// build.gradle
if (isModule.toBoolean()) {
    apply plugin: 'com.android.application'
} else {
    apply plugin: 'com.android.library'
}

// 独立运行时使用独立的 AndroidManifest 和 Application
sourceSets {
    main {
        if (isModule.toBoolean()) {
            manifest.srcFile 'src/main/module/AndroidManifest.xml'
            java.srcDirs += 'src/main/module/java'
        } else {
            manifest.srcFile 'src/main/AndroidManifest.xml'
        }
    }
}
```

---

## 五、依赖注入

### Q9：Hilt 原理？

**编译期（KAPT/KSP）：**

```
@HiltAndroidApp     → 生成 Hilt_Application 基类
@AndroidEntryPoint  → 生成 Hilt_MainActivity 基类
@Provides/@Binds    → 生成对应 Module 的 Factory 类
```

**运行期：**

```
Hilt 生成的基类 onCreate 中触发注入
    → 调用 DaggerXxxComponent.inject(this)
    → 通过生成的代码完成依赖赋值
```

```kotlin
// 定义依赖
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideRetrofit(): Retrofit =
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): ApiService =
        retrofit.create(ApiService::class.java)
}

// 注入使用
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject lateinit var repository: UserRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // repository 已自动注入
    }
}
```

**Scope 对比：**

| Scope | 生命周期 |
|-------|---------|
| @Singleton | Application |
| @ActivityScoped | Activity |
| @ViewModelScoped | ViewModel |
| @FragmentScoped | Fragment |

---

### Q10：Koin vs Hilt？

| 对比 | Koin | Hilt |
|------|------|------|
| 实现方式 | 运行时（无代码生成） | 编译期（代码生成） |
| 性能 | 运行时略慢 | 编译期验证，运行时更快 |
| 错误发现 | 运行时崩溃 | 编译时报错 |
| 学习曲线 | 低（Kotlin DSL） | 中（注解较多） |
| Google 支持 | ❌ | ✅ 官方推荐 |

```kotlin
// Koin 示例
val appModule = module {
    single { Retrofit.Builder().build().create(ApiService::class.java) }
    single { UserRepository(get()) }
    viewModel { UserViewModel(get()) }
}

startKoin { modules(appModule) }

// 使用
class UserFragment : Fragment() {
    val viewModel by viewModel<UserViewModel>()
}
```

---

# Part 2：Jetpack

---

## 六、ViewModel

### Q11：ViewModel 如何在横竖屏切换后存活？

**原理链路：**

```
Activity 发生配置变化（横竖屏切换）
    → onRetainNonConfigurationInstance() 保存 ViewModelStore
    → Activity 销毁重建
    → 新 Activity 通过 getLastNonConfigurationInstance() 恢复 ViewModelStore
    → 从 ViewModelStore 中取出原有 ViewModel 实例（未被销毁）
```

**ViewModelStore：** 内部维护 `Map<String, ViewModel>` 容器

**ViewModel 真正销毁时机：**
- Activity 真正 finish（用户按 Back 键或调用 finish()）
- 此时调用 `ViewModelStore.clear()` → 触发 `ViewModel.onCleared()`

---

### Q12：ViewModel 使用注意事项？

```kotlin
// ❌ 不要持有 Context 或 View（可能导致内存泄漏）
class BadViewModel : ViewModel() {
    var activity: Activity? = null // 错误！
}

// ✅ 需要 Context 时使用 AndroidViewModel
class MyViewModel(application: Application) : AndroidViewModel(application) {
    fun getAppName() = getApplication<Application>().getString(R.string.app_name)
}

// ✅ 使用 viewModelScope，Activity 销毁自动取消协程
class MyViewModel : ViewModel() {
    fun loadData() {
        viewModelScope.launch {
            val data = repository.getData()
            _uiState.value = UiState.Success(data)
        }
    }
}
```

---

## 七、LiveData

### Q13：LiveData 原理？

**核心：LifecycleBoundObserver 生命周期感知**

```
setValue() / postValue()
    → dispatchingValue()
        → considerNotify(observer)
            → 检查 observer 是否活跃（STARTED/RESUMED）
            → 检查 version > lastVersion（避免重复分发）
            → 调用 observer.onChanged(data)
```

**粘性事件原因：** 新观察者注册时，若 LiveData 有值且观察者处于活跃状态，
会立即收到最新值（version 机制决定）

**消除粘性：**

```kotlin
// 方式1：SingleLiveEvent（只分发一次）
class SingleLiveEvent<T> : MutableLiveData<T>() {
    private val pending = AtomicBoolean(false)

    override fun observe(owner: LifecycleOwner, observer: Observer<in T>) {
        super.observe(owner) {
            if (pending.compareAndSet(true, false)) {
                observer.onChanged(it)
            }
        }
    }

    override fun setValue(value: T?) {
        pending.set(true)
        super.setValue(value)
    }
}

// 方式2：使用 SharedFlow(replay=0)（推荐）
val events = MutableSharedFlow<Event>() // 默认 replay=0，无粘性
```

---

## 八、Lifecycle

### Q14：Lifecycle 实现原理？

```kotlin
// ComponentActivity 实现 LifecycleOwner 接口
// 内部持有 LifecycleRegistry 负责状态流转

// API 29+：直接注册 ActivityLifecycleCallbacks
// API 29 以下：注入无 UI 的 ReportFragment 来监听生命周期
```

**状态流转：**

```
INITIALIZED → CREATED → STARTED → RESUMED
                                      ↓
              DESTROYED ← CREATED ← STARTED
```

```kotlin
// 自定义生命周期观察者
class MyObserver : DefaultLifecycleObserver {
    override fun onStart(owner: LifecycleOwner) { startSomething() }
    override fun onStop(owner: LifecycleOwner)  { stopSomething()  }
}

lifecycle.addObserver(MyObserver())
```

---

## 九、Room

### Q15：Room 整体架构？

```kotlin
// @Entity → 对应 SQLite 表
@Entity(tableName = "users")
data class User(
    @PrimaryKey val id: Int,
    @ColumnInfo(name = "user_name") val name: String,
    val age: Int
)

// @Dao → 数据访问接口（编译期生成实现类）
@Dao
interface UserDao {
    @Query("SELECT * FROM users WHERE id = :id")
    suspend fun getUser(id: Int): User?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: User)

    @Delete
    suspend fun deleteUser(user: User)

    @Query("SELECT * FROM users")
    fun getAllUsers(): Flow<List<User>> // 数据变化自动通知
}

// @Database → 数据库入口
@Database(entities = [User::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null
        fun getInstance(context: Context) = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java, "app.db"
            ).build().also { INSTANCE = it }
        }
    }
}
```

**数据库升级：**

```kotlin
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(database: SupportSQLiteDatabase) {
        database.execSQL(
            "ALTER TABLE users ADD COLUMN age INTEGER NOT NULL DEFAULT 0"
        )
    }
}

Room.databaseBuilder(context, AppDatabase::class.java, "app.db")
    .addMigrations(MIGRATION_1_2)
    .build()
```

---

## 十、Navigation

### Q16：Navigation 组件原理？

```kotlin
// NavHostFragment 作为导航容器
// NavController 管理导航回退栈
// NavGraph（XML）定义页面和跳转关系

// 页面跳转
findNavController().navigate(
    R.id.action_home_to_detail,
    bundleOf("userId" to 123)
)

// 安全参数传递（Safe Args）
val args: DetailFragmentArgs by navArgs()
val userId = args.userId

// 返回并携带结果
findNavController()
    .previousBackStackEntry
    ?.savedStateHandle
    ?.set("result", "success")
findNavController().popBackStack()

// 上一个页面接收结果
findNavController()
    .currentBackStackEntry
    ?.savedStateHandle
    ?.getLiveData<String>("result")
    ?.observe(viewLifecycleOwner) { result -> }
```

---

## 十一、WorkManager

### Q17：WorkManager 适用场景与实现？

**适用：** 需要保证执行的后台任务（应用退出或设备重启后仍执行）

```kotlin
// 定义 Worker
class SyncWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            repository.sync()
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry()
            else Result.failure()
        }
    }
}

// 构建并提交任务
val request = OneTimeWorkRequestBuilder<SyncWorker>()
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
    )
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
    .build()

WorkManager.getInstance(context)
    .enqueueUniqueWork("sync", ExistingWorkPolicy.KEEP, request)

// 观察执行状态
WorkManager.getInstance(context)
    .getWorkInfoByIdLiveData(request.id)
    .observe(this) { info ->
        when (info?.state) {
            WorkInfo.State.SUCCEEDED -> showSuccess()
            WorkInfo.State.FAILED    -> showFailed()
            WorkInfo.State.RUNNING   -> showLoading()
            else -> {}
        }
    }
```

**底层实现：** 根据 API 版本自动选择 JobScheduler / AlarmManager + BroadcastReceiver

---

## 十二、DataBinding

### Q18：DataBinding 原理？

**编译期：**
- 解析 XML 中的 `@{}` / `@={}` 表达式
- 生成 `XxxBinding` 类，包含所有 View 引用和绑定逻辑

**运行期：**

```kotlin
// Activity 中使用
val binding = ActivityMainBinding.inflate(layoutInflater)
setContentView(binding.root)
binding.viewModel = viewModel
binding.lifecycleOwner = this // 使 LiveData 自动更新 UI
```

```xml
<!-- 单向绑定 -->
<TextView android:text="@{viewModel.userName}" />

<!-- 双向绑定（@= 表达式，View 改变会同步到 ViewModel） -->
<EditText android:text="@={viewModel.userName}" />

<!-- 事件绑定 -->
<Button android:onClick="@{() -> viewModel.onButtonClick()}" />

<!-- 表达式语言 -->
<TextView android:text="@{user.age > 18 ? @string/adult : @string/minor}" />
```

---

## 十三、Paging 3

### Q19：Paging 3 架构？

```
┌─────────────────────┐
│   PagingSource      │  定义数据来源（网络/数据库）
│   load()            │  实现分页加载逻辑
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   Pager             │  配置分页参数
│   PagingConfig      │  pageSize / prefetchDistance
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   PagingData<T>     │  流式数据（Flow<PagingData<T>>）
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   PagingDataAdapter │  RecyclerView 适配器
│   DiffUtil 自动计算  │
└─────────────────────┘
```

```kotlin
// PagingSource 实现
class UserPagingSource(private val api: ApiService) :
    PagingSource<Int, User>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, User> {
        val page = params.key ?: 1
        return try {
            val response = api.getUsers(page, params.loadSize)
            LoadResult.Page(
                data = response.users,
                prevKey = if (page == 1) null else page - 1,
                nextKey = if (response.users.isEmpty()) null else page + 1
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<Int, User>): Int? {
        return state.anchorPosition?.let { anchor ->
            state.closestPageToPosition(anchor)?.prevKey?.plus(1)
                ?: state.closestPageToPosition(anchor)?.nextKey?.minus(1)
        }
    }
}

// ViewModel
val users: Flow<PagingData<User>> = Pager(
    config = PagingConfig(pageSize = 20, prefetchDistance = 5),
    pagingSourceFactory = { UserPagingSource(api) }
).flow.cachedIn(viewModelScope)

// Fragment 收集
lifecycleScope.launch {
    viewModel.users.collectLatest { pagingData ->
        adapter.submitData(pagingData)
    }
}
```

---

# Part 3：Jetpack Compose

---

## 十四、核心思想

### Q20：声明式 UI vs 命令式 UI？

```kotlin
// 命令式（传统 View 体系）：描述"如何变化"
fun updateUI(isLoading: Boolean) {
    if (isLoading) {
        progressBar.visibility = View.VISIBLE
        button.isEnabled = false
        textView.text = "加载中..."
    } else {
        progressBar.visibility = View.GONE
        button.isEnabled = true
        textView.text = "加载完成"
    }
}
// 问题：状态越多，分支越多，越难维护

// 声明式（Compose）：描述"当前状态下 UI 应该是什么样"
@Composable
fun Content(isLoading: Boolean) {
    if (isLoading) {
        CircularProgressIndicator()
        Text("加载中...")
    } else {
        Button(onClick = {}) { Text("操作") }
        Text("加载完成")
    }
}
// 状态变化 → 触发重组 → UI 自动更新为新状态对应的样子
```

---

## 十五、重组（Recomposition）

### Q21：重组触发条件与规则？

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }

    Column {
        Text("Count: $count")   // 重组
        Divider()               // 不重组（未读取 count）
        Button(onClick = { count++ }) {
            Text("点击")        // 不重组
        }
    }
}
```

**重组规则：**
- 只有读取了变化 State 的 Composable 才会重组（精准重组）
- 参数未变化的 Composable 可被跳过（Skippable，需参数稳定）
- 重组可以并发执行，Composable 函数应无副作用
- 重组顺序不固定，不应依赖执行顺序

**帮助 Compose 优化重组：**

```kotlin
// @Stable：告知 Compose 该类是稳定的（相等则跳过重组）
@Stable
data class User(val id: Int, val name: String)

// @Immutable：告知 Compose 该类不可变（最强优化）
@Immutable
data class Config(val theme: String, val fontSize: Int)

// ✅ 使用不可变集合（kotlinx.collections.immutable）
val users: ImmutableList<User> = persistentListOf()
```

---

### Q22：remember vs rememberSaveable？

| | remember | rememberSaveable |
|--|---------|-----------------|
| 重组时 | ✅ 保留 | ✅ 保留 |
| 配置变化（横竖屏）时 | ❌ 丢失 | ✅ 保留 |
| 进程被杀死后恢复 | ❌ 丢失 | ✅ 保留（需 Parcelable/Saver） |
| 内部机制 | Composition 本地存储 | Bundle（同 onSaveInstanceState） |

```kotlin
var text by remember { mutableStateOf("") }
var count by rememberSaveable { mutableStateOf(0) }

// 自定义 Saver（非 Parcelable 类型）
data class SearchState(val query: String, val page: Int)

val SearchStateSaver = listSaver<SearchState, Any>(
    save    = { listOf(it.query, it.page) },
    restore = { SearchState(it[0] as String, it[1] as Int) }
)

var searchState by rememberSaveable(stateSaver = SearchStateSaver) {
    mutableStateOf(SearchState("", 0))
}
```

---

## 十六、State 与 SideEffect

### Q23：状态提升（State Hoisting）？

```kotlin
// ✅ 无状态 Composable，状态由调用者持有
@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    TextField(value = query, onValueChange = onQueryChange, modifier = modifier)
}

// 父 Composable 持有状态
@Composable
fun SearchScreen(viewModel: SearchViewModel = viewModel()) {
    val query by viewModel.query.collectAsState()
    SearchBar(query = query, onQueryChange = viewModel::onQueryChange)
}
```

---

### Q24：SideEffect API？

```kotlin
// 1. LaunchedEffect：进入组合时启动协程，key 变化时重新执行
LaunchedEffect(userId) { viewModel.loadUser(userId) }

// key 为 Unit 时只执行一次（类似 onCreate）
LaunchedEffect(Unit) { viewModel.init() }

// 2. DisposableEffect：需要清理资源的副作用
DisposableEffect(lifecycleOwner) {
    val observer = LifecycleEventObserver { _, event -> onEvent(event) }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
}

// 3. SideEffect：每次重组成功后执行（同步）
SideEffect { analytics.logScreenView(screenName) }

// 4. rememberCoroutineScope：在事件回调中启动协程
val scope = rememberCoroutineScope()
Button(onClick = { scope.launch { submitForm() } }) { Text("提交") }

// 5. produceState：将非 Compose 状态转换为 Compose State
val user by produceState<User?>(initialValue = null, userId) {
    value = userRepository.getUser(userId)
}
```

---

## 十七、Compose 与 View 互操作

### Q25：互操作方案？

```kotlin
// 1. Compose 中嵌入传统 View（AndroidView）
@Composable
fun WebViewComposable(url: String) {
    AndroidView(
        factory = { context ->
            WebView(context).apply { settings.javaScriptEnabled = true }
        },
        update = { webView -> webView.loadUrl(url) },
        modifier = Modifier.fillMaxSize()
    )
}

// 2. 传统 View / XML 中嵌入 Compose（ComposeView）
binding.composeView.apply {
    setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
    setContent {
        MaterialTheme { UserCard(user = currentUser) }
    }
}
```

---

## 十八、性能优化与动画

### Q26：Compose 性能优化？

```kotlin
// 1. LazyColumn 使用 key
LazyColumn {
    items(items = users, key = { user -> user.id }) { user ->
        UserItem(user = user)
    }
}

// 2. derivedStateOf（减少不必要的重组）
val showButton by remember {
    derivedStateOf { listState.firstVisibleItemIndex > 0 }
}

// 3. 方法引用（稳定，避免重建 Lambda）
Button(onClick = viewModel::onButtonClick)

// 4. 在 Modifier lambda 中读取频繁变化的 State（跳过重组，直接在绘制阶段应用）
Box(modifier = Modifier.offset { IntOffset(offset.value.toInt(), 0) })
```

---

### Q27：Compose 动画？

```kotlin
// animateFloatAsState（简单属性动画）
val alpha by animateFloatAsState(
    targetValue = if (isVisible) 1f else 0f,
    animationSpec = tween(300), label = "alpha"
)

// AnimatedVisibility（显隐动画）
AnimatedVisibility(
    visible = isVisible,
    enter = fadeIn() + slideInVertically(),
    exit  = fadeOut() + slideOutVertically()
) { Text("Hello!") }

// rememberInfiniteTransition（无限循环动画）
val infiniteTransition = rememberInfiniteTransition(label = "infinite")
val scale by infiniteTransition.animateFloat(
    initialValue = 1f, targetValue = 1.2f,
    animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
    label = "scale"
)
```

---

### Q28：Compose 主题系统？

```kotlin
@Composable
fun MyAppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}

// 使用主题颜色和字体
Text("点击", color = MaterialTheme.colorScheme.primary,
     style = MaterialTheme.typography.labelLarge)

// 自定义扩展颜色
val LocalExtendedColors = staticCompositionLocalOf { ExtendedColors() }

data class ExtendedColors(
    val success: Color = Color(0xFF4CAF50),
    val warning: Color = Color(0xFFFFC107)
)

@Composable
fun MyAppTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalExtendedColors provides ExtendedColors()) {
        MaterialTheme(content = content)
    }
}
```
