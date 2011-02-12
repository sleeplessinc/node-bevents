var events = require('events');
var http = require('http');
var url = require('url');

function beventsObj() {
	this.domain = 'localhost';
	this.machineList = {};
    this.hserver = null; //Will contain the event handler.
    this.port = 3868;
    this.announcement = "/bevents/hi/";
    this.eventpost = "/bevents/postevent/";
    //Assign ourself a random ID...  this should be good enough.
    this.idString = Math.floor(Math.random(new Date().getTime()) * 10000000000) + "-" + Math.floor(Math.random(new Date().getTime()) * 10000000000);
    //Has-a normal event emitter;
    this.baseEmitter = new events.EventEmitter();

    //Starts our event http server.  Specifies which domain to ping
    //and port to listen on.
    this.createServer = function(port, domain, optionalMachineList) {
        if ( port ) this.port = port;

        this.domain = ( domain ? domain : 'localhost' );
        this.machineList = (optionalMachineList ? optionalMachineList : {});//Contains machines we know about.

        this.hserver = http.createServer((function(scope) {
            return (function(req, res) {
                var urlObj = url.parse(req.url, true);

                console.log("Got a howdy: ");
                console.log(urlObj);

                //Check to see if someone is just registering with us.
                if ((urlObj.pathname + "").match(/.*\/hi\/.*/)) {
                    //if the id passed is our own... we're talking
                    //to ourself.  Try again to talk to someone else in
                    //5 seconds.
                    if ( urlObj.query.id == scope.idString ) {
                        //Whomever is first onto the network, could potentially
                        //be the only guy broadcasting... but at least one server
                        //will be letting everyone else know about everyone else as
                        //they come online.
                        setInterval(announceSelf, 10000);
                        req.end();
                        return;  //We're done talking to ourself.
                    }

                    //So, we're not talking to ourself.  Find out what they know.
                    var buildList = "[";
                    var ct = 0;
                    for ( var mach in scope.machineList ) { 
                        if ( ct != 0 )
                            buildList += ",";

                        buildList += scope.machineList[mach];
                    }

                    buildList += "]";

                    //Send out the list as valid js. 
                    res.end(buildList);

                    //Store the connector to the machinelist.
                    var ipString = scope.ipToHash(req.socket.remoteAddress);
                    if (!scope.machineList[ipString]) {
                        scope.machineList[ipString] = {};
                    }
                }
                else if ((urlObj.pathname + "").match(/.*\/event\//)) {
                    if ( urlObj.query.id == scope.idString ) {
                        //We generated the event. Bail.
                        req.end();
                        return;
                    }

                    //So... we didn't create the event. Trigger baby.
                    if ( urlObj.query.e ) {
                        var eventObj = eval(urlObj.query.e);
                        scope.trigger(eventObj.eventName);
                    }
                }
                else {
                    res.end("Uh... sorry.");
                    return;
                }
            });
        })(this));

        this.hserver.listen(this.port);
        this.announceSelf();
    }

    //Handles anouncing ourself to someone else in the pool of machines
    //to collect other machines we should talk to.
    this.announceSelf = function(machine) {
        var options = {
                host: (machine ? machine : this.domain),
                port: this.port,
                path: this.announcement + "?id="+this.idString
        }

        console.log("Options: ");
        console.log(options);
        http.get(options, function(res) {
            console.log("Got response: " + res.statusCode);
            res.on('data', function (chunk) {
                console.log('BODY: ' + chunk);
                //Chunk should be list of machines they know about.  We say "hi",
                //to them, if we don't already know about them.
                var machines = eval(chunk);
                if ( machines && machines.length ) {
                    if ( this.machineList[machine] == null ) {
                        this.machineList[machine] = {};   //Place holder object for that machine
                        //Put an announcement on the queue.
                        setTimeout((function(machine) {
                            return (function() { this.announceSelf(machine); });
                        })(machine), 0);
                    } 
                }
            });
        }).on('error', function(e) {
            console.log("Got error: " + e.message);
        });
    }

    this.postEvent = function(eventObj) {
        for ( var machine in this.machineList ) {
            var options = {
                    host: (machine ? machine : this.domain),
                    port: this.port,
                    path: this.eventpost + "?id="+this.idString + "&e=" + eventObj.toString()
            }

            http.get(options, function(res) {
                console.log("Got post event response: " + res.statusCode);
                res.on('data', function (chunk) {
                    console.log('BODY: ' + chunk);
                });
            }).on('error', function(e) {
                console.log("Got post event error: " + e.message);
            });
        }
    }

    this.ipToHash = function(ip) {
        return (ip + "").replace(/\./,"-");
    }

    this.on = function(eventName, callback) {
        //Mirror EventEmitter, but be smart about other machines.
        this.baseEmitter.on(eventName+".bvent", (function( callback ) {
            return (function(eventObj) {
                if ( eventObj.id && eventObj.id != this.idString ) {
                    callback(eventObj);
                }
                else
                    this.postEvent(eventObj);
            });
        })(callback));
    }

    this.removeListener = function(eventName, listener) {
        //Mirror removeListener
        this.baseEmitter.removeListener(eventName+".bvent", listener);
    }

    function trigger (eventName, data) {
        if ( data == null )
            data = {};

        data.id = this.idString;
        this.baseEmitter.emit(eventName+".bvent", data);
    }

    this.emit = trigger;
    this.trigger = trigger;
}

exports.bevents = new beventsObj();
