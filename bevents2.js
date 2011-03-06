
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


var BEvents = function (opts) {

	var self = this;
	var key; 

	events.EventEmitter.call(self);

	// defaults
	self.id = "ID_" + (new Date().getTime());	// a unique peer identifier
	self.port = 80;

	// the default list of known peers
	self.others = {};
	self.others[self.id] = "127.0.0.1";

	// optional overrides
	for (key in opts) {
		self[key] = opts[key];
	}


	// the embedded http server
	self.httpd = http.createServer(function (req, res) {

		var u, m, msg, o;

		u = url.parse(req.url, true);
		m = u.pathname.match(/^\/\.([\-_.,A-Za-z0-9]+)/);		// message is restricted to this pattern

		if (m) {
			msg = m[1];
			res.on("data", function (data) {
				// xxx this is not sufficient to guarantee receipt of full msg; multiple data events may occur
				self.super_.emit(msg, JSON.parse(data));
			});

			// send direct response, if any
			o = null;
			if (msg === "hello") {
				// remember this peer
				self.others[u.query.id] = req.socket.remoteAddress;

				o = [self.id, "peers", self.others];
			}
			res.statusCode = 200;
			res.end(JSON.stringify(o));
		}
		else {
			res.statusCode = 404;
			res.end();
		}

	});


	// send a message to peer via an http request
	self.super_emit = self.emit;
	self.emit = function (msg, payload) {
		var id, opts, req, cb;

		if(msg === "newListener") { return; }

		payload = payload || {};

		l(self.id + ": EMIT " + msg + ", " + o2j(payload));

		cb = function (res) {
			var arr;

			// process the msg that came back (if any)
			res.setEncoding("utf8");
			res.on("data", function (data) {
				// xxx this is not sufficient to guarantee receipt of full msg; multiple data events may occur
				arr = j2o(data);
				l("RCVD from "+arr[0]+": " + data);
				if(arr) {
					self.super_emit(arr[1], arr[2]);
				}
			});

		};

		// broadcast msg to peers
		path = "/." + msg + "?id=" + self.id; //l("BCAST path=" + path);
		for (id in self.others) {
			opts = {host: self.others[id], port: self.port, path: path, method: "POST"};
			req = http.request(opts, cb);
			req.write(encodeURIComponent(JSON.stringify(payload)));
			req.end();
		}

	};


	self.httpd.listen(self.port, function () {

		self.on("peers", function (payload) {
			l(self.id + ": ON peers: " + o2j(payload));
			var id;
			for (id in payload) {
				self.others[id] = "---";
			}
		});

		l(self.id + ": listening on " + self.port);
		self.emit("hello");
	});

};

// Turn BEvents into an EventEmitter
util.inherits(BEvents, events.EventEmitter);

exports.BEvents = BEvents;


