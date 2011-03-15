/*
Copyright 2011 Sleepless Software Inc. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE. 
*/

var util = require("util");
var events = require("events");
var http = require('http');
var url = require('url');

var o2j = function (o) { return JSON.stringify(o); };
var j2o = function (j) { return JSON.parse(j); };

var LOCALHOST = "127.0.0.1";
var STD_PORT = 9999;


var BEvents = function (ready, bootOthers, options) {
    var defaults = {
        port: STD_PORT,
        ip: LOCALHOST
    }

    var self = this;        // xxx I really don't like this

    self.log = function(msg) {
        if ( self.debug )
        {
            console.log(self.myPort + " says:");
            console.log(msg);
        }
    }

    events.EventEmitter.call(self);
    self.super_emit = self.emit;

    //Extend the defaults object.
    if ( options )
    {
        for ( var prop in options )
            defaults[prop] = options[prop];
    }

    self.myPort = defaults.port;

    self.others = {};
    self.addOther = function(other) {
        self.log("Add other: " + o2j(other));
        self.others[other.host + ":" + other.port] = other;
    }

    self.addOthers = function(otherArr) {
        for ( var i = 0; i < otherArr.length; i++ )
            self.addOther(otherArr[i]);
    }

    bootOthers = bootOthers || [defaults.ip+ ":" + defaults.port];
    bootOthers.forEach(function (other) {
        var m = other.match(/^([^:]+):(\d+)$/);
        if (m) {
            self.addOther({port: m[2], host: m[1]});
        }
    });


    self.removeOther = function(other) {
        self.log("Removed other:" + other);
        delete self.others[other];
    }

    self.httpd = http.createServer(function (req, res) {
        self.log("Connected - waiting for event.");
        var u, m, msg, o, rip, payload;

        rip = req.socket.remoteAddress;

        u = url.parse(req.url, true);
        m = u.pathname.match(/^\/\.([\-_.,A-Za-z0-9]+)/);       // message is restricted to this pattern
        if (!m) {
            res.statusCode = 404;
            res.end();
            return;
        }

        msg = m[1];
        req.setEncoding("utf8");
        var dataBuffer = "";
        req.on("data", function (data) {
            dataBuffer += data;
        });

        req.on("end", function() {
            // xxx inadequate; multiple data events may occur
            o = null;
            payload = j2o(dataBuffer);
            if (msg === "hello") {
                self.addOther({port: payload.port, host: rip});
                o = ["peers", self.others];
            }
            else {
                self.log("Emiting local: " + [msg].concat(payload) + " to: " + self.listeners(msg).length);
                self.super_emit.apply(self, [msg].concat(payload));
            }
            res.statusCode = 200;
            res.end(o2j(o));
        });

        req.on("error", function(e) {
            self.log("Error:" + e); 
        });
    });


    self.emit = function (msg, payload) {
        var id, opts, req, cb, other, k, path;

        if (msg === "newListener") {
            return;
        }

        if (arguments.length > 2)
            payload = Array.prototype.slice.call(arguments, 1,arguments.length);

        path = "/." + msg;
        self.log("Sending an "+msg+" to :" + o2j(self.others));
        for (k in self.others) {
            other = self.others[k];
            opts = {host: other.host, port: other.port, path: path, method: "POST"};
            self.log(opts);
            req = http.request(opts, function (res) {
                var arr;

                self.log("Response: "+ res.statusCode);
                res.setEncoding("utf8");
                res.on("data", function (data) {
                    // xxx inadequate; multiple data events may occur
                    arr = j2o(data);
                    if (arr) {
                        self.super_emit(arr[0], arr[1]);
                    }
                });

            });

            req.on("error", function (e) {
                self.removeOther(k);
            });

            req.end(o2j(payload));
        }
    };

    self.isBound = false;       // xxx, for some reason "bound()" gets called twice?  
    self.bound = function () {
        if (!self.isBound) {
            self.isBound = true;

            self.on("peers", function (payload) {
                self.addOthers(payload); 
                if (ready) {
                    ready();
                }
            });

            self.emit("hello", {port: self.myPort});
        }
    };

    self.httpd.on("error", function (e) {
        if (e.code === "EADDRINUSE") {
            self.myPort++;
            if (self.myPort <= defaults.port + 1) {
                self.httpd.listen(self.myPort, self.bound);
            }
        }
        else {
            throw e;
        }
    });

    self.httpd.listen(self.myPort, self.bound);
    self.log("Listening on: " +self.myPort);
};

util.inherits(BEvents, events.EventEmitter);            // turns BEvents into an EventEmitter

exports.BEvents = BEvents;



