
/*
	HTTP transactions looks something like this:

		POST /.hello?id=ID_1 HTTP/1.0
		(request headers)

		{foo: 7}

	"/." indicates it's a bevents msg.  "hello" is the msg.  body of request is JSON payload 

	A message may be returned directly.  If so, it will be JSON like:

		["ID_1", "peers", {foo: 7}]
	
	where first item is the message, and second is payload
	Or just:

		null

	if there is no message.

*/

var util = require("util");
var events = require("events");
var http = require('http');
var url = require('url');

var seq = 1;

var o2j = function (o) { return JSON.stringify(o); };
var j2o = function (j) { return JSON.parse(j); };
var l = function (s) { console.log(s); };

var LOCALHOST = "127.0.0.1";
var STD_PORT = 9999;


var BEvents = function (bootOthers) {

	var self = this;
	events.EventEmitter.call(self);
	self.super_emit = self.emit;

	
	self.myPort = STD_PORT;


	// build list of known peers
	//self.id = "ID_" + (new Date().getTime());	// a unique peer identifier
	self.others = {};
	bootOthers = bootOthers || [LOCALHOST+":"+STD_PORT];
	l("bootOthers: "+o2j(bootOthers));
	bootOthers.forEach(function (other) {
		var m = other.match(/^([^:]+):(\d+)$/);
		if (m) {
			self.others[other] = {port: m[2], host: m[1]};
		}
	});
	l("others: "+o2j(self.others));


	self.httpMsg = function(rip, res, msg, payload) {
	};


	// the embedded http server
	self.httpd = http.createServer(function (req, res) {
		var u, m, msg, o, rip, otherPort;

		rip = req.socket.remoteAddress;				l("\nconnect from " + rip);

		u = url.parse(req.url, true);
		m = u.pathname.match(/^\/\.([\-_.,A-Za-z0-9]+)/);		// message is restricted to this pattern
		if (!m) {
			res.statusCode = 404;
			res.end();								l("responded 404");
			return;
		}

		msg = m[1];									l("msg: " + msg);

		req.setEncoding("utf8");
		req.on("data", function (data) {			l("x RCVD " + data);
			// xxx 
			o = null;
			if (msg === "hello") {					l("got hello");
				otherPort = j2o(data).port;
				self.others[rip+":"+otherPort] = {port: otherPort, host: rip};
				o = ["peers", self.others];
			}
			res.statusCode = 200;
			res.end(o2j(o));						l("sent back "+o2j(o));
													l("(http tx complete)");
		});
	});


	// send message to peers via http request
	self.emit = function (msg, payload) {
		var id, opts, req, cb, other, k;

		if(msg === "newListener") {
			return;
		}

		payload = payload || {};
		l("EMIT " + msg + ", " + o2j(payload));

		// callback for transaction response 
		cb = function (res) {
			var arr;

			l("got response ...");

			res.setEncoding("utf8");
			res.on("data", function (data) {
				// xxx this is not sufficient to guarantee receipt of full msg; multiple data events may occur
				arr = j2o(data);
				l("RCVD " + data);
				if(arr) {
					l("emitting local: "+data);
					self.super_emit(arr[0], arr[1]);
				}
			});

		};

		// broadcast msg to others
		path = "/." + msg;
		l("broadcasting: "+path+", "+o2j(payload));
		for (k in self.others) {
			other = self.others[k];
			l("  to: "+o2j(other));
			opts = {host: other.host, port: other.port, path: path, method: "POST"};
			req = http.request(opts, cb);
			req.write(o2j(payload));
			req.end();
		}

	};


	self.isBound = false;		// xxx, for some reason "bound()" gets called twice?
	var bound = function() {
		if(!self.isBound) {
			l("LISTENING " + self.myPort);

			self.isBound = true;
			self.on("peers", function (payload) {		l("ON peers: " + o2j(payload));
				self.others = payload; 
			});

			self.emit("hello", {port: self.myPort});
		}
	}

	self.httpd.on("error", function(e) {			l("ugh " + e.code);
		if (e.code == "EADDRINUSE") {
			l("port taken: " + self.myPort);
			self.myPort++;
			if(self.myPort <= STD_PORT + 1) {
				self.httpd.listen(self.myPort, bound);
			}
		}
		else {
			throw e;
		}
	});

	self.httpd.listen(self.myPort, bound);

};

// Turn BEvents into an EventEmitter
util.inherits(BEvents, events.EventEmitter);

exports.BEvents = BEvents;


