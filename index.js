/*
Verum Encrypted Chat Communication Module
Copyright (C) 2017  Damian Heaton <dh64784@gmail.com> (damianheaton.com)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const pgp = require("openpgp");
const ws = require("nodejs-websocket");
const fs = require("fs");
const eventEmitter = require("events");

/*
Server Stuff
*/
class Server {
  /*
  Construct the server class. This may be optionally provided a port (default 9873) and configuration options.

  Config.public determines whether the server accepts new registrations.
  Config.source is a *required value* if the Server has modified source code from that provided by the FreeChat Project, as per the terms of the GNU Affero General Public License.
  */
  constructor (port = 9873, config = null) {
    if (config === null) config = {
      public: true,
      source: "https://github.com/freechat-project/Verum-Server"
    }
    this.Config = config;
    this.Users = {};
    var that = this;
    fs.readFile ("users.json", (err, data) => {
      if (err)
        console.log("Error accessing persistent user data. Probably just nonexistant file?", err);
      else {
        var json = JSON.parse(data);
        var user;
        for(user in json){
          user = json[user];
          that.Users[user] = user;
        }
      }

      setInterval(saveData(), 300000); // save user data persistently every five minutes.
    });

    this.websock = ws.createServer(function(conn){
      console.log("Recorded new connection.");
      conn.sendText(that.respond("welcome", that.Config.source));
      conn.on("text", function(str){
        // received JSON text string (assumedly). try to parse it, to determine the point of it.
        try {
          var json = JSON.parse(str);
          console.log("Received: ", json);
          switch(json.type){
            case "get_pubkey":
              try {
                conn.sendText(that.respond("public_key", that.Users[json.user].pubkey));
              }catch(e){
                conn.sendText(that.error("Unknown User", "That user's data could not be found. Are you sure you're querying the right user on the right Node?"));
              }
              break;
            case "send_message":
              try {
                that.Users[json.user].messages.push(json.data);
              }catch(e){
                conn.sendText(that.error("Unknown User", "That user's data could not be found. Are you sure you're querying the right user on the right Node?"));
              }
              break;
            case "user_register":
              if(!that.Users.hasOwnProperty(json.user)) {
                that.Users[json.user] = {
                  password: json.pass,
                  pubkey: json.pubkey,
                  messages: []
                }
                conn.sendText(that.respond("registered", "Successfully creatured user."));
              }else{
                conn.sendText(that.error("User Already Exists", "A user with that name already exists on this Node. You can either pick a different username, or try a different Node."));
              }
          }
        }catch(e){
          console.log("Unexpected unparseable string: ", str);
          console.log(e);
          conn.sendText(that.error("Bad Format", "Unable to parse malformed JSON."));
        }
      });
      conn.on("close", function(code, reason){
        console.log("Connection closed.");
      });
    });
  }

  error (t, s) {
    var obj = {
      type: "error",
      title: t,
      data: s
    }
    var err = JSON.stringify(obj);
    return err;
  }
  respond (r, d) {
    var obj = {
      type: r,
      data: d
    }
    var response = JSON.stringify(obj);
    return response;
  }

  saveData () {
    var json = JSON.stringify(this.Users, null, 2);
    fs.writeFile("users.json", json, (err) => {
      if (err)
        console.log("Unable to save users.json: ", err);
      else
        console.log("Saved user data.");
    });
  }
}

/*
Client Stuff
*/
class Client {
  constructor (nodeAddr, nodePort=9873) {
    class Events extends eventEmitter {}

    this.Events = new Events();

    var that = this;

    this.lastPubKeyRequestee;

    this.websock = ws.connect(`ws://${nodeAddr}:${nodePort}`);
    console.log(this.websock);
    this.websock.on("text", function(str){
      var json = JSON.parse(str);
      switch(json.type){
        case "error":
          that.Events.emit("error", json.title, json.data);
          break;
        case "welcome":
          that.Events.emit("welcome", json.data);
          break;
        case "public_key":
          that.Events.emit("public_key", that.lastPubKeyRequestee, json.data);
          break;
        case "registered":
          that.Events.emit("registered", json.data);
          break;
      }
    });
  }

  register (username, password, publicKey) {
    this.websock.sendText(JSON.stringify({
      type: "user_register",
      user: username,
      pubkey: publicKey,
      pass: password
    }));
  }

  getPubKey (requestee) {
    this.lastPubKeyRequestee = requestee;
    this.websock.sendText(JSON.stringify({
      type: "get_pubkey",
      user: requestee
    }));
  }
}

// make the Client and Server objects publicly accessible.
exports.Client = Client;
exports.Server = Server;
