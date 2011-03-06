
/*
	HTTP transactions looks something like this:

		POST /.hello HTTP/1.0
		(request headers)

		{foo:7}

	"/." indicates it's a bevents msg.  "hello" is the msg.  body of request is JSON payload 

	A message may be returned directly.  If so, it will be JSON like:

		["peers",{foo:7}]
	
	where first item is the message, and second is payload
	Or just:

		null

	if there is no message.

*/

var util = require("util")
var events = require("events")
var http = require('http')
var url = require('url')

var seq = 1

var BEvents = function(opts) {

	var self = this

	// defaults
	self.id = "ID_"+(new Date().getTime())	// a unique peer identifier
	self.port = 80

	// the default list of known peers
	self.others = {}
	self.others[self.id] = "127.0.0.1"

	// optional overrides
	for(key in opts) 
		self[key] = opts[key]


	// the embedded http server
    self.httpd = http.createServer(function(req, res) {

		var u = url.parse(req.url, true);
		var m = u.pathname.match(/^\/\.([-_.,A-Za-z0-9]+)/)		// message is restricted to this pattern
		if(m) {
			var msg = m[1]
			res.on("data", function(data) {
				self.super_.emit(msg, JSON.parse(data))
				// xxx this is not sufficient to guarantee receipt of full msg; multiple data events may occur
			})

			// send direct response, if any
			var o = null
			if(msg == "hello") {
				//var rip = req.socket.remoteAddress.toLowerCase().replace(/[^a-z0-9]+/, "_";

				// remember this peer
				var rip = req.socket.remoteAddress;
				others[rip] = rip;

				o = ["peers", self.id, others]
			}
			res.statusCode = 200
			res.end(JSON.stringify(o))
		}
		else {
			res.statusCode = 404
			res.end()
		}

	})


	// send a message to peer via an http request
	self.emit = function(msg, payload) {

		// step through and sent to all peers (including myself)
		for(var i = 0; i < others.length; i++) {

			var opts = {host:others[i], port:self.port, path:"/."+msg, method:"POST"}
			var req = http.request(opts, function(res) {

				// remember this peer
				var rip = req.socket.remoteAddress;
				others[rip] = rip;
				
				// handle any msg that came back
				res.setEncoding("utf8")
				res.on("data", function(data) {
					var o = JSON.parse(data)
					self.super_.emit(o.msg, o.payload)
				})

			})

			// send out the payload
			req.write(encodeURLComponent(JSON.stringify(payload)))
			req.end()
		}
	}


	self.on("peers", function(payload) {
		// remember the peers sent back
		for(rip in payload) {
			others[rip] = rip
		}
	}

	
	self.httpd.listen(self.port, function() {
		self.emit("hello")
	})

}

// Turn BEvents into an EventEmitter
utils.inherits(Bevents, events.EventEmitter)

exports.BEvents = Bevents


