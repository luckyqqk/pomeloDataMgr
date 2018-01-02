var async = require('async');
/**
 * 数据缓存和持久化的插件,让逻辑工程师不再关心数据的缓存以及持久化.
 * date:16/12/2
 * @author wuqingkai
 */
module.exports = function(app, opts) {
    var dataMgr = new DataMgr(app, opts);
    app.set('dataMgr', dataMgr, true);
    return dataMgr;
};

var DataMgr = function(app) {
    this.name = 'dataMgr';
    this.app = app;

    this.dbMgr = null;
    this.dbTable = null;
    this.tableRedis = null;
};

var pro = DataMgr.prototype;

/**
 * 插件初始化
 * @param cb
 */
pro.start = function(cb) {
    this.tableRedis = this.app.get('tableRedis');
    this.dbMgr = this.app.get('dbMgr');
    this.dbTable = this.app.get('dbTable');
    cb();
};

pro.stop = function(cb) {
    this.tableRedis = null;
    this.dbMgr = null;
    this.dbTable = null;
    cb();
};

var PRIMARY_KEY             = "primaryKey";
var FOREIGN_KEY             = "foreignKey";
var SON_KEY                 = "sonKey";
var REDIS_INDEX             = "redisIndex";

/**
 * 数据插入数据库,并缓存到redis
 * 若非同表,是无法批量的,也没有意义.所以,该方法仅支持同一张表,一起插入多条数据.
 * @param tableName {String} 表名
 * @param jsonArray {JSON|Array} 想要插入的数据.(可是数组,也可是单条数据,若传入的是个数组, 则会批量插入,也会返回一个数组.)(只需传入必须字段键值对,其他字段程序以默认值的方式补全)
 * @param cb {function}   返回含有全部字段键值对(包括主键)
 */
pro.insertData = function (tableName, jsonArray, cb) {
    if (!tableName || !jsonArray || jsonArray.length < 1) {
        cb(`params null`);
        return;
    }
    var self = this;
    var table = self.dbTable.getTable(tableName);
    if (!table) {
        cb(`can not find table by tableName:${tableName}`);
        return;
    }
    var sql = self.dbTable.getInsertSql(tableName, jsonArray);
    if (!sql) {
        cb(`table:${tableName} can not make insert sql`);
        return;
    }
    self.dbMgr.query(sql, [], function (err, data) {
        if (!!err) {
            cb(err);
            console.error(`sql:${sql}`);
        } else {
            var insertId = data.insertId;
            if (Array.isArray(jsonArray)) {
                jsonArray.forEach(json=>{
                    json[table[PRIMARY_KEY]] = insertId++;
                });
            } else {
                jsonArray[table[PRIMARY_KEY]] = insertId;
            }
            self.tableRedis.addRedisCache(tableName, jsonArray, (err)=>{
                cb(err, jsonArray);
            });
        }
    });
};

/**
 * 删除数据.
 * @param tableName
 * @param priValue  // 想要删除的主键id,如果id为0则删除外键下的所有数据
 * @param forValue
 * @param cb
 */
pro.deleteData = function(tableName, priValue, forValue, cb) {
    var self = this;
    var sql = self.dbTable.getDeleteSql(tableName, priValue, forValue);
    async.parallel([
        (_cb)=>{
            self.tableRedis.removeRedisCache(tableName, priValue, forValue, _cb);
        },
        (_cb)=>{
            self.dbMgr.query(sql, [], _cb);
        }
    ], (err, data)=>{
        cb(err, data);
        if (!!err) console.error(`sql:${sql}`);
    });
};

/**
 * 数据更新
 * @param tableName
 * @param jsonValue
 * @param cb
 */
pro.updateData = function(tableName, jsonValue, cb) {
    var self = this;
    var sql = self.dbTable.getUpdateSql(tableName, jsonValue);
    if (!sql) {
        cb(`table:${tableName} can not make upd sql`);
        return;
    }
    async.parallel([
        (_cb)=>{    // update db
            self.dbMgr.query(sql, [], _cb);
        },
        (_cb)=>{    // update cache
            self.tableRedis.updateRedisCache(tableName, jsonValue, _cb);
        }
    ], (err, data)=>{
        cb(err, data);
        if (!!err) console.error(`sql:${sql}`);
    });
};

