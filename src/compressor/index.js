'use strict';

var fs = require('fs');
var path = require('path');
var Fontmin = require('fontmin');
var utils = require('./utils');
var Adapter = require('../adapter');



// http://font-spider.org/css/style.css
// var RE_SERVER = /^(\/|http\:|https\:)/i;
var RE_SERVER = /^https?\:/i;

var TEMP = '.FONT_SPIDER_TEMP';
var number = 0;



function Compress(webFont, options) {
    options = new Adapter(options);

    return new Promise(function(resolve, reject) {


        if (webFont.length === 0) {
            resolve(webFont);
            return;
        }


        number++;


        var source;


        webFont.files.forEach(function(file) {
            if (RE_SERVER.test(file.source)) {
                throw new Error('does not support remote path "' + file + '"');
            }

            if (file.format === 'truetype') {
                source = file.source;
            }
        });



        // 必须有 TTF 字体
        if (!source) {
            throw new Error('"' + webFont.family + '"' + ' did not find turetype fonts');
        }



        this.source = source;
        this.webFont = webFont;
        this.options = options;
        this.dirname = path.dirname(source);
        this.extname = path.extname(source);
        this.basename = path.basename(source, this.extname);


        // 备份字体与恢复备份
        if (options.backup) {
            this.backup();
        }

        if (!fs.existsSync(this.source)) {
            throw new Error('"' + source + '" file not found');
        }

        this.min(resolve, reject);
    }.bind(this));
}


Compress.defaults = {
    backup: true
};


Compress.prototype = {



    // 字体恢复与备份
    backup: function() {

        var backupFile;

        var source = this.source;
        var dirname = this.dirname;
        var basename = this.basename;

        // version < 0.2.1
        if (fs.existsSync(source + '.backup')) {
            backupFile = source + '.backup';
        } else {
            backupFile = path.join(dirname, '.font-spider', basename);
        }

        if (fs.existsSync(backupFile)) {
            utils.cp(backupFile, source);
        } else {
            utils.cp(source, backupFile);
        }
    },



    min: function(succeed, error) {

        var webFont = this.webFont;
        var source = this.source;
        var dirname = this.dirname;

        var originalSize = fs.statSync(source).size;


        var fontmin = new Fontmin().src(source);
        var temp = path.join(dirname, TEMP + number);

        // TODO 有些 webfont 使用 content 属性加字体继承，查询不到 chars
        // 不压缩，避免意外将 fonticon 干掉了
        if (webFont.chars) {
            fontmin.use(Fontmin.glyph({
                text: webFont.chars
            }));
        }

        var types = {
            'embedded-opentype': 'ttf2eot',
            'woff': 'ttf2woff',
            'woff2': 'ttf2woff2',
            'svg': 'ttf2svg'
        };

        Object.keys(types).forEach(function(index) {
            var key = types[index];
            if (typeof Fontmin[key] === 'function') {
                fontmin.use(Fontmin[key]({
                    clone: true
                }));
            }
        });


        fontmin.dest(temp);

        fontmin.run(function(errors /*, buffer*/ ) {

            if (errors) {
                error(errors);
            } else {

                // 从临时目录把压缩后的字体剪切出来
                webFont.files.forEach(function(file) {
                    var basename = path.basename(file.source);
                    var tempFile = path.join(temp, basename);
                    var out = file.source;
                    utils.rename(tempFile, out);
                });


                utils.rmdir(temp);

                // 添加新字段：记录原始文件大小
                webFont.originalSize = originalSize;

                succeed(webFont);
            }
        });
    }
};



module.exports = function(webFonts, options) {
    if (!Array.isArray(webFonts)) {
        webFonts = [webFonts];
    }
    return Promise.all(webFonts.map(function(webFont) {
        return new Compress(webFont, options);
    }));
};