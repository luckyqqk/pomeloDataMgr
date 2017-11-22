var async = require('async');
var util = require('util');

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

var DataMgr = function(app, opts) {
    this.name = 'dataMgr';
    this.app = app;
    this.opts = opts;

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
    var _DBTable = require("db-table");
    var _DBMgr = require("db-mgr");
    var _TableRedis = require("table-redis");
    var redisInfo = this.opts['redis'];
    var mysqlInfo = this.opts['mysql'];
    this.dbMgr = new _DBMgr(mysqlInfo);
    this.dbTable = new _DBTable(this.dbMgr, mysqlInfo.database);
    var self = this;
    self.dbTable.init(()=>{
        self.tableRedis = new _TableRedis(self.dbTable, redisInfo);
        cb();
    });
};
var PRIMARY_KEY             = "primaryKey";
var FOREIGN_KEY             = "foreignKey";
var SON_KEY                 = "sonKey";
var REDIS_INDEX             = "redisIndex";

/**
 * 取某个表中sign相关的所有数据.
 * @param tableName 表名
 * @param sign      有外键的表填外键值,否则填主键值
 * @param cb
 */
pro.getTableData = function (tableName, sign, cb) {
    if (!cb) {
        return;
    } else if (!tableName || !sign) {
        cb("getTableData failed :: param is null");
        return;
    }
    var self = this;
    self.tableRedis.getRedisCache(tableName, sign, (err, data)=>{
        if (!!err) {
            cb(err);
            return;
        }
        if (!data || (Array.isArray(data) && data.length < 1)) {
            // load from db
            var sql = self.dbTable.getSelectSql(tableName, sign);
            if (!sql) {
                cb(`sql is undefined:${sql}`);
                return;
            }
            self.dbMgr.query(sql, [], function (err, dataDB) {
                if (!!err) {
                    cb(err);
                } else if (!dataDB || dataDB.length < 1) {
                    cb();
                } else {
                    dataDB = JSON.parse(JSON.stringify(dataDB));
                    if (!self.dbTable.getTable(tableName)[FOREIGN_KEY])
                        dataDB = dataDB[0];
                    self.tableRedis.addRedisCache(tableName, dataDB, (err)=>{
                        cb(err, dataDB);
                    });
                }
            });
        } else {
            if (Array.isArray(data)) {
                var result = [];
                data.forEach((aData)=>{
                    result.push(JSON.parse(aData));
                });
                cb(null, result);
            } else {
                cb(null, JSON.parse(data));
            }
        }
    });
};

/**
 * 根据条件取数据
 * @param tableName 表名
 * @param condition 返回符合条件的数据,必须含有主键值或者外键值
 * @param cb
 */
pro.getTableDataByCondition = function (tableName, condition, cb) {
    var self = this;
    var table = self.dbTable.getTable(tableName);
    var sign = condition[table[PRIMARY_KEY]];
    if (!!table[FOREIGN_KEY]) {
        sign = condition[table[FOREIGN_KEY]];
    }
    if (!sign) {
        cb('need primaryKey or foreignKey!');
        return;
    }
    self.getTableData(tableName, sign, (err, data)=>{
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
        data.forEach((aData, idx)=>{
            if (!isInCondition(aData))
                return;
            aData[REDIS_INDEX] = idx;
            result.push(aData);
        });
        //result = result.length == 1 ? result[0] : result;
        cb(null, result);
    });
};

/**
 * 获取多表数据,返回数据顺序与请求数组顺序相同.
 * @param arr   {Array} 二维数组,第一维表示所取表的个数;第二维的数组长度为2,第一位表示表名,第二位在有外键的表时填外键值,否则填主键值.
 *                      如下:
 *                      [[tableName1, primaryValue],[tableName2, foreignValue]],[tableName3, {sign:xx, con:xx}]
 * @param cb
 */
pro.getDataByArray = function(arr, cb) {
    var self = this;
    var agent = function(tableName, sign) {
        return function(callback) {
            self.getTableData(tableName, sign, callback);
        };
    };
    var agentCondition = function(tableName, condition) {
        return function(callback) {
            self.getTableDataByCondition(tableName, condition, callback);
        };
    };
    var funcArr = [];
    arr.forEach((cdt)=>{
        if (util.isObject(cdt[1])) {
            funcArr.push(new agentCondition(cdt[0], cdt[1]));
        } else {
            funcArr.push(new agent(cdt[0], cdt[1]));
        }
    });
    async.parallel(funcArr, (err, data)=>{
        cb(err, data);
    });
};
////不推荐使用
//pro.getDataByConditionArray = function() {
//
//};

/**
 * 数据更新
 * @param tableName
 * @param jsonValue
 * @param redisIndex
 * @param cb
 */
