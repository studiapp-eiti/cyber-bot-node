const api = require("./api_manager");
const sql = require("../database").sql;
const User = require("../global_objects").User;

const logger = require("log4js").getLogger();

class MessagingBase {
    constructor(sender, recipient, timestamp) {
        this.sender = sender;
        this.recipient = recipient;
        this.timestamp = timestamp;
    }

    asArray(fields) {
        const array = [];

        for(let i = 0; i < fields.length; i++) {
            if(!this.hasOwnProperty(fields[i])) {
                throw Error(`Unknown property ${fields[i]}`);
            }
            array.push(this[fields[i]]);
        }

        return array;
    }

    reply(text) {
        return new Message(null, this.recipient, this.sender, new Date(), text);
    }
}

class Message extends MessagingBase {
    constructor(id, sender, recipient, timestamp, text) {
        super(sender, recipient, timestamp);
        this.text = text;
        this.id = id;
    }

    /**
     * Creates an instance given a json
     * @param json
     * @return {Message}
     */
    static fromJson(json) {
        if(!json.hasOwnProperty("messaging")) {
            throw new Error("Invalid json");
        }
        let mess = json["messaging"][0];
        if(mess.hasOwnProperty("message")) {
            return new Message(mess["message"]["mid"],
                mess["sender"]["id"],
                mess["recipient"]["id"],
                new Date(mess["timestamp"]),
                mess["message"]["text"],
                null
            );
        } else {
            throw new Error(`Invalid messaging type${JSON.stringify(mess, 2)}`);
        }
    }

    asArray(fields) {
        if(fields === undefined) {
            fields = Message.ALL_FIELDS;
        }

        return super.asArray(fields);
    }

    toJson() {
        return {
            messaging_type: "NON_PROMOTIONAL_SUBSCRIPTION",
            recipient: {
                id: this.recipient
            },
            message: {
                text: this.text
            }
        }
    }
}

Message.ALL_FIELDS = ["id", "sender", "recipient", "timestamp", "text"];

class Event extends MessagingBase {
    constructor(sender, recipient, timestamp, text, payload) {
        super(sender, recipient, timestamp);
        this.text = text;
        this.payload = payload;
    }

    static fromJson(json) {
        if(!json.hasOwnProperty("messaging")) {
            throw new Error("Invalid json");
        }
        let mess = json["messaging"][0];
        if(mess.hasOwnProperty("postback")) {
            return new Event(mess["sender"]["id"],
                mess["recipient"]["id"],
                new Date(mess["timestamp"]),
                mess["postback"]["title"],
                mess["postback"]["payload"]
            );
        } else {
            throw new Error(`Invalid messaging type: ${JSON.stringify(mess, 2)}`);
        }
    }

    asArray(fields) {
        if(fields === undefined) {
            fields = Event.ALL_FIELDS;
        }

        return super.asArray(fields);
    }
}

Event.ALL_FIELDS = ["sender", "recipient", "timestamp", "text", "payload"];

class AccountLinkingEvent extends MessagingBase {

    constructor(sender, recipient, timestamp, status, auth_code = null) {
        super(sender, recipient, timestamp);
        this.status = status;
        this.auth_code = auth_code;
    }

    static fromJson(json) {
        if(!json.hasOwnProperty("messaging")) {
            throw new Error("Invalid json");
        }

        let mess = json["messaging"][0];
        return new AccountLinkingEvent(
            mess["sender"]["id"],
            mess["recipient"]["id"],
            new Date(mess["timestamp"]),
            mess["account_linking"]["status"],
            mess["account_linking"]["authorization_code"]);
    }
}

AccountLinkingEvent.STATUS_LINKED = "linked";
AccountLinkingEvent.STATUS_UNLINKED = "unlinked";

class QuickReplyMessage extends Message {
    /**
     *
     * @param id
     * @param sender
     * @param recipient
     * @param timestamp
     * @param text
     * @param {QuickReply[]} quickReplies
     */
    constructor(id, sender, recipient, timestamp, text, quickReplies) {
        super(id, sender, recipient, timestamp, text);
        this.quick_replies = quickReplies;
    }

    /**
     *
     * @param {Message} message
     * @param {QuickReplyCreator} creator
     */
    static fromSource(message, creator) {
        if(creator === undefined) {
            creator = new QuickReplyCreator(null, []);
        }

        return new QuickReplyMessage(message.id, message.sender, message.recipient,
            new Date(), creator.text, creator.quick_replies);
    }