/**
 * 取某个表中sign相关的所有数据.
 * @param tableName 表名
 * @param priValue  含主键,取主键对应数据,否则取外键对应的数据组
 * @param forValue
 * @param cb
 */
pro.selectData = function (tableName, priValue, forValue, cb) {
    if (!cb) {
        return;
    } else if (!tableName || !priValue && !forValue) {
        cb("getTableData failed :: param is null");
        return;
    }
    var self = this;
    self.tableRedis.getRedisCache(tableName, priValue, forValue, (err, data)=>{
        if (!!err) {
            cb(err);
        } else if (!!data && data.length > 0) {
            var result = [];
            if (Array.isArray(data)) {
                data.forEach((aData)=>{
                    result.push(JSON.parse(aData));
                });
            } else {
                result = JSON.parse(data);
            }
            cb(null, result);
        } else {
            var sql = self.dbTable.getSelectSql(tableName, priValue, forValue);
            if (!sql) {
                cb(`table:${tableName} can not make sql}`);
                return;
            }
            self.dbMgr.query(sql, [], function (err, dataDB) {
                if (!!err) {
                    cb(err);
                    console.error(`sql:${sql}`);
                } else if (!dataDB || dataDB.length < 1) {
                    cb();
                } else {
                    dataDB = JSON.parse(JSON.stringify(dataDB));
                    self.tableRedis.addRedisCache(tableName, dataDB, (err)=>{
                        cb(err, dataDB);
                    });
                }
            });
        }
    });
};

/**
 * 根据条件取数据
 * @param tableName 表名
 * @param condition 返回符合条件的数据,必须含有主键值或者外键值
 * @param cb
 */
pro.selectDataByCondition = function (tableName, condition, cb) {
    var self = this;
    var table = self.dbTable.getTable(tableName);
    var priValue = condition[table[PRIMARY_KEY]];
    var forValue = condition[table[FOREIGN_KEY]];
    if (!priValue && !forValue) {
        cb('need primaryKey or foreignKey!');
        return;
    }
    self.selectData(tableName, priValue, forValue, (err, data)=>{
        if (!!err) {
            cb(err);
            return;
        } else if (!data) {
            cb();
            return;
        }
        var isInCondition = function(json) {
            for (let key in condition) {
                if (condition[key] != json[key])
                    return false;
            }
            return true;
        };
        var result = [];
        data.forEach((aData)=>{
            if (!isInCondition(aData))
                return;
            result.push(aData);
        });
        cb(null, result);
    });
};

/**
 * 查看数据是否存在
 * @param tableName
 * @param condition 返回符合条件的数据,必须含有主键值或者外键值
 * @param cb
 */
pro.isExist = function (tableName, condition, cb) {
    if (!tableName || !condition) {
        cb('tableName or condition can not be null');
        return;
    }
    var sql = "select * from `" + tableName + "` where ";
    for (let k in condition) {
        sql += "`" + k + "` = ";
        sql += isNaN(condition[k]) ? '"' + condition[k] + '"' : condition[k];
        sql += " and "
    }
    sql = sql.substr(0, sql.length - 4);
    this.dbMgr.query(sql, [], function (err, dataDB) {
        if (!!err) {
            cb(err);
        } else if (!dataDB || dataDB.length < 1) {
            cb(null, false);
        } else {
            cb(null, true);
        }
    });
};

/**
 * 获得某个表的主键名
 * @param tableName
 * @returns {*}
 */
pro.getPrimaryKey = function(tableName) {
    var table = this.dbTable.getTable(tableName);
    return !!table ? table[PRIMARY_KEY] : null;
};

/**
 * 清除缓存,不删除数据库.
 * 根据根表和根表主键值,删除其和其下相关的数据缓存.
 * @param tableName     父级表名
 * @param primaryValue  必填
 * @param foreignValue  没外键不用添
 * @param cb
 */
pro.deleteRedisCacheByFather = function(tableName, primaryValue, foreignValue, cb) {
    this.tableRedis.removeCacheByFather(tableName, primaryValue, foreignValue, cb);
};

/**
 * redis执行lua脚本,无数据库操作.
 * @param lua
 * @param paramNum
 * @param keysArray
 * @param paramsArray
 * @param cb
 */
pro.runLua = function(lua, paramNum, keysArray, paramsArray, cb) {
    this.tableRedis.runLua(lua, paramNum, keysArray, paramsArray, cb);
};

