# MySQL

### Q1：MySQL 中 B+ 树索引和 B 树索引有什么区别？

1. B+树叶子节点存储所有数据，B树每个节点都存储数据。
2. B+树叶子节点通过链表相连，支持范围查询；B树不支持。
3. B+树非叶子节点只存键值，同等磁盘页可存更多键，树更矮，IO次数更少。
4. MySQL InnoDB 使用 B+树，主要因为范围查询和全表扫描效率高。

---
### Q2：下列关于 MySQL 事务隔离级别的说法，哪个是正确的？ [choice|easy]

- A. MySQL 默认隔离级别是 READ COMMITTED
- B. MySQL 默认隔离级别是 REPEATABLE READ ✓
- C. MySQL 默认隔离级别是 SERIALIZABLE
- D. MySQL 默认隔离级别是 READ UNCOMMITTED

MySQL 默认隔离级别是 REPEATABLE READ（可重复读），通过 MVCC 解决了脏读和不可重复读，通过 Gap Lock 解决了幻读。

---
### Q3：什么是 MVCC？它是如何解决并发问题的？ [hard]

MVCC（多版本并发控制）是一种并发控制机制，核心思想是通过保存数据的多个历史版本，使读操作不需要加锁。

InnoDB 实现：
1. 每行数据有隐藏字段：trx_id（最近修改的事务ID）、roll_pointer（指向 undo log 的指针）
2. undo log 存储历史版本链
3. ReadView：事务开始时生成快照，根据 trx_id 判断哪个版本可见

解决的问题：
- 读写不阻塞：读操作读历史快照，写操作写最新版本
- 避免脏读：读不到未提交的事务写的数据

---
### Q4：下面哪种情况会导致索引失效？ [choice|easy]

- A. WHERE age = 25
- B. WHERE YEAR(create_time) = 2024 ✓
- C. WHERE name = 'Alice'
- D. WHERE id > 100

对索引列进行函数运算、类型隐式转换、使用 != 或 NOT IN、LIKE 以通配符开头（%abc）、联合索引不满足最左前缀原则等都会导致索引失效。

---
