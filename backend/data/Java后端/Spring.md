# Spring

### Q1：Spring Bean 的生命周期是怎样的？

1. 实例化（Instantiation）：反射创建 Bean 实例
2. 属性注入（Populate Properties）：注入依赖
3. 初始化前（BeanPostProcessor#postProcessBeforeInitialization）
4. 初始化（InitializingBean#afterPropertiesSet 或 @PostConstruct）
5. 初始化后（BeanPostProcessor#postProcessAfterInitialization）
6. 使用
7. 销毁（DisposableBean#destroy 或 @PreDestroy）

---
### Q2：Spring 如何解决循环依赖？ [hard]

Spring 通过三级缓存解决 setter 注入的循环依赖：

1. 一级缓存（singletonObjects）：完整 Bean
2. 二级缓存（earlySingletonObjects）：提前曝光的 Bean（未完成属性注入）
3. 三级缓存（singletonFactories）：Bean 工厂，可创建代理

流程：A 实例化后，将工厂放入三级缓存 → 注入 B → B 需要 A，从三级缓存获取 A 的代理，放入二级缓存 → B 完成 → A 完成注入，放入一级缓存。

注意：构造器注入的循环依赖无法解决，因为无法提前曝光。

---
### Q3：Spring AOP 的实现原理是什么？

Spring AOP 基于动态代理实现：

1. JDK 动态代理：目标类实现了接口时使用，通过 Proxy.newProxyInstance 创建代理，实现 InvocationHandler
2. CGLIB 代理：目标类没有实现接口时使用，通过字节码技术生成子类

Spring Boot 默认使用 CGLIB（Spring 5.x+）。

切面执行顺序：Around（前）→ Before → 方法执行 → Around（后）→ After → AfterReturning/AfterThrowing

---
