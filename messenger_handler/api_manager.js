'use strict';
const request = require('request');
const logger = require("log4js").getLogger();

const API_BASE = "https://graph.facebook.com/v5.0";
const API_URL = `${API_BASE}/me/messages?access_token=${process.env.MSG_TOKEN}`;
const PROFILE_URL = `${API_BASE}/$pid$?fields=first_name,last_name,gender,locale,id&access_token=${process.env.MSG_TOKEN}`;

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
        const {res, body} = await asyncRequest(API_URL, {
            method: "POST",
            body: {
                recipient: {
                    id: message.recipient
                },
                message: {
                    attachment: {
                        type: "template",
                        payload: template
                    }
                }
            },
            json: true
        });

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

function getUserData(pid) {
    return asyncRequest(PROFILE_URL.replace("$pid$", pid));
}

/**
 *
 * @param url
 * @param options
 * @return {Promise}
 */
function asyncRequest(url, options) {
    return new Promise((resolve, reject) => {
        request(url, options, (err, res, body) => {
            if(err === null)
                resolve({res: res, body: body});
            else
                reject(err);
        })
    })
}

module.exports.ACTION_SEEN = ACTION_SEEN;
module.exports.ACTION_TYPING_ON = ACTION_TYPING_ON;
module.exports.ACTION_TYPING_OFF = ACTION_TYPING_OFF;

module.exports.senderAction = senderAction;
module.exports.sendMessage = sendMessage;
module.exports.sendTemplate = sendTemplate;
module.exports.getUserData = getUserData;