
var o2j = function (o) { return JSON.stringify(o); };
var j2o = function (j) { return JSON.parse(j); };
var l = function (s) { console.log(s); };

bevents = require("./bevents");

b1 = new bevents.BEvents(function() {

	b1.on("foo", function (payload) {
		l("__on__ foo "+o2j(payload));
	});

	setInterval(function() {
		b1.emit("bar", {bar: 2});
	}, 5000);

});




