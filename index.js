#!/usr/bin/env node

'use strict';
require('dotenv').config();
const messenger = require("./messenger_handler");
const sql = require("./database").sql;
const oauth = require("./usos_oauth");
const User = require("./global_objects").User;

const fs = require("fs");
const log4js = require("log4js");
const argv = require("yargs").argv;
const https = require("https");
const crypto = require("crypto");
const qs = require('qs');
const express = require('express'),
    bodyParser = require('body-parser'),
    app = express().use(bodyParser.json());
const request = require("request");

log4js.configure({
    appenders: {
        out: {type: 'stdout'},
        file: {type: 'file', filename: `${__dirname}/${argv["o"] ? argv["o"] : "bot.log"}`}
    },
    categories: {
        default: {appenders: ['out', 'file'], level: argv["l"] ? argv["l"] : "info"}
    }
});

const logger = log4js.getLogger();
logger.info("Process started");

https.createServer({
    key: fs.readFileSync(process.env.SSL_CERT_KEY),
    cert: fs.readFileSync(process.env.SSL_CERT_CERT),
    passphrase: process.env.SSL_CERT_PASS
}, app).listen(process.env.HTTPS_PORT).on("error", (e) => {
    if(e.code === "EADDRINUSE") {
        logger.fatal(`Could not start HTTPS server, port ${process.env.HTTPS_PORT} already in use`);
        logger.info("Process finished, exit code", 1);
        process.exit(1);
    }

    logger.error("[HTTPS Server]", e);
})
;

sql.connect().then(() => {
    logger.info("Connected to MySQL");
}).catch((err) => {
    logger.fatal("[MySQL]", err);
    logger.info("Process finished, exit code",2);
    process.exit(2);
});

app.post(process.env.BOT_WEBHOOK_PATH, async(req, res) => {
    logger.trace("Post to webhook");
    let body = req.body;
    if(body.object === "page") {
        for(const entry of body.entry) {
            await messenger.process(entry);
        }

        res.status(200).send("EVENT_RECEIVED");
    } else {
        res.sendStatus(404);
    }
});

app.get(process.env.BOT_WEBHOOK_PATH, (req, res) => {
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if(mode && token) {
        if(mode === "subscribe" && token === process.env.MSG_VERIFY_TOKEN) {
            logger.info("Webhook verified");
            res.status(200).send(challenge);
        } else {
            res.status(403).send("Forbidden");
        }
    } else {
        res.status(400).send("Invalid request");
    }
});

app.get(process.env.BOT_REGISTER_PATH, async(req, res) => {
    const user = await User.fromMessengerLinkingToken(req.query.account_linking_token);
    if(user === null) {
        res.redirect(req.query.redirect_uri);
        return;
    }

    logger.debug("Registering user", user.id);

    const request_data = {
        url: oauth.URL_REQUEST_TOKEN,
        method: "POST",
        data: {
            scopes: "grades",
            oauth_callback:
                "https://" + process.env.BOT_DOMAIN + process.env.BOT_PROXY_DIR +
                process.env.BOT_USOS_OAUTH_CALLBACK_PATH
        }
    };

    request({
        url: request_data.url,
        method: request_data.method,
        form: oauth.authorize(request_data)
    }, async(err, r, body) => {
        if(err !== null) {
            logger.error(err);
            return;
        }

        const data = qs.parse(body);
        await sql.insertLoginAttempt(
            user.id,
            req.query.account_linking_token,
            req.query.redirect_uri,
            crypto.randomBytes(32).toString("hex"),
            data.oauth_token,
            data.oauth_token_secret
        );

        logger.debug("Got USOS tokens, redirecting to authorize for user", user.id);
        res.redirect(`${oauth.URL_AUTHORIZE}?oauth_token=${data.oauth_token}`);
    });
});

app.get(process.env.BOT_USOS_OAUTH_CALLBACK_PATH, async(req, res) => {
    const token_key = req.query.oauth_token;
    let login_flow = await sql.getLoginFlowByToken(token_key);
    const token = {
        key: token_key,
        secret: login_flow.usos_oauth_secret
    };

    const user_id = login_flow.user_id;
    logger.debug("Received USOS token callback for user", user_id);

    const request_data = {
        url: oauth.URL_ACCESS_TOKEN,
        method: "POST",
        data: {
            oauth_token: token_key,
            oauth_verifier: req.query.oauth_verifier
        }
    };

    request({
        url: request_data.url,
        method: request_data.method,
        form: oauth.authorize(request_data, token)
    }, async(err, r, body) => {
        if(err !== null) {
            logger.error(err);
            return;
        }

        const json = qs.parse(body);

        await sql.updateUsosTokensForUserId(user_id, json.oauth_token, json.oauth_token_secret);
        await sql.updateUserRegistered(user_id, true);

        logger.debug("Registered successfully user_id -", user_id);
        res.redirect(`${login_flow.messenger_callback_url}&authorization_code=${login_flow.messenger_auth_code}`);
    });
});

app.post(process.env.BOT_NOTIFY_PATH, async(req, res) => {
    //TODO: Validate if the request is coming from a localhost
    let body = req.body;
    try {
        await messenger.notify(body.user_ids, body.text);
        res.send(200);
    } catch(e) {
        logger.error(e);
        res.send(500);
    }
});

app.get('*', function(req, res) {
    logger.debug("Got unknown URL: ", req.url);
    res.status(404).send("Not found");
});
