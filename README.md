# pomeloDataMgr
mysql db redis cache plugin base on pomelo
### 作用分析
* 有些初级甚至中级程序员,他们逻辑思维非常棒,但因为经验问题,在项目的产出上效率不是很理想.
* 为了发挥这些工程师的优势,和降低研发难度.某封装了这个缓存和持久化的插件.
* 于是,逻辑工程师仅需要关注逻辑,不再考虑缓存和持久化的问题.

### 成功案例
* 某所在的公司有2个项目组,另一个项目组没有专门的服务器开发,一直是由前端程序在写服务器逻辑层的东西.
* 公司领导让我去做个技术支持,帮忙把其服务器问题处理下(具体问题就不说了).
* 某过去搭建了一个pomelo服务器,配置了该插件,并给前端程序讲解了该插件的使用方法(其实就是在什么情况下调用哪个接口).
* 之后该前端程序用了小一周的时间,将其项目原来5,6个模块的逻辑移植到了新搭建的pomelo服务器上.效率很是可观.
* 并且担负起了新模块的服务器研发.

### 依赖
```
"dependencies": {
		"db-mgr": "^1.0.1",
		"db-table": "^1.0.0",
		"table-redis": "^1.0.0",
}
```
* 依赖的这几个包,都是最近独立封装出来的.
* db-mgr也会依赖mysql和generic-pool
* table-redis依赖ioredis
* 之所以将这几个包分别独立出来,而不是统一的放在一个包中(原来确实是在一个包中).
* 是因为这些包均不应该是单例模式,在项目中有可能新建另外的实例去负责别的事儿.

### 使用方法
1. 进入pomelo的game-server下,执行命令:
```
npm install pomelo-data-mgr --save
```
2. 进入pomelo项目的config文件夹下,新建dataMgr文件夹,进入dataMgr,新建dataMgr.json
```
{
  "dataMgr": {
    "mysql": {
      "host": "192.168.10.231",
      "port": "3306",
      "database": "chariot",
      "user": "root",
      "password": "111111"
    },
    "redis": {
      "host": "192.168.10.231",
      "port": 6379,
      "password": {}
    }
  }
}
```
3. app.js中可配置服务,在需要的服务配置中,增加一行代码.比如在大厅服的配置.
```
app.configure('production|development', 'hall', function () {
    app.use(require('pomelo-data-mgr'), require(app.getBase() + "/config/dataMgr/dataMgr.json"));
});
```
4. 在逻辑代码中需要数据支持的地方,使用如下代码:
```
pomelo.app.get('dataMgr').getTableData(tableName, 1, cb);
```
示例代码可在cb中取到tableName这张表中,外键值为1的数据.
同理调用其他方法,即可完成其他功能(无非就是CRUD).

### 使用注意
* 该插件采用的是node原生的异步风格,并未支持同步方式(以后可能会改),所以使用者需适应异步编程的方式.
* 插件的单条数据更新需传入一个redisIndex,是限制于redis中的list结构的更新方式.所以,使用者要知道我即将更新的数据的redisIndex是什么.
* redisIndex是什么?
* redis的list结构,取出的是个数组,redisIndex即是这个数组的下标.
* 但很多时候,逻辑并不需要数组全部的数据(根据条件获取),这时候,我就会在数据中增加一个redisIndex的字段,
* 以便需要数据更新的时候会用.而且请放心,缓存的数据,我会去掉这个字段.

### 方法支持
* 取某个表中sign相关的所有数据
```
getTableData(tableName, sign, cb)   // sign 主键/外键的值
```
* 根据条件取数据
```
getTableDataByCondition(tableName, condition, cb) // 取出的数据会有redisIndex字段
```
* 获取多表数据,返回数据顺序与请求数组顺序相同.
```
getDataByArray(arr, cb)
```
* 插入数据(支持数组)
```
insertData(tableName, jsonArray, cb)
```
* 数据更新
``` 
updateData(tableName, jsonValue, redisIndex, cb)
```
* 根据redis中的下标,删除某一条数据,首先清除缓存,然后删除数据库.
```
deleteTableData(tableName, foreignValue, index, cb)
```
* 根据外键值删除数据
```
deleteTableDataByForeignValue(tableName, foreignValue, cb)
```
* 获得某个表的主键名
```
getPrimaryKey(tableName)
```
* 某表某条件下数据是否存在,仅支持'='条件,不支持'<>'等条件.
```
isExist(tableName, condition, cb)
```
* 根据根表和根表主键值,删除其和其下相关的数据缓存,不删除数据库.
```
deleteRedisCacheByFather(tableName, primaryValue, foreignValue, cb)
```
* redis执行lua脚本,不会操作数据库(实际项目很少使用).
```
runLua
```



