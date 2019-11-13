'use strict';
const sql = require("mysql");
const User = require("../global_objects").User;

const TABLE_USERS = "users";
const TABLE_EVENTS = "msg_events";
const TABLE_MESSAGES = "msg_messages";

const FIELDS_MESSAGE = [`${TABLE_MESSAGES}.id`, "sender", "recipient", "timestamp", "text"];
const FIELDS_EVENT = ["sender", "recipient", "timestamp", "text", "payload"];
const FIELDS_USER = [`${TABLE_USERS}.id`, "first_name", "last_name", "facebook_id", "gender", "locale"];

const connection = sql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWD,
    database: process.env.DB_NAME,
});

const logger = require("log4js").getLogger();

function asyncQuery(query, values) {
    logger.trace(`Executing query '${query}' with values [${values.toString()}]`);
    return new Promise((resolve, reject) => {
        connection.query(query, values, (err, result, fields) => {
            err === null ? resolve({result: result, fields: fields}) : reject(err);
        });
    })
}

function connect() {
    return new Promise((resolve, reject) => {
        connection.connect(err => {
            err === null ? resolve() : reject(err);
        });
    });
}

function disconnect() {
    return new Promise((resolve, reject) => {
        connection.end(err => {
            err === null ? resolve() : reject(err);
        });
    });
}

/**
 *
 * @param {Message} message
 * @return {Promise}
 */
function insertMessage(message) {
    let sql = `INSERT INTO ${TABLE_MESSAGES} (${FIELDS_MESSAGE.join(",")}) VALUES (?, ?, ?, ?, ?) 
               ON DUPLICATE KEY UPDATE text = VALUES (text)`;
    return asyncQuery(sql, message.asArray());
}

/**
 *
 * @param {Event} event
 */
function insertEvent(event) {
    let sql = `INSERT INTO ${TABLE_EVENTS} (${FIELDS_EVENT.join(",")}) VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE text = VALUES (text)`;
    return asyncQuery(sql, event.asArray());
}

/**
 *
 * @param {User} user
 */
function insertUser(user) {
    let query = `INSERT INTO ${TABLE_USERS} (${FIELDS_USER.join(",")}) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `;
    for(let i = 1; i < FIELDS_USER.length; i++) {
        query += `${FIELDS_USER[i]} = VALUES(${FIELDS_USER[i]}),`
    }
    query = query.substring(0, query.length - 1);
    return asyncQuery(query, user.asArray());
}

async function queryUserByFbId(facebook_id) {
    let sql = `SELECT ${FIELDS_USER.join(",")},is_registered FROM ${TABLE_USERS} WHERE facebook_id = ?`;
    let {result} = await asyncQuery(sql, [facebook_id]);
    return result[0] !== undefined ? User.fromSql(result[0]) : null;
}

async function deleteAuthRow(auth_code) {
    let query = `DELETE FROM bot_login WHERE auth_code = '${auth_code}'`;
    return asyncQuery(query);
}

module.exports.connect = connect;
module.exports.disconnect = disconnect;

module.exports.insertMessage = insertMessage;
module.exports.insertEvent = insertEvent;
module.exports.insertUser = insertUser;
module.exports.queryUserByFbId = queryUserByFbId;

module.exports.deleteAuthRow = deleteAuthRow;