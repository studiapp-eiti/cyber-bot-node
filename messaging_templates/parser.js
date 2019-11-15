'use strict';

const dateFormat = require('dateformat');

const REGEX_TARGET = /^@([a-zA-Z\d:.-]+)/;
const REGEX_TARGET_USER_ID = /^user:(\d+)$/;
const REGEX_TARGET_COURSE_ID = /^course:(\d+)$/;
const REGEX_TARGET_LOCALE = /^(lang|locale):([a-z]{2})$/;
const REGEX_REPLACE_PROPERTY = /\$([a-z]+)\.?([a-z_]*)/g;

class Parser {
    constructor(text) {
        this.original_text = text;
        this.text = text.toLowerCase();
        this.target = {};
    }

    parse() {
        const target_match = this.text.match(REGEX_TARGET);
        if(target_match !== null) {
            const target_str = target_match[1];
            this.original_text = this.original_text.substring(target_str.length + 2);
            if(target_str === "all") {
                this.target.type = Parser.TARGET_ALL;
                this.target.query = "1 = 1";
                this.target.fields = [];
            } else if(target_str === "male" || target_str === "female") {
                this.target.query = "gender = ?";
                this.target.type = target_str;
                this.target.fields = [target_str];
            } else if(target_str === "registered") {
                this.target.query = "is_registered = ?";
                this.target.type = Parser.TARGET_REGISTERED;
                this.target.fields = [1];
            } else {
                const user_match = target_str.match(REGEX_TARGET_USER_ID);
                const course_match = target_str.match(REGEX_TARGET_COURSE_ID);
                const locale_match = target_str.match(REGEX_TARGET_LOCALE);
                if(user_match !== null) {
                    this.target.query = `id = ?`;
                    this.target.type = Parser.TARGET_USER;
                    this.target.fields = [parseInt(user_match[1])];
                } else if(course_match !== null) {
                    this.target.query = `usos_course = ?`;
                    this.target.type = Parser.TARGET_COURSE;
                    this.target.fields = [parseInt(course_match[1])];
                } else if(locale_match !== null) {
                    this.target.query = `locale LIKE ?`;
                    this.target.type = Parser.TARGET_LOCALE;
                    this.target.fields = [`${locale_match[2]}%`];
                }else {
                    this.target = null;
                }
            }
        } else {
            this.target = null;
        }
    }

    /**
     *
     * @param {User} user
     */
    replace(user) {
        let locale = user.locale.substring(0, 2);
        setLocale(dateFormat, locale);
        return this.original_text.replace(REGEX_REPLACE_PROPERTY, (match, $1, $2) => {
                switch($1) {
                    case "user": {
                        if(user.hasOwnProperty($2)) {
                            return user[$2];
                        } else if($2 === "name") {
                            return user.nickname !== null ? user.nickname : user.first_name;
                        }else if($2 === "full_name") {
                            return user.formatName();
                        }
                        break;
                    }
                    case "date": {
                        switch($2) {
                            case "":
                                return dateFormat(new Date(), "mediumDate");
                            case "time":
                                return dateFormat(new Date(), "HH:MM");
                            case "day":
                                return dateFormat(new Date(), "d");
                            case "weekday":
                                return dateFormat(new Date(), "dddd");
                            case "weekday_short":
                                return dateFormat(new Date(), "ddd");
                            case "month":
                                return dateFormat(new Date(), "mmmm");
                            case "month_short":
                                return dateFormat(new Date(), "mmm");
                            case "month_num":
                                return dateFormat(new Date(), "m");
                            case "year":
                                return dateFormat(new Date(), "yyyy");
                        }
                        break;
                    }
                    case "target": {
                        if(!Parser.TARGET_LOCALIZATION.hasOwnProperty(locale)) {
                            locale = "en";
                        }

                        if(!Parser.TARGET_LOCALIZATION[locale].hasOwnProperty(this.target.type)) {
                            return match;
                        }

                        const localized_target = Parser.TARGET_LOCALIZATION[locale][this.target.type].toLowerCase();

                        switch($2) {
                            case"": {
                                return localized_target;
                            }
                            case "capital": {
                                return localized_target.toLowerCase()
                                    .replace(/^\w/, c => c.toUpperCase());
                            }
                        }
                    }
                }
                return match;
            }
        );
    }
}

Parser.TARGET_ALL = "all";
Parser.TARGET_FEMALE = "female";
Parser.TARGET_MALE = "male";
Parser.TARGET_USER = "user";
Parser.TARGET_COURSE = "course";
Parser.TARGET_LOCALE = "locale";
Parser.TARGET_REGISTERED = "registered";

Parser.TARGET_LOCALIZATION = {
    "en": {
        "all": "all",
        "male": "men",
        "female": "women",
        "registered": "registered",
        "locale": "English language",
    },
    "pl": {
        "all": "wszyscy",
        "male": "panowie",
        "female": "panie",
        "registered": "zarejestrowani",
        "locale": "język polski",
    }
};

function setLocale(df, locale) {
    switch(locale) {
        case "en": {
            df.i18n = {
                dayNames: [
                    'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
                    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
                ],
                monthNames: [
                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
                    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
                ],
                timeNames: [
                    'a', 'p', 'am', 'pm', 'A', 'P', 'AM', 'PM'
                ]
            };
            return;
        }
        case "pl": {
            //TODO: Finish localization and move to a separate file
            df.i18n = {
                dayNames: [
                    'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
                    'Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'
                ],
                monthNames: [
                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
                    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
                ],
                timeNames: [
                    'a', 'p', 'am', 'pm', 'A', 'P', 'AM', 'PM'
                ]
            };
            return;
        }
    }
}

module.exports = Parser;