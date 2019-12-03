const api = require("./api_manager");
const {sleep} = require("../utils");
const {Parser} = require("../messaging_templates");
const sql = require("../database").sql;
const User = require("../global_objects").User;

const logger = require("log4js").getLogger();

const NICKNAME_MIN_LENGTH = 1;
const NICKNAME_MAX_LENGTH = 24;
const REGEX_NICKNAME = /^[a-zA-Z\d ]+$/;

const FEEDBACK_MAX_LENGTH = 500;

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
        return new Message(null, this.recipient, this.sender, new Date(), text, Message.TYPE_RESPONSE);
    }
}

class Message extends MessagingBase {
    constructor(id, sender, recipient, timestamp, text, type) {
        super(sender, recipient, timestamp);
        this.text = text;
        this.id = id;
        this.type = type;
    }

    /**
     * Creates an instance given a json
     * @param json
     * @return {Message}
     */
    static fromJson(json) {
        logger.trace(json);
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
            messaging_type: this.type,
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
Message.TYPE_RESPONSE = "RESPONSE";
Message.TYPE_UPDATE = "UPDATE";
Message.TYPE_TAG = "MESSAGE_TAG";
Message.TAG_CONFIRMED_EVENT_UPDATE = "CONFIRMED_EVENT_UPDATE";

class UpdateMessage extends Message {
    constructor(id, sender, recipient, timestamp, text) {
        super(id, sender, recipient, timestamp, text, Message.TYPE_TAG);
    }

    toJson() {
        const json = super.toJson();
        json.tag = Message.TAG_CONFIRMED_EVENT_UPDATE;
        return json;
    }
}

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
        let mess = json.messaging[0];
        if(mess.hasOwnProperty("postback")) {
            return new Event(mess.sender.id,
                mess.recipient.id,
                new Date(mess.timestamp),
                mess.postback.title,
                mess.postback.payload
            );
        } else if(mess.hasOwnProperty("message") && mess.message.hasOwnProperty("quick_reply")) {
            return new Event(mess.sender.id,
                mess.recipient.id,
                new Date(mess.timestamp),
                mess.message.text,
                mess.message.quick_reply.payload
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
     * @param type
     * @param {QuickReply[]} quickReplies
     */
    constructor(id, sender, recipient, timestamp, text, type, quickReplies) {
        super(id, sender, recipient, timestamp, text, type);
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
            new Date(), creator.text, message.type, creator.quick_replies);
    }

    toJson() {
        const json = super.toJson();
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
            if(mess.message.hasOwnProperty("quick_reply")) {
                return EventHandler.fromJson(json);
            } else {
                return MessageHandler.fromJson(json);
            }
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

    async processGenericMessage() {
        const user = await User.fromFacebookId(this.request.sender);
        const text = this.request.text;
        if(user.msg_state === User.STATE_ASK_NICKNAME) {
            const quick_replies = [
                new TextQuickReply("Yes", "nickname_ask_yes"),
                new TextQuickReply("No", "nickname_ask_no")
            ];

            if(user.nickname !== null) {
                quick_replies.push(new TextQuickReply("Delete nickname", "nickname_delete"));
            }

            const creator = new QuickReplyCreator("Please use the quick replies below", quick_replies);
            await this.reply(creator);
            return;
        }

        if(user.msg_state === User.STATE_INPUT_NICKNAME) {
            const quick_replies = [
                new TextQuickReply("Cancel", "nickname_cancel")
            ];

            const sanitized_text = text.trim().replace(/\s{2,}/, " ");
            if(sanitized_text.match(REGEX_NICKNAME) === null) {
                const creator = new QuickReplyCreator(
                    "Nickname can only contain letters, numbers, spaces",
                    quick_replies
                );
                await this.reply(creator);
            } else if(sanitized_text.length > NICKNAME_MAX_LENGTH) {
                const creator = new QuickReplyCreator(
                    `Nickname cannot be longer then ${NICKNAME_MAX_LENGTH} characters`,
                    quick_replies
                );
                await this.reply(creator);
            } else if(sanitized_text.length < NICKNAME_MIN_LENGTH) {
                const creator = new QuickReplyCreator(
                    `Nickname cannot be shorter then ${NICKNAME_MIN_LENGTH} characters`,
                    quick_replies
                );
                await this.reply(creator);
            } else {
                user.nickname = sanitized_text;
                user.msg_state = User.STATE_NO_STATE;
                await user.save();

                await this.reply(`I will call you ${user.nickname} from now on`);
            }
            return;
        } else if(user.msg_state === User.STATE_FEEDBACK) {
            const ticket_id = await sql.insertFeedback(text.substring(0, FEEDBACK_MAX_LENGTH), user.id);

            user.msg_state = User.STATE_NO_STATE;
            await user.save();

            await this.reply(`Thanks for submitting feedback - No. ${ticket_id}`);
            return;
        }

        if(user.is_admin) {
            const help_match = text.toLowerCase().match(/^help($|\s[a-z]*)/);
            if(help_match !== null) {
                switch(help_match[1].trim()) {
                    case "": {
                        await this.reply(
                            "Broadcast usage:\n" +
                            "@[TARGET] [CONTENT]\n\n" +

                            "[TARGET] - one off: all, male, female, registered, user:[id], course:[id]\n\n" +

                            "variables supported in [CONTENT]: $user, $target, $date\n\n" +

                            "For more info try 'help [VARIABLE]'");
                        return;
                    }

                    case "$user":
                    case "user": {
                        await this.reply(
                            "$user - available fields:\n\n" +
                            "name - nickname if set, first_name, otherwise\n" +
                            "last_name - user's last name\n" +
                            "first_name - user's first name\n" +
                            "gender - user's gender in lowercase (only in english)\n" +
                            "facebook_id - user's messenger id used for sending messages\n" +
                            "locale - user's locale ex. en_US"
                        );
                        return;
                    }

                    case "$date":
                    case "date": {
                        await this.reply(
                            "$date - Defaults to medium date format\n" +
                            "ex. Nov 15, 2019\n" +
                            "available fields (localized):\n\n" +
                            "time - current time in 24h format\n" +
                            "day - current day of the month\n" +
                            "weekday - weekday in long format\n" +
                            "weekday_short - weekday in short format ex. Mon\n" +
                            "month - current month in long format\n" +
                            "month_short - current month in short format ex. Oct\n" +
                            "month_num - current month as number\n" +
                            "year - current year ex. 2019"
                        );
                        return;
                    }

                    case "$target":
                    case "target": {
                        await this.reply(
                            "$target\n" +
                            "Allows to insert selected target to the message (localized)\n" +
                            "Defaults to lowercase, .capital capitalizes it"
                        );
                        return;
                    }

                    default: {
                        await this.reply("Invalid variable, try 'help' to see available");
                    }
                }
            }

            const parser = new Parser(text);
            parser.parse();
            if(parser.target !== null) {
                await this.typing(true);

                const users = await sql.queryUsersByTarget(parser.target);
                let count = 0;
                for(const u of users) {
                    if(user.id === u.id) {
                        continue;
                    }

                    count++;
                    const msg = new UpdateMessage(null,
                        process.env.MSG_DEFAULT_SENDER_ID,
                        u.facebook_id,
                        new Date(),
                        parser.replace(u)
                    );

                    await api.sendMessage(msg);

                    /*
                     * We do not want to become a high-MPS page. We can only safely send 40mps. See, for reference:
                     * https://developers.facebook.com/docs/messenger-platform/send-messages/high-mps
                     */
                    await sleep(100);
                }

                await this.typing(false);
                await this.reply(`Sent to ${count}: '${parser.replace(user)}'`);
            } else {
                await this.reply("Unknown command, try 'help'");
            }
        } else {
            await this.reply("Your input is only valid when setting your nickname");
            await this.reply("Please use the menu to interact with the bot");
        }
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
        const user = await User.fromFacebookId(this.request.sender);
        switch(this.request.payload) {
            case "get_started": {
                await this.reply(`Hi ${user["first_name"]}, thanks for clicking get started!`);
                if(!user.is_registered) {
                    await this.reply("You have to log in to USOS to be able to use this bot's features");
                    const buttons = [LoginButton.defaults()];
                    const template = new ButtonTemplate("Click here to log in", buttons);
                    await this.reply(template);
                } else {
                    await this.reply("Your account has already been linked");
                    const settings_btn = new UrlButton(process.env.BOT_MANAGE_NOTIFICATIONS_URL, "Notification settings");
                    const files_btn = new UrlButton(process.env.BOT_FILES_URL, "Your files");
                    const buttons = [settings_btn, files_btn];
                    await this.reply(new ButtonTemplate(
                        "You can manage your notification settings and view your " +
                        "files by clicking one of the buttons below",
                        buttons)
                    );
                }
                break;
            }
            case "menu_feedback": {
                user.msg_state = User.STATE_FEEDBACK;
                await user.save();

                //TODO: Ask the user if he or she is submitting a bug report or general feedback
                const quick_replies = [
                    new TextQuickReply("Cancel", "feedback_cancel")
                ];
                const creator = new QuickReplyCreator(
                    "Input you feedback below. " +
                    "If you discovered a bug describe how to replicate it if possible.", quick_replies);
                await this.reply(creator);

                break;
            }
            case "feedback_cancel": {
                user.msg_state = User.STATE_NO_STATE;
                await user.save();

                await this.reply(
                    "Your feedback was not recorded. " +
                    "If you ever wish to submit a bug report or feedback click 'Feedback' again.");
                break;
            }
            case "menu_nickname": {
                user.msg_state = User.STATE_ASK_NICKNAME;
                await user.save();

                const quick_replies = [
                    new TextQuickReply("Yes", "nickname_ask_yes"),
                    new TextQuickReply("No", "nickname_ask_no")
                ];

                if(user.nickname !== null) {
                    quick_replies.push(new TextQuickReply("Delete nickname", "nickname_delete"));
                }

                if(user.nickname === null) {
                    const creator = new QuickReplyCreator(
                        "You haven't set a nickname yet, would you like to set one?",
                        quick_replies
                    );
                    await this.reply(creator);
                } else {
                    const creator = new QuickReplyCreator(
                        `Your current nickname is '${user.nickname}', would you like to change it?`,
                        quick_replies
                    );
                    await this.reply(creator);
                }

                break;
            }
            case "nickname_cancel":
            case "nickname_ask_no": {
                user.msg_state = User.STATE_NO_STATE;
                await user.save();

                await this.reply(user.nickname !== null ?
                    `Your nickname was not changed, ${user.nickname}` :
                    "Your nickname was not set"
                );
                break;
            }
            case "nickname_ask_yes": {
                user.msg_state = User.STATE_INPUT_NICKNAME;
                await user.save();

                const quick_replies = [
                    new TextQuickReply("Cancel", "nickname_cancel")
                ];
                const creator = new QuickReplyCreator("Input your nickname below", quick_replies);
                await this.reply(creator);
                break;
            }
            case "nickname_delete": {
                user.msg_state = User.STATE_NO_STATE;
                user.nickname = null;
                await user.save();

                await this.reply(`Your nickname has been removed, I will call you ${user.first_name} now`);
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
        if(this.request.status === AccountLinkingEvent.STATUS_LINKED) {
            await sql.deleteAuthRow(this.request.auth_code);
        } else if(this.request.status === AccountLinkingEvent.STATUS_UNLINKED) {
            const user = await User.fromFacebookId(this.request.sender);
            if(user === null) {
                logger.error("Unlinking nonexistent user id", this.request.sender);
            } else {
                logger.debug("Unlinked successfully, user", user.id);
                await sql.updateUsosTokensForUserId(user.id, null, null);
                await sql.updateUserRegistered(user.id, false);
            }
        } else {
            throw new Error(`Unknown status: ${this.request.status}`);
        }
    }

    async reply() {
        if(this.request.status === AccountLinkingEvent.STATUS_LINKED) {
            await super.reply("Your USOS account has been linked successfully!");
            const settings_btn = new UrlButton(process.env.BOT_MANAGE_NOTIFICATIONS_URL, "Notification settings");
            const files_btn = new UrlButton(process.env.BOT_FILES_URL, "Your files");
            const buttons = [settings_btn, files_btn];
            await super.reply(new ButtonTemplate(
                "You can now manage your notification settings and view your " +
                "files by clicking one of the buttons below",
                buttons)
            );
        } else if(this.request.status === AccountLinkingEvent.STATUS_UNLINKED) {
            await super.reply("Your USOS account has been unlinked successfully!");
        }
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
        return new LoginButton(
            process.env.BOT_BASE_PATH + process.env.BOT_REGISTER_PATH
        );
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
module.exports.UpdateMessage = UpdateMessage;
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