'use strict';

const api = require("./messenger_handler/api_manager");
const sql = require("./database/sql_manager");
const logger = require("log4js").getLogger();

class User {
    /**
     *
     * @param id
     * @param first_name
     * @param last_name
     * @param nickname
     * @param facebook_id
     * @param msg_state
     * @param gender
     * @param locale
     * @param is_registered
     * @param is_admin
     */
    constructor(id, first_name, last_name, nickname, facebook_id, msg_state, gender, locale, is_registered, is_admin) {
        this.id = id;
        this.first_name = first_name;
        this.last_name = last_name;
        this.nickname = nickname;
        this.msg_state = msg_state;
        this.facebook_id = facebook_id;
        this.gender = gender;
        this.locale = locale;
        this.is_registered = !!is_registered;
        this.is_admin = !!is_admin;
    }

    /**
     *
     * @param pid
     * @return {Promise.<User>}
     */
    static async newFromFbId(pid) {
        const {body} = await api.getUserData(pid);
        let json = JSON.parse(body);
        logger.trace("Fetched user ", json);
        return User.fromJson(json);
    }

    /**
     *
     * @param json
     * @return {User}
     */
    static fromJson(json) {
        return new User(null, json.first_name, json.last_name, null, json.id,
            User.STATE_NO_STATE, json.gender, json.locale, false, false);
    }

    /**
     *
     * @param row
     * @returns {User}
     */
    static fromSql(row) {
        return new User(row.id, row.first_name, row.last_name, row.nickname, row.facebook_id,
            row.msg_state, row.gender, row.locale, row.is_registered, row.is_admin);
    }

    /**
     *
     * @param facebook_id
     * @returns {Promise<User>}
     */
    static async fromFacebookId(facebook_id) {
        let user = await sql.queryUserByFbId(facebook_id);
        if(user === null) {
            logger.trace(`Creating user from facebook_id: ${facebook_id}`);
            user = await User.newFromFbId(facebook_id);
            let {result} = await sql.insertUser(user);
            user.id = result.insertId;
        }

        return user;
    }

    /**
     *
     * @param id
     * @returns {Promise<User>}
     */
    static async byId(id) {
        return await sql.queryUserById(id);
    }

    /**
     *
     * @param linking_token
     * @returns {Promise<null|User>}
     */
    static async fromMessengerLinkingToken(linking_token) {
        try {
            const {body} = await api.getUserIdForLinkingToken(linking_token);
            const json = JSON.parse(body);
            if(json.recipient === undefined) {
                logger.error("Messenger linking token expired");
                return null;
            }
            return await User.fromFacebookId(json.recipient);
        } catch(e) {
            logger.error(e);
            return null;
        }
    }

    save() {
        return sql.insertUser(this);
    }

    formatName(first_first = true) {
        if(first_first) {
            return this.first_name + " " + this.last_name;
        }
        return this.last_name + " " + this.first_name;
    }

    asArray(fields) {
        if(fields === undefined) {
            fields = User.ALL_FIELDS;
        }
        const array = [];

        for(let i = 0; i < fields.length; i++) {
            if(!this.hasOwnProperty(fields[i])) {
                throw Error(`Unknown property ${fields[i]}`);
            }
            array.push(this[fields[i]]);
        }

        return array;
    }
}

User.STATE_NO_STATE = -1;
User.STATE_ASK_NICKNAME = 100;
User.STATE_INPUT_NICKNAME = 101;
User.STATE_CONFIRM_NICKNAME = 102;

User.ALL_FIELDS = ["id", "first_name", "last_name", "nickname", "msg_state", "facebook_id", "gender", "locale"];

module.exports.User = User;