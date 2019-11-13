'use strict';
const api = require("./api_manager");
const {
    LogoutButton, AccountLinkingHandler, LocationQuickReply,
    TextQuickReply, QuickReplyCreator, ButtonTemplate, LoginButton,
    MessageHandler, UpdateMessage, EventHandler, AccountLinkingEvent, BaseHandler
}
    = require("./objects");
const User = require("../global_objects").User;
const sql = require("../database").sql;
const logger = require("log4js").getLogger();

async function processRequest(json) {
    const handler = BaseHandler.fromJson(json);
    logger.trace(`Processing message request for ${handler.request.sender}`);
    if(handler instanceof MessageHandler) {
        let text = handler.request.text;
        await sql.insertMessage(handler.request);
        if(text.toLowerCase() === "login") {
            const buttons = [LoginButton.defaults()];
            const template = new ButtonTemplate("Click here to log in", buttons);
            await handler.reply(template);
        } else if(text.toLowerCase() === "logout") {
            const buttons = [new LogoutButton()];
            const template = new ButtonTemplate("Click here to log out", buttons);
            await handler.reply(template);
        } else if(text.toLowerCase() === "fizyka" || text.toLowerCase() === "dropbox") {
            await handler.reply("https://www.dropbox.com/sh/x4g4lci5gnb61wc/AAAV4Skzaac-k3vrprF_nN-la?dl=0");
        } else {
            const creator = new QuickReplyCreator(handler.request.text,
                [new TextQuickReply("Hello", "test"), new TextQuickReply("World!", "world")]);
            await handler.reply(creator);
        }
    } else if(handler instanceof EventHandler) {
        await handler.handleEvent();
        await handler.typing(false);
    } else if(handler instanceof AccountLinkingHandler) {
        let status = await handler.updateUser();
        if(status === AccountLinkingEvent.STATUS_LINKED) {
            await handler.reply("Your USOS account has been linked successfully!");
            await handler.reply("You can manage your notification settings using the menu");
        } else if(status === AccountLinkingEvent.STATUS_UNLINKED) {
            const user = await User.fromFacebookId(handler.request.sender);
            if(user === null) {
                logger.error("Unlinking nonexistent user id", handler.request.sender);
            } else {
                logger.debug("Unlinked successfully, user", user.id);
                await sql.updateUsosTokensForUserId(user.id, null, null);
                await sql.updateUserRegistered(user.id, false);
            }
            await handler.reply("Your USOS account has been unlinked successfully!");
        }
    } else {
        throw new Error(`Invalid Object: ${typeof handler}`);
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
        logger.debug("Sending notification to", user_id);
    }
}

module.exports.process = processRequest;
module.exports.notify = sendNotification;