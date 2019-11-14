'use strict';
const sql = require("mysql");
const User = require("../global_objects").User;

const TABLE_USERS = "users";
const TABLE_EVENTS = "msg_events";
const TABLE_MESSAGES = "msg_messages";
const TABLE_LOGIN_FLOW = "login_flow";
const TABLE_STUDIA3_SESSIONS = "studia3_sessions";

const FIELDS_MESSAGE = [`${TABLE_MESSAGES}.id`, "sender", "recipient", "timestamp", "text"];
const FIELDS_EVENT = ["sender", "recipient", "timestamp", "text", "payload"];
const FIELDS_USER = [`${TABLE_USERS}.id`, "first_name", "last_name", "facebook_id", "gender", "locale"];
const FIELDS_LOGIN_FLOW = ["user_id", "messenger_linking_token", "messenger_callback_url",
    "messenger_auth_code", "usos_oauth_token", "usos_oauth_secret"];
const FIELDS_STUDIA3_SESSIONS = ["maintainer_id", "studia_login", "program_id", "cookie"];

const connection = sql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWD,
    database: process.env.DB_NAME,
});

const logger = require("log4js").getLogger();

function asyncQuery(query, values) {
    logger.trace(`Executing query '${query.replace(/\s{2,}/, " ")}' with values [${values.toString()}]`);
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
    const sql = `INSERT INTO ${TABLE_MESSAGES} (${FIELDS_MESSAGE.join(",")}) VALUES (?, ?, ?, ?, ?) 
               ON DUPLICATE KEY UPDATE text = VALUES (text)`;
    return asyncQuery(sql, message.asArray());
}

/**
 *
 * @param {Event} event
 */
function insertEvent(event) {
    const sql = `INSERT INTO ${TABLE_EVENTS} (${FIELDS_EVENT.join(",")}) VALUES (?, ?, ?, ?, ?)
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

async function queryUserById(id) {
    const sql = `SELECT ${FIELDS_USER.join(",")},is_registered, is_admin FROM ${TABLE_USERS} WHERE id = ?`;
    const {result} = await asyncQuery(sql, [id]);
    return result[0] !== undefined ? User.fromSql(result[0]) : null;
}

async function queryUserByFbId(facebook_id) {
    const sql = `SELECT ${FIELDS_USER.join(",")},is_registered, is_admin FROM ${TABLE_USERS} WHERE facebook_id = ?`;
    const {result} = await asyncQuery(sql, [facebook_id]);
    return result[0] !== undefined ? User.fromSql(result[0]) : null;
}

async function queryUsersByTarget(target) {
    const sql = `SELECT ${FIELDS_USER.join(",")},is_registered, is_admin FROM ${TABLE_USERS} 
    WHERE ${target.query}`;
    const {result} = await asyncQuery(sql, target.fields);
    const users = [];
    for(const row of result) {
        users.push(User.fromSql(row));
    }
    return users;
}

async function deleteAuthRow(auth_code) {
    const query = `DELETE FROM ${TABLE_LOGIN_FLOW} WHERE messenger_auth_code = ?`;
    return asyncQuery(query, [auth_code]);
}

function insertLoginAttempt(user_id, msg_token, msg_callback, msg_auth_code, usos_token, usos_secret) {
    const sql = `INSERT INTO ${TABLE_LOGIN_FLOW} 
    (user_id, messenger_linking_token, messenger_callback_url, messenger_auth_code, usos_oauth_token, usos_oauth_secret) 
    VALUES (?, ?, ?, ?, ?, ?)`;

    return asyncQuery(sql, [user_id, msg_token, msg_callback, msg_auth_code, usos_token, usos_secret]);
}

async function getLoginFlowByToken(usos_token_key) {
    const sql = `SELECT 
       user_id, messenger_linking_token, messenger_callback_url, messenger_auth_code, usos_oauth_secret
    FROM ${TABLE_LOGIN_FLOW} WHERE usos_oauth_token = ?`;

    const {result} = await asyncQuery(sql, [usos_token_key]);

    return result[0] !== undefined ? result[0] : null;
}

function updateUsosTokensForUserId(user_id, usos_token_key, usos_token_secret) {
    const sql = `UPDATE ${TABLE_USERS} SET usos_token = ?, usos_token_secret = ? WHERE id = ?`;
    return asyncQuery(sql, [usos_token_key, usos_token_secret, user_id])
}

function updateUserRegistered(user_id, registered = true) {
    const sql = `UPDATE ${TABLE_USERS} SET is_registered = ? WHERE id = ?`;
    return asyncQuery(sql, [registered, user_id])
}

async function getStudia3Programs() {
    const sql = `SELECT up.program_id, cookie, program_name FROM ${TABLE_STUDIA3_SESSIONS} st 
                 JOIN usos_programs up ON up.program_id = st.program_id`;
    const {result} = await asyncQuery(sql, []);
    return result;
}

async function getStudia3LoginForId(course_id) {
    const sql = `SELECT studia_login FROM ${TABLE_STUDIA3_SESSIONS} WHERE program_id = ?`;
    const {result} = await asyncQuery(sql, [course_id]);
    return result[0] !== undefined ? result[0].studia_login : null;
}

function updateStudiaCookie(program_id, cookie) {
    const sql = `UPDATE ${TABLE_STUDIA3_SESSIONS} SET cookie = ?, last_login = NOW(), last_refresh = NOW()
                 WHERE program_id = ?`;
    return asyncQuery(sql, [cookie, program_id]);
}

module.exports.connect = connect;
module.exports.disconnect = disconnect;

module.exports.insertMessage = insertMessage;
module.exports.insertEvent = insertEvent;
module.exports.insertUser = insertUser;
module.exports.queryUserByFbId = queryUserByFbId;
module.exports.queryUserById = queryUserById;
module.exports.queryUsersByTarget = queryUsersByTarget;

module.exports.deleteAuthRow = deleteAuthRow;
module.exports.insertLoginAttempt = insertLoginAttempt;
module.exports.getLoginFlowByToken = getLoginFlowByToken;
module.exports.updateUsosTokensForUserId = updateUsosTokensForUserId;
module.exports.updateUserRegistered = updateUserRegistered;

module.exports.getStudia3Programs = getStudia3Programs;
module.exports.getStudia3LoginForId = getStudia3LoginForId;
module.exports.updateStudiaCookie = updateStudiaCookie;