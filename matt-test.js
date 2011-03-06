var bevents = require('./bevents.js').bevents;
bevents.createServer(null, 'ip-ip-ip-ip.us-west-1.elb.amazonaws.com', [
    'ec2-ip-ip-ip-ip1.us-west-1.compute.amazonaws.com',
    'ec2-ip-ip-ip-ip2.us-west-1.compute.amazonaws.com'
]);

bevents.on("whoa", function(e) { console.log("Test: " + JSON.stringify(e)); });

function obj() {
    this.smt = new Date().getTime();
}

setInterval(function() { 
        var o = new obj();
        console.log("Test is Triggering: " + JSON.stringify(o));
        bevents.trigger("whoa",o);
}, 10000);

