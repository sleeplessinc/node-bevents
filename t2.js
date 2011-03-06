
var o2j = function (o) { return JSON.stringify(o); };
var j2o = function (j) { return JSON.parse(j); };
var l = function (s) { console.log(s); };

bevents = require("./bevents");

b2 = new bevents.BEvents(function() {

	l("b2 is listening on " + b2.myPort);

	b2.on("bar", function (payload) {
		l("__on__ bar "+o2j(payload));
	});

	setInterval(function() {
		b2.emit("foo", {foo: 1});
	}, 5000);

});


