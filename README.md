# pomeloDataMgr
[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Node.js Version][node-version-image]][node-version-url]

[npm-image]: https://img.shields.io/npm/v/pomelo-data-mgr.svg
[npm-url]: https://npmjs.org/package/pomelo-data-mgr
[downloads-image]: https://img.shields.io/npm/dm/pomelo-data-mgr.svg
[downloads-url]: https://npmjs.org/package/pomelo-data-mgr
[node-version-image]: https://img.shields.io/badge/node-%3E6.0.0-brightgreen.svg
[node-version-url]: https://nodejs.org/en/download/

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
    "db-mgr": "^1.0.3",
    "db-table": "^1.0.2",
    "table-redis": "^1.0.1"
}
```
* 依赖的这几个包,都是最近独立封装出来的.
* 使用请先安装配置[db-mgr](https://github.com/luckyqqk/dbMgr),
[db-table](https://github.com/luckyqqk/dbTable),
[table-redis](https://github.com/luckyqqk/tableRedis)
* 之所以将这几个包分别独立出来,而不是统一的放在一个包中(原来确实是在一个包中).
* 是因为这些包均不应该是单例模式,在项目中有可能新建另外的实例去负责别的事儿.

### 使用方法
1. 进入pomelo的game-server下,执行命令:
```
npm install pomelo-data-mgr --save
```
2. app.js中可配置服务,在需要的服务配置中,增加一行代码.比如在大厅服的配置.
```
app.configure('production|development', 'hall', function () {
    app.use(require('pomelo-data-mgr'));
});
```
3. 在逻辑代码中需要数据支持的地方,使用如下代码:
```
pomelo.app.get('dataMgr').selectData(tableName, 主键值, 外键值, cb);
```
示例代码可在cb中取到tableName这张表中,外键值为1的数据.
同理调用其他方法,即可完成其他功能(无非就是CRUD).

### 使用注意
* 该插件采用的是node原生的异步风格,并未支持同步方式(以后可能会改),所以使用者需适应异步编程的方式.

### 方法支持
* 数据获取(主键值不为0,取主键对应数据,否则取外键对应的数据组)
```
selectData = function (tableName, priValue, forValue, cb)
```
* 根据条件取数据
* @param condition 返回符合条件的数据,必须含有主键值或者外键值
```
selectDataByCondition(tableName, condition, cb)
```
* 插入数据(支持数组)
* @param {JSON|Array} jsonArray 
```
insertData = function (tableName, jsonArray, cb)
```
* 数据更新
``` 
updateData = function(tableName, jsonValue, cb)
```
* 删除数据
* @param priValue  // 想要删除的主键id,如果id为0则删除外键下的所有数据
```
deleteData = function(tableName, priValue, forValue, cb)
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
isExist = function (tableName, condition, cb)
```
* 根据根表和根表主键值,删除其和其下相关的数据缓存,不删除数据库.
```
deleteRedisCacheByFather = function(tableName, primaryValue, foreignValue, cb)
```
* redis执行lua脚本,不会操作数据库(实际项目很少使用).
```
runLua
```


