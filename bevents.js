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


var BEvents = function (ready, bootOthers) {

	var self = this;		// xxx I really don't like this
	events.EventEmitter.call(self);
	self.super_emit = self.emit;

	self.myPort = STD_PORT;

	self.others = {};
	bootOthers = bootOthers || [LOCALHOST + ":" + STD_PORT];
	bootOthers.forEach(function (other) {
		var m = other.match(/^([^:]+):(\d+)$/);
		if (m) {
			self.others[other] = {port: m[2], host: m[1]};
		}
	});


	self.httpd = http.createServer(function (req, res) {
		var u, m, msg, o, rip, payload;

		rip = req.socket.remoteAddress;

		u = url.parse(req.url, true);
		m = u.pathname.match(/^\/\.([\-_.,A-Za-z0-9]+)/);		// message is restricted to this pattern
		if (!m) {
			res.statusCode = 404;
			res.end();
			return;
		}

		msg = m[1];

		req.setEncoding("utf8");
		req.on("data", function (data) {
			// xxx inadequate; multiple data events may occur
			o = null;
			payload = j2o(data);
			if (msg === "hello") {
				self.others[rip + ":" + payload.port] = {port: payload.port, host: rip};
				o = ["peers", self.others];
			}
			else {
				self.super_emit(msg, payload);
			}
			res.statusCode = 200;
			res.end(o2j(o));
		});
	});


	self.emit = function (msg, payload) {
		var id, opts, req, cb, other, k, path;

		if (msg === "newListener") {
			return;
		}

		payload = payload || {};

		cb = function (res) {
			var arr;

			res.setEncoding("utf8");
			res.on("data", function (data) {
				// xxx inadequate; multiple data events may occur
				arr = j2o(data);
				if (arr) {
					self.super_emit(arr[0], arr[1]);
				}
			});

		};

		path = "/." + msg;
		for (k in self.others) {
			other = self.others[k];
			opts = {host: other.host, port: other.port, path: path, method: "POST"};
			req = http.request(opts, cb);
			req.on("error", function (e) {
				delete self.others[k];
			});
			req.write(o2j(payload));
			req.end();
		}
	};


	self.isBound = false;		// xxx, for some reason "bound()" gets called twice?  
	self.bound = function () {
		if (!self.isBound) {
			self.isBound = true;

			self.on("peers", function (payload) {
				self.others = payload; 
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
			if (self.myPort <= STD_PORT + 1) {
				self.httpd.listen(self.myPort, self.bound);
			}
		}
		else {
			throw e;
		}
	});

	self.httpd.listen(self.myPort, self.bound);

};

util.inherits(BEvents, events.EventEmitter);			// turns BEvents into an EventEmitter

exports.BEvents = BEvents;


