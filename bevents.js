var events = require('events');
var http = require('http');
var url = require('url');

var config = {
    domain : 'localhost',
    machineList : {},
    hserver : null, //Will contain the event handler.
    isListening : false,
    port : 3868,
    announcement : "/bevents/hi/",
    eventpost : "/bevents/postevent/",

    //Assign ourself a random ID...  this should be good enough.
    idString : Math.floor(Math.random(new Date().getTime()) * 10000000000) + 
                        "-" + Math.floor(Math.random(new Date().getTime()) * 10000000000),
    baseEmitter: null
};

function ipToHash(ipString) {
    return (ipString + "").replace(/\.|:|-/g,"l");
}

function announceResHandler(res, callback) {
    if ( callback )
        callback();

    res.on('data', function (chunk) {
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
                        if ( config.machineList[machine] == null ) {
                            config.machineList[machine] = machines[machine];   //Place holder object for that machine
                            //Put an announcement on the queue.
                            setTimeout((function(machine) {
                                return (function() { announceSelf(machine); });
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

function announceSelf(machine, callback) {
    var options = {
        host: (machine ? machine : config.domain),
        port: config.port,
        path: config.announcement + "?id="+config.idString
    }

    this.options = options;

    var getReq = http.get(options, (function(callback) { 
                                        return (function( res ) {
                                            announceResHandler(res, callback);
                                        });
                                   })(callback));

    getReq.on('error', (function(callback) { return ( function(e) {
        console.log("Got error: " + e.message);
        setTimeout(function() { announceSelf(); }, 1000);
        if ( callback )
            callback();
    }); })(callback));
}

function serverTrigger(eventObj) {
    config.baseEmitter.emit(eventObj.type + ".bvent", eventObj);
}

function postEvent(eventObj) {
    for ( var machine in config.machineList ) {
        var options = {
                host: (config.machineList[machine] ? config.machineList[machine].ip : config.domain),
                port: config.port,
                path: config.eventpost + "?id="+config.idString + "&e=" + JSON.stringify(eventObj)
        }

        http.get(options, function(res) {
            res.on('data', function (chunk) { });
        }).on('error', function(e) {
            console.log("Got post event error: " + e.message);
        });
    }
}

function connectionHandler(req, res) {
    var urlObj = url.parse(req.url, true);

    //Check to see if someone is just registering with us.
    if ((urlObj.pathname + "").match(/.*\/hi\/.*/)) {
        //if the id passed is our own... we're talking
        //to ourself.  Try again to talk to someone else in
        //5 seconds.
        if ( urlObj.query.id == config.idString ) {
            //Whomever is first onto the network, could potentially
            //be the only guy broadcasting... but at least one server
            //will be letting everyone else know about everyone else as
            //they come online.
            setTimeout(announceSelf, 10000);
            res.end();
            return;  //We're done talking to ourself.
        }

        //So, we're not talking to ourself.  Tell them what we know.
        var buildList = JSON.stringify(config.machineList);

        //Store the connector to the machinelist.
        var ipAddress = req.socket.remoteAddress;
        var ipString = ipToHash(ipAddress);
        if (!config.machineList[ipString]) {
            config.machineList[ipString] = {ip:ipAddress};
        }

        //Send out the list as valid js. 
        res.end(buildList);
    }
    //Or maybe they are trying to hand us an event from the 
    //other part of the fleet.
    else if ((urlObj.pathname + "").match(/.*postevent.*/)) {
        //Check to see if this event was sent by us.
        if ( urlObj.query.id == config.idString ) {
            //We generated the event. Bail.
            res.end();
            return;
        }

        //So... we didn't create the event. Trigger baby, let the
        //standard event emitter do the work.
        if ( urlObj.query.e ) {
            var eventObj = JSON.parse(urlObj.query.e);
            serverTrigger(eventObj);
        }

        //And we're done.
        res.end();
    }
    else {
        res.end("Uh... sorry:" + urlObj.pathname);
        return;
    }
}

function beventsObj() {
    config.baseEmitter = new events.EventEmitter();
    this.config = config;
}

//Starts our event http server.  Specifies which domain to ping
//and port to listen on.
beventsObj.prototype.createServer = function(port, domain, optionalMachineList) {
    //Check to see if the port is overriden.  
    if ( port ) config.port = port;

    //For auto-discovery of machines
    config.domain = ( domain ? domain : 'localhost' );

    //And if auto-discovery can't work... see if they just gave us a fleet
    //to work amongst.
    if ( optionalMachineList ) {
        for ( var i = 0; i < optionalMachineList.length; i++ ) {
            config.machineList[ipToHash(optionalMachineList[i])] = {ip:optionalMachineList[i]};
        }
    }

    //This is the server that will start handling events and notifications.
    config.hserver = http.createServer(connectionHandler);

    //Make sure you announce yourself before you start listening.
    //This means you'll always talk to someone else before
    //accidentally talking to yourself and being secluded.
    announceSelf(null, function() {                
        //Now that we tried to get someone elses response start up our server.
        if ( !config.isListening ) {
            config.isListening = true;
            config.hserver.listen(config.port);
        }
    });
}

beventsObj.prototype.on = function(eventName, callback) {
    //Mirror EventEmitter, but be smart about other machines.
    config.baseEmitter.on(eventName+".bvent", (function(callback ) {
        return (function(eventObj) {
            if ( eventObj.id && eventObj.id != config.idString ) {
                callback(eventObj);
            }
            else
                postEvent(eventObj);
        });
    })(callback));
}

beventsObj.prototype.removeListener = function(eventName, listener) {
    //Mirror removeListener
    config.baseEmitter.removeListener(eventName+".bvent", listener);
}

function trigger (eventName, data) {
    if ( data == null )
        data = {};

    var eventObj = {};
    eventObj.id = config.idString;
    eventObj.type = eventName;
    eventObj.data = data;

    config.baseEmitter.emit(eventName+".bvent", eventObj);
}

beventsObj.prototype.emit = trigger;
beventsObj.prototype.trigger = trigger;

exports.bevents = new beventsObj();
