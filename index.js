'use strict';
require('dotenv').config();
const messenger = require("./messenger_handler");
const sql = require("./database").sql;
const fs = require("fs");
const log4js = require("log4js");
const argv = require("yargs").argv;
const https = require("https");
const express = require('express'),
    bodyParser = require('body-parser'),
    app = express().use(bodyParser.json());

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

https.createServer({
    key: fs.readFileSync(process.env.SSL_CERT_KEY),
    cert: fs.readFileSync(process.env.SSL_CERT_CERT),
    passphrase: process.env.SSL_CERT_PASS
}, app).listen(8083);

sql.connect().then(() => {
    logger.info("Connected to MySQL");
}).catch((err) => {
    logger.info("MySQL error", err);
    process.exit(1);
});

app.post('/webhook', async(req, res) => {
    let body = req.body;
    if(body.object === 'page') {
        for(const entry of body.entry) {
            await messenger.process(entry);
        }

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }

});

app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if(mode && token) {
        if(mode === 'subscribe' && token === process.env.MSG_VERIFY_TOKEN) {
            logger.info("Webhook verified");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.status(400).send("Invalid request");
    }
});

app.get('*', function(req, res) {
    logger.info("Got unknown URL: ", req.url);
    res.status(404).send('what???');
});

logger.info("Process started");