    toJson() {
        let json = super.toJson();
        json["message"]["quick_replies"] = this.quick_replies;
        return json;
    }
}

class QuickReply {
    constructor(type) {
        this.content_type = type;
    }
}

QuickReply.TYPE_TEXT = "text";
QuickReply.TYPE_LOCATION = "location";

class LocationQuickReply extends QuickReply {
    constructor() {
        super(QuickReply.TYPE_LOCATION);
    }
}

class TextQuickReply extends QuickReply {
    constructor(title, payload) {
        super(QuickReply.TYPE_TEXT);
        this.title = title;
        this.payload = payload;
    }
}

class ImageQuickReply extends TextQuickReply {
    constructor(title, payload, image_url) {
        super(title, payload);
        this.image_url = image_url;
    }
}

class QuickReplyCreator {
    constructor(text, quick_replies) {
        this.text = text;
        this.quick_replies = quick_replies;
    }
}

class BaseHandler {
    /**
     *
     * @param {MessagingBase} messagingBase
     */
    constructor(messagingBase) {
        this.request = messagingBase;
    }

    static fromJson(json) {
        if(!json.hasOwnProperty("messaging")) {
            throw new Error("Invalid json");
        }

        let mess = json["messaging"][0];
        if(mess.hasOwnProperty("message")) {
            return MessageHandler.fromJson(json);
        } else if(mess.hasOwnProperty("postback")) {
            return EventHandler.fromJson(json);
        } else if(mess.hasOwnProperty("account_linking")) {
            return AccountLinkingHandler.fromJson(json);
        } else {
            throw new Error("Unknown messaging type: " + JSON.stringify(mess, 2));
        }
    }

    async reply(payload) {
        if(payload instanceof Template) {
            let reply = this.request.reply(null);
            logger.debug(`Send reply to ${reply.recipient} of type 'Template'`);
            reply = await api.sendTemplate(reply, payload);
            return reply;
        } else if(payload instanceof String || typeof payload === "string") {
            let reply = this.request.reply(payload);
            logger.debug(`Send reply to ${reply.recipient} of type 'String'`);
            reply = await api.sendMessage(reply);
            await sql.insertMessage(reply);
            return reply;
        } else if(payload instanceof QuickReplyCreator) {
            const raw = this.request.reply(payload);
            let reply = QuickReplyMessage.fromSource(raw, payload);
            logger.debug(`Send reply to ${reply.recipient} of type 'QuickReplyCreator'`);
            reply = await api.sendMessage(reply);
            await sql.insertMessage(reply);
            return reply;
        } else {
            throw new Error(`Unknown class for payload: ${typeof payload}`);
        }
    }

    /**
     * Turns on or off the typing indicator
     * @param isTyping
     * @return {Promise}
     */
    typing(isTyping) {
        return api.senderAction(isTyping ? api.ACTION_TYPING_ON :
            api.ACTION_TYPING_OFF, this.request.sender);
    }

    /**
     * Marks the received message as seen
     * @return {Promise}
     */
    seen() {
        return api.senderAction(api.ACTION_SEEN, this.request.sender);
    }
}

class MessageHandler extends BaseHandler {
    /**
     *
     * @param {Message} requestMessage
     */
    constructor(requestMessage) {
        if(!requestMessage instanceof Message) {
            throw new Error("requestMessage has to be of type Message");
        }
        super(requestMessage);
    }

    /**
     *
     * @param json
     * @return {MessageHandler}
     */
    static fromJson(json) {
        return new this(Message.fromJson(json));
    }
}

class EventHandler extends BaseHandler {
    /**
     *
     * @param {Event} requestEvent
     */
    constructor(requestEvent) {
        if(!requestEvent instanceof Event) {
            throw new Error("requestEvent has to be of type Event");
        }
        super(requestEvent);
    }

    /**
     *
     * @param json
     * @return {EventHandler}
     */
    static fromJson(json) {
        return new this(Event.fromJson(json));
    }

