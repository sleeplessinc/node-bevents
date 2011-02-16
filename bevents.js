var events = require('events');
var http = require('http');
var url = require('url');

function beventsObj() {
    this.domain = 'localhost';
    this.machineList = {};
    this.hserver = null; //Will contain the event handler.
    this.isListening = false;
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

        if ( optionalMachineList ) {
            for ( var i = 0; i < optionalMachineList.length; i++ ) {
                this.machineList[this.ipToHash(optionalMachineList[i])] = {ip:optionalMachineList[i]};
            }
        }

        this.hserver = http.createServer((function(scope) {
            return (function(req, res) {
                var urlObj = url.parse(req.url, true);

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
                        setTimeout((function(scope) {
                            return (function() { 
                                        scope.announceSelf()
                            });
                        })(scope), 10000);
                        res.end();
                        return;  //We're done talking to ourself.
                    }

                    //So, we're not talking to ourself.  Tell them what we know.
                    var buildList = JSON.stringify(scope.machineList);

                    //Store the connector to the machinelist.
                    var ipAddress = req.socket.remoteAddress;
                    var ipString = scope.ipToHash(ipAddress);
                    if (!scope.machineList[ipString]) {
                        scope.machineList[ipString] = {ip:ipAddress};
                    }

                    //Send out the list as valid js. 
                    res.end(buildList);
                }
                else if ((urlObj.pathname + "").match(/.*postevent.*/)) {
                    if ( urlObj.query.id == scope.idString ) {
                        //We generated the event. Bail.
                        res.end();
                        return;
                    }

                    //So... we didn't create the event. Trigger baby.
                    if ( urlObj.query.e ) {
                        var eventObj = JSON.parse(urlObj.query.e);
                        scope.serverTrigger(eventObj);
                    }

                    res.end();
                }
                else {
                    res.end("Uh... sorry:" + urlObj.pathname);
                    return;
                }
            });
        })(this));

        //Make sure you announce yourself before you start listening.
        //This means you'll always talk to someone else before
        //accidentally talking to yourself and being secluded.
        this.announceSelf(null, (function(scope) {
            return ( function() {                
                //Now that we tried to get someone elses response start up our server.
                if ( !scope.isListening )
                {
                    scope.isListening = true;
                    scope.hserver.listen(scope.port);
                }
            });
        })(this));
    }

    //Handles anouncing ourself to someone else in the pool of machines
    //to collect other machines we should talk to.
    this.announceSelf = function(machine, callback) {
        var options = {
                host: (machine ? machine : this.domain),
                port: this.port,
                path: this.announcement + "?id="+this.idString
        }

        var scope = this;
        this.options = options;

        //Coding horror.  Straight up.
        var getReq = http.get(options, this.handleResponseClosure(callback)).on('error', (function(scope, callback) { 
                            return ( function(e) {
                                console.log("Got error: " + e.message);
                                setTimeout(function() { 
                                    scope.announceSelf();
                                }, 1000);
                                if ( callback )
                                    callback();
                            });
                          })(this, callback));
    }

    this.handleResponseClosure = function(callback) {
        var scope = this;
        if ( callback )
            callback();
        return (function(res) {
            res.on('data', scope.handleResponseDataClosure() );
        });
    }

    this.handleResponseDataClosure = function() {
        var scope = this;
        return (function (chunk) {
            var asString = ""+chunk;
            if (( asString.match(/^\[|{/) ) && ( asString != "[[object Object]]" )) { 
                var dataPassed = JSON.parse(asString);
                //Is array?
                if ( chunk.constructor == [].constructor ) {
                    //Chunk should be list of machines they know about.  We say "hi",
                    //to them, if we don't already know about them.
                    var machines = JSON.parse(chunk);
                    if ( machines && typeof machines == 'object' ) {
                        for ( var machine in machines ) {
                            if ( scope.machineList[machine] == null ) {
                                scope.machineList[machine] = machines[machine];   //Place holder object for that machine
                                //Put an announcement on the queue.
                                setTimeout((function(machine) {
                                                return (function() { scope.announceSelf(machine); });
                                            })(machine), 0);
                            } 
                        }
                    }
                }
            }
            else 
            {
                console.log("Not something we know how to parse...");
                console.log(chunk + ""); 
                console.log("got that?");
            }
        });
    }

    this.postEvent = function(eventObj) {
        var scope = this;
        for ( var machine in this.machineList ) {

            var options = {
                    host: (this.machineList[machine] ? this.machineList[machine].ip : this.domain),
                    port: this.port,
                    path: this.eventpost + "?id="+this.idString + "&e=" + JSON.stringify(eventObj)
            }

            http.get(options, function(res) {
                res.on('data', function (chunk) {
                });
            }).on('error', function(e) {
                console.log("Got post event error: " + e.message);
            });
        }
    }

    this.ipToHash = function(ip) {
        return (ip + "").replace(/\.|:|-/g,"l");
    }

    this.on = function(eventName, callback) {
        var scope = this;
        //Mirror EventEmitter, but be smart about other machines.
        this.baseEmitter.on(eventName+".bvent", (function(scope, callback ) {
            return (function(eventObj) {
                if ( eventObj.id && eventObj.id != scope.idString ) {
                    callback(eventObj);
                }
                else
                    scope.postEvent(eventObj);
            });
        })(this, callback));
    }

    this.removeListener = function(eventName, listener) {
        //Mirror removeListener
        this.baseEmitter.removeListener(eventName+".bvent", listener);
    }

    this.serverTrigger = function(eventObj) {
        this.baseEmitter.emit(eventObj.type + ".bvent", eventObj);
    }

    function trigger (eventName, data) {
        if ( data == null )
            data = {};

        var eventObj = {};
        eventObj.id = this.idString;
        eventObj.type = eventName;
        eventObj.data = data;

        this.baseEmitter.emit(eventName+".bvent", eventObj);
    }

    this.emit = trigger;
    this.trigger = trigger;
}

exports.bevents = new beventsObj();