pro.updateData = function(tableName, jsonValue, redisIndex, cb) {
    var self = this;
    var table = self.dbTable.getTable(tableName);
    jsonValue = self.dbTable.getAllTableJson(table, jsonValue); // 去掉多余字段
    self.tableRedis.updateRedisCache(tableName, jsonValue, redisIndex, (err)=>{
        if (!!err) {
            cb(err);
            return;
        }
        // save db
        var sql = self.dbTable.getUpdateSqlByJson(tableName, jsonValue);
        if (!sql) {
            cb(`updateData sql is undefined`);
        } else {
            self.dbMgr.query(sql, [], cb);
        }
    });
};

/**
 * 根据redis中的下标,删除某一条数据,首先清除缓存,然后删除数据库.
 * @param tableName
 * @param foreignValue
 * @param index
 * @param cb
 */
pro.deleteTableData = function(tableName, foreignValue, index, cb) {
    if (index == undefined || index.length < 1) {
        cb(`deleteTableData failed :: index can not be null`);
        return;
    }
    var self = this;
    var table = self.dbTable.getTable(tableName);
    if (!table[FOREIGN_KEY]) {
        cb(`delete failed:: table::${tableName} has no foreignKey!`);
        return;
    }
    var agent = function(tn, fv, idx) {
        return function(_cb) {
            self.tableRedis.getRedisCacheByIndex(tn, fv, idx, _cb);
        };
    };
    var funcArr = [];
    if (Array.isArray(index)) {
        index.forEach((idx)=>{
            funcArr.push(new agent(tableName, foreignValue, idx));
        });
    } else {
        funcArr.push(new agent(tableName, foreignValue, index));
    }
    async.parallel(funcArr, (err, data)=>{
        if (!!err) {
            cb(err);
            return;
        }
        async.parallel([
            (_cb)=>{
                // delete cache
                self.tableRedis.removeCacheByValue(tableName, foreignValue, data, _cb);
            },
            (_cb)=>{
                // delete db
                var sql = "";
                if (Array.isArray(data)) {
                    var dArr = [];
                    data.forEach((aData)=>{
                        dArr.push(JSON.parse(aData));
                    });
                    sql = self.dbTable.getDeleteSql(tableName, dArr);
                } else {
                    sql = self.dbTable.getDeleteSql(tableName, JSON.parse(data));
                }
                //console.error(sql);
                self.dbMgr.query(sql, [], _cb);
            }
        ], (err)=>{
            cb(err);
        });
    });
};

/**
 * 根据外键值删除数据
 * @param tableName
 * @param foreignValue
 * @param cb
 */
pro.deleteTableDataByForeignValue = function(tableName, foreignValue, cb) {
    var self = this;
    var sql = self.dbTable.getDeleteSqlByForeign(tableName, foreignValue);
    if (!sql) {
        cb(`deleteTableDataByForeignValue failed:: table::${tableName} has no foreignKey!`);
    } else {
        async.parallel([
            (_cb)=>{
                self.tableRedis.removeCacheByKey(tableName, foreignValue, _cb);
            },
            (_cb)=>{
                self.dbMgr.query(sql, [], _cb);
            }
        ], cb);
    }
};

/**
 * 数据插入数据库,并缓存到redis
 * 若非同表,是无法批量的,也没有意义.所以,该方法仅支持同一张表,一起插入多条数据.
 * @param tableName {String} 表名
 * @param jsonArray {JSON} 想要插入的数据.(可是数组,也可是单条数据,若传入的是个数组, 则会批量插入,也会返回一个数组.)(只需传入必须字段键值对,其他字段程序以默认值的方式补全)
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
    var allJsonArray = self.dbTable.getAllInsertJson(table, jsonArray);
    // 组建sql,自带批量处理.
    var sql = self.dbTable.getInsertSqlByJson(table, allJsonArray);
    if (!sql) {
        cb(`sql is undefined`);
        return;
    }
    self.dbMgr.query(sql, [], function (err, data) {
        if (!!err) {
            cb(err);
        } else if (!data) {
            cb('has no db data');
        } else {
            var insertId = data.insertId;
            if (Array.isArray(allJsonArray)) {
                for (var idx in allJsonArray) {
                    allJsonArray[idx][table[PRIMARY_KEY]] = insertId++;
                }
            } else {
                allJsonArray[table[PRIMARY_KEY]] = insertId;
            }
            self.tableRedis.addRedisCache(tableName, allJsonArray, (err)=>{
                cb(err, allJsonArray);
            });
        }
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
    this.tableRedis.deleteRedisCacheByFather(tableName, primaryValue, foreignValue, cb);
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