    async handleEvent() {
        await sql.insertEvent(this.request);
        switch(this.request.payload) {
            case "get_started": {
                const user = await User.fromFacebookId(this.request.sender);
                await this.reply(`Hi ${user["first_name"]}, thanks for clicking get started!`);
                if(!user.is_registered) {
                    await this.reply("You have to register to be able to use this bot's features");
                    const buttons = [LoginButton.defaults()];
                    const template = new ButtonTemplate("Click here to log in", buttons);
                    await this.reply(template);
                }
                break;
            }
            case "info": {
                await this.reply("This Bot has been designed for lazy people that don't won't to install " +
                    "crappy apps by Facebook and Librus and don't bother checking their just as crappy websites");
                break;
            }
        }
    }
}

class AccountLinkingHandler extends BaseHandler {

    /**
     *
     * @param {AccountLinkingEvent} messagingBase
     */
    constructor(messagingBase) {
        super(messagingBase);
    }

    /**
     *
     * @param json
     * @return {AccountLinkingHandler}
     */
    static fromJson(json) {
        return new AccountLinkingHandler(AccountLinkingEvent.fromJson(json));
    }

    async updateUser() {
        let status = this.status();
        if(status === AccountLinkingEvent.STATUS_LINKED) {
            await sql.deleteAuthRow(this.request.auth_code);
        } else if(status === AccountLinkingEvent.STATUS_UNLINKED) {

        } else {
            throw new Error("Unknown status: ", status);
        }
        return status;
    }

    status() {
        return this.request.status;
    }
}

class Element {
    /**
     *
     * @param title
     * @param subtitle
     * @param image_url
     * @param {Button[]} buttons
     * @param {Button} default_action
     */
    constructor(title, subtitle, image_url, buttons, default_action) {
        this.title = title;
        this.subtitle = subtitle;
        this.image_url = image_url;
        this.buttons = buttons;
        this.default_action = default_action;
    }
}

class Button {
    constructor(type) {
        this.type = type;
    }
}

Button.TYPE_LOGIN = "account_link";
Button.TYPE_LOGOUT = "account_unlink";
Button.TYPE_URL = "web_url";

class LoginButton extends Button {
    constructor(url) {
        super(Button.TYPE_LOGIN);
        this.url = url;
    }

    static defaults() {
        return new LoginButton(process.env.BOT_DOMAIN + process.env.BOT_REGISTER_PATH);
    }
}

class LogoutButton extends Button {
    constructor() {
        super(Button.TYPE_LOGOUT);
    }
}

class UrlButton extends Button {
    constructor(url, title) {
        super(Button.TYPE_URL);
        this.url = url;
        this.title = title;
    }
}

class Template {
    constructor(type) {
        this.template_type = type;
    }
}

Template.TYPE_BUTTON = "button";
Template.TYPE_LIST = "list";

class ButtonTemplate extends Template {
    /**
     *
     * @param text
     * @param {Button[]} buttons
     */
    constructor(text, buttons) {
        if(!buttons instanceof Array || buttons.length > 3 || buttons.length <= 0 || !buttons[1] instanceof Button)
            throw new Error("Buttons has to be an Array.<Button> with a length between 1 and 3");
        super(Template.TYPE_BUTTON);
        this.text = text;
        this.buttons = buttons;
    }
}

class ListTemplate extends Template {

    constructor(elements, buttons, big_top = true) {
        super(Template.TYPE_LIST);

        this.elements = elements;
        this.buttons = buttons;
        this.top_element_style = big_top ? "large" : "compact";
    }
}

module.exports.MessagingBase = MessagingBase;
module.exports.Message = Message;
module.exports.Event = Event;
module.exports.AccountLinkingEvent = AccountLinkingEvent;

module.exports.Element = Element;
module.exports.Button = Button;
module.exports.LoginButton = LoginButton;
module.exports.LogoutButton = LogoutButton;
module.exports.UrlButton = UrlButton;
module.exports.Template = Template;
module.exports.ButtonTemplate = ButtonTemplate;
module.exports.ListTemplate = ListTemplate;

module.exports.QuickReplyMessage = QuickReplyMessage;
module.exports.QuickReply = QuickReply;
module.exports.TextQuickReply = TextQuickReply;
module.exports.LocationQuickReply = LocationQuickReply;
module.exports.ImageQuickReply = ImageQuickReply;
module.exports.QuickReplyCreator = QuickReplyCreator;

module.exports.BaseHandler = BaseHandler;
module.exports.MessageHandler = MessageHandler;
module.exports.EventHandler = EventHandler;
module.exports.AccountLinkingHandler = AccountLinkingHandler;