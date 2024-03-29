'use strict';
const {asyncRequest} = require("../utils");
const logger = require("log4js").getLogger();

const API_BASE = "https://graph.facebook.com/v5.0";
const API_URL = `${API_BASE}/me/messages?access_token=${process.env.MSG_TOKEN}`;
const PROFILE_URL = `${API_BASE}/$pid$?fields=first_name,last_name,gender,locale,id&access_token=${process.env.MSG_TOKEN}`;
const LINKING_TOKEN_URL = `${API_BASE}/me?&fields=recipient&account_linking_token=$token$&access_token=${process.env.MSG_TOKEN}`;

const ACTION_SEEN = "mark_seen";
const ACTION_TYPING_ON = "typing_on";
const ACTION_TYPING_OFF = "typing_off";

/**
 *
 * @param {Message} message
 * @return {Promise.<Message>}
 */
async function sendMessage(message) {
    const options = {
        method: "POST",
        body: message.toJson(),
        json: true
    };
    logger.trace("Sending message", JSON.stringify(message.toJson()));

    try {
        let {res, body} = await asyncRequest(API_URL, options);
        if(res.statusCode !== 200)
            logger.error(res.statusCode, body);
        else {
            message.id = body["message_id"]
        }
    } catch(e) {
        logger.error(e);
    }

    return message;
}

/**
 *
 * @param action
 * @param recipient
 * @return {Promise}
 */
function senderAction(action, recipient) {
    return asyncRequest(API_URL, {
        method: "POST",
        body: {
            recipient: {
                id: recipient
            },
            sender_action: action
        },
        json: true
    });
}

/**
 *
 * @param {Message} message - message with an empty id and a set recipient id
 * @param {Template} template
 */
async function sendTemplate(message, template) {
    try {
        const msg_json = message.toJson();
        msg_json.message.attachment = {
            type: "template",
            payload: template
        };
        const options = {
            method: "POST",
            body: msg_json,
            json: true
        };
        logger.trace("Sending message", JSON.stringify(options));

        const {res, body} = await asyncRequest(API_URL, options);

        if(res.statusCode !== 200) {
            logger.error(res.statusCode, body);
        } else {
            message.id = body["message_id"];
            return message;
        }
    } catch
        (e) {
        logger.error(e);
    }

    return null;
}

function getUserData(pid) {
    return asyncRequest(PROFILE_URL.replace("$pid$", pid));
}

function getUserIdForLinkingToken(linking_token) {
    return asyncRequest(LINKING_TOKEN_URL.replace("$token$", linking_token));
}

module.exports.ACTION_SEEN = ACTION_SEEN;
module.exports.ACTION_TYPING_ON = ACTION_TYPING_ON;
module.exports.ACTION_TYPING_OFF = ACTION_TYPING_OFF;

module.exports.senderAction = senderAction;
module.exports.sendMessage = sendMessage;
module.exports.sendTemplate = sendTemplate;
module.exports.getUserData = getUserData;
module.exports.getUserIdForLinkingToken = getUserIdForLinkingToken;