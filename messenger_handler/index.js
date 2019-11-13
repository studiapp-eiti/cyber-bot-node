'use strict';
const LogoutButton = require("./objects").LogoutButton;
const AccountLinkingHandler = require("./objects").AccountLinkingHandler;
const LocationQuickReply = require("./objects").LocationQuickReply;
const TextQuickReply = require("./objects").TextQuickReply;
const QuickReplyCreator = require("./objects").QuickReplyCreator;
const ButtonTemplate = require("./objects").ButtonTemplate;
const LoginButton = require("./objects").LoginButton;
const MessageHandler = require("./objects").MessageHandler;
const EventHandler = require("./objects").EventHandler;
const AccountLinkingEvent = require("./objects").AccountLinkingEvent;
const BaseHandler = require("./objects").BaseHandler;
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
        } else if(status === AccountLinkingEvent.STATUS_UNLINKED) {
            await handler.reply("Your Librus account has been unlinked successfully!");
        }
    } else {
        throw new Error("Invalid Object: ", handler);
    }
}

module.exports.process = processRequest;