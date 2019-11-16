'use strict';
const api = require("./api_manager");
const {sleep} = require("../utils");
const {
    LogoutButton, AccountLinkingHandler, ButtonTemplate, LoginButton,
    MessageHandler, UpdateMessage, EventHandler, BaseHandler
}
    = require("./objects");
const User = require("../global_objects").User;
const sql = require("../database").sql;
const logger = require("log4js").getLogger();

async function processRequest(json) {
    const handler = BaseHandler.fromJson(json);
    logger.trace(`Processing message request for ${handler.request.sender}`);
    if(handler instanceof MessageHandler) {
        if(handler.request.text === undefined) {
            await handler.reply("Messages without text are not supported");
            return;
        }

        logger.trace(handler.request);

        const text = handler.request.text;
        await sql.insertMessage(handler.request);
        if(text.toLowerCase() === "login") {
            const buttons = [LoginButton.defaults()];
            const template = new ButtonTemplate("Click here to log in", buttons);
            await handler.reply(template);
        } else if(text.toLowerCase() === "logout") {
            const buttons = [new LogoutButton()];
            const template = new ButtonTemplate("Click here to log out", buttons);
            await handler.reply(template);
        } else {
            logger.trace("Received generic message", text);
            await handler.processGenericMessage();
        }
    } else if(handler instanceof EventHandler) {
        await handler.handleEvent();
        await handler.typing(false);
    } else if(handler instanceof AccountLinkingHandler) {
        await handler.updateUser();
        await handler.reply();
    } else {
        throw new Error(`Invalid object: ${typeof handler}`);
    }
}

async function sendNotification(user_ids, text) {
    for(const user_id of user_ids) {
        const user = await User.byId(user_id);
        if(user === null) {
            logger.warn("Invalid user id for notify", user_id);
            continue;
        }

        let msg = new UpdateMessage(null, process.env.MSG_DEFAULT_SENDER_ID, user.facebook_id, new Date(), text);
        logger.trace(msg);
        msg = await api.sendMessage(msg);
        await sql.insertMessage(msg);

        /*
         * We do not want to become a high-MPS page. We can only safely send 40mps. See, for reference:
         * https://developers.facebook.com/docs/messenger-platform/send-messages/high-mps
         */
        await sleep(100);
        logger.debug("Sending notification to", user_id);
    }
}

module.exports.process = processRequest;
module.exports.notify = sendNotification;